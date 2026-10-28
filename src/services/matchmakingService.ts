import {
  doc,
  setDoc,
  deleteDoc,
  collection,
  query,
  where,
  getDocs,
  onSnapshot,
  getDoc,
  updateDoc,
} from 'firebase/firestore';
import { signInAnonymously } from 'firebase/auth';
import { db, auth } from './firebase';
import { UserProfile, GameCategory, GameRoom } from '../types/game';
import { fetchDynamicGameQuestions } from './questionService';
import { detectUserCountry, getSyncDetectedCountry } from './geolocationService';
import { getCountryByCode } from './countryData';
import {
  saveFallbackRoom,
  getFallbackRoom,
  updateFallbackRoom,
  subscribeToFallbackRoom,
  subscribeToFallbackHandshake,
  initHostPeer,
  joinGuestPeer,
  initQueueLobbyPeer,
  joinFallbackQueue as joinFallbackQueueService,
  leaveFallbackQueue as leaveFallbackQueueService,
  broadcastFallbackMessage,
} from './multiplayerFallback';

const DEFAULT_AVATAR =
  'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=160&q=80';

/**
 * Executes a promise with a strict timeout so Firestore network hangs never freeze the application UI.
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number = 6000,
  fallbackValue?: T
): Promise<T> {
  let timer: any;
  const timeoutPromise = new Promise<T>((resolve, reject) => {
    timer = setTimeout(() => {
      if (fallbackValue !== undefined) resolve(fallbackValue);
      else reject(new Error(`Operation timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Strips any `undefined` properties recursively from objects and arrays before passing to Firestore.
 */
function sanitizeFirestorePayload<T>(payload: T): T {
  if (payload === undefined) return null as unknown as T;
  if (payload === null || typeof payload !== 'object') return payload;
  // CRITICAL: Preserve Firestore FieldValue transforms and class instances
  const proto = Object.getPrototypeOf(payload);
  if (proto !== Object.prototype && proto !== null) {
    return payload;
  }
  if (Array.isArray(payload)) {
    return payload.map(sanitizeFirestorePayload) as unknown as T;
  }
  const cleaned: Record<string, unknown> = {};
  Object.entries(payload as Record<string, unknown>).forEach(([key, value]) => {
    if (value !== undefined) {
      cleaned[key] = sanitizeFirestorePayload(value);
    }
  });
  return cleaned as T;
}

/**
 * Returns a persistent tab session ID stored in sessionStorage to cleanly isolate
 * different browser windows or tabs when testing multiplayer on the same machine.
 */
export function getClientSessionId(): string {
  if (typeof window === 'undefined') return 'server_session';
  try {
    let sid = sessionStorage.getItem('wc_client_session_id');
    if (!sid) {
      sid = `tab_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 7)}`;
      sessionStorage.setItem('wc_client_session_id', sid);
    }
    return sid;
  } catch {
    return `tab_${Date.now().toString(36)}`;
  }
}

let authInitPromise: Promise<string> | null = null;

/**
 * Automatically ensures Firebase Auth has a valid session (falling back to signInAnonymously for guest players).
 */
export async function ensureFirebaseAuth(): Promise<string> {
  // First ensure initial auth state from IndexedDB/localStorage (e.g. Google login) is resolved
  if (typeof auth.authStateReady === 'function') {
    try {
      await auth.authStateReady();
    } catch {
      // ignore
    }
  }

  const current = auth.currentUser;
  if (current) {
    return current.uid;
  }
  if (authInitPromise) {
    return authInitPromise;
  }
  authInitPromise = (async () => {
    try {
      const cred = await withTimeout(signInAnonymously(auth), 5000);
      return cred.user.uid;
    } catch (err) {
      console.warn('Anonymous auth first attempt notice:', err);
      try {
        const cred2 = await signInAnonymously(auth);
        return cred2.user.uid;
      } catch (err2) {
        console.warn('Anonymous auth second attempt notice:', err2);
      }
      const fallbackUser = auth.currentUser as { uid: string } | null;
      return fallbackUser?.uid || `guest_${getClientSessionId()}`;
    } finally {
      authInitPromise = null;
    }
  })();
  return authInitPromise;
}

/**
 * Ensures Firebase Auth has an active user and returns an instantaneous, non-undefined player identity.
 */
function ensurePlayerIdentity(user?: Partial<UserProfile>): {
  uid: string;
  username: string;
  avatar: string;
  countryCode: string;
  countryFlag: string;
  level: number;
} {
  ensureFirebaseAuth().catch(() => {});

  const uid =
    auth.currentUser?.uid ||
    user?.uid ||
    (user as { id?: string } | undefined)?.id ||
    `player_${getClientSessionId()}`;

  const username =
    (user?.username && user.username.trim()) ||
    auth.currentUser?.displayName ||
    `Explorer_${uid.slice(0, 4)}`;

  const avatar =
    (user?.avatar && user.avatar.trim()) ||
    auth.currentUser?.photoURL ||
    DEFAULT_AVATAR;

  const geo = getSyncDetectedCountry();
  const rawCode = (user?.countryCode && user.countryCode.trim()) || geo.countryCode || 'TN';
  const resolvedCountry = getCountryByCode(rawCode);
  const countryCode = resolvedCountry?.code || rawCode.toUpperCase();
  const countryFlag =
    resolvedCountry?.flag ||
    (user?.countryFlag && user.countryFlag.trim()) ||
    geo.countryFlag ||
    '🇹🇳';
  const level = typeof user?.level === 'number' && !isNaN(user.level) ? user.level : 1;

  return {
    uid,
    username,
    avatar,
    countryCode,
    countryFlag,
    level,
  };
}

export interface MatchTicket {
  userId: string;
  username: string;
  countryCode: string;
  countryFlag: string;
  avatar: string;
  level: number;
  preferredCategory: GameCategory | 'mixed';
  status: 'waiting' | 'matched';
  matchedRoomId?: string;
  createdAt: string;
}

export interface JoinQueueResult {
  roomId: string;
  isHost: boolean;
  matchedRoom?: GameRoom;
  startTime?: number;
  unsubscribe: () => void;
}

// Joins the worldwide matchmaking queue for REAL PLAYERS ONLY via Firestore gameRooms & fallback queue
export async function joinMatchmakingQueue(
  user: UserProfile,
  preferredCategory: GameCategory | 'mixed' = 'cultural_quiz',
  targetCountryCode?: string
): Promise<JoinQueueResult> {
  const player = ensurePlayerIdentity(user);
  const mySessionId = getClientSessionId();
  const threeMinutesAgo = Date.now() - 3 * 60 * 1000;

  const normalizeMode = (mode?: string) => {
    if (mode === 'word_scramble') return 'word_scramble';
    if (mode === 'guess_number') return 'guess_number';
    if (mode === 'memory_match') return 'memory_match';
    return 'cultural_quiz';
  };
  const requestedModeGroup = normalizeMode(preferredCategory);

  // 1. Check if another real player already has an open waiting room in Firestore gameRooms
  try {
    await ensureFirebaseAuth().catch(() => {});
    const q = query(
      collection(db, 'gameRooms'),
      where('status', '==', 'waiting')
    );
    const snap = await getDocs(q);

    if (snap && !snap.empty) {
      const openRooms = snap.docs
        .map((d) => ({ ...(d.data() as GameRoom), id: d.id }))
        .filter((r) => {
          if (!r.id || !r.hostId) return false;
          const isMyRoom = r.hostSessionId ? r.hostSessionId === mySessionId : r.hostId === player.uid;
          if (isMyRoom) return false;
          if (r.guestId && r.guestId !== '') return false;
          const createdMs = new Date(r.createdAt).getTime();
          if (isNaN(createdMs) || createdMs < threeMinutesAgo) return false;
          return normalizeMode(r.gameMode) === requestedModeGroup;
        });

      if (openRooms.length > 0) {
        const waitingRoom = openRooms[0];
        // Synchronized start time: exactly 3.5 seconds into the future
        const startTime = Date.now() + 3500;

        const updates: Partial<GameRoom> = sanitizeFirestorePayload({
          guestId: player.uid,
          guestSessionId: mySessionId,
          guestUsername: player.username,
          guestCountryCode: player.countryCode,
          guestCountryFlag: player.countryFlag,
          guestAvatar: player.avatar,
          guestScore: 0,
          guestReady: true,
          status: 'ready' as const,
          roundStartedAt: startTime,
          roundStartTime: startTime,
          updatedAt: new Date().toISOString(),
        });

        // Await Firestore update so Host listener immediately triggers
        await updateDoc(doc(db, 'gameRooms', waitingRoom.id), updates as Record<string, unknown>);

        const matchedRoom: GameRoom = { ...waitingRoom, ...updates };
        saveFallbackRoom(matchedRoom, true);

        broadcastFallbackMessage({
          type: 'GUEST_JOIN',
          roomId: waitingRoom.id,
          guest: player,
          guestSessionId: mySessionId,
        });
        broadcastFallbackMessage({
          type: 'GAME_START',
          roomId: waitingRoom.id,
          room: matchedRoom,
          startTime,
        });

        return {
          roomId: waitingRoom.id,
          isHost: false,
          matchedRoom,
          startTime,
          unsubscribe: () => {},
        };
      }
    }
  } catch (err) {
    console.warn('Firestore queue search error, creating new room:', err);
  }

  // 2. No open room found: Host creates a real waiting game room directly in Firestore
  const roomId = `room_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const roundCount = preferredCategory === 'memory_match' ? 1 : preferredCategory === 'guess_number' ? 3 : 5;
  const questions = await fetchDynamicGameQuestions({
    count: roundCount,
    category: preferredCategory,
    countryCode: targetCountryCode,
    userLevel: player.level,
  });

  const now = Date.now();
  const roomData: GameRoom = sanitizeFirestorePayload({
    id: roomId,
    hostId: player.uid,
    hostSessionId: mySessionId,
    hostUsername: player.username,
    hostCountryCode: player.countryCode,
    hostCountryFlag: player.countryFlag,
    hostAvatar: player.avatar,
    hostScore: 0,
    hostReady: true,

    guestId: '',
    guestSessionId: '',
    guestUsername: '',
    guestCountryCode: '',
    guestCountryFlag: '',
    guestAvatar: '',
    guestScore: 0,
    guestReady: false,

    gameMode: preferredCategory,
    ...(targetCountryCode ? { targetCountryCode } : {}),
    status: 'waiting' as const,
    currentRound: 1,
    totalRounds: questions.length,
    questionIds: questions.map((q) => q.id),
    questions,
    currentQuestion: questions[0],
    roundStartedAt: now,
    roundStartTime: now,
    isBotOpponent: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }) as unknown as GameRoom;

  saveFallbackRoom(roomData, true);

  // Await Firestore write
  try {
    await ensureFirebaseAuth().catch(() => {});
    await setDoc(doc(db, 'gameRooms', roomId), roomData);
  } catch (err) {
    console.error('Failed to create waiting room in Firestore:', err);
    throw new Error('فشل الانضمام لطابور الانتظار في قاعدة البيانات. يرجى المحاولة ثانية.');
  }

  return {
    roomId,
    isHost: true,
    unsubscribe: () => {
      leaveFallbackQueueService(roomId);
      deleteDoc(doc(db, 'gameRooms', roomId)).catch(() => {});
    },
  };
}

// Listens to room updates when another real player joins our waiting room, with active pairing loop
export function listenToMatchmakingRoom(
  roomId: string,
  onMatched: (room: GameRoom, startTime: number) => void,
  user?: UserProfile,
  preferredCategory: GameCategory | 'mixed' = 'cultural_quiz'
) {
  let isDone = false;
  const mySessionId = getClientSessionId();

  const handleMatchFound = (room: GameRoom, explicitStartTime?: number) => {
    if (isDone) return;
    isDone = true;

    const startTime =
      explicitStartTime ||
      (room.roundStartTime && room.roundStartTime > Date.now() ? room.roundStartTime : Date.now() + 3200);

    const updatedRoom: GameRoom = {
      ...room,
      status: 'ready',
      hostReady: true,
      guestReady: true,
      roundStartTime: startTime,
      roundStartedAt: startTime,
      updatedAt: new Date().toISOString(),
    };

    saveFallbackRoom(updatedRoom, true);

    // Broadcast GAME_START & MATCH_READY to all devices/tabs
    broadcastFallbackMessage({
      type: 'MATCH_READY',
      roomId: room.id,
      room: updatedRoom,
      startTime,
      hostSessionId: mySessionId,
    });
    broadcastFallbackMessage({
      type: 'GAME_START',
      roomId: room.id,
      room: updatedRoom,
      startTime,
    });

    // Update Firestore doc asynchronously
    withTimeout(
      updateDoc(
        doc(db, 'gameRooms', room.id),
        sanitizeFirestorePayload({
          status: 'ready',
          hostReady: true,
          roundStartTime: startTime,
          roundStartedAt: startTime,
          updatedAt: new Date().toISOString(),
        }) as Record<string, unknown>
      ),
      1800
    ).catch(() => {});

    onMatched(updatedRoom, startTime);
  };

  // 1. Fallback & Broadcast listener
  const unsubFallback = subscribeToFallbackRoom(roomId, (room) => {
    if (isDone) return;
    if (room.guestId && (room.status === 'starting' || room.status === 'ready' || room.status === 'playing')) {
      handleMatchFound(room);
    }
  });

  // 2. Worldwide WebRTC Queue Lobby peer matching (two-way handshaked)
  let unsubLobby = () => {};
  if (user) {
    unsubLobby = initQueueLobbyPeer(preferredCategory, user, (matchedRoom, startTime) => {
      handleMatchFound(matchedRoom, startTime);
    });
  }

  // 3. Primary snapshot listener on our waiting room in Firestore
  let unsubSnap = () => {};
  try {
    unsubSnap = onSnapshot(
      doc(db, 'gameRooms', roomId),
      (snap) => {
        if (isDone) return;
        if (snap.exists()) {
          const room = { ...(snap.data() as GameRoom), id: snap.id };
          if (room.guestId && (room.status === 'starting' || room.status === 'ready' || room.status === 'playing')) {
            handleMatchFound(room);
          }
        }
      },
      (error) => {
        console.warn(`Matchmaking room listen notice (${roomId}):`, error);
      }
    );
  } catch (err) {
    console.warn('Matchmaking snapshot listen err:', err);
  }

  // 4. Active pairing loop (every 1.5 seconds) protected with timeout
  const normalizeMode = (mode?: string) => {
    if (mode === 'word_scramble') return 'word_scramble';
    if (mode === 'guess_number') return 'guess_number';
    if (mode === 'memory_match') return 'memory_match';
    return 'cultural_quiz';
  };
  const targetMode = normalizeMode(preferredCategory);

  const pollInterval = setInterval(async () => {
    if (isDone) {
      clearInterval(pollInterval);
      return;
    }
    try {
      const q = query(collection(db, 'gameRooms'), where('status', '==', 'waiting'));
      const snap = await withTimeout(getDocs(q), 4500, null);
      if (isDone || !snap) return;

      const otherOpenRooms = snap.docs
        .map((d) => ({ ...(d.data() as GameRoom), id: d.id }))
        .filter((r) => {
          if (!r.id || r.id === roomId) return false;
          const isMyRoom = r.hostSessionId ? r.hostSessionId === mySessionId : (user?.uid && r.hostId === user.uid);
          if (isMyRoom) return false;
          if (r.guestId && r.guestId !== '') return false;
          return normalizeMode(r.gameMode) === targetMode;
        });

      if (otherOpenRooms.length > 0) {
        const otherRoom = otherOpenRooms[0];
        if (otherRoom.id < roomId) {
          clearInterval(pollInterval);

          const startTime = Date.now() + 3500;
          const p = ensurePlayerIdentity(user);

          const updates: Partial<GameRoom> = sanitizeFirestorePayload({
            guestId: p.uid,
            guestSessionId: mySessionId,
            guestUsername: p.username,
            guestCountryCode: p.countryCode,
            guestCountryFlag: p.countryFlag,
            guestAvatar: p.avatar,
            guestScore: 0,
            guestReady: true,
            status: 'ready' as const,
            roundStartedAt: startTime,
            roundStartTime: startTime,
            updatedAt: new Date().toISOString(),
          });

          // Join the other room asynchronously
          withTimeout(updateDoc(doc(db, 'gameRooms', otherRoom.id), updates as Record<string, unknown>), 5000).catch(() => {});
          deleteDoc(doc(db, 'gameRooms', roomId)).catch(() => {});
          leaveFallbackQueueService(roomId);

          const matched: GameRoom = { ...otherRoom, ...updates };
          saveFallbackRoom(matched, true);

          // Direct sync event to other device
          broadcastFallbackMessage({
            type: 'GAME_START',
            roomId: otherRoom.id,
            room: matched,
            startTime,
          });

          handleMatchFound(matched, startTime);
        }
      }
    } catch {
      // non-fatal poll
    }
  }, 1500);

  return () => {
    isDone = true;
    clearInterval(pollInterval);
    unsubFallback();
    unsubLobby();
    unsubSnap();
  };
}

// Alias for backwards compatibility
export const listenToMatchmakingTicket = (
  roomId: string,
  onMatched: (roomId: string) => void
) => {
  return onSnapshot(doc(db, 'gameRooms', roomId), (snap) => {
    if (snap.exists()) {
      const room = snap.data() as GameRoom;
      if (room.guestId && (room.status === 'starting' || room.status === 'playing')) {
        onMatched(room.id || snap.id);
      }
    }
  });
};

// Cancel / leave queue and delete waiting room
export async function leaveMatchmakingQueue(roomId: string) {
  if (!roomId) return;
  leaveFallbackQueueService(roomId);
  try {
    withTimeout(getDoc(doc(db, 'gameRooms', roomId)), 1500).then((roomSnap) => {
      if (roomSnap && roomSnap.exists()) {
        const data = roomSnap.data() as GameRoom;
        if (data.status === 'waiting' && (!data.guestId || data.guestId === '')) {
          deleteDoc(doc(db, 'gameRooms', roomId)).catch(() => {});
        }
      }
    }).catch(() => {});
  } catch {
    // Non-fatal
  }
}

// -------------------------------------------------------------
// PRIVATE DUEL ROOMS (Play directly with friends - 100% Real People)
// -------------------------------------------------------------

function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export async function createPrivateDuelRoom(
  user: UserProfile,
  preferredCategory: GameCategory | 'mixed' = 'mixed',
  targetCountryCode?: string
): Promise<{ room: GameRoom; roomCode: string }> {
  await ensureFirebaseAuth().catch(() => {});
  const player = ensurePlayerIdentity(user);
  const mySessionId = getClientSessionId();
  const roomCode = generateRoomCode();
  const cleanCode = roomCode.trim().toUpperCase();
  const roomId = cleanCode;
  const prefixedRoomId = `room_code_${cleanCode}`;

  const roundCount = preferredCategory === 'memory_match' ? 1 : preferredCategory === 'guess_number' ? 3 : 5;
  const questions = await fetchDynamicGameQuestions({
    count: roundCount,
    category: preferredCategory,
    countryCode: targetCountryCode,
    userLevel: player.level,
  });

  const roomData: GameRoom = sanitizeFirestorePayload({
    id: roomId,
    roomCode: cleanCode,
    hostId: player.uid,
    hostSessionId: mySessionId,
    hostUsername: player.username,
    hostCountryCode: player.countryCode,
    hostCountryFlag: player.countryFlag,
    hostAvatar: player.avatar,
    hostScore: 0,
    hostReady: true,

    guestId: '',
    guestSessionId: '',
    guestUsername: '',
    guestCountryCode: '',
    guestCountryFlag: '',
    guestAvatar: '',
    guestScore: 0,
    guestReady: false,

    gameMode: preferredCategory,
    ...(targetCountryCode ? { targetCountryCode } : {}),
    status: 'waiting' as const,
    currentRound: 1,
    totalRounds: questions.length,
    questionIds: questions.map((q) => q.id),
    questions,
    currentQuestion: questions[0],
    roundStartedAt: 0,
    roundStartTime: 0,
    isBotOpponent: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }) as unknown as GameRoom;

  // 1. Immediately persist to fallback storage
  saveFallbackRoom(roomData, true);

  // 2. Persist to Firestore: Await the write to BOTH canonical ID and prefixed ID
  let writeSuccess = false;
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      await ensureFirebaseAuth().catch(() => {});
      await Promise.all([
        setDoc(doc(db, 'gameRooms', cleanCode), roomData),
        setDoc(doc(db, 'gameRooms', prefixedRoomId), { ...roomData, id: prefixedRoomId }),
      ]);
      writeSuccess = true;
      break;
    } catch (err) {
      lastError = err;
      console.warn(`Firestore room creation attempt ${attempt + 1} notice:`, err);
      if (attempt < 3) {
        await new Promise((r) => setTimeout(r, 400));
      }
    }
  }

  if (!writeSuccess) {
    const msg = lastError instanceof Error ? lastError.message : String(lastError || 'Unknown error');
    throw new Error(`فشل إنشاء الغرفة في قاعدة البيانات: ${msg}. تأكد من اتصال الإنترنت وحاول ثانية.`);
  }

  return { room: roomData, roomCode: cleanCode };
}

export async function joinPrivateDuelRoom(
  roomCodeInput: string,
  user: UserProfile
): Promise<{ room: GameRoom; startTime: number }> {
  const cleanCode = roomCodeInput.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (cleanCode.length !== 6) {
    throw new Error('Please enter a valid 6-character room code.');
  }

  await ensureFirebaseAuth().catch(() => {});
  const player = ensurePlayerIdentity(user);
  const mySessionId = getClientSessionId();
  const prefixedRoomId = `room_code_${cleanCode}`;

  let currentRoom: GameRoom | null = null;
  let peerStartTime: number | undefined;

  // 1. Check local storage fallback (for same device testing)
  const localRoom = getFallbackRoom(cleanCode) || getFallbackRoom(prefixedRoomId);
  if (localRoom && localRoom.status !== 'finished') {
    const isSameHostTab = localRoom.hostSessionId ? localRoom.hostSessionId === mySessionId : false;
    if (!isSameHostTab) {
      currentRoom = localRoom;
    }
  }

  // 2. Query Firestore with resilient retry loop
  if (!currentRoom) {
    const peerPromise = withTimeout(joinGuestPeer(cleanCode, player), 3000, null).catch(() => null);

    const fetchFirestoreWithRetry = async (): Promise<GameRoom | null> => {
      await ensureFirebaseAuth().catch(() => {});

      for (let attempt = 0; attempt < 6; attempt++) {
        try {
          // A. Direct doc lookup: gameRooms/CODE
          const snap1 = await getDoc(doc(db, 'gameRooms', cleanCode));
          if (snap1 && snap1.exists()) {
            return { ...(snap1.data() as GameRoom), id: snap1.id };
          }

          // B. Direct doc lookup: gameRooms/room_code_CODE
          const snap2 = await getDoc(doc(db, 'gameRooms', prefixedRoomId));
          if (snap2 && snap2.exists()) {
            return { ...(snap2.data() as GameRoom), id: snap2.id };
          }

          // C. Query gameRooms by roomCode property
          const qSnap = await getDocs(
            query(collection(db, 'gameRooms'), where('roomCode', '==', cleanCode))
          );
          if (qSnap && !qSnap.empty) {
            const doc0 = qSnap.docs[0];
            return { ...(doc0.data() as GameRoom), id: doc0.id };
          }
        } catch (err) {
          console.warn(`Firestore lookup retry attempt ${attempt + 1} notice:`, err);
        }

        if (attempt < 5) {
          await new Promise((res) => setTimeout(res, 450));
        }
      }
      return null;
    };

    const [fsRes, peerRes] = await Promise.all([fetchFirestoreWithRetry(), peerPromise]);
    if (fsRes) {
      currentRoom = fsRes;
    } else if (peerRes?.room) {
      currentRoom = peerRes.room;
      peerStartTime = peerRes.startTime;
    } else {
      currentRoom = getFallbackRoom(cleanCode) || getFallbackRoom(prefixedRoomId);
    }
  }

  if (!currentRoom) {
    throw new Error(`الرمز "${cleanCode}" غير موجود. يرجى التأكد من الرمز المدخل والمحاولة مجدداً.`);
  }

  if (currentRoom.status === 'finished') {
    throw new Error('هذه المباراة انتهت بالفعل.');
  }

  const isSameHostTab = currentRoom.hostSessionId
    ? currentRoom.hostSessionId === mySessionId
    : (player.uid && currentRoom.hostId === player.uid && !currentRoom.guestId);
  if (isSameHostTab) {
    throw new Error('لقد قمت بإنشاء هذا الرمز على هذا الجهاز! شارك الرمز مع صديق للعب معاً.');
  }

  if (currentRoom.guestId && currentRoom.guestId !== '' && currentRoom.guestId !== player.uid && currentRoom.guestSessionId !== mySessionId) {
    throw new Error('هذه الغرفة ممتلئة بالفعل (انضم لاعب آخر).');
  }

  const startTime =
    peerStartTime ||
    (currentRoom.roundStartTime && currentRoom.roundStartTime > Date.now()
      ? currentRoom.roundStartTime
      : Date.now() + 3500);

  const updates: Partial<GameRoom> = sanitizeFirestorePayload({
    guestId: player.uid,
    guestSessionId: mySessionId,
    guestUsername: player.username,
    guestCountryCode: player.countryCode,
    guestCountryFlag: player.countryFlag,
    guestAvatar: player.avatar,
    guestScore: 0,
    guestReady: true,
    status: 'ready' as const,
    roundStartedAt: startTime,
    roundStartTime: startTime,
    updatedAt: new Date().toISOString(),
  });

  const updatedRoom: GameRoom = { ...currentRoom, ...updates };

  saveFallbackRoom(updatedRoom, true);

  broadcastFallbackMessage({
    type: 'GUEST_JOIN',
    roomId: currentRoom.id,
    guest: player,
    guestSessionId: mySessionId,
  });
  broadcastFallbackMessage({
    type: 'MATCH_ACK',
    roomId: currentRoom.id,
    guestSessionId: mySessionId,
    timestamp: Date.now(),
  });
  broadcastFallbackMessage({
    type: 'MATCH_READY',
    roomId: currentRoom.id,
    room: updatedRoom,
    startTime,
    hostSessionId: currentRoom.hostSessionId || '',
  });

  // Await Firestore write across BOTH IDs so Host listener catches it 100% reliably
  try {
    await ensureFirebaseAuth().catch(() => {});
    await Promise.all([
      updateDoc(doc(db, 'gameRooms', cleanCode), updates as Record<string, unknown>).catch(() => {}),
      updateDoc(doc(db, 'gameRooms', prefixedRoomId), updates as Record<string, unknown>).catch(() => {}),
      ...(currentRoom.id && currentRoom.id !== cleanCode && currentRoom.id !== prefixedRoomId
        ? [updateDoc(doc(db, 'gameRooms', currentRoom.id), updates as Record<string, unknown>).catch(() => {})]
        : []),
    ]);
  } catch (upErr) {
    console.warn('Firestore guest join write notice:', upErr);
  }

  return { room: updatedRoom, startTime };
}

export function listenToPrivateRoomHost(
  roomId: string,
  onGuestJoined: (room: GameRoom, startTime: number) => void
) {
  let hasTriggered = false;
  const mySessionId = getClientSessionId();

  const cleanCode = roomId.replace(/^room_code_/, '');
  const prefixedRoomId = `room_code_${cleanCode}`;

  const handleUpdate = (room: GameRoom, explicitStartTime?: number) => {
    if (hasTriggered) return;
    const hasGuest = Boolean(room.guestId && room.guestId !== '') || Boolean(room.guestSessionId && room.guestSessionId !== '');
    if (hasGuest && (room.status === 'starting' || room.status === 'ready' || room.status === 'playing')) {
      hasTriggered = true;
      const startTime =
        explicitStartTime ||
        (room.roundStartTime && room.roundStartTime > Date.now() ? room.roundStartTime : Date.now() + 3500);

      const readyRoom: GameRoom = {
        ...room,
        status: 'ready',
        hostReady: true,
        guestReady: true,
        roundStartTime: startTime,
        roundStartedAt: startTime,
        updatedAt: new Date().toISOString(),
      };

      saveFallbackRoom(readyRoom, true);

      broadcastFallbackMessage({
        type: 'MATCH_READY',
        roomId: room.id,
        room: readyRoom,
        startTime,
        hostSessionId: mySessionId,
      });

      // Update both Firestore docs
      Promise.all([
        updateDoc(
          doc(db, 'gameRooms', cleanCode),
          sanitizeFirestorePayload({
            status: 'ready',
            hostReady: true,
            roundStartTime: startTime,
            roundStartedAt: startTime,
            updatedAt: new Date().toISOString(),
          }) as Record<string, unknown>
        ).catch(() => {}),
        updateDoc(
          doc(db, 'gameRooms', prefixedRoomId),
          sanitizeFirestorePayload({
            status: 'ready',
            hostReady: true,
            roundStartTime: startTime,
            roundStartedAt: startTime,
            updatedAt: new Date().toISOString(),
          }) as Record<string, unknown>
        ).catch(() => {}),
      ]).catch(() => {});

      onGuestJoined(readyRoom, startTime);
    }
  };

  // 1. Subscribe to fallback / BroadcastChannel / LocalStorage
  const unsubFallback1 = subscribeToFallbackRoom(cleanCode, (room) => handleUpdate(room));
  const unsubFallback2 = subscribeToFallbackRoom(prefixedRoomId, (room) => handleUpdate(room));

  // 2. WebRTC Host Peer if code is available
  let unsubPeer: (() => void) | null = null;
  const currentInitial = getFallbackRoom(cleanCode) || getFallbackRoom(prefixedRoomId);
  if (cleanCode.length === 6 && currentInitial) {
    unsubPeer = initHostPeer(cleanCode, currentInitial, (updatedRoom, peerStartTime) => {
      handleUpdate(updatedRoom, peerStartTime);
    });
  }

  // 3. Listen to Firestore gameRooms collection on BOTH cleanCode and prefixedRoomId
  let unsubGameRooms1: (() => void) | null = null;
  let unsubGameRooms2: (() => void) | null = null;
  try {
    unsubGameRooms1 = onSnapshot(
      doc(db, 'gameRooms', cleanCode),
      (snap) => {
        if (snap.exists()) {
          handleUpdate({ ...(snap.data() as GameRoom), id: snap.id });
        }
      },
      (err) => console.warn('GameRooms cleanCode listener notice:', err)
    );
    unsubGameRooms2 = onSnapshot(
      doc(db, 'gameRooms', prefixedRoomId),
      (snap) => {
        if (snap.exists()) {
          handleUpdate({ ...(snap.data() as GameRoom), id: snap.id });
        }
      },
      (err) => console.warn('GameRooms prefixedRoomId listener notice:', err)
    );
  } catch (err) {
    console.warn('Firestore listener attachment notice:', err);
  }

  // 4. Active polling safety net (every 800ms) for mobile background / WebSocket lags
  const pollTimer = setInterval(async () => {
    if (hasTriggered) {
      clearInterval(pollTimer);
      return;
    }
    try {
      const snap1 = await getDoc(doc(db, 'gameRooms', cleanCode));
      if (snap1.exists()) {
        handleUpdate({ ...(snap1.data() as GameRoom), id: snap1.id });
        return;
      }
      const snap2 = await getDoc(doc(db, 'gameRooms', prefixedRoomId));
      if (snap2.exists()) {
        handleUpdate({ ...(snap2.data() as GameRoom), id: snap2.id });
      }
    } catch {
      // non-fatal poll
    }
  }, 800);

  return () => {
    hasTriggered = true;
    clearInterval(pollTimer);
    unsubFallback1();
    unsubFallback2();
    if (unsubPeer) unsubPeer();
    if (unsubGameRooms1) unsubGameRooms1();
    if (unsubGameRooms2) unsubGameRooms2();
  };
}
