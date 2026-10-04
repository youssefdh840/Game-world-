import { Question, GameCategory, QuestionDifficulty, QuestionSubCategory } from '../types/game';
import { QUESTIONS } from './questionData';
import { COUNTRIES, getCountryByCode } from './countryData';
import { db } from './firebase';
import { collection, getDocs, query, where, limit as firestoreLimit } from 'firebase/firestore';

// In-memory + sessionStorage tracker for deduplication within the current session
const SESSION_CACHE_KEY = 'wc_recent_questions_cache';
const MAX_CACHE_SIZE = 120;

function getSessionQuestionHistory(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = sessionStorage.getItem(SESSION_CACHE_KEY);
    if (raw) {
      const arr: string[] = JSON.parse(raw);
      return new Set(arr);
    }
  } catch {
    // ignore
  }
  return new Set();
}

export function recordQuestionsAnsweredInSession(questionIds: string[]): void {
  if (typeof window === 'undefined' || !questionIds || questionIds.length === 0) return;
  try {
    const history = getSessionQuestionHistory();
    questionIds.forEach((id) => history.add(id));
    // Keep within max cache size by dropping oldest if needed
    const arr = Array.from(history);
    const trimmed = arr.length > MAX_CACHE_SIZE ? arr.slice(arr.length - MAX_CACHE_SIZE) : arr;
    sessionStorage.setItem(SESSION_CACHE_KEY, JSON.stringify(trimmed));
  } catch {
    // ignore
  }
}

export function clearSessionQuestionHistory(): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(SESSION_CACHE_KEY);
  } catch {
    // ignore
  }
}

// Decode HTML entities commonly returned by OpenTDB (e.g. &quot;, &#039;, &amp;)
function decodeHtmlEntities(str: string): string {
  if (!str) return '';
  return str
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&eacute;/g, 'é')
    .replace(/&uuml;/g, 'ü')
    .replace(/&ntilde;/g, 'ñ')
    .replace(/&deg;/g, '°')
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(Number(dec)));
}

// Fisher-Yates shuffle
export function shuffleArray<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// Deterministic seeded shuffle so both multiplayer clients see identical randomized option orders for any given roomId + questionId
export function shuffleArraySeeded<T>(arr: T[], seedStr: string): T[] {
  const copy = [...arr];
  let hash = 2166136261;
  for (let i = 0; i < seedStr.length; i++) {
    hash ^= seedStr.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const nextRand = () => {
    hash += 0x6d2b79f5;
    let t = hash;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(nextRand() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function shuffleQuestionOptions(q: Question, seed?: string): Question {
  if (!q || !Array.isArray(q.options) || q.options.length <= 1) return q;
  const shuffledOptions = seed ? shuffleArraySeeded(q.options, seed) : shuffleArray(q.options);
  return {
    ...q,
    options: shuffledOptions,
  };
}

// Map country names mentioned in OpenTDB questions to ISO country codes
function detectCountryFromText(text: string): { code: string; name: string } | null {
  const lower = text.toLowerCase();
  for (const c of COUNTRIES) {
    if (lower.includes(c.name.toLowerCase()) || lower.includes(c.capital.toLowerCase())) {
      return { code: c.code, name: c.name };
    }
  }
  return null;
}

/**
 * Fetch dynamic questions from Open Trivia Database API (Geography Category: 22)
 */
async function fetchOpenTDBQuestions(count: number = 3): Promise<Question[]> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2800); // 2.8s strict timeout

    const url = `https://opentdb.com/api.php?amount=${count}&category=22&type=multiple`;
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!res.ok) return [];
    const data = await res.json();
    if (data.response_code !== 0 || !Array.isArray(data.results)) return [];

    return data.results.map((item: any, idx: number): Question => {
      const prompt = decodeHtmlEntities(item.question);
      const correctAnswer = decodeHtmlEntities(item.correct_answer);
      const incorrect = (item.incorrect_answers || []).map((ans: string) => decodeHtmlEntities(ans));
      const options = shuffleArray([correctAnswer, ...incorrect]);

      const detected = detectCountryFromText(prompt + ' ' + correctAnswer);

      const diff: QuestionDifficulty =
        item.difficulty === 'hard' ? 'hard' : item.difficulty === 'medium' ? 'medium' : 'easy';

      return {
        id: `opentdb_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 6)}`,
        category: 'country_quiz',
        countryCode: detected ? detected.code : 'GLOBAL',
        countryName: detected ? detected.name : 'Worldwide Geography',
        difficulty: diff,
        prompt,
        options,
        correctAnswer,
        explanation: `World Geography Fact: The correct answer is ${correctAnswer}.`,
        active: true,
        subCategory: 'Geography',
        source: 'opentdb',
      };
    });
  } catch {
    return [];
  }
}

/**
 * Fetch community-created questions from Firestore `questions` collection
 */
async function fetchFirestoreQuestions(
  category?: GameCategory | 'mixed',
  countryCode?: string,
  limitCount: number = 5
): Promise<Question[]> {
  try {
    const questionsRef = collection(db, 'questions');
    let q = query(questionsRef, where('active', '==', true), firestoreLimit(limitCount * 2));

    if (countryCode) {
      q = query(
        questionsRef,
        where('countryCode', '==', countryCode.toUpperCase()),
        where('active', '==', true),
        firestoreLimit(limitCount * 2)
      );
    } else if (category && category !== 'mixed') {
      q = query(
        questionsRef,
        where('category', '==', category),
        where('active', '==', true),
        firestoreLimit(limitCount * 2)
      );
    }

    const snap = await getDocs(q);
    const result: Question[] = [];
    snap.forEach((doc) => {
      const data = doc.data() as Question;
      result.push({
        ...data,
        id: doc.id,
        source: 'firestore',
      });
    });

    return result;
  } catch {
    return [];
  }
}

export interface QuestionFilterOptions {
  count?: number;
  category?: GameCategory | 'mixed';
  countryCode?: string;
  difficulty?: QuestionDifficulty;
  userLevel?: number;
  allowExternalApi?: boolean;
}

/**
 * Main Question Selector:
 * 1. Checks user session history to prevent repeating recently answered questions.
 * 2. Matches target country if specified (e.g. from Explore or Passport duel).
 * 3. Matches category if specified (e.g. food, words, music).
 * 4. Merges with community Firestore questions & live external OpenTDB if requested.
 * 5. Guarantees variety, freshness, and exactly the requested count.
 */
export async function fetchDynamicGameQuestions(
  options: QuestionFilterOptions = {}
): Promise<Question[]> {
  const {
    count = 5,
    category = 'mixed',
    countryCode,
    difficulty,
    userLevel,
    allowExternalApi = true,
  } = options;

  const sessionHistory = getSessionQuestionHistory();

  // 1. Filter local dataset based on criteria
  let pool = [...QUESTIONS];

  // Country filter (if specified e.g. 'JP', 'TN', 'FR')
  if (countryCode && countryCode !== 'ALL') {
    const targetCode = countryCode.toUpperCase();
    const countrySpecific = pool.filter((q) => q.countryCode.toUpperCase() === targetCode);
    if (countrySpecific.length >= count) {
      pool = countrySpecific;
    } else if (countrySpecific.length > 0) {
      // Prioritize country-specific, then fill with general
      const others = pool.filter((q) => q.countryCode.toUpperCase() !== targetCode);
      pool = [...countrySpecific, ...others];
    }
  }

  // Category filter
  if (category && category !== 'mixed') {
    const catFiltered = pool.filter((q) => q.category === category);
    if (catFiltered.length >= count) {
      pool = catFiltered;
    }
  }

  // Difficulty filter (or adaptive based on userLevel)
  if (difficulty) {
    const diffFiltered = pool.filter((q) => q.difficulty === difficulty);
    if (diffFiltered.length >= count) {
      pool = diffFiltered;
    }
  } else if (userLevel && userLevel > 1) {
    // Adaptive difficulty: higher levels get more medium/hard questions
    if (userLevel >= 7) {
      const advanced = pool.filter((q) => q.difficulty === 'hard' || q.difficulty === 'medium');
      if (advanced.length >= count) pool = advanced;
    } else if (userLevel >= 3) {
      const intermediate = pool.filter((q) => q.difficulty === 'medium' || q.difficulty === 'easy');
      if (intermediate.length >= count) pool = intermediate;
    }
  }

  // 2. Separate into unseen vs seen questions in this session
  const unseenPool = pool.filter((q) => !sessionHistory.has(q.id));
  const seenPool = pool.filter((q) => sessionHistory.has(q.id));

  let chosen: Question[] = [];

  // Pick as many unseen questions as possible
  const shuffledUnseen = shuffleArray(unseenPool);
  chosen.push(...shuffledUnseen.slice(0, count));

  // If we still need more questions, try fetching from Firestore or OpenTDB
  if (chosen.length < count && allowExternalApi) {
    // Try Firestore community collection first
    const firestoreQs = await fetchFirestoreQuestions(category, countryCode, count - chosen.length);
    const freshFirestore = firestoreQs.filter(
      (fq) => !sessionHistory.has(fq.id) && !chosen.some((c) => c.id === fq.id)
    );
    chosen.push(...freshFirestore.slice(0, count - chosen.length));

    // Try OpenTDB if still needed and general category is suitable
    if (chosen.length < count && (category === 'mixed' || category === 'country_quiz') && !countryCode) {
      const openTdbQs = await fetchOpenTDBQuestions(count - chosen.length);
      const freshOpenTdb = openTdbQs.filter(
        (ot) => !sessionHistory.has(ot.id) && !chosen.some((c) => c.id === ot.id)
      );
      chosen.push(...freshOpenTdb.slice(0, count - chosen.length));
    }
  }

  // If still below required count, recycle from seen pool (oldest seen)
  if (chosen.length < count) {
    const needed = count - chosen.length;
    const shuffledSeen = shuffleArray(seenPool.filter((q) => !chosen.some((c) => c.id === q.id)));
    chosen.push(...shuffledSeen.slice(0, needed));
  }

  // Final fallback: if somehow still under count, duplicate/fallback safely
  if (chosen.length < count) {
    const allShuffled = shuffleArray(QUESTIONS);
    for (const q of allShuffled) {
      if (chosen.length >= count) break;
      if (!chosen.some((c) => c.id === q.id)) {
        chosen.push(q);
      }
    }
  }

  // Record chosen IDs into session cache so subsequent games in this session don't repeat them
  recordQuestionsAnsweredInSession(chosen.map((q) => q.id));

  // Randomize multiple-choice options for every question so the correct answer is distributed across A, B, C, and D
  return chosen.slice(0, count).map((q) => shuffleQuestionOptions(q));
}
