export type GameCategory =
  | 'country_quiz'
  | 'guess_word'
  | 'mystery_food'
  | 'music_culture'
  | 'world_map'
  | 'cultural_mime'
  | 'duel';

export interface UserProfile {
  uid: string;
  username: string;
  email?: string;
  avatar: string;
  countryCode: string;
  countryName: string;
  countryFlag: string;
  bio: string;
  preferredLanguage: string;
  age?: number;
  level: number;
  xp: number;
  coins: number;
  gamesPlayed: number;
  gamesWon: number;
  discoveredCountries: string[]; // List of country codes
  unlockedBadges: string[];
  dailyStreak: number;
  lastDailyChallengeDate?: string;
  role?: 'user' | 'admin';
  createdAt: string;
  lastActiveAt: string;
}

export interface CountryData {
  code: string; // ISO 2-letter uppercase e.g. "TN", "FR", "JP"
  name: string;
  flag: string;
  capital: string;
  continent: 'Africa' | 'Europe' | 'Asia' | 'Americas' | 'Oceania';
  languages: string[];
  traditionalFoods: string[];
  landmarks: string[];
  facts: string[];
  badgeTitle: string;
  population?: string;
  mapCoords?: { x: number; y: number }; // Relative percentage for map pin (0-100)
}

export type QuestionDifficulty = 'easy' | 'medium' | 'hard';
export type QuestionSubCategory =
  | 'Culture'
  | 'Geography'
  | 'History'
  | 'Landmarks'
  | 'Food'
  | 'Music'
  | 'Language'
  | 'Traditions';

export interface Question {
  id: string;
  category: GameCategory;
  countryCode: string;
  countryName: string;
  difficulty: QuestionDifficulty;
  prompt: string;
  options: string[];
  correctAnswer: string;
  explanation: string;
  imageUrl?: string;
  audioNote?: string; // Melodic pattern or tone signature
  targetCountryCode?: string; // For map questions
  active: boolean;
  culturalNote?: string;
  subCategory?: QuestionSubCategory;
  source?: 'curated' | 'opentdb' | 'firestore' | 'community';
}

export type GameRoomStatus = 'waiting' | 'starting' | 'playing' | 'round_result' | 'finished';

export interface GameRoom {
  id: string;
  hostId: string;
  hostUsername: string;
  hostCountryCode: string;
  hostCountryFlag: string;
  hostAvatar: string;
  hostScore: number;
  hostAnswer?: string | null;
  hostAnswerTime?: number | null;
  hostReady: boolean;

  guestId: string;
  guestUsername: string;
  guestCountryCode: string;
  guestCountryFlag: string;
  guestAvatar: string;
  guestScore: number;
  guestAnswer?: string | null;
  guestAnswerTime?: number | null;
  guestReady: boolean;

  gameMode: GameCategory | 'mixed';
  targetCountryCode?: string;
  status: GameRoomStatus;
  currentRound: number;
  totalRounds: number;
  questionIds: string[];
  questions?: Question[];
  currentQuestion?: Question;
  winnerId?: string | 'tie' | null;
  roundStartedAt?: number;
  roundStartTime?: number;
  isBotOpponent?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessage {
  id: string;
  roomId: string;
  senderId: string;
  senderUsername: string;
  senderAvatar: string;
  senderCountryFlag: string;
  text: string;
  type: 'text' | 'emoji' | 'system';
  createdAt: string;
}

export interface PassportStamp {
  id: string;
  userId: string;
  countryCode: string;
  countryName: string;
  countryFlag: string;
  capital: string;
  continent: string;
  unlockedAt: string;
  metPlayerUsername: string;
  metPlayerAvatar: string;
  gamesPlayedWith: number;
  scoreAchieved: number;
}

export interface Badge {
  id: string;
  title: string;
  description: string;
  icon: string;
  xpReward: number;
  requirement: string;
}

export interface Friendship {
  id: string;
  requesterId: string;
  requesterUsername: string;
  requesterCountryFlag: string;
  requesterAvatar: string;
  receiverId: string;
  receiverUsername: string;
  receiverCountryFlag: string;
  receiverAvatar: string;
  status: 'pending' | 'accepted' | 'declined';
  createdAt: string;
  updatedAt: string;
}

export interface ReportItem {
  id: string;
  reporterId: string;
  reporterUsername: string;
  reportedUserId: string;
  reportedUsername: string;
  reason: string;
  details?: string;
  status: 'pending' | 'reviewed' | 'resolved';
  createdAt: string;
}

export interface DailyChallenge {
  date: string;
  country: CountryData;
  questions: Question[];
  rewardXp: number;
  rewardCoins: number;
}
