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

  const [currentTab, setCurrentTab] = useState<
    'home' | 'explore' | 'play' | 'passport' | 'profile' | 'leaderboard'
  >('home');

  // Modals & Active Game State
  const [activeRoom, setActiveRoom] = useState<GameRoom | null>(null);
  const [matchmakingCategory, setMatchmakingCategory] = useState<GameCategory | 'mixed' | null>(null);
  const [isDailyChallengeOpen, setIsDailyChallengeOpen] = useState(false);
  const [isAdminOpen, setIsAdminOpen] = useState(false);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(sounds.isEnabled());

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

  if (loading) {
    return (
      <div className="min-h-[100dvh] w-full bg-slate-950 flex flex-col items-center justify-center p-4 text-slate-100">
        <div className="w-16 h-16 rounded-3xl bg-gradient-to-tr from-amber-500 via-rose-500 to-indigo-600 flex items-center justify-center text-3xl shadow-xl shadow-rose-500/20 animate-bounce mb-4">
          🌍
        </div>
        <h1 className="text-xl font-black tracking-tight text-white">WORLD CHALLENGE</h1>
        <p className="text-xs text-slate-400 mt-1">Connecting to global game arena...</p>
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
          setActiveRoom(null);
          setMatchmakingCategory(activeRoom.gameMode);
        }}
      />
    );
  }

  return (
    <div className="min-h-[100dvh] w-full bg-slate-950 text-slate-100 selection:bg-rose-500 selection:text-white flex flex-col">
      {/* Top Header */}
      <TopHeader
        onOpenDailyChallenge={() => setIsDailyChallengeOpen(true)}
        onOpenAdmin={() => setIsAdminOpen(true)}
        soundEnabled={soundEnabled}
        setSoundEnabled={setSoundEnabled}
        onOpenLeaderboard={() => setCurrentTab('leaderboard')}
        onOpenAuth={() => setIsAuthOpen(true)}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-md w-full mx-auto p-4">
        {currentTab === 'home' && (
          <HomeScreen
            onStartMatchmaking={() => setMatchmakingCategory('mixed')}
            onNavigateTab={(tab) => setCurrentTab(tab)}
            onOpenDailyChallenge={() => setIsDailyChallengeOpen(true)}
            onOpenAuth={() => setIsAuthOpen(true)}
          />
        )}

        {currentTab === 'explore' && (
          <ExploreScreen
            passportStamps={stamps}
            onStartMatchmakingWithCountry={(code) => {
              setMatchmakingCategory('mixed');
            }}
          />
        )}

        {currentTab === 'play' && (
          <PlayScreen
            onStartMatch={(cat) => {
              setMatchmakingCategory(cat);
            }}
          />
        )}

        {currentTab === 'passport' && userProfile && (
          <PassportScreen
            user={userProfile}
            stamps={stamps}
            onStartMatchWithCountry={(code) => {
              setMatchmakingCategory('mixed');
            }}
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
            onClose={() => setMatchmakingCategory(null)}
            user={userProfile}
            category={matchmakingCategory}
            onMatchFound={(room) => {
              setMatchmakingCategory(null);
              setActiveRoom(room);
            }}
          />
        ) : (
          <AuthModal
            isOpen={true}
            onClose={() => setMatchmakingCategory(null)}
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
