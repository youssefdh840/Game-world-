import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  getDocs,
  query,
  orderBy,
  limit,
  onSnapshot,
} from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from './firebase';
import { UserProfile, PassportStamp } from '../types/game';
import { getCountryByCode } from './countryData';
import { BADGES } from './badgesData';

// Configurable Level Curve
export const LEVEL_THRESHOLDS = [
  0,      // Level 1
  500,    // Level 2
  1200,   // Level 3
  2200,   // Level 4
  3500,   // Level 5
  5200,   // Level 6
  7200,   // Level 7
  9800,   // Level 8
  13000,  // Level 9
  17000,  // Level 10
  22000,  // Level 11
  28000,  // Level 12
  35000,  // Level 13
  45000,  // Level 14
  60000,  // Level 15
];

export function calculateLevel(xp: number) {
  let level = 1;
  for (let i = 0; i < LEVEL_THRESHOLDS.length; i++) {
    if (xp >= LEVEL_THRESHOLDS[i]) {
      level = i + 1;
    } else {
      break;
    }
  }

  const currentLevelBase = LEVEL_THRESHOLDS[level - 1] || 0;
  const nextLevelThreshold = LEVEL_THRESHOLDS[level] || currentLevelBase + 5000;
  const xpInCurrentLevel = Math.max(0, xp - currentLevelBase);
  const xpSpan = Math.max(1, nextLevelThreshold - currentLevelBase);
  const progressPercent = Math.min(100, Math.floor((xpInCurrentLevel / xpSpan) * 100));

  return {
    level,
    xp,
    currentLevelBase,
    nextLevelThreshold,
    xpInCurrentLevel,
    xpNeededForNext: nextLevelThreshold - xp,
    progressPercent,
  };
}

export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  if (!uid || uid.startsWith('guest_') || !auth.currentUser) return null;
  const path = `users/${uid}`;
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    if (snap.exists()) {
      return snap.data() as UserProfile;
    }
    return null;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
    return null;
  }
}

export function subscribeToUserProfile(uid: string, callback: (profile: UserProfile | null) => void) {
  if (!uid || uid.startsWith('guest_') || !auth.currentUser) return () => {};
  const path = `users/${uid}`;
  return onSnapshot(
    doc(db, 'users', uid),
    (snap) => {
      if (snap.exists()) {
        callback(snap.data() as UserProfile);
      } else {
        callback(null);
      }
    },
    (error) => {
      handleFirestoreError(error, OperationType.GET, path);
    }
  );
}

export async function createUserProfile(profile: UserProfile): Promise<void> {
  if (!profile?.uid || profile.uid.startsWith('guest_') || !auth.currentUser) return;
  const path = `users/${profile.uid}`;
  try {
    await setDoc(doc(db, 'users', profile.uid), profile);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function updateUserProfile(uid: string, updates: Partial<UserProfile>): Promise<void> {
  if (!uid || uid.startsWith('guest_') || !auth.currentUser) return;
  const path = `users/${uid}`;
  try {
    await updateDoc(doc(db, 'users', uid), updates);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function awardGameResults(
  uid: string,
  isWinner: boolean,
  xpEarned: number,
  coinsEarned: number,
  opponentCountryCode?: string,
  opponentUsername?: string,
  opponentAvatar?: string
): Promise<{ leveledUp: boolean; newLevel: number; newlyUnlockedCountry?: string; newBadges: string[] }> {
  const current = await getUserProfile(uid);
  if (!current) {
    return { leveledUp: false, newLevel: 1, newBadges: [] };
  }

  const oldLevel = calculateLevel(current.xp).level;
  const newXp = current.xp + xpEarned;
  const newLevelInfo = calculateLevel(newXp);
  const leveledUp = newLevelInfo.level > oldLevel;

  const gamesPlayed = (current.gamesPlayed || 0) + 1;
  const gamesWon = (current.gamesWon || 0) + (isWinner ? 1 : 0);
  const newCoins = (current.coins || 0) + coinsEarned;

  let discoveredCountries = [...(current.discoveredCountries || [])];
  let newlyUnlockedCountry: string | undefined;

  // Virtual Passport unlock requirement:
  // "A country becomes unlocked when:
  //  1. The player meets another player from that country AND
  //  2. They successfully complete a game together."
  if (opponentCountryCode && !discoveredCountries.includes(opponentCountryCode.toUpperCase())) {
    const code = opponentCountryCode.toUpperCase();
    discoveredCountries.push(code);
    newlyUnlockedCountry = code;

    // Create passport stamp in subcollection
    const countryInfo = getCountryByCode(code);
    const stamp: PassportStamp = {
      id: `${uid}_${code}`,
      userId: uid,
      countryCode: code,
      countryName: countryInfo?.name || code,
      countryFlag: countryInfo?.flag || '🌍',
      capital: countryInfo?.capital || 'Unknown',
      continent: countryInfo?.continent || 'World',
      unlockedAt: new Date().toISOString(),
      metPlayerUsername: opponentUsername || 'World Explorer',
      metPlayerAvatar: opponentAvatar || '✈️',
      gamesPlayedWith: 1,
      scoreAchieved: xpEarned,
    };

    try {
      await setDoc(doc(db, 'users', uid, 'passport', code), stamp);
    } catch {
      // Non-fatal if stamp write fails
    }
  }

  // Check achievements/badges
  const unlockedBadges = [...(current.unlockedBadges || [])];
  const newBadges: string[] = [];

  // Badge: First friend
  if (gamesPlayed >= 1 && !unlockedBadges.includes('first_friend')) {
    unlockedBadges.push('first_friend');
    newBadges.push('first_friend');
  }
  // Badge: First journey
  if (discoveredCountries.length >= 1 && !unlockedBadges.includes('first_journey')) {
    unlockedBadges.push('first_journey');
    newBadges.push('first_journey');
  }
  // Badge: World Traveler
  if (discoveredCountries.length >= 5 && !unlockedBadges.includes('world_traveler')) {
    unlockedBadges.push('world_traveler');
    newBadges.push('world_traveler');
  }
  // Badge: Global Explorer
  if (discoveredCountries.length >= 10 && !unlockedBadges.includes('global_explorer')) {
    unlockedBadges.push('global_explorer');
    newBadges.push('global_explorer');
  }
  // Badge: Champion
  if (gamesWon >= 10 && !unlockedBadges.includes('champion')) {
    unlockedBadges.push('champion');
    newBadges.push('champion');
  }

  // Extra XP from new badges
  let bonusBadgeXp = 0;
  newBadges.forEach((bId) => {
    const b = BADGES.find((x) => x.id === bId);
    if (b) bonusBadgeXp += b.xpReward;
  });

  const finalXp = newXp + bonusBadgeXp;
  const finalLevel = calculateLevel(finalXp).level;

  await updateUserProfile(uid, {
    xp: finalXp,
    level: finalLevel,
    coins: newCoins,
    gamesPlayed,
    gamesWon,
    discoveredCountries,
    unlockedBadges,
    lastActiveAt: new Date().toISOString(),
  });

  return {
    leveledUp: finalLevel > oldLevel,
    newLevel: finalLevel,
    newlyUnlockedCountry,
    newBadges,
  };
}

export async function getUserPassportStamps(uid: string): Promise<PassportStamp[]> {
  if (!uid || uid.startsWith('guest_') || !auth.currentUser) {
    return [];
  }
  const path = `users/${uid}/passport`;
  try {
    const snap = await getDocs(collection(db, 'users', uid, 'passport'));
    return snap.docs.map((d) => d.data() as PassportStamp);
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
    return [];
  }
}

export async function getLeaderboard(): Promise<UserProfile[]> {
  const path = 'users';
  try {
    const q = query(collection(db, 'users'), orderBy('xp', 'desc'), limit(50));
    const snap = await getDocs(q);
    const users = snap.docs.map((d) => d.data() as UserProfile);

    // If fewer than 5 users in database, supplement with rich demo champions
    if (users.length < 5) {
      return [...users, ...SEED_LEADERBOARD.filter((s) => !users.some((u) => u.uid === s.uid))].sort(
        (a, b) => b.xp - a.xp
      );
    }

    return users;
  } catch (error) {
    // If unauthenticated or offline, gracefully return seed leaderboard
    return SEED_LEADERBOARD;
  }
}

export const SEED_LEADERBOARD: UserProfile[] = [
  {
    uid: 'seed_kenji',
    username: 'Kenji',
    avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=160&q=80',
    countryCode: 'JP',
    countryName: 'Japan',
    countryFlag: '🇯🇵',
    bio: 'Tokyo wanderer. Love introducing Japanese festivals and anime history!',
    preferredLanguage: 'Japanese',
    level: 14,
    xp: 48920,
    coins: 3400,
    gamesPlayed: 142,
    gamesWon: 104,
    discoveredCountries: ['JP', 'TN', 'FR', 'BR', 'KR', 'EG', 'IT', 'MA', 'US', 'DE', 'ES', 'AU'],
    unlockedBadges: ['first_journey', 'first_friend', 'world_traveler', 'champion', 'foodie_globetrotter'],
    dailyStreak: 12,
    createdAt: '2026-01-10T10:00:00Z',
    lastActiveAt: new Date().toISOString(),
  },
  {
    uid: 'seed_lucas',
    username: 'Lucas',
    avatar: 'https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?auto=format&fit=crop&w=160&q=80',
    countryCode: 'FR',
    countryName: 'France',
    countryFlag: '🇫🇷',
    bio: 'Parisian architect. Always ready for a fast geography duel!',
    preferredLanguage: 'French',
    level: 12,
    xp: 32400,
    coins: 2150,
    gamesPlayed: 98,
    gamesWon: 68,
    discoveredCountries: ['FR', 'TN', 'IT', 'ES', 'DE', 'GB', 'GR', 'MA', 'JP'],
    unlockedBadges: ['first_journey', 'first_friend', 'world_traveler', 'speed_demon'],
    dailyStreak: 8,
    createdAt: '2026-02-01T12:00:00Z',
    lastActiveAt: new Date().toISOString(),
  },
  {
    uid: 'seed_amira',
    username: 'Amira',
    avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=160&q=80',
    countryCode: 'TN',
    countryName: 'Tunisia',
    countryFlag: '🇹🇳',
    bio: 'From Sidi Bou Said with love 🇹🇳 Welcome to discover Carthage & our cuisine!',
    preferredLanguage: 'Arabic',
    level: 11,
    xp: 29850,
    coins: 1980,
    gamesPlayed: 85,
    gamesWon: 61,
    discoveredCountries: ['TN', 'FR', 'EG', 'MA', 'TR', 'IT', 'JP', 'BR'],
    unlockedBadges: ['first_journey', 'first_friend', 'world_traveler', 'polyglot'],
    dailyStreak: 15,
    createdAt: '2026-01-15T09:00:00Z',
    lastActiveAt: new Date().toISOString(),
  },
  {
    uid: 'seed_mateo',
    username: 'Mateo',
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=160&q=80',
    countryCode: 'BR',
    countryName: 'Brazil',
    countryFlag: '🇧🇷',
    bio: 'Bossa nova soul & football lover from Rio 🇧🇷 Let’s play!',
    preferredLanguage: 'Portuguese',
    level: 10,
    xp: 24100,
    coins: 1650,
    gamesPlayed: 76,
    gamesWon: 52,
    discoveredCountries: ['BR', 'AR', 'CO', 'MX', 'US', 'FR', 'TN'],
    unlockedBadges: ['first_journey', 'first_friend', 'world_traveler', 'streak_master'],
    dailyStreak: 6,
    createdAt: '2026-02-14T15:00:00Z',
    lastActiveAt: new Date().toISOString(),
  },
  {
    uid: 'seed_soyeon',
    username: 'So-yeon',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=160&q=80',
    countryCode: 'KR',
    countryName: 'South Korea',
    countryFlag: '🇰🇷',
    bio: 'Seoul cafe hopper & K-Culture ambassador 🇰🇷',
    preferredLanguage: 'Korean',
    level: 9,
    xp: 18750,
    coins: 1420,
    gamesPlayed: 62,
    gamesWon: 45,
    discoveredCountries: ['KR', 'JP', 'TH', 'IN', 'FR', 'US'],
    unlockedBadges: ['first_journey', 'first_friend', 'speed_demon'],
    dailyStreak: 5,
    createdAt: '2026-02-20T11:00:00Z',
    lastActiveAt: new Date().toISOString(),
  },
];
