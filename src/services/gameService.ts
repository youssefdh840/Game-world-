import {
  doc,
  getDoc,
  setDoc,
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

export function determineIsHost(
  room: Partial<GameRoom>,
  userId?: string,
  tabSessionId?: string
): boolean {
  const activeUid = auth.currentUser?.uid || userId || '';
  const mySessionId =
    tabSessionId ||
    (typeof window !== 'undefined' ? sessionStorage.getItem('wc_client_session_id') : '') ||
    '';

  // 1. Definite Guest match by UID or tab session ID
  if (
    (room.guestId && (room.guestId === activeUid || (userId && room.guestId === userId))) ||
    (room.guestSessionId && mySessionId && room.guestSessionId === mySessionId)
  ) {
    return false;
  }

  // 2. Definite Host match by UID or tab session ID
  if (
    (room.hostId && (room.hostId === activeUid || (userId && room.hostId === userId))) ||
    (room.hostSessionId && mySessionId && room.hostSessionId === mySessionId)
  ) {
    return true;
  }

  // 3. Tab session check
  if (room.hostSessionId && mySessionId) {
    return room.hostSessionId === mySessionId;
  }

  if (room.guestSessionId && mySessionId) {
    return room.guestSessionId !== mySessionId;
  }

  return room.hostId === activeUid || (Boolean(userId) && room.hostId === userId);
}

function sanitizeUpdates<T>(updates: T): T {
  if (updates === undefined) return null as unknown as T;
  if (updates === null || typeof updates !== 'object') return updates;
  // CRITICAL: Preserve Firestore FieldValue transforms (increment, serverTimestamp) and class instances
  const proto = Object.getPrototypeOf(updates);
  if (proto !== Object.prototype && proto !== null) {
    return updates;
  }
  if (Array.isArray(updates)) {
    return updates.map(sanitizeUpdates) as unknown as T;
  }
  const cleaned: Record<string, unknown> = {};
  Object.entries(updates as Record<string, unknown>).forEach(([key, value]) => {
    if (value !== undefined) {
      cleaned[key] = sanitizeUpdates(value);
    }
  });
  return cleaned as T;
}

export async function getGameRoom(roomId: string): Promise<GameRoom | null> {
  if (!roomId) return null;
  const { cleanCode, altRoomId } = getDualRoomDocRefs(roomId);
  try {
    const snap = await getDoc(doc(db, 'gameRooms', roomId));
    if (snap.exists()) {
      return { ...(snap.data() as GameRoom), id: snap.id };
    }
    if (altRoomId) {
      const altSnap = await getDoc(doc(db, 'gameRooms', altRoomId));
      if (altSnap.exists()) {
        return { ...(altSnap.data() as GameRoom), id: altSnap.id };
      }
    }
  } catch (error) {
    console.warn(`Could not fetch game room from Firestore (${roomId}), using fallback:`, error);
  }
  return getFallbackRoom(roomId) || (altRoomId ? getFallbackRoom(altRoomId) : null);
}

export function getDualRoomDocRefs(roomId: string) {
  const cleanCode = roomId.replace(/^room_code_/, '');
  const altRoomId = roomId.startsWith('room_code_')
    ? cleanCode
    : cleanCode.length === 6
    ? `room_code_${cleanCode}`
    : null;
  const refs = [doc(db, 'gameRooms', roomId)];
  if (altRoomId && altRoomId !== roomId) {
    refs.push(doc(db, 'gameRooms', altRoomId));
  }
  return { refs, cleanCode, altRoomId };
}

export function subscribeToGameRoom(
  roomId: string,
  onUpdate: (room: GameRoom) => void,
  onError?: (err: unknown) => void
) {
  if (!roomId || roomId.startsWith('room_bot_')) {
    return () => {};
  }

  const cleanCode = roomId.replace(/^room_code_/, '');
  const altRoomId = roomId.startsWith('room_code_') ? cleanCode : cleanCode.length === 6 ? `room_code_${cleanCode}` : null;

  // 1. Subscribe to fallback (in-memory + localStorage + WebRTC)
  const unsubFallback1 = subscribeToFallbackRoom(roomId, onUpdate);

  // 2. Subscribe to Firestore in real-time on primary and alt ID
  let unsubFirestore1 = () => {};
  let unsubFirestore2 = () => {};

  const handleSnap = (snap: any) => {
    if (snap.exists()) {
      const room = { ...(snap.data() as GameRoom), id: snap.id };
      saveFallbackRoom(room, false);
      onUpdate(room);
    }
  };

  try {
    unsubFirestore1 = onSnapshot(
      doc(db, 'gameRooms', roomId),
      handleSnap,
      (error) => {
        if (onError) onError(error);
        console.warn(`Game room snapshot notice (${roomId}):`, error);
      }
    );
    if (altRoomId) {
      unsubFirestore2 = onSnapshot(
        doc(db, 'gameRooms', altRoomId),
        handleSnap,
        (error) => {
          console.warn(`Game room alt snapshot notice (${altRoomId}):`, error);
        }
      );
    }
  } catch (err) {
    console.warn('Could not attach Firestore game room listener:', err);
  }

  // 3. Active safety net polling (every 900ms) for mobile browsers
  let isDone = false;
  const pollInterval = setInterval(async () => {
    if (isDone) {
      clearInterval(pollInterval);
      return;
    }
    try {
      const snap = await getDoc(doc(db, 'gameRooms', roomId));
      if (snap.exists() && !isDone) {
        handleSnap(snap);
        return;
      }
      if (altRoomId) {
        const altSnap = await getDoc(doc(db, 'gameRooms', altRoomId));
        if (altSnap.exists() && !isDone) {
          handleSnap(altSnap);
        }
      }
    } catch {
      // Non-fatal safety poll
    }
  }, 900);

  return () => {
    isDone = true;
    clearInterval(pollInterval);
    unsubFallback1();
    unsubFirestore1();
    unsubFirestore2();
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
  const { refs, altRoomId } = getDualRoomDocRefs(roomId);
  const updates: Record<string, unknown> = {
    updatedAt: new Date().toISOString(),
  };
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
  updateFallbackRoom(roomId, updates as Partial<GameRoom>);
  if (altRoomId) updateFallbackRoom(altRoomId, updates as Partial<GameRoom>);
  try {
    const cleanUpdates = sanitizeUpdates(updates);
    await Promise.all(
      refs.map((r) =>
        setDoc(r, cleanUpdates, { merge: true }).catch(() => updateDoc(r, cleanUpdates).catch(() => {}))
      )
    );
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
      : determineIsHost(room, activeUid, mySessionId || undefined);

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
  const currentHostScore = room.hostScore ?? currentFallback.hostScore ?? 0;
  const currentGuestScore = room.guestScore ?? currentFallback.guestScore ?? 0;
  const newHostScore = isHost ? currentHostScore + pointsEarned : currentHostScore;
  const newGuestScore = !isHost ? currentGuestScore + pointsEarned : currentGuestScore;

  const fallbackUpdates: Partial<GameRoom> = {};
  if (isHost) {
    fallbackUpdates.hostAnswer = answer ?? '';
    fallbackUpdates.hostAnswerTime = typeof timeTakenMs === 'number' ? timeTakenMs : roundDurationMs;
    fallbackUpdates.hostScore = newHostScore;
  } else {
    fallbackUpdates.guestAnswer = answer ?? '';
    fallbackUpdates.guestAnswerTime = typeof timeTakenMs === 'number' ? timeTakenMs : roundDurationMs;
    fallbackUpdates.guestScore = newGuestScore;
  }
  const { refs, altRoomId } = getDualRoomDocRefs(roomId);
  updateFallbackRoom(roomId, fallbackUpdates);
  if (altRoomId) updateFallbackRoom(altRoomId, fallbackUpdates);

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

  // 2. Persist to Firestore: Write absolute scores and answers directly to both documents
  const updates: Record<string, unknown> = {
    updatedAt: new Date().toISOString(),
  };
  if (isHost) {
    updates.hostAnswer = answer ?? '';
    updates.hostAnswerTime = typeof timeTakenMs === 'number' ? timeTakenMs : roundDurationMs;
    updates.hostScore = newHostScore;
  } else {
    updates.guestAnswer = answer ?? '';
    updates.guestAnswerTime = typeof timeTakenMs === 'number' ? timeTakenMs : roundDurationMs;
    updates.guestScore = newGuestScore;
  }

  try {
    const cleanUpdates = sanitizeUpdates(updates);
    await Promise.all(
      refs.map((r) =>
        setDoc(r, cleanUpdates, { merge: true }).catch(() => updateDoc(r, cleanUpdates).catch(() => {}))
      )
    );
  } catch (error) {
    console.warn(`Could not update player answer in Firestore (${roomId}):`, error);
  }
}

export async function advanceToNextRoundOrFinish(
  roomId: string,
  room: GameRoom,
  targetRound?: number
) {
  if (!roomId || roomId.startsWith('room_bot_')) {
    return;
  }

  const currentFallback = getFallbackRoom(roomId) || room;
  const nextRound = targetRound !== undefined ? targetRound : (currentFallback.currentRound || 1) + 1;
  const totalRounds = currentFallback.totalRounds || currentFallback.questions?.length || 5;
  const now = Date.now();
  const { refs, altRoomId } = getDualRoomDocRefs(roomId);
  const nextQuestion = currentFallback.questions && nextRound <= totalRounds ? currentFallback.questions[nextRound - 1] : undefined;

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
    if (altRoomId) {
      updateFallbackRoom(altRoomId, {
        status: 'finished',
        winnerId,
      });
    }
    broadcastFallbackMessage({
      type: 'ADVANCE_ROUND',
      roomId,
      nextRound,
      timestamp: now,
    });
  } else {
    const advanceData: Partial<GameRoom> = {
      currentRound: nextRound,
      ...(nextQuestion ? { currentQuestion: nextQuestion } : {}),
      status: 'playing',
      hostAnswer: null,
      hostAnswerTime: null,
      guestAnswer: null,
      guestAnswerTime: null,
      roundStartedAt: now,
      roundStartTime: now,
    };
    updateFallbackRoom(roomId, advanceData);
    if (altRoomId) updateFallbackRoom(altRoomId, advanceData);

    broadcastFallbackMessage({
      type: 'ADVANCE_ROUND',
      roomId,
      nextRound,
      nextQuestion,
      timestamp: now,
    });
  }

  // Also apply to Firestore immediately on all document references
  try {
    const fsNextRound = nextRound;
    if (fsNextRound > totalRounds) {
      let winnerId: string | 'tie' = 'tie';
      if ((currentFallback.hostScore || 0) > (currentFallback.guestScore || 0)) {
        winnerId = currentFallback.hostId || 'tie';
      } else if ((currentFallback.guestScore || 0) > (currentFallback.hostScore || 0)) {
        winnerId = currentFallback.guestId || 'tie';
      }

      await Promise.all(
        refs.map((r) =>
          setDoc(
            r,
            {
              status: 'finished',
              winnerId,
              updatedAt: new Date().toISOString(),
            },
            { merge: true }
          ).catch(() => {})
        )
      );
    } else {
      await Promise.all(
        refs.map((r) =>
          setDoc(
            r,
            {
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
            },
            { merge: true }
          ).catch(() => {})
        )
      );
    }
  } catch (error) {
    console.warn(`Could not advance round in Firestore (${roomId}):`, error);
  }
}

export async function syncRoomRoundStartTime(roomId: string, startTime: number) {
  if (!roomId || roomId.startsWith('room_bot_')) return;
  const { refs, altRoomId } = getDualRoomDocRefs(roomId);
  updateFallbackRoom(roomId, {
    status: 'playing',
    roundStartTime: startTime,
    roundStartedAt: startTime,
  });
  if (altRoomId) {
    updateFallbackRoom(altRoomId, {
      status: 'playing',
      roundStartTime: startTime,
      roundStartedAt: startTime,
    });
  }
  try {
    const payload = sanitizeUpdates({
      status: 'playing',
      roundStartTime: startTime,
      roundStartedAt: startTime,
      updatedAt: new Date().toISOString(),
    });
    await Promise.all(refs.map((r) => updateDoc(r, payload).catch(() => {})));
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
  const { refs } = getDualRoomDocRefs(roomId);
  const activeUid = auth.currentUser?.uid || forfeitingUserId || 'unknown';
  const isHost = currentRoom.hostId === activeUid || currentRoom.hostId === forfeitingUserId;
  const winnerId = isHost ? currentRoom.guestId : currentRoom.hostId;
  try {
    const payload = sanitizeUpdates({
      status: 'finished',
      winnerId: winnerId || 'tie',
      forfeitBy: activeUid,
      abandonedBy: activeUid,
      updatedAt: new Date().toISOString(),
    });
    await Promise.all(refs.map((r) => updateDoc(r, payload).catch(() => {})));
  } catch (err) {
    console.warn(`Could not record game forfeit (${roomId}):`, err);
  }
}

export async function deleteGameRoom(roomId: string) {
  if (roomId.startsWith('room_bot_')) return;
  const { refs } = getDualRoomDocRefs(roomId);
  try {
    await Promise.all(refs.map((r) => deleteDoc(r).catch(() => {})));
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
  const { altRoomId } = getDualRoomDocRefs(roomId);

  const seenIds = new Set<string>();
  let allMsgs: ChatMessage[] = [];

  const handleDocs = (snapDocs: any[]) => {
    let changed = false;
    snapDocs.forEach((d) => {
      if (!seenIds.has(d.id)) {
        seenIds.add(d.id);
        allMsgs.push({ ...(d.data() as ChatMessage), id: d.id });
        changed = true;
      }
    });
    if (changed) {
      allMsgs.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      callback([...allMsgs]);
    }
  };

  const q1 = query(
    collection(db, 'gameRooms', roomId, 'messages'),
    orderBy('createdAt', 'asc'),
    limit(50)
  );

  const unsub1 = onSnapshot(
    q1,
    (snap) => handleDocs(snap.docs),
    (error) => {
      console.warn(`Chat messages snapshot warning (${roomId}):`, error);
    }
  );

  let unsub2 = () => {};
  if (altRoomId) {
    const q2 = query(
      collection(db, 'gameRooms', altRoomId, 'messages'),
      orderBy('createdAt', 'asc'),
      limit(50)
    );
    unsub2 = onSnapshot(
      q2,
      (snap) => handleDocs(snap.docs),
      () => {}
    );
  }

  return () => {
    unsub1();
    unsub2();
  };
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

  const { altRoomId } = getDualRoomDocRefs(roomId);

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
    await Promise.all([
      addDoc(collection(db, 'gameRooms', roomId, 'messages'), messageData),
      ...(altRoomId
        ? [addDoc(collection(db, 'gameRooms', altRoomId, 'messages'), messageData).catch(() => {})]
        : []),
    ]);
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
