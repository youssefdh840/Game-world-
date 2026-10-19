import React from 'react';
import { useTheme } from '../context/ThemeContext';
import { sounds } from '../services/soundEffects';
import { Sun, Moon, Sparkles, Check, Palette } from 'lucide-react';

export const ThemeToggleCard: React.FC = () => {
  const { theme, isDark, setTheme, toggleTheme } = useTheme();

  const handleToggle = () => {
    sounds.playPop();
    toggleTheme();
  };

  const handleSelectMode = (mode: 'dark' | 'light') => {
    if (theme !== mode) {
      sounds.playPop();
      setTheme(mode);
    }
  };

  return (
    <div
      className={`rounded-3xl p-5 sm:p-6 transition-all duration-300 relative overflow-hidden backdrop-blur-md ${
        isDark
          ? 'bg-slate-900/80 border border-cyan-500/30 shadow-[0_0_25px_rgba(6,182,212,0.12)] ring-1 ring-cyan-500/20 text-slate-100'
          : 'bg-white/85 border border-amber-400/40 shadow-[0_0_25px_rgba(245,158,11,0.15)] ring-1 ring-amber-400/25 text-slate-900'
      }`}
    >
      {/* Ambient background glow orbs */}
      <div
        className={`absolute -top-12 -right-12 w-44 h-44 rounded-full blur-3xl pointer-events-none transition-colors duration-500 ${
          isDark
            ? 'bg-gradient-to-br from-cyan-500/15 via-indigo-500/15 to-transparent'
            : 'bg-gradient-to-br from-amber-400/20 via-orange-400/15 to-transparent'
        }`}
      />
      <div
        className={`absolute -bottom-10 -left-10 w-36 h-36 rounded-full blur-2xl pointer-events-none transition-colors duration-500 ${
          isDark
            ? 'bg-gradient-to-tr from-teal-500/10 to-transparent'
            : 'bg-gradient-to-tr from-yellow-400/15 to-transparent'
        }`}
      />

      {/* Header bar with title and master toggle switch */}
      <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-700/40 dark:border-slate-800/80">
        <div className="flex items-center gap-3">
          <div
            className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 transition-colors shadow-sm ${
              isDark
                ? 'bg-cyan-500/15 border border-cyan-500/30 text-cyan-400'
                : 'bg-amber-400/20 border border-amber-400/40 text-amber-600'
            }`}
          >
            <Palette className="w-5 h-5 stroke-[2.2]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm sm:text-base font-black tracking-tight">
                Appearance &amp; Aesthetics
              </h3>
              {/* Active status indicator badge */}
              <span
                className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider transition-colors ${
                  isDark
                    ? 'bg-cyan-950/80 text-cyan-300 border border-cyan-500/40'
                    : 'bg-amber-50 text-amber-700 border border-amber-300/80'
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    isDark ? 'bg-cyan-400 animate-pulse' : 'bg-amber-500 animate-pulse'
                  }`}
                />
                {isDark ? 'Dark Mode Active' : 'Light Mode Active'}
              </span>
            </div>
            <p
              className={`text-xs mt-0.5 ${
                isDark ? 'text-slate-400' : 'text-slate-500'
              }`}
            >
              Customizable themes with high-contrast palette &amp; visual depth
            </p>
          </div>
        </div>

        {/* Master Interactive Morphing Switch */}
        <div className="flex items-center gap-2.5 self-end sm:self-auto">
          <button
            type="button"
            role="switch"
            aria-checked={!isDark}
            onClick={handleToggle}
            className={`w-20 sm:w-22 h-10 rounded-full p-1 cursor-pointer transition-all duration-300 relative shadow-inner flex items-center select-none group focus:outline-none focus-visible:ring-2 ${
              isDark
                ? 'bg-gradient-to-r from-slate-950 via-slate-900 to-indigo-950/90 border border-cyan-500/40 focus-visible:ring-cyan-400 shadow-[inset_0_2px_4px_rgba(0,0,0,0.6)]'
                : 'bg-gradient-to-r from-amber-100 via-amber-200 to-yellow-100 border border-amber-400/70 focus-visible:ring-amber-500 shadow-[inset_0_2px_4px_rgba(245,158,11,0.25)]'
            }`}
          >
            {/* Background static glyphs for track */}
            <span
              className={`absolute left-2.5 transition-opacity duration-300 text-xs ${
                isDark ? 'opacity-80 text-cyan-300' : 'opacity-30 text-amber-600'
              }`}
            >
              🌙
            </span>
            <span
              className={`absolute right-2.5 transition-opacity duration-300 text-xs ${
                !isDark ? 'opacity-80 text-amber-600' : 'opacity-30 text-cyan-300'
              }`}
            >
              ☀️
            </span>

            {/* Sliding Morphing Thumb */}
            <div
              className={`w-8 h-8 rounded-full shadow-md flex items-center justify-center transition-all duration-300 ease-out transform ${
                isDark
                  ? 'translate-x-0 bg-gradient-to-tr from-cyan-500 to-indigo-600 text-white shadow-[0_0_12px_rgba(6,182,212,0.65)] ring-1 ring-white/30'
                  : 'translate-x-10 sm:translate-x-12 bg-gradient-to-tr from-amber-400 via-amber-500 to-yellow-400 text-slate-950 shadow-[0_0_14px_rgba(245,158,11,0.75)] ring-1 ring-amber-200'
              }`}
            >
              {isDark ? (
                <Moon className="w-4 h-4 -rotate-12 transition-transform duration-300 drop-shadow" />
              ) : (
                <Sun className="w-4 h-4 text-slate-950 rotate-0 transition-transform duration-300 drop-shadow animate-spin-slow" />
              )}
            </div>
          </button>
        </div>
      </div>

      {/* Dual Interactive Theme Option Cards */}
      <div className="relative z-10 grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 mt-4">
        {/* Card 1: Obsidian Atlas (Dark Mode) */}
        <button
          type="button"
          onClick={() => handleSelectMode('dark')}
          className={`p-4 rounded-2xl border text-left transition-all duration-200 relative cursor-pointer select-none group flex flex-col justify-between ${
            isDark
              ? 'bg-slate-950/80 border-cyan-400/80 shadow-[0_0_20px_rgba(6,182,212,0.2)] ring-1 ring-cyan-400/40 scale-[1.01]'
              : 'bg-slate-100/70 hover:bg-slate-100 border-slate-200/80 hover:border-slate-300 text-slate-700 opacity-80 hover:opacity-100'
          }`}
        >
          {isDark && (
            <div className="absolute top-3 right-3 w-5 h-5 rounded-full bg-cyan-500 text-slate-950 flex items-center justify-center shadow-sm">
              <Check className="w-3 h-3 stroke-[3]" />
            </div>
          )}

          <div className="flex items-center gap-3 mb-2">
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-transform group-hover:scale-105 ${
                isDark
                  ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                  : 'bg-slate-200 text-slate-600'
              }`}
            >
              <Moon className="w-4 h-4" />
            </div>
            <div>
              <span
                className={`font-black text-sm block ${
                  isDark ? 'text-white' : 'text-slate-800'
                }`}
              >
                Obsidian Atlas
              </span>
              <span className="text-[10px] font-bold tracking-wider uppercase text-cyan-400">
                Night Explorer
              </span>
            </div>
          </div>

          <p
            className={`text-xs leading-relaxed mb-3 ${
              isDark ? 'text-slate-300' : 'text-slate-500'
            }`}
          >
            Deep obsidian canvas with neon cyan &amp; indigo accents. Optimized for low-light gameplay.
          </p>

          {/* Mini UI Palette Preview Strip */}
          <div className="flex items-center gap-1.5 pt-2 border-t border-slate-800/60 dark:border-slate-800">
            <span className="w-3.5 h-3.5 rounded-full bg-[#0B0F19] ring-1 ring-slate-700" title="Canvas #0B0F19" />
            <span className="w-3.5 h-3.5 rounded-full bg-[#0E1526] ring-1 ring-slate-700" title="Surface #0E1526" />
            <span className="w-3.5 h-3.5 rounded-full bg-cyan-400 shadow-[0_0_6px_rgba(6,182,212,0.8)]" title="Electric Cyan" />
            <span className="w-3.5 h-3.5 rounded-full bg-indigo-500 shadow-[0_0_6px_rgba(99,102,241,0.8)]" title="Indigo" />
            <span className="ml-auto text-[10px] font-mono font-bold text-cyan-400">
              #0B0F19
            </span>
          </div>
        </button>

        {/* Card 2: Solar Expedition (Light Mode) */}
        <button
          type="button"
          onClick={() => handleSelectMode('light')}
          className={`p-4 rounded-2xl border text-left transition-all duration-200 relative cursor-pointer select-none group flex flex-col justify-between ${
            !isDark
              ? 'bg-amber-50/90 border-amber-400 shadow-[0_0_20px_rgba(245,158,11,0.25)] ring-1 ring-amber-400/50 scale-[1.01]'
              : 'bg-slate-950/40 hover:bg-slate-950/60 border-slate-800 hover:border-slate-700 text-slate-400 opacity-80 hover:opacity-100'
          }`}
        >
          {!isDark && (
            <div className="absolute top-3 right-3 w-5 h-5 rounded-full bg-amber-500 text-slate-950 flex items-center justify-center shadow-sm">
              <Check className="w-3 h-3 stroke-[3]" />
            </div>
          )}

          <div className="flex items-center gap-3 mb-2">
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-transform group-hover:scale-105 ${
                !isDark
                  ? 'bg-amber-500/20 text-amber-600 border border-amber-400/40'
                  : 'bg-slate-800 text-slate-500'
              }`}
            >
              <Sun className="w-4 h-4" />
            </div>
            <div>
              <span
                className={`font-black text-sm block ${
                  !isDark ? 'text-slate-950' : 'text-slate-300'
                }`}
              >
                Solar Expedition
              </span>
              <span className="text-[10px] font-bold tracking-wider uppercase text-amber-500">
                Daylight Expedition
              </span>
            </div>
          </div>

          <p
            className={`text-xs leading-relaxed mb-3 ${
              !isDark ? 'text-slate-700' : 'text-slate-400'
            }`}
          >
            Crisp sunlit parchment with warm gold &amp; amber accents. High daylight contrast.
          </p>

          {/* Mini UI Palette Preview Strip */}
          <div className="flex items-center gap-1.5 pt-2 border-t border-amber-200/60 dark:border-slate-800">
            <span className="w-3.5 h-3.5 rounded-full bg-[#F8FAFC] ring-1 ring-slate-300" title="Canvas #F8FAFC" />
            <span className="w-3.5 h-3.5 rounded-full bg-white ring-1 ring-slate-300" title="Surface #FFFFFF" />
            <span className="w-3.5 h-3.5 rounded-full bg-amber-500 shadow-[0_0_6px_rgba(245,158,11,0.8)]" title="Warm Amber" />
            <span className="w-3.5 h-3.5 rounded-full bg-teal-600 shadow-[0_0_6px_rgba(13,148,136,0.8)]" title="Teal" />
            <span className="ml-auto text-[10px] font-mono font-bold text-amber-600 dark:text-amber-400">
              #F8FAFC
            </span>
          </div>
        </button>
      </div>
    </div>
  );
};
