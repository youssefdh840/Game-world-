import React from 'react';
import { useAuth } from '../context/AuthContext';
import { calculateLevel } from '../services/userService';
import {
  Gamepad2,
  BookMarked,
  Trophy,
  Flame,
  Globe,
  Sparkles,
  Users,
  Compass,
  ArrowRight,
  Zap,
  LogIn,
} from 'lucide-react';
import { sounds } from '../services/soundEffects';

interface HomeScreenProps {
  onStartMatchmaking: () => void;
  onNavigateTab: (tab: 'explore' | 'play' | 'passport' | 'profile' | 'leaderboard') => void;
  onOpenDailyChallenge: () => void;
  onOpenAuth: () => void;
}

export const HomeScreen: React.FC<HomeScreenProps> = ({
  onStartMatchmaking,
  onNavigateTab,
  onOpenDailyChallenge,
  onOpenAuth,
}) => {
  const { userProfile, firebaseUser } = useAuth();

  const levelInfo = calculateLevel(userProfile?.xp || 0);
  const discoveredCount = userProfile?.discoveredCountries?.length || 1;

  return (
    <div className="space-y-5 pb-24 animate-fade-in">
      {/* Traveler Hero Profile Card */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-900 via-slate-900 to-slate-900 border border-indigo-500/30 p-5 shadow-2xl">
        {/* Background glow decoration */}
        <div className="absolute -top-12 -right-12 w-44 h-44 bg-rose-500/15 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-10 -left-10 w-44 h-44 bg-indigo-500/20 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex items-start justify-between">
          <div className="flex items-center gap-3.5">
            {/* Avatar with flag badge */}
            <div className="relative">
              <img
                src={
                  userProfile?.avatar ||
                  'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=160&q=80'
                }
                alt={userProfile?.username || 'Avatar'}
                className="w-16 h-16 rounded-2xl object-cover ring-2 ring-indigo-500/40 shadow-lg bg-slate-800"
              />
              <span className="absolute -bottom-1.5 -right-1.5 text-lg p-0.5 bg-slate-900 rounded-full shadow">
                {userProfile?.countryFlag || '🌐'}
              </span>
            </div>

            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-black text-white tracking-tight">
                  {userProfile?.username || 'Traveler'}
                </h2>
                {(!firebaseUser || firebaseUser.isAnonymous) && (
                  <button
                    onClick={() => {
                      sounds.playPop();
                      onOpenAuth();
                    }}
                    className="inline-flex items-center gap-1 text-[11px] bg-gradient-to-r from-amber-500 to-rose-600 hover:from-amber-400 hover:to-rose-500 text-white font-extrabold px-2.5 py-0.5 rounded-full shadow-md active:scale-95 transition-all cursor-pointer"
                  >
                    <LogIn className="w-3 h-3 stroke-[2.5]" />
                    <span>Log In</span>
                  </button>
                )}
              </div>
              <p className="text-xs text-indigo-300 font-medium flex items-center gap-1.5 mt-0.5">
                <span>{userProfile?.countryName || 'Global Wanderer'}</span>
                <span>•</span>
                <span className="text-amber-400 font-bold">
                  {userProfile?.gamesWon || 0} Wins
                </span>
              </p>
            </div>
          </div>

          {/* Level Pill */}
          <div className="text-right">
            <span className="inline-flex items-center gap-1 bg-gradient-to-r from-amber-500 to-rose-500 text-white font-extrabold text-xs px-2.5 py-1 rounded-xl shadow-md">
              <Zap className="w-3 h-3 fill-white" />
              LVL {levelInfo.level}
            </span>
          </div>
        </div>

        {/* XP Progress Bar */}
        <div className="mt-4 pt-3 border-t border-slate-800/80">
          <div className="flex justify-between text-[11px] font-bold text-slate-300 mb-1.5">
            <span className="text-indigo-300">PROGRESSION</span>
            <span className="text-slate-400 font-mono">
              {levelInfo.xpInCurrentLevel} / {levelInfo.nextLevelThreshold - levelInfo.currentLevelBase} XP
            </span>
          </div>
          <div className="w-full h-3 bg-slate-800 rounded-full overflow-hidden p-0.5 border border-slate-700/50">
            <div
              className="h-full rounded-full bg-gradient-to-r from-amber-400 via-rose-500 to-indigo-500 transition-all duration-700 shadow-sm"
              style={{ width: `${Math.max(5, levelInfo.progressPercent)}%` }}
            />
          </div>
        </div>

        {/* Passport quick badge summary */}
        <div className="mt-3.5 flex items-center justify-between text-xs text-slate-300 bg-slate-950/40 px-3.5 py-2 rounded-2xl border border-slate-800/50">
          <div className="flex items-center gap-2">
            <Globe className="w-4 h-4 text-emerald-400" />
            <span className="font-semibold">
              <span className="text-emerald-400 font-bold">{discoveredCount}</span> / 195 Countries Discovered
            </span>
          </div>
          <button
            onClick={() => {
              sounds.playPop();
              onNavigateTab('passport');
            }}
            className="text-[11px] font-bold text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
          >
            <span>View</span>
            <ArrowRight className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Main Action: PLAY NOW Button */}
      <div className="space-y-3">
        <button
          onClick={() => {
            sounds.playPop();
            onStartMatchmaking();
          }}
          className="w-full relative group overflow-hidden bg-gradient-to-r from-amber-500 via-rose-600 to-indigo-600 p-0.5 rounded-3xl shadow-xl shadow-rose-600/25 active:scale-98 transition-transform cursor-pointer"
        >
          <div className="bg-gradient-to-r from-amber-500 via-rose-600 to-indigo-600 p-5 rounded-[22px] flex items-center justify-between text-white">
            <div className="flex items-center gap-4 text-left">
              <div className="w-13 h-13 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center text-3xl shadow-inner group-hover:scale-110 transition-transform">
                🎮
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-black uppercase tracking-widest bg-white/20 px-2 py-0.5 rounded-full">
                    MULTIPLAYER
                  </span>
                  <span className="flex h-2 w-2 relative">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400"></span>
                  </span>
                </div>
                <h3 className="text-2xl font-black tracking-tight mt-0.5">PLAY NOW</h3>
                <p className="text-xs text-rose-100 font-medium">Match with players worldwide!</p>
              </div>
            </div>
            <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center text-white font-bold group-hover:translate-x-1 transition-transform">
              <ArrowRight className="w-5 h-5" />
            </div>
          </div>
        </button>

        {/* Quick Grid Navigation Buttons */}
        <div className="grid grid-cols-2 gap-3">
          {/* My Passport */}
          <button
            onClick={() => {
              sounds.playPop();
              onNavigateTab('passport');
            }}
            className="p-4 rounded-3xl bg-slate-900 border border-slate-800 hover:border-indigo-500/50 flex flex-col items-start gap-2.5 shadow-lg active:scale-98 transition-all group text-left cursor-pointer"
          >
            <div className="w-10 h-10 rounded-2xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center text-xl group-hover:scale-110 transition-transform">
              🛂
            </div>
            <div>
              <h4 className="text-sm font-extrabold text-white">My Passport</h4>
              <p className="text-[11px] text-slate-400">Collect country visas & stamps</p>
            </div>
          </button>

          {/* Game Modes / Play Selection */}
          <button
            onClick={() => {
              sounds.playPop();
              onNavigateTab('play');
            }}
            className="p-4 rounded-3xl bg-slate-900 border border-slate-800 hover:border-rose-500/50 flex flex-col items-start gap-2.5 shadow-lg active:scale-98 transition-all group text-left cursor-pointer"
          >
            <div className="w-10 h-10 rounded-2xl bg-rose-500/10 text-rose-400 flex items-center justify-center text-xl group-hover:scale-110 transition-transform">
              🎯
            </div>
            <div>
              <h4 className="text-sm font-extrabold text-white">All Mini-Games</h4>
              <p className="text-[11px] text-slate-400">7 unique cultural game modes</p>
            </div>
          </button>
        </div>
      </div>

      {/* Daily Cultural Challenge Card */}
      <div className="rounded-3xl bg-gradient-to-br from-amber-500/15 via-slate-900 to-slate-900 border border-amber-500/30 p-4 shadow-xl">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="text-xl">🇲🇽</span>
            <div>
              <span className="text-[10px] font-black uppercase tracking-wider text-amber-400">
                DAILY CHALLENGE
              </span>
              <h4 className="text-sm font-black text-white">Discover Mexico Today</h4>
            </div>
          </div>
          <span className="text-xs font-extrabold text-amber-300 bg-amber-500/20 px-2 py-0.5 rounded-lg border border-amber-500/30">
            +300 XP
          </span>
        </div>
        <p className="text-xs text-slate-400 mb-3">
          Answer 5 cultural questions about Mexico and earn gold coins + unlock the Aztec Luminary badge!
        </p>
        <button
          onClick={() => {
            sounds.playPop();
            onOpenDailyChallenge();
          }}
          className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-xs flex items-center justify-center gap-1.5 shadow-md active:scale-98 transition-all cursor-pointer"
        >
          <span>Start Daily Quest</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Leaderboard Podium Preview */}
      <div className="rounded-3xl bg-slate-900 border border-slate-800 p-4 shadow-xl">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Trophy className="w-4 h-4 text-yellow-400" />
            <h4 className="text-sm font-extrabold text-white">Global Champions</h4>
          </div>
          <button
            onClick={() => {
              sounds.playPop();
              onNavigateTab('leaderboard');
            }}
            className="text-[11px] font-bold text-indigo-400 hover:text-indigo-300"
          >
            See Top 50
          </button>
        </div>

        {/* Mini 3-player list */}
        <div className="space-y-2">
          {[
            { rank: 1, name: 'Kenji', country: 'Japan', flag: '🇯🇵', xp: 48920, trophy: '🥇' },
            { rank: 2, name: 'Lucas', country: 'France', flag: '🇫🇷', xp: 32400, trophy: '🥈' },
            { rank: 3, name: 'Amira', country: 'Tunisia', flag: '🇹🇳', xp: 29850, trophy: '🥉' },
          ].map((champ) => (
            <div
              key={champ.name}
              className="flex items-center justify-between p-2.5 rounded-2xl bg-slate-800/60 border border-slate-700/40 text-xs"
            >
              <div className="flex items-center gap-2.5">
                <span className="text-base">{champ.trophy}</span>
                <span className="text-lg">{champ.flag}</span>
                <div>
                  <span className="font-extrabold text-white">{champ.name}</span>
                  <span className="text-[10px] text-slate-400 ml-1.5">({champ.country})</span>
                </div>
              </div>
              <span className="font-mono font-bold text-amber-300">{champ.xp.toLocaleString()} XP</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
