import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { TopHeader, BottomNavigation } from './components/Navigation';
import { HomeScreen } from './views/HomeScreen';
import { ExploreScreen } from './views/ExploreScreen';
import { PlayScreen } from './views/PlayScreen';
import { PassportScreen } from './views/PassportScreen';
import { ProfileScreen } from './views/ProfileScreen';
import { LeaderboardScreen } from './views/LeaderboardScreen';
import { GameRoomScreen } from './views/GameRoomScreen';
import { MatchmakingModal } from './components/MatchmakingModal';
import { DailyChallengeModal } from './components/DailyChallengeModal';
import { AdminPanelModal } from './components/AdminPanelModal';
import { AuthModal } from './components/AuthModal';
import { GameCategory, GameRoom, PassportStamp } from './types/game';
import { getUserPassportStamps } from './services/userService';
import { COUNTRIES } from './services/countryData';
import { sounds } from './services/soundEffects';

function AppContent() {
  const { userProfile, loading } = useAuth();

  const [currentTab, setCurrentTabState] = useState<
    'home' | 'explore' | 'play' | 'passport' | 'profile' | 'leaderboard'
  >(() => {
    if (typeof window !== 'undefined') {
      const path = window.location.pathname.replace(/^\/+|\/+$/g, '').toLowerCase();
      if (
        path === 'explore' ||
        path === 'play' ||
        path === 'passport' ||
        path === 'profile' ||
        path === 'leaderboard'
      ) {
        return path;
      }
    }
    return 'home';
  });

  const setCurrentTab = (
    tab: 'home' | 'explore' | 'play' | 'passport' | 'profile' | 'leaderboard'
  ) => {
    setCurrentTabState(tab);
    if (typeof window !== 'undefined') {
      const newPath = tab === 'home' ? '/' : `/${tab}`;
      if (window.location.pathname !== newPath) {
        window.history.pushState({ tab }, '', newPath);
      }
    }
  };

  useEffect(() => {
    const handlePopState = () => {
      const path = window.location.pathname.replace(/^\/+|\/+$/g, '').toLowerCase();
      if (
        path === 'explore' ||
        path === 'play' ||
        path === 'passport' ||
        path === 'profile' ||
        path === 'leaderboard'
      ) {
        setCurrentTabState(path);
      } else {
        setCurrentTabState('home');
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Modals & Active Game State
  const [activeRoom, setActiveRoom] = useState<GameRoom | null>(null);
  const [matchmakingCategory, setMatchmakingCategory] = useState<GameCategory | 'mixed' | null>(null);
  const [matchmakingTargetCountry, setMatchmakingTargetCountry] = useState<string | undefined>(undefined);
  const [isDailyChallengeOpen, setIsDailyChallengeOpen] = useState(false);
  const [isAdminOpen, setIsAdminOpen] = useState(false);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(sounds.isEnabled());

  const startCulturalQuizMatchmaking = (
    category: GameCategory | 'mixed' = 'cultural_quiz',
    targetCountry?: string
  ) => {
    setMatchmakingTargetCountry(targetCountry);
    setMatchmakingCategory(category);
  };

  // Passport stamps
  const [stamps, setStamps] = useState<PassportStamp[]>([]);

  useEffect(() => {
    const defaultStarter = userProfile?.countryCode
      ? (() => {
          const countryInfo = COUNTRIES.find((c) => c.code === userProfile.countryCode);
          if (!countryInfo) return [];
          return [
            {
              id: `starter_${userProfile.countryCode}`,
              userId: userProfile.uid,
              countryCode: userProfile.countryCode,
              countryName: countryInfo.name,
              countryFlag: countryInfo.flag,
              capital: countryInfo.capital,
              continent: countryInfo.continent,
              unlockedAt: userProfile.createdAt,
              metPlayerUsername: 'Home Country',
              metPlayerAvatar: countryInfo.flag,
              gamesPlayedWith: 0,
              scoreAchieved: 0,
            },
          ];
        })()
      : [];

    if (userProfile?.uid && !userProfile.uid.startsWith('guest_')) {
      getUserPassportStamps(userProfile.uid)
        .then((s) => {
          if (s && s.length > 0) {
            setStamps(s);
          } else {
            setStamps(defaultStarter);
          }
        })
        .catch(() => {
          setStamps(defaultStarter);
        });
    } else {
      setStamps(defaultStarter);
    }
  }, [userProfile?.uid, userProfile?.countryCode, userProfile?.discoveredCountries?.length]);

  // Smooth scroll to top on tab switch
  React.useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, [currentTab]);

  if (loading) {
    return (
      <div className="min-h-[100dvh] w-full bg-[#0B0F19] flex flex-col items-center justify-center p-4 text-slate-100">
        <div className="w-16 h-16 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-3xl shadow-[0_0_30px_rgba(6,182,212,0.25)] mb-4 animate-pulse">
          🧭
        </div>
        <h1 className="text-xl font-black tracking-widest text-white">MAPIA</h1>
        <p className="text-xs text-cyan-400 font-semibold tracking-wider uppercase mt-1">World Challenge</p>
      </div>
    );
  }

  // Active Game Room takes over entire viewport
  if (activeRoom && userProfile) {
    return (
      <GameRoomScreen
        initialRoom={activeRoom}
        user={userProfile}
        onExitRoom={() => {
          sounds.playPop();
          setActiveRoom(null);
          setCurrentTab('home');
        }}
        onRematch={() => {
          sounds.playPop();
          const prevMode = activeRoom.gameMode;
          const prevCountry = activeRoom.targetCountryCode;
          setActiveRoom(null);
          startCulturalQuizMatchmaking(
            prevMode === 'word_scramble'
              ? 'word_scramble'
              : prevMode === 'guess_number'
              ? 'guess_number'
              : 'cultural_quiz',
            prevCountry
          );
        }}
      />
    );
  }

  return (
    <div className="min-h-[100dvh] w-full bg-[#0B0F19] text-slate-100 selection:bg-cyan-500 selection:text-slate-950 flex flex-col relative overflow-x-hidden">
      {/* Subtle Atmospheric Grid & Explorer Depth (clean, zero-slop ambient lighting) */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden z-0">
        <div className="absolute -top-40 left-1/3 w-[600px] h-[600px] bg-cyan-500/[0.035] rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute -bottom-40 right-1/4 w-[500px] h-[500px] bg-teal-500/[0.03] rounded-full blur-[120px] pointer-events-none" />
      </div>

      {/* Top Header */}
      <TopHeader
        onOpenDailyChallenge={() => setIsDailyChallengeOpen(true)}
        onOpenAdmin={() => setIsAdminOpen(true)}
        soundEnabled={soundEnabled}
        setSoundEnabled={setSoundEnabled}
        onOpenLeaderboard={() => setCurrentTab('leaderboard')}
        onOpenAuth={() => setIsAuthOpen(true)}
      />

      {/* Main Content Area: Responsive Container across Mobile, Tablet, and Desktop */}
      <main className="relative z-10 flex-1 w-full max-w-md sm:max-w-2xl md:max-w-4xl lg:max-w-5xl mx-auto px-4 sm:px-6 md:px-8 pt-5 sm:pt-7 pb-28 sm:pb-32">
        {currentTab === 'home' && (
          <HomeScreen
            onStartMatchmaking={() => startCulturalQuizMatchmaking('cultural_quiz')}
            onNavigateTab={(tab) => setCurrentTab(tab)}
            onOpenDailyChallenge={() => setIsDailyChallengeOpen(true)}
            onOpenAuth={() => setIsAuthOpen(true)}
          />
        )}

        {currentTab === 'explore' && (
          <ExploreScreen
            passportStamps={stamps}
            onStartMatchmakingWithCountry={(code) => startCulturalQuizMatchmaking('cultural_quiz', code)}
          />
        )}

        {currentTab === 'play' && (
          <PlayScreen
            onStartMatch={(cat) => startCulturalQuizMatchmaking(cat)}
          />
        )}

        {currentTab === 'passport' && userProfile && (
          <PassportScreen
            user={userProfile}
            stamps={stamps}
            onStartMatchWithCountry={(code) => startCulturalQuizMatchmaking('cultural_quiz', code)}
          />
        )}

        {currentTab === 'profile' && userProfile && (
          <ProfileScreen
            user={userProfile}
            onOpenAuth={() => setIsAuthOpen(true)}
            soundEnabled={soundEnabled}
            setSoundEnabled={setSoundEnabled}
          />
        )}

        {currentTab === 'leaderboard' && userProfile && (
          <LeaderboardScreen currentUser={userProfile} />
        )}
      </main>

      {/* Bottom Mobile-First Navigation */}
      <BottomNavigation
        currentTab={currentTab}
        setCurrentTab={setCurrentTab}
        onOpenDailyChallenge={() => setIsDailyChallengeOpen(true)}
        onOpenAdmin={() => setIsAdminOpen(true)}
        soundEnabled={soundEnabled}
        setSoundEnabled={setSoundEnabled}
      />

      {/* Matchmaking Overlay Modal */}
      {matchmakingCategory && (
        userProfile ? (
          <MatchmakingModal
            isOpen={Boolean(matchmakingCategory)}
            onClose={() => {
              setMatchmakingCategory(null);
              setMatchmakingTargetCountry(undefined);
            }}
            user={userProfile}
            category={matchmakingCategory}
            targetCountryCode={matchmakingTargetCountry}
            onMatchFound={(room) => {
              setMatchmakingCategory(null);
              setMatchmakingTargetCountry(undefined);
              setActiveRoom(room);
            }}
          />
        ) : (
          <AuthModal
            isOpen={true}
            onClose={() => {
              setMatchmakingCategory(null);
              setMatchmakingTargetCountry(undefined);
            }}
          />
        )
      )}

      {/* Daily Challenge Modal */}
      {isDailyChallengeOpen && userProfile && (
        <DailyChallengeModal
          isOpen={isDailyChallengeOpen}
          onClose={() => setIsDailyChallengeOpen(false)}
          user={userProfile}
        />
      )}

      {/* Admin Panel Modal */}
      {isAdminOpen && (
        <AdminPanelModal
          isOpen={isAdminOpen}
          onClose={() => setIsAdminOpen(false)}
        />
      )}

      {/* Authentication Modal */}
      {isAuthOpen && (
        <AuthModal
          isOpen={isAuthOpen}
          onClose={() => setIsAuthOpen(false)}
        />
      )}
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
