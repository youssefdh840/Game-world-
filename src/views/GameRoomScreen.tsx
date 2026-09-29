import React, { useState, useEffect, useRef } from 'react';
import { GameRoom, UserProfile, Question, ChatMessage } from '../types/game';
import {
  subscribeToGameRoom,
  submitPlayerAnswer,
  advanceToNextRoundOrFinish,
  subscribeToRoomMessages,
  sendRoomChatMessage,
  reportUser,
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

  // End of match awards
  const [awardedResults, setAwardedResults] = useState<{
    leveledUp: boolean;
    newLevel: number;
    newlyUnlockedCountry?: string;
    newBadges: string[];
    xpEarned: number;
    coinsEarned: number;
  } | null>(null);

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const questionStartTimeRef = useRef<number>(Date.now());
  const botAnswerTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Subscribe to room
  useEffect(() => {
    setIsHost(room.hostId === user.uid);
    const unsubRoom = subscribeToGameRoom(room.id, (updated) => {
      setRoom(updated);
    });

    const unsubMessages = subscribeToRoomMessages(room.id, (msgs) => {
      setMessages(msgs);
    });

    return () => {
      unsubRoom();
      unsubMessages();
      if (timerRef.current) clearInterval(timerRef.current);
      if (botAnswerTimerRef.current) clearTimeout(botAnswerTimerRef.current);
    };
  }, [room.id]);

  // Handle current round change / reset timer
  useEffect(() => {
    if (room.status === 'finished') {
      handleMatchFinished();
      return;
    }

    // Reset round state
    setSelectedAnswer(null);
    setHasAnswered(false);
    setShowExplanation(false);
    setTimeLeft(10);
    questionStartTimeRef.current = Date.now();

    if (timerRef.current) clearInterval(timerRef.current);
    if (botAnswerTimerRef.current) clearTimeout(botAnswerTimerRef.current);

    // Start 10s question timer
    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          handleTimeExpired();
          return 0;
        }
        if (prev <= 3) {
          sounds.playCountdown();
        }
        return prev - 1;
      });
    }, 1000);

    // Bot opponent answering simulation
    if (room.isBotOpponent && !room.guestAnswer) {
      const botDelay = 1200 + Math.random() * 2000;
      botAnswerTimerRef.current = setTimeout(() => {
        const curQ = room.currentQuestion || (room.questions && room.questions[room.currentRound - 1]);
        if (!curQ) return;

        // Bot has ~80% accuracy
        const isBotCorrect = Math.random() > 0.2;
        const botAns = isBotCorrect
          ? curQ.correctAnswer
          : curQ.options.find((o) => o !== curQ.correctAnswer) || curQ.options[0];

        const botPoints = isBotCorrect
          ? Math.max(50, 100 + Math.floor((10000 - Math.min(botDelay, 10000)) / 100))
          : 0;

        // Optimistically update local room for bot
        setRoom((prev) => ({
          ...prev,
          guestAnswer: botAns,
          guestAnswerTime: botDelay,
          guestScore: (prev.guestScore || 0) + botPoints,
        }));

        submitPlayerAnswer(room.id, room.guestId, botAns, botDelay, isBotCorrect, room);
      }, botDelay);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (botAnswerTimerRef.current) clearTimeout(botAnswerTimerRef.current);
    };
  }, [room.currentRound, room.status]);

  const advanceRound = () => {
    const nextRound = room.currentRound + 1;
    if (nextRound > room.totalRounds) {
      let winnerId: string | 'tie' = 'tie';
      if (room.hostScore > room.guestScore) {
        winnerId = room.hostId;
      } else if (room.guestScore > room.hostScore) {
        winnerId = room.guestId;
      }
      setRoom((prev) => ({
        ...prev,
        status: 'finished',
        winnerId,
      }));
    } else {
      const nextQuestion = room.questions ? room.questions[nextRound - 1] : undefined;
      setRoom((prev) => ({
        ...prev,
        currentRound: nextRound,
        currentQuestion: nextQuestion,
        status: 'playing',
        hostAnswer: null,
        hostAnswerTime: null,
        guestAnswer: null,
        guestAnswerTime: null,
        roundStartedAt: Date.now(),
      }));
    }
    advanceToNextRoundOrFinish(room.id, room);
  };

  // Monitor when both players have answered
  useEffect(() => {
    const hostDone = Boolean(room.hostAnswer);
    const guestDone = Boolean(room.guestAnswer);

    if (hostDone && guestDone && !showExplanation) {
      if (timerRef.current) clearInterval(timerRef.current);
      setShowExplanation(true);

      // Advance after 2.8 seconds
      const timeout = setTimeout(() => {
        advanceRound();
      }, 2800);

      return () => clearTimeout(timeout);
    }
  }, [room.hostAnswer, room.guestAnswer, showExplanation, room]);

  const handleTimeExpired = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    setShowExplanation(true);

    const curQ = room.currentQuestion || (room.questions && room.questions[room.currentRound - 1]);
    const fallbackAns = '__TIME_EXPIRED__';

    setHasAnswered(true);
    if (!selectedAnswer) {
      setSelectedAnswer(fallbackAns);
      sounds.playWrong();
    }

    // Ensure both answers are marked as finished
    setRoom((prev) => ({
      ...prev,
      hostAnswer: prev.hostAnswer || fallbackAns,
      guestAnswer: prev.guestAnswer || fallbackAns,
    }));

    if (isHost && !room.hostAnswer) {
      submitPlayerAnswer(room.id, user.uid, fallbackAns, 10000, false, room);
    } else if (!isHost && !room.guestAnswer) {
      submitPlayerAnswer(room.id, user.uid, fallbackAns, 10000, false, room);
    }

    setTimeout(() => {
      advanceRound();
    }, 2800);
  };

  const handleAnswerSelect = (option: string) => {
    if (hasAnswered) return;
    setHasAnswered(true);
    setSelectedAnswer(option);

    const timeTaken = Date.now() - questionStartTimeRef.current;
    const curQ = room.currentQuestion || (room.questions && room.questions[room.currentRound - 1]);
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
    setRoom((prev) => {
      const copy = { ...prev };
      if (isHost) {
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

    submitPlayerAnswer(room.id, user.uid, option, timeTaken, isCorrect, room);

    // If opponent is bot and hasn't answered yet, answer promptly
    if (room.isBotOpponent && !room.guestAnswer) {
      const quickDelay = 600 + Math.random() * 800;
      setTimeout(() => {
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
        submitPlayerAnswer(room.id, room.guestId, botAns, quickDelay, isBotCorrect, room);
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

  const currentQ = room.currentQuestion || (room.questions && room.questions[room.currentRound - 1]);
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
            {isWinner ? 'VICTORY!' : isTie ? 'WELL PLAYED!' : 'DEFEAT'}
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            {isWinner
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
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between max-w-md mx-auto relative select-none">
      {/* Top Header: VS Scoreboard */}
      <div className="bg-slate-900 border-b border-slate-800 p-3 sticky top-0 z-30 shadow-md">
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
          <div className="text-center px-2">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block">
              ROUND {room.currentRound} / {room.totalRounds}
            </span>
            <div className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-slate-800 border border-slate-700 text-sm font-mono font-black text-amber-400">
              {timeLeft}s
            </div>
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
            className={`h-full transition-all duration-1000 ${
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
    </div>
  );
};
