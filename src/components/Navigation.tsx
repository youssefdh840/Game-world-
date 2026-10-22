import React, { useState, useRef, useEffect } from 'react';
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
  LogOut,
  ChevronDown,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
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
  onNavigateProfile?: () => void;
}> = ({
  onOpenDailyChallenge,
  onOpenAdmin,
  soundEnabled,
  setSoundEnabled,
  onOpenLeaderboard,
  onOpenAuth,
  onNavigateProfile,
}) => {
  const { userProfile, isAuthenticated, isGuest, logout } = useAuth();
  const { isDark, isPureBlack } = useTheme();
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement | null>(null);

  // Close user menu on outside click or escape
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setIsUserMenuOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsUserMenuOpen(false);
    };
    if (isUserMenuOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isUserMenuOpen]);

  const handleToggleSound = () => {
    const next = sounds.toggleSound();
    setSoundEnabled(next);
    if (next) sounds.playPop();
  };

  return (
    <header
      className={`sticky top-0 z-40 backdrop-blur-md border-b px-2.5 sm:px-6 md:px-8 pt-safe pb-2 sm:py-3 transition-colors duration-300 ${
        isPureBlack
          ? 'bg-black/95 border-neutral-900 text-white shadow-[0_4px_20px_rgba(0,0,0,0.8)]'
          : 'bg-[#0E1424]/90 border-slate-800/80 text-white'
      }`}
    >
      <div className="w-full max-w-md sm:max-w-2xl md:max-w-4xl lg:max-w-5xl mx-auto flex items-center justify-between gap-1.5 sm:gap-3">
        {/* Brand / User Badge */}
        <div
          onClick={() => {
            if (onNavigateProfile) {
              sounds.playPop();
              onNavigateProfile();
            }
          }}
          className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1 overflow-hidden cursor-pointer group select-none"
          title="Go to Profile"
        >
          <div
            className={`relative w-8 h-8 sm:w-10 sm:h-10 rounded-xl p-0.5 shadow-sm shrink-0 border transition-transform group-hover:scale-105 ${
              isPureBlack
                ? 'bg-black border-cyan-400/50 ring-1 ring-cyan-500/20'
                : 'bg-slate-800 border-cyan-500/40'
            }`}
          >
            {userProfile?.avatar ? (
              <img
                src={userProfile.avatar}
                alt={userProfile.username || 'Avatar'}
                className="w-full h-full rounded-[10px] object-cover bg-slate-900"
              />
            ) : (
              <div className="w-full h-full rounded-[10px] flex items-center justify-center text-cyan-400 font-bold text-sm sm:text-lg">
                🧭
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-xs sm:text-base font-black tracking-tight truncate flex items-center gap-1 sm:gap-1.5 leading-tight">
              <span className={isDark ? 'text-white' : 'text-slate-950'}>MAPIA</span>
              <span
                className={`text-[9px] sm:text-[10px] tracking-widest font-extrabold uppercase px-1 sm:px-1.5 py-0.5 rounded border ${
                  isDark
                    ? 'text-cyan-400 bg-cyan-950/60 border-cyan-500/30'
                    : 'text-amber-700 bg-amber-50 border-amber-300/80'
                }`}
              >
                WORLD
              </span>
            </h1>
            <div
              className={`flex items-center gap-1 sm:gap-1.5 text-[10px] sm:text-xs font-semibold mt-0.5 min-w-0 ${
                isDark ? 'text-slate-300' : 'text-slate-600'
              }`}
            >
              <span className="shrink-0 leading-none">{userProfile?.countryFlag || '🌐'}</span>
              <span className="truncate font-bold max-w-[85px] xs:max-w-[120px] sm:max-w-[200px] text-white">
                {userProfile?.username || (isAuthenticated ? 'Player' : 'Guest')}
              </span>
              <span
                className={`px-1 sm:px-1.5 py-0.5 rounded text-[9px] sm:text-[10px] font-black shrink-0 leading-none border ${
                  isPureBlack
                    ? 'bg-neutral-900 border-amber-400/30 text-amber-400'
                    : 'bg-slate-800 border-slate-700/80 text-amber-400'
                }`}
              >
                LVL {userProfile?.level || 1}
              </span>
            </div>
          </div>
        </div>

        {/* Status Indicators & Quick Actions */}
        <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
          {/* Daily Streak */}
          <button
            onClick={() => {
              sounds.playPop();
              onOpenDailyChallenge();
            }}
            title="Daily Challenge Streak"
            className="flex items-center gap-1 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-400 px-1.5 sm:px-2.5 py-1 sm:py-1.5 rounded-full text-[11px] sm:text-xs font-bold transition-all active:scale-95 cursor-pointer shrink-0"
          >
            <Flame className="w-3.5 h-3.5 fill-amber-400 text-amber-400 shrink-0" />
            <span>{userProfile?.dailyStreak || 1}</span>
          </button>

          {/* Coins */}
          <button
            onClick={() => {
              sounds.playPop();
              onOpenLeaderboard();
            }}
            title="Coins & Leaderboard"
            className="flex items-center gap-1 bg-yellow-500/10 hover:bg-yellow-500/20 border border-yellow-500/30 text-yellow-300 px-1.5 sm:px-2.5 py-1 sm:py-1.5 rounded-full text-[11px] sm:text-xs font-bold transition-all active:scale-95 cursor-pointer shrink-0"
          >
            <Coins className="w-3.5 h-3.5 text-yellow-400 shrink-0" />
            <span>{userProfile?.coins || 100}</span>
          </button>

          {/* Sound Toggle */}
          <button
            onClick={handleToggleSound}
            title={soundEnabled ? 'Mute Sounds' : 'Unmute Sounds'}
            className={`p-1.5 sm:p-2 rounded-full transition-colors cursor-pointer shrink-0 ${
              isPureBlack
                ? 'bg-neutral-900 hover:bg-neutral-800 text-slate-300 border border-neutral-800'
                : 'bg-slate-800/90 hover:bg-slate-700 text-slate-300 border border-slate-700/60'
            }`}
          >
            {soundEnabled ? (
              <Volume2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-cyan-400" />
            ) : (
              <VolumeX className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-500" />
            )}
          </button>

          {/* Log In Button: ONLY shown for guest visitors */}
          {isGuest && (
            <button
              onClick={() => {
                sounds.playPop();
                onOpenAuth();
              }}
              title="Log In / Sign Up"
              className="flex items-center gap-1 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black px-2.5 sm:px-3 py-1.5 rounded-xl text-[11px] sm:text-xs shadow-md shadow-cyan-500/20 active:translate-y-0.5 transition-all cursor-pointer shrink-0"
            >
              <LogIn className="w-3.5 h-3.5 shrink-0" />
              <span className="whitespace-nowrap font-extrabold">Log In</span>
            </button>
          )}

          {/* Authenticated User Action: Interactive Avatar Dropdown Menu */}
          {isAuthenticated && (
            <div className="relative" ref={userMenuRef}>
              <button
                type="button"
                onClick={() => {
                  sounds.playPop();
                  setIsUserMenuOpen((prev) => !prev);
                }}
                title={`Account: ${userProfile?.username || 'User'}`}
                className={`flex items-center gap-1 sm:gap-1.5 p-1 pr-1.5 sm:pr-2 rounded-full border transition-all active:scale-95 cursor-pointer shrink-0 select-none ${
                  isPureBlack
                    ? 'bg-neutral-950 hover:bg-black border-neutral-800 hover:border-cyan-500/50 text-white ring-1 ring-cyan-500/20'
                    : 'bg-slate-800/90 hover:bg-slate-800 border-slate-700/80 hover:border-cyan-500/40 text-slate-100'
                }`}
              >
                <div className="relative w-6 h-6 sm:w-7 sm:h-7 rounded-full overflow-hidden shrink-0 border border-cyan-400/60 shadow-xs">
                  <img
                    src={userProfile?.avatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=160&q=80'}
                    alt={userProfile?.username || 'Avatar'}
                    className="w-full h-full object-cover bg-slate-900"
                  />
                </div>
                <ChevronDown className={`w-3 h-3 sm:w-3.5 sm:h-3.5 text-cyan-400 transition-transform duration-200 ${isUserMenuOpen ? 'rotate-180' : ''}`} />
              </button>

              {/* Account Dropdown Menu */}
              {isUserMenuOpen && (
                <div
                  className={`absolute right-0 top-full mt-2 w-56 sm:w-64 rounded-2xl p-2.5 shadow-2xl border z-50 animate-scale-up ${
                    isPureBlack
                      ? 'bg-black/95 border-neutral-800 shadow-[0_12px_40px_rgba(0,0,0,0.95)] text-white'
                      : 'bg-slate-900/95 border-cyan-500/30 shadow-[0_12px_35px_rgba(6,182,212,0.18)] text-slate-100 backdrop-blur-xl'
                  }`}
                >
                  {/* Header inside dropdown */}
                  <div className="px-2.5 py-2 border-b border-neutral-800/80 mb-1.5 flex items-center gap-2.5">
                    <div className="relative w-9 h-9 rounded-xl overflow-hidden shrink-0 border border-cyan-400/40">
                      <img
                        src={userProfile?.avatar}
                        alt={userProfile?.username || 'Avatar'}
                        className="w-full h-full object-cover bg-slate-950"
                      />
                      <span className="absolute -bottom-0.5 -right-0.5 text-xs">
                        {userProfile?.countryFlag}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <span className="font-extrabold text-xs block text-white truncate leading-snug">
                        {userProfile?.username || 'Explorer'}
                      </span>
                      <div className="flex items-center gap-1 mt-0.5">
                        <span className="text-[10px] font-black uppercase text-amber-400 bg-amber-400/10 border border-amber-400/30 px-1.5 py-0.2 rounded">
                          LVL {userProfile?.level || 1}
                        </span>
                        {userProfile?.email && (
                          <span className="text-[10px] text-slate-400 truncate max-w-[100px]" title={userProfile.email}>
                            {userProfile.email}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Menu Items */}
                  <div className="space-y-1">
                    <button
                      onClick={() => {
                        sounds.playPop();
                        setIsUserMenuOpen(false);
                        if (onNavigateProfile) {
                          onNavigateProfile();
                        }
                      }}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-bold transition-colors cursor-pointer text-left ${
                        isPureBlack
                          ? 'hover:bg-neutral-900 text-slate-200 hover:text-cyan-300'
                          : 'hover:bg-slate-800 text-slate-200 hover:text-cyan-300'
                      }`}
                    >
                      <User className="w-4 h-4 text-cyan-400 shrink-0" />
                      <span>View Profile &amp; Badges</span>
                    </button>

                    {userProfile?.role === 'admin' && (
                      <button
                        onClick={() => {
                          sounds.playPop();
                          setIsUserMenuOpen(false);
                          onOpenAdmin();
                        }}
                        className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-bold transition-colors cursor-pointer text-left ${
                          isPureBlack
                            ? 'hover:bg-neutral-900 text-rose-300 hover:text-rose-200'
                            : 'hover:bg-slate-800 text-rose-300 hover:text-rose-200'
                        }`}
                      >
                        <Shield className="w-4 h-4 text-rose-400 shrink-0" />
                        <span>Admin Dashboard</span>
                      </button>
                    )}

                    <button
                      onClick={async () => {
                        sounds.playPop();
                        setIsUserMenuOpen(false);
                        await logout();
                      }}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-bold transition-colors cursor-pointer text-left ${
                        isPureBlack
                          ? 'hover:bg-rose-500/15 text-rose-400 hover:text-rose-300'
                          : 'hover:bg-rose-500/20 text-rose-400 hover:text-rose-300'
                      }`}
                    >
                      <LogOut className="w-4 h-4 text-rose-400 shrink-0" />
                      <span>Log Out</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Admin link if role is admin and user menu is not open */}
          {userProfile?.role === 'admin' && !isAuthenticated && (
            <button
              onClick={() => {
                sounds.playPop();
                onOpenAdmin();
              }}
              title="Admin Dashboard"
              className="p-1.5 sm:p-2 rounded-full bg-rose-500/20 border border-rose-500/40 text-rose-300 hover:bg-rose-500/30 transition-colors cursor-pointer shrink-0"
            >
              <Shield className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
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
  const { isDark, isPureBlack } = useTheme();
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
    <nav
      className={`fixed bottom-0 left-0 right-0 z-40 backdrop-blur-xl border-t pb-safe px-2 sm:px-6 transition-colors duration-300 ${
        isPureBlack
          ? 'bg-black/95 border-neutral-900 shadow-[0_-4px_24px_rgba(0,0,0,0.85)]'
          : 'bg-[#0E1424]/95 border-slate-800/90'
      }`}
    >
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
                  className={`w-14 h-14 rounded-full flex items-center justify-center transition-all duration-150 active:scale-95 will-change-transform ${
                    isActive
                      ? 'bg-gradient-to-tr from-cyan-500 via-teal-400 to-emerald-400 text-slate-950 font-black shadow-[0_4px_20px_rgba(6,182,212,0.45)] ring-4 ring-cyan-500/25 scale-105'
                      : 'bg-gradient-to-tr from-cyan-500 to-teal-400 text-slate-950 shadow-[0_4px_16px_rgba(6,182,212,0.3)] hover:scale-105'
                  }`}
                >
                  <Icon className="w-7 h-7 text-slate-950 stroke-[2.5]" />
                </div>
                <span
                  className={`text-[10px] font-extrabold mt-1 transition-colors ${
                    isActive ? 'text-cyan-400' : isDark ? 'text-slate-400' : 'text-slate-500'
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
                isActive
                  ? 'text-cyan-400 font-bold'
                  : isDark
                  ? 'text-slate-400 hover:text-slate-200'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <div className="relative">
                <Icon className={`w-5 h-5 ${isActive ? 'stroke-[2.5]' : 'stroke-2'}`} />
                {isActive && (
                  <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 bg-cyan-400 rounded-full shadow-[0_0_6px_rgba(6,182,212,0.6)]" />
                )}
              </div>
              <span className={`text-[10px] mt-1 font-semibold ${isActive ? 'text-cyan-400' : ''}`}>
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
