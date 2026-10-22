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
      {/* Header Banner */}
      <div className="bg-[#111827] border border-cyan-500/20 rounded-3xl p-5 sm:p-7 shadow-xl">
        <div className="flex items-center justify-between gap-2 mb-2.5">
          <div className="flex items-center gap-2 text-cyan-400 font-extrabold text-xs tracking-wider uppercase">
            <Swords className="w-4 h-4 text-cyan-400" />
            <span>MULTIPLAYER ARENA</span>
          </div>
          <span className="text-[10px] sm:text-xs font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-1 rounded-full inline-flex items-center justify-center">
            Live Queue Online
          </span>
        </div>
        <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">Select Game Mode</h2>
        <p className="text-xs sm:text-sm text-slate-300 mt-1.5 max-w-2xl leading-relaxed">
          Challenge players worldwide in real-time cultural mini-games to unlock new country passport visas!
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
          type="button"
          className="w-full relative group overflow-hidden bg-[#111827] hover:bg-[#151E32] border border-cyan-500/30 hover:border-cyan-400/70 rounded-3xl p-5 sm:p-7 flex flex-col sm:flex-row sm:items-center justify-between text-left shadow-xl active:translate-y-0.5 transition-all cursor-pointer gap-5 select-none"
        >
          <div className="flex items-start sm:items-center gap-4 sm:gap-5 min-w-0">
            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-3xl sm:text-4xl shadow-inner group-hover:scale-105 transition-transform shrink-0">
              🌍
            </div>
            <div className="min-w-0 space-y-2">
              <div className="flex items-center flex-wrap gap-2 text-xs">
                <span className="font-extrabold uppercase tracking-wider text-cyan-400 text-[10px] sm:text-xs">
                  CULTURAL QUIZ · MULTIPLAYER
                </span>
                <span className="text-slate-600">·</span>
                <span className="font-mono font-bold text-amber-400">
                  +250 XP
                </span>
              </div>
              <h3 className="text-lg sm:text-2xl font-black text-white group-hover:text-cyan-300 transition-colors">
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
                    className="inline-flex items-center gap-1 text-[10px] sm:text-xs font-semibold text-slate-300 bg-[#0B0F19] border border-slate-800 px-2.5 py-1 rounded-xl"
                  >
                    <span>{cat.icon}</span>
                    <span>{cat.label}</span>
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end sm:justify-center shrink-0">
            <div className="px-5 py-3 sm:w-14 sm:h-14 sm:p-0 rounded-2xl sm:rounded-full bg-gradient-to-r from-cyan-500 to-teal-500 text-slate-950 flex items-center justify-center gap-2 font-black text-xs sm:text-sm shadow-md shadow-cyan-500/20 transition-all">
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
          type="button"
          className="w-full relative group overflow-hidden bg-[#111827] hover:bg-[#151E32] border border-emerald-500/30 hover:border-emerald-400/70 rounded-3xl p-5 sm:p-7 flex flex-col sm:flex-row sm:items-center justify-between text-left shadow-xl active:translate-y-0.5 transition-all cursor-pointer gap-5 select-none"
        >
          <div className="flex items-start sm:items-center gap-4 sm:gap-5 min-w-0">
            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-3xl sm:text-4xl shadow-inner group-hover:scale-105 transition-transform shrink-0">
              🔤
            </div>
            <div className="min-w-0 space-y-2">
              <div className="flex items-center flex-wrap gap-2 text-xs">
                <span className="font-extrabold uppercase tracking-wider text-emerald-400 text-[10px] sm:text-xs">
                  SPEED DUEL · 5 ROUNDS · 20S TIMER
                </span>
                <span className="text-slate-600">·</span>
                <span className="font-mono font-bold text-amber-400">
                  +180 XP
                </span>
              </div>
              <h3 className="text-lg sm:text-2xl font-black text-white group-hover:text-emerald-300 transition-colors">
                Word Scramble (1v1 Speed Duel)
              </h3>
              <p className="text-xs sm:text-sm text-slate-300 leading-relaxed max-w-2xl">
                Unscramble 5 cultural &amp; geographic words faster than your opponent! Earn 100 base pts + 5 pts per remaining second.
              </p>

              <div className="flex items-center flex-wrap gap-1.5 pt-1 text-[10px] sm:text-xs font-semibold text-slate-300">
                <span className="bg-[#0B0F19] border border-slate-800 px-2.5 py-1 rounded-xl">
                  ⚡ Speed Bonus: +5 pts/sec
                </span>
                <span className="bg-[#0B0F19] border border-slate-800 px-2.5 py-1 rounded-xl">
                  🔄 Unlimited Retries
                </span>
                <span className="bg-[#0B0F19] border border-slate-800 px-2.5 py-1 rounded-xl text-emerald-400">
                  🛂 Unlocks Passport Visas
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end sm:justify-center shrink-0">
            <div className="px-5 py-3 sm:w-14 sm:h-14 sm:p-0 rounded-2xl sm:rounded-full bg-gradient-to-r from-emerald-400 to-teal-500 text-slate-950 flex items-center justify-center gap-2 font-black text-xs sm:text-sm shadow-md shadow-emerald-500/20 transition-all">
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
          type="button"
          className="w-full relative group overflow-hidden bg-[#111827] hover:bg-[#151E32] border border-amber-500/30 hover:border-amber-400/70 rounded-3xl p-5 sm:p-7 flex flex-col sm:flex-row sm:items-center justify-between text-left shadow-xl active:translate-y-0.5 transition-all cursor-pointer gap-5 select-none"
        >
          <div className="flex items-start sm:items-center gap-4 sm:gap-5 min-w-0">
            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-3xl sm:text-4xl shadow-inner group-hover:scale-105 transition-transform shrink-0">
              🔢
            </div>
            <div className="min-w-0 space-y-2">
              <div className="flex items-center flex-wrap gap-2 text-xs">
                <span className="font-extrabold uppercase tracking-wider text-amber-400 text-[10px] sm:text-xs">
                  NUMBERS &amp; LOGIC · 3 ROUNDS
                </span>
                <span className="text-slate-600">·</span>
                <span className="font-mono font-bold text-amber-400">
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
                <span className="bg-[#0B0F19] border border-slate-800 px-2.5 py-1 rounded-xl">
                  🎯 1–100 Secret Target
                </span>
                <span className="bg-[#0B0F19] border border-slate-800 px-2.5 py-1 rounded-xl">
                  ⬆️⬇️ High / Low Hints
                </span>
                <span className="bg-[#0B0F19] border border-slate-800 px-2.5 py-1 rounded-xl">
                  🏆 3 Rounds • 6 Tries
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end sm:justify-center shrink-0">
            <div className="px-5 py-3 rounded-2xl bg-gradient-to-r from-amber-400 to-orange-500 hover:from-amber-300 hover:to-orange-400 flex items-center justify-center gap-2 text-slate-950 font-black text-xs sm:text-sm shadow-md shadow-amber-500/20 transition-all whitespace-nowrap">
              <span>Play Guess Number</span>
              <Play className="w-4 h-4 fill-current" />
            </div>
          </div>
        </button>

        {/* Card 4: Memory Match */}
        <button
          onClick={() => {
            sounds.playPop();
            onStartMatch('memory_match');
          }}
          type="button"
          className="w-full relative group overflow-hidden bg-[#111827] hover:bg-[#151E32] border border-cyan-500/30 hover:border-cyan-400/70 rounded-3xl p-5 sm:p-7 flex flex-col sm:flex-row sm:items-center justify-between text-left shadow-xl active:translate-y-0.5 transition-all cursor-pointer gap-5 select-none"
        >
          <div className="flex items-start sm:items-center gap-4 sm:gap-5 min-w-0">
            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-3xl sm:text-4xl shadow-inner group-hover:scale-105 transition-transform shrink-0">
              🃏
            </div>
            <div className="min-w-0 space-y-2">
              <div className="flex items-center flex-wrap gap-2 text-xs">
                <span className="font-extrabold uppercase tracking-wider text-cyan-400 text-[10px] sm:text-xs">
                  4X4 CARD GRID · 8 PAIRS · SPEED DUEL
                </span>
                <span className="text-slate-600">·</span>
                <span className="font-mono font-bold text-amber-400">
                  +180 XP
                </span>
              </div>
              <h3 className="text-lg sm:text-2xl font-black text-white group-hover:text-cyan-300 transition-colors">
                Memory Match (World Explorer)
              </h3>
              <p className="text-xs sm:text-sm text-slate-300 leading-relaxed max-w-2xl">
                Flip and match pairs of global monuments, heritage landmarks, and world flags! Earn combo bonuses and race the timer.
              </p>

              <div className="flex items-center flex-wrap gap-1.5 pt-1 text-[10px] sm:text-xs font-semibold text-slate-300">
                <span className="bg-[#0B0F19] border border-slate-800 px-2.5 py-1 rounded-xl">
                  🏛️ 8 Landmark Pairs
                </span>
                <span className="bg-[#0B0F19] border border-slate-800 px-2.5 py-1 rounded-xl">
                  ⏱️ 50s Match Timer
                </span>
                <span className="bg-[#0B0F19] border border-slate-800 px-2.5 py-1 rounded-xl text-emerald-400">
                  🔥 Combo Streaks &amp; Speed Bonus
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end sm:justify-center shrink-0">
            <div className="px-5 py-3 sm:w-14 sm:h-14 sm:p-0 rounded-2xl sm:rounded-full bg-gradient-to-r from-cyan-500 to-teal-500 text-slate-950 flex items-center justify-center gap-2 font-black text-xs sm:text-sm shadow-md shadow-cyan-500/20 transition-all">
              <span className="sm:hidden">Play Memory Match</span>
              <Play className="w-4 h-4 sm:w-5 sm:h-5 fill-current sm:ml-0.5" />
            </div>
          </div>
        </button>
      </div>
    </div>
  );
};
