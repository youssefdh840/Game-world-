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
  ticketId: string;
  unsubscribe: () => void;
  matchedRoom?: GameRoom;
}

// Joins the worldwide matchmaking queue for REAL PLAYERS ONLY
export async function joinMatchmakingQueue(
  user: UserProfile,
  preferredCategory: GameCategory | 'mixed' = 'mixed',
  targetCountryCode?: string
): Promise<JoinQueueResult> {
  const ticketId = `ticket_${user.uid}`;

  // 1. Check if another real player is already waiting in queue
  try {
    const q = query(
      collection(db, 'matchmaking'),
      where('status', '==', 'waiting')
    );
    const snap = await getDocs(q);

    // Filter out our own ticket and find valid real human opponent
    const opponents = snap.docs
      .map((d) => ({ id: d.id, ...(d.data() as MatchTicket) }))
      .filter((t) => t.userId && t.userId !== user.uid);

    if (opponents.length > 0) {
      // Pick the first waiting opponent
      const opponentTicket = opponents[0];
      const roomId = `room_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

      // Select 5 diverse, non-repeating questions
      const questions = await fetchDynamicGameQuestions({
        count: 5,
        category: preferredCategory,
        countryCode: targetCountryCode,
        userLevel: user.level,
      });

      const roomData: GameRoom = {
        id: roomId,
        hostId: opponentTicket.userId,
        hostUsername: opponentTicket.username,
        hostCountryCode: opponentTicket.countryCode,
        hostCountryFlag: opponentTicket.countryFlag,
        hostAvatar: opponentTicket.avatar,
        hostScore: 0,
        hostReady: true,

        guestId: user.uid,
        guestUsername: user.username,
        guestCountryCode: user.countryCode,
        guestCountryFlag: user.countryFlag,
        guestAvatar: user.avatar,
        guestScore: 0,
        guestReady: true,

        gameMode: preferredCategory,
        targetCountryCode,
        status: 'starting',
        currentRound: 1,
        totalRounds: questions.length,
        questionIds: questions.map((q) => q.id),
        questions,
        currentQuestion: questions[0],
        roundStartedAt: Date.now(),
        roundStartTime: Date.now(),
        isBotOpponent: false, // NO BOTS - REAL PEOPLE ONLY
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // Create live game room in Firestore
      await setDoc(doc(db, 'gameRooms', roomId), roomData);

      // Signal the waiting opponent by updating their ticket
      await setDoc(
        doc(db, 'matchmaking', opponentTicket.id),
        { status: 'matched', matchedRoomId: roomId },
        { merge: true }
      );

      // Clean up opponent ticket after a short grace period
      setTimeout(() => {
        deleteDoc(doc(db, 'matchmaking', opponentTicket.id)).catch(() => {});
      }, 5000);

      // Return instant match with the created room
      return {
        ticketId,
        matchedRoom: roomData,
        unsubscribe: () => {},
      };
    }
  } catch (err) {
    console.warn('Queue search notice:', err);
  }

  // 2. No opponent currently waiting: post our own ticket
  const ticketData: MatchTicket = {
    userId: user.uid,
    username: user.username,
    countryCode: user.countryCode,
    countryFlag: user.countryFlag,
    avatar: user.avatar,
    level: user.level,
    preferredCategory,
    status: 'waiting',
    createdAt: new Date().toISOString(),
  };

  try {
    await setDoc(doc(db, 'matchmaking', ticketId), ticketData);
  } catch (error) {
    console.warn('Could not post matchmaking ticket to Firestore:', error);
  }

  return {
    ticketId,
    unsubscribe: () => {
      deleteDoc(doc(db, 'matchmaking', ticketId)).catch(() => {});
    },
  };
}

// Listens to ticket updates when another real player matches with us
export function listenToMatchmakingTicket(
  ticketId: string,
  onMatched: (roomId: string) => void
) {
  return onSnapshot(
    doc(db, 'matchmaking', ticketId),
    (snap) => {
      if (snap.exists()) {
        const data = snap.data() as MatchTicket;
        if (data.status === 'matched' && data.matchedRoomId) {
          onMatched(data.matchedRoomId);
        }
      }
    },
    (error) => {
      console.warn(`Matchmaking ticket listen notice (${ticketId}):`, error);
    }
  );
}

// Cancel / leave queue
export async function leaveMatchmakingQueue(ticketId: string) {
  try {
    await deleteDoc(doc(db, 'matchmaking', ticketId));
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
    guestUsername: 'Waiting for friend...',
    guestCountryCode: '??',
    guestCountryFlag: '🌐',
    guestAvatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=160&q=80',
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
