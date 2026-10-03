import {
  doc,
  getDoc,
  updateDoc,
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

export async function getGameRoom(roomId: string): Promise<GameRoom | null> {
  const path = `gameRooms/${roomId}`;
  try {
    const snap = await getDoc(doc(db, 'gameRooms', roomId));
    if (snap.exists()) {
      return snap.data() as GameRoom;
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
  if (roomId.startsWith('room_bot_')) {
    return () => {};
  }
  const path = `gameRooms/${roomId}`;
  return onSnapshot(
    doc(db, 'gameRooms', roomId),
    (snap) => {
      if (snap.exists()) {
        onUpdate(snap.data() as GameRoom);
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
  if (roomId.startsWith('room_bot_')) {
    return;
  }
  const path = `gameRooms/${roomId}`;
  const isHost = room.hostId === userId;
  const pointsEarned = isCorrect
    ? Math.max(50, 100 + Math.floor((10000 - Math.min(timeTakenMs, 10000)) / 100))
    : 0;

  const updates: Record<string, unknown> = {};

  if (isHost) {
    updates.hostAnswer = answer;
    updates.hostAnswerTime = timeTakenMs;
    if (pointsEarned > 0) {
      updates.hostScore = increment(pointsEarned);
    }
  } else {
    updates.guestAnswer = answer;
    updates.guestAnswerTime = timeTakenMs;
    if (pointsEarned > 0) {
      updates.guestScore = increment(pointsEarned);
    }
  }
  updates.updatedAt = new Date().toISOString();

  try {
    await updateDoc(doc(db, 'gameRooms', roomId), updates);
  } catch (error) {
    console.warn(`Could not update player answer (${roomId}):`, error);
  }
}

export async function advanceToNextRoundOrFinish(
  roomId: string,
  room: GameRoom
) {
  if (roomId.startsWith('room_bot_')) {
    return;
  }
  const path = `gameRooms/${roomId}`;
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
        winnerId = currentData.hostId;
      } else if ((currentData.guestScore || 0) > (currentData.hostScore || 0)) {
        winnerId = currentData.guestId;
      }

      const updates: Partial<GameRoom> = {
        status: 'finished',
        winnerId,
        updatedAt: new Date().toISOString(),
      };
      await updateDoc(roomDocRef, updates);
      return;
    }

    // Move to next round
    const nextQuestion = currentData.questions ? currentData.questions[nextRound - 1] : undefined;
    const now = Date.now();
    const updates: Partial<GameRoom> = {
      currentRound: nextRound,
      currentQuestion: nextQuestion,
      status: 'playing',
      hostAnswer: null,
      hostAnswerTime: null,
      guestAnswer: null,
      guestAnswerTime: null,
      roundStartedAt: now,
      roundStartTime: now,
      updatedAt: new Date().toISOString(),
    };

    await updateDoc(roomDocRef, updates);
  } catch (error) {
    console.warn(`Could not advance round (${roomId}):`, error);
  }
}

export async function syncRoomRoundStartTime(roomId: string, startTime: number) {
  if (roomId.startsWith('room_bot_')) return;
  try {
    await updateDoc(doc(db, 'gameRooms', roomId), {
      roundStartTime: startTime,
      roundStartedAt: startTime,
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.warn(`Could not sync roundStartTime for ${roomId}:`, err);
  }
}

// In-Game Chat
export function subscribeToRoomMessages(
  roomId: string,
  callback: (messages: ChatMessage[]) => void
) {
  const path = `gameRooms/${roomId}/messages`;
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
      handleFirestoreError(error, OperationType.GET, path);
    }
  );
}

export async function sendRoomChatMessage(
  roomId: string,
  sender: { uid: string; username: string; avatar: string; countryFlag: string },
  text: string,
  type: 'text' | 'emoji' | 'system' = 'text'
) {
  const path = `gameRooms/${roomId}/messages`;
  // Basic profanity / safety filtering
  const sanitizedText = sanitizeText(text);

  const messageData = {
    roomId,
    senderId: sender.uid,
    senderUsername: sender.username,
    senderAvatar: sender.avatar,
    senderCountryFlag: sender.countryFlag,
    text: sanitizedText,
    type,
    createdAt: new Date().toISOString(),
  };

  try {
    await addDoc(collection(db, 'gameRooms', roomId, 'messages'), messageData);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function reportUser(report: Omit<ReportItem, 'id' | 'createdAt' | 'status'>) {
  const path = 'reports';
  const data = {
    ...report,
    status: 'pending',
    createdAt: new Date().toISOString(),
  };

  try {
    await addDoc(collection(db, 'reports'), data);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
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
