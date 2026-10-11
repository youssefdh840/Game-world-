import React from 'react';
import { GameCategory } from '../types/game';
import { sounds } from '../services/soundEffects';
import { Swords, Play } from 'lucide-react';

interface PlayScreenProps {
  onStartMatch: (category: GameCategory | 'mixed') => void;
}

export const PlayScreen: React.FC<PlayScreenProps> = ({ onStartMatch }) => {
  const includedCategories = [
    { label: 'Flags', icon: '🏳️' },
    { label: 'Landmarks', icon: '🏛️' },
    { label: 'Food', icon: '🍜' },
    { label: 'Music', icon: '🎵' },
    { label: 'Traditions', icon: '🎭' },
    { label: 'Languages', icon: '🗣️' },
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
          Challenge players worldwide in the unified Cultural Quiz to unlock new country passport visas!
        </p>
      </div>

      {/* Primary Game Mode Cards */}
      <div className="space-y-4 sm:space-y-5">
        {/* Card 1: Unified Cultural Quiz */}
        <button
          onClick={() => {
            sounds.playPop();
            onStartMatch('cultural_quiz');
          }}
          className="w-full relative group overflow-hidden bg-slate-900 border border-slate-800 hover:border-indigo-500/60 rounded-3xl p-5 sm:p-7 flex flex-col sm:flex-row sm:items-center justify-between text-left shadow-xl active:scale-98 transition-all cursor-pointer gap-5"
        >
          <div className="flex items-start sm:items-center gap-4 sm:gap-5 min-w-0">
            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-gradient-to-tr from-amber-500 via-rose-600 to-indigo-600 flex items-center justify-center text-3xl sm:text-4xl shadow-lg group-hover:scale-105 transition-transform shrink-0">
              🌍
            </div>
            <div className="min-w-0 space-y-2">
              <div className="flex items-center flex-wrap gap-2">
                <span className="text-[10px] sm:text-xs font-extrabold uppercase tracking-wider text-indigo-300 bg-indigo-500/15 border border-indigo-500/30 px-2.5 py-0.5 rounded-full">
                  CULTURAL QUIZ
                </span>
                <span className="text-xs sm:text-sm font-bold text-amber-400 font-mono">
                  +250 XP
                </span>
              </div>
              <h3 className="text-lg sm:text-2xl font-black text-white group-hover:text-indigo-300 transition-colors">
                Guess the Country (Cultural Quiz)
              </h3>
              <p className="text-xs sm:text-sm text-slate-300 leading-relaxed max-w-2xl">
                Test your cultural knowledge with picture-based questions, flags, monuments, and national facts.
              </p>

              {/* Consolidated Cultural Categories */}
              <div className="flex items-center flex-wrap gap-1.5 pt-1">
                {includedCategories.map((cat) => (
                  <span
                    key={cat.label}
                    className="inline-flex items-center gap-1 text-[10px] sm:text-xs font-semibold text-slate-300 bg-slate-800/90 border border-slate-700/70 px-2.5 py-1 rounded-xl"
                  >
                    <span>{cat.icon}</span>
                    <span>{cat.label}</span>
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end sm:justify-center shrink-0">
            <div className="px-5 py-3 sm:w-14 sm:h-14 sm:p-0 rounded-2xl sm:rounded-full bg-gradient-to-r from-indigo-600 to-rose-600 group-hover:from-indigo-500 group-hover:to-rose-500 flex items-center justify-center gap-2 text-white font-extrabold text-xs sm:text-sm shadow-lg transition-all">
              <span className="sm:hidden">Play Cultural Quiz</span>
              <Play className="w-4 h-4 sm:w-5 sm:h-5 fill-current sm:ml-0.5" />
            </div>
          </div>
        </button>

        {/* Card 2: 1v1 Word Scramble */}
        <button
          onClick={() => {
            sounds.playPop();
            onStartMatch('word_scramble');
          }}
          className="w-full relative group overflow-hidden bg-slate-900 border border-slate-800 hover:border-emerald-500/60 rounded-3xl p-5 sm:p-7 flex flex-col sm:flex-row sm:items-center justify-between text-left shadow-xl active:scale-98 transition-all cursor-pointer gap-5"
        >
          <div className="flex items-start sm:items-center gap-4 sm:gap-5 min-w-0">
            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-gradient-to-tr from-emerald-500 via-teal-500 to-indigo-600 flex items-center justify-center text-3xl sm:text-4xl shadow-lg group-hover:scale-105 transition-transform shrink-0">
              🔤
            </div>
            <div className="min-w-0 space-y-2">
              <div className="flex items-center flex-wrap gap-2">
                <span className="text-[10px] sm:text-xs font-extrabold uppercase tracking-wider text-emerald-300 bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-0.5 rounded-full">
                  5 ROUNDS • 20S TIMER
                </span>
                <span className="text-xs sm:text-sm font-bold text-amber-400 font-mono">
                  +180 XP
                </span>
              </div>
              <h3 className="text-lg sm:text-2xl font-black text-white group-hover:text-emerald-300 transition-colors">
                Word Scramble (1v1 Speed Duel)
              </h3>
              <p className="text-xs sm:text-sm text-slate-300 leading-relaxed max-w-2xl">
                Unscramble 5 cultural & geographic words faster than your opponent! Earn 100 base pts + 5 pts per remaining second.
              </p>

              <div className="flex items-center flex-wrap gap-1.5 pt-1 text-[10px] sm:text-xs font-semibold text-slate-300">
                <span className="bg-slate-800/90 border border-slate-700/70 px-2.5 py-1 rounded-xl">
                  ⚡ Speed Bonus: +5 pts/sec
                </span>
                <span className="bg-slate-800/90 border border-slate-700/70 px-2.5 py-1 rounded-xl">
                  🔄 Unlimited Retries per Round
                </span>
                <span className="bg-slate-800/90 border border-slate-700/70 px-2.5 py-1 rounded-xl">
                  🛂 Unlocks Passport Visas
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end sm:justify-center shrink-0">
            <div className="px-5 py-3 sm:w-14 sm:h-14 sm:p-0 rounded-2xl sm:rounded-full bg-gradient-to-r from-emerald-600 to-teal-600 group-hover:from-emerald-500 group-hover:to-teal-500 flex items-center justify-center gap-2 text-white font-extrabold text-xs sm:text-sm shadow-lg transition-all">
              <span className="sm:hidden">Play Word Scramble</span>
              <Play className="w-4 h-4 sm:w-5 sm:h-5 fill-current sm:ml-0.5" />
            </div>
          </div>
        </button>

        {/* Card 3: 1v1 Guess the Number */}
        <button
          onClick={() => {
            sounds.playPop();
            onStartMatch('guess_number');
          }}
          className="w-full relative group overflow-hidden bg-slate-900 border border-slate-800 hover:border-amber-500/60 rounded-3xl p-5 sm:p-7 flex flex-col sm:flex-row sm:items-center justify-between text-left shadow-xl active:scale-98 transition-all cursor-pointer gap-5"
        >
          <div className="flex items-start sm:items-center gap-4 sm:gap-5 min-w-0">
            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-gradient-to-tr from-amber-500 via-orange-500 to-rose-600 flex items-center justify-center text-3xl sm:text-4xl shadow-lg group-hover:scale-105 transition-transform shrink-0">
              🔢
            </div>
            <div className="min-w-0 space-y-2">
              <div className="flex items-center flex-wrap gap-2">
                <span className="text-[10px] sm:text-xs font-extrabold uppercase tracking-wider text-amber-300 bg-amber-500/15 border border-amber-500/30 px-2.5 py-0.5 rounded-full">
                  NUMBERS &amp; LOGIC
                </span>
                <span className="text-xs sm:text-sm font-bold text-amber-400 font-mono">
                  +180 XP
                </span>
              </div>
              <h3 className="text-lg sm:text-2xl font-black text-white group-hover:text-amber-300 transition-colors">
                Guess the Number
              </h3>
              <p className="text-xs sm:text-sm text-slate-300 leading-relaxed max-w-2xl">
                Guess the secret number in the fewest tries possible with High/Low hints before your opponent!
              </p>

              <div className="flex items-center flex-wrap gap-1.5 pt-1 text-[10px] sm:text-xs font-semibold text-slate-300">
                <span className="bg-slate-800/90 border border-slate-700/70 px-2.5 py-1 rounded-xl">
                  🎯 1–100 Secret Target
                </span>
                <span className="bg-slate-800/90 border border-slate-700/70 px-2.5 py-1 rounded-xl">
                  ⬆️⬇️ High / Low Hints
                </span>
                <span className="bg-slate-800/90 border border-slate-700/70 px-2.5 py-1 rounded-xl">
                  🏆 3 Rounds • 6 Tries Max
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end sm:justify-center shrink-0">
            <div className="px-5 py-3 rounded-2xl bg-gradient-to-r from-amber-500 to-rose-600 group-hover:from-amber-400 group-hover:to-rose-500 flex items-center justify-center gap-2 text-white font-extrabold text-xs sm:text-sm shadow-lg transition-all whitespace-nowrap">
              <span>Play Guess the Number</span>
              <Play className="w-4 h-4 fill-current" />
            </div>
          </div>
        </button>
      </div>
    </div>
  );
};
