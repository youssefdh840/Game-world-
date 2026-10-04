import React, { useState, useEffect } from 'react';
import { UserProfile } from '../types/game';
import { useAuth } from '../context/AuthContext';
import { COUNTRIES } from '../services/countryData';
import { BADGES } from '../services/badgesData';
import { calculateLevel, subscribeToUserProfile } from '../services/userService';
import { sounds } from '../services/soundEffects';
import {
  Globe,
  Award,
  Trophy,
  Flame,
  Gamepad2,
  CheckCircle2,
  LogOut,
  Edit2,
  Save,
  Volume2,
  VolumeX,
  LogIn,
  Loader2,
} from 'lucide-react';

interface ProfileScreenProps {
  user: UserProfile;
  onOpenAuth: () => void;
  soundEnabled: boolean;
  setSoundEnabled: React.Dispatch<React.SetStateAction<boolean>>;
}

export const ProfileScreen: React.FC<ProfileScreenProps> = ({
  user,
  onOpenAuth,
  soundEnabled,
  setSoundEnabled,
}) => {
  const { logout, firebaseUser, updateProfile } = useAuth();
  const [liveUser, setLiveUser] = useState<UserProfile>(user);
  const [isEditing, setIsEditing] = useState(false);
  const [username, setUsername] = useState(user.username);
  const [countryCode, setCountryCode] = useState(user.countryCode);
  const [bio, setBio] = useState(user.bio || '');
  const [language, setLanguage] = useState(user.preferredLanguage || 'English');
  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  // Sync with prop updates
  useEffect(() => {
    setLiveUser(user);
    if (!isEditing) {
      setUsername(user.username);
      setCountryCode(user.countryCode);
      setBio(user.bio || '');
      setLanguage(user.preferredLanguage || 'English');
    }
  }, [user, isEditing]);

  // Direct real-time Firestore onSnapshot listener for immediate stats/XP/streak updates
  useEffect(() => {
    const activeUid = firebaseUser?.uid || user.uid;
    if (!activeUid) return;
    const unsub = subscribeToUserProfile(activeUid, (updatedProfile) => {
      if (updatedProfile) {
        setLiveUser(updatedProfile);
      }
    });
    return () => unsub();
  }, [firebaseUser?.uid, user.uid]);

  const totalVictories = liveUser.victories ?? liveUser.gamesWon ?? 0;
  const totalGamesPlayed = liveUser.gamesPlayed || 0;
  const levelInfo = calculateLevel(liveUser.xp || 0);
  const winRate =
    totalGamesPlayed > 0
      ? Math.round((totalVictories / totalGamesPlayed) * 100)
      : 0;

  const unlockedBadgeIds = new Set(liveUser.unlockedBadges || []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    sounds.playPop();

    const selectedCountry = COUNTRIES.find((c) => c.code === countryCode) || COUNTRIES[0];

    try {
      await updateProfile({
        username: username.trim(),
        countryCode: selectedCountry.code,
        countryName: selectedCountry.name,
        countryFlag: selectedCountry.flag,
        bio: bio.trim(),
        preferredLanguage: language,
      });
      sounds.playCorrect();
      setIsEditing(false);
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3000);
    } catch (err) {
      console.error('Error saving profile:', err);
      sounds.playWrong();
    } finally {
      setSaving(false);
    }
  };

  const handleToggleSound = () => {
    const next = sounds.toggleSound();
    setSoundEnabled(next);
    if (next) sounds.playPop();
  };

  return (
    <div className="space-y-5 pb-28 animate-fade-in">
      {/* Profile Card Header */}
      <div className="relative overflow-hidden rounded-3xl bg-slate-900 border border-slate-800 p-5 shadow-xl text-center">
        {/* Glow backdrop */}
        <div className="absolute -top-10 -right-10 w-36 h-36 bg-indigo-500/15 rounded-full blur-2xl pointer-events-none" />

        <div className="relative inline-block mb-2">
          <img
            src={liveUser.avatar}
            alt={liveUser.username}
            className="w-20 h-20 mx-auto rounded-3xl object-cover ring-2 ring-indigo-500 shadow-xl bg-slate-800"
          />
          <span className="absolute -bottom-1 -right-1 text-2xl p-0.5 bg-slate-900 rounded-full shadow">
            {liveUser.countryFlag}
          </span>
        </div>

        <h2 className="text-xl font-black text-white">{liveUser.username}</h2>
        <p className="text-xs text-indigo-300 font-semibold mt-0.5">
          {liveUser.countryName} • {liveUser.preferredLanguage || 'English'}
        </p>
        <p className="text-xs text-slate-400 mt-2 max-w-xs mx-auto italic">
          "{liveUser.bio || 'World Challenge traveler ready for cultural duels!'}"
        </p>

        {/* Level & XP */}
        <div className="mt-4 pt-4 border-t border-slate-800/80">
          <div className="flex justify-between items-center text-xs mb-1 font-bold">
            <span className="text-amber-400">Level {levelInfo.level}</span>
            <span className="text-slate-400 font-mono">
              {levelInfo.xpInCurrentLevel} / {levelInfo.nextLevelThreshold - levelInfo.currentLevelBase} XP ({liveUser.xp || 0} Total XP)
            </span>
          </div>
          <div className="w-full h-2.5 bg-slate-800 rounded-full overflow-hidden p-0.5">
            <div
              className="h-full rounded-full bg-gradient-to-r from-amber-400 via-rose-500 to-indigo-500"
              style={{ width: `${Math.max(5, levelInfo.progressPercent)}%` }}
            />
          </div>
        </div>

        {/* Edit Button */}
        <button
          onClick={() => {
            sounds.playPop();
            setIsEditing(!isEditing);
          }}
          className="mt-4 inline-flex items-center gap-1.5 text-xs font-bold text-indigo-400 hover:text-indigo-300 bg-indigo-950/60 border border-indigo-500/30 px-3 py-1.5 rounded-xl cursor-pointer transition-colors"
        >
          <Edit2 className="w-3.5 h-3.5" />
          <span>{isEditing ? 'Cancel Editing' : 'Edit Profile'}</span>
        </button>
      </div>

      {savedSuccess && (
        <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs rounded-2xl text-center">
          Profile saved successfully!
        </div>
      )}

      {/* Edit Form */}
      {isEditing && (
        <form
          onSubmit={handleSave}
          className="bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-3 shadow-xl"
        >
          <h3 className="text-sm font-black text-white mb-2">Edit Traveler Profile</h3>

          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
              Username
            </label>
            <input
              type="text"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
              Country
            </label>
            <select
              value={countryCode}
              onChange={(e) => setCountryCode(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
            >
              {COUNTRIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.flag} {c.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
              Bio / Motto
            </label>
            <textarea
              rows={2}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              maxLength={200}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
              Preferred Language
            </label>
            <input
              type="text"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
            />
          </div>

          <button
            type="submit"
            disabled={saving}
            className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold text-xs flex items-center justify-center gap-1.5 shadow-md active:scale-98 transition-all cursor-pointer disabled:opacity-50"
          >
            {saving ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Saving Changes...</span>
              </>
            ) : (
              <>
                <Save className="w-3.5 h-3.5" />
                <span>Save Changes</span>
              </>
            )}
          </button>
        </form>
      )}

      {/* Career Statistics Grid */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-[10px] font-bold uppercase">Games Played</span>
            <Gamepad2 className="w-4 h-4 text-indigo-400" />
          </div>
          <span className="text-2xl font-black text-white">{totalGamesPlayed}</span>
          <span className="text-[10px] text-slate-500 mt-1">Total duels &amp; quests</span>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-[10px] font-bold uppercase">Victories</span>
            <Trophy className="w-4 h-4 text-yellow-400" />
          </div>
          <span className="text-2xl font-black text-yellow-400">{totalVictories}</span>
          <span className="text-[10px] text-slate-500 mt-1">{winRate}% win rate</span>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-[10px] font-bold uppercase">Discovered</span>
            <Globe className="w-4 h-4 text-emerald-400" />
          </div>
          <span className="text-2xl font-black text-emerald-400">
            {liveUser.discoveredCountries?.length || 1}
          </span>
          <span className="text-[10px] text-slate-500 mt-1">Country visas stamped</span>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-[10px] font-bold uppercase">Play Streak</span>
            <Flame className="w-4 h-4 text-amber-400" />
          </div>
          <span className="text-2xl font-black text-amber-400">{liveUser.dailyStreak || 1}</span>
          <span className="text-[10px] text-slate-500 mt-1">Days in a row</span>
        </div>
      </div>

      {/* Badges & Achievements Showcase */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Award className="w-4 h-4 text-amber-400" />
            <h3 className="text-sm font-extrabold text-white">Achievements & Badges</h3>
          </div>
          <span className="text-xs font-mono font-bold text-amber-400">
            {unlockedBadgeIds.size} / {BADGES.length}
          </span>
        </div>

        <div className="space-y-2.5">
          {BADGES.map((badge) => {
            const isUnlocked = unlockedBadgeIds.has(badge.id);

            return (
              <div
                key={badge.id}
                className={`p-3 rounded-2xl border flex items-center justify-between text-xs transition-colors ${
                  isUnlocked
                    ? 'bg-slate-800/80 border-amber-500/30 text-white'
                    : 'bg-slate-900/40 border-slate-800/60 text-slate-500 opacity-60'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0 ${
                      isUnlocked ? 'bg-amber-500/20' : 'bg-slate-800'
                    }`}
                  >
                    {badge.icon}
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="font-extrabold text-white">{badge.title}</span>
                      {isUnlocked && (
                        <CheckCircle2 className="w-3.5 h-3.5 text-amber-400" />
                      )}
                    </div>
                    <p className="text-[11px] text-slate-400 leading-snug">{badge.description}</p>
                  </div>
                </div>

                <span className="font-mono text-[10px] font-bold text-amber-400 shrink-0 ml-2">
                  +{badge.xpReward} XP
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Account Settings & Preferences */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-4 space-y-3">
        {/* Sound toggle button */}
        <div className="flex items-center justify-between py-1">
          <div className="flex items-center gap-2.5 text-xs text-slate-300 font-semibold">
            {soundEnabled ? (
              <Volume2 className="w-4 h-4 text-emerald-400" />
            ) : (
              <VolumeX className="w-4 h-4 text-slate-500" />
            )}
            <span>Sound Effects & Audio Cues</span>
          </div>
          <button
            onClick={handleToggleSound}
            className={`px-3 py-1 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
              soundEnabled
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                : 'bg-slate-800 text-slate-400'
            }`}
          >
            {soundEnabled ? 'Enabled' : 'Muted'}
          </button>
        </div>

        {/* Auth / Logout / Login */}
        <div className="pt-2 border-t border-slate-800">
          {firebaseUser && !firebaseUser.isAnonymous ? (
            <div className="space-y-2">
              <div className="flex items-center justify-center text-xs text-slate-300 bg-slate-950/60 px-4 py-3 rounded-2xl border border-slate-800">
                <span className="font-bold text-white truncate">
                  {liveUser.username || firebaseUser.displayName || firebaseUser.email}
                </span>
              </div>
              <button
                onClick={() => {
                  sounds.playPop();
                  logout();
                }}
                className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-rose-500/20 hover:text-rose-400 text-slate-300 font-bold text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
                <span>Sign Out of Account</span>
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="bg-indigo-950/40 border border-indigo-500/30 p-3 rounded-2xl">
                <span className="text-xs font-bold text-indigo-300 block mb-0.5">Playing in Guest Mode</span>
                <p className="text-[11px] text-slate-400 leading-snug">
                  Log in or create a free account to permanently save your progress, coins, country stamps, and rank.
                </p>
              </div>
              <button
                onClick={() => {
                  sounds.playPop();
                  onOpenAuth();
                }}
                className="w-full py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-rose-600 hover:from-amber-400 hover:to-rose-500 text-white font-extrabold text-xs flex items-center justify-center gap-2 shadow-lg shadow-rose-500/20 active:scale-95 transition-all cursor-pointer"
              >
                <LogIn className="w-4 h-4 stroke-[2.5]" />
                <span>Log In / Create Account</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Created by Footer with Diamond-Crowned Instagram Logo */}
      <footer className="pt-2 pb-4 flex justify-center">
        <a
          href="https://www.instagram.com/nefzaouiassil?stkn=MTRkZXUzN3R3emJoNA=="
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => sounds.playPop()}
          className="group inline-flex items-center gap-3 px-4 py-2.5 rounded-2xl bg-slate-900/90 hover:bg-slate-900 border border-slate-800 hover:border-slate-600 shadow-lg transition-all active:scale-95 cursor-pointer"
        >
          {/* Diamond-Crowned Instagram Icon Badge */}
          <div className="w-9 h-9 rounded-xl bg-black border border-slate-700/80 group-hover:border-white/40 flex items-center justify-center shadow-md overflow-hidden shrink-0 transition-colors">
            <svg
              viewBox="0 0 64 64"
              className="w-7 h-7"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
            >
              <defs>
                <linearGradient id="diamondSilver" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#FFFFFF" />
                  <stop offset="35%" stopColor="#CBD5E1" />
                  <stop offset="65%" stopColor="#F8FAFC" />
                  <stop offset="100%" stopColor="#94A3B8" />
                </linearGradient>
                <linearGradient id="crownFacet" x1="0%" y1="100%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#94A3B8" />
                  <stop offset="50%" stopColor="#FFFFFF" />
                  <stop offset="100%" stopColor="#E2E8F0" />
                </linearGradient>
              </defs>
              {/* Tilted Diamond Crown on Top */}
              <g transform="rotate(-10 32 18)">
                <path
                  d="M14 23L11 12L21 17L29 7L36 17L47 11L44 23H14Z"
                  fill="url(#crownFacet)"
                  stroke="#FFFFFF"
                  strokeWidth="1.5"
                  strokeLinejoin="round"
                />
                <path
                  d="M14 23H44V26C44 26.8 43.3 27.5 42.5 27.5H15.5C14.7 27.5 14 26.8 14 26V23Z"
                  fill="url(#diamondSilver)"
                  stroke="#FFFFFF"
                  strokeWidth="1.2"
                />
                <circle cx="29" cy="6" r="1.6" fill="#FFFFFF" />
                <circle cx="11" cy="11" r="1.3" fill="#FFFFFF" />
                <circle cx="47" cy="10" r="1.3" fill="#FFFFFF" />
              </g>
              {/* Diamond-Cut Instagram Camera Body */}
              <rect
                x="15"
                y="23"
                width="34"
                height="33"
                rx="9"
                stroke="url(#diamondSilver)"
                strokeWidth="4.2"
              />
              {/* Inner Lens Ring */}
              <circle
                cx="32"
                cy="39.5"
                r="8.2"
                stroke="url(#diamondSilver)"
                strokeWidth="3.8"
              />
              {/* Flash Gem Dot */}
              <circle cx="42.5" cy="30" r="2.4" fill="#FFFFFF" />
              {/* Diamond Sparkle Glints */}
              <path d="M15 29L17 30L15 31L14 33L13 31L11 30L13 29L14 27L15 29Z" fill="#FFFFFF" />
              <path d="M50 45L51.5 46L50 47L49 48.5L48 47L46.5 46L48 45L49 43.5L50 45Z" fill="#FFFFFF" />
            </svg>
          </div>

          <div className="text-left">
            <span className="text-xs font-extrabold text-slate-200 group-hover:text-white tracking-wide transition-colors">
              Created by <span className="text-transparent bg-clip-text bg-gradient-to-r from-white via-slate-200 to-amber-300 font-black">nefzaouiassil</span>
            </span>
            <span className="block text-[10px] text-slate-400 group-hover:text-slate-300">
              @nefzaouiassil • Instagram
            </span>
          </div>
        </a>
      </footer>
    </div>
  );
};
