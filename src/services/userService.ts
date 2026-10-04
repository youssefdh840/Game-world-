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
  increment,
  arrayUnion,
} from 'firebase/firestore';
import { db, auth } from './firebase';
import { UserProfile, PassportStamp } from '../types/game';
import { getCountryByCode } from './countryData';
import { BADGES } from './badgesData';

export function getTodayDateString(): string {
  return new Date().toISOString().split('T')[0];
}

export function hasAttemptedDailyQuestToday(user?: Partial<UserProfile> | null): boolean {
  const todayStr = getTodayDateString();
  if (user?.lastAttemptDate === todayStr || user?.lastDailyChallengeDate === todayStr) {
    return true;
  }
  if (typeof window !== 'undefined') {
    const uid = auth.currentUser?.uid || user?.uid || 'guest';
    try {
      const localAttempt = localStorage.getItem(`wc_daily_attempt_${uid}`);
      if (localAttempt === todayStr) return true;
    } catch {
      // ignore
    }
  }
  return false;
}

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

const DEFAULT_AVATAR_URL =
  'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=160&q=80';

function sanitizeProfileData<T extends Record<string, unknown>>(obj: T): T {
  const cleaned: Record<string, unknown> = {};
  Object.entries(obj).forEach(([key, value]) => {
    if (value !== undefined) {
      cleaned[key] = value;
    }
  });
  return cleaned as T;
}

function emitLocalProfileUpdate(profile: UserProfile) {
  if (typeof window !== 'undefined') {
    try {
      const clean = sanitizeProfileData(profile as unknown as Record<string, unknown>);
      localStorage.setItem('wc_cached_profile', JSON.stringify(clean));
      window.dispatchEvent(new CustomEvent('wc_profile_updated', { detail: profile }));
    } catch {
      // ignore
    }
  }
}

export function normalizeUserProfile(raw: Partial<UserProfile> | null | undefined, fallbackUid: string): UserProfile {
  const resolvedUid =
    raw?.uid ||
    (raw as { id?: string } | undefined)?.id ||
    auth.currentUser?.uid ||
    fallbackUid;
  const countryCode = raw?.countryCode || 'TN';
  const countryInfo = getCountryByCode(countryCode);

  const rawGamesWon =
    typeof raw?.gamesWon === 'number'
      ? raw.gamesWon
      : typeof raw?.victories === 'number'
      ? raw.victories
      : 0;

  const rawVictories =
    typeof raw?.victories === 'number'
      ? raw.victories
      : rawGamesWon;

  const xpVal = typeof raw?.xp === 'number' ? raw.xp : 0;
  const computedLevel = calculateLevel(xpVal).level;
  const levelVal = typeof raw?.level === 'number' ? Math.max(raw.level, computedLevel) : computedLevel;

  const lastAttempt = raw?.lastAttemptDate || raw?.lastDailyChallengeDate;

  return {
    uid: resolvedUid,
    username: raw?.username || `Explorer_${resolvedUid.slice(0, 4)}`,
    email: raw?.email,
    avatar: raw?.avatar || DEFAULT_AVATAR_URL,
    countryCode,
    countryName: raw?.countryName || countryInfo?.name || 'Tunisia',
    countryFlag: raw?.countryFlag || countryInfo?.flag || '🇹🇳',
    bio: raw?.bio || 'Passionate world traveler and quiz challenger!',
    preferredLanguage: raw?.preferredLanguage || 'English',
    age: raw?.age,
    level: levelVal,
    xp: xpVal,
    coins: typeof raw?.coins === 'number' ? raw.coins : 100,
    gamesPlayed: typeof raw?.gamesPlayed === 'number' ? raw.gamesPlayed : 0,
    gamesWon: rawGamesWon,
    victories: rawVictories,
    discoveredCountries: Array.isArray(raw?.discoveredCountries) ? raw.discoveredCountries : [countryCode],
    unlockedBadges: Array.isArray(raw?.unlockedBadges) ? raw.unlockedBadges : [],
    dailyStreak: typeof raw?.dailyStreak === 'number' ? raw.dailyStreak : 1,
    lastDailyChallengeDate: lastAttempt,
    lastAttemptDate: lastAttempt,
    dailyQuestCompleted: raw?.dailyQuestCompleted ?? Boolean(lastAttempt === getTodayDateString()),
    lastDailyScore: typeof raw?.lastDailyScore === 'number' ? raw.lastDailyScore : undefined,
    role: raw?.role || 'user',
    createdAt: raw?.createdAt || new Date().toISOString(),
    lastActiveAt: raw?.lastActiveAt || new Date().toISOString(),
  };
}

export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  const targetUid = auth.currentUser?.uid || uid;
  if (!targetUid) return null;
  if (targetUid.startsWith('guest_') || !auth.currentUser) {
    if (typeof window !== 'undefined') {
      try {
        const cached = localStorage.getItem('wc_cached_profile');
        if (cached) {
          const parsed = JSON.parse(cached) as Partial<UserProfile>;
          return normalizeUserProfile(parsed, targetUid);
        }
      } catch {
        // ignore
      }
    }
    return null;
  }
  try {
    const snap = await getDoc(doc(db, 'users', targetUid));
    if (snap.exists()) {
      return normalizeUserProfile(snap.data() as Partial<UserProfile>, snap.id || targetUid);
    }
    return null;
  } catch (error) {
    console.warn(`Could not load profile for ${targetUid} from Firestore:`, error);
    if (typeof window !== 'undefined') {
      try {
        const cached = localStorage.getItem('wc_cached_profile');
        if (cached) {
          const parsed = JSON.parse(cached) as Partial<UserProfile>;
          return normalizeUserProfile(parsed, targetUid);
        }
      } catch {
        // ignore
      }
    }
    return null;
  }
}

export function subscribeToUserProfile(uid: string, callback: (profile: UserProfile | null) => void) {
  const targetUid = auth.currentUser?.uid || uid;
  const handleLocalEvent = (e: Event) => {
    const customEvent = e as CustomEvent<UserProfile>;
    if (customEvent.detail) {
      callback(normalizeUserProfile(customEvent.detail, targetUid));
    }
  };

  if (typeof window !== 'undefined') {
    window.addEventListener('wc_profile_updated', handleLocalEvent);
  }

  let unsubFirestore: (() => void) | null = null;
  if (targetUid && !targetUid.startsWith('guest_') && auth.currentUser) {
    unsubFirestore = onSnapshot(
      doc(db, 'users', targetUid),
      (snap) => {
        if (snap.exists()) {
          const normalized = normalizeUserProfile(snap.data() as Partial<UserProfile>, snap.id || targetUid);
          if (typeof window !== 'undefined') {
            try {
              localStorage.setItem(
                'wc_cached_profile',
                JSON.stringify(sanitizeProfileData(normalized as unknown as Record<string, unknown>))
              );
            } catch {
              // ignore
            }
          }
          callback(normalized);
        }
      },
      (error) => {
        console.warn(`Profile snapshot warning for ${targetUid}:`, error);
      }
    );
  }

  return () => {
    if (typeof window !== 'undefined') {
      window.removeEventListener('wc_profile_updated', handleLocalEvent);
    }
    if (unsubFirestore) unsubFirestore();
  };
}

export async function createUserProfile(profile: UserProfile): Promise<void> {
  const normalized = normalizeUserProfile(profile, profile?.uid || auth.currentUser?.uid || '');
  if (!normalized.uid) return;

  const cleanProfile = sanitizeProfileData(normalized as unknown as Record<string, unknown>);
  emitLocalProfileUpdate(normalized);

  if (normalized.uid.startsWith('guest_') || !auth.currentUser) return;
  try {
    await setDoc(doc(db, 'users', normalized.uid), cleanProfile, { merge: true });
  } catch (error) {
    console.warn(`Could not write user profile to Firestore:`, error);
  }
}

export async function updateUserProfile(uid: string, updates: Partial<UserProfile>): Promise<void> {
  const targetUid = auth.currentUser?.uid || uid;
  if (!targetUid) return;
  const cleanUpdates = sanitizeProfileData(updates as Record<string, unknown>);

  // Optimistically update local cached profile so UI refreshes immediately
  if (typeof window !== 'undefined') {
    try {
      const cached = localStorage.getItem('wc_cached_profile');
      const parsed = cached ? JSON.parse(cached) : {};
      const updated = normalizeUserProfile({ ...parsed, ...cleanUpdates }, targetUid);
      emitLocalProfileUpdate(updated);
    } catch {
      // ignore
    }
  }

  if (targetUid.startsWith('guest_') || !auth.currentUser) return;
  try {
    await setDoc(doc(db, 'users', targetUid), cleanUpdates, { merge: true });
  } catch (error) {
    console.warn(`Could not update user profile in Firestore:`, error);
  }
}

export async function markDailyQuestAttempted(uid: string, score?: number): Promise<void> {
  const targetUid = auth.currentUser?.uid || uid;
  const todayStr = getTodayDateString();

  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(`wc_daily_attempt_${targetUid}`, todayStr);
      if (uid && uid !== targetUid) {
        localStorage.setItem(`wc_daily_attempt_${uid}`, todayStr);
      }
    } catch {
      // ignore
    }
  }

  const updates: Partial<UserProfile> = {
    lastAttemptDate: todayStr,
    lastDailyChallengeDate: todayStr,
    dailyQuestCompleted: true,
    ...(typeof score === 'number' ? { lastDailyScore: score } : {}),
    lastActiveAt: new Date().toISOString(),
  };

  await updateUserProfile(targetUid, updates);
}

export async function awardGameResults(
  uid: string,
  isWinner: boolean,
  xpEarned: number,
  coinsEarned: number,
  opponentCountryCode?: string,
  opponentUsername?: string,
  opponentAvatar?: string,
  extraUpdates?: { isDailyQuest?: boolean; dailyScore?: number }
): Promise<{ leveledUp: boolean; newLevel: number; newlyUnlockedCountry?: string; newBadges: string[] }> {
  const targetUid = auth.currentUser?.uid || uid;
  const current = (await getUserProfile(targetUid)) || normalizeUserProfile({ uid: targetUid }, targetUid);

  const oldLevel = calculateLevel(current.xp).level;
  const baseNewXp = (current.xp || 0) + xpEarned;

  const gamesPlayed = (current.gamesPlayed || 0) + 1;
  const gamesWon = (current.gamesWon || 0) + (isWinner ? 1 : 0);
  const newCoins = (current.coins || 0) + coinsEarned;

  const discoveredCountries = [...(current.discoveredCountries || [])];
  let newlyUnlockedCountry: string | undefined;

  if (opponentCountryCode && !discoveredCountries.includes(opponentCountryCode.toUpperCase())) {
    const code = opponentCountryCode.toUpperCase();
    discoveredCountries.push(code);
    newlyUnlockedCountry = code;

    // Create passport stamp in subcollection
    const countryInfo = getCountryByCode(code);
    const stamp: PassportStamp = {
      id: `${targetUid}_${code}`,
      userId: targetUid,
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

    // Save locally
    if (typeof window !== 'undefined') {
      try {
        const localKey = `wc_stamps_${targetUid}`;
        const existing: PassportStamp[] = JSON.parse(localStorage.getItem(localKey) || '[]');
        if (!existing.some((s) => s.countryCode === code)) {
          existing.push(stamp);
          localStorage.setItem(localKey, JSON.stringify(existing));
        }
      } catch {
        // ignore
      }
    }

    if (auth.currentUser && !targetUid.startsWith('guest_')) {
      try {
        await setDoc(doc(db, 'users', targetUid, 'passport', code), stamp);
      } catch {
        // Non-fatal if stamp write fails
      }
    }
  }

  // Check achievements/badges
  const unlockedBadges = [...(current.unlockedBadges || [])];
  const newBadges: string[] = [];

  if (gamesPlayed >= 1 && !unlockedBadges.includes('first_friend')) {
    unlockedBadges.push('first_friend');
    newBadges.push('first_friend');
  }
  if (discoveredCountries.length >= 1 && !unlockedBadges.includes('first_journey')) {
    unlockedBadges.push('first_journey');
    newBadges.push('first_journey');
  }
  if (discoveredCountries.length >= 5 && !unlockedBadges.includes('world_traveler')) {
    unlockedBadges.push('world_traveler');
    newBadges.push('world_traveler');
  }
  if (discoveredCountries.length >= 10 && !unlockedBadges.includes('global_explorer')) {
    unlockedBadges.push('global_explorer');
    newBadges.push('global_explorer');
  }
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

  const totalXpDelta = xpEarned + bonusBadgeXp;
  const finalXp = baseNewXp + bonusBadgeXp;
  const finalLevel = calculateLevel(finalXp).level;
  const todayStr = getTodayDateString();

  // Immediately update local cached profile and emit event for instant UI feedback
  const nextLocalProfile: UserProfile = normalizeUserProfile(
    {
      ...current,
      uid: targetUid,
      xp: finalXp,
      level: finalLevel,
      coins: newCoins,
      gamesPlayed,
      gamesWon,
      victories: gamesWon,
      discoveredCountries,
      unlockedBadges,
      ...(extraUpdates?.isDailyQuest
        ? {
            lastAttemptDate: todayStr,
            lastDailyChallengeDate: todayStr,
            dailyQuestCompleted: true,
            lastDailyScore: extraUpdates.dailyScore,
            dailyStreak: (current.dailyStreak || 1) + 1,
          }
        : {}),
      lastActiveAt: new Date().toISOString(),
    },
    targetUid
  );
  emitLocalProfileUpdate(nextLocalProfile);

  // Perform atomic Firestore update using increment()
  if (auth.currentUser && !targetUid.startsWith('guest_')) {
    const userRef = doc(db, 'users', targetUid);
    const atomicUpdates: Record<string, unknown> = {
      uid: targetUid,
      xp: increment(totalXpDelta),
      coins: increment(coinsEarned),
      gamesPlayed: increment(1),
      gamesWon: increment(isWinner ? 1 : 0),
      victories: increment(isWinner ? 1 : 0),
      level: finalLevel,
      discoveredCountries: discoveredCountries.length > 0 ? arrayUnion(...discoveredCountries) : discoveredCountries,
      unlockedBadges: unlockedBadges.length > 0 ? arrayUnion(...unlockedBadges) : unlockedBadges,
      ...(extraUpdates?.isDailyQuest
        ? {
            lastAttemptDate: todayStr,
            lastDailyChallengeDate: todayStr,
            dailyQuestCompleted: true,
            ...(typeof extraUpdates.dailyScore === 'number' ? { lastDailyScore: extraUpdates.dailyScore } : {}),
            dailyStreak: increment(1),
          }
        : {}),
      lastActiveAt: new Date().toISOString(),
    };

    try {
      await updateDoc(userRef, sanitizeProfileData(atomicUpdates));
    } catch {
      // Fallback if document does not exist yet
      try {
        await setDoc(
          userRef,
          sanitizeProfileData(nextLocalProfile as unknown as Record<string, unknown>),
          { merge: true }
        );
      } catch (err) {
        console.warn('Could not persist atomic game results to Firestore:', err);
      }
    }
  }

  return {
    leveledUp: finalLevel > oldLevel,
    newLevel: finalLevel,
    newlyUnlockedCountry,
    newBadges,
  };
}

export async function getUserPassportStamps(uid: string): Promise<PassportStamp[]> {
  if (!uid) return [];
  if (uid.startsWith('guest_') || !auth.currentUser) {
    if (typeof window !== 'undefined') {
      try {
        const local = localStorage.getItem(`wc_stamps_${uid}`);
        if (local) return JSON.parse(local);
      } catch {
        // ignore
      }
    }
    return [];
  }
  const path = `users/${uid}/passport`;
  try {
    const snap = await getDocs(collection(db, 'users', uid, 'passport'));
    const stamps = snap.docs.map((d) => d.data() as PassportStamp);
    if (typeof window !== 'undefined' && stamps.length > 0) {
      try {
        localStorage.setItem(`wc_stamps_${uid}`, JSON.stringify(stamps));
      } catch {
        // ignore
      }
    }
    return stamps;
  } catch (error) {
    console.warn(`Could not load stamps for ${uid} from Firestore:`, error);
    if (typeof window !== 'undefined') {
      try {
        const local = localStorage.getItem(`wc_stamps_${uid}`);
        if (local) return JSON.parse(local);
      } catch {
        // ignore
      }
    }
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
