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
  shuffleQuestionOptions,
  shuffleArraySeeded,
  scrambleWordDeterministic,
  QuestionFilterOptions,
} from './questionService';
import {
  MEMORY_MATCH_DURATION_SECONDS,
  MEMORY_MATCH_DURATION_MS,
  MEMORY_MATCH_TOTAL_PAIRS,
  calculateMemoryMatchPoints,
  generateMemoryMatchDeck,
  type MemoryCard,
} from './memoryMatchData';
import {
  sanitizeChatMessage,
  sanitizeUsername,
  sanitizeAvatarUrl,
} from '../utils/security';

export {
  fetchDynamicGameQuestions,
  recordQuestionsAnsweredInSession,
  clearSessionQuestionHistory,
  shuffleQuestionOptions,
  shuffleArraySeeded,
  scrambleWordDeterministic,
  type QuestionFilterOptions,
  MEMORY_MATCH_DURATION_SECONDS,
  MEMORY_MATCH_DURATION_MS,
  MEMORY_MATCH_TOTAL_PAIRS,
  calculateMemoryMatchPoints,
  generateMemoryMatchDeck,
  type MemoryCard,
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
    let snap = await getDoc(doc(db, 'gameRooms', roomId));
    if (snap.exists()) {
      return { ...(snap.data() as GameRoom), id: snap.id };
    }
    snap = await getDoc(doc(db, 'rooms', roomId));
    if (snap.exists()) {
      return { ...(snap.data() as GameRoom), id: snap.id };
    }
    snap = await getDoc(doc(db, 'duels', roomId));
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

export const QUESTION_DURATION_SECONDS = 50;
export const QUESTION_DURATION_MS = QUESTION_DURATION_SECONDS * 1000;

export const WORD_SCRAMBLE_DURATION_SECONDS = 20;
export const WORD_SCRAMBLE_DURATION_MS = WORD_SCRAMBLE_DURATION_SECONDS * 1000;

export const GUESS_NUMBER_DURATION_SECONDS = 30;
export const GUESS_NUMBER_DURATION_MS = GUESS_NUMBER_DURATION_SECONDS * 1000;
export const GUESS_NUMBER_MAX_ATTEMPTS = 6;

export function getRoundDurationSeconds(gameMode?: string): number {
  if (gameMode === 'word_scramble') return WORD_SCRAMBLE_DURATION_SECONDS;
  if (gameMode === 'guess_number') return GUESS_NUMBER_DURATION_SECONDS;
  if (gameMode === 'memory_match') return MEMORY_MATCH_DURATION_SECONDS;
  return QUESTION_DURATION_SECONDS;
}

export async function syncMemoryMatchScore(
  roomId: string,
  userId: string,
  currentScore: number,
  isHost: boolean,
  isFinished: boolean = false
) {
  if (!roomId || roomId.startsWith('room_bot_')) return;
  const updates: Record<string, unknown> = {};
  if (isHost) {
    updates.hostScore = currentScore;
    if (isFinished) {
      updates.hostAnswer = `matched_${currentScore}`;
    }
  } else {
    updates.guestScore = currentScore;
    if (isFinished) {
      updates.guestAnswer = `matched_${currentScore}`;
    }
  }
  updates.updatedAt = new Date().toISOString();
  try {
    await updateDoc(doc(db, 'gameRooms', roomId), sanitizeUpdates(updates));
  } catch (error) {
    console.warn('syncMemoryMatchScore notice:', error);
  }
}

export function calculateWordScramblePoints(remainingSeconds: number): number {
  const clampedRemaining = Math.max(0, Math.min(WORD_SCRAMBLE_DURATION_SECONDS, Math.floor(remainingSeconds)));
  return 100 + clampedRemaining * 5;
}

export function calculateGuessNumberPoints(attemptsUsed: number, remainingSeconds: number): number {
  const clampedAttempts = Math.max(1, Math.min(GUESS_NUMBER_MAX_ATTEMPTS, Math.floor(attemptsUsed)));
  const clampedRemaining = Math.max(0, Math.min(GUESS_NUMBER_DURATION_SECONDS, Math.floor(remainingSeconds)));
  // Points rewarded based on: (Fewer Attempts Used + Speed of Guesses)
  const attemptBonus = (GUESS_NUMBER_MAX_ATTEMPTS - clampedAttempts) * 20;
  const speedBonus = clampedRemaining * 3;
  return 80 + attemptBonus + speedBonus;
}

export async function submitPlayerAnswer(
  roomId: string,
  userId: string,
  answer: string,
  timeTakenMs: number,
  isCorrect: boolean,
  room: GameRoom,
  overridePoints?: number,
  isHostOverride?: boolean
) {
  if (!roomId || roomId.startsWith('room_bot_')) {
    return;
  }
  const activeUid = auth.currentUser?.uid || userId;
  const mySessionId = typeof window !== 'undefined' ? sessionStorage.getItem('wc_client_session_id') : null;
  const isHost =
    typeof isHostOverride === 'boolean'
      ? isHostOverride
      : (room.hostSessionId && mySessionId)
      ? room.hostSessionId === mySessionId
      : (room.guestSessionId && mySessionId)
      ? room.guestSessionId !== mySessionId
      : (room.hostId === activeUid || room.hostId === userId);
  const roundDurationMs =
    room.gameMode === 'word_scramble'
      ? WORD_SCRAMBLE_DURATION_MS
      : room.gameMode === 'guess_number'
      ? GUESS_NUMBER_DURATION_MS
      : QUESTION_DURATION_MS;

  let pointsEarned = 0;
  if (typeof overridePoints === 'number') {
    pointsEarned = overridePoints;
  } else if (isCorrect) {
    if (room.gameMode === 'word_scramble') {
      const elapsedSeconds = Math.max(0, Math.floor(Math.min(timeTakenMs, roundDurationMs) / 1000));
      const remainingSeconds = Math.max(0, WORD_SCRAMBLE_DURATION_SECONDS - elapsedSeconds);
      pointsEarned = calculateWordScramblePoints(remainingSeconds);
    } else {
      pointsEarned = Math.max(
        50,
        100 +
          Math.floor(
            ((QUESTION_DURATION_MS - Math.min(timeTakenMs, QUESTION_DURATION_MS)) /
              QUESTION_DURATION_MS) *
              100
          )
      );
    }
  }

  const updates: Record<string, unknown> = {};

  if (isHost) {
    updates.hostAnswer = answer ?? '';
    updates.hostAnswerTime = typeof timeTakenMs === 'number' ? timeTakenMs : roundDurationMs;
    if (pointsEarned > 0) {
      updates.hostScore = increment(pointsEarned);
    }
  } else {
    updates.guestAnswer = answer ?? '';
    updates.guestAnswerTime = typeof timeTakenMs === 'number' ? timeTakenMs : roundDurationMs;
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
  const sanitizedText = sanitizeChatMessage(text);
  if (!sanitizedText && type === 'text') return;

  const messageData = sanitizeUpdates({
    roomId,
    senderId: sender.uid || auth.currentUser?.uid || 'player',
    senderUsername: sanitizeUsername(sender.username || 'Explorer'),
    senderAvatar: sanitizeAvatarUrl(sender.avatar),
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
    reason: (report.reason || '').trim().slice(0, 200),
    details: (report.details || '').trim().slice(0, 1000),
    status: 'pending',
    createdAt: new Date().toISOString(),
  });

  try {
    await addDoc(collection(db, 'reports'), data);
  } catch (error) {
    console.warn('Could not submit report:', error);
  }
}
