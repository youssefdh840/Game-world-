import {
  doc,
  getDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  collection,
  addDoc,
  query,
  orderBy,
  limit,
  increment,
} from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from './firebase';
import { GameRoom, ChatMessage, ReportItem } from '../types/game';
import {
  fetchDynamicGameQuestions,
  recordQuestionsAnsweredInSession,
  clearSessionQuestionHistory,
  QuestionFilterOptions,
} from './questionService';

export {
  fetchDynamicGameQuestions,
  recordQuestionsAnsweredInSession,
  clearSessionQuestionHistory,
  type QuestionFilterOptions,
};

function sanitizeUpdates<T extends Record<string, unknown>>(updates: T): T {
  const cleaned: Record<string, unknown> = {};
  Object.entries(updates).forEach(([key, value]) => {
    if (value !== undefined) {
      cleaned[key] = value;
    }
  });
  return cleaned as T;
}

export async function getGameRoom(roomId: string): Promise<GameRoom | null> {
  if (!roomId) return null;
  try {
    const snap = await getDoc(doc(db, 'gameRooms', roomId));
    if (snap.exists()) {
      return { ...(snap.data() as GameRoom), id: snap.id };
    }
    return null;
  } catch (error) {
    console.warn(`Could not fetch game room (${roomId}):`, error);
    return null;
  }
}

export function subscribeToGameRoom(
  roomId: string,
  onUpdate: (room: GameRoom) => void,
  onError?: (err: unknown) => void
) {
  if (!roomId || roomId.startsWith('room_bot_')) {
    return () => {};
  }
  return onSnapshot(
    doc(db, 'gameRooms', roomId),
    (snap) => {
      if (snap.exists()) {
        onUpdate({ ...(snap.data() as GameRoom), id: snap.id });
      }
    },
    (error) => {
      if (onError) onError(error);
      console.warn(`Game room snapshot warning (${roomId}):`, error);
    }
  );
}

export async function submitPlayerAnswer(
  roomId: string,
  userId: string,
  answer: string,
  timeTakenMs: number,
  isCorrect: boolean,
  room: GameRoom
) {
  if (!roomId || roomId.startsWith('room_bot_')) {
    return;
  }
  const activeUid = auth.currentUser?.uid || userId;
  const isHost = room.hostId === activeUid || room.hostId === userId;
  const pointsEarned = isCorrect
    ? Math.max(50, 100 + Math.floor((10000 - Math.min(timeTakenMs, 10000)) / 100))
    : 0;

  const updates: Record<string, unknown> = {};

  if (isHost) {
    updates.hostAnswer = answer ?? '';
    updates.hostAnswerTime = typeof timeTakenMs === 'number' ? timeTakenMs : 10000;
    if (pointsEarned > 0) {
      updates.hostScore = increment(pointsEarned);
    }
  } else {
    updates.guestAnswer = answer ?? '';
    updates.guestAnswerTime = typeof timeTakenMs === 'number' ? timeTakenMs : 10000;
    if (pointsEarned > 0) {
      updates.guestScore = increment(pointsEarned);
    }
  }
  updates.updatedAt = new Date().toISOString();

  try {
    await updateDoc(doc(db, 'gameRooms', roomId), sanitizeUpdates(updates));
  } catch (error) {
    console.warn(`Could not update player answer (${roomId}):`, error);
  }
}

export async function advanceToNextRoundOrFinish(
  roomId: string,
  room: GameRoom
) {
  if (!roomId || roomId.startsWith('room_bot_')) {
    return;
  }
  const roomDocRef = doc(db, 'gameRooms', roomId);

  try {
    // Check current state from server to prevent double-advancing or race conditions
    const snap = await getDoc(roomDocRef);
    if (!snap.exists()) return;
    const currentData = snap.data() as GameRoom;

    // If another client already moved to the next round or finished, abort
    if (currentData.currentRound > room.currentRound || currentData.status === 'finished') {
      return;
    }

    const nextRound = currentData.currentRound + 1;

    if (nextRound > currentData.totalRounds) {
      // Game completed! Determine winner from latest scores
      let winnerId: string | 'tie' = 'tie';
      if ((currentData.hostScore || 0) > (currentData.guestScore || 0)) {
        winnerId = currentData.hostId || 'tie';
      } else if ((currentData.guestScore || 0) > (currentData.hostScore || 0)) {
        winnerId = currentData.guestId || 'tie';
      }

      const updates = sanitizeUpdates({
        status: 'finished',
        winnerId,
        updatedAt: new Date().toISOString(),
      });
      await updateDoc(roomDocRef, updates);
      return;
    }

    // Move to next round
    const nextQuestion = currentData.questions ? currentData.questions[nextRound - 1] : undefined;
    const now = Date.now();
    const updates = sanitizeUpdates({
      currentRound: nextRound,
      ...(nextQuestion ? { currentQuestion: nextQuestion } : {}),
      status: 'playing',
      hostAnswer: null,
      hostAnswerTime: null,
      guestAnswer: null,
      guestAnswerTime: null,
      roundStartedAt: now,
      roundStartTime: now,
      updatedAt: new Date().toISOString(),
    });

    await updateDoc(roomDocRef, updates);
  } catch (error) {
    console.warn(`Could not advance round (${roomId}):`, error);
  }
}

export async function syncRoomRoundStartTime(roomId: string, startTime: number) {
  if (!roomId || roomId.startsWith('room_bot_')) return;
  try {
    await updateDoc(
      doc(db, 'gameRooms', roomId),
      sanitizeUpdates({
        status: 'playing',
        roundStartTime: startTime,
        roundStartedAt: startTime,
        updatedAt: new Date().toISOString(),
      })
    );
  } catch (err) {
    console.warn(`Could not sync roundStartTime for ${roomId}:`, err);
  }
}

export async function forfeitGame(
  roomId: string,
  forfeitingUserId: string,
  currentRoom: GameRoom
) {
  if (!roomId || roomId.startsWith('room_bot_')) return;
  const activeUid = auth.currentUser?.uid || forfeitingUserId || 'unknown';
  const isHost = currentRoom.hostId === activeUid || currentRoom.hostId === forfeitingUserId;
  const winnerId = isHost ? currentRoom.guestId : currentRoom.hostId;
  try {
    await updateDoc(
      doc(db, 'gameRooms', roomId),
      sanitizeUpdates({
        status: 'finished',
        winnerId: winnerId || 'tie',
        forfeitBy: activeUid,
        abandonedBy: activeUid,
        updatedAt: new Date().toISOString(),
      })
    );
  } catch (err) {
    console.warn(`Could not record game forfeit (${roomId}):`, err);
  }
}

export async function deleteGameRoom(roomId: string) {
  if (roomId.startsWith('room_bot_')) return;
  try {
    await deleteDoc(doc(db, 'gameRooms', roomId));
  } catch (err) {
    console.warn(`Could not delete game room (${roomId}):`, err);
  }
}

// In-Game Chat
export function subscribeToRoomMessages(
  roomId: string,
  callback: (messages: ChatMessage[]) => void
) {
  if (!roomId || roomId.startsWith('room_bot_')) {
    return () => {};
  }
  const q = query(
    collection(db, 'gameRooms', roomId, 'messages'),
    orderBy('createdAt', 'asc'),
    limit(50)
  );

  return onSnapshot(
    q,
    (snap) => {
      const messages = snap.docs.map((d) => ({
        ...(d.data() as ChatMessage),
        id: d.id,
      }));
      callback(messages);
    },
    (error) => {
      console.warn(`Chat messages snapshot warning (${roomId}):`, error);
    }
  );
}

export async function sendRoomChatMessage(
  roomId: string,
  sender: { uid: string; username: string; avatar: string; countryFlag: string },
  text: string,
  type: 'text' | 'emoji' | 'system' = 'text'
) {
  if (!roomId || roomId.startsWith('room_bot_')) return;
  // Basic profanity / safety filtering
  const sanitizedText = sanitizeText(text);

  const messageData = sanitizeUpdates({
    roomId,
    senderId: sender.uid || auth.currentUser?.uid || 'player',
    senderUsername: sender.username || 'Explorer',
    senderAvatar: sender.avatar || '',
    senderCountryFlag: sender.countryFlag || '🌍',
    text: sanitizedText,
    type,
    createdAt: new Date().toISOString(),
  });

  try {
    await addDoc(collection(db, 'gameRooms', roomId, 'messages'), messageData);
  } catch (error) {
    console.warn(`Could not send chat message (${roomId}):`, error);
  }
}

export async function reportUser(report: Omit<ReportItem, 'id' | 'createdAt' | 'status'>) {
  const data = sanitizeUpdates({
    ...report,
    status: 'pending',
    createdAt: new Date().toISOString(),
  });

  try {
    await addDoc(collection(db, 'reports'), data);
  } catch (error) {
    console.warn('Could not submit report:', error);
  }
}

function sanitizeText(raw: string): string {
  const badWords = ['badword', 'swear', 'spam', 'hate'];
  let clean = raw.trim().slice(0, 300);
  badWords.forEach((word) => {
    const reg = new RegExp(word, 'gi');
    clean = clean.replace(reg, '***');
  });
  return clean;
}
