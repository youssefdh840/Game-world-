import { Badge } from '../types/game';

export const BADGES: Badge[] = [
  {
    id: 'first_journey',
    title: 'First Journey',
    description: 'Discover your first foreign country and add it to your passport.',
    icon: '🌍',
    xpReward: 150,
    requirement: 'Discover 1 country',
  },
  {
    id: 'first_friend',
    title: 'First Friend',
    description: 'Complete your first multiplayer match with another world challenger.',
    icon: '🤝',
    xpReward: 100,
    requirement: 'Complete 1 multiplayer game',
  },
  {
    id: 'speed_demon',
    title: 'Speed Demon',
    description: 'Lock in a correct answer in under 2.5 seconds.',
    icon: '⚡',
    xpReward: 150,
    requirement: 'Answer correctly under 2.5s',
  },
  {
    id: 'world_traveler',
    title: 'World Traveler',
    description: 'Unlock stamps for 5 countries in your virtual passport.',
    icon: '✈️',
    xpReward: 350,
    requirement: 'Discover 5 countries',
  },
  {
    id: 'global_explorer',
    title: 'Global Explorer',
    description: 'Stamp 10 or more different countries in your virtual passport.',
    icon: '🌎',
    xpReward: 800,
    requirement: 'Discover 10 countries',
  },
  {
    id: 'champion',
    title: 'Champion',
    description: 'Claim victory in 10 multiplayer duels.',
    icon: '🏆',
    xpReward: 500,
    requirement: 'Win 10 matches',
  },
  {
    id: 'foodie_globetrotter',
    title: 'Culinary Connoisseur',
    description: 'Score full marks in a Mystery Food challenge.',
    icon: '🍜',
    xpReward: 200,
    requirement: 'Win a food round',
  },
  {
    id: 'map_master',
    title: 'Cartographer Supreme',
    description: 'Pinpoint geographic locations with pinpoint speed and precision.',
    icon: '🗺️',
    xpReward: 250,
    requirement: 'Complete map challenges',
  },
  {
    id: 'streak_master',
    title: 'Daily Pioneer',
    description: 'Maintain a daily game streak for 3 consecutive days.',
    icon: '🔥',
    xpReward: 300,
    requirement: '3-day play streak',
  },
  {
    id: 'polyglot',
    title: 'World Polyglot',
    description: 'Accurately decipher untranslatable cultural expressions.',
    icon: '🗣️',
    xpReward: 200,
    requirement: 'Correctly guess cultural words',
  },
];

export function getBadgeById(id: string): Badge | undefined {
  return BADGES.find((b) => b.id === id);
}
