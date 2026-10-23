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
  initHostPeer,
  joinGuestPeer,
  joinFallbackQueue as joinFallbackQueueService,
  leaveFallbackQueue as leaveFallbackQueueService,
  broadcastFallbackMessage,
} from './multiplayerFallback';

const DEFAULT_AVATAR =
  'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=160&q=80';

/**
 * Strips any `undefined` properties from an object before passing to Firestore `setDoc` or `updateDoc`.
 */
function sanitizeFirestorePayload<T extends Record<string, unknown>>(payload: T): T {
  const cleaned: Record<string, unknown> = {};
  Object.entries(payload).forEach(([key, value]) => {
    if (value !== undefined) {
      cleaned[key] = value;
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

/**
 * Automatically ensures Firebase Auth has a valid session (falling back to signInAnonymously for guest players).
 */
export async function ensureFirebaseAuth(): Promise<string> {
  const current = auth.currentUser;
  if (current) {
    return current.uid;
  }
  try {
    const cred = await signInAnonymously(auth);
    return cred.user.uid;
  } catch (err) {
    console.warn('Anonymous auth auto-fallback notice:', err);
    const fallbackUser = auth.currentUser as { uid: string } | null;
    return fallbackUser?.uid || `guest_${getClientSessionId()}`;
  }
}

/**
 * Ensures Firebase Auth has an active user and returns a complete, non-undefined player identity.
 */
async function ensurePlayerIdentity(user?: Partial<UserProfile>): Promise<{
  uid: string;
  username: string;
  avatar: string;
  countryCode: string;
  countryFlag: string;
  level: number;
}> {
  await ensureFirebaseAuth();

  const uid =
    auth.currentUser?.uid ||
    user?.uid ||
    (user as { id?: string } | undefined)?.id ||
    `player_${Date.now().toString(36)}`;

  const username =
    (user?.username && user.username.trim()) ||
    auth.currentUser?.displayName ||
    `Explorer_${uid.slice(0, 4)}`;

  const avatar =
    (user?.avatar && user.avatar.trim()) ||
    auth.currentUser?.photoURL ||
    DEFAULT_AVATAR;

  const geo = await detectUserCountry().catch(() => getSyncDetectedCountry());
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
  unsubscribe: () => void;
}

// Joins the worldwide matchmaking queue for REAL PLAYERS ONLY via Firestore gameRooms & fallback queue
export async function joinMatchmakingQueue(
  user: UserProfile,
  preferredCategory: GameCategory | 'mixed' = 'cultural_quiz',
  targetCountryCode?: string
): Promise<JoinQueueResult> {
  await ensureFirebaseAuth();
  const player = await ensurePlayerIdentity(user);
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
    const q = query(
      collection(db, 'gameRooms'),
      where('status', '==', 'waiting')
    );
    const snap = await getDocs(q);

    // Find a valid waiting room created by another real player (not our tab session, not already joined, not expired)
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
      // Pick the first available open waiting room
      const waitingRoom = openRooms[0];
      const now = Date.now();

      const updates: Partial<GameRoom> = sanitizeFirestorePayload({
        guestId: player.uid,
        guestSessionId: mySessionId,
        guestUsername: player.username,
        guestCountryCode: player.countryCode,
        guestCountryFlag: player.countryFlag,
        guestAvatar: player.avatar,
        guestScore: 0,
        guestReady: true,
        status: 'starting' as const,
        roundStartedAt: now,
        roundStartTime: now,
        updatedAt: new Date().toISOString(),
      });

      // Join the room as guest and advance status to 'starting'
      await updateDoc(doc(db, 'gameRooms', waitingRoom.id), updates as Record<string, unknown>);
      try {
        await updateDoc(doc(db, 'rooms', waitingRoom.id), updates as Record<string, unknown>);
      } catch {
        // non-fatal
      }

      const matchedRoom: GameRoom = { ...waitingRoom, ...updates };
      saveFallbackRoom(matchedRoom, true);

      return {
        roomId: waitingRoom.id,
        isHost: false,
        matchedRoom,
        unsubscribe: () => {},
      };
    }
  } catch (err) {
    console.warn('Firestore queue search notice, checking fallback queue:', err);
  }

  // 2. Check local/peer fallback queue for waiting opponents
  try {
    const fallbackResult = await joinFallbackQueueService(
      { ...user, ...player },
      preferredCategory,
      targetCountryCode
    );
    if (fallbackResult.matchedRoom) {
      return {
        roomId: fallbackResult.roomId,
        isHost: false,
        matchedRoom: fallbackResult.matchedRoom,
        unsubscribe: () => {},
      };
    }
    // If fallback created our own waiting room, we mirror to Firestore asynchronously
    const roomId = fallbackResult.roomId;
    const waitingRoom = getFallbackRoom(roomId);
    if (waitingRoom) {
      try {
        await setDoc(doc(db, 'gameRooms', roomId), waitingRoom);
        setDoc(doc(db, 'rooms', roomId), waitingRoom).catch(() => {});
      } catch {
        // non-fatal
      }
    }
    return {
      roomId,
      isHost: true,
      unsubscribe: () => {
        leaveFallbackQueueService(roomId);
        deleteDoc(doc(db, 'gameRooms', roomId)).catch(() => {});
        deleteDoc(doc(db, 'rooms', roomId)).catch(() => {});
      },
    };
  } catch (err) {
    console.warn('Fallback queue notice:', err);
  }

  // 3. Ultimate safe fallback waiting room creation
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
    isBotOpponent: false, // REAL PLAYERS ONLY
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }) as unknown as GameRoom;

  saveFallbackRoom(roomData, true);

  try {
    await setDoc(doc(db, 'gameRooms', roomId), roomData);
    setDoc(doc(db, 'rooms', roomId), roomData).catch(() => {});
  } catch (error) {
    console.warn('Could not create waiting game room in Firestore (fallback active):', error);
  }

  return {
    roomId,
    isHost: true,
    unsubscribe: () => {
      leaveFallbackQueueService(roomId);
      deleteDoc(doc(db, 'gameRooms', roomId)).catch(() => {});
      deleteDoc(doc(db, 'rooms', roomId)).catch(() => {});
    },
  };
}

// Listens to room updates when another real player joins our waiting room, with active pairing loop
export function listenToMatchmakingRoom(
  roomId: string,
  onMatched: (room: GameRoom) => void,
  user?: UserProfile,
  preferredCategory: GameCategory | 'mixed' = 'cultural_quiz'
) {
  let isDone = false;
  const mySessionId = getClientSessionId();

  // 1. Fallback & Broadcast listener
  const unsubFallback = subscribeToFallbackRoom(roomId, (room) => {
    if (isDone) return;
    if (room.guestId && (room.status === 'starting' || room.status === 'playing')) {
      isDone = true;
      onMatched(room);
    }
  });

  // 2. Primary snapshot listener on our waiting room in Firestore
  let unsubSnap = () => {};
  try {
    unsubSnap = onSnapshot(
      doc(db, 'gameRooms', roomId),
      (snap) => {
        if (isDone) return;
        if (snap.exists()) {
          const room = { ...(snap.data() as GameRoom), id: snap.id };
          if (room.guestId && (room.status === 'starting' || room.status === 'playing')) {
            isDone = true;
            onMatched(room);
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

  // 3. Active pairing loop (every 1.8 seconds): if another player entered and created a room concurrently,
  // tie-break by ID so both players pair immediately instead of waiting indefinitely
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
      const snap = await getDocs(q);
      if (isDone) return;

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
        // Pick the oldest room, or if lower ID, become the guest
        const otherRoom = otherOpenRooms[0];
        if (otherRoom.id < roomId) {
          isDone = true;
          clearInterval(pollInterval);

          const now = Date.now();
          const p = user
            ? await ensurePlayerIdentity(user)
            : {
                uid: auth.currentUser?.uid || `guest_${mySessionId}`,
                username: 'Challenger',
                countryCode: 'TN',
                countryFlag: '🌍',
                avatar: DEFAULT_AVATAR,
              };

          const updates: Partial<GameRoom> = sanitizeFirestorePayload({
            guestId: p.uid,
            guestSessionId: mySessionId,
            guestUsername: p.username,
            guestCountryCode: p.countryCode,
            guestCountryFlag: p.countryFlag,
            guestAvatar: p.avatar,
            guestScore: 0,
            guestReady: true,
            status: 'starting' as const,
            roundStartedAt: now,
            roundStartTime: now,
            updatedAt: new Date().toISOString(),
          });

          // Join the other room
          await updateDoc(doc(db, 'gameRooms', otherRoom.id), updates as Record<string, unknown>);
          // Clean up our obsolete waiting room
          deleteDoc(doc(db, 'gameRooms', roomId)).catch(() => {});
          leaveFallbackQueueService(roomId);

          const matched = { ...otherRoom, ...updates };
          saveFallbackRoom(matched, true);
          onMatched(matched);
        }
      }
    } catch {
      // non-fatal poll
    }
  }, 1800);

  return () => {
    isDone = true;
    clearInterval(pollInterval);
    unsubFallback();
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
    const roomSnap = await getDoc(doc(db, 'gameRooms', roomId));
    if (roomSnap.exists()) {
      const data = roomSnap.data() as GameRoom;
      // Only delete if still waiting with no guest
      if (data.status === 'waiting' && (!data.guestId || data.guestId === '')) {
        await deleteDoc(doc(db, 'gameRooms', roomId));
        deleteDoc(doc(db, 'rooms', roomId)).catch(() => {});
      }
    }
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
  // 1. Ensure active Firebase Auth session (anonymous auth fallback for guest players)
  await ensureFirebaseAuth();
  const player = await ensurePlayerIdentity(user);
  const mySessionId = getClientSessionId();
  const roomCode = generateRoomCode();
  const roomId = `room_code_${roomCode}`;

  const roundCount = preferredCategory === 'memory_match' ? 1 : preferredCategory === 'guess_number' ? 3 : 5;
  const questions = await fetchDynamicGameQuestions({
    count: roundCount,
    category: preferredCategory,
    countryCode: targetCountryCode,
    userLevel: player.level,
  });

  const roomData: GameRoom = sanitizeFirestorePayload({
    id: roomId,
    roomCode,
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
    isBotOpponent: false, // NO BOTS
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }) as unknown as GameRoom;

  // 1. Always persist to robust fallback storage (LocalStorage + BroadcastChannel) immediately
  saveFallbackRoom(roomData, true);

  // Helper to persist to gameRooms, rooms, and duels collections
  const writeRoomData = async () => {
    await setDoc(doc(db, 'gameRooms', roomId), roomData);
    try {
      await setDoc(doc(db, 'rooms', roomId), roomData);
      await setDoc(doc(db, 'duels', roomId), roomData);
      // Support looking up directly by 6-digit code document ID as well
      await setDoc(doc(db, 'rooms', roomCode), roomData);
    } catch (auxErr) {
      console.warn('Auxiliary rooms collection write note:', auxErr);
    }
  };

  try {
    await writeRoomData();
  } catch (primaryErr) {
    console.warn('Firestore primary write notice, attempting anonymous auth recovery...', primaryErr);
    try {
      const anonCred = await signInAnonymously(auth);
      if (anonCred.user.uid) {
        roomData.hostId = anonCred.user.uid;
      }
      await writeRoomData();
    } catch (retryErr) {
      // DO NOT THROW AN ERROR UI BLOCKER!
      // Gracefully continue using local storage & peer fallback
      console.warn('Firestore write failed, seamlessly continuing with peer & storage fallback:', retryErr);
      saveFallbackRoom(roomData, true);
    }
  }

  return { room: roomData, roomCode };
}

export async function joinPrivateDuelRoom(
  roomCodeInput: string,
  user: UserProfile
): Promise<GameRoom> {
  const cleanCode = roomCodeInput.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (cleanCode.length !== 6) {
    throw new Error('Please enter a valid 6-character room code.');
  }

  // Ensure active Firebase Auth session (anonymous auth fallback for guest players)
  await ensureFirebaseAuth();
  const player = await ensurePlayerIdentity(user);
  const mySessionId = getClientSessionId();
  const roomId = `room_code_${cleanCode}`;

  let currentRoom: GameRoom | null = null;

  // 1. First check local storage & in-memory fallback
  const localRoom = getFallbackRoom(cleanCode);
  if (localRoom) {
    currentRoom = localRoom;
  }

  // 2. Try Firestore lookup
  if (!currentRoom) {
    const fetchRoomDoc = async () => {
      let snap = await getDoc(doc(db, 'gameRooms', roomId));
      if (snap.exists()) return snap;
      snap = await getDoc(doc(db, 'rooms', roomId));
      if (snap.exists()) return snap;
      snap = await getDoc(doc(db, 'rooms', cleanCode));
      if (snap.exists()) return snap;
      return await getDoc(doc(db, 'duels', roomId));
    };

    try {
      const snap = await fetchRoomDoc();
      if (snap && snap.exists()) {
        currentRoom = { ...(snap.data() as GameRoom), id: snap.id };
      }
    } catch (getErr) {
      console.warn('Firestore room lookup notice, checking peer fallback:', getErr);
    }
  }

  // 3. If still not found, try WebRTC direct peer connection (cross-device/network)
  if (!currentRoom) {
    try {
      const peerRoom = await joinGuestPeer(cleanCode, player);
      if (peerRoom) {
        currentRoom = peerRoom;
      }
    } catch (peerErr) {
      console.warn('WebRTC peer join notice:', peerErr);
    }
  }

  if (!currentRoom) {
    throw new Error(`Room code "${cleanCode}" not found. Please double-check the code with your friend.`);
  }

  if (currentRoom.status === 'finished') {
    throw new Error('This game match has already finished.');
  }

  // If hostSessionId matches our tab session, we cannot join our own room in the exact same tab
  const isSameHostTab = currentRoom.hostSessionId
    ? currentRoom.hostSessionId === mySessionId
    : currentRoom.hostId === player.uid;
  if (isSameHostTab) {
    throw new Error('You generated this code in this tab. Share this code with a friend or open another window to test joining!');
  }

  if (currentRoom.guestId && currentRoom.guestId !== '' && currentRoom.guestSessionId !== mySessionId) {
    throw new Error('This room is already full (another player joined).');
  }

  const now = Date.now();

  // Join as guest — every field is guaranteed to be defined
  const updates: Partial<GameRoom> = sanitizeFirestorePayload({
    guestId: player.uid,
    guestSessionId: mySessionId,
    guestUsername: player.username,
    guestCountryCode: player.countryCode,
    guestCountryFlag: player.countryFlag,
    guestAvatar: player.avatar,
    guestScore: 0,
    guestReady: true,
    status: 'starting' as const,
    roundStartedAt: now,
    roundStartTime: now,
    updatedAt: new Date().toISOString(),
  });

  const updatedRoom: GameRoom = { ...currentRoom, ...updates };

  // Always update fallback storage & broadcast
  saveFallbackRoom(updatedRoom, true);
  broadcastFallbackMessage({
    type: 'GUEST_JOIN',
    roomId: currentRoom.id,
    guest: player,
    guestSessionId: mySessionId,
  });
  broadcastFallbackMessage({
    type: 'ROOM_SYNC',
    room: updatedRoom,
  });

  // Also apply Firestore updates asynchronously
  const applyRoomUpdates = async () => {
    await updateDoc(doc(db, 'gameRooms', roomId), updates as Record<string, unknown>);
    try {
      await updateDoc(doc(db, 'rooms', roomId), updates as Record<string, unknown>);
      await updateDoc(doc(db, 'rooms', cleanCode), updates as Record<string, unknown>);
      await updateDoc(doc(db, 'duels', roomId), updates as Record<string, unknown>);
    } catch {
      // non-fatal
    }
  };

  try {
    await applyRoomUpdates();
  } catch (updateErr) {
    console.warn('Firestore join update notice (fallback active):', updateErr);
  }

  return updatedRoom;
}

export function listenToPrivateRoomHost(
  roomId: string,
  onGuestJoined: (room: GameRoom) => void
) {
  let hasTriggered = false;
  const handleUpdate = (room: GameRoom) => {
    if (hasTriggered) return;
    const hasGuest = Boolean(room.guestId && room.guestId !== '') || Boolean(room.guestSessionId && room.guestSessionId !== '');
    if (hasGuest && (room.status === 'starting' || room.status === 'playing')) {
      hasTriggered = true;
      onGuestJoined(room);
    }
  };

  // 1. Subscribe to fallback / BroadcastChannel / LocalStorage
  const unsubFallback = subscribeToFallbackRoom(roomId, (room) => {
    handleUpdate(room);
  });

  // 2. If room has a 6-digit code, also initialize WebRTC Host Peer
  let unsubPeer: (() => void) | null = null;
  const codeMatch = roomId.match(/room_code_([A-Z0-9]{6})/i);
  const currentInitial = getFallbackRoom(roomId);
  if (codeMatch && codeMatch[1] && currentInitial) {
    unsubPeer = initHostPeer(codeMatch[1], currentInitial, (updatedRoom) => {
      handleUpdate(updatedRoom);
    });
  }

  // 3. Listen to Firestore
  let unsubGameRooms: (() => void) | null = null;
  let unsubRooms: (() => void) | null = null;
  try {
    unsubGameRooms = onSnapshot(
      doc(db, 'gameRooms', roomId),
      (snap) => {
        if (snap.exists()) {
          handleUpdate({ ...(snap.data() as GameRoom), id: snap.id });
        }
      },
      (err) => {
        console.warn('GameRooms listener notice (using peer & storage fallback):', err);
      }
    );

    unsubRooms = onSnapshot(
      doc(db, 'rooms', roomId),
      (snap) => {
        if (snap.exists()) {
          handleUpdate({ ...(snap.data() as GameRoom), id: snap.id });
        }
      },
      (err) => {
        console.warn('Rooms listener notice:', err);
      }
    );
  } catch (err) {
    console.warn('Firestore listener attachment notice:', err);
  }

  return () => {
    hasTriggered = true;
    unsubFallback();
    if (unsubPeer) unsubPeer();
    if (unsubGameRooms) unsubGameRooms();
    if (unsubRooms) unsubRooms();
  };
}
