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
  shuffleArraySeeded,
  scrambleWordDeterministic,
  forfeitGame,
  QUESTION_DURATION_SECONDS,
  QUESTION_DURATION_MS,
  WORD_SCRAMBLE_DURATION_SECONDS,
  WORD_SCRAMBLE_DURATION_MS,
  GUESS_NUMBER_DURATION_SECONDS,
  GUESS_NUMBER_DURATION_MS,
  GUESS_NUMBER_MAX_ATTEMPTS,
  calculateWordScramblePoints,
  calculateGuessNumberPoints,
} from '../services/gameService';
import { awardGameResults } from '../services/userService';
import { auth } from '../services/firebase';
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
  const effectiveUid = auth.currentUser?.uid || user.uid;
  const [room, setRoom] = useState<GameRoom>(initialRoom);
  const isWordScramble =
    room.gameMode === 'word_scramble' ||
    initialRoom.gameMode === 'word_scramble' ||
    room.currentQuestion?.category === 'word_scramble';
  const isGuessNumber =
    room.gameMode === 'guess_number' ||
    initialRoom.gameMode === 'guess_number' ||
    room.currentQuestion?.category === 'guess_number';
  const roundDurationSeconds = isWordScramble
    ? WORD_SCRAMBLE_DURATION_SECONDS
    : isGuessNumber
    ? GUESS_NUMBER_DURATION_SECONDS
    : QUESTION_DURATION_SECONDS;
  const roundDurationMs = isWordScramble
    ? WORD_SCRAMBLE_DURATION_MS
    : isGuessNumber
    ? GUESS_NUMBER_DURATION_MS
    : QUESTION_DURATION_MS;

  const [timeLeft, setTimeLeft] = useState<number>(roundDurationSeconds);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [hasAnswered, setHasAnswered] = useState<boolean>(false);
  const [showExplanation, setShowExplanation] = useState<boolean>(false);
  const [isHost, setIsHost] = useState<boolean>(
    initialRoom.hostId === effectiveUid || initialRoom.hostId === user.uid
  );
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isChatOpen, setIsChatOpen] = useState<boolean>(false);
  const [chatInput, setChatInput] = useState<string>('');
  const [reportModalOpen, setReportModalOpen] = useState<boolean>(false);
  const [reportReason, setReportReason] = useState<string>('Unsportsmanlike conduct');
  const [reportedSuccess, setReportedSuccess] = useState<boolean>(false);
  const [forfeitModalOpen, setForfeitModalOpen] = useState<boolean>(false);

  // Word Scramble specific interactive state
  const [selectedTileIndices, setSelectedTileIndices] = useState<number[]>([]);
  const [scrambleError, setScrambleError] = useState<string | null>(null);
  const [lastEarnedPoints, setLastEarnedPoints] = useState<number>(0);

  // Guess the Number specific interactive state
  const [numberInput, setNumberInput] = useState<string>('');
  const [numberGuesses, setNumberGuesses] = useState<
    Array<{ value: number; feedback: 'higher' | 'lower' | 'correct' }>
  >([]);
  const [numberError, setNumberError] = useState<string | null>(null);

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

  // Active question accessor with deterministic room-synchronized option/letter shuffling
  const rawCurrentQ = room.currentQuestion || (room.questions && room.questions[room.currentRound - 1]);
  const currentQ: Question | undefined = React.useMemo(() => {
    if (!rawCurrentQ) return undefined;
    const seed = `${room.id || 'room'}_${rawCurrentQ.id}_${room.currentRound}`;
    if (rawCurrentQ.category === 'guess_number' || room.gameMode === 'guess_number') {
      const targetNum =
        typeof rawCurrentQ.targetNumber === 'number'
          ? rawCurrentQ.targetNumber
          : parseInt(rawCurrentQ.correctAnswer, 10) || 50;
      return {
        ...rawCurrentQ,
        targetNumber: targetNum,
        correctAnswer: String(targetNum),
      };
    }
    if (rawCurrentQ.category === 'word_scramble' || room.gameMode === 'word_scramble') {
      const targetWord = rawCurrentQ.correctAnswer.toUpperCase().replace(/[^A-Z]/g, '');
      const syncScrambled = scrambleWordDeterministic(targetWord, seed);
      return {
        ...rawCurrentQ,
        scrambledWord: syncScrambled,
        options: syncScrambled.split(''),
        correctAnswer: targetWord,
      };
    }
    // Deterministically shuffle options seeded by room.id + question.id + round so both players see the exact same randomized A/B/C/D order
    return {
      ...rawCurrentQ,
      options: shuffleArraySeeded(rawCurrentQ.options, seed),
    };
  }, [rawCurrentQ?.id, room.id, room.currentRound, room.gameMode]);

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const roundStartTimeRef = useRef<number>(Date.now());
  const activeRoundRef = useRef<number>(0);
  const isAdvancingRoundRef = useRef<boolean>(false);
  const roundTransitionTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const guestFallbackTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Subscribe to real-time room updates and chat
  useEffect(() => {
    const activeUid = auth.currentUser?.uid || user.uid;
    setIsHost(room.hostId === activeUid || room.hostId === user.uid);
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
      if (guestFallbackTimeoutRef.current) clearTimeout(guestFallbackTimeoutRef.current);
    };
  }, [room.id]);

  // Fallback question hydration if room was initialized with empty questions
  useEffect(() => {
    if (!room.questions || room.questions.length === 0) {
      fetchDynamicGameQuestions({
        category: room.gameMode,
        countryCode: room.targetCountryCode,
        count: room.totalRounds || (room.gameMode === 'guess_number' ? 3 : 5),
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
          if (isHostRef.current) {
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

      if (isHostRef.current) {
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

      if (isHostRef.current) {
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
    if (!isHostRef.current) {
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
      if (guestFallbackTimeoutRef.current) clearTimeout(guestFallbackTimeoutRef.current);
      handleMatchFinished();
      return;
    }

    // Reset round states
    setSelectedAnswer(null);
    setHasAnswered(false);
    setShowExplanation(false);
    setSelectedTileIndices([]);
    setScrambleError(null);
    setNumberInput('');
    setNumberGuesses([]);
    setNumberError(null);
    setLastEarnedPoints(0);
    isAdvancingRoundRef.current = false;
    activeRoundRef.current = room.currentRound;

    // Clean up previous interval/timeouts
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (roundTransitionTimeoutRef.current) clearTimeout(roundTransitionTimeoutRef.current);
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

    // Check if timestamp is missing or stale
    const isInvalid = !startTime || (now - startTime >= roundDurationMs + 5000) || (startTime > now + 4000);

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

    // Initial countdown calculation (clamped so clock skew never produces negative or >roundDurationSeconds remaining)
    const elapsedInitial = Math.max(0, Math.floor((Date.now() - roundStartTimeRef.current) / 1000));
    const initialRemaining = Math.max(0, roundDurationSeconds - elapsedInitial);
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
      const remaining = Math.max(0, roundDurationSeconds - elapsed);
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

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      if (roundTransitionTimeoutRef.current) clearTimeout(roundTransitionTimeoutRef.current);
      if (guestFallbackTimeoutRef.current) clearTimeout(guestFallbackTimeoutRef.current);
    };
  }, [room.currentRound, room.id, currentQ?.id, room.status, roundDurationSeconds, roundDurationMs]);

  // Monitor when both players have submitted answers (or in Guess the Number, when someone cracks the secret number first!)
  useEffect(() => {
    if (room.status === 'finished') return;

    const hostDone = Boolean(room.hostAnswer);
    const guestDone = Boolean(room.guestAnswer);

    if (isGuessNumber && currentQ) {
      const targetStr = String(
        typeof currentQ.targetNumber === 'number' ? currentQ.targetNumber : currentQ.correctAnswer
      );
      if (room.hostAnswer === targetStr || room.guestAnswer === targetStr) {
        triggerRoundAdvance('number_cracked_first');
        return;
      }
    }

    if (hostDone && guestDone) {
      triggerRoundAdvance('both_answered');
    }
  }, [room.hostAnswer, room.guestAnswer, room.status, room.currentRound, isGuessNumber, currentQ?.id]);

  const handleNumberGuessSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (hasAnswered || showExplanation || isAdvancingRoundRef.current || !currentQ) return;

    const raw = numberInput.trim();
    const num = parseInt(raw, 10);
    if (isNaN(num) || num < 1 || num > 100) {
      sounds.playWrong();
      setNumberError('Please enter a valid number between 1 and 100.');
      return;
    }

    if (numberGuesses.some((g) => g.value === num)) {
      sounds.playWrong();
      setNumberError(`You already guessed ${num}! Try a different number.`);
      return;
    }

    setNumberError(null);
    setNumberInput('');

    const targetNum =
      typeof currentQ.targetNumber === 'number'
        ? currentQ.targetNumber
        : parseInt(currentQ.correctAnswer, 10) || 50;

    const nextAttemptsUsed = numberGuesses.length + 1;

    if (num === targetNum) {
      // Cracked the secret number!
      sounds.playCorrect();
      const updatedGuesses = [
        ...numberGuesses,
        { value: num, feedback: 'correct' as const },
      ];
      setNumberGuesses(updatedGuesses);
      setHasAnswered(true);
      setSelectedAnswer(String(num));

      const timeTaken = Math.max(0, Date.now() - roundStartTimeRef.current);
      const elapsedSec = Math.max(0, Math.floor(timeTaken / 1000));
      const remainingSec = Math.max(0, GUESS_NUMBER_DURATION_SECONDS - elapsedSec);
      const pointsEarned = calculateGuessNumberPoints(nextAttemptsUsed, remainingSec);
      setLastEarnedPoints(pointsEarned);

      const isHostPlayer = isHostRef.current;
      setRoom((prev) => {
        const copy = { ...prev };
        if (isHostPlayer) {
          copy.hostAnswer = String(num);
          copy.hostAnswerTime = timeTaken;
          copy.hostScore = (copy.hostScore || 0) + pointsEarned;
        } else {
          copy.guestAnswer = String(num);
          copy.guestAnswerTime = timeTaken;
          copy.guestScore = (copy.guestScore || 0) + pointsEarned;
        }
        return copy;
      });

      const activeUid = auth.currentUser?.uid || user.uid;
      submitPlayerAnswer(
        room.id,
        activeUid,
        String(num),
        timeTaken,
        true,
        roomRef.current,
        pointsEarned
      );
      return;
    }

    // Incorrect guess: provide Higher ⬆️ or Lower ⬇️ hint
    const feedback: 'higher' | 'lower' = num < targetNum ? 'higher' : 'lower';
    const updatedGuesses = [...numberGuesses, { value: num, feedback }];
    setNumberGuesses(updatedGuesses);

    if (updatedGuesses.length >= GUESS_NUMBER_MAX_ATTEMPTS) {
      // Out of attempts (6 used)
      sounds.playWrong();
      setHasAnswered(true);
      const exhaustedAns = `__OUT_OF_ATTEMPTS_${num}__`;
      setSelectedAnswer(exhaustedAns);
      setLastEarnedPoints(0);

      const timeTaken = Math.max(0, Date.now() - roundStartTimeRef.current);
      const isHostPlayer = isHostRef.current;
      setRoom((prev) => {
        const copy = { ...prev };
        if (isHostPlayer) {
          copy.hostAnswer = exhaustedAns;
          copy.hostAnswerTime = timeTaken;
        } else {
          copy.guestAnswer = exhaustedAns;
          copy.guestAnswerTime = timeTaken;
        }
        return copy;
      });

      const activeUid = auth.currentUser?.uid || user.uid;
      submitPlayerAnswer(
        room.id,
        activeUid,
        exhaustedAns,
        timeTaken,
        false,
        roomRef.current,
        0
      );
    } else {
      sounds.playPop();
    }
  };

  const handleTimeExpired = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    const currentRoom = roomRef.current;
    const fallbackAns = '__TIME_EXPIRED__';

    setHasAnswered(true);
    setScrambleError(null);
    setSelectedAnswer((prev) => {
      if (!prev) {
        sounds.playWrong();
        return fallbackAns;
      }
      return prev;
    });

    const isHostPlayer = isHostRef.current;
    const activeUid = auth.currentUser?.uid || user.uid;
    if (isHostPlayer && !currentRoom.hostAnswer) {
      submitPlayerAnswer(currentRoom.id, activeUid, fallbackAns, roundDurationMs, false, currentRoom, 0);
    } else if (!isHostPlayer && !currentRoom.guestAnswer) {
      submitPlayerAnswer(currentRoom.id, activeUid, fallbackAns, roundDurationMs, false, currentRoom, 0);
    }

    setRoom((prev) => ({
      ...prev,
      hostAnswer: prev.hostAnswer || fallbackAns,
      guestAnswer: prev.guestAnswer || fallbackAns,
    }));

    triggerRoundAdvance('time_expired');
  };

  // Word Scramble: Verify assembled sequence, allow clear & retry on wrong guess
  const verifyWordScrambleSequence = (indices: number[]) => {
    if (hasAnswered || showExplanation || isAdvancingRoundRef.current || !currentQ) return;
    const letters = currentQ.options;
    const targetWord = currentQ.correctAnswer.toUpperCase().replace(/[^A-Z]/g, '');
    const candidate = indices.map((i) => letters[i]).join('').toUpperCase();

    if (candidate.length < targetWord.length) return;

    if (candidate === targetWord) {
      // Correct sequence! Lock in answer and award (Base 100 pts + Remaining Seconds x 5)
      sounds.playCorrect();
      setHasAnswered(true);
      setSelectedAnswer(candidate);
      setScrambleError(null);

      const timeTaken = Math.max(0, Date.now() - roundStartTimeRef.current);
      const elapsedSec = Math.max(0, Math.floor(timeTaken / 1000));
      const remainingSec = Math.max(0, WORD_SCRAMBLE_DURATION_SECONDS - elapsedSec);
      const pointsEarned = calculateWordScramblePoints(remainingSec);
      setLastEarnedPoints(pointsEarned);

      const isHostPlayer = isHostRef.current;
      setRoom((prev) => {
        const copy = { ...prev };
        if (isHostPlayer) {
          copy.hostAnswer = candidate;
          copy.hostAnswerTime = timeTaken;
          copy.hostScore = (copy.hostScore || 0) + pointsEarned;
        } else {
          copy.guestAnswer = candidate;
          copy.guestAnswerTime = timeTaken;
          copy.guestScore = (copy.guestScore || 0) + pointsEarned;
        }
        return copy;
      });

      const activeUid = auth.currentUser?.uid || user.uid;
      submitPlayerAnswer(
        room.id,
        activeUid,
        candidate,
        timeTaken,
        true,
        roomRef.current,
        pointsEarned
      );
    } else {
      // Incorrect sequence: allow player to clear and retry before time expires!
      sounds.playWrong();
      setScrambleError('Incorrect sequence! Tap Clear & Retry to try again before time runs out.');
    }
  };

  const handleScrambleTileClick = (tileIdx: number) => {
    if (hasAnswered || showExplanation || isAdvancingRoundRef.current || !currentQ) return;
    if (selectedTileIndices.includes(tileIdx)) return;

    sounds.playPop();
    setScrambleError(null);
    const nextIndices = [...selectedTileIndices, tileIdx];
    setSelectedTileIndices(nextIndices);

    const targetLength = currentQ.correctAnswer.replace(/[^A-Za-z]/g, '').length;
    if (nextIndices.length === targetLength) {
      verifyWordScrambleSequence(nextIndices);
    }
  };

  const handleRemoveScrambleSlot = (slotPosition: number) => {
    if (hasAnswered || showExplanation || isAdvancingRoundRef.current) return;
    sounds.playPop();
    setScrambleError(null);
    setSelectedTileIndices((prev) => prev.filter((_, idx) => idx !== slotPosition));
  };

  const handleClearScramble = () => {
    if (hasAnswered || showExplanation || isAdvancingRoundRef.current) return;
    sounds.playPop();
    setScrambleError(null);
    setSelectedTileIndices([]);
  };

  // Support physical keyboard typing & Backspace for Word Scramble
  useEffect(() => {
    if (!isWordScramble || room.status === 'finished' || hasAnswered || showExplanation) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in chat or report input
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (!currentQ) return;

      if (e.key === 'Backspace') {
        e.preventDefault();
        setScrambleError(null);
        setSelectedTileIndices((prev) => prev.slice(0, -1));
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        handleClearScramble();
        return;
      }

      const keyUpper = e.key.toUpperCase();
      if (/^[A-Z]$/.test(keyUpper)) {
        const availableIdx = currentQ.options.findIndex(
          (ch, idx) => ch.toUpperCase() === keyUpper && !selectedTileIndices.includes(idx)
        );
        if (availableIdx !== -1) {
          handleScrambleTileClick(availableIdx);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isWordScramble, room.status, hasAnswered, showExplanation, currentQ, selectedTileIndices]);

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
      ? Math.max(50, 100 + Math.floor(((QUESTION_DURATION_MS - Math.min(timeTaken, QUESTION_DURATION_MS)) / QUESTION_DURATION_MS) * 100))
      : 0;
    setLastEarnedPoints(pointsEarned);

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

    const activeUid = auth.currentUser?.uid || user.uid;
    submitPlayerAnswer(room.id, activeUid, option, timeTaken, isCorrect, roomRef.current);
  };

  const hasAwardedRef = useRef<boolean>(false);

  const handleMatchFinished = async () => {
    if (awardedResults || hasAwardedRef.current) return;
    hasAwardedRef.current = true;

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

    const latestRoom = roomRef.current;
    if (latestRoom.questions && latestRoom.questions.length > 0) {
      recordQuestionsAnsweredInSession(latestRoom.questions.map((q) => q.id));
    }

    const activeUid = auth.currentUser?.uid || user.uid;
    const isHostPlayer = isHostRef.current;
    const myScore = (isHostPlayer ? latestRoom.hostScore : latestRoom.guestScore) || 0;
    const opponentScore = (isHostPlayer ? latestRoom.guestScore : latestRoom.hostScore) || 0;

    const forfeitedById = latestRoom.forfeitBy || latestRoom.abandonedBy;
    const isWinner = forfeitedById
      ? forfeitedById !== activeUid && forfeitedById !== user.uid
      : myScore > opponentScore;

    const isScrambleOrNumberMatch =
      latestRoom.gameMode === 'word_scramble' ||
      initialRoom.gameMode === 'word_scramble' ||
      latestRoom.gameMode === 'guess_number' ||
      initialRoom.gameMode === 'guess_number';

    // Word Scramble & Guess the Number: Winner gains +180 XP, Runner-up gets participation +40 XP
    const xpReward = isScrambleOrNumberMatch
      ? isWinner
        ? 180
        : 40
      : isWinner
      ? 250
      : 100;
    const coinsReward = isWinner ? 50 : 20;

    const opponentCountryCode = isHostPlayer ? latestRoom.guestCountryCode : latestRoom.hostCountryCode;
    const opponentUsername = isHostPlayer ? latestRoom.guestUsername : latestRoom.hostUsername;
    const opponentAvatar = isHostPlayer ? latestRoom.guestAvatar : latestRoom.hostAvatar;

    // Winner unlocks opponent passport visa & updates leaderboard stats; runner-up gets participation XP
    const res = await awardGameResults(
      activeUid,
      isWinner,
      xpReward,
      coinsReward,
      isScrambleOrNumberMatch ? (isWinner ? opponentCountryCode : undefined) : opponentCountryCode,
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
    const matchQuestions = room.questions || [];

    return (
      <div className="min-h-[100dvh] w-full bg-[#0B0F19] text-slate-100 flex flex-col items-center justify-center p-4 sm:p-6 md:p-8 animate-fade-in">
        <div className="w-full max-w-md sm:max-w-lg bg-[#0E1526] border border-cyan-500/25 rounded-3xl p-6 sm:p-8 shadow-2xl text-center relative overflow-hidden">
          {/* Trophy / Result Icon */}
          <div className="w-20 h-20 sm:w-24 sm:h-24 mx-auto rounded-3xl bg-slate-900 border-2 border-amber-400/80 flex items-center justify-center text-4xl sm:text-5xl shadow-[0_0_24px_rgba(245,158,11,0.25)] mb-4 animate-bounce">
            {isWinner ? '🏆' : isTie ? '🤝' : '🥈'}
          </div>

          <span className="text-[11px] sm:text-xs font-black uppercase tracking-widest text-amber-400">
            {isGuessNumber
              ? 'GUESS THE NUMBER • 3 ROUNDS SUMMARY'
              : isWordScramble
              ? 'WORD SCRAMBLE • MATCH SUMMARY'
              : 'MATCH CONCLUSION'}
          </span>
          <h2 className="text-3xl sm:text-4xl font-black text-white mt-1">
            {room.forfeitBy
              ? room.forfeitBy !== user.uid
                ? 'VICTORY BY FORFEIT!'
                : 'FORFEITED'
              : isWinner
              ? 'VICTORY!'
              : isTie
              ? 'WELL PLAYED!'
              : 'RUNNER-UP'}
          </h2>
          <p className="text-xs sm:text-sm text-slate-400 mt-1.5 leading-relaxed">
            {room.forfeitBy
              ? room.forfeitBy !== user.uid
                ? `${opponentName} left the match. Victory has been awarded to you!`
                : 'You surrendered the duel.'
              : isWinner
              ? `You outscored ${opponentName} across ${room.totalRounds || (isGuessNumber ? 3 : 5)} rounds!`
              : isTie
              ? 'An evenly matched clash of world explorers!'
              : `Good game! ${opponentName} claimed the crown this time.`}
          </p>

          {/* Final Score Duel Card */}
          <div className="my-5 p-4 sm:p-5 rounded-2xl bg-[#0B0F19] border border-slate-800 flex items-center justify-around">
            {/* You */}
            <div className="flex flex-col items-center">
              <span className="text-2xl sm:text-3xl mb-1">{user.countryFlag}</span>
              <span className="text-xs sm:text-sm font-bold text-slate-300 truncate max-w-[100px] sm:max-w-[140px]">{user.username}</span>
              <span className="text-2xl sm:text-3xl font-black text-cyan-400 mt-0.5">{myScore}</span>
              <span className="text-[10px] font-bold text-slate-400 uppercase mt-0.5">Your Score</span>
            </div>

            <div className="text-xs sm:text-sm font-black text-slate-600 uppercase px-2">VS</div>

            {/* Opponent */}
            <div className="flex flex-col items-center">
              <span className="text-2xl sm:text-3xl mb-1">{opponentFlag}</span>
              <span className="text-xs sm:text-sm font-bold text-slate-300 truncate max-w-[100px] sm:max-w-[140px]">{opponentName}</span>
              <span className="text-2xl sm:text-3xl font-black text-rose-400 mt-0.5">{opponentScore}</span>
              <span className="text-[10px] font-bold text-slate-400 uppercase mt-0.5">Opponent Score</span>
            </div>
          </div>

          {/* Correct Words / Secret Numbers / Round Summary List */}
          {matchQuestions.length > 0 && (
            <div className="mb-5 p-4 rounded-2xl bg-[#0B0F19] border border-slate-800 text-left">
              <div className="flex items-center justify-between mb-2.5">
                <span className="text-[10px] sm:text-xs font-extrabold uppercase tracking-wider text-emerald-400">
                  {isGuessNumber
                    ? '3 Rounds • Secret Target Numbers'
                    : isWordScramble
                    ? '5 Rounds • Correct Words Unscrambled'
                    : 'Match Answers Summary'}
                </span>
                <span className="text-[10px] font-semibold text-slate-400">
                  {matchQuestions.length} Rounds
                </span>
              </div>
              <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
                {matchQuestions.map((q, idx) => (
                  <div
                    key={q.id || idx}
                    className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-5 h-5 rounded-md bg-slate-800 text-slate-400 font-mono text-[10px] font-bold flex items-center justify-center shrink-0">
                        {idx + 1}
                      </span>
                      <span className="text-slate-300 truncate">
                        {isGuessNumber ? `Round ${idx + 1} Secret Target` : q.countryName}
                      </span>
                    </div>
                    <span className="font-mono font-black text-emerald-400 tracking-wider uppercase shrink-0">
                      {isGuessNumber ? `🎯 ${q.correctAnswer}` : q.correctAnswer}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Virtual Passport Stamp Unlock Animation! */}
          {awardedResults?.newlyUnlockedCountry && (
            <div className="mb-5 p-4 rounded-2xl bg-emerald-950/40 border border-emerald-500/50 text-left animate-scale-up">
              <div className="flex items-center gap-3.5">
                <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl bg-emerald-500/20 border border-emerald-400 text-3xl flex items-center justify-center shrink-0 shadow-lg">
                  {opponentFlag}
                </div>
                <div>
                  <span className="text-[10px] sm:text-xs font-black uppercase tracking-wider text-emerald-400 flex items-center gap-1">
                    <span>🛂</span> PASSPORT STAMP UNLOCKED!
                  </span>
                  <h4 className="text-sm sm:text-base font-black text-white">
                    {opponentFlag} Discovered {awardedResults.newlyUnlockedCountry}!
                  </h4>
                  <p className="text-[11px] sm:text-xs text-slate-300 mt-0.5">
                    Successfully met and played with {opponentName}. Added to your virtual passport!
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* XP & Coins Rewards */}
          <div className="grid grid-cols-2 gap-3.5 mb-6">
            <div className="bg-[#0B0F19] border border-slate-800 rounded-2xl p-3.5 sm:p-4 text-center">
              <span className="text-[10px] sm:text-xs font-black text-amber-400 uppercase tracking-wider block">
                {isWinner ? 'WINNER XP REWARD' : 'PARTICIPATION XP'}
              </span>
              <span className="text-xl sm:text-2xl font-black text-amber-300 font-mono">
                +{awardedResults?.xpEarned || (isWordScramble || isGuessNumber ? (isWinner ? 180 : 40) : isWinner ? 250 : 100)} XP
              </span>
            </div>
            <div className="bg-[#0B0F19] border border-slate-800 rounded-2xl p-3.5 sm:p-4 text-center">
              <span className="text-[10px] sm:text-xs font-black text-amber-400 uppercase tracking-wider block">COINS REWARD</span>
              <span className="text-xl sm:text-2xl font-black text-amber-300 font-mono">
                +{awardedResults?.coinsEarned || (isWinner ? 50 : 20)} 🪙
              </span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="space-y-3">
            <button
              onClick={() => {
                sounds.playPop();
                onRematch();
              }}
              className="w-full py-3.5 sm:py-4 rounded-2xl bg-gradient-to-r from-cyan-500 to-teal-500 hover:from-cyan-400 hover:to-teal-400 text-slate-950 font-black text-sm sm:text-base flex items-center justify-center gap-2 shadow-lg shadow-cyan-500/20 active:translate-y-0.5 transition-all cursor-pointer"
            >
              <RotateCcw className="w-4 h-4 sm:w-5 sm:h-5 stroke-[2.5]" />
              <span>Rematch / Play Another</span>
            </button>

            <button
              onClick={() => {
                sounds.playPop();
                onExitRoom();
              }}
              className="w-full py-3 sm:py-3.5 rounded-2xl bg-[#0B0F19] hover:bg-slate-800 border border-slate-800 text-slate-300 font-bold text-xs sm:text-sm active:translate-y-0.5 transition-all cursor-pointer"
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
    <div className="w-full min-h-[100dvh] bg-[#0B0F19] text-slate-100 flex flex-col justify-between relative overflow-x-hidden select-none">
      {/* Subtle Atmospheric Ambience */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden z-0">
        <div className="absolute -top-32 left-1/4 w-96 h-96 bg-cyan-500/[0.035] rounded-full blur-[100px]" />
        <div className="absolute bottom-1/4 -right-32 w-96 h-96 bg-teal-500/[0.03] rounded-full blur-[100px]" />
      </div>

      {/* Top Header: VS Scoreboard */}
      <div className="bg-[#0E1526]/95 backdrop-blur-md border-b border-slate-800/80 px-4 sm:px-6 md:px-8 pt-safe pb-3 sm:py-4 sticky top-0 z-30 shadow-md">
        <div className="w-full max-w-md sm:max-w-xl md:max-w-2xl mx-auto">
          <div className="flex items-center justify-between gap-2">
            {/* Player A (You) */}
            <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
              <div className="relative shrink-0">
                <img
                  src={user.avatar}
                  alt={user.username}
                  className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl object-cover ring-2 ring-cyan-400/80 shadow-[0_0_10px_rgba(6,182,212,0.3)] bg-slate-900"
                />
                <span className="absolute -bottom-1 -right-1 text-xs sm:text-sm">{user.countryFlag}</span>
              </div>
              <div className="min-w-0">
                <span className="text-xs sm:text-sm font-bold text-white block truncate max-w-[85px] sm:max-w-[140px]">
                  {user.username}
                </span>
                <span className="text-sm sm:text-base font-black text-cyan-400 font-mono">{myScore}</span>
              </div>
            </div>

            {/* Round & Timer Indicator */}
            <div className="text-center px-2 flex items-center gap-2 shrink-0">
              <div>
                <span className="text-[10px] sm:text-xs font-black uppercase tracking-wider text-slate-400 block">
                  ROUND {room.currentRound} / {room.totalRounds}
                </span>
                <div className="inline-flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-[#0B0F19] border border-slate-700 text-sm sm:text-base font-mono font-black text-cyan-400 mt-0.5">
                  {timeLeft}s
                </div>
              </div>
              <button
                onClick={() => {
                  sounds.playPop();
                  setForfeitModalOpen(true);
                }}
                className="p-2 rounded-xl text-slate-500 hover:text-rose-400 hover:bg-slate-800 transition-colors cursor-pointer"
                title="Leave / Forfeit Match"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>

            {/* Player B (Opponent) */}
            <div className="flex items-center gap-2.5 sm:gap-3 flex-row-reverse text-right min-w-0">
              <div className="relative shrink-0">
                <img
                  src={opponentAvatar}
                  alt={opponentName}
                  className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl object-cover ring-2 ring-rose-500/80 shadow-[0_0_10px_rgba(244,63,94,0.3)] bg-slate-900"
                />
                <span className="absolute -bottom-1 -left-1 text-xs sm:text-sm">{opponentFlag}</span>
              </div>
              <div className="min-w-0">
                <span className="text-xs sm:text-sm font-bold text-white block truncate max-w-[85px] sm:max-w-[140px]">
                  {opponentName}
                </span>
                <span className="text-sm sm:text-base font-black text-rose-400 font-mono">{opponentScore}</span>
              </div>
            </div>
          </div>

          {/* Timer Bar */}
          <div className="w-full h-1.5 sm:h-2 bg-slate-800 rounded-full mt-3 overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${
                timeLeft <= 5 ? 'bg-rose-500 animate-pulse' : 'bg-gradient-to-r from-cyan-400 via-teal-400 to-emerald-400'
              }`}
              style={{ width: `${(timeLeft / roundDurationSeconds) * 100}%` }}
            />
          </div>
        </div>
      </div>

      {/* Main Question Arena */}
      <div className="relative z-10 flex-1 w-full max-w-md sm:max-w-xl md:max-w-2xl mx-auto px-4 sm:px-6 md:px-8 py-6 sm:py-8 flex flex-col justify-center">
        {currentQ ? (
          <div className="space-y-5 sm:space-y-6">
            {/* Category Pill & Country Origin */}
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] sm:text-xs font-black uppercase tracking-wider text-amber-400 bg-amber-500/10 border border-amber-500/30 px-3 py-1 rounded-full">
                {(() => {
                  if (isGuessNumber) {
                    return 'Guess the Number • Numbers & Logic';
                  }
                  if (isWordScramble) {
                    return `Word Scramble • ${currentQ.subCategory || 'Culture'}`;
                  }
                  if (currentQ.subCategory === 'Flags' || currentQ.id.startsWith('flag_quiz_')) {
                    return 'Cultural Quiz • Flags';
                  }
                  if (currentQ.subCategory === 'Landmarks') {
                    return 'Cultural Quiz • Landmarks';
                  }
                  if (currentQ.category === 'mystery_food' || currentQ.subCategory === 'Food') {
                    return 'Cultural Quiz • Food';
                  }
                  if (currentQ.category === 'music_culture' || currentQ.subCategory === 'Music') {
                    return 'Cultural Quiz • Music';
                  }
                  if (currentQ.category === 'cultural_mime' || currentQ.subCategory === 'Traditions') {
                    return 'Cultural Quiz • Traditions';
                  }
                  if (currentQ.category === 'guess_word' || currentQ.subCategory === 'Language') {
                    return 'Cultural Quiz • Languages';
                  }
                  return `Cultural Quiz • ${currentQ.subCategory || 'National Facts'}`;
                })()}
              </span>
              <span className="text-xs sm:text-sm text-slate-300 font-bold flex items-center gap-1.5">
                <span>
                  {isGuessNumber
                    ? 'Range: 1–100'
                    : !showExplanation &&
                      !hasAnswered &&
                      (isWordScramble
                        ? currentQ.correctAnswer.toUpperCase() ===
                          currentQ.countryName.toUpperCase().replace(/[^A-Z]/g, '')
                        : currentQ.options.some(
                            (opt) => opt.toLowerCase().trim() === currentQ.countryName.toLowerCase().trim()
                          ))
                    ? 'Mystery Country'
                    : currentQ.countryName}
                </span>
                <span>
                  {isGuessNumber
                    ? '🔢'
                    : isWordScramble
                    ? '🔤'
                    : currentQ.category === 'guess_word'
                    ? '🗣️'
                    : '🌍'}
                </span>
              </span>
            </div>

            {/* Question Prompt Card */}
            <div className="bg-slate-800/80 border border-slate-700/60 rounded-3xl p-5 sm:p-7 md:p-8 shadow-xl text-center relative overflow-hidden space-y-4">
              {currentQ.imageUrl && (
                <div className="flex justify-center">
                  <img
                    src={currentQ.imageUrl}
                    alt="Cultural Quiz Visual"
                    className="max-h-36 sm:max-h-44 w-auto rounded-2xl border border-slate-700/80 shadow-lg object-contain bg-slate-900/60 p-1.5"
                  />
                </div>
              )}

              {isWordScramble && (
                <div className="inline-flex items-center gap-2 text-[11px] sm:text-xs font-bold text-sky-400 bg-sky-500/10 border border-sky-500/30 px-3 py-1 rounded-full">
                  <span>⚡ Speed Score: {calculateWordScramblePoints(timeLeft)} pts</span>
                  <span>(100 + {timeLeft}s × 5)</span>
                </div>
              )}

              {isGuessNumber && (
                <div className="inline-flex items-center flex-wrap justify-center gap-2 text-[11px] sm:text-xs font-bold text-amber-300 bg-amber-500/10 border border-amber-500/30 px-3.5 py-1 rounded-full">
                  <span>
                    🎯 Attempts Left: {Math.max(0, GUESS_NUMBER_MAX_ATTEMPTS - numberGuesses.length)} / {GUESS_NUMBER_MAX_ATTEMPTS}
                  </span>
                  <span>•</span>
                  <span>
                    ⚡ Potential Score:{' '}
                    {calculateGuessNumberPoints(
                      Math.min(GUESS_NUMBER_MAX_ATTEMPTS, numberGuesses.length + 1),
                      timeLeft
                    )}{' '}
                    pts
                  </span>
                </div>
              )}

              <p className="text-base sm:text-lg md:text-xl font-extrabold text-white leading-relaxed">
                {currentQ.prompt}
              </p>

              {/* Audio Pattern Synthesis Button for Music Questions */}
              {!isWordScramble && !isGuessNumber && (currentQ.category === 'music_culture' || currentQ.subCategory === 'Music') && (
                <div className="pt-1">
                  <button
                    onClick={() => {
                      sounds.playMelody([523, 659, 784, 1046], 'bell');
                    }}
                    className="inline-flex items-center gap-2 bg-gradient-to-r from-emerald-600 to-teal-600 text-white px-4 py-2.5 rounded-2xl text-xs sm:text-sm font-extrabold shadow-md active:scale-95 transition-transform cursor-pointer"
                  >
                    <Music className="w-4 h-4 animate-bounce" />
                    <span>🔊 Play Cultural Audio Pattern</span>
                  </button>
                </div>
              )}
            </div>

            {/* Interactive Gameplay Controls: Guess the Number vs Word Scramble vs Multiple Choice */}
            {isGuessNumber ? (
              <div className="space-y-4">
                {/* Latest Hint Banner & Narrowed Bounds */}
                <div className="bg-slate-900 border border-slate-800 rounded-3xl p-4 sm:p-6 space-y-4">
                  {(() => {
                    const lowBound = numberGuesses
                      .filter((g) => g.feedback === 'higher')
                      .reduce((max, g) => Math.max(max, g.value + 1), 1);
                    const highBound = numberGuesses
                      .filter((g) => g.feedback === 'lower')
                      .reduce((min, g) => Math.min(min, g.value - 1), 100);
                    const lastGuess =
                      numberGuesses.length > 0 ? numberGuesses[numberGuesses.length - 1] : null;

                    return (
                      <>
                        <div className="flex items-center justify-between gap-2 text-xs font-bold">
                          <span className="text-slate-400 uppercase tracking-wider">
                            Active Range:{' '}
                            <span className="text-amber-400 font-mono text-sm">
                              {Math.min(lowBound, highBound)} – {Math.max(lowBound, highBound)}
                            </span>
                          </span>
                          <span className="text-slate-400 font-mono">
                            {numberGuesses.length} / {GUESS_NUMBER_MAX_ATTEMPTS} Tries Used
                          </span>
                        </div>

                        {/* Immediate High / Low Feedback Display */}
                        {lastGuess && !showExplanation && (
                          <div
                            className={`p-3.5 rounded-2xl border text-center font-black text-sm sm:text-base flex items-center justify-center gap-2 animate-fade-in ${
                              lastGuess.feedback === 'correct'
                                ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300'
                                : lastGuess.feedback === 'higher'
                                ? 'bg-amber-500/20 border-amber-500/50 text-amber-300'
                                : 'bg-indigo-500/20 border-indigo-500/50 text-indigo-300'
                            }`}
                          >
                            {lastGuess.feedback === 'correct' ? (
                              <>
                                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                                <span>
                                  🎯 Spot on! {lastGuess.value} is the secret number! (+{lastEarnedPoints} pts)
                                </span>
                              </>
                            ) : lastGuess.feedback === 'higher' ? (
                              <span>
                                Your guess ({lastGuess.value}) is too low — Go{' '}
                                <span className="underline">Higher ⬆️</span>
                              </span>
                            ) : (
                              <span>
                                Your guess ({lastGuess.value}) is too high — Go{' '}
                                <span className="underline">Lower ⬇️</span>
                              </span>
                            )}
                          </div>
                        )}

                        {numberError && !hasAnswered && (
                          <div className="p-3 rounded-2xl bg-rose-500/15 border border-rose-500/40 text-rose-200 text-xs font-bold flex items-center justify-center gap-2">
                            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                            <span>{numberError}</span>
                          </div>
                        )}

                        {/* Number Input & Submit Form */}
                        {!hasAnswered && !showExplanation ? (
                          <form onSubmit={handleNumberGuessSubmit} className="space-y-3">
                            <div className="flex items-center gap-2.5">
                              <input
                                type="number"
                                min={1}
                                max={100}
                                inputMode="numeric"
                                placeholder={`Enter number (${Math.min(lowBound, highBound)}-${Math.max(lowBound, highBound)})...`}
                                value={numberInput}
                                onChange={(e) => {
                                  setNumberError(null);
                                  setNumberInput(e.target.value);
                                }}
                                className="flex-1 bg-slate-950 border-2 border-slate-700 focus:border-amber-400 rounded-2xl px-4 py-3.5 text-center font-mono font-black text-xl sm:text-2xl text-white focus:outline-none transition-colors"
                              />
                              <button
                                type="submit"
                                className="px-6 py-3.5 sm:py-4 rounded-2xl bg-gradient-to-r from-amber-500 to-rose-600 hover:from-amber-400 hover:to-rose-500 text-white font-extrabold text-sm sm:text-base shadow-lg active:scale-95 transition-all cursor-pointer shrink-0"
                              >
                                Guess
                              </button>
                            </div>

                            {/* Quick Midpoint / Smart Assist Buttons */}
                            <div className="flex items-center justify-center flex-wrap gap-2 pt-1">
                              {(() => {
                                const lo = Math.min(lowBound, highBound);
                                const hi = Math.max(lowBound, highBound);
                                const mid = Math.floor((lo + hi) / 2);
                                const q1 = Math.floor((lo + mid) / 2);
                                const q3 = Math.ceil((mid + hi) / 2);
                                const presets = Array.from(new Set([q1, mid, q3])).filter(
                                  (v) => v >= 1 && v <= 100 && !numberGuesses.some((g) => g.value === v)
                                );
                                return presets.map((presetVal) => (
                                  <button
                                    key={presetVal}
                                    type="button"
                                    onClick={() => {
                                      sounds.playPop();
                                      setNumberError(null);
                                      setNumberInput(String(presetVal));
                                    }}
                                    className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-mono font-bold text-slate-300 cursor-pointer transition-colors"
                                  >
                                    Try {presetVal}
                                  </button>
                                ));
                              })()}
                            </div>
                          </form>
                        ) : (
                          <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800 text-center text-xs sm:text-sm font-bold text-slate-300">
                            {showExplanation ? (
                              <span>
                                Secret Target Number:{' '}
                                <span className="text-emerald-400 font-mono font-black text-base">
                                  {currentQ.correctAnswer}
                                </span>
                              </span>
                            ) : (
                              <span>Waiting for round to conclude...</span>
                            )}
                          </div>
                        )}

                        {/* 6-Attempt History Slots */}
                        <div className="pt-2">
                          <span className="text-[10px] sm:text-xs font-bold text-slate-400 uppercase tracking-wider block mb-2">
                            Guess History ({numberGuesses.length} / {GUESS_NUMBER_MAX_ATTEMPTS})
                          </span>
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                            {Array.from({ length: GUESS_NUMBER_MAX_ATTEMPTS }).map((_, idx) => {
                              const item = numberGuesses[idx];
                              if (!item) {
                                return (
                                  <div
                                    key={idx}
                                    className="h-11 rounded-xl bg-slate-950/60 border border-slate-800/80 flex items-center justify-center text-[11px] font-mono text-slate-600"
                                  >
                                    Attempt #{idx + 1}
                                  </div>
                                );
                              }
                              return (
                                <div
                                  key={idx}
                                  className={`h-11 px-3 rounded-xl border flex items-center justify-between font-mono text-xs font-black ${
                                    item.feedback === 'correct'
                                      ? 'bg-emerald-600/25 border-emerald-400 text-emerald-300'
                                      : item.feedback === 'higher'
                                      ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                                      : 'bg-indigo-500/15 border-indigo-500/40 text-indigo-300'
                                  }`}
                                >
                                  <span className="text-sm">{item.value}</span>
                                  <span>
                                    {item.feedback === 'correct'
                                      ? '🎯 Exact!'
                                      : item.feedback === 'higher'
                                      ? 'Higher ⬆️'
                                      : 'Lower ⬇️'}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </>
                    );
                  })()}
                </div>
              </div>
            ) : isWordScramble ? (
              <div className="space-y-4">
                {/* Assembled Answer Letter Slots */}
                <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-4 sm:p-5 text-center space-y-3">
                  <div className="flex items-center justify-between text-[11px] sm:text-xs text-slate-400 font-bold px-1">
                    <span>YOUR UNSCRAMBLED WORD</span>
                    <span>
                      {selectedTileIndices.length} / {currentQ.options.length} LETTERS
                    </span>
                  </div>

                  <div className="flex items-center justify-center flex-wrap gap-2 py-1">
                    {Array.from({ length: currentQ.options.length }).map((_, slotIdx) => {
                      const tileIndex = selectedTileIndices[slotIdx];
                      const char =
                        showExplanation
                          ? currentQ.correctAnswer[slotIdx]
                          : tileIndex !== undefined
                          ? currentQ.options[tileIndex]
                          : '';

                      const isFilled = Boolean(char);

                      let slotStyle = 'bg-slate-950 border-slate-700 text-slate-400';
                      if (showExplanation || (hasAnswered && selectedAnswer === currentQ.correctAnswer)) {
                        slotStyle =
                          'bg-emerald-600 border-emerald-400 text-white shadow-lg shadow-emerald-500/20';
                      } else if (scrambleError) {
                        slotStyle = 'bg-rose-600/30 border-rose-500 text-rose-200 animate-pulse';
                      } else if (isFilled) {
                        slotStyle =
                          'bg-indigo-600 border-indigo-400 text-white shadow-md hover:bg-indigo-500 cursor-pointer';
                      }

                      return (
                        <button
                          key={slotIdx}
                          type="button"
                          disabled={!isFilled || hasAnswered || showExplanation}
                          onClick={() => handleRemoveScrambleSlot(slotIdx)}
                          className={`w-10 h-12 sm:w-12 sm:h-14 rounded-2xl border-2 font-mono font-black text-lg sm:text-xl flex items-center justify-center transition-all ${slotStyle}`}
                        >
                          {char}
                        </button>
                      );
                    })}
                  </div>

                  {/* Error / Retry or Solved Status Banner */}
                  {scrambleError && !hasAnswered && (
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-2 p-3 rounded-2xl bg-rose-500/15 border border-rose-500/40 text-rose-200 text-xs font-bold animate-fade-in">
                      <div className="flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                        <span>{scrambleError}</span>
                      </div>
                      <button
                        type="button"
                        onClick={handleClearScramble}
                        className="px-3.5 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-extrabold text-xs shrink-0 cursor-pointer transition-colors"
                      >
                        Clear & Retry
                      </button>
                    </div>
                  )}

                  {hasAnswered && selectedAnswer === currentQ.correctAnswer && (
                    <div className="p-3 rounded-2xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-xs sm:text-sm font-extrabold flex items-center justify-center gap-2 animate-fade-in">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span>
                        Unscrambled! +{lastEarnedPoints} pts — Waiting for round to conclude...
                      </span>
                    </div>
                  )}
                </div>

                {/* Scrambled Source Letter Tiles & Action Controls */}
                <div className="bg-slate-900 border border-slate-800 rounded-3xl p-4 sm:p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] sm:text-xs font-bold text-slate-400 uppercase tracking-wider">
                      Tap Scrambled Letters in Order
                    </span>
                    <button
                      type="button"
                      disabled={hasAnswered || showExplanation || selectedTileIndices.length === 0}
                      onClick={handleClearScramble}
                      className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-400 hover:text-amber-300 disabled:opacity-40 cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Clear / Retry</span>
                    </button>
                  </div>

                  <div className="flex items-center justify-center flex-wrap gap-2.5">
                    {currentQ.options.map((letter, idx) => {
                      const isUsed = selectedTileIndices.includes(idx);
                      return (
                        <button
                          key={`${idx}_${letter}`}
                          type="button"
                          disabled={isUsed || hasAnswered || showExplanation}
                          onClick={() => handleScrambleTileClick(idx)}
                          className={`w-11 h-12 sm:w-13 sm:h-14 rounded-2xl border-2 font-mono font-black text-lg sm:text-xl flex items-center justify-center transition-all ${
                            isUsed
                              ? 'bg-slate-950/40 border-slate-800/50 text-slate-700 scale-95 cursor-not-allowed'
                              : 'bg-slate-800 border-slate-700 hover:border-emerald-400 text-white shadow-md active:scale-90 cursor-pointer'
                          }`}
                        >
                          {letter}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : (
              /* 4 Interactive Option Buttons for Cultural Quiz */
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-3.5">
                {currentQ.options.map((option, idx) => {
                  const isSelected = selectedAnswer === option;
                  const isCorrect = option === currentQ.correctAnswer;
                  const showResult = showExplanation || hasAnswered;

                  let btnStyle = 'bg-slate-800/80 border-slate-700/70 text-slate-100 hover:border-amber-400/60 hover:bg-slate-800';

                  if (showResult) {
                    if (isCorrect) {
                      btnStyle = 'bg-emerald-600 border-emerald-400 text-white font-black shadow-lg shadow-emerald-500/20';
                    } else if (isSelected && !isCorrect) {
                      btnStyle = 'bg-rose-600 border-rose-400 text-white font-black';
                    } else {
                      btnStyle = 'bg-slate-900/60 border-slate-800/60 text-slate-500';
                    }
                  }

                  return (
                    <button
                      key={option}
                      disabled={hasAnswered}
                      onClick={() => handleAnswerSelect(option)}
                      className={`w-full p-4 sm:p-4.5 rounded-2xl border text-sm sm:text-base font-bold text-left transition-all active:scale-98 flex items-center justify-between gap-2 cursor-pointer ${btnStyle}`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="w-7 h-7 rounded-lg bg-slate-900 text-amber-400 text-xs flex items-center justify-center font-mono font-bold shrink-0">
                          {String.fromCharCode(65 + idx)}
                        </span>
                        <span className="leading-snug">{option}</span>
                      </div>

                      {showResult && isCorrect && (
                        <CheckCircle2 className="w-5 h-5 text-white shrink-0" />
                      )}
                      {showResult && isSelected && !isCorrect && (
                        <AlertCircle className="w-5 h-5 text-white shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Explanation Drawer when Round Answers Revealed */}
            {showExplanation && (
              <div className="p-4 sm:p-5 rounded-2xl bg-slate-800/90 border border-slate-700/80 text-xs sm:text-sm text-slate-200 animate-fade-in flex items-start gap-3">
                <Sparkles className="w-4 h-4 sm:w-5 sm:h-5 text-amber-400 shrink-0 mt-0.5" />
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
      <div className="relative z-20 bg-slate-900/95 backdrop-blur-md border-t border-slate-800 px-4 sm:px-6 md:px-8 py-3">
        <div className="w-full max-w-md sm:max-w-xl md:max-w-2xl mx-auto flex items-center justify-between gap-3">
          {/* Quick Emoji Reactions */}
          <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto no-scrollbar">
            {['👏', '🔥', '🇹🇳', '🇯🇵', '😱', '❤️', 'GG!'].map((emoji) => (
              <button
                key={emoji}
                onClick={() => handleSendEmoji(emoji)}
                className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-xs sm:text-sm rounded-xl active:scale-90 transition-transform cursor-pointer shrink-0"
              >
                {emoji}
              </button>
            ))}
          </div>

          {/* Chat Drawer Toggle & Report Safety Button */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => {
                sounds.playPop();
                setIsChatOpen(!isChatOpen);
              }}
              className="p-2.5 rounded-xl bg-cyan-500/15 text-cyan-300 hover:bg-cyan-500/25 transition-colors relative cursor-pointer"
              title="In-game Chat"
            >
              <MessageSquare className="w-4 h-4 sm:w-5 sm:h-5" />
              {messages.length > 0 && (
                <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-rose-500 rounded-full" />
              )}
            </button>

            <button
              onClick={() => setReportModalOpen(true)}
              className="p-2.5 rounded-xl bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition-colors cursor-pointer"
              title="Report Player"
            >
              <Flag className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* In-Game Slide-Up Chat Panel */}
      {isChatOpen && (
        <div className="fixed inset-x-0 bottom-0 z-40 bg-[#0E1526]/95 backdrop-blur-md border-t border-slate-800 p-4 sm:p-5 max-w-md sm:max-w-xl mx-auto rounded-t-3xl shadow-2xl animate-slide-up">
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800">
            <h4 className="text-xs font-black uppercase tracking-wider text-slate-300">
              Live Duel Chat
            </h4>
            <button
              onClick={() => setIsChatOpen(false)}
              className="p-1 text-slate-400 hover:text-white cursor-pointer"
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
                          ? 'bg-cyan-500 text-slate-950 font-semibold rounded-br-xs'
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
              className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-400"
            />
            <button
              type="submit"
              className="p-2 rounded-xl bg-cyan-500 text-slate-950 hover:bg-cyan-400 font-bold cursor-pointer"
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
            <div className="flex gap-2.5 pt-2">
              <button
                onClick={() => setForfeitModalOpen(false)}
                className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs sm:text-sm font-bold transition-colors cursor-pointer"
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
                className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs sm:text-sm font-bold shadow-lg shadow-rose-600/30 transition-colors cursor-pointer"
              >
                Forfeit
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
