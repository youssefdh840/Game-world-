import React, { useState } from 'react';
import { GameCategory } from '../types/game';
import { sounds } from '../services/soundEffects';
import {
  Gamepad2,
  Swords,
  HelpCircle,
  MessageSquare,
  Utensils,
  Music,
  MapPin,
  Theater,
  Zap,
  Globe2,
  Play,
  Flame,
} from 'lucide-react';

interface PlayScreenProps {
  onStartMatch: (category: GameCategory | 'mixed') => void;
}

export const PlayScreen: React.FC<PlayScreenProps> = ({ onStartMatch }) => {
  const [selectedContinent, setSelectedContinent] = useState<string>('Worldwide');

  const modes: {
    category: GameCategory | 'mixed';
    title: string;
    description: string;
    icon: string;
    tag: string;
    gradient: string;
    bonus: string;
  }[] = [
    {
      category: 'mixed',
      title: 'Worldwide Duel',
      description: 'The complete multiplayer experience across all cultural categories.',
      icon: '🌍',
      tag: 'POPULAR',
      gradient: 'from-amber-500 via-rose-600 to-indigo-600',
      bonus: '+250 XP',
    },
    {
      category: 'duel',
      title: '1 vs 1 Speed Duel',
      description: 'Fast buzzer competition. First to answer locks in maximum points!',
      icon: '⚡',
      tag: 'FAST PACED',
      gradient: 'from-yellow-500 to-amber-600',
      bonus: '+200 XP',
    },
    {
      category: 'country_quiz',
      title: 'Country Quiz',
      description: 'Identify flags, capitals, monuments, and unusual national facts.',
      icon: '🏛️',
      tag: 'GEOGRAPHY',
      gradient: 'from-blue-600 to-indigo-600',
      bonus: '+180 XP',
    },
    {
      category: 'guess_word',
      title: 'Guess the Word',
      description: 'Decipher untranslatable cultural expressions and authentic slang.',
      icon: '🗣️',
      tag: 'LANGUAGES',
      gradient: 'from-purple-600 to-pink-600',
      bonus: '+180 XP',
    },
    {
      category: 'mystery_food',
      title: 'Mystery Food',
      description: 'Traditional culinary dishes, ingredients, and national recipes.',
      icon: '🍜',
      tag: 'GASTRONOMY',
      gradient: 'from-orange-500 to-rose-500',
      bonus: '+180 XP',
    },
    {
      category: 'music_culture',
      title: 'Music & Instruments',
      description: 'Identify exotic instruments, melodies, rhythms, and audio tones.',
      icon: '🎵',
      tag: 'MUSIC',
      gradient: 'from-emerald-500 to-teal-600',
      bonus: '+180 XP',
    },
    {
      category: 'world_map',
      title: 'World Map Tap',
      description: 'Find nations on the interactive world map as fast as possible.',
      icon: '🗺️',
      tag: 'MAP SKILLS',
      gradient: 'from-cyan-500 to-blue-600',
      bonus: '+200 XP',
    },
    {
      category: 'cultural_mime',
      title: 'Traditions & Festivals',
      description: 'Guess celebrations, greetings, and traditional cultural customs.',
      icon: '🎭',
      tag: 'CULTURE',
      gradient: 'from-fuchsia-600 to-purple-600',
      bonus: '+180 XP',
    },
  ];

  return (
    <div className="space-y-5 sm:space-y-6 pb-8 animate-fade-in">
      {/* Header */}
      <div className="bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 border border-indigo-500/30 rounded-3xl p-5 sm:p-7 shadow-xl">
        <div className="flex items-center justify-between gap-2 mb-2.5">
          <div className="flex items-center gap-2 text-rose-400 font-extrabold text-xs tracking-wider uppercase">
            <Swords className="w-4 h-4" />
            <span>MULTIPLAYER ARENA</span>
          </div>
          <span className="text-[10px] sm:text-xs font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-1 rounded-full flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Live Queue Online
          </span>
        </div>
        <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">Select Game Mode</h2>
        <p className="text-xs sm:text-sm text-slate-300 mt-1.5 max-w-2xl leading-relaxed">
          Pick a cultural mini-game or jump into a Worldwide Duel to discover new passport visas!
        </p>
      </div>

      {/* Mode Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 sm:gap-4 md:gap-5">
        {modes.map((mode) => (
          <button
            key={mode.category}
            onClick={() => {
              sounds.playPop();
              onStartMatch(mode.category);
            }}
            className="w-full relative group overflow-hidden bg-slate-900 border border-slate-800 hover:border-indigo-500/50 rounded-3xl p-4 sm:p-5 flex items-center justify-between text-left shadow-lg active:scale-98 transition-all cursor-pointer"
          >
            <div className="flex items-center gap-4 min-w-0 pr-2">
              <div
                className={`w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-gradient-to-tr ${mode.gradient} flex items-center justify-center text-2xl sm:text-3xl shadow-md group-hover:scale-110 transition-transform shrink-0`}
              >
                {mode.icon}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[9px] sm:text-[10px] font-extrabold uppercase tracking-wider text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded-full">
                    {mode.tag}
                  </span>
                  <span className="text-[10px] sm:text-xs font-bold text-amber-400 font-mono">
                    {mode.bonus}
                  </span>
                </div>
                <h3 className="text-base sm:text-lg font-black text-white group-hover:text-indigo-300 transition-colors truncate">
                  {mode.title}
                </h3>
                <p className="text-xs text-slate-400 line-clamp-2 leading-snug mt-0.5">{mode.description}</p>
              </div>
            </div>

            <div className="w-10 h-10 rounded-full bg-slate-800 group-hover:bg-indigo-600 flex items-center justify-center text-slate-300 group-hover:text-white transition-colors shrink-0 ml-2">
              <Play className="w-4 h-4 fill-current ml-0.5" />
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};
