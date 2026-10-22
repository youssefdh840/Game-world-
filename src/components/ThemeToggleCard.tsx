import React from 'react';
import { useTheme } from '../context/ThemeContext';
import { sounds } from '../services/soundEffects';
import { Palette, Check } from 'lucide-react';

export const ThemeToggleCard: React.FC = () => {
  const { theme, isPureBlack, setTheme, toggleTheme } = useTheme();

  const handleToggle = () => {
    sounds.playPop();
    toggleTheme();
  };

  const handleSelectMode = (mode: 'navy' | 'black') => {
    if (theme !== mode) {
      sounds.playPop();
      setTheme(mode);
    }
  };

  return (
    <div
      className={`rounded-3xl p-5 sm:p-6 transition-all duration-300 relative overflow-hidden backdrop-blur-md ${
        isPureBlack
          ? 'bg-black/90 border border-neutral-800 shadow-[0_0_30px_rgba(0,0,0,0.95)] ring-1 ring-cyan-500/20 text-white'
          : 'bg-slate-900/80 border border-cyan-500/30 shadow-[0_0_25px_rgba(6,182,212,0.12)] ring-1 ring-cyan-500/20 text-slate-100'
      }`}
    >
      {/* Ambient background glow orbs */}
      <div
        className={`absolute -top-12 -right-12 w-44 h-44 rounded-full blur-3xl pointer-events-none transition-colors duration-500 ${
          isPureBlack
            ? 'bg-gradient-to-br from-cyan-500/10 via-emerald-500/10 to-transparent'
            : 'bg-gradient-to-br from-cyan-500/15 via-indigo-500/15 to-transparent'
        }`}
      />
      <div
        className={`absolute -bottom-10 -left-10 w-36 h-36 rounded-full blur-2xl pointer-events-none transition-colors duration-500 ${
          isPureBlack
            ? 'bg-gradient-to-tr from-emerald-500/10 to-transparent'
            : 'bg-gradient-to-tr from-teal-500/10 to-transparent'
        }`}
      />

      {/* Header bar with title and master toggle switch */}
      <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-neutral-800/80">
        <div className="flex items-center gap-3">
          <div
            className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 transition-colors shadow-sm ${
              isPureBlack
                ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-400'
                : 'bg-cyan-500/15 border border-cyan-500/30 text-cyan-400'
            }`}
          >
            <Palette className="w-5 h-5 stroke-[2.2]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm sm:text-base font-black tracking-tight text-white">
                Appearance &amp; Aesthetics
              </h3>
              {/* Active status indicator badge */}
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider transition-colors ${
                  isPureBlack
                    ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-500/40'
                    : 'bg-cyan-950/80 text-cyan-300 border border-cyan-500/40'
                }`}
              >
                {isPureBlack ? 'Pure OLED Black Active' : 'Classic Navy Active'}
              </span>
            </div>
            <p className="text-xs mt-0.5 text-slate-400">
              High-contrast dark modes with vibrant neon cyan, emerald &amp; amber accents
            </p>
          </div>
        </div>

        {/* Master Interactive Morphing Switch */}
        <div className="flex items-center gap-2.5 self-end sm:self-auto">
          <button
            type="button"
            role="switch"
            aria-checked={isPureBlack}
            onClick={handleToggle}
            title={isPureBlack ? 'Switch to Classic Navy' : 'Switch to Pure OLED Black'}
            className={`w-20 sm:w-22 h-10 rounded-full p-1 cursor-pointer transition-all duration-300 relative shadow-inner flex items-center select-none group focus:outline-none focus-visible:ring-2 ${
              isPureBlack
                ? 'bg-gradient-to-r from-black via-zinc-950 to-black border border-emerald-500/50 focus-visible:ring-emerald-400 shadow-[inset_0_2px_6px_rgba(0,0,0,0.95)]'
                : 'bg-gradient-to-r from-slate-950 via-slate-900 to-indigo-950/90 border border-cyan-500/40 focus-visible:ring-cyan-400 shadow-[inset_0_2px_4px_rgba(0,0,0,0.6)]'
            }`}
          >
            {/* Background static glyphs for track */}
            <span
              className={`absolute left-2.5 transition-opacity duration-300 text-xs ${
                !isPureBlack ? 'opacity-90 scale-110' : 'opacity-40'
              }`}
            >
              🌌
            </span>
            <span
              className={`absolute right-2.5 transition-opacity duration-300 text-xs ${
                isPureBlack ? 'opacity-90 scale-110' : 'opacity-40'
              }`}
            >
              🖤
            </span>

            {/* Sliding Morphing Thumb */}
            <div
              className={`w-8 h-8 rounded-full shadow-md flex items-center justify-center transition-all duration-300 ease-out transform ${
                isPureBlack
                  ? 'translate-x-10 sm:translate-x-12 bg-black text-emerald-400 shadow-[0_0_14px_rgba(16,185,129,0.7)] ring-1 ring-emerald-400/80 border border-emerald-500/50'
                  : 'translate-x-0 bg-gradient-to-tr from-cyan-500 to-indigo-600 text-white shadow-[0_0_12px_rgba(6,182,212,0.65)] ring-1 ring-white/30'
              }`}
            >
              {isPureBlack ? (
                <span className="text-xs">🖤</span>
              ) : (
                <span className="text-xs">🌌</span>
              )}
            </div>
          </button>
        </div>
      </div>

      {/* Dual Interactive Theme Option Cards */}
      <div className="relative z-10 grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 mt-4">
        {/* Card 1: Classic Navy (Default) */}
        <button
          type="button"
          onClick={() => handleSelectMode('navy')}
          className={`p-4 rounded-2xl border text-left transition-all duration-200 relative cursor-pointer select-none group flex flex-col justify-between ${
            !isPureBlack
              ? 'bg-slate-950/90 border-cyan-400/80 shadow-[0_0_20px_rgba(6,182,212,0.22)] ring-1 ring-cyan-400/40 scale-[1.01]'
              : 'bg-black/50 hover:bg-neutral-950 border-neutral-800 hover:border-neutral-700 text-slate-300 opacity-80 hover:opacity-100'
          }`}
        >
          {!isPureBlack && (
            <div className="absolute top-3 right-3 w-5 h-5 rounded-full bg-cyan-500 text-slate-950 flex items-center justify-center shadow-sm">
              <Check className="w-3 h-3 stroke-[3]" />
            </div>
          )}

          <div className="flex items-center gap-3 mb-2">
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-transform group-hover:scale-105 ${
                !isPureBlack
                  ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                  : 'bg-slate-900 text-slate-400'
              }`}
            >
              <span className="text-base">🌌</span>
            </div>
            <div>
              <span className="font-black text-sm block text-white">
                Classic Navy
              </span>
              <span className="text-[10px] font-bold tracking-wider uppercase text-cyan-400">
                Default Explorer
              </span>
            </div>
          </div>

          <p className="text-xs leading-relaxed mb-3 text-slate-300">
            Deep obsidian canvas with navy surfaces and electric cyan &amp; indigo ambient glow.
          </p>

          {/* Mini UI Palette Preview Strip */}
          <div className="flex items-center gap-1.5 pt-2 border-t border-slate-800/80">
            <span className="w-3.5 h-3.5 rounded-full bg-[#0B0F19] ring-1 ring-slate-700" title="Canvas #0B0F19" />
            <span className="w-3.5 h-3.5 rounded-full bg-[#0E1526] ring-1 ring-slate-700" title="Surface #0E1526" />
            <span className="w-3.5 h-3.5 rounded-full bg-cyan-400 shadow-[0_0_6px_rgba(6,182,212,0.8)]" title="Electric Cyan" />
            <span className="w-3.5 h-3.5 rounded-full bg-indigo-500 shadow-[0_0_6px_rgba(99,102,241,0.8)]" title="Indigo" />
            <span className="ml-auto text-[10px] font-mono font-bold text-cyan-400">
              #0B0F19
            </span>
          </div>
        </button>

        {/* Card 2: Pure OLED Black */}
        <button
          type="button"
          onClick={() => handleSelectMode('black')}
          className={`p-4 rounded-2xl border text-left transition-all duration-200 relative cursor-pointer select-none group flex flex-col justify-between ${
            isPureBlack
              ? 'bg-black border-emerald-400/80 shadow-[0_0_24px_rgba(16,185,129,0.25)] ring-1 ring-emerald-400/40 scale-[1.01]'
              : 'bg-slate-950/40 hover:bg-slate-950/70 border-slate-800 hover:border-slate-700 text-slate-400 opacity-80 hover:opacity-100'
          }`}
        >
          {isPureBlack && (
            <div className="absolute top-3 right-3 w-5 h-5 rounded-full bg-emerald-400 text-slate-950 flex items-center justify-center shadow-sm">
              <Check className="w-3 h-3 stroke-[3]" />
            </div>
          )}

          <div className="flex items-center gap-3 mb-2">
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-transform group-hover:scale-105 ${
                isPureBlack
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                  : 'bg-neutral-900 text-slate-400'
              }`}
            >
              <span className="text-base">🖤</span>
            </div>
            <div>
              <span className="font-black text-sm block text-white">
                Pure OLED Black
              </span>
              <span className="text-[10px] font-bold tracking-wider uppercase text-emerald-400">
                True Pitch Black
              </span>
            </div>
          </div>

          <p className="text-xs leading-relaxed mb-3 text-slate-300">
            True pitch black canvas with zero backlight emission, ultra contrast, and neon highlights.
          </p>

          {/* Mini UI Palette Preview Strip */}
          <div className="flex items-center gap-1.5 pt-2 border-t border-neutral-800">
            <span className="w-3.5 h-3.5 rounded-full bg-[#000000] ring-1 ring-neutral-700" title="Pitch Black #000000" />
            <span className="w-3.5 h-3.5 rounded-full bg-[#050505] ring-1 ring-neutral-800" title="Surface #050505" />
            <span className="w-3.5 h-3.5 rounded-full bg-cyan-400 shadow-[0_0_6px_rgba(6,182,212,0.8)]" title="Electric Cyan" />
            <span className="w-3.5 h-3.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(16,185,129,0.8)]" title="Neon Emerald" />
            <span className="ml-auto text-[10px] font-mono font-bold text-emerald-400">
              #000000
            </span>
          </div>
        </button>
      </div>
    </div>
  );
};
