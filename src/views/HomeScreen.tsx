import React from 'react';
import { useAuth } from '../context/AuthContext';
import { calculateLevel, hasAttemptedDailyQuestToday } from '../services/userService';
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
  CheckCircle2,
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
  const dailyCompletedToday = hasAttemptedDailyQuestToday(userProfile);
  const totalWins = userProfile?.victories ?? userProfile?.gamesWon ?? 0;

  return (
    <div className="space-y-6 sm:space-y-7 pb-8 animate-fade-in">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-6 lg:gap-7 items-start">
        {/* Left / Primary Column on Desktop: Traveler Hero + Play CTA + Quick Grid */}
        <div className="lg:col-span-7 space-y-5 sm:space-y-6">
          {/* Traveler Hero Profile Card */}
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-900 via-slate-900 to-slate-900 border border-indigo-500/30 p-5 sm:p-6 md:p-7 shadow-2xl">
            {/* Background glow decoration */}
            <div className="absolute -top-12 -right-12 w-44 h-44 bg-rose-500/15 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute -bottom-10 -left-10 w-44 h-44 bg-indigo-500/20 rounded-full blur-3xl pointer-events-none" />

            <div className="relative z-10 flex items-center gap-3.5 sm:gap-4">
              {/* Avatar with flag badge */}
              <div className="relative shrink-0">
                <img
                  src={
                    userProfile?.avatar ||
                    'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=160&q=80'
                  }
                  alt={userProfile?.username || 'Avatar'}
                  className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl object-cover ring-2 ring-indigo-500/40 shadow-lg bg-slate-800"
                />
                <span className="absolute -bottom-1.5 -right-1.5 text-lg sm:text-xl p-0.5 bg-slate-900 rounded-full shadow">
                  {userProfile?.countryFlag || '🌐'}
                </span>
              </div>

              {/* User Identity & Meta */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1 bg-gradient-to-r from-amber-500 to-rose-500 text-white font-extrabold text-[10px] sm:text-xs px-2.5 py-0.5 rounded-lg shadow-sm shrink-0">
                    <Zap className="w-3 h-3 fill-white" />
                    LVL {levelInfo.level}
                  </span>

                  {(!firebaseUser || firebaseUser.isAnonymous) && (
                    <button
                      onClick={() => {
                        sounds.playPop();
                        onOpenAuth();
                      }}
                      className="inline-flex items-center gap-1 text-[11px] bg-gradient-to-r from-amber-500 to-rose-600 hover:from-amber-400 hover:to-rose-500 text-white font-extrabold px-2.5 py-0.5 rounded-full shadow-md active:scale-95 transition-all cursor-pointer shrink-0"
                    >
                      <LogIn className="w-3 h-3 stroke-[2.5]" />
                      <span>Log In</span>
                    </button>
                  )}
                </div>

                <h2 className="text-lg sm:text-2xl font-black text-white tracking-tight break-words leading-snug mt-1">
                  {userProfile?.username || 'Traveler'}
                </h2>

                <div className="flex items-center flex-wrap gap-x-2 gap-y-0.5 text-xs sm:text-sm text-indigo-300 font-medium mt-0.5">
                  <span className="truncate">{userProfile?.countryName || 'Global Wanderer'}</span>
                  <span className="text-slate-600">•</span>
                  <span className="text-amber-400 font-bold whitespace-nowrap">
                    {totalWins} {totalWins === 1 ? 'Win' : 'Wins'}
                  </span>
                </div>
              </div>
            </div>

            {/* XP Progress Bar */}
            <div className="mt-5 pt-4 border-t border-slate-800/80">
              <div className="flex justify-between text-[11px] sm:text-xs font-bold text-slate-300 mb-2">
                <span className="text-indigo-300">PROGRESSION</span>
                <span className="text-slate-400 font-mono">
                  {levelInfo.xpInCurrentLevel} / {levelInfo.nextLevelThreshold - levelInfo.currentLevelBase} XP
                </span>
              </div>
              <div className="w-full h-3 sm:h-3.5 bg-slate-800 rounded-full overflow-hidden p-0.5 border border-slate-700/50">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-amber-400 via-rose-500 to-indigo-500 transition-all duration-700 shadow-sm"
                  style={{ width: `${Math.max(5, levelInfo.progressPercent)}%` }}
                />
              </div>
            </div>

            {/* Passport quick badge summary */}
            <div className="mt-4 flex items-center justify-between text-xs sm:text-sm text-slate-300 bg-slate-950/40 px-4 py-2.5 rounded-2xl border border-slate-800/50">
              <div className="flex items-center gap-2">
                <Globe className="w-4 h-4 text-emerald-400 shrink-0" />
                <span className="font-semibold">
                  <span className="text-emerald-400 font-bold">{discoveredCount}</span> / 195 Countries Discovered
                </span>
              </div>
              <button
                onClick={() => {
                  sounds.playPop();
                  onNavigateTab('passport');
                }}
                className="text-xs font-bold text-indigo-400 hover:text-indigo-300 flex items-center gap-1 cursor-pointer"
              >
                <span>View</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Main Action: PLAY NOW Button */}
          <div className="space-y-4">
            <button
              onClick={() => {
                sounds.playPop();
                onStartMatchmaking();
              }}
              className="w-full relative group overflow-hidden bg-gradient-to-r from-amber-500 via-rose-600 to-indigo-600 p-0.5 rounded-3xl shadow-xl shadow-rose-600/25 active:scale-98 transition-transform cursor-pointer"
            >
              <div className="bg-gradient-to-r from-amber-500 via-rose-600 to-indigo-600 p-5 sm:p-6 rounded-[22px] flex items-center justify-between text-white">
                <div className="flex items-center gap-4 text-left">
                  <div className="w-13 h-13 sm:w-15 sm:h-15 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center text-3xl sm:text-4xl shadow-inner group-hover:scale-110 transition-transform shrink-0">
                    🎮
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] sm:text-xs font-black uppercase tracking-widest bg-white/20 px-2.5 py-0.5 rounded-full">
                        MULTIPLAYER
                      </span>
                      <span className="flex h-2 w-2 relative">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400"></span>
                      </span>
                    </div>
                    <h3 className="text-2xl sm:text-3xl font-black tracking-tight mt-0.5">PLAY NOW</h3>
                    <p className="text-xs sm:text-sm text-rose-100 font-medium">Match with players worldwide!</p>
                  </div>
                </div>
                <div className="w-11 h-11 rounded-full bg-white/20 flex items-center justify-center text-white font-bold group-hover:translate-x-1 transition-transform shrink-0">
                  <ArrowRight className="w-5 h-5" />
                </div>
              </div>
            </button>

            {/* Quick Grid Navigation Buttons */}
            <div className="grid grid-cols-2 gap-3.5 sm:gap-4">
              {/* My Passport */}
              <button
                onClick={() => {
                  sounds.playPop();
                  onNavigateTab('passport');
                }}
                className="p-4 sm:p-5 rounded-3xl bg-slate-900 border border-slate-800 hover:border-indigo-500/50 flex flex-col items-start gap-3 shadow-lg active:scale-98 transition-all group text-left cursor-pointer"
              >
                <div className="w-11 h-11 rounded-2xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center text-xl sm:text-2xl group-hover:scale-110 transition-transform">
                  🛂
                </div>
                <div>
                  <h4 className="text-sm sm:text-base font-extrabold text-white">My Passport</h4>
                  <p className="text-xs text-slate-400 mt-0.5">Collect country visas &amp; stamps</p>
                </div>
              </button>

              {/* Game Modes / Play Selection */}
              <button
                onClick={() => {
                  sounds.playPop();
                  onNavigateTab('play');
                }}
                className="p-4 sm:p-5 rounded-3xl bg-slate-900 border border-slate-800 hover:border-rose-500/50 flex flex-col items-start gap-3 shadow-lg active:scale-98 transition-all group text-left cursor-pointer"
              >
                <div className="w-11 h-11 rounded-2xl bg-rose-500/10 text-rose-400 flex items-center justify-center text-xl sm:text-2xl group-hover:scale-110 transition-transform">
                  🎯
                </div>
                <div>
                  <h4 className="text-sm sm:text-base font-extrabold text-white">All Mini-Games</h4>
                  <p className="text-xs text-slate-400 mt-0.5">7 unique cultural game modes</p>
                </div>
              </button>
            </div>
          </div>
        </div>

        {/* Right / Secondary Column on Desktop: Daily Cultural Challenge + Leaderboard Podium */}
        <div className="lg:col-span-5 space-y-5 sm:space-y-6">
          {/* Daily Cultural Challenge Card */}
          <div className="rounded-3xl bg-gradient-to-br from-amber-500/15 via-slate-900 to-slate-900 border border-amber-500/30 p-5 sm:p-6 shadow-xl">
            <div className="flex items-center justify-between gap-2 mb-2.5">
              <div className="flex items-center gap-2.5">
                <span className="text-2xl">🇲🇽</span>
                <div>
                  <span className="text-[10px] font-black uppercase tracking-wider text-amber-400">
                    DAILY CHALLENGE • 1 ATTEMPT / DAY
                  </span>
                  <h4 className="text-sm sm:text-base font-black text-white">Discover Mexico Today</h4>
                </div>
              </div>
              {dailyCompletedToday ? (
                <span className="inline-flex items-center gap-1 text-[11px] font-extrabold text-emerald-300 bg-emerald-500/20 px-2.5 py-1 rounded-lg border border-emerald-500/30 shrink-0">
                  <CheckCircle2 className="w-3 h-3" />
                  <span>Completed</span>
                </span>
              ) : (
                <span className="text-xs font-extrabold text-amber-300 bg-amber-500/20 px-2.5 py-1 rounded-lg border border-amber-500/30 shrink-0">
                  +300 XP
                </span>
              )}
            </div>
            <p className="text-xs sm:text-sm text-slate-400 mb-4 leading-relaxed">
              {dailyCompletedToday
                ? "You have completed today's Daily Quest attempt. Come back tomorrow for a brand new destination!"
                : 'Answer 5 cultural questions about Mexico and earn gold coins + unlock the Aztec Luminary badge!'}
            </p>
            <button
              disabled={dailyCompletedToday}
              onClick={() => {
                if (dailyCompletedToday) return;
                sounds.playPop();
                onOpenDailyChallenge();
              }}
              className={`w-full py-3 rounded-xl font-extrabold text-xs sm:text-sm flex items-center justify-center gap-1.5 shadow-md transition-all ${
                dailyCompletedToday
                  ? 'bg-slate-800 border border-slate-700 text-emerald-400 cursor-not-allowed'
                  : 'bg-amber-500 hover:bg-amber-400 text-slate-950 active:scale-98 cursor-pointer'
              }`}
            >
              {dailyCompletedToday ? (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Daily Quest Completed Today</span>
                </>
              ) : (
                <>
                  <span>Start Daily Quest</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>

          {/* Leaderboard Podium Preview */}
          <div className="rounded-3xl bg-slate-900 border border-slate-800 p-5 sm:p-6 shadow-xl">
            <div className="flex items-center justify-between mb-3.5">
              <div className="flex items-center gap-2">
                <Trophy className="w-4 h-4 text-yellow-400" />
                <h4 className="text-sm sm:text-base font-extrabold text-white">Global Champions</h4>
              </div>
              <button
                onClick={() => {
                  sounds.playPop();
                  onNavigateTab('leaderboard');
                }}
                className="text-xs font-bold text-indigo-400 hover:text-indigo-300 cursor-pointer"
              >
                See Top 50
              </button>
            </div>

            {/* Mini 3-player list */}
            <div className="space-y-2.5">
              {[
                { rank: 1, name: 'Kenji', country: 'Japan', flag: '🇯🇵', xp: 48920, trophy: '🥇' },
                { rank: 2, name: 'Lucas', country: 'France', flag: '🇫🇷', xp: 32400, trophy: '🥈' },
                { rank: 3, name: 'Amira', country: 'Tunisia', flag: '🇹🇳', xp: 29850, trophy: '🥉' },
              ].map((champ) => (
                <div
                  key={champ.name}
                  className="flex items-center justify-between p-3 rounded-2xl bg-slate-800/60 border border-slate-700/40 text-xs sm:text-sm"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-base">{champ.trophy}</span>
                    <span className="text-lg">{champ.flag}</span>
                    <div>
                      <span className="font-extrabold text-white">{champ.name}</span>
                      <span className="text-[11px] text-slate-400 ml-1.5">({champ.country})</span>
                    </div>
                  </div>
                  <span className="font-mono font-bold text-amber-300">{champ.xp.toLocaleString()} XP</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
