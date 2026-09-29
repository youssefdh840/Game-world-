import {
  doc,
  updateDoc,
  onSnapshot,
  collection,
  addDoc,
  query,
  orderBy,
  limit,
} from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from './firebase';
import { GameRoom, ChatMessage, ReportItem } from '../types/game';

export function subscribeToGameRoom(
  roomId: string,
  onUpdate: (room: GameRoom) => void,
  onError?: (err: unknown) => void
) {
  if (roomId.startsWith('room_bot_') || !auth.currentUser) {
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
  if (roomId.startsWith('room_bot_') || !auth.currentUser) {
    return;
  }
  const path = `gameRooms/${roomId}`;
  const isHost = room.hostId === userId;
  const pointsEarned = isCorrect
    ? Math.max(50, 100 + Math.floor((10000 - Math.min(timeTakenMs, 10000)) / 100))
    : 0;

  const updates: Partial<GameRoom> = {};

  if (isHost) {
    updates.hostAnswer = answer;
    updates.hostAnswerTime = timeTakenMs;
    updates.hostScore = (room.hostScore || 0) + pointsEarned;
  } else {
    updates.guestAnswer = answer;
    updates.guestAnswerTime = timeTakenMs;
    updates.guestScore = (room.guestScore || 0) + pointsEarned;
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
  if (roomId.startsWith('room_bot_') || !auth.currentUser) {
    return;
  }
  const path = `gameRooms/${roomId}`;
  const nextRound = room.currentRound + 1;

  if (nextRound > room.totalRounds) {
    // Game completed! Determine winner
    let winnerId: string | 'tie' = 'tie';
    if (room.hostScore > room.guestScore) {
      winnerId = room.hostId;
    } else if (room.guestScore > room.hostScore) {
      winnerId = room.guestId;
    }

    const updates: Partial<GameRoom> = {
      status: 'finished',
      winnerId,
      updatedAt: new Date().toISOString(),
    };
    try {
      await updateDoc(doc(db, 'gameRooms', roomId), updates);
    } catch (error) {
      console.warn(`Could not finish game (${roomId}):`, error);
    }
    return;
  }

  // Move to next round
  const nextQuestion = room.questions ? room.questions[nextRound - 1] : undefined;
  const updates: Partial<GameRoom> = {
    currentRound: nextRound,
    currentQuestion: nextQuestion,
    status: 'playing',
    hostAnswer: null,
    hostAnswerTime: null,
    guestAnswer: null,
    guestAnswerTime: null,
    roundStartedAt: Date.now(),
    updatedAt: new Date().toISOString(),
  };

  try {
    await updateDoc(doc(db, 'gameRooms', roomId), updates);
  } catch (error) {
    console.warn(`Could not advance round (${roomId}):`, error);
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
