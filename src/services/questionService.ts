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

const UNIFIED_QUIZ_CATEGORIES = new Set<string>([
  'cultural_quiz',
  'mixed',
  'country_quiz',
  'mystery_food',
  'guess_word',
  'music_culture',
  'cultural_mime',
]);

export function isUnifiedCulturalQuizMode(category?: GameCategory | 'mixed'): boolean {
  if (!category) return true;
  return UNIFIED_QUIZ_CATEGORIES.has(category);
}

/**
 * Generates picture-based Flag & Country identification questions from COUNTRIES catalog
 * so the unified Cultural Quiz includes visual flag questions alongside Landmarks, Food, Music, Traditions, and Languages.
 */
function buildFlagQuizQuestions(): Question[] {
  const spotlightCodes = [
    'TN', 'FR', 'JP', 'BR', 'MX', 'IT', 'EG', 'MA', 'CA', 'DE',
    'ES', 'IN', 'KR', 'TR', 'GR', 'AR', 'NG', 'ZA', 'TH', 'AU',
    'SE', 'NO', 'PE', 'CO', 'KE', 'SN', 'LB', 'SA', 'VN', 'PT',
  ];

  const flagQuestions: Question[] = [];
  for (const code of spotlightCodes) {
    const country = getCountryByCode(code);
    if (!country) continue;

    // Pick 3 other countries preferably from the same continent for plausible distractors
    const sameContinent = COUNTRIES.filter(
      (c) => c.code !== country.code && c.continent === country.continent
    );
    const otherCountries = COUNTRIES.filter((c) => c.code !== country.code);
    const distractorSource = sameContinent.length >= 3 ? sameContinent : otherCountries;

    const distractors = shuffleArraySeeded(distractorSource, `flag_dist_${country.code}`)
      .slice(0, 3)
      .map((c) => c.name);

    const capitalHint = country.capital && country.capital !== country.name ? ` (Hint: Its capital is ${country.capital})` : '';
    flagQuestions.push({
      id: `flag_quiz_${country.code.toLowerCase()}`,
      category: 'cultural_quiz',
      countryCode: country.code,
      countryName: country.name,
      difficulty: 'easy',
      subCategory: 'Flags',
      imageUrl: `https://flagcdn.com/w320/${country.code.toLowerCase()}.png`,
      prompt: `Which country does this national flag belong to?${capitalHint}`,
      options: [country.name, ...distractors],
      correctAnswer: country.name,
      explanation: `This is the official national flag of ${country.name} (${country.flag})${country.capital && country.capital !== country.name ? `, whose capital is ${country.capital}` : ''}.`,
      active: true,
      source: 'curated',
    });
  }

  return flagQuestions;
}

const FLAG_QUIZ_QUESTIONS: Question[] = buildFlagQuizQuestions();

/**
 * Deterministically scrambles a word so that the letter order is never identical to the original word
 * and both multiplayer players see the exact same scrambled letters.
 */
export function scrambleWordDeterministic(word: string, seedStr: string): string {
  const clean = word.toUpperCase().replace(/[^A-Z]/g, '');
  if (clean.length <= 1) return clean;
  const chars = clean.split('');
  let scrambled = shuffleArraySeeded(chars, seedStr).join('');

  // Ensure scrambled sequence is not identical to the original word
  let attempt = 1;
  while (scrambled === clean && attempt < 12) {
    scrambled = shuffleArraySeeded(chars, `${seedStr}_retry_${attempt}`).join('');
    attempt++;
  }
  if (scrambled === clean && chars.length > 1) {
    // Swap first and last letter as guaranteed fallback
    const fallback = [...chars];
    const tmp = fallback[0];
    fallback[0] = fallback[fallback.length - 1];
    fallback[fallback.length - 1] = tmp;
    scrambled = fallback.join('');
  }
  return scrambled;
}

interface ScrambleEntry {
  word: string;
  countryCode: string;
  countryName: string;
  subCategory: QuestionSubCategory;
  hint: string;
  explanation: string;
  difficulty: QuestionDifficulty;
}

const WORD_SCRAMBLE_CATALOG: ScrambleEntry[] = [
  {
    word: 'TUNISIA',
    countryCode: 'TN',
    countryName: 'Tunisia',
    subCategory: 'Geography',
    hint: 'North African nation home to ancient Carthage and Sidi Bou Said 🇹🇳',
    explanation: 'Tunisia is the northernmost country in Africa, renowned for Carthage and Mediterranean heritage.',
    difficulty: 'easy',
  },
  {
    word: 'CARTHAGE',
    countryCode: 'TN',
    countryName: 'Tunisia',
    subCategory: 'History',
    hint: 'Legendary ancient Phoenician civilization located near modern-day Tunis 🏛️',
    explanation: 'Carthage was one of the most affluent and powerful cities of the ancient Mediterranean world.',
    difficulty: 'medium',
  },
  {
    word: 'COUSCOUS',
    countryCode: 'TN',
    countryName: 'Tunisia',
    subCategory: 'Food',
    hint: 'UNESCO-listed North African dish of steamed semolina granules 🍲',
    explanation: 'Couscous is the national dish of Tunisia and the Maghreb region, traditionally served with savory stew.',
    difficulty: 'easy',
  },
  {
    word: 'TOKYO',
    countryCode: 'JP',
    countryName: 'Japan',
    subCategory: 'Geography',
    hint: 'Bustling capital city of Japan 🇯🇵',
    explanation: 'Tokyo is Japan’s capital and the world’s most populous metropolitan area.',
    difficulty: 'easy',
  },
  {
    word: 'KIMONO',
    countryCode: 'JP',
    countryName: 'Japan',
    subCategory: 'Traditions',
    hint: 'Traditional Japanese T-shaped wrapped garment worn at festivals 👘',
    explanation: 'The kimono is Japan’s iconic national attire, worn for formal celebrations and tea ceremonies.',
    difficulty: 'easy',
  },
  {
    word: 'RAMEN',
    countryCode: 'JP',
    countryName: 'Japan',
    subCategory: 'Food',
    hint: 'Famous Japanese noodle soup served in savory broth 🍜',
    explanation: 'Ramen is a beloved Japanese dish featuring wheat noodles in rich meat or miso broth.',
    difficulty: 'easy',
  },
  {
    word: 'SAMURAI',
    countryCode: 'JP',
    countryName: 'Japan',
    subCategory: 'History',
    hint: 'Historic noble warrior class of feudal Japan ⚔️',
    explanation: 'Samurai followed the Bushido code of honor, discipline, and martial mastery in historical Japan.',
    difficulty: 'medium',
  },
  {
    word: 'PARIS',
    countryCode: 'FR',
    countryName: 'France',
    subCategory: 'Geography',
    hint: 'Capital of France, known as the City of Light 🇫🇷',
    explanation: 'Paris is the capital of France, famed for the Eiffel Tower, the Louvre, and café culture.',
    difficulty: 'easy',
  },
  {
    word: 'LOUVRE',
    countryCode: 'FR',
    countryName: 'France',
    subCategory: 'Landmarks',
    hint: 'Historic Paris art museum housing the Mona Lisa 🎨',
    explanation: 'The Louvre in Paris is the world’s largest art museum and a historic monument on the Seine.',
    difficulty: 'medium',
  },
  {
    word: 'BRAZIL',
    countryCode: 'BR',
    countryName: 'Brazil',
    subCategory: 'Geography',
    hint: 'Largest country in South America, famous for Carnival and the Amazon 🇧🇷',
    explanation: 'Brazil spans half of South America’s landmass and is home to the Amazon Rainforest.',
    difficulty: 'easy',
  },
  {
    word: 'SAMBA',
    countryCode: 'BR',
    countryName: 'Brazil',
    subCategory: 'Music',
    hint: 'Vibrant Brazilian musical genre and dance at the heart of Rio Carnival 💃',
    explanation: 'Samba is a rhythmic Afro-Brazilian music and dance style recognized worldwide as a symbol of Brazil.',
    difficulty: 'easy',
  },
  {
    word: 'AMAZON',
    countryCode: 'BR',
    countryName: 'Brazil',
    subCategory: 'Geography',
    hint: 'Vast South American tropical rainforest and river basin 🌿',
    explanation: 'The Amazon Rainforest holds the richest biodiversity on Earth.',
    difficulty: 'easy',
  },
  {
    word: 'CAIRO',
    countryCode: 'EG',
    countryName: 'Egypt',
    subCategory: 'Geography',
    hint: 'Capital city of Egypt set along the Nile River 🇪🇬',
    explanation: 'Cairo is the capital of Egypt and lies near the ancient Pyramids of Giza.',
    difficulty: 'easy',
  },
  {
    word: 'PYRAMIDS',
    countryCode: 'EG',
    countryName: 'Egypt',
    subCategory: 'Landmarks',
    hint: 'Monumental ancient royal tombs built at Giza in Egypt 🔺',
    explanation: 'The Great Pyramids of Giza are the oldest of the Seven Wonders of the Ancient World.',
    difficulty: 'medium',
  },
  {
    word: 'SPHINX',
    countryCode: 'EG',
    countryName: 'Egypt',
    subCategory: 'Landmarks',
    hint: 'Mythical limestone statue with a lion’s body and a pharaoh’s head in Giza 🦁',
    explanation: 'The Great Sphinx of Giza stands guard on the Giza Plateau in Egypt.',
    difficulty: 'medium',
  },
  {
    word: 'SEOUL',
    countryCode: 'KR',
    countryName: 'South Korea',
    subCategory: 'Geography',
    hint: 'Dynamic capital metropolis of South Korea 🇰🇷',
    explanation: 'Seoul blends ancient royal palaces like Gyeongbokgung with futuristic skyscrapers.',
    difficulty: 'easy',
  },
  {
    word: 'KIMCHI',
    countryCode: 'KR',
    countryName: 'South Korea',
    subCategory: 'Food',
    hint: 'Traditional Korean staple side dish of fermented cabbage and radishes 🥬',
    explanation: 'Kimchi is South Korea’s signature fermented dish and a UNESCO Intangible Cultural Heritage.',
    difficulty: 'easy',
  },
  {
    word: 'PIZZA',
    countryCode: 'IT',
    countryName: 'Italy',
    subCategory: 'Food',
    hint: 'World-famous Italian dish originating in Naples with dough, tomato, and mozzarella 🍕',
    explanation: 'Neapolitan pizza-making (Pizzaiuolo) is a celebrated Italian culinary art.',
    difficulty: 'easy',
  },
  {
    word: 'VENICE',
    countryCode: 'IT',
    countryName: 'Italy',
    subCategory: 'Geography',
    hint: 'Italian lagoon city built on canals and navigated by gondolas 🛶',
    explanation: 'Venice is renowned for its picturesque canals, Renaissance palaces, and Carnival masks.',
    difficulty: 'easy',
  },
  {
    word: 'MEXICO',
    countryCode: 'MX',
    countryName: 'Mexico',
    subCategory: 'Geography',
    hint: 'North American nation celebrated for Mayan temples, mariachi, and tacos 🇲🇽',
    explanation: 'Mexico is home to ancient Mesoamerican civilizations including the Maya and Aztecs.',
    difficulty: 'easy',
  },
  {
    word: 'TACOS',
    countryCode: 'MX',
    countryName: 'Mexico',
    subCategory: 'Food',
    hint: 'Iconic Mexican street food made with folded corn or wheat tortillas 🌮',
    explanation: 'Tacos are a foundational dish of Mexican cuisine enjoyed across the globe.',
    difficulty: 'easy',
  },
  {
    word: 'MADRID',
    countryCode: 'ES',
    countryName: 'Spain',
    subCategory: 'Geography',
    hint: 'Royal capital city of Spain located in the heart of the Iberian Peninsula 🇪🇸',
    explanation: 'Madrid is Spain’s capital, famous for the Prado Museum and Royal Palace.',
    difficulty: 'easy',
  },
  {
    word: 'PAELLA',
    countryCode: 'ES',
    countryName: 'Spain',
    subCategory: 'Food',
    hint: 'Traditional Spanish saffron rice dish originating from Valencia 🥘',
    explanation: 'Paella is cooked in a wide shallow pan with saffron, vegetables, and seafood or meats.',
    difficulty: 'medium',
  },
  {
    word: 'FLAMENCO',
    countryCode: 'ES',
    countryName: 'Spain',
    subCategory: 'Music',
    hint: 'Passionate Spanish art form of guitar, singing, and expressive dance 💃',
    explanation: 'Flamenco originated in Andalusia, southern Spain, and is recognized by UNESCO.',
    difficulty: 'medium',
  },
  {
    word: 'MOROCCO',
    countryCode: 'MA',
    countryName: 'Morocco',
    subCategory: 'Geography',
    hint: 'North African kingdom famous for Marrakech souks and the Atlas Mountains 🇲🇦',
    explanation: 'Morocco is known for its vibrant medinas, Sahara dunes, and Andalusian-Berber heritage.',
    difficulty: 'medium',
  },
  {
    word: 'TAGINE',
    countryCode: 'MA',
    countryName: 'Morocco',
    subCategory: 'Food',
    hint: 'Slow-cooked North African savory stew named after its conical earthenware pot 🍲',
    explanation: 'Tagine is a staple of Moroccan cuisine, slow-simmered with aromatic spices.',
    difficulty: 'medium',
  },
  {
    word: 'ATHENS',
    countryCode: 'GR',
    countryName: 'Greece',
    subCategory: 'Geography',
    hint: 'Historic capital of Greece crowned by the ancient Acropolis 🇬🇷',
    explanation: 'Athens is the birthplace of democracy and classical Greek philosophy.',
    difficulty: 'easy',
  },
  {
    word: 'TANGO',
    countryCode: 'AR',
    countryName: 'Argentina',
    subCategory: 'Music',
    hint: 'Expressive partner dance and musical style born in Buenos Aires 🇦🇷',
    explanation: 'Tango originated along the Río de la Plata and is Argentina’s most famous cultural export.',
    difficulty: 'easy',
  },
  {
    word: 'DIWALI',
    countryCode: 'IN',
    countryName: 'India',
    subCategory: 'Traditions',
    hint: 'Vibrant Indian Festival of Lights celebrated with clay lamps 🪔',
    explanation: 'Diwali symbolizes the spiritual victory of light over darkness across India.',
    difficulty: 'medium',
  },
  {
    word: 'BAKLAVA',
    countryCode: 'TR',
    countryName: 'Turkey',
    subCategory: 'Food',
    hint: 'Sweet layered pastry filled with chopped nuts and sweetened with syrup or honey 🍯',
    explanation: 'Baklava is a prized dessert across Turkish, Middle Eastern, and Mediterranean cuisines.',
    difficulty: 'medium',
  },
];

function buildWordScrambleQuestions(): Question[] {
  return WORD_SCRAMBLE_CATALOG.map((item) => {
    const cleanWord = item.word.toUpperCase().replace(/[^A-Z]/g, '');
    const scrambled = scrambleWordDeterministic(cleanWord, `word_scramble_${cleanWord}`);
    return {
      id: `scramble_${cleanWord.toLowerCase()}`,
      category: 'word_scramble',
      countryCode: item.countryCode,
      countryName: item.countryName,
      difficulty: item.difficulty,
      subCategory: item.subCategory,
      prompt: item.hint,
      scrambledWord: scrambled,
      options: scrambled.split(''),
      correctAnswer: cleanWord,
      explanation: item.explanation,
      active: true,
      source: 'curated',
    };
  });
}

const WORD_SCRAMBLE_QUESTIONS: Question[] = buildWordScrambleQuestions();

/**
 * Infer a normalized cultural topic bucket for balanced question distribution
 */
function getQuestionTopicBucket(q: Question): string {
  if (q.subCategory === 'Flags' || q.id.startsWith('flag_quiz_')) return 'Flags';
  if (q.subCategory === 'Landmarks') return 'Landmarks';
  if (q.category === 'mystery_food' || q.subCategory === 'Food') return 'Food';
  if (q.category === 'music_culture' || q.subCategory === 'Music') return 'Music';
  if (q.category === 'cultural_mime' || q.subCategory === 'Traditions') return 'Traditions';
  if (q.category === 'guess_word' || q.subCategory === 'Language') return 'Languages';
  return 'Country & Facts';
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
        category: 'cultural_quiz',
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
    } else if (category && !isUnifiedCulturalQuizMode(category)) {
      q = query(
        questionsRef,
        where('category', '==', category),
        where('active', '==', true),
        firestoreLimit(limitCount * 2)
      );
    }

    const snap = await Promise.race([
      getDocs(q),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 1800)),
    ]);
    if (!snap) return [];

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
 * 1. Consolidates all quiz categories (Flags, Landmarks, Food, Music, Traditions, Languages) into the unified Cultural Quiz.
 * 2. Checks user session history to prevent repeating recently answered questions.
 * 3. Matches target country if specified (e.g. from Explore or Passport duel).
 * 4. Dynamically balances question categories across rounds so every match has diverse cultural topics.
 * 5. Merges with community Firestore questions & live external OpenTDB if requested.
 */
export async function fetchDynamicGameQuestions(
  options: QuestionFilterOptions = {}
): Promise<Question[]> {
  const {
    count = 5,
    category = 'cultural_quiz',
    countryCode,
    difficulty,
    userLevel,
    allowExternalApi = true,
  } = options;

  const sessionHistory = getSessionQuestionHistory();

  // Dedicated Guess the Number Mode: 3 rounds of secret target numbers between 1 and 100
  if (category === 'guess_number') {
    const roundCount = 3;
    const timestampSeed = Date.now().toString(36);
    const numberQuestions: Question[] = [];
    const usedNumbers = new Set<number>();

    for (let i = 0; i < roundCount; i++) {
      let secret = Math.floor(Math.random() * 100) + 1;
      while (usedNumbers.has(secret)) {
        secret = ((secret + 17) % 100) + 1;
      }
      usedNumbers.add(secret);

      const randomCountry = COUNTRIES[(secret + i * 7) % COUNTRIES.length];
      numberQuestions.push({
        id: `guess_number_${timestampSeed}_r${i + 1}_${secret}`,
        category: 'guess_number',
        countryCode: randomCountry.code,
        countryName: randomCountry.name,
        difficulty: 'medium',
        prompt: `Round ${i + 1}: Guess the secret target number between 1 and 100! Use Higher ⬆️ and Lower ⬇️ hints to crack the code in 6 attempts or fewer.`,
        options: ['1', '100'],
        correctAnswer: String(secret),
        targetNumber: secret,
        explanation: `The secret target number for Round ${i + 1} was ${secret}!`,
        active: true,
        subCategory: 'Geography',
        source: 'curated',
      });
    }

    return numberQuestions;
  }

  // Dedicated Word Scramble Mode: 5 rounds of cultural & geographic scrambled words
  if (category === 'word_scramble') {
    let scramblePool = [...WORD_SCRAMBLE_QUESTIONS];
    if (countryCode && countryCode !== 'ALL') {
      const targetCode = countryCode.toUpperCase();
      const countryMatches = scramblePool.filter((q) => q.countryCode.toUpperCase() === targetCode);
      if (countryMatches.length >= count) {
        scramblePool = countryMatches;
      } else if (countryMatches.length > 0) {
        const others = scramblePool.filter((q) => q.countryCode.toUpperCase() !== targetCode);
        scramblePool = [...countryMatches, ...others];
      }
    }

    const unseenScramble = scramblePool.filter((q) => !sessionHistory.has(q.id));
    const seenScramble = scramblePool.filter((q) => sessionHistory.has(q.id));

    const chosenScramble = [
      ...shuffleArray(unseenScramble),
      ...shuffleArray(seenScramble),
    ].slice(0, count);

    recordQuestionsAnsweredInSession(chosenScramble.map((q) => q.id));

    return chosenScramble.map((q, idx) => {
      const cleanWord = q.correctAnswer.toUpperCase().replace(/[^A-Z]/g, '');
      const scrambled = scrambleWordDeterministic(cleanWord, `${q.id}_r${idx + 1}`);
      return {
        ...q,
        scrambledWord: scrambled,
        options: scrambled.split(''),
      };
    });
  }

  // Dedicated Memory Match Mode: 1 complete 4x4 card grid featuring 8 pairs
  if (category === 'memory_match') {
    const timestampSeed = Date.now().toString(36);
    const country = countryCode ? getCountryByCode(countryCode) : null;
    const resolvedCountry = country || COUNTRIES[Math.floor(Math.random() * COUNTRIES.length)];

    return [
      {
        id: `memory_match_${timestampSeed}`,
        category: 'memory_match',
        countryCode: resolvedCountry.code,
        countryName: resolvedCountry.name,
        difficulty: 'medium',
        prompt: 'Flip and match all 8 cultural landmark pairs in the 4x4 grid before time runs out! Consecutive combos boost your score.',
        options: ['8 Pairs', '16 Cards'],
        correctAnswer: '8',
        explanation: 'Memory match tests recall and recognition of global monuments, heritage treasures, and world flags!',
        active: true,
        subCategory: 'Landmarks',
        source: 'curated',
      },
    ];
  }

  const isUnifiedQuiz = isUnifiedCulturalQuizMode(category);

  // 1. Build unified dataset including curated questions and picture-based flag questions
  let pool: Question[] = [...QUESTIONS, ...FLAG_QUIZ_QUESTIONS];

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

  // Category filter (only filter if a non-quiz specialty mode is explicitly requested)
  if (category && !isUnifiedQuiz) {
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
    // Adaptive difficulty: higher levels get more medium/hard questions while keeping flag questions available
    if (userLevel >= 7) {
      const advanced = pool.filter(
        (q) => q.difficulty === 'hard' || q.difficulty === 'medium' || q.subCategory === 'Flags'
      );
      if (advanced.length >= count) pool = advanced;
    } else if (userLevel >= 3) {
      const intermediate = pool.filter(
        (q) => q.difficulty === 'medium' || q.difficulty === 'easy'
      );
      if (intermediate.length >= count) pool = intermediate;
    }
  }

  // 2. Separate into unseen vs seen questions in this session
  const unseenPool = pool.filter((q) => !sessionHistory.has(q.id));
  const seenPool = pool.filter((q) => sessionHistory.has(q.id));

  let chosen: Question[] = [];

  if (isUnifiedQuiz && (!countryCode || countryCode === 'ALL')) {
    // Dynamically sample across all cultural quiz categories (Flags, Landmarks, Food, Music, Traditions, Languages)
    const buckets = new Map<string, Question[]>();
    for (const q of shuffleArray(unseenPool)) {
      const bucket = getQuestionTopicBucket(q);
      if (!buckets.has(bucket)) buckets.set(bucket, []);
      buckets.get(bucket)!.push(q);
    }

    const bucketKeys = shuffleArray(Array.from(buckets.keys()));
    // Pick one question from each distinct cultural category first for maximum variety
    for (const key of bucketKeys) {
      if (chosen.length >= count) break;
      const list = buckets.get(key);
      if (list && list.length > 0) {
        chosen.push(list.shift()!);
      }
    }

    // Fill any remaining slots from the rest of unseenPool
    if (chosen.length < count) {
      const remainingUnseen = shuffleArray(
        unseenPool.filter((q) => !chosen.some((c) => c.id === q.id))
      );
      chosen.push(...remainingUnseen.slice(0, count - chosen.length));
    }
  } else {
    // Pick as many unseen questions as possible
    const shuffledUnseen = shuffleArray(unseenPool);
    chosen.push(...shuffledUnseen.slice(0, count));
  }

  // If we still need more questions, try fetching from Firestore or OpenTDB
  if (chosen.length < count && allowExternalApi) {
    // Try Firestore community collection first
    const firestoreQs = await fetchFirestoreQuestions(category, countryCode, count - chosen.length);
    const freshFirestore = firestoreQs.filter(
      (fq) => !sessionHistory.has(fq.id) && !chosen.some((c) => c.id === fq.id)
    );
    chosen.push(...freshFirestore.slice(0, count - chosen.length));

    // Try OpenTDB if still needed and general category is suitable
    if (chosen.length < count && isUnifiedQuiz && !countryCode) {
      const openTdbQs = await fetchOpenTDBQuestions(count - chosen.length);
      const freshOpenTdb = openTdbQs.filter(
        (ot) => !sessionHistory.has(ot.id) && !chosen.some((c) => c.id === ot.id)
      );
      chosen.push(...freshOpenTdb.slice(0, count - chosen.length));
    }
  }

  // Strictly deduplicate chosen questions by ID, Prompt, and Country
  const finalUnique: Question[] = [];
  const seenIds = new Set<string>();
  const seenPrompts = new Set<string>();

  for (const q of chosen) {
    if (finalUnique.length >= count) break;
    const cleanPrompt = q.prompt.trim().toLowerCase();
    if (!seenIds.has(q.id) && !seenPrompts.has(cleanPrompt)) {
      seenIds.add(q.id);
      seenPrompts.add(cleanPrompt);
      finalUnique.push(q);
    }
  }

  // If still below required count, draw strictly unique questions from master questions catalog
  if (finalUnique.length < count) {
    const masterPool = shuffleArray([...QUESTIONS, ...FLAG_QUIZ_QUESTIONS]);
    for (const q of masterPool) {
      if (finalUnique.length >= count) break;
      const cleanPrompt = q.prompt.trim().toLowerCase();
      if (!seenIds.has(q.id) && !seenPrompts.has(cleanPrompt)) {
        seenIds.add(q.id);
        seenPrompts.add(cleanPrompt);
        finalUnique.push(q);
      }
    }
  }

  // Record chosen IDs into session cache so subsequent games in this session don't repeat them
  recordQuestionsAnsweredInSession(finalUnique.map((q) => q.id));

  // Shuffle the order of chosen questions and randomize multiple-choice options for every question
  return shuffleArray(finalUnique.slice(0, count)).map((q) => shuffleQuestionOptions(q));
}
