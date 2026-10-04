import React, { useState, useEffect, useRef } from 'react';
import { UserProfile } from '../types/game';
import { useAuth } from '../context/AuthContext';
import { COUNTRIES, getCountryByCode } from '../services/countryData';
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
  Camera,
  Upload,
  Link as LinkIcon,
} from 'lucide-react';

const PRESET_AVATARS = [
  'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=240&q=80',
  'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=240&q=80',
  'https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?auto=format&fit=crop&w=240&q=80',
  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=240&q=80',
  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=240&q=80',
  'https://api.dicebear.com/7.x/adventurer/svg?seed=Atlas',
  'https://api.dicebear.com/7.x/adventurer/svg?seed=Sahara',
  'https://api.dicebear.com/7.x/bottts/svg?seed=Cosmos',
];

function compressImageToDataUrl(file: File, maxSize = 256, quality = 0.82): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read the selected image file.'));
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const img = new Image();
      img.onerror = () => resolve(dataUrl);
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          const size = Math.min(maxSize, Math.max(img.width, img.height, 128));
          canvas.width = size;
          canvas.height = size;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(dataUrl);
            return;
          }
          // Center-crop square
          const minDim = Math.min(img.width, img.height);
          const sx = (img.width - minDim) / 2;
          const sy = (img.height - minDim) / 2;
          ctx.drawImage(img, sx, sy, minDim, minDim, 0, 0, size, size);
          const compressed = canvas.toDataURL('image/jpeg', quality);
          resolve(compressed);
        } catch {
          resolve(dataUrl);
        }
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  });
}

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
  const [avatar, setAvatar] = useState(user.avatar);
  const [avatarUrlInput, setAvatarUrlInput] = useState('');
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [countryCode, setCountryCode] = useState(user.countryCode);
  const [bio, setBio] = useState(user.bio || '');
  const [language, setLanguage] = useState(user.preferredLanguage || 'English');
  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Sync with prop updates
  useEffect(() => {
    setLiveUser(user);
    if (!isEditing) {
      setUsername(user.username);
      setAvatar(user.avatar);
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

  const handleAvatarFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setAvatarError('Please select a valid image file (PNG, JPG, WEBP, GIF).');
      sounds.playWrong();
      return;
    }

    setAvatarError(null);
    setAvatarUploading(true);
    sounds.playPop();

    try {
      const dataUrl = await compressImageToDataUrl(file, 256, 0.85);
      setAvatar(dataUrl);
      setLiveUser((prev) => ({ ...prev, avatar: dataUrl }));
      // Immediately persist the new avatar to state, localStorage, and Firestore
      await updateProfile({ avatar: dataUrl });
      sounds.playCorrect();
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3000);
    } catch (err) {
      setAvatarError(err instanceof Error ? err.message : 'Failed to process image');
      sounds.playWrong();
    } finally {
      setAvatarUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleApplyAvatarUrl = async () => {
    const trimmed = avatarUrlInput.trim();
    if (!trimmed) return;
    if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://') && !trimmed.startsWith('data:image/')) {
      setAvatarError('Please enter a valid image URL starting with https://');
      sounds.playWrong();
      return;
    }
    setAvatarError(null);
    setAvatar(trimmed);
    setLiveUser((prev) => ({ ...prev, avatar: trimmed }));
    setAvatarUrlInput('');
    await updateProfile({ avatar: trimmed });
    sounds.playCorrect();
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 3000);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setAvatarError(null);
    sounds.playPop();

    const selectedCountry = getCountryByCode(countryCode) || COUNTRIES[0];
    const finalAvatar = avatarUrlInput.trim() || avatar || liveUser.avatar;

    try {
      await updateProfile({
        username: username.trim(),
        avatar: finalAvatar,
        countryCode: selectedCountry.code,
        countryName: selectedCountry.name,
        countryFlag: selectedCountry.flag,
        bio: bio.trim(),
        preferredLanguage: language,
      });
      sounds.playCorrect();
      setIsEditing(false);
      setAvatarUrlInput('');
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
    <div className="max-w-4xl mx-auto space-y-6 sm:space-y-7 pb-8 animate-fade-in">
      {/* Profile Card Header */}
      <div className="relative overflow-hidden rounded-3xl bg-slate-900 border border-slate-800 p-5 sm:p-7 md:p-8 shadow-xl text-center">
        {/* Glow backdrop */}
        <div className="absolute -top-10 -right-10 w-36 h-36 bg-indigo-500/15 rounded-full blur-2xl pointer-events-none" />

        {/* Hidden File Input for Direct Avatar Upload */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleAvatarFileChange}
          className="hidden"
        />

        <div className="relative inline-block mb-3 group">
          <img
            src={isEditing ? avatar || liveUser.avatar : liveUser.avatar}
            alt={liveUser.username}
            className="w-20 h-20 sm:w-24 sm:h-24 mx-auto rounded-3xl object-cover ring-2 ring-indigo-500 shadow-xl bg-slate-800"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={avatarUploading}
            title="Upload custom profile picture"
            className="absolute inset-0 rounded-3xl bg-slate-950/60 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity flex flex-col items-center justify-center text-white cursor-pointer"
          >
            {avatarUploading ? (
              <Loader2 className="w-6 h-6 animate-spin text-indigo-400" />
            ) : (
              <>
                <Camera className="w-6 h-6 text-white drop-shadow" />
                <span className="text-[10px] font-extrabold mt-0.5">Change</span>
              </>
            )}
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={avatarUploading}
            title="Upload custom profile picture"
            className="absolute -top-1.5 -right-1.5 w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-indigo-600 hover:bg-indigo-500 border-2 border-slate-900 text-white flex items-center justify-center shadow-lg transition-transform active:scale-95 cursor-pointer"
          >
            {avatarUploading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Camera className="w-3.5 h-3.5" />
            )}
          </button>
          <span className="absolute -bottom-1 -right-1 text-2xl p-0.5 bg-slate-900 rounded-full shadow pointer-events-none">
            {liveUser.countryFlag}
          </span>
        </div>

        <h2 className="text-xl sm:text-2xl font-black text-white">{liveUser.username}</h2>
        <p className="text-xs sm:text-sm text-indigo-300 font-semibold mt-1">
          {liveUser.countryName} • {liveUser.preferredLanguage || 'English'}
        </p>
        <p className="text-xs sm:text-sm text-slate-400 mt-2 max-w-md mx-auto italic leading-relaxed">
          "{liveUser.bio || 'World Challenge traveler ready for cultural duels!'}"
        </p>

        {/* Level & XP */}
        <div className="mt-5 pt-4 border-t border-slate-800/80 max-w-xl mx-auto">
          <div className="flex justify-between items-center text-xs sm:text-sm mb-1.5 font-bold">
            <span className="text-amber-400">Level {levelInfo.level}</span>
            <span className="text-slate-400 font-mono">
              {levelInfo.xpInCurrentLevel} / {levelInfo.nextLevelThreshold - levelInfo.currentLevelBase} XP ({liveUser.xp || 0} Total XP)
            </span>
          </div>
          <div className="w-full h-3 bg-slate-800 rounded-full overflow-hidden p-0.5">
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
          className="mt-5 inline-flex items-center gap-1.5 text-xs sm:text-sm font-bold text-indigo-400 hover:text-indigo-300 bg-indigo-950/60 border border-indigo-500/30 px-4 py-2 rounded-xl cursor-pointer transition-colors"
        >
          <Edit2 className="w-3.5 h-3.5" />
          <span>{isEditing ? 'Cancel Editing' : 'Edit Profile'}</span>
        </button>
      </div>

      {savedSuccess && (
        <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs sm:text-sm rounded-2xl text-center">
          Profile saved successfully!
        </div>
      )}

      {/* Edit Form */}
      {isEditing && (
        <form
          onSubmit={handleSave}
          className="bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-7 space-y-5 shadow-xl"
        >
          <div className="flex items-center justify-between">
            <h3 className="text-sm sm:text-base font-black text-white">Edit Traveler Profile</h3>
            <span className="text-[11px] text-slate-400">Changes sync in real-time</span>
          </div>

          {avatarError && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs rounded-xl">
              {avatarError}
            </div>
          )}

          {/* Avatar Upload & Customization Section */}
          <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4">
            <label className="block text-[10px] sm:text-xs font-bold text-slate-400 uppercase tracking-wider">
              Profile Picture / Avatar
            </label>

            <div className="flex flex-col sm:flex-row items-center gap-4">
              <div className="relative shrink-0">
                <img
                  src={avatar || liveUser.avatar}
                  alt="Preview"
                  className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl object-cover ring-2 ring-indigo-500 bg-slate-800 shadow-md"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="absolute -bottom-1.5 -right-1.5 p-1.5 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white shadow cursor-pointer"
                  title="Upload from device"
                >
                  <Camera className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="flex-1 w-full space-y-2.5">
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={avatarUploading}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow transition-all cursor-pointer disabled:opacity-50"
                  >
                    {avatarUploading ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Upload className="w-3.5 h-3.5" />
                    )}
                    <span>Upload Photo from Device</span>
                  </button>
                </div>

                {/* Image URL Input */}
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <LinkIcon className="absolute left-3 top-2.5 w-3.5 h-3.5 text-slate-500" />
                    <input
                      type="url"
                      placeholder="Or paste custom image URL (https://...)"
                      value={avatarUrlInput}
                      onChange={(e) => setAvatarUrlInput(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-8 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleApplyAvatarUrl}
                    disabled={!avatarUrlInput.trim()}
                    className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-indigo-300 font-bold text-xs transition-colors cursor-pointer shrink-0"
                  >
                    Apply URL
                  </button>
                </div>
              </div>
            </div>

            {/* Quick Preset Avatars */}
            <div>
              <span className="block text-[10px] font-bold text-slate-500 uppercase mb-2">
                Or Pick a Traveler Avatar
              </span>
              <div className="flex items-center gap-2 overflow-x-auto pb-1">
                {PRESET_AVATARS.map((presetUrl, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={async () => {
                      sounds.playPop();
                      setAvatar(presetUrl);
                      setLiveUser((prev) => ({ ...prev, avatar: presetUrl }));
                      await updateProfile({ avatar: presetUrl });
                    }}
                    className={`relative w-10 h-10 rounded-xl overflow-hidden shrink-0 border-2 transition-all cursor-pointer ${
                      avatar === presetUrl
                        ? 'border-indigo-500 scale-105 shadow-md shadow-indigo-500/30'
                        : 'border-slate-800 opacity-75 hover:opacity-100'
                    }`}
                  >
                    <img src={presetUrl} alt={`Preset ${idx + 1}`} className="w-full h-full object-cover bg-slate-800" />
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] sm:text-xs font-bold text-slate-400 uppercase mb-1.5">
                Username
              </label>
              <input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-white focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-[10px] sm:text-xs font-bold text-slate-400 uppercase mb-1.5">
                Country
              </label>
              <select
                value={countryCode}
                onChange={(e) => setCountryCode(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-white focus:outline-none focus:border-indigo-500"
              >
                {COUNTRIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.flag} {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] sm:text-xs font-bold text-slate-400 uppercase mb-1.5">
                Bio / Motto
              </label>
              <textarea
                rows={2}
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                maxLength={200}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-white focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-[10px] sm:text-xs font-bold text-slate-400 uppercase mb-1.5">
                Preferred Language
              </label>
              <input
                type="text"
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-white focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold text-xs sm:text-sm flex items-center justify-center gap-1.5 shadow-md active:scale-98 transition-all cursor-pointer disabled:opacity-50"
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Saving Changes...</span>
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                <span>Save Changes</span>
              </>
            )}
          </button>
        </form>
      )}

      {/* Career Statistics Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5 sm:gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-4 sm:p-5 flex flex-col justify-between shadow-lg">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-[10px] sm:text-xs font-bold uppercase">Games Played</span>
            <Gamepad2 className="w-4 h-4 text-indigo-400 shrink-0" />
          </div>
          <span className="text-2xl sm:text-3xl font-black text-white">{totalGamesPlayed}</span>
          <span className="text-[10px] sm:text-xs text-slate-500 mt-1">Total duels &amp; quests</span>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-4 sm:p-5 flex flex-col justify-between shadow-lg">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-[10px] sm:text-xs font-bold uppercase">Victories</span>
            <Trophy className="w-4 h-4 text-yellow-400 shrink-0" />
          </div>
          <span className="text-2xl sm:text-3xl font-black text-yellow-400">{totalVictories}</span>
          <span className="text-[10px] sm:text-xs text-slate-500 mt-1">{winRate}% win rate</span>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-4 sm:p-5 flex flex-col justify-between shadow-lg">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-[10px] sm:text-xs font-bold uppercase">Discovered</span>
            <Globe className="w-4 h-4 text-emerald-400 shrink-0" />
          </div>
          <span className="text-2xl sm:text-3xl font-black text-emerald-400">
            {liveUser.discoveredCountries?.length || 1}
          </span>
          <span className="text-[10px] sm:text-xs text-slate-500 mt-1">Country visas stamped</span>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-4 sm:p-5 flex flex-col justify-between shadow-lg">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-[10px] sm:text-xs font-bold uppercase">Play Streak</span>
            <Flame className="w-4 h-4 text-amber-400 shrink-0" />
          </div>
          <span className="text-2xl sm:text-3xl font-black text-amber-400">{liveUser.dailyStreak || 1}</span>
          <span className="text-[10px] sm:text-xs text-slate-500 mt-1">Days in a row</span>
        </div>
      </div>

      {/* Badges & Achievements Showcase */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-6 md:p-7 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Award className="w-4 h-4 sm:w-5 sm:h-5 text-amber-400" />
            <h3 className="text-sm sm:text-base font-extrabold text-white">Achievements &amp; Badges</h3>
          </div>
          <span className="text-xs sm:text-sm font-mono font-bold text-amber-400">
            {unlockedBadgeIds.size} / {BADGES.length}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {BADGES.map((badge) => {
            const isUnlocked = unlockedBadgeIds.has(badge.id);

            return (
              <div
                key={badge.id}
                className={`p-3.5 sm:p-4 rounded-2xl border flex items-center justify-between text-xs sm:text-sm transition-colors ${
                  isUnlocked
                    ? 'bg-slate-800/80 border-amber-500/30 text-white'
                    : 'bg-slate-900/40 border-slate-800/60 text-slate-500 opacity-60'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={`w-11 h-11 rounded-xl flex items-center justify-center text-xl shrink-0 ${
                      isUnlocked ? 'bg-amber-500/20' : 'bg-slate-800'
                    }`}
                  >
                    {badge.icon}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-extrabold text-white truncate">{badge.title}</span>
                      {isUnlocked && (
                        <CheckCircle2 className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      )}
                    </div>
                    <p className="text-[11px] sm:text-xs text-slate-400 leading-snug">{badge.description}</p>
                  </div>
                </div>

                <span className="font-mono text-[10px] sm:text-xs font-bold text-amber-400 shrink-0 ml-2">
                  +{badge.xpReward} XP
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Account Settings & Preferences */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-6 space-y-4 shadow-xl">
        {/* Sound toggle button */}
        <div className="flex items-center justify-between py-1">
          <div className="flex items-center gap-2.5 text-xs sm:text-sm text-slate-300 font-semibold">
            {soundEnabled ? (
              <Volume2 className="w-4 h-4 text-emerald-400" />
            ) : (
              <VolumeX className="w-4 h-4 text-slate-500" />
            )}
            <span>Sound Effects &amp; Audio Cues</span>
          </div>
          <button
            onClick={handleToggleSound}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
              soundEnabled
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                : 'bg-slate-800 text-slate-400'
            }`}
          >
            {soundEnabled ? 'Enabled' : 'Muted'}
          </button>
        </div>

        {/* Auth / Logout / Login */}
        <div className="pt-3 border-t border-slate-800">
          {firebaseUser && !firebaseUser.isAnonymous ? (
            <div className="space-y-3">
              <div className="flex items-center justify-center text-xs sm:text-sm text-slate-300 bg-slate-950/60 px-4 py-3.5 rounded-2xl border border-slate-800">
                <span className="font-bold text-white truncate">
                  {liveUser.username || firebaseUser.displayName || firebaseUser.email}
                </span>
              </div>
              <button
                onClick={() => {
                  sounds.playPop();
                  logout();
                }}
                className="w-full py-3 rounded-xl bg-slate-800 hover:bg-rose-500/20 hover:text-rose-400 text-slate-300 font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
                <span>Sign Out of Account</span>
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="bg-indigo-950/40 border border-indigo-500/30 p-4 rounded-2xl">
                <span className="text-xs sm:text-sm font-bold text-indigo-300 block mb-0.5">Playing in Guest Mode</span>
                <p className="text-[11px] sm:text-xs text-slate-400 leading-relaxed">
                  Log in or create a free account to permanently save your progress, coins, country stamps, and rank.
                </p>
              </div>
              <button
                onClick={() => {
                  sounds.playPop();
                  onOpenAuth();
                }}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-amber-500 to-rose-600 hover:from-amber-400 hover:to-rose-500 text-white font-extrabold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg shadow-rose-500/20 active:scale-95 transition-all cursor-pointer"
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
