import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { COUNTRIES, getCountryByCode } from '../services/countryData';
import { detectUserCountry, getSyncDetectedCountry } from '../services/geolocationService';
import { sounds } from '../services/soundEffects';
import { Globe, Lock, Mail, User, Sparkles, ArrowRight, X, KeyRound } from 'lucide-react';
import { FirebaseConfigModal } from './FirebaseConfigModal';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialMode?: 'login' | 'signup' | 'guest';
}

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose, initialMode = 'login' }) => {
  const {
    signInWithGoogle,
    signInWithEmail,
    signUpWithEmail,
    signInAsGuest,
    resetPassword,
  } = useAuth();

  const [mode, setMode] = useState<'login' | 'signup' | 'guest' | 'reset'>(initialMode);

  React.useEffect(() => {
    if (isOpen) {
      setMode(initialMode);
      setError(null);
    }
  }, [isOpen, initialMode]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [countryCode, setCountryCode] = useState(() => getSyncDetectedCountry().countryCode);
  const [language, setLanguage] = useState('English');
  const [bio, setBio] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [isFirebaseConfigOpen, setIsFirebaseConfigOpen] = useState(false);

  React.useEffect(() => {
    if (isOpen) {
      detectUserCountry().then((geo) => {
        if (geo?.countryCode) {
          setCountryCode(geo.countryCode);
        }
      });
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    sounds.playPop();

    try {
      if (mode === 'signup') {
        if (!username.trim()) throw new Error('Please choose a username');
        if (!email.trim() || !password) throw new Error('Please enter email and password');
        await signUpWithEmail(email, password, {
          username: username.trim(),
          countryCode,
          preferredLanguage: language,
          bio: bio.trim(),
        });
        sounds.playCorrect();
        onClose();
      } else if (mode === 'login') {
        if (!email.trim() || !password) throw new Error('Please enter email and password');
        await signInWithEmail(email, password);
        sounds.playCorrect();
        onClose();
      } else if (mode === 'guest') {
        await signInAsGuest(username.trim() || undefined, countryCode);
        sounds.playCorrect();
        onClose();
      } else if (mode === 'reset') {
        if (!email.trim()) throw new Error('Please provide your email');
        await resetPassword(email);
        setResetSent(true);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Authentication failed';
      setError(msg);
      sounds.playWrong();
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setError(null);
    setLoading(true);
    sounds.playPop();
    try {
      await signInWithGoogle();
      sounds.playCorrect();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Google sign-in failed');
      sounds.playWrong();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-950/80 backdrop-blur-md animate-fade-in overflow-y-auto">
      <div className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl text-slate-100 my-auto">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 sm:top-5 sm:right-5 p-2 text-slate-400 hover:text-white rounded-full hover:bg-slate-800 cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header */}
        <div className="text-center mb-6">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-gradient-to-tr from-amber-500 via-rose-500 to-indigo-600 flex items-center justify-center text-3xl shadow-lg shadow-rose-500/20 mb-3 animate-bounce-subtle">
            🌍
          </div>
          <h2 className="text-2xl font-black tracking-tight">
            {mode === 'signup' && 'Join World Challenge'}
            {mode === 'login' && 'Welcome Back'}
            {mode === 'guest' && 'Quick Guest Play'}
            {mode === 'reset' && 'Reset Password'}
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            {mode === 'signup' && 'Meet players from 195 countries and play mini-games!'}
            {mode === 'login' && 'Sign in to access your virtual passport and level'}
            {mode === 'guest' && 'Pick your country & start playing immediately without email!'}
            {mode === 'reset' && 'We will send a password reset link to your email'}
          </p>
        </div>

        {/* Mode Switch Tabs */}
        {mode !== 'reset' && (
          <div className="flex bg-slate-800/80 p-1 rounded-2xl mb-5 text-xs font-bold">
            <button
              type="button"
              onClick={() => {
                setMode('signup');
                setError(null);
              }}
              className={`flex-1 py-2 rounded-xl transition-all ${
                mode === 'signup' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Sign Up
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('login');
                setError(null);
              }}
              className={`flex-1 py-2 rounded-xl transition-all ${
                mode === 'login' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('guest');
                setError(null);
              }}
              className={`flex-1 py-2 rounded-xl transition-all ${
                mode === 'guest' ? 'bg-amber-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              ⚡ Guest Play
            </button>
          </div>
        )}

        {/* Error Notification */}
        {error && (
          <div className="mb-4 p-3.5 bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs rounded-2xl space-y-2">
            <div className="flex items-start gap-2">
              <span className="text-sm">⚠️</span>
              <p className="leading-relaxed">{error}</p>
            </div>
            {error.toLowerCase().includes('api-key') && mode !== 'guest' && (
              <button
                type="button"
                onClick={() => {
                  setMode('guest');
                  setError(null);
                  sounds.playPop();
                }}
                className="w-full py-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 font-extrabold text-[11px] transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <span>⚡ Play Instantly as Guest (No Login Required)</span>
              </button>
            )}
          </div>
        )}

        {resetSent && (
          <div className="mb-4 p-3 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs rounded-xl">
            Check your email! Reset instructions have been dispatched.
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-3.5">
          {/* Username Field */}
          {(mode === 'signup' || mode === 'guest') && (
            <div>
              <label className="block text-[11px] font-bold text-slate-400 mb-1 uppercase tracking-wider">
                Traveler Username
              </label>
              <div className="relative">
                <User className="absolute left-3 top-3 w-4 h-4 text-slate-500" />
                <input
                  type="text"
                  required={mode === 'signup'}
                  placeholder="e.g. Youssef_TN or Kenji_Tokyo"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  maxLength={30}
                  className="w-full bg-slate-800/90 border border-slate-700 rounded-xl pl-9 pr-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500 text-white placeholder-slate-500"
                />
              </div>
            </div>
          )}

          {/* Country Selection Field */}
          {(mode === 'signup' || mode === 'guest') && (
            <div>
              <label className="block text-[11px] font-bold text-slate-400 mb-1 uppercase tracking-wider">
                Your Country (Shown on Passport)
              </label>
              <div className="relative">
                <Globe className="absolute left-3 top-3 w-4 h-4 text-slate-500" />
                <select
                  value={countryCode}
                  onChange={(e) => setCountryCode(e.target.value)}
                  className="w-full bg-slate-800/90 border border-slate-700 rounded-xl pl-9 pr-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500 text-white appearance-none cursor-pointer"
                >
                  {COUNTRIES.map((c) => (
                    <option key={c.code} value={c.code} className="bg-slate-800 text-white">
                      {c.flag} {c.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Email Field */}
          {mode !== 'guest' && (
            <div>
              <label className="block text-[11px] font-bold text-slate-400 mb-1 uppercase tracking-wider">
                Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 w-4 h-4 text-slate-500" />
                <input
                  type="email"
                  required
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-slate-800/90 border border-slate-700 rounded-xl pl-9 pr-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500 text-white placeholder-slate-500"
                />
              </div>
            </div>
          )}

          {/* Password Field */}
          {(mode === 'login' || mode === 'signup') && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  Password
                </label>
                {mode === 'login' && (
                  <button
                    type="button"
                    onClick={() => setMode('reset')}
                    className="text-[11px] text-indigo-400 hover:underline"
                  >
                    Forgot?
                  </button>
                )}
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-3 w-4 h-4 text-slate-500" />
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={6}
                  className="w-full bg-slate-800/90 border border-slate-700 rounded-xl pl-9 pr-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500 text-white placeholder-slate-500"
                />
              </div>
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full mt-2 bg-gradient-to-r from-indigo-600 via-rose-600 to-amber-600 hover:opacity-95 text-white font-extrabold py-3 rounded-2xl flex items-center justify-center gap-2 shadow-lg shadow-rose-500/20 active:scale-98 transition-all disabled:opacity-50 text-sm cursor-pointer"
          >
            {loading ? (
              <span className="inline-block animate-spin mr-2">⏳</span>
            ) : (
              <>
                <span>
                  {mode === 'signup' && 'Create Passport & Play'}
                  {mode === 'login' && 'Sign In'}
                  {mode === 'guest' && 'Start Instant Guest Play'}
                  {mode === 'reset' && 'Send Reset Link'}
                </span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        {/* Google Authentication */}
        {mode !== 'reset' && (
          <div className="mt-4 pt-4 border-t border-slate-800">
            <button
              onClick={handleGoogle}
              disabled={loading}
              type="button"
              className="w-full bg-white text-slate-900 font-bold py-2.5 px-4 rounded-2xl flex items-center justify-center gap-2 shadow hover:bg-slate-100 transition-colors active:scale-98 text-xs cursor-pointer"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.8-2.4 3.66v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.15z"
                />
                <path
                  fill="#34A853"
                  d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.34 24 12 24z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.17 0 9.97 0 12s.45 3.83 1.25 5.42l4.03-3.15z"
                />
                <path
                  fill="#EA4335"
                  d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.34 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
                />
              </svg>
              <span>Continue with Google</span>
            </button>
          </div>
        )}

        {mode === 'reset' && (
          <div className="mt-4 text-center">
            <button
              onClick={() => {
                setMode('login');
                setResetSent(false);
                setError(null);
              }}
              className="text-xs text-indigo-400 hover:underline cursor-pointer"
            >
              Back to Login
            </button>
          </div>
        )}

        {/* Firebase Config / Key Diagnostics Link */}
        <div className="mt-5 pt-3 border-t border-slate-800/80 text-center">
          <button
            type="button"
            onClick={() => {
              sounds.playPop();
              setIsFirebaseConfigOpen(true);
            }}
            className="text-[11px] text-slate-400 hover:text-amber-300 transition-colors inline-flex items-center gap-1.5 cursor-pointer font-semibold"
          >
            <KeyRound className="w-3.5 h-3.5 text-amber-400" />
            <span>Firebase API Key Settings & Diagnostics</span>
          </button>
        </div>
      </div>

      <FirebaseConfigModal
        isOpen={isFirebaseConfigOpen}
        onClose={() => setIsFirebaseConfigOpen(false)}
      />
    </div>
  );
};
