import {
  doc,
  setDoc,
  deleteDoc,
  collection,
  query,
  where,
  getDocs,
  onSnapshot,
} from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from './firebase';
import { UserProfile, GameCategory, GameRoom } from '../types/game';
import { getRandomQuestions, getQuestionsByCategory } from './questionData';
import { SEED_LEADERBOARD } from './userService';

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

export async function joinMatchmakingQueue(
  user: UserProfile,
  preferredCategory: GameCategory | 'mixed' = 'mixed'
): Promise<{ ticketId: string; unsubscribe: () => void }> {
  const ticketId = `ticket_${user.uid}`;
  const path = `matchmaking/${ticketId}`;

  // Check if any other user is currently waiting in queue
  try {
    const q = query(
      collection(db, 'matchmaking'),
      where('status', '==', 'waiting')
    );
    const snap = await getDocs(q);
    const opponents = snap.docs
      .map((d) => ({ id: d.id, ...(d.data() as MatchTicket) }))
      .filter((t) => t.userId !== user.uid);

    if (opponents.length > 0) {
      // Found an opponent waiting!
      const opponentTicket = opponents[0];
      const roomId = `room_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

      // Pick questions
      const questions = preferredCategory === 'mixed'
        ? getRandomQuestions(5)
        : getQuestionsByCategory(preferredCategory, 5);

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
        status: 'starting',
        currentRound: 1,
        totalRounds: questions.length,
        questionIds: questions.map((q) => q.id),
        questions,
        currentQuestion: questions[0],
        roundStartedAt: Date.now() + 3000,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // Create room
      await setDoc(doc(db, 'gameRooms', roomId), roomData);

      // Update opponent's ticket so their listener forwards them
      await setDoc(
        doc(db, 'matchmaking', opponentTicket.id),
        { status: 'matched', matchedRoomId: roomId },
        { merge: true }
      );

      // Return instant match
      return {
        ticketId,
        unsubscribe: () => {},
      };
    }
  } catch (err) {
    console.warn('Queue check error, continuing to post ticket:', err);
  }

  // If no opponent found yet, publish our own ticket
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
    handleFirestoreError(error, OperationType.WRITE, path);
  }

  // Subscribe to changes on this ticket
  let unsub = () => {};
  return {
    ticketId,
    unsubscribe: () => {
      unsub();
      // Remove ticket on leave
      deleteDoc(doc(db, 'matchmaking', ticketId)).catch(() => {});
    },
  };
}

export function listenToMatchmakingTicket(
  ticketId: string,
  onMatched: (roomId: string) => void
) {
  const path = `matchmaking/${ticketId}`;
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
      handleFirestoreError(error, OperationType.GET, path);
    }
  );
}

export async function leaveMatchmakingQueue(ticketId: string) {
  try {
    await deleteDoc(doc(db, 'matchmaking', ticketId));
  } catch {
    // Non-fatal
  }
}

// Create an instant single-player vs AI Challenger match from any country
export async function createBotGameRoom(
  user: UserProfile,
  preferredCategory: GameCategory | 'mixed' = 'mixed',
  botSeed?: typeof SEED_LEADERBOARD[0]
): Promise<GameRoom> {
  const roomId = `room_bot_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const bot = botSeed || SEED_LEADERBOARD.find((b) => b.countryCode !== user.countryCode) || SEED_LEADERBOARD[0];

  const questions = preferredCategory === 'mixed'
    ? getRandomQuestions(5)
    : getQuestionsByCategory(preferredCategory, 5);

  const roomData: GameRoom = {
    id: roomId,
    hostId: user.uid,
    hostUsername: user.username,
    hostCountryCode: user.countryCode,
    hostCountryFlag: user.countryFlag,
    hostAvatar: user.avatar,
    hostScore: 0,
    hostReady: true,

    guestId: bot.uid,
    guestUsername: bot.username,
    guestCountryCode: bot.countryCode,
    guestCountryFlag: bot.countryFlag,
    guestAvatar: bot.avatar,
    guestScore: 0,
    guestReady: true,

    gameMode: preferredCategory,
    status: 'starting',
    currentRound: 1,
    totalRounds: questions.length,
    questionIds: questions.map((q) => q.id),
    questions,
    currentQuestion: questions[0],
    roundStartedAt: Date.now() + 2500,
    isBotOpponent: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  if (auth.currentUser && !user.uid.startsWith('guest_')) {
    try {
      await setDoc(doc(db, 'gameRooms', roomId), roomData);
    } catch (error) {
      console.warn(`Could not sync bot room to Firestore (${roomId}):`, error);
    }
  }

  return roomData;
}
