import React, { useState, useEffect, useRef } from 'react';
import { UserProfile, Question } from '../types/game';
import { COUNTRIES } from '../services/countryData';
import { QUESTIONS } from '../services/questionData';
import {
  awardGameResults,
  hasAttemptedDailyQuestToday,
  markDailyQuestAttempted,
} from '../services/userService';
import { sounds } from '../services/soundEffects';
import confetti from 'canvas-confetti';
import { X, CheckCircle2, AlertCircle, Flame, Lock, ArrowRight } from 'lucide-react';

interface DailyChallengeModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: UserProfile;
}

export const DailyChallengeModal: React.FC<DailyChallengeModalProps> = ({
  isOpen,
  onClose,
  user,
}) => {
  const alreadyAttemptedToday = hasAttemptedDailyQuestToday(user);

  const [hasStarted, setHasStarted] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [score, setScore] = useState<number>(user.lastDailyScore ?? 0);
  const [isFinished, setIsFinished] = useState(alreadyAttemptedToday);
  const [claiming, setClaiming] = useState(false);
  const [earnedRewards, setEarnedRewards] = useState<{ xp: number; coins: number; isWin: boolean } | null>(null);
  const hasSubmittedRef = useRef(false);

  useEffect(() => {
    if (isOpen) {
      const attempted = hasAttemptedDailyQuestToday(user);
      if (attempted && !hasStarted) {
        setIsFinished(true);
        if (typeof user.lastDailyScore === 'number') {
          setScore(user.lastDailyScore);
        }
      } else if (!attempted && !hasStarted) {
        setIsFinished(false);
        setCurrentIndex(0);
        setSelectedOption(null);
        setScore(0);
        setEarnedRewards(null);
        hasSubmittedRef.current = false;
      }
    } else {
      setHasStarted(false);
      setSelectedOption(null);
    }
  }, [isOpen, user.lastAttemptDate, user.lastDailyChallengeDate]);

  if (!isOpen) return null;

  // Today's spotlight country: Mexico 🇲🇽
  const spotlightCountry = COUNTRIES.find((c) => c.code === 'MX') || COUNTRIES[0];
  const filtered = QUESTIONS.filter(
    (q) => q.countryCode === spotlightCountry.code || q.category === 'country_quiz'
  );
  const challengeQuestions: Question[] = (filtered.length >= 5 ? filtered : QUESTIONS).slice(0, 5);
  const currentQ = challengeQuestions[currentIndex] || challengeQuestions[0];

  const handleStartQuest = async () => {
    if (hasAttemptedDailyQuestToday(user)) {
      setIsFinished(true);
      return;
    }
    sounds.playPop();
    setHasStarted(true);
    setCurrentIndex(0);
    setScore(0);
    setSelectedOption(null);
    // Lock attempt immediately in Firestore & localStorage so only 1 attempt per day is possible
    await markDailyQuestAttempted(user.uid, 0);
  };

  const handleSelect = (option: string) => {
    if (selectedOption !== null || !currentQ) return;
    setSelectedOption(option);

    const isCorrect = option === currentQ.correctAnswer;
    const nextScore = isCorrect ? score + 1 : score;

    if (isCorrect) {
      sounds.playCorrect();
      setScore(nextScore);
    } else {
      sounds.playWrong();
    }

    setTimeout(() => {
      if (currentIndex + 1 < challengeQuestions.length) {
        setCurrentIndex((i) => i + 1);
        setSelectedOption(null);
      } else {
        setIsFinished(true);
        handleFinishQuest(nextScore);
      }
    }, 1500);
  };

  const handleFinishQuest = async (finalScore: number) => {
    if (hasSubmittedRef.current) return;
    hasSubmittedRef.current = true;
    setClaiming(true);

    const isWin = finalScore >= 3;
    const xpReward = isWin ? 300 : Math.max(50, finalScore * 60);
    const coinsReward = isWin ? 50 : Math.max(10, finalScore * 10);

    setEarnedRewards({ xp: xpReward, coins: coinsReward, isWin });

    if (isWin) {
      sounds.playVictory();
      try {
        confetti({ particleCount: 80, spread: 60 });
      } catch {
        // ignore
      }
    } else {
      sounds.playPop();
    }

    await awardGameResults(
      user.uid,
      isWin,
      xpReward,
      coinsReward,
      spotlightCountry.code,
      'Daily Cultural Guide',
      spotlightCountry.flag,
      { isDailyQuest: true, dailyScore: finalScore }
    );

    setClaiming(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-950/85 backdrop-blur-md animate-fade-in overflow-y-auto">
      <div className="relative w-full max-w-md sm:max-w-lg bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl text-slate-100 my-auto">
        {/* Close Button */}
        <button
          onClick={() => {
            sounds.playPop();
            onClose();
          }}
          className="absolute top-4 right-4 sm:top-5 sm:right-5 p-2 text-slate-400 hover:text-white rounded-full hover:bg-slate-800 cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-1.5 bg-amber-500/10 border border-amber-500/30 text-amber-400 text-[10px] sm:text-xs font-black uppercase tracking-wider px-3 py-1 rounded-full mb-2.5">
            <Flame className="w-3.5 h-3.5 fill-amber-400" />
            <span>DAILY EXPEDITION • 1 ATTEMPT / DAY</span>
          </div>
          <div className="text-5xl sm:text-6xl mb-1.5">{spotlightCountry.flag}</div>
          <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
            Today: {spotlightCountry.name}
          </h2>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            5 cultural questions • Up to <span className="text-amber-400 font-bold">+300 XP &amp; 50 🪙</span>
          </p>
        </div>

        {/* State 1: Completed / Already Attempted Today */}
        {isFinished ? (
          <div className="text-center py-5 space-y-4">
            <div className="w-16 h-16 sm:w-20 sm:h-20 mx-auto rounded-3xl bg-amber-500/20 text-amber-400 flex items-center justify-center text-3xl sm:text-4xl">
              {score >= 3 || earnedRewards?.isWin ? '🏆' : '🎯'}
            </div>
            <div>
              <div className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-[11px] sm:text-xs font-extrabold mb-2">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>DAILY QUEST COMPLETED TODAY</span>
              </div>
              <h3 className="text-lg sm:text-xl font-black text-white">
                {earnedRewards
                  ? earnedRewards.isWin
                    ? 'Quest Victory!'
                    : 'Quest Attempt Finished!'
                  : "Today's Expedition Completed"}
              </h3>
              <p className="text-xs sm:text-sm text-slate-400 mt-1.5 leading-relaxed">
                {typeof score === 'number' && (hasStarted || typeof user.lastDailyScore === 'number')
                  ? `You scored ${score} / 5 correct answers.`
                  : 'You have already completed your daily quest attempt for today.'}{' '}
                {earnedRewards
                  ? `+${earnedRewards.xp} XP and +${earnedRewards.coins} Coins have been added to your profile!`
                  : 'Each explorer gets one attempt per day. Come back tomorrow for a new country quest!'}
              </p>
            </div>

            <button
              disabled
              className="w-full py-3 rounded-2xl bg-slate-800/80 border border-slate-700 text-slate-500 font-extrabold text-xs sm:text-sm flex items-center justify-center gap-1.5 cursor-not-allowed"
            >
              <Lock className="w-3.5 h-3.5" />
              <span>Start Daily Quest (Completed Today)</span>
            </button>

            <button
              onClick={() => {
                sounds.playPop();
                onClose();
              }}
              disabled={claiming}
              className="w-full py-3.5 rounded-2xl bg-amber-500 text-slate-950 font-extrabold text-xs sm:text-sm cursor-pointer hover:bg-amber-400 transition-colors"
            >
              {claiming ? 'Updating Stats...' : 'Done & Return'}
            </button>
          </div>
        ) : !hasStarted ? (
          /* State 2: Ready to Start (Pre-check passed) */
          <div className="text-center py-4 space-y-5">
            <div className="bg-slate-800/60 border border-slate-700/60 rounded-2xl p-4 sm:p-5 text-xs sm:text-sm text-slate-300 space-y-2 text-left">
              <p className="font-bold text-white">Daily Quest Rules:</p>
              <ul className="list-disc list-inside space-y-1.5 text-slate-400">
                <li>You have <span className="text-amber-400 font-bold">1 attempt per day</span> (win or lose).</li>
                <li>Score 3/5 or higher to claim a Daily Victory &amp; +300 XP.</li>
                <li>All XP and stats update your profile immediately.</li>
              </ul>
            </div>
            <button
              onClick={handleStartQuest}
              disabled={alreadyAttemptedToday}
              className="w-full py-3.5 sm:py-4 rounded-2xl bg-gradient-to-r from-amber-500 to-rose-500 hover:from-amber-400 hover:to-rose-400 disabled:opacity-50 text-slate-950 font-black text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg cursor-pointer transition-all"
            >
              <span>Start Daily Quest</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        ) : (
          /* State 3: Active Question Step */
          <div className="space-y-4 sm:space-y-5">
            <div className="flex items-center justify-between text-xs sm:text-sm text-slate-400 font-bold">
              <span>Question {currentIndex + 1} of 5</span>
              <span className="text-amber-400">Score: {score}</span>
            </div>

            <div className="bg-slate-800/80 border border-slate-700/60 rounded-2xl p-4 sm:p-5 text-center">
              <p className="text-sm sm:text-base font-bold text-white leading-relaxed">
                {currentQ.prompt}
              </p>
            </div>

            <div className="space-y-2.5">
              {currentQ.options.map((opt) => {
                const isSelected = selectedOption === opt;
                const isCorrect = opt === currentQ.correctAnswer;
                let btnClass = 'bg-slate-800/60 border-slate-700/50 text-slate-200 hover:border-amber-500/50';

                if (selectedOption !== null) {
                  if (isCorrect) {
                    btnClass = 'bg-emerald-600 border-emerald-400 text-white font-bold';
                  } else if (isSelected && !isCorrect) {
                    btnClass = 'bg-rose-600 border-rose-400 text-white font-bold';
                  } else {
                    btnClass = 'bg-slate-800/20 border-slate-800 text-slate-600';
                  }
                }

                return (
                  <button
                    key={opt}
                    disabled={selectedOption !== null}
                    onClick={() => handleSelect(opt)}
                    className={`w-full p-3.5 sm:p-4 rounded-xl border text-xs sm:text-sm font-semibold text-left transition-all active:scale-98 flex items-center justify-between cursor-pointer ${btnClass}`}
                  >
                    <span>{opt}</span>
                    {selectedOption !== null && isCorrect && (
                      <CheckCircle2 className="w-4 h-4 text-white shrink-0" />
                    )}
                    {selectedOption !== null && isSelected && !isCorrect && (
                      <AlertCircle className="w-4 h-4 text-white shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
