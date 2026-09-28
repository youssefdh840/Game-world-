import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  User as FirebaseUser,
  onAuthStateChanged,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  signInAnonymously,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
} from 'firebase/auth';
import { auth } from '../services/firebase';
import { UserProfile } from '../types/game';
import {
  getUserProfile,
  createUserProfile,
  subscribeToUserProfile,
} from '../services/userService';
import { COUNTRIES } from '../services/countryData';

interface AuthContextType {
  firebaseUser: FirebaseUser | null;
  userProfile: UserProfile | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signInWithEmail: (email: string, pass: string) => Promise<void>;
  signUpWithEmail: (email: string, pass: string, profileData: Partial<UserProfile>) => Promise<void>;
  signInAsGuest: (customUsername?: string, countryCode?: string) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const DEFAULT_GUEST_COUNTRY = COUNTRIES.find((c) => c.code === 'TN') || COUNTRIES[0];

function createFallbackProfile(uid: string = 'guest_' + Math.random().toString(36).substring(2, 8)): UserProfile {
  return {
    uid,
    username: 'Explorer_' + uid.slice(-4),
    avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=160&q=80',
    countryCode: DEFAULT_GUEST_COUNTRY.code,
    countryName: DEFAULT_GUEST_COUNTRY.name,
    countryFlag: DEFAULT_GUEST_COUNTRY.flag,
    bio: 'Passionate world traveler and quiz challenger!',
    preferredLanguage: 'English',
    level: 1,
    xp: 0,
    coins: 100,
    gamesPlayed: 0,
    gamesWon: 0,
    discoveredCountries: [DEFAULT_GUEST_COUNTRY.code],
    unlockedBadges: [],
    dailyStreak: 1,
    role: 'user',
    createdAt: new Date().toISOString(),
    lastActiveAt: new Date().toISOString(),
  };
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(() => {
    if (typeof window !== 'undefined') {
      try {
        const cached = localStorage.getItem('wc_cached_profile');
        if (cached) return JSON.parse(cached);
      } catch {
        // ignore
      }
    }
    return createFallbackProfile();
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let unsubProfile: (() => void) | null = null;
    let isMounted = true;

    const unsubAuth = onAuthStateChanged(auth, async (user) => {
      if (!isMounted) return;
      setFirebaseUser(user);

      if (user) {
        // Fetch or subscribe to user profile
        try {
          const profile = await getUserProfile(user.uid);
          if (profile && isMounted) {
            setUserProfile(profile);
            try {
              localStorage.setItem('wc_cached_profile', JSON.stringify(profile));
            } catch {
              // ignore
            }
          } else {
            // New user without document yet
            const defaultCountry = COUNTRIES.find((c) => c.code === 'TN') || COUNTRIES[0];
            const newProf: UserProfile = {
              uid: user.uid,
              username: user.displayName || `Explorer_${user.uid.slice(0, 4)}`,
              email: user.email || undefined,
              avatar: user.photoURL || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=160&q=80',
              countryCode: defaultCountry.code,
              countryName: defaultCountry.name,
              countryFlag: defaultCountry.flag,
              bio: 'Passionate world traveler and quiz challenger!',
              preferredLanguage: 'English',
              level: 1,
              xp: 0,
              coins: 100,
              gamesPlayed: 0,
              gamesWon: 0,
              discoveredCountries: [defaultCountry.code],
              unlockedBadges: [],
              dailyStreak: 1,
              role: user.email === 'youssefdh840@gmail.com' ? 'admin' : 'user',
              createdAt: new Date().toISOString(),
              lastActiveAt: new Date().toISOString(),
            };
            await createUserProfile(newProf);
            if (isMounted) {
              setUserProfile(newProf);
              try {
                localStorage.setItem('wc_cached_profile', JSON.stringify(newProf));
              } catch {
                // ignore
              }
            }
          }

          // Live subscription to profile updates (XP, coins, level)
          unsubProfile = subscribeToUserProfile(user.uid, (p) => {
            if (p && isMounted) {
              setUserProfile(p);
              try {
                localStorage.setItem('wc_cached_profile', JSON.stringify(p));
              } catch {
                // ignore
              }
            }
          });
        } catch (err) {
          console.error('Error fetching user profile:', err);
        }
      } else {
        // Automatically sign in as anonymous guest if not signed in
        signInAnonymously(auth).catch((err) => {
          console.warn('Anonymous sign-in deferred:', err);
        });
      }
    });

    return () => {
      isMounted = false;
      unsubAuth();
      if (unsubProfile) unsubProfile();
    };
  }, []);

  const signInWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
  };

  const signInWithEmail = async (email: string, pass: string) => {
    await signInWithEmailAndPassword(auth, email, pass);
  };

  const signUpWithEmail = async (
    email: string,
    pass: string,
    profileData: Partial<UserProfile>
  ) => {
    const cred = await createUserWithEmailAndPassword(auth, email, pass);
    const selectedCountry = COUNTRIES.find((c) => c.code === profileData.countryCode) || COUNTRIES[0];

    const newProfile: UserProfile = {
      uid: cred.user.uid,
      username: profileData.username || `Explorer_${cred.user.uid.slice(0, 4)}`,
      email: cred.user.email || undefined,
      avatar: profileData.avatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=160&q=80',
      countryCode: selectedCountry.code,
      countryName: selectedCountry.name,
      countryFlag: selectedCountry.flag,
      bio: profileData.bio || 'World traveler ready for cultural challenges!',
      preferredLanguage: profileData.preferredLanguage || 'English',
      age: profileData.age,
      level: 1,
      xp: 0,
      coins: 150,
      gamesPlayed: 0,
      gamesWon: 0,
      discoveredCountries: [selectedCountry.code],
      unlockedBadges: [],
      dailyStreak: 1,
      role: email === 'youssefdh840@gmail.com' ? 'admin' : 'user',
      createdAt: new Date().toISOString(),
      lastActiveAt: new Date().toISOString(),
    };

    await createUserProfile(newProfile);
    setUserProfile(newProfile);
  };

  const signInAsGuest = async (customUsername?: string, countryCode?: string) => {
    const cred = await signInAnonymously(auth);
    const selectedCountry = COUNTRIES.find((c) => c.code === countryCode) || COUNTRIES[0];

    const guestProfile: UserProfile = {
      uid: cred.user.uid,
      username: customUsername || `Player_${Math.floor(1000 + Math.random() * 9000)}`,
      avatar: `https://api.dicebear.com/7.x/bottts/svg?seed=${cred.user.uid}`,
      countryCode: selectedCountry.code,
      countryName: selectedCountry.name,
      countryFlag: selectedCountry.flag,
      bio: 'New challenger on World Challenge!',
      preferredLanguage: 'English',
      level: 1,
      xp: 0,
      coins: 100,
      gamesPlayed: 0,
      gamesWon: 0,
      discoveredCountries: [selectedCountry.code],
      unlockedBadges: [],
      dailyStreak: 1,
      role: 'user',
      createdAt: new Date().toISOString(),
      lastActiveAt: new Date().toISOString(),
    };

    await createUserProfile(guestProfile);
    setUserProfile(guestProfile);
  };

  const resetPassword = async (email: string) => {
    await sendPasswordResetEmail(auth, email);
  };

  const logout = async () => {
    try {
      localStorage.removeItem('wc_cached_profile');
    } catch {
      // ignore
    }
    await signOut(auth);
    setUserProfile(createFallbackProfile());
  };

  const refreshProfile = async () => {
    if (firebaseUser) {
      const p = await getUserProfile(firebaseUser.uid);
      if (p) setUserProfile(p);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        firebaseUser,
        userProfile,
        loading,
        signInWithGoogle,
        signInWithEmail,
        signUpWithEmail,
        signInAsGuest,
        resetPassword,
        logout,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
