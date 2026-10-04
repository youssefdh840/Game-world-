import React, { useEffect, useState, useRef } from 'react';
import { UserProfile, GameCategory, GameRoom } from '../types/game';
import {
  joinMatchmakingQueue,
  listenToMatchmakingRoom,
  leaveMatchmakingQueue,
  createPrivateDuelRoom,
  joinPrivateDuelRoom,
  listenToPrivateRoomHost,
} from '../services/matchmakingService';
import { syncRoomRoundStartTime } from '../services/gameService';
import { getCountryByCode } from '../services/countryData';
import { getSyncDetectedCountry } from '../services/geolocationService';
import { auth } from '../services/firebase';
import { sounds } from '../services/soundEffects';
import {
  Globe2,
  X,
  CheckCircle2,
  KeyRound,
  Swords,
  Copy,
  Check,
  Loader2,
} from 'lucide-react';

const DEFAULT_AVATAR =
  'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=160&q=80';

interface MatchmakingModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: UserProfile;
  category: GameCategory | 'mixed';
  targetCountryCode?: string;
  onMatchFound: (room: GameRoom) => void;
}

export const MatchmakingModal: React.FC<MatchmakingModalProps> = ({
  isOpen,
  onClose,
  user,
  category,
  targetCountryCode,
  onMatchFound,
}) => {
  const [tab, setTab] = useState<'queue' | 'code'>('queue');
  const [statusText, setStatusText] = useState('Searching for a real opponent...');
  const [matchedOpponent, setMatchedOpponent] = useState<Partial<UserProfile> | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  // Private room code states
  const [generatedCode, setGeneratedCode] = useState<string>('');
  const [inputCode, setInputCode] = useState<string>('');
  const [codeLoading, setCodeLoading] = useState<boolean>(false);
  const [codeError, setCodeError] = useState<string>('');
  const [copied, setCopied] = useState<boolean>(false);

  const activeTicketIdRef = useRef<string>('');
  const activePrivateRoomIdRef = useRef<string>('');
  const unsubRef = useRef<(() => void) | null>(null);
  const cdIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const hasCommencedRef = useRef<boolean>(false);

  const syncGeo = getSyncDetectedCountry();
  const resolvedUserCountry = getCountryByCode(user?.countryCode || syncGeo.countryCode);
  const safeUser: UserProfile = {
    ...user,
    uid: auth.currentUser?.uid || user?.uid || 'guest_player',
    username: user?.username || auth.currentUser?.displayName || 'Explorer',
    avatar: user?.avatar || auth.currentUser?.photoURL || DEFAULT_AVATAR,
    countryCode: resolvedUserCountry?.code || user?.countryCode || syncGeo.countryCode || 'TN',
    countryName: resolvedUserCountry?.name || user?.countryName || syncGeo.countryName || 'Tunisia',
    countryFlag: resolvedUserCountry?.flag || user?.countryFlag || syncGeo.countryFlag || '🇹🇳',
  };

  // Cleanup helper
  const cleanUpListeners = (deleteWaitingRoom: boolean = true) => {
    if (unsubRef.current) {
      unsubRef.current();
      unsubRef.current = null;
    }
    if (activeTicketIdRef.current) {
      if (deleteWaitingRoom) {
        leaveMatchmakingQueue(activeTicketIdRef.current);
      }
      activeTicketIdRef.current = '';
    }
    if (activePrivateRoomIdRef.current) {
      if (deleteWaitingRoom) {
        leaveMatchmakingQueue(activePrivateRoomIdRef.current);
      }
      activePrivateRoomIdRef.current = '';
    }
    if (cdIntervalRef.current) {
      clearInterval(cdIntervalRef.current);
      cdIntervalRef.current = null;
    }
  };

  // Helper to start the 3-2-1 match countdown
  const commenceMatch = (room: GameRoom, opponent: Partial<UserProfile>) => {
    if (hasCommencedRef.current) return;
    hasCommencedRef.current = true;

    cleanUpListeners(false);
    setMatchedOpponent({
      uid: opponent.uid || 'opponent',
      username: opponent.username || 'Challenger',
      avatar: opponent.avatar || DEFAULT_AVATAR,
      countryCode: opponent.countryCode || 'UN',
      countryFlag: opponent.countryFlag || '🌍',
      countryName: opponent.countryName || 'Challenger',
    });
    setStatusText(`Real challenger found: ${opponent.username || 'Opponent'}!`);
    sounds.playCorrect();

    let cd = 3;
    setCountdown(cd);
    sounds.playCountdown();

    cdIntervalRef.current = setInterval(() => {
      cd -= 1;
      if (cd > 0) {
        setCountdown(cd);
        sounds.playCountdown();
      } else {
        if (cdIntervalRef.current) clearInterval(cdIntervalRef.current);
        const now = Date.now();
        room.roundStartTime = now;
        room.roundStartedAt = now;
        room.status = 'playing';

        // Authoritative Host activates match in Firestore
        const currentUid = auth.currentUser?.uid || safeUser.uid;
        if (room.hostId === currentUid || room.hostId === user.uid) {
          syncRoomRoundStartTime(room.id, now);
        }

        onMatchFound(room);
      }
    }, 1000);
  };

  // Reset modal state when opened/closed
  useEffect(() => {
    if (!isOpen) {
      hasCommencedRef.current = false;
      setMatchedOpponent(null);
      setCountdown(null);
      setGeneratedCode('');
      setInputCode('');
      setCodeError('');
    }
  }, [isOpen]);

  // 1. Worldwide Queue Search (Real Players Only - Zero AI/Bots)
  useEffect(() => {
    if (!isOpen || tab !== 'queue') return;

    hasCommencedRef.current = false;
    sounds.playPop();
    setStatusText('Searching for a real opponent...');
    setMatchedOpponent(null);
    setCountdown(null);
    setElapsedSeconds(0);

    const timer = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);

    let isCancelled = false;

    // Join the real Firestore queue
    joinMatchmakingQueue(safeUser, category, targetCountryCode)
      .then(({ roomId, matchedRoom }) => {
        if (isCancelled) {
          leaveMatchmakingQueue(roomId);
          return;
        }

        activeTicketIdRef.current = roomId;

        // If another real player was already waiting, we joined their waiting room!
        if (matchedRoom) {
          const opp: Partial<UserProfile> = {
            uid: matchedRoom.hostId,
            username: matchedRoom.hostUsername || 'Challenger',
            countryCode: matchedRoom.hostCountryCode || 'UN',
            countryFlag: matchedRoom.hostCountryFlag || '🌍',
            avatar: matchedRoom.hostAvatar || DEFAULT_AVATAR,
            countryName: 'Host',
          };
          commenceMatch(matchedRoom, opp);
          return;
        }

        // Otherwise, wait for another real player to join our room
        unsubRef.current = listenToMatchmakingRoom(roomId, (room) => {
          if (isCancelled) return;
          const opp: Partial<UserProfile> = {
            uid: room.guestId,
            username: room.guestUsername || 'Challenger',
            countryCode: room.guestCountryCode || 'UN',
            countryFlag: room.guestCountryFlag || '🌍',
            avatar: room.guestAvatar || DEFAULT_AVATAR,
            countryName: 'Guest',
          };
          commenceMatch(room, opp);
        });
      })
      .catch((err) => {
        console.warn('Matchmaking queue error:', err);
        setStatusText('Searching for a real opponent...');
      });

    return () => {
      isCancelled = true;
      clearInterval(timer);
      if (!hasCommencedRef.current) {
        cleanUpListeners(true);
      }
    };
  }, [isOpen, tab]);

  // Handle Room Code Creation
  const handleCreateCodeRoom = async () => {
    try {
      hasCommencedRef.current = false;
      setCodeLoading(true);
      setCodeError('');
      cleanUpListeners(true);

      const { room, roomCode } = await createPrivateDuelRoom(safeUser, category, targetCountryCode);
      setGeneratedCode(roomCode);
      activePrivateRoomIdRef.current = room.id;
      setStatusText(`Room created! Code: ${roomCode}`);

      // Listen for friend joining
      unsubRef.current = listenToPrivateRoomHost(room.id, (updatedRoom) => {
        const opp: Partial<UserProfile> = {
          uid: updatedRoom.guestId,
          username: updatedRoom.guestUsername || 'Friend',
          countryCode: updatedRoom.guestCountryCode || 'UN',
          countryFlag: updatedRoom.guestCountryFlag || '🌍',
          avatar: updatedRoom.guestAvatar || DEFAULT_AVATAR,
          countryName: 'Friend',
        };
        commenceMatch(updatedRoom, opp);
      });
    } catch (err) {
      setCodeError(err instanceof Error ? err.message : 'Could not create room');
    } finally {
      setCodeLoading(false);
    }
  };

  // Handle Room Code Joining
  const handleJoinWithCode = async () => {
    const clean = inputCode.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (clean.length !== 6) {
      setCodeError('Please enter a valid 6-character room code.');
      return;
    }
    try {
      hasCommencedRef.current = false;
      setCodeLoading(true);
      setCodeError('');
      cleanUpListeners(true);

      const room = await joinPrivateDuelRoom(clean, safeUser);
      const opp: Partial<UserProfile> = {
        uid: room.hostId,
        username: room.hostUsername || 'Host',
        countryCode: room.hostCountryCode || 'UN',
        countryFlag: room.hostCountryFlag || '🌍',
        avatar: room.hostAvatar || DEFAULT_AVATAR,
        countryName: 'Host',
      };
      commenceMatch(room, opp);
    } catch (err) {
      setCodeError(err instanceof Error ? err.message : 'Invalid code or room not found');
    } finally {
      setCodeLoading(false);
    }
  };

  const handleCopyCode = () => {
    if (!generatedCode) return;
    navigator.clipboard?.writeText(generatedCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!isOpen) return null;

  const formatElapsed = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-950/95 backdrop-blur-xl animate-fade-in overflow-y-auto">
      <div className="relative w-full max-w-sm sm:max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl text-slate-100 text-center overflow-hidden my-auto">
        {/* Close Button */}
        <button
          onClick={() => {
            sounds.playPop();
            cleanUpListeners();
            onClose();
          }}
          className="absolute top-4 right-4 sm:top-5 sm:right-5 p-2 text-slate-400 hover:text-white rounded-full hover:bg-slate-800 transition-colors cursor-pointer z-10"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Tab Switcher: Worldwide Queue vs Duel with Friend */}
        {!matchedOpponent && (
          <div className="flex bg-slate-950/80 p-1.5 rounded-2xl border border-slate-800 mb-6 mr-6 sm:mr-8">
            <button
              onClick={() => {
                sounds.playPop();
                setTab('queue');
                cleanUpListeners();
              }}
              className={`flex-1 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                tab === 'queue'
                  ? 'bg-gradient-to-r from-indigo-600 to-rose-600 text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Globe2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <span>Worldwide Queue</span>
            </button>
            <button
              onClick={() => {
                sounds.playPop();
                setTab('code');
                cleanUpListeners();
              }}
              className={`flex-1 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                tab === 'code'
                  ? 'bg-gradient-to-r from-indigo-600 to-rose-600 text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <KeyRound className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <span>Room Code</span>
            </button>
          </div>
        )}

        {/* ----------------- OPPONENT MATCHED SCREEN (QUEUE OR ROOM CODE) ----------------- */}
        {matchedOpponent && (
          <div className="my-6 sm:my-8 animate-scale-up">
            <div className="inline-flex items-center gap-1.5 bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 px-3.5 py-1.5 rounded-full text-xs font-bold mb-5">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>OPPONENT FOUND!</span>
            </div>

            <div className="flex items-center justify-center gap-4 sm:gap-6">
              {/* Player 1 */}
              <div className="flex flex-col items-center">
                <img
                  src={safeUser.avatar}
                  alt={safeUser.username}
                  className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl object-cover ring-2 ring-indigo-500 shadow-md bg-slate-800"
                />
                <span className="text-xs sm:text-sm font-extrabold text-white mt-2 truncate max-w-[90px] sm:max-w-[120px]">
                  {safeUser.username}
                </span>
                <span className="text-base sm:text-lg">{safeUser.countryFlag}</span>
              </div>

              {/* VS Badge */}
              <div className="flex flex-col items-center">
                <span className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-rose-600 text-white font-black text-sm sm:text-base flex items-center justify-center shadow-lg">
                  VS
                </span>
              </div>

              {/* Established Opponent */}
              <div className="flex flex-col items-center">
                {matchedOpponent.avatar ? (
                  <img
                    src={matchedOpponent.avatar}
                    alt={matchedOpponent.username || 'Opponent'}
                    className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl object-cover ring-2 ring-rose-500 shadow-md bg-slate-800"
                  />
                ) : (
                  <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-gradient-to-br from-rose-500 to-amber-500 flex items-center justify-center text-white font-black text-xl ring-2 ring-rose-500 shadow-md">
                    {matchedOpponent.username ? matchedOpponent.username.charAt(0).toUpperCase() : '?'}
                  </div>
                )}
                <span className="text-xs sm:text-sm font-extrabold text-white mt-2 truncate max-w-[90px] sm:max-w-[120px]">
                  {matchedOpponent.username || 'Opponent'}
                </span>
                <span className="text-base sm:text-lg">{matchedOpponent.countryFlag || '🌐'}</span>
              </div>
            </div>

            {/* Countdown 3-2-1 */}
            {countdown !== null && (
              <div className="mt-6">
                <div className="inline-flex items-center justify-center w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-gradient-to-r from-amber-500 to-rose-500 text-white font-black text-2xl sm:text-3xl shadow-lg animate-bounce">
                  {countdown}
                </div>
                <p className="text-[11px] sm:text-xs text-slate-400 mt-1.5 font-bold">STARTING MATCH...</p>
              </div>
            )}

            <h3 className="text-lg sm:text-xl font-black text-white mt-4">{statusText}</h3>
            <p className="text-xs sm:text-sm text-slate-400 mt-1">
              Connecting to synchronized live duel session!
            </p>
          </div>
        )}

        {/* ----------------- TAB 1: WORLDWIDE QUEUE ----------------- */}
        {tab === 'queue' && !matchedOpponent && (
          <div>
            <div className="my-7 sm:my-8 relative flex flex-col items-center justify-center">
              {/* Clean Loading Pulse & Spinner */}
              <div className="relative flex items-center justify-center w-36 h-36 sm:w-40 sm:h-40">
                <div className="absolute w-36 h-36 sm:w-40 sm:h-40 rounded-full border border-indigo-500/20 animate-ping" />
                <div className="absolute w-28 h-28 sm:w-32 sm:h-32 rounded-full border border-rose-500/30 animate-pulse" />
                <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-slate-800/80 border border-slate-700/80 flex items-center justify-center shadow-xl">
                  <Loader2 className="w-10 h-10 sm:w-11 sm:h-11 text-indigo-400 animate-spin" />
                </div>
              </div>

              {/* Live Search Duration */}
              <div className="mt-5 font-mono font-bold text-xs sm:text-sm text-indigo-400 bg-slate-950 px-3.5 py-1.5 rounded-full border border-slate-800">
                Elapsed: {formatElapsed(elapsedSeconds)}
              </div>
            </div>

            <h3 className="text-lg sm:text-xl font-black text-white">Searching for a real opponent...</h3>
            <p className="text-xs sm:text-sm text-slate-400 mt-1.5">
              Waiting for another real player to join the queue...
            </p>

            {/* Quick Actions during search */}
            <div className="mt-6 sm:mt-7 space-y-3">
              <button
                onClick={() => {
                  sounds.playPop();
                  cleanUpListeners(true);
                  onClose();
                }}
                className="w-full py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs sm:text-sm active:scale-98 transition-all cursor-pointer"
              >
                Cancel Search
              </button>
              <button
                onClick={() => {
                  sounds.playPop();
                  setTab('code');
                }}
                className="w-full py-2 text-indigo-400 hover:text-indigo-300 font-bold text-xs sm:text-sm cursor-pointer"
              >
                Have a friend? Play with Room Code &rarr;
              </button>
            </div>
          </div>
        )}

        {/* ----------------- TAB 2: ROOM CODE (DIRECT 1v1 REAL DUEL) ----------------- */}
        {tab === 'code' && !matchedOpponent && (
          <div className="space-y-4 my-2 text-left">
            {codeError && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs sm:text-sm font-semibold">
                {codeError}
              </div>
            )}

            {/* Option A: Create Room */}
            <div className="bg-slate-950/60 p-4 sm:p-5 rounded-2xl border border-slate-800 space-y-2.5">
              <span className="text-[10px] sm:text-xs font-extrabold uppercase tracking-wider text-indigo-400">
                Option 1 • Host a Duel
              </span>
              <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                Generate a 6-digit room code and share it with a friend or another device to start instantly.
              </p>

              {generatedCode ? (
                <div className="space-y-2.5 pt-1">
                  <div className="flex items-center justify-between bg-slate-900 border-2 border-indigo-500/50 rounded-xl px-4 py-3">
                    <span className="font-mono text-xl sm:text-2xl font-black tracking-widest text-amber-400">
                      {generatedCode}
                    </span>
                    <button
                      onClick={handleCopyCode}
                      className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-all"
                    >
                      {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copied ? 'Copied!' : 'Copy'}</span>
                    </button>
                  </div>
                  <div className="flex items-center justify-center gap-2 text-xs sm:text-sm text-slate-400 font-medium py-1">
                    <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
                    <span>Waiting for your friend to enter code...</span>
                  </div>
                </div>
              ) : (
                <button
                  onClick={handleCreateCodeRoom}
                  disabled={codeLoading}
                  className="w-full py-3 bg-gradient-to-r from-amber-500 to-rose-600 hover:from-amber-400 hover:to-rose-500 text-white font-extrabold text-xs sm:text-sm rounded-xl shadow-md transition-all cursor-pointer flex items-center justify-center gap-1.5"
                >
                  {codeLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <Swords className="w-4 h-4" />
                      <span>Create Private Duel Code</span>
                    </>
                  )}
                </button>
              )}
            </div>

            {/* Option B: Join with Code */}
            <div className="bg-slate-950/60 p-4 sm:p-5 rounded-2xl border border-slate-800 space-y-2.5">
              <span className="text-[10px] sm:text-xs font-extrabold uppercase tracking-wider text-rose-400">
                Option 2 • Enter Friend's Code
              </span>
              <div className="flex gap-2.5">
                <input
                  type="text"
                  placeholder="e.g. ABC123"
                  value={inputCode}
                  maxLength={6}
                  onChange={(e) => setInputCode(e.target.value.toUpperCase())}
                  className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-center font-mono font-black text-base sm:text-lg text-white tracking-widest uppercase focus:outline-none focus:border-rose-500"
                />
                <button
                  onClick={handleJoinWithCode}
                  disabled={codeLoading || inputCode.length < 4}
                  className="px-5 py-2.5 bg-rose-600 hover:bg-rose-500 disabled:opacity-40 text-white font-extrabold text-xs sm:text-sm rounded-xl transition-all cursor-pointer shrink-0"
                >
                  {codeLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Join'}
                </button>
              </div>
            </div>

            <button
              onClick={() => {
                sounds.playPop();
                cleanUpListeners();
                onClose();
              }}
              className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 font-bold text-xs sm:text-sm cursor-pointer"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
