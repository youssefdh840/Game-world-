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
  getFallbackRoom,
  updateFallbackRoom,
  saveFallbackRoom,
  subscribeToFallbackRoom,
  broadcastFallbackMessage,
} from './multiplayerFallback';
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
    const snap = await getDoc(doc(db, 'gameRooms', roomId));
    if (snap.exists()) {
      return { ...(snap.data() as GameRoom), id: snap.id };
    }
  } catch (error) {
    console.warn(`Could not fetch game room from Firestore (${roomId}), using fallback:`, error);
  }
  return getFallbackRoom(roomId);
}

export function subscribeToGameRoom(
  roomId: string,
  onUpdate: (room: GameRoom) => void,
  onError?: (err: unknown) => void
) {
  if (!roomId || roomId.startsWith('room_bot_')) {
    return () => {};
  }

  // 1. Subscribe to fallback (in-memory + localStorage + WebRTC)
  const unsubFallback = subscribeToFallbackRoom(roomId, onUpdate);

  // 2. Subscribe to Firestore
  let unsubFirestore = () => {};
  try {
    unsubFirestore = onSnapshot(
      doc(db, 'gameRooms', roomId),
      (snap) => {
        if (snap.exists()) {
          const room = { ...(snap.data() as GameRoom), id: snap.id };
          saveFallbackRoom(room, false);
          onUpdate(room);
        }
      },
      (error) => {
        if (onError) onError(error);
        console.warn(`Game room snapshot notice (${roomId}):`, error);
      }
    );
  } catch (err) {
    console.warn('Could not attach Firestore game room listener:', err);
  }

  return () => {
    unsubFallback();
    unsubFirestore();
  };
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
  updateFallbackRoom(roomId, updates as Partial<GameRoom>);
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

  // 1. Update Fallback Storage & Broadcast
  const currentFallback = getFallbackRoom(roomId) || room;
  const fallbackUpdates: Partial<GameRoom> = {};
  if (isHost) {
    fallbackUpdates.hostAnswer = answer ?? '';
    fallbackUpdates.hostAnswerTime = typeof timeTakenMs === 'number' ? timeTakenMs : roundDurationMs;
    if (pointsEarned > 0) {
      fallbackUpdates.hostScore = (currentFallback.hostScore || 0) + pointsEarned;
    }
  } else {
    fallbackUpdates.guestAnswer = answer ?? '';
    fallbackUpdates.guestAnswerTime = typeof timeTakenMs === 'number' ? timeTakenMs : roundDurationMs;
    if (pointsEarned > 0) {
      fallbackUpdates.guestScore = (currentFallback.guestScore || 0) + pointsEarned;
    }
  }
  updateFallbackRoom(roomId, fallbackUpdates);
  broadcastFallbackMessage({
    type: 'PLAYER_ANSWER',
    roomId,
    playerId: activeUid,
    isHost,
    answer: answer ?? '',
    answerTime: typeof timeTakenMs === 'number' ? timeTakenMs : roundDurationMs,
    scoreDelta: pointsEarned,
    score: isHost ? fallbackUpdates.hostScore : fallbackUpdates.guestScore,
    questionIndex: room.currentRound,
  });

  // 2. Also persist to Firestore asynchronously
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
    console.warn(`Could not update player answer in Firestore (${roomId}):`, error);
  }
}

export async function advanceToNextRoundOrFinish(
  roomId: string,
  room: GameRoom
) {
  if (!roomId || roomId.startsWith('room_bot_')) {
    return;
  }

  const currentFallback = getFallbackRoom(roomId) || room;
  const nextRound = (currentFallback.currentRound || 1) + 1;
  const totalRounds = currentFallback.totalRounds || currentFallback.questions?.length || 5;
  const now = Date.now();

  if (nextRound > totalRounds) {
    let winnerId: string | 'tie' = 'tie';
    if ((currentFallback.hostScore || 0) > (currentFallback.guestScore || 0)) {
      winnerId = currentFallback.hostId || 'tie';
    } else if ((currentFallback.guestScore || 0) > (currentFallback.hostScore || 0)) {
      winnerId = currentFallback.guestId || 'tie';
    }
    updateFallbackRoom(roomId, {
      status: 'finished',
      winnerId,
    });
    broadcastFallbackMessage({
      type: 'ADVANCE_ROUND',
      roomId,
      nextRound,
      timestamp: now,
    });
  } else {
    const nextQuestion = currentFallback.questions ? currentFallback.questions[nextRound - 1] : undefined;
    updateFallbackRoom(roomId, {
      currentRound: nextRound,
      ...(nextQuestion ? { currentQuestion: nextQuestion } : {}),
      status: 'playing',
      hostAnswer: null,
      hostAnswerTime: null,
      guestAnswer: null,
      guestAnswerTime: null,
      roundStartedAt: now,
      roundStartTime: now,
    });
    broadcastFallbackMessage({
      type: 'ADVANCE_ROUND',
      roomId,
      nextRound,
      nextQuestion,
      timestamp: now,
    });
  }

  // Also apply to Firestore immediately
  const roomDocRef = doc(db, 'gameRooms', roomId);
  try {
    const fsNextRound = nextRound;
    if (fsNextRound > totalRounds) {
      let winnerId: string | 'tie' = 'tie';
      if ((currentFallback.hostScore || 0) > (currentFallback.guestScore || 0)) {
        winnerId = currentFallback.hostId || 'tie';
      } else if ((currentFallback.guestScore || 0) > (currentFallback.hostScore || 0)) {
        winnerId = currentFallback.guestId || 'tie';
      }

      const updates = sanitizeUpdates({
        status: 'finished',
        winnerId,
        updatedAt: new Date().toISOString(),
      });
      await updateDoc(roomDocRef, updates);
    } else {
      const nextQuestion = currentFallback.questions ? currentFallback.questions[fsNextRound - 1] : undefined;
      const updates = sanitizeUpdates({
        currentRound: fsNextRound,
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
    }
  } catch (error) {
    console.warn(`Could not advance round in Firestore (${roomId}):`, error);
  }
}

export async function syncRoomRoundStartTime(roomId: string, startTime: number) {
  if (!roomId || roomId.startsWith('room_bot_')) return;
  updateFallbackRoom(roomId, {
    status: 'playing',
    roundStartTime: startTime,
    roundStartedAt: startTime,
  });
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
