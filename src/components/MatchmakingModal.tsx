import React, { useEffect, useState, useRef } from 'react';
import { UserProfile, GameCategory, GameRoom } from '../types/game';
import {
  joinMatchmakingQueue,
  listenToMatchmakingTicket,
  leaveMatchmakingQueue,
  createPrivateDuelRoom,
  joinPrivateDuelRoom,
  listenToPrivateRoomHost,
} from '../services/matchmakingService';
import { getGameRoom } from '../services/gameService';
import { sounds } from '../services/soundEffects';
import { SEED_LEADERBOARD } from '../services/userService';
import { getRandomQuestions, getQuestionsByCategory } from '../services/questionData';
import {
  Globe2,
  X,
  CheckCircle2,
  Users,
  KeyRound,
  Swords,
  Copy,
  Check,
  Loader2,
  Sparkles,
  Zap,
} from 'lucide-react';

interface MatchmakingModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: UserProfile;
  category: GameCategory | 'mixed';
  onMatchFound: (room: GameRoom) => void;
}

export const MatchmakingModal: React.FC<MatchmakingModalProps> = ({
  isOpen,
  onClose,
  user,
  category,
  onMatchFound,
}) => {
  const [tab, setTab] = useState<'queue' | 'code'>('queue');
  const [statusText, setStatusText] = useState('Connecting to global matchmaking...');
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

  // Cleanup helper
  const cleanUpListeners = () => {
    if (unsubRef.current) {
      unsubRef.current();
      unsubRef.current = null;
    }
    if (activeTicketIdRef.current) {
      leaveMatchmakingQueue(activeTicketIdRef.current);
      activeTicketIdRef.current = '';
    }
    if (cdIntervalRef.current) {
      clearInterval(cdIntervalRef.current);
      cdIntervalRef.current = null;
    }
  };

  // Helper to start the 3-2-1 match countdown
  const commenceMatch = (room: GameRoom, opponent: Partial<UserProfile>) => {
    cleanUpListeners();
    setMatchedOpponent(opponent);
    setStatusText(`Real Challenger Found: ${opponent.username || 'Opponent'}!`);
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
        onMatchFound(room);
      }
    }, 1000);
  };

  // Helper to start bot match if no player is in queue
  const startBotMatch = () => {
    cleanUpListeners();
    const candidateBots = SEED_LEADERBOARD.filter((b) => b.countryCode !== user.countryCode);
    const botOpponent =
      candidateBots.length > 0
        ? candidateBots[Math.floor(Math.random() * candidateBots.length)]
        : SEED_LEADERBOARD[0];

    const questions =
      category === 'mixed'
        ? getRandomQuestions(5)
        : getQuestionsByCategory(category, 5);

    const botRoom: GameRoom = {
      id: `room_bot_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      hostId: user.uid,
      hostUsername: user.username,
      hostCountryCode: user.countryCode,
      hostCountryFlag: user.countryFlag,
      hostAvatar: user.avatar,
      hostScore: 0,
      hostReady: true,

      guestId: botOpponent.uid,
      guestUsername: botOpponent.username,
      guestCountryCode: botOpponent.countryCode,
      guestCountryFlag: botOpponent.countryFlag,
      guestAvatar: botOpponent.avatar,
      guestScore: 0,
      guestReady: true,

      gameMode: category,
      status: 'playing',
      currentRound: 1,
      totalRounds: questions.length,
      questionIds: questions.map((q) => q.id),
      questions,
      currentQuestion: questions[0],
      roundStartedAt: Date.now(),
      roundStartTime: Date.now(),
      isBotOpponent: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    commenceMatch(botRoom, botOpponent);
  };

  // 1. Worldwide Queue Search (Real Players Only - Zero AI)
  useEffect(() => {
    if (!isOpen || tab !== 'queue') return;

    sounds.playPop();
    setStatusText('Searching worldwide for a real opponent...');
    setMatchedOpponent(null);
    setCountdown(null);
    setElapsedSeconds(0);

    const timer = setInterval(() => {
      setElapsedSeconds((prev) => {
        const next = prev + 1;
        // Auto-match after 7 seconds if no other real player is in queue
        if (next >= 7 && !matchedOpponent) {
          startBotMatch();
        }
        return next;
      });
    }, 1000);

    let isCancelled = false;

    // Join the real Firestore queue
    joinMatchmakingQueue(user, category)
      .then(({ ticketId, matchedRoom }) => {
        if (isCancelled) {
          leaveMatchmakingQueue(ticketId);
          return;
        }

        activeTicketIdRef.current = ticketId;

        // If another real player was already waiting, we matched them immediately!
        if (matchedRoom) {
          const opp: Partial<UserProfile> = {
            uid: matchedRoom.hostId,
            username: matchedRoom.hostUsername,
            countryCode: matchedRoom.hostCountryCode,
            countryFlag: matchedRoom.hostCountryFlag,
            avatar: matchedRoom.hostAvatar,
            countryName: 'Challenger',
          };
          commenceMatch(matchedRoom, opp);
          return;
        }

        // Otherwise, wait for another real player to match our ticket
        unsubRef.current = listenToMatchmakingTicket(ticketId, async (roomId) => {
          if (isCancelled) return;
          try {
            const room = await getGameRoom(roomId);
            if (room) {
              const isUserHost = room.hostId === user.uid;
              const opp: Partial<UserProfile> = {
                uid: isUserHost ? room.guestId : room.hostId,
                username: isUserHost ? room.guestUsername : room.hostUsername,
                countryCode: isUserHost ? room.guestCountryCode : room.hostCountryCode,
                countryFlag: isUserHost ? room.guestCountryFlag : room.hostCountryFlag,
                avatar: isUserHost ? room.guestAvatar : room.hostAvatar,
                countryName: 'Challenger',
              };
              commenceMatch(room, opp);
            }
          } catch (err) {
            console.error('Error fetching matched room:', err);
          }
        });
      })
      .catch((err) => {
        console.warn('Matchmaking queue error:', err);
        setStatusText('Waiting for real players in queue...');
      });

    return () => {
      isCancelled = true;
      clearInterval(timer);
      cleanUpListeners();
    };
  }, [isOpen, tab]);

  // Handle Room Code Creation
  const handleCreateCodeRoom = async () => {
    try {
      setCodeLoading(true);
      setCodeError('');
      cleanUpListeners();

      const { room, roomCode } = await createPrivateDuelRoom(user, category);
      setGeneratedCode(roomCode);
      activePrivateRoomIdRef.current = room.id;
      setStatusText(`Room created! Code: ${roomCode}`);

      // Listen for friend joining
      unsubRef.current = listenToPrivateRoomHost(room.id, (updatedRoom) => {
        const opp: Partial<UserProfile> = {
          uid: updatedRoom.guestId,
          username: updatedRoom.guestUsername,
          countryCode: updatedRoom.guestCountryCode,
          countryFlag: updatedRoom.guestCountryFlag,
          avatar: updatedRoom.guestAvatar,
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
    if (!inputCode.trim()) return;
    try {
      setCodeLoading(true);
      setCodeError('');
      cleanUpListeners();

      const room = await joinPrivateDuelRoom(inputCode, user);
      const opp: Partial<UserProfile> = {
        uid: room.hostId,
        username: room.hostUsername,
        countryCode: room.hostCountryCode,
        countryFlag: room.hostCountryFlag,
        avatar: room.hostAvatar,
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/95 backdrop-blur-xl animate-fade-in">
      <div className="relative w-full max-w-sm bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl text-slate-100 text-center overflow-hidden">
        {/* Close Button */}
        <button
          onClick={() => {
            sounds.playPop();
            cleanUpListeners();
            onClose();
          }}
          className="absolute top-4 right-4 p-2 text-slate-400 hover:text-white rounded-full hover:bg-slate-800 transition-colors cursor-pointer z-10"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Tab Switcher: Worldwide Queue vs Duel with Friend */}
        {!matchedOpponent && (
          <div className="flex bg-slate-950/80 p-1 rounded-2xl border border-slate-800 mb-5">
            <button
              onClick={() => {
                sounds.playPop();
                setTab('queue');
                cleanUpListeners();
              }}
              className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                tab === 'queue'
                  ? 'bg-gradient-to-r from-indigo-600 to-rose-600 text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Globe2 className="w-3.5 h-3.5" />
              <span>Worldwide Queue</span>
            </button>
            <button
              onClick={() => {
                sounds.playPop();
                setTab('code');
                cleanUpListeners();
              }}
              className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                tab === 'code'
                  ? 'bg-gradient-to-r from-indigo-600 to-rose-600 text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <KeyRound className="w-3.5 h-3.5" />
              <span>Room Code</span>
            </button>
          </div>
        )}

        {/* ----------------- TAB 1: WORLDWIDE QUEUE ----------------- */}
        {tab === 'queue' && (
          <div>
            {!matchedOpponent ? (
              <div className="my-6 relative flex flex-col items-center justify-center">
                {/* Radar Waves */}
                <div className="relative flex items-center justify-center w-40 h-40">
                  <div className="absolute w-40 h-40 rounded-full border border-indigo-500/20 animate-ping" />
                  <div className="absolute w-32 h-32 rounded-full border border-rose-500/30 animate-pulse" />
                  <div className="w-24 h-24 rounded-full bg-gradient-to-tr from-amber-500 via-rose-500 to-indigo-600 flex items-center justify-center text-4xl shadow-xl shadow-rose-500/30">
                    <Globe2 className="w-12 h-12 text-white animate-spin-slow" />
                  </div>
                </div>

                {/* Live Search Timer */}
                <div className="mt-4 font-mono font-bold text-sm text-indigo-400 bg-slate-950 px-3 py-1 rounded-full border border-slate-800">
                  Searching: {formatElapsed(elapsedSeconds)}
                </div>
              </div>
            ) : (
              /* Challenger Found VS Screen */
              <div className="my-6 animate-scale-up">
                <div className="inline-flex items-center gap-1.5 bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 px-3 py-1 rounded-full text-xs font-bold mb-4">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>OPPONENT MATCHED!</span>
                </div>

                <div className="flex items-center justify-center gap-4">
                  {/* Player 1 */}
                  <div className="flex flex-col items-center">
                    <img
                      src={user.avatar}
                      alt={user.username}
                      className="w-16 h-16 rounded-2xl object-cover ring-2 ring-indigo-500 shadow-md bg-slate-800"
                    />
                    <span className="text-xs font-extrabold text-white mt-1.5 truncate max-w-[80px]">
                      {user.username}
                    </span>
                    <span className="text-base">{user.countryFlag}</span>
                  </div>

                  {/* VS Badge */}
                  <div className="flex flex-col items-center">
                    <span className="w-10 h-10 rounded-full bg-rose-600 text-white font-black text-sm flex items-center justify-center shadow-lg">
                      VS
                    </span>
                  </div>

                  {/* Real Opponent */}
                  <div className="flex flex-col items-center">
                    <img
                      src={
                        matchedOpponent.avatar ||
                        'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=160&q=80'
                      }
                      alt={matchedOpponent.username || 'Opponent'}
                      className="w-16 h-16 rounded-2xl object-cover ring-2 ring-rose-500 shadow-md bg-slate-800"
                    />
                    <span className="text-xs font-extrabold text-white mt-1.5 truncate max-w-[80px]">
                      {matchedOpponent.username || 'Challenger'}
                    </span>
                    <span className="text-base">{matchedOpponent.countryFlag || '🌐'}</span>
                  </div>
                </div>

                {/* Countdown 3-2-1 */}
                {countdown !== null && (
                  <div className="mt-5">
                    <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-gradient-to-r from-amber-500 to-rose-500 text-white font-black text-2xl shadow-lg animate-bounce">
                      {countdown}
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1 font-bold">MATCH COMMENCING...</p>
                  </div>
                )}
              </div>
            )}

            <h3 className="text-lg font-black text-white">{statusText}</h3>
            <p className="text-xs text-slate-400 mt-1">
              {!matchedOpponent
                ? 'Waiting for another human player to enter the matchmaking queue...'
                : 'Connecting to synchronized live duel session!'}
            </p>

            {/* Quick action: Instant Play or Cancel or switch to code */}
            {!matchedOpponent && (
              <div className="mt-6 space-y-2.5">
                <button
                  onClick={() => {
                    sounds.playPop();
                    startBotMatch();
                  }}
                  className="w-full py-2.5 px-4 bg-gradient-to-r from-amber-500 to-rose-600 hover:from-amber-400 hover:to-rose-500 text-white font-extrabold text-xs rounded-xl shadow-lg shadow-rose-600/30 flex items-center justify-center gap-1.5 cursor-pointer active:scale-98 transition-all"
                >
                  <Zap className="w-4 h-4 fill-current text-yellow-300" />
                  <span>Play Instantly with World Challenger</span>
                </button>

                <button
                  onClick={() => {
                    sounds.playPop();
                    cleanUpListeners();
                    onClose();
                  }}
                  className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs active:scale-98 transition-all cursor-pointer"
                >
                  Cancel Search
                </button>
                <button
                  onClick={() => {
                    sounds.playPop();
                    setTab('code');
                  }}
                  className="w-full py-2 text-indigo-400 hover:text-indigo-300 font-bold text-xs cursor-pointer"
                >
                  Have a friend? Play with Room Code &rarr;
                </button>
              </div>
            )}
          </div>
        )}

        {/* ----------------- TAB 2: ROOM CODE (DIRECT 1v1 REAL DUEL) ----------------- */}
        {tab === 'code' && !matchedOpponent && (
          <div className="space-y-4 my-2 text-left">
            {codeError && (
              <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs font-semibold">
                {codeError}
              </div>
            )}

            {/* Option A: Create Room */}
            <div className="bg-slate-950/60 p-4 rounded-2xl border border-slate-800 space-y-2">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-indigo-400">
                Option 1 • Host a Duel
              </span>
              <p className="text-xs text-slate-300">
                Generate a 6-digit room code and share it with a friend or another device to start instantly.
              </p>

              {generatedCode ? (
                <div className="space-y-2 pt-1">
                  <div className="flex items-center justify-between bg-slate-900 border-2 border-indigo-500/50 rounded-xl px-4 py-2.5">
                    <span className="font-mono text-xl font-black tracking-widest text-amber-400">
                      {generatedCode}
                    </span>
                    <button
                      onClick={handleCopyCode}
                      className="px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold flex items-center gap-1 cursor-pointer transition-all"
                    >
                      {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copied ? 'Copied!' : 'Copy'}</span>
                    </button>
                  </div>
                  <div className="flex items-center justify-center gap-2 text-xs text-slate-400 font-medium py-1">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400" />
                    <span>Waiting for your friend to enter code...</span>
                  </div>
                </div>
              ) : (
                <button
                  onClick={handleCreateCodeRoom}
                  disabled={codeLoading}
                  className="w-full py-2.5 bg-gradient-to-r from-amber-500 to-rose-600 hover:from-amber-400 hover:to-rose-500 text-white font-extrabold text-xs rounded-xl shadow-md transition-all cursor-pointer flex items-center justify-center gap-1.5"
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
            <div className="bg-slate-950/60 p-4 rounded-2xl border border-slate-800 space-y-2">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-rose-400">
                Option 2 • Enter Friend's Code
              </span>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="e.g. ABC123"
                  value={inputCode}
                  maxLength={6}
                  onChange={(e) => setInputCode(e.target.value.toUpperCase())}
                  className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-center font-mono font-black text-base text-white tracking-widest uppercase focus:outline-none focus:border-rose-500"
                />
                <button
                  onClick={handleJoinWithCode}
                  disabled={codeLoading || inputCode.length < 4}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-500 disabled:opacity-40 text-white font-extrabold text-xs rounded-xl transition-all cursor-pointer shrink-0"
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
              className="w-full py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 font-bold text-xs cursor-pointer"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
