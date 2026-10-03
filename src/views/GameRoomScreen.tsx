import React, { useState, useEffect, useRef } from 'react';
import { GameRoom, UserProfile, Question, ChatMessage } from '../types/game';
import {
  subscribeToGameRoom,
  submitPlayerAnswer,
  advanceToNextRoundOrFinish,
  syncRoomRoundStartTime,
  subscribeToRoomMessages,
  sendRoomChatMessage,
  reportUser,
  fetchDynamicGameQuestions,
  recordQuestionsAnsweredInSession,
  forfeitGame,
} from '../services/gameService';
import { awardGameResults } from '../services/userService';
import { sounds } from '../services/soundEffects';
import confetti from 'canvas-confetti';
import {
  Trophy,
  Volume2,
  VolumeX,
  MessageSquare,
  Flag,
  ArrowRight,
  Sparkles,
  Send,
  X,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Music,
  MapPin,
  Flame,
  LogOut,
} from 'lucide-react';

interface GameRoomScreenProps {
  initialRoom: GameRoom;
  user: UserProfile;
  onExitRoom: () => void;
  onRematch: () => void;
}

export const GameRoomScreen: React.FC<GameRoomScreenProps> = ({
  initialRoom,
  user,
  onExitRoom,
  onRematch,
}) => {
  const [room, setRoom] = useState<GameRoom>(initialRoom);
  const [timeLeft, setTimeLeft] = useState<number>(10);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [hasAnswered, setHasAnswered] = useState<boolean>(false);
  const [showExplanation, setShowExplanation] = useState<boolean>(false);
  const [isHost, setIsHost] = useState<boolean>(initialRoom.hostId === user.uid);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isChatOpen, setIsChatOpen] = useState<boolean>(false);
  const [chatInput, setChatInput] = useState<string>('');
  const [reportModalOpen, setReportModalOpen] = useState<boolean>(false);
  const [reportReason, setReportReason] = useState<string>('Unsportsmanlike conduct');
  const [reportedSuccess, setReportedSuccess] = useState<boolean>(false);
  const [forfeitModalOpen, setForfeitModalOpen] = useState<boolean>(false);

  // End of match awards
  const [awardedResults, setAwardedResults] = useState<{
    leveledUp: boolean;
    newLevel: number;
    newlyUnlockedCountry?: string;
    newBadges: string[];
    xpEarned: number;
    coinsEarned: number;
  } | null>(null);

  // Synchronized state refs to prevent stale closures and canceled timeouts
  const roomRef = useRef<GameRoom>(room);
  roomRef.current = room;

  const isHostRef = useRef<boolean>(isHost);
  isHostRef.current = isHost;

  // Active question accessor
  const currentQ = room.currentQuestion || (room.questions && room.questions[room.currentRound - 1]);

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const roundStartTimeRef = useRef<number>(Date.now());
  const activeRoundRef = useRef<number>(0);
  const isAdvancingRoundRef = useRef<boolean>(false);
  const botAnswerTimerRef = useRef<NodeJS.Timeout | null>(null);
  const roundTransitionTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const guestFallbackTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Subscribe to real-time room updates and chat
  useEffect(() => {
    setIsHost(room.hostId === user.uid);
    const unsubRoom = subscribeToGameRoom(room.id, (updated) => {
      setRoom(updated);
      if (
        updated.roundStartTime &&
        updated.roundStartTime > 0 &&
        updated.currentRound === roomRef.current.currentRound
      ) {
        if (Math.abs(roundStartTimeRef.current - updated.roundStartTime) > 400) {
          roundStartTimeRef.current = updated.roundStartTime;
        }
      }
    });

    const unsubMessages = subscribeToRoomMessages(room.id, (msgs) => {
      setMessages(msgs);
    });

    // Ensure room status transitions to 'playing' if starting or waiting
    if (room.status === 'starting' || room.status === 'waiting') {
      setRoom((prev) => ({ ...prev, status: 'playing' }));
    }

    return () => {
      unsubRoom();
      unsubMessages();
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      if (roundTransitionTimeoutRef.current) clearTimeout(roundTransitionTimeoutRef.current);
      if (botAnswerTimerRef.current) clearTimeout(botAnswerTimerRef.current);
      if (guestFallbackTimeoutRef.current) clearTimeout(guestFallbackTimeoutRef.current);
    };
  }, [room.id]);

  // Fallback question hydration if room was initialized with empty questions
  useEffect(() => {
    if (!room.questions || room.questions.length === 0) {
      fetchDynamicGameQuestions({
        category: room.gameMode,
        countryCode: room.targetCountryCode,
        count: room.totalRounds || 5,
        userLevel: user.level,
      }).then((qs) => {
        if (qs.length > 0) {
          const now = Date.now();
          roundStartTimeRef.current = now;
          setRoom((prev) => ({
            ...prev,
            questions: qs,
            currentQuestion: qs[0],
            roundStartedAt: now,
            roundStartTime: now,
          }));
          if (isHostRef.current || room.isBotOpponent) {
            syncRoomRoundStartTime(room.id, now);
          }
        }
      });
    }
  }, [room.id]);

  // Execute round advancement (host updates Firestore, local state updates optimistically)
  const executeAdvanceToNextRound = () => {
    const currentRoom = roomRef.current;
    const nextRound = currentRoom.currentRound + 1;

    if (nextRound > currentRoom.totalRounds) {
      let winnerId: string | 'tie' = 'tie';
      if ((currentRoom.hostScore || 0) > (currentRoom.guestScore || 0)) {
        winnerId = currentRoom.hostId;
      } else if ((currentRoom.guestScore || 0) > (currentRoom.hostScore || 0)) {
        winnerId = currentRoom.guestId;
      }

      setRoom((prev) => ({
        ...prev,
        status: 'finished',
        winnerId,
      }));

      if (isHostRef.current || currentRoom.isBotOpponent) {
        advanceToNextRoundOrFinish(currentRoom.id, currentRoom);
      }
    } else {
      const nextQuestion = currentRoom.questions ? currentRoom.questions[nextRound - 1] : undefined;
      const now = Date.now();
      roundStartTimeRef.current = now;

      // Optimistic transition with fresh timestamp
      setRoom((prev) => ({
        ...prev,
        currentRound: nextRound,
        currentQuestion: nextQuestion,
        status: 'playing',
        hostAnswer: null,
        hostAnswerTime: null,
        guestAnswer: null,
        guestAnswerTime: null,
        roundStartedAt: now,
        roundStartTime: now,
      }));

      if (isHostRef.current || currentRoom.isBotOpponent) {
        advanceToNextRoundOrFinish(currentRoom.id, currentRoom);
      }
    }
  };

  // Safe trigger for round advancement with answer explanation window
  const triggerRoundAdvance = (_reason: string) => {
    if (isAdvancingRoundRef.current) return;
    isAdvancingRoundRef.current = true;

    // Halt question countdown timer
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    // Reveal explanation and feedback
    setShowExplanation(true);

    if (roundTransitionTimeoutRef.current) {
      clearTimeout(roundTransitionTimeoutRef.current);
    }

    // Transition after 2.5 seconds (gives players time to review answers)
    roundTransitionTimeoutRef.current = setTimeout(() => {
      executeAdvanceToNextRound();
    }, 2500);

    // Multiplayer Guest fallback: if Host dropped or lagged, Guest advances after buffer
    if (!isHostRef.current && !roomRef.current.isBotOpponent) {
      if (guestFallbackTimeoutRef.current) clearTimeout(guestFallbackTimeoutRef.current);
      const currentRoundNum = roomRef.current.currentRound;
      guestFallbackTimeoutRef.current = setTimeout(() => {
        if (roomRef.current.currentRound === currentRoundNum && roomRef.current.status !== 'finished') {
          advanceToNextRoundOrFinish(roomRef.current.id, roomRef.current);
        }
      }, 4500);
    }
  };

  // Handle current round change / start timestamp-based countdown timer as soon as question loads
  useEffect(() => {
    if (room.status === 'finished') {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      if (roundTransitionTimeoutRef.current) clearTimeout(roundTransitionTimeoutRef.current);
      if (botAnswerTimerRef.current) clearTimeout(botAnswerTimerRef.current);
      if (guestFallbackTimeoutRef.current) clearTimeout(guestFallbackTimeoutRef.current);
      handleMatchFinished();
      return;
    }

    // Reset round states
    setSelectedAnswer(null);
    setHasAnswered(false);
    setShowExplanation(false);
    isAdvancingRoundRef.current = false;
    activeRoundRef.current = room.currentRound;

    // Clean up previous interval/timeouts
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (roundTransitionTimeoutRef.current) clearTimeout(roundTransitionTimeoutRef.current);
    if (botAnswerTimerRef.current) clearTimeout(botAnswerTimerRef.current);
    if (guestFallbackTimeoutRef.current) clearTimeout(guestFallbackTimeoutRef.current);

    // If current question has not loaded yet, wait for it
    if (!currentQ) return;

    // Record question in session deduplication tracker
    if (currentQ.id) {
      recordQuestionsAnsweredInSession([currentQ.id]);
    }

    // Authoritative round start timestamp calculation
    const now = Date.now();
    let startTime = room.roundStartTime || room.roundStartedAt || 0;

    // Check if timestamp is missing or stale (> 15s old or > 4s in future)
    const isInvalid = !startTime || (now - startTime >= 15000) || (startTime > now + 4000);

    if (isInvalid) {
      if (isHostRef.current) {
        startTime = now;
        roundStartTimeRef.current = now;
        setRoom((prev) => ({
          ...prev,
          roundStartTime: now,
          roundStartedAt: now,
        }));
        syncRoomRoundStartTime(room.id, now);
      } else {
        roundStartTimeRef.current = now;
      }
    } else {
      roundStartTimeRef.current = startTime;
    }

    // Initial countdown calculation (clamped so clock skew never produces negative or >10 remaining)
    const elapsedInitial = Math.max(0, Math.floor((Date.now() - roundStartTimeRef.current) / 1000));
    const initialRemaining = Math.max(0, 10 - elapsedInitial);
    setTimeLeft(initialRemaining);

    let lastSoundSecond = -1;

    // High-precision interval checking Date.now() against roundStartTimeRef
    timerRef.current = setInterval(() => {
      // Discontinue if round transition is in progress or round changed
      if (isAdvancingRoundRef.current || activeRoundRef.current !== roomRef.current.currentRound) {
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
        return;
      }

      const elapsed = Math.max(0, Math.floor((Date.now() - roundStartTimeRef.current) / 1000));
      const remaining = Math.max(0, 10 - elapsed);
      setTimeLeft(remaining);

      if (remaining <= 3 && remaining > 0 && remaining !== lastSoundSecond) {
        lastSoundSecond = remaining;
        sounds.playCountdown();
      }

      if (remaining <= 0) {
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
        handleTimeExpired();
      }
    }, 100);

    // Bot opponent answering simulation
    if (room.isBotOpponent && !room.guestAnswer) {
      const botDelay = 1800 + Math.random() * 1600;
      botAnswerTimerRef.current = setTimeout(() => {
        if (isAdvancingRoundRef.current) return;
        const q = currentQ;
        if (!q) return;

        // Bot has ~80% accuracy
        const isBotCorrect = Math.random() > 0.2;
        const botAns = isBotCorrect
          ? q.correctAnswer
          : q.options.find((o) => o !== q.correctAnswer) || q.options[0];

        const botPoints = isBotCorrect
          ? Math.max(50, 100 + Math.floor((10000 - Math.min(botDelay, 10000)) / 100))
          : 0;

        setRoom((prev) => ({
          ...prev,
          guestAnswer: botAns,
          guestAnswerTime: botDelay,
          guestScore: (prev.guestScore || 0) + botPoints,
        }));
      }, botDelay);
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      if (botAnswerTimerRef.current) clearTimeout(botAnswerTimerRef.current);
      if (roundTransitionTimeoutRef.current) clearTimeout(roundTransitionTimeoutRef.current);
      if (guestFallbackTimeoutRef.current) clearTimeout(guestFallbackTimeoutRef.current);
    };
  }, [room.currentRound, room.id, currentQ?.id]);

  // Monitor when both players have submitted answers
  useEffect(() => {
    if (room.status === 'finished') return;

    const hostDone = Boolean(room.hostAnswer);
    const guestDone = Boolean(room.guestAnswer);

    if (hostDone && guestDone) {
      triggerRoundAdvance('both_answered');
    }
  }, [room.hostAnswer, room.guestAnswer, room.status, room.currentRound]);

  const handleTimeExpired = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    const currentRoom = roomRef.current;
    const fallbackAns = '__TIME_EXPIRED__';

    setHasAnswered(true);
    setSelectedAnswer((prev) => {
      if (!prev) {
        sounds.playWrong();
        return fallbackAns;
      }
      return prev;
    });

    const isHostPlayer = isHostRef.current;
    if (isHostPlayer && !currentRoom.hostAnswer) {
      submitPlayerAnswer(currentRoom.id, user.uid, fallbackAns, 10000, false, currentRoom);
    } else if (!isHostPlayer && !currentRoom.guestAnswer) {
      submitPlayerAnswer(currentRoom.id, user.uid, fallbackAns, 10000, false, currentRoom);
    }

    setRoom((prev) => ({
      ...prev,
      hostAnswer: prev.hostAnswer || fallbackAns,
      guestAnswer: prev.guestAnswer || fallbackAns,
    }));

    triggerRoundAdvance('time_expired');
  };

  const handleAnswerSelect = (option: string) => {
    if (hasAnswered || showExplanation || isAdvancingRoundRef.current) return;
    setHasAnswered(true);
    setSelectedAnswer(option);

    const timeTaken = Math.max(0, Date.now() - roundStartTimeRef.current);
    const curQ = currentQ;
    const isCorrect = curQ ? option === curQ.correctAnswer : false;

    if (isCorrect) {
      sounds.playCorrect();
    } else {
      sounds.playWrong();
    }

    const pointsEarned = isCorrect
      ? Math.max(50, 100 + Math.floor((10000 - Math.min(timeTaken, 10000)) / 100))
      : 0;

    // Optimistically update local room
    const isHostPlayer = isHostRef.current;
    setRoom((prev) => {
      const copy = { ...prev };
      if (isHostPlayer) {
        copy.hostAnswer = option;
        copy.hostAnswerTime = timeTaken;
        copy.hostScore = (copy.hostScore || 0) + pointsEarned;
      } else {
        copy.guestAnswer = option;
        copy.guestAnswerTime = timeTaken;
        copy.guestScore = (copy.guestScore || 0) + pointsEarned;
      }
      return copy;
    });

    submitPlayerAnswer(room.id, user.uid, option, timeTaken, isCorrect, roomRef.current);

    // If opponent is bot and hasn't answered yet, reply promptly
    if (room.isBotOpponent && !room.guestAnswer) {
      if (botAnswerTimerRef.current) clearTimeout(botAnswerTimerRef.current);
      const quickDelay = 600 + Math.random() * 800;
      botAnswerTimerRef.current = setTimeout(() => {
        if (isAdvancingRoundRef.current) return;
        if (!curQ) return;
        const isBotCorrect = Math.random() > 0.25;
        const botAns = isBotCorrect
          ? curQ.correctAnswer
          : curQ.options.find((o) => o !== curQ.correctAnswer) || curQ.options[0];
        const botPoints = isBotCorrect
          ? Math.max(50, 100 + Math.floor((10000 - Math.min(quickDelay, 10000)) / 100))
          : 0;

        setRoom((prev) => ({
          ...prev,
          guestAnswer: botAns,
          guestAnswerTime: quickDelay,
          guestScore: (prev.guestScore || 0) + botPoints,
        }));
      }, quickDelay);
    }
  };

  const handleMatchFinished = async () => {
    if (awardedResults) return;

    sounds.playVictory();
    try {
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 },
      });
    } catch {
      // confetti
    }

    if (room.questions && room.questions.length > 0) {
      recordQuestionsAnsweredInSession(room.questions.map((q) => q.id));
    }

    const myScore = isHost ? room.hostScore : room.guestScore;
    const opponentScore = isHost ? room.guestScore : room.hostScore;
    const isWinner = myScore >= opponentScore;
    const xpReward = isWinner ? 250 : 100;
    const coinsReward = isWinner ? 50 : 20;

    const opponentCountryCode = isHost ? room.guestCountryCode : room.hostCountryCode;
    const opponentUsername = isHost ? room.guestUsername : room.hostUsername;
    const opponentAvatar = isHost ? room.guestAvatar : room.hostAvatar;

    const res = await awardGameResults(
      user.uid,
      isWinner,
      xpReward,
      coinsReward,
      opponentCountryCode,
      opponentUsername,
      opponentAvatar
    );

    if (res.newlyUnlockedCountry) {
      sounds.playStamp();
    }

    setAwardedResults({
      ...res,
      xpEarned: xpReward,
      coinsEarned: coinsReward,
    });
  };

  const handleSendChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    sounds.playPop();
    sendRoomChatMessage(
      room.id,
      {
        uid: user.uid,
        username: user.username,
        avatar: user.avatar,
        countryFlag: user.countryFlag,
      },
      chatInput.trim(),
      'text'
    );
    setChatInput('');
  };

  const handleSendEmoji = (emoji: string) => {
    sounds.playPop();
    sendRoomChatMessage(
      room.id,
      {
        uid: user.uid,
        username: user.username,
        avatar: user.avatar,
        countryFlag: user.countryFlag,
      },
      emoji,
      'emoji'
    );
  };

  const handleReport = async () => {
    const targetUserId = isHost ? room.guestId : room.hostId;
    const targetUsername = isHost ? room.guestUsername : room.hostUsername;

    await reportUser({
      reporterId: user.uid,
      reporterUsername: user.username,
      reportedUserId: targetUserId,
      reportedUsername: targetUsername,
      reason: reportReason,
    });
    setReportedSuccess(true);
    setTimeout(() => {
      setReportModalOpen(false);
      setReportedSuccess(false);
    }, 1500);
  };

  const opponentName = isHost ? room.guestUsername : room.hostUsername;
  const opponentAvatar = isHost ? room.guestAvatar : room.hostAvatar;
  const opponentFlag = isHost ? room.guestCountryFlag : room.hostCountryFlag;
  const opponentScore = isHost ? room.guestScore : room.hostScore;
  const myScore = isHost ? room.hostScore : room.guestScore;

  // -------------------------------------------------------------
  // VICTORY / RESULTS SCREEN
  // -------------------------------------------------------------
  if (room.status === 'finished') {
    const isWinner = myScore > opponentScore;
    const isTie = myScore === opponentScore;

    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-4 animate-fade-in">
        <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl text-center relative overflow-hidden">
          {/* Confetti / Glow Backdrop */}
          <div className="absolute -top-12 -right-12 w-48 h-48 bg-rose-500/20 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -bottom-10 -left-10 w-48 h-48 bg-indigo-500/20 rounded-full blur-3xl pointer-events-none" />

          {/* Trophy / Result Icon */}
          <div className="w-20 h-20 mx-auto rounded-3xl bg-gradient-to-tr from-amber-400 via-rose-500 to-indigo-600 flex items-center justify-center text-4xl shadow-xl shadow-amber-500/20 mb-3 animate-bounce">
            {isWinner ? '🏆' : isTie ? '🤝' : '🥈'}
          </div>

          <span className="text-[11px] font-black uppercase tracking-widest text-amber-400">
            MATCH CONCLUSION
          </span>
          <h2 className="text-3xl font-black text-white mt-1">
            {room.forfeitBy
              ? room.forfeitBy !== user.uid
                ? 'VICTORY BY FORFEIT!'
                : 'FORFEITED'
              : isWinner
              ? 'VICTORY!'
              : isTie
              ? 'WELL PLAYED!'
              : 'DEFEAT'}
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            {room.forfeitBy
              ? room.forfeitBy !== user.uid
                ? `${opponentName} left the match. Victory has been awarded to you!`
                : 'You surrendered the duel.'
              : isWinner
              ? `You triumphed over ${opponentName} in a cultural showdown!`
              : isTie
              ? 'An evenly matched clash of world explorers!'
              : `Good game! ${opponentName} claimed the crown this time.`}
          </p>

          {/* Final Score Duel Card */}
          <div className="my-5 p-4 rounded-2xl bg-slate-800/80 border border-slate-700/60 flex items-center justify-around">
            {/* You */}
            <div className="flex flex-col items-center">
              <span className="text-2xl mb-1">{user.countryFlag}</span>
              <span className="text-xs font-bold text-slate-300 truncate max-w-[90px]">{user.username}</span>
              <span className="text-2xl font-black text-emerald-400 mt-0.5">{myScore}</span>
            </div>

            <div className="text-xs font-black text-slate-500 uppercase px-2">VS</div>

            {/* Opponent */}
            <div className="flex flex-col items-center">
              <span className="text-2xl mb-1">{opponentFlag}</span>
              <span className="text-xs font-bold text-slate-300 truncate max-w-[90px]">{opponentName}</span>
              <span className="text-2xl font-black text-slate-300 mt-0.5">{opponentScore}</span>
            </div>
          </div>

          {/* Virtual Passport Stamp Unlock Animation! */}
          {awardedResults?.newlyUnlockedCountry && (
            <div className="mb-5 p-4 rounded-2xl bg-emerald-950/40 border border-emerald-500/50 text-left animate-scale-up">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-emerald-500/20 border border-emerald-400 text-3xl flex items-center justify-center shrink-0 shadow-lg">
                  {opponentFlag}
                </div>
                <div>
                  <span className="text-[10px] font-black uppercase tracking-wider text-emerald-400 flex items-center gap-1">
                    <span>🛂</span> PASSPORT STAMP UNLOCKED!
                  </span>
                  <h4 className="text-sm font-black text-white">
                    {opponentFlag} Discovered {awardedResults.newlyUnlockedCountry}!
                  </h4>
                  <p className="text-[11px] text-slate-300">
                    Successfully met and played with {opponentName}. Added to your virtual passport!
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* XP & Coins Rewards */}
          <div className="grid grid-cols-2 gap-3 mb-6">
            <div className="bg-slate-800/60 border border-slate-700/40 rounded-2xl p-3 text-center">
              <span className="text-[10px] font-bold text-indigo-400 uppercase block">XP EARNED</span>
              <span className="text-xl font-black text-indigo-300">
                +{awardedResults?.xpEarned || (isWinner ? 250 : 100)} XP
              </span>
            </div>
            <div className="bg-slate-800/60 border border-slate-700/40 rounded-2xl p-3 text-center">
              <span className="text-[10px] font-bold text-yellow-400 uppercase block">COINS REWARD</span>
              <span className="text-xl font-black text-yellow-300">
                +{awardedResults?.coinsEarned || (isWinner ? 50 : 20)} 🪙
              </span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="space-y-2.5">
            <button
              onClick={() => {
                sounds.playPop();
                onRematch();
              }}
              className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-amber-500 via-rose-600 to-indigo-600 hover:opacity-95 text-white font-extrabold text-sm flex items-center justify-center gap-2 shadow-xl shadow-rose-500/20 active:scale-98 transition-all cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Rematch / Play Another</span>
            </button>

            <button
              onClick={() => {
                sounds.playPop();
                onExitRoom();
              }}
              className="w-full py-3 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs active:scale-98 transition-all cursor-pointer"
            >
              Return to Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------
  // ACTIVE PLAYING GAME ARENA
  // -------------------------------------------------------------
  return (
    <div className="w-full min-h-[100dvh] bg-slate-950 text-slate-100 flex justify-center">
      <div className="w-full max-w-md min-h-[100dvh] bg-slate-950 flex flex-col justify-between relative select-none">
        {/* Top Header: VS Scoreboard */}
        <div className="bg-slate-900 border-b border-slate-800 p-3 pt-safe sticky top-0 z-30 shadow-md">
        <div className="flex items-center justify-between">
          {/* Player A (You) */}
          <div className="flex items-center gap-2">
            <div className="relative">
              <img
                src={user.avatar}
                alt={user.username}
                className="w-10 h-10 rounded-xl object-cover ring-2 ring-indigo-500 bg-slate-800"
              />
              <span className="absolute -bottom-1 -right-1 text-xs">{user.countryFlag}</span>
            </div>
            <div>
              <span className="text-xs font-bold text-white block truncate max-w-[80px]">
                {user.username}
              </span>
              <span className="text-sm font-black text-indigo-400 font-mono">{myScore}</span>
            </div>
          </div>

          {/* Round & Timer Indicator */}
          <div className="text-center px-1 flex items-center gap-1.5">
            <div>
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block">
                ROUND {room.currentRound} / {room.totalRounds}
              </span>
              <div className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-slate-800 border border-slate-700 text-sm font-mono font-black text-amber-400">
                {timeLeft}s
              </div>
            </div>
            <button
              onClick={() => {
                sounds.playPop();
                setForfeitModalOpen(true);
              }}
              className="p-1.5 rounded-xl text-slate-500 hover:text-rose-400 hover:bg-slate-800 transition-colors cursor-pointer"
              title="Leave / Forfeit Match"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Player B (Opponent) */}
          <div className="flex items-center gap-2 flex-row-reverse text-right">
            <div className="relative">
              <img
                src={opponentAvatar}
                alt={opponentName}
                className="w-10 h-10 rounded-xl object-cover ring-2 ring-rose-500 bg-slate-800"
              />
              <span className="absolute -bottom-1 -left-1 text-xs">{opponentFlag}</span>
            </div>
            <div>
              <span className="text-xs font-bold text-white block truncate max-w-[80px]">
                {opponentName}
              </span>
              <span className="text-sm font-black text-rose-400 font-mono">{opponentScore}</span>
            </div>
          </div>
        </div>

        {/* Timer Bar */}
        <div className="w-full h-1.5 bg-slate-800 rounded-full mt-2.5 overflow-hidden">
          <div
            className={`h-full transition-all duration-300 ${
              timeLeft <= 3 ? 'bg-rose-500 animate-pulse' : 'bg-gradient-to-r from-amber-400 to-rose-500'
            }`}
            style={{ width: `${(timeLeft / 10) * 100}%` }}
          />
        </div>
      </div>

      {/* Main Question Arena */}
      <div className="flex-1 p-4 flex flex-col justify-center">
        {currentQ ? (
          <div className="space-y-4">
            {/* Category Pill & Country Origin */}
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-2.5 py-1 rounded-full">
                {currentQ.category.replace('_', ' ')}
              </span>
              <span className="text-xs text-slate-400 font-bold flex items-center gap-1">
                <span>{currentQ.countryName}</span>
                <span>{currentQ.category === 'guess_word' ? '🗣️' : '🌍'}</span>
              </span>
            </div>

            {/* Question Prompt Card */}
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-xl text-center relative overflow-hidden">
              <p className="text-base font-extrabold text-white leading-snug">
                {currentQ.prompt}
              </p>

              {/* Special Mini-Game 4: Music Sound Synthesis Button */}
              {currentQ.category === 'music_culture' && (
                <div className="mt-4">
                  <button
                    onClick={() => {
                      sounds.playMelody([523, 659, 784, 1046], 'bell');
                    }}
                    className="inline-flex items-center gap-2 bg-gradient-to-r from-emerald-600 to-teal-600 text-white px-4 py-2 rounded-2xl text-xs font-extrabold shadow-md active:scale-95 transition-transform cursor-pointer"
                  >
                    <Music className="w-4 h-4 animate-bounce" />
                    <span>🔊 Play Cultural Audio Pattern</span>
                  </button>
                </div>
              )}
            </div>

            {/* 4 Interactive Option Buttons */}
            <div className="grid grid-cols-1 gap-2.5">
              {currentQ.options.map((option, idx) => {
                const isSelected = selectedAnswer === option;
                const isCorrect = option === currentQ.correctAnswer;
                const showResult = showExplanation || hasAnswered;

                let btnStyle = 'bg-slate-900 border-slate-800 text-slate-200 hover:border-indigo-500/60';

                if (showResult) {
                  if (isCorrect) {
                    btnStyle = 'bg-emerald-600 border-emerald-400 text-white font-black shadow-lg shadow-emerald-500/20';
                  } else if (isSelected && !isCorrect) {
                    btnStyle = 'bg-rose-600 border-rose-400 text-white font-black';
                  } else {
                    btnStyle = 'bg-slate-900/50 border-slate-800/50 text-slate-500';
                  }
                }

                return (
                  <button
                    key={option}
                    disabled={hasAnswered}
                    onClick={() => handleAnswerSelect(option)}
                    className={`w-full p-4 rounded-2xl border text-sm font-bold text-left transition-all active:scale-98 flex items-center justify-between cursor-pointer ${btnStyle}`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="w-6 h-6 rounded-lg bg-slate-800/80 text-slate-400 text-xs flex items-center justify-center font-mono">
                        {String.fromCharCode(65 + idx)}
                      </span>
                      <span>{option}</span>
                    </div>

                    {showResult && isCorrect && (
                      <CheckCircle2 className="w-5 h-5 text-white" />
                    )}
                    {showResult && isSelected && !isCorrect && (
                      <AlertCircle className="w-5 h-5 text-white" />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Explanation Drawer when Round Answers Revealed */}
            {showExplanation && (
              <div className="p-3.5 rounded-2xl bg-indigo-950/40 border border-indigo-500/40 text-xs text-indigo-200 animate-fade-in flex items-start gap-2.5">
                <Sparkles className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-extrabold text-white block mb-0.5">Cultural Fact:</span>
                  <p className="leading-relaxed">{currentQ.explanation}</p>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-12 text-slate-400">Loading next question...</div>
        )}
      </div>

      {/* Bottom Action Bar: Chat & Safety Controls */}
      <div className="bg-slate-900/90 border-t border-slate-800 px-4 py-2.5 flex items-center justify-between">
        {/* Quick Emoji Reactions */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          {['👏', '🔥', '🇹🇳', '🇯🇵', '😱', '❤️', 'GG!'].map((emoji) => (
            <button
              key={emoji}
              onClick={() => handleSendEmoji(emoji)}
              className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-xs rounded-xl active:scale-90 transition-transform cursor-pointer"
            >
              {emoji}
            </button>
          ))}
        </div>

        {/* Chat Drawer Toggle & Report Safety Button */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              sounds.playPop();
              setIsChatOpen(!isChatOpen);
            }}
            className="p-2 rounded-xl bg-indigo-600/20 text-indigo-300 hover:bg-indigo-600/30 transition-colors relative"
            title="In-game Chat"
          >
            <MessageSquare className="w-4 h-4" />
            {messages.length > 0 && (
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-rose-500 rounded-full" />
            )}
          </button>

          <button
            onClick={() => setReportModalOpen(true)}
            className="p-2 rounded-xl bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition-colors"
            title="Report Player"
          >
            <Flag className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* In-Game Slide-Up Chat Panel */}
      {isChatOpen && (
        <div className="fixed inset-x-0 bottom-0 z-40 bg-slate-900/95 backdrop-blur-md border-t border-slate-800 p-4 max-w-md mx-auto rounded-t-3xl shadow-2xl animate-slide-up">
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800">
            <h4 className="text-xs font-black uppercase tracking-wider text-slate-300">
              Live Duel Chat
            </h4>
            <button
              onClick={() => setIsChatOpen(false)}
              className="p-1 text-slate-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Messages list */}
          <div className="h-44 overflow-y-auto space-y-2 text-xs pr-1">
            {messages.length === 0 ? (
              <div className="text-center text-slate-500 py-10">
                Say hello or cheer your opponent!
              </div>
            ) : (
              messages.map((m) => {
                const isMe = m.senderId === user.uid;
                return (
                  <div
                    key={m.id}
                    className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
                  >
                    <span className="text-[10px] text-slate-500 mb-0.5">
                      {m.senderUsername} {m.senderCountryFlag}
                    </span>
                    <div
                      className={`px-3 py-1.5 rounded-2xl max-w-[80%] ${
                        isMe
                          ? 'bg-indigo-600 text-white rounded-br-xs'
                          : 'bg-slate-800 text-slate-200 rounded-bl-xs'
                      }`}
                    >
                      {m.text}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Chat Input */}
          <form onSubmit={handleSendChat} className="mt-3 flex items-center gap-2">
            <input
              type="text"
              placeholder="Type message..."
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              maxLength={150}
              className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
            />
            <button
              type="submit"
              className="p-2 rounded-xl bg-indigo-600 text-white hover:bg-indigo-500 cursor-pointer"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      )}

      {/* Safety Report Modal */}
      {reportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-2xl text-slate-100">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-black text-white">Report Challenger</h3>
              <button
                onClick={() => setReportModalOpen(false)}
                className="p-1 text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {reportedSuccess ? (
              <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs rounded-xl text-center">
                Report submitted to moderators. Thank you for keeping World Challenge safe!
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-xs text-slate-400">
                  Select violation reason regarding {opponentName}:
                </p>
                <select
                  value={reportReason}
                  onChange={(e) => setReportReason(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl p-2.5 text-xs text-white"
                >
                  <option value="Unsportsmanlike conduct">Unsportsmanlike conduct</option>
                  <option value="Inappropriate language or harassment">
                    Inappropriate language or harassment
                  </option>
                  <option value="Offensive avatar or profile">Offensive avatar or profile</option>
                  <option value="Cheating / automation">Cheating / automation</option>
                  <option value="Spam">Spam</option>
                </select>

                <div className="flex gap-2 pt-2">
                  <button
                    onClick={() => setReportModalOpen(false)}
                    className="flex-1 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-bold"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleReport}
                    className="flex-1 py-2 rounded-xl bg-rose-600 text-white text-xs font-bold hover:bg-rose-500"
                  >
                    Submit Report
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      {/* Forfeit Confirmation Modal */}
      {forfeitModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 max-w-xs w-full text-center space-y-3 shadow-2xl">
            <div className="w-12 h-12 rounded-2xl bg-rose-500/20 text-rose-400 flex items-center justify-center mx-auto text-xl font-bold">
              <LogOut className="w-6 h-6" />
            </div>
            <h4 className="text-base font-extrabold text-white">Leave Match?</h4>
            <p className="text-xs text-slate-400 leading-relaxed">
              If you leave now, you will forfeit this duel and victory will be awarded to {opponentName}.
            </p>
            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setForfeitModalOpen(false)}
                className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition-colors cursor-pointer"
              >
                Resume
              </button>
              <button
                onClick={async () => {
                  sounds.playWrong();
                  setForfeitModalOpen(false);
                  await forfeitGame(room.id, user.uid, roomRef.current);
                  onExitRoom();
                }}
                className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold shadow-lg shadow-rose-600/30 transition-colors cursor-pointer"
              >
                Forfeit
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
};
