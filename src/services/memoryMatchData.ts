import { shuffleArraySeeded } from './questionService';

export interface MemoryCard {
  id: string; // Unique card instance ID (e.g. "fr_eiffel_1")
  pairId: string; // Identifier shared by both cards in the pair (e.g. "fr_eiffel")
  name: string; // Landmark / Monument / Cultural name
  countryName: string;
  countryCode: string;
  countryFlag: string;
  icon: string;
  category: 'landmark' | 'monument' | 'flag' | 'culture';
  fact: string;
}

export interface CulturalMemoryPair {
  pairId: string;
  name: string;
  countryName: string;
  countryCode: string;
  countryFlag: string;
  icon: string;
  category: 'landmark' | 'monument' | 'flag' | 'culture';
  fact: string;
}

export const CULTURAL_MEMORY_POOL: CulturalMemoryPair[] = [
  {
    pairId: 'fr_eiffel',
    name: 'Eiffel Tower',
    countryName: 'France',
    countryCode: 'FR',
    countryFlag: '🇫🇷',
    icon: '🗼',
    category: 'landmark',
    fact: 'Constructed in 1889 for the Paris World Fair, standing 330m tall.',
  },
  {
    pairId: 'jp_fuji',
    name: 'Mount Fuji',
    countryName: 'Japan',
    countryCode: 'JP',
    countryFlag: '🇯🇵',
    icon: '🗾',
    category: 'landmark',
    fact: 'Active volcano and Japan’s highest peak at 3,776 meters.',
  },
  {
    pairId: 'gr_parthenon',
    name: 'Parthenon',
    countryName: 'Greece',
    countryCode: 'GR',
    countryFlag: '🇬🇷',
    icon: '🏛️',
    category: 'monument',
    fact: 'Dedicated to the goddess Athena atop the Acropolis in Athens.',
  },
  {
    pairId: 'eg_pyramids',
    name: 'Pyramids of Giza',
    countryName: 'Egypt',
    countryCode: 'EG',
    countryFlag: '🇪🇬',
    icon: '🏜️',
    category: 'monument',
    fact: 'The Great Pyramid of Khufu is the oldest Ancient Wonder.',
  },
  {
    pairId: 'us_liberty',
    name: 'Statue of Liberty',
    countryName: 'United States',
    countryCode: 'US',
    countryFlag: '🇺🇸',
    icon: '🗽',
    category: 'monument',
    fact: 'A beacon of liberty gifted to the USA by France in 1886.',
  },
  {
    pairId: 'in_taj',
    name: 'Taj Mahal',
    countryName: 'India',
    countryCode: 'IN',
    countryFlag: '🇮🇳',
    icon: '🕌',
    category: 'monument',
    fact: 'Ivory-white marble mausoleum on the Yamuna river in Agra.',
  },
  {
    pairId: 'it_colosseum',
    name: 'Colosseum',
    countryName: 'Italy',
    countryCode: 'IT',
    countryFlag: '🇮🇹',
    icon: '🏟️',
    category: 'monument',
    fact: 'Imperial Rome’s greatest amphitheatre, commissioned in 72 AD.',
  },
  {
    pairId: 'cn_wall',
    name: 'Great Wall',
    countryName: 'China',
    countryCode: 'CN',
    countryFlag: '🇨🇳',
    icon: '🏮',
    category: 'landmark',
    fact: 'Vast fortifications stretching more than 21,000 kilometers.',
  },
  {
    pairId: 'br_christ',
    name: 'Christ Redeemer',
    countryName: 'Brazil',
    countryCode: 'BR',
    countryFlag: '🇧🇷',
    icon: '🇧🇷',
    category: 'monument',
    fact: 'Art Deco statue standing 30m high atop Corcovado mountain in Rio.',
  },
  {
    pairId: 'au_opera',
    name: 'Sydney Opera House',
    countryName: 'Australia',
    countryCode: 'AU',
    countryFlag: '🇦🇺',
    icon: '🦘',
    category: 'landmark',
    fact: 'Iconic expressionist shell structure on Sydney Harbour.',
  },
  {
    pairId: 'pe_machu',
    name: 'Machu Picchu',
    countryName: 'Peru',
    countryCode: 'PE',
    countryFlag: '🇵🇪',
    icon: '🏰',
    category: 'monument',
    fact: '15th-century Inca citadel perched on the Andes mountain ridge.',
  },
  {
    pairId: 'tn_carthage',
    name: 'Carthage Ruins',
    countryName: 'Tunisia',
    countryCode: 'TN',
    countryFlag: '🇹🇳',
    icon: '🏛️',
    category: 'landmark',
    fact: 'Legendary Phoenician city and empire founded by Queen Dido.',
  },
  {
    pairId: 'gb_bigben',
    name: 'Big Ben & London',
    countryName: 'United Kingdom',
    countryCode: 'GB',
    countryFlag: '🇬🇧',
    icon: '🇬🇧',
    category: 'landmark',
    fact: 'Famous 16-story Gothic clock tower next to the River Thames.',
  },
  {
    pairId: 'mx_chichen',
    name: 'Chichen Itza',
    countryName: 'Mexico',
    countryCode: 'MX',
    countryFlag: '🇲🇽',
    icon: '🇲🇽',
    category: 'monument',
    fact: 'Mayan pyramid complex featuring the famous El Castillo temple.',
  },
  {
    pairId: 'tr_hagia',
    name: 'Hagia Sophia',
    countryName: 'Turkey',
    countryCode: 'TR',
    countryFlag: '🇹🇷',
    icon: '🇹🇷',
    category: 'landmark',
    fact: 'Architectural marvel built in 537 AD bridging cultures in Istanbul.',
  },
  {
    pairId: 'kr_palace',
    name: 'Gyeongbokgung',
    countryName: 'South Korea',
    countryCode: 'KR',
    countryFlag: '🇰🇷',
    icon: '🏯',
    category: 'landmark',
    fact: 'The grand royal palace of the Joseon dynasty built in 1395.',
  },
];

/**
 * Builds a deterministic 16-card deck (8 pairs) for a 4x4 grid based on roomId seed.
 * Both 1v1 players receive the exact same board layout and cards for fair competition!
 */
export function generateMemoryMatchDeck(seed: string = 'memory_match', targetCountryCode?: string): MemoryCard[] {
  let pool = [...CULTURAL_MEMORY_POOL];

  // If a target country was selected in matchmaking (e.g. from Explore), prioritize that country's pair
  if (targetCountryCode) {
    const codeUpper = targetCountryCode.toUpperCase();
    const targeted = pool.filter((p) => p.countryCode === codeUpper);
    const others = pool.filter((p) => p.countryCode !== codeUpper);
    pool = [...targeted, ...others];
  }

  // Pick 8 distinct pairs for a 4x4 grid (16 cards total)
  // Use seeded shuffle on pool to select which 8 pairs appear in this match
  const selectedPairs = shuffleArraySeeded(pool, `${seed}_pair_selection`).slice(0, 8);

  // Generate 2 cards for each pair
  const deck: MemoryCard[] = [];
  selectedPairs.forEach((pair) => {
    deck.push({
      id: `${pair.pairId}_card1`,
      pairId: pair.pairId,
      name: pair.name,
      countryName: pair.countryName,
      countryCode: pair.countryCode,
      countryFlag: pair.countryFlag,
      icon: pair.icon,
      category: pair.category,
      fact: pair.fact,
    });
    deck.push({
      id: `${pair.pairId}_card2`,
      pairId: pair.pairId,
      name: pair.name,
      countryName: pair.countryName,
      countryCode: pair.countryCode,
      countryFlag: pair.countryFlag,
      icon: pair.icon,
      category: pair.category,
      fact: pair.fact,
    });
  });

  // Shuffle the 16 cards deterministically across the 4x4 grid
  return shuffleArraySeeded(deck, `${seed}_board_layout`);
}

export const MEMORY_MATCH_TOTAL_PAIRS = 8;
export const MEMORY_MATCH_DURATION_SECONDS = 50;
export const MEMORY_MATCH_DURATION_MS = MEMORY_MATCH_DURATION_SECONDS * 1000;

/**
 * Computes dynamic score:
 * - Base +100 points per matched pair (up to 800)
 * - Combo streak bonus (+25 per consecutive match)
 * - Move efficiency penalty (-15 per incorrect move beyond optimal)
 * - Speed bonus (+5 pts per remaining second upon full completion)
 * - Full clearance bonus (+100 pts)
 */
export function calculateMemoryMatchPoints(
  matchedPairs: number,
  movesCount: number,
  remainingSeconds: number,
  totalPairs: number = MEMORY_MATCH_TOTAL_PAIRS,
  comboBonusPoints: number = 0
): number {
  const baseScore = matchedPairs * 100;
  // Extra moves beyond the optimal 1 move per pair
  const extraMoves = Math.max(0, movesCount - totalPairs);
  const penalty = extraMoves * 15;

  const isCompleted = matchedPairs >= totalPairs;
  const speedBonus = isCompleted ? Math.max(0, Math.floor(remainingSeconds)) * 5 : 0;
  const completionBonus = isCompleted ? 100 : 0;

  const total = baseScore + comboBonusPoints + completionBonus + speedBonus - penalty;
  return Math.max(0, total);
}
