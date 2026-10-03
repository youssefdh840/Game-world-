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
import { db, auth } from './firebase';
import { UserProfile, GameCategory, GameRoom } from '../types/game';
import { fetchDynamicGameQuestions } from './questionService';

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

// Joins the worldwide matchmaking queue for REAL PLAYERS ONLY via Firestore gameRooms
export async function joinMatchmakingQueue(
  user: UserProfile,
  preferredCategory: GameCategory | 'mixed' = 'mixed',
  targetCountryCode?: string
): Promise<JoinQueueResult> {
  const threeMinutesAgo = Date.now() - 3 * 60 * 1000;

  // 1. Check if another real player already has an open waiting room in gameRooms
  try {
    const q = query(
      collection(db, 'gameRooms'),
      where('status', '==', 'waiting')
    );
    const snap = await getDocs(q);

    // Find a valid waiting room created by another real player (not ourselves, not already joined, not expired)
    const openRooms = snap.docs
      .map((d) => d.data() as GameRoom)
      .filter((r) => {
        if (!r.id || !r.hostId || r.hostId === user.uid) return false;
        if (r.guestId && r.guestId !== '') return false;
        const createdMs = new Date(r.createdAt).getTime();
        return !isNaN(createdMs) && createdMs >= threeMinutesAgo;
      });

    if (openRooms.length > 0) {
      // Pick the first available open waiting room
      const waitingRoom = openRooms[0];
      const now = Date.now();

      const updates: Partial<GameRoom> = {
        guestId: user.uid,
        guestUsername: user.username,
        guestCountryCode: user.countryCode,
        guestCountryFlag: user.countryFlag,
        guestAvatar: user.avatar,
        guestScore: 0,
        guestReady: true,
        status: 'starting',
        roundStartedAt: now,
        roundStartTime: now,
        updatedAt: new Date().toISOString(),
      };

      // Join the room as guest and advance status to 'starting'
      await updateDoc(doc(db, 'gameRooms', waitingRoom.id), updates);

      const matchedRoom: GameRoom = { ...waitingRoom, ...updates };

      return {
        roomId: waitingRoom.id,
        isHost: false,
        matchedRoom,
        unsubscribe: () => {},
      };
    }
  } catch (err) {
    console.warn('Queue search notice:', err);
  }

  // 2. No open waiting room: Player 1 creates a new room document in Firestore with status 'waiting'
  const roomId = `room_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

  // Fetch diverse questions for this match
  const questions = await fetchDynamicGameQuestions({
    count: 5,
    category: preferredCategory,
    countryCode: targetCountryCode,
    userLevel: user.level,
  });

  const now = Date.now();
  const roomData: GameRoom = {
    id: roomId,
    hostId: user.uid,
    hostUsername: user.username,
    hostCountryCode: user.countryCode,
    hostCountryFlag: user.countryFlag,
    hostAvatar: user.avatar,
    hostScore: 0,
    hostReady: true,

    guestId: '',
    guestUsername: '',
    guestCountryCode: '',
    guestCountryFlag: '',
    guestAvatar: '',
    guestScore: 0,
    guestReady: false,

    gameMode: preferredCategory,
    targetCountryCode,
    status: 'waiting',
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
  };

  try {
    await setDoc(doc(db, 'gameRooms', roomId), roomData);
  } catch (error) {
    console.warn('Could not create waiting game room in Firestore:', error);
  }

  return {
    roomId,
    isHost: true,
    unsubscribe: () => {
      // If Player 1 cancels search, clean up the waiting room
      deleteDoc(doc(db, 'gameRooms', roomId)).catch(() => {});
    },
  };
}

// Listens to room updates when another real player joins our waiting room
export function listenToMatchmakingRoom(
  roomId: string,
  onMatched: (room: GameRoom) => void
) {
  return onSnapshot(
    doc(db, 'gameRooms', roomId),
    (snap) => {
      if (snap.exists()) {
        const room = snap.data() as GameRoom;
        if (room.guestId && room.status === 'starting') {
          onMatched(room);
        }
      }
    },
    (error) => {
      console.warn(`Matchmaking room listen notice (${roomId}):`, error);
    }
  );
}

// Alias for backwards compatibility
export const listenToMatchmakingTicket = (
  roomId: string,
  onMatched: (roomId: string) => void
) => {
  return onSnapshot(doc(db, 'gameRooms', roomId), (snap) => {
    if (snap.exists()) {
      const room = snap.data() as GameRoom;
      if (room.guestId && room.status === 'starting') {
        onMatched(room.id);
      }
    }
  });
};

// Cancel / leave queue and delete waiting room
export async function leaveMatchmakingQueue(roomId: string) {
  if (!roomId) return;
  try {
    const roomSnap = await getDoc(doc(db, 'gameRooms', roomId));
    if (roomSnap.exists()) {
      const data = roomSnap.data() as GameRoom;
      // Only delete if still waiting with no guest
      if (data.status === 'waiting' && (!data.guestId || data.guestId === '')) {
        await deleteDoc(doc(db, 'gameRooms', roomId));
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
  preferredCategory: GameCategory | 'mixed' = 'mixed'
): Promise<{ room: GameRoom; roomCode: string }> {
  const roomCode = generateRoomCode();
  const roomId = `room_code_${roomCode}`;

  const questions = await fetchDynamicGameQuestions({
    count: 5,
    category: preferredCategory,
    userLevel: user.level,
  });

  const roomData: GameRoom = {
    id: roomId,
    hostId: user.uid,
    hostUsername: user.username,
    hostCountryCode: user.countryCode,
    hostCountryFlag: user.countryFlag,
    hostAvatar: user.avatar,
    hostScore: 0,
    hostReady: true,

    guestId: '',
    guestUsername: '',
    guestCountryCode: '',
    guestCountryFlag: '',
    guestAvatar: '',
    guestScore: 0,
    guestReady: false,

    gameMode: preferredCategory,
    status: 'waiting',
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
  };

  await setDoc(doc(db, 'gameRooms', roomId), roomData);
  return { room: roomData, roomCode };
}

export async function joinPrivateDuelRoom(
  roomCodeInput: string,
  user: UserProfile
): Promise<GameRoom> {
  const cleanCode = roomCodeInput.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  const roomId = `room_code_${cleanCode}`;

  const roomDoc = await getDoc(doc(db, 'gameRooms', roomId));
  if (!roomDoc.exists()) {
    throw new Error(`Room code "${cleanCode}" not found. Please double-check with your friend.`);
  }

  const currentRoom = roomDoc.data() as GameRoom;
  if (currentRoom.status === 'finished') {
    throw new Error('This game match has already finished.');
  }

  if (currentRoom.hostId === user.uid) {
    throw new Error("You are the host of this room. Waiting for another real player to join!");
  }

  // Join as guest
  const updates: Partial<GameRoom> = {
    guestId: user.uid,
    guestUsername: user.username,
    guestCountryCode: user.countryCode,
    guestCountryFlag: user.countryFlag,
    guestAvatar: user.avatar,
    guestReady: true,
    status: 'starting',
    roundStartedAt: Date.now(),
    roundStartTime: Date.now(),
    updatedAt: new Date().toISOString(),
  };

  await updateDoc(doc(db, 'gameRooms', roomId), updates);
  return { ...currentRoom, ...updates };
}

export function listenToPrivateRoomHost(
  roomId: string,
  onGuestJoined: (room: GameRoom) => void
) {
  return onSnapshot(
    doc(db, 'gameRooms', roomId),
    (snap) => {
      if (snap.exists()) {
        const room = snap.data() as GameRoom;
        if (room.guestId && room.status === 'starting') {
          onGuestJoined(room);
        }
      }
    },
    (err) => {
      console.warn('Error listening to private room:', err);
    }
  );
}
