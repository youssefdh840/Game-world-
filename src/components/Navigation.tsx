import React from 'react';
import {
  Home,
  Compass,
  Gamepad2,
  BookMarked,
  User,
  Coins,
  Flame,
  Volume2,
  VolumeX,
  Shield,
  Bell,
  LogIn,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { sounds } from '../services/soundEffects';

interface NavigationProps {
  currentTab: 'home' | 'explore' | 'play' | 'passport' | 'profile' | 'leaderboard';
  setCurrentTab: (tab: 'home' | 'explore' | 'play' | 'passport' | 'profile' | 'leaderboard') => void;
  onOpenDailyChallenge: () => void;
  onOpenAdmin: () => void;
  soundEnabled: boolean;
  setSoundEnabled: React.Dispatch<React.SetStateAction<boolean>>;
}

export const TopHeader: React.FC<{
  onOpenDailyChallenge: () => void;
  onOpenAdmin: () => void;
  soundEnabled: boolean;
  setSoundEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  onOpenLeaderboard: () => void;
  onOpenAuth: () => void;
}> = ({
  onOpenDailyChallenge,
  onOpenAdmin,
  soundEnabled,
  setSoundEnabled,
  onOpenLeaderboard,
  onOpenAuth,
}) => {
  const { userProfile, firebaseUser } = useAuth();
  const isGuest = !firebaseUser || firebaseUser.isAnonymous;

  const handleToggleSound = () => {
    const next = sounds.toggleSound();
    setSoundEnabled(next);
    if (next) sounds.playPop();
  };

  return (
    <header className="sticky top-0 z-40 bg-slate-900/95 backdrop-blur-md border-b border-slate-800 px-3.5 sm:px-6 md:px-8 pt-safe pb-2.5 sm:py-3.5">
      <div className="w-full max-w-md sm:max-w-2xl md:max-w-4xl lg:max-w-5xl mx-auto flex items-center justify-between gap-2 sm:gap-3">
        {/* Brand / User Badge */}
        <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1 overflow-hidden">
          <div className="relative w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-tr from-amber-500 via-rose-500 to-indigo-600 p-0.5 shadow-lg shadow-indigo-500/20 shrink-0">
            {userProfile?.avatar ? (
              <img
                src={userProfile.avatar}
                alt={userProfile.username || 'Avatar'}
                className="w-full h-full rounded-[10px] object-cover bg-slate-900"
              />
            ) : (
              <div className="w-full h-full rounded-[10px] flex items-center justify-center text-white font-black text-base sm:text-lg">
                🌍
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-xs sm:text-base font-extrabold tracking-tight bg-gradient-to-r from-amber-400 via-rose-300 to-indigo-300 bg-clip-text text-transparent truncate leading-tight">
              WORLD CHALLENGE
            </h1>
            <div className="flex items-center gap-1.5 text-[11px] sm:text-xs text-slate-300 font-semibold mt-0.5 min-w-0">
              <span className="shrink-0 leading-none">{userProfile?.countryFlag || '🌐'}</span>
              <span className="truncate font-bold text-slate-200 max-w-[130px] sm:max-w-[220px]">
                {userProfile?.username || 'Guest'}
              </span>
              <span className="bg-indigo-950/90 border border-indigo-500/30 text-indigo-300 px-1.5 py-0.5 rounded text-[10px] font-extrabold shrink-0 leading-none">
                Lv.{userProfile?.level || 1}
              </span>
            </div>
          </div>
        </div>

        {/* Status Indicators & Quick Actions */}
        <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
          {/* Login button only shown for guests */}
          {isGuest && (
            <button
              onClick={() => {
                sounds.playPop();
                onOpenAuth();
              }}
              title="Log In / Sign Up"
              className="flex items-center gap-1 bg-gradient-to-r from-amber-500 to-rose-600 hover:from-amber-400 hover:to-rose-500 text-white font-black px-2.5 sm:px-3.5 py-1.5 rounded-xl text-[11px] sm:text-xs shadow-md shadow-rose-500/20 active:scale-95 transition-all cursor-pointer shrink-0"
            >
              <LogIn className="w-3.5 h-3.5 stroke-[2.5] shrink-0" />
              <span className="whitespace-nowrap">Log In</span>
            </button>
          )}

          {/* Daily Streak */}
          <button
            onClick={() => {
              sounds.playPop();
              onOpenDailyChallenge();
            }}
            title="Daily Challenge Streak"
            className="flex items-center gap-1 sm:gap-1.5 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-400 px-2 sm:px-3 py-1.5 rounded-full text-xs font-bold transition-all active:scale-95 cursor-pointer shrink-0"
          >
            <Flame className="w-3.5 h-3.5 fill-amber-400 text-amber-400 animate-pulse shrink-0" />
            <span>{userProfile?.dailyStreak || 1}</span>
          </button>

          {/* Coins */}
          <button
            onClick={() => {
              sounds.playPop();
              onOpenLeaderboard();
            }}
            title="Coins & Leaderboard"
            className="flex items-center gap-1 sm:gap-1.5 bg-yellow-500/10 hover:bg-yellow-500/20 border border-yellow-500/30 text-yellow-300 px-2 sm:px-3 py-1.5 rounded-full text-xs font-bold transition-all active:scale-95 cursor-pointer shrink-0"
          >
            <Coins className="w-3.5 h-3.5 text-yellow-400 shrink-0" />
            <span>{userProfile?.coins || 100}</span>
          </button>

          {/* Sound Toggle */}
          <button
            onClick={handleToggleSound}
            title={soundEnabled ? 'Mute Sounds' : 'Unmute Sounds'}
            className="p-2 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors cursor-pointer shrink-0"
          >
            {soundEnabled ? (
              <Volume2 className="w-4 h-4 text-emerald-400" />
            ) : (
              <VolumeX className="w-4 h-4 text-slate-500" />
            )}
          </button>

          {/* Admin link if role is admin */}
          {userProfile?.role === 'admin' && (
            <button
              onClick={() => {
                sounds.playPop();
                onOpenAdmin();
              }}
              title="Admin Dashboard"
              className="p-2 rounded-full bg-rose-500/20 border border-rose-500/40 text-rose-300 hover:bg-rose-500/30 transition-colors cursor-pointer shrink-0"
            >
              <Shield className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </header>
  );
};

export const BottomNavigation: React.FC<NavigationProps> = ({
  currentTab,
  setCurrentTab,
}) => {
  const tabs: {
    id: 'home' | 'explore' | 'play' | 'passport' | 'profile';
    label: string;
    icon: typeof Home;
    highlight?: boolean;
  }[] = [
    { id: 'home', label: 'Home', icon: Home },
    { id: 'explore', label: 'Explore', icon: Compass },
    { id: 'play', label: 'Play', icon: Gamepad2, highlight: true },
    { id: 'passport', label: 'Passport', icon: BookMarked },
    { id: 'profile', label: 'Profile', icon: User },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-slate-900/95 backdrop-blur-lg border-t border-slate-800 pb-safe px-2 sm:px-6">
      <div className="w-full max-w-md sm:max-w-xl md:max-w-2xl mx-auto flex items-center justify-around py-2 sm:py-2.5 select-none">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = currentTab === tab.id;

          const handleTabClick = () => {
            setCurrentTab(tab.id);
            // Non-blocking sound feedback
            try {
              sounds.playPop();
            } catch {
              // ignore
            }
          };

          if (tab.highlight) {
            return (
              <button
                key={tab.id}
                onClick={handleTabClick}
                type="button"
                className="relative -top-4 flex flex-col items-center group focus:outline-none cursor-pointer select-none"
              >
                <div
                  className={`w-14 h-14 rounded-full flex items-center justify-center shadow-xl transition-all duration-150 active:scale-95 will-change-transform ${
                    isActive
                      ? 'bg-gradient-to-tr from-amber-500 via-rose-500 to-indigo-600 ring-4 ring-rose-500/30 shadow-rose-500/40 scale-105'
                      : 'bg-gradient-to-tr from-indigo-600 to-rose-600 shadow-indigo-600/30 hover:scale-105'
                  }`}
                >
                  <Icon className="w-7 h-7 text-white" />
                </div>
                <span
                  className={`text-[10px] font-bold mt-1 transition-colors ${
                    isActive ? 'text-rose-400' : 'text-slate-400'
                  }`}
                >
                  {tab.label}
                </span>
              </button>
            );
          }

          return (
            <button
              key={tab.id}
              onClick={handleTabClick}
              type="button"
              className={`flex flex-col items-center justify-center py-1 px-3 rounded-xl transition-all duration-150 active:scale-95 cursor-pointer select-none ${
                isActive ? 'text-indigo-400 font-bold' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <div className="relative">
                <Icon className={`w-5 h-5 ${isActive ? 'stroke-[2.5]' : 'stroke-2'}`} />
                {isActive && (
                  <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 bg-indigo-400 rounded-full" />
                )}
              </div>
              <span className={`text-[10px] mt-1 font-semibold ${isActive ? 'text-indigo-400' : ''}`}>
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
