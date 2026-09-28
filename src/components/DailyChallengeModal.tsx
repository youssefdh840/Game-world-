import React, { useState } from 'react';
import { UserProfile, Question } from '../types/game';
import { COUNTRIES } from '../services/countryData';
import { QUESTIONS } from '../services/questionData';
import { awardGameResults, updateUserProfile } from '../services/userService';
import { sounds } from '../services/soundEffects';
import confetti from 'canvas-confetti';
import { X, Sparkles, CheckCircle2, AlertCircle, ArrowRight, Trophy, Flame } from 'lucide-react';

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
  if (!isOpen) return null;

  const todayStr = new Date().toISOString().split('T')[0];
  const isAlreadyCompleted = user.lastDailyChallengeDate === todayStr;

  // Today's spotlight country: Mexico 🇲🇽 (or changes by day of week)
  const spotlightCountry = COUNTRIES.find((c) => c.code === 'MX') || COUNTRIES[0];
  const filtered = QUESTIONS.filter(
    (q) => q.countryCode === spotlightCountry.code || q.category === 'country_quiz'
  );
  const challengeQuestions: Question[] = (filtered.length >= 5 ? filtered : QUESTIONS).slice(0, 5);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [score, setScore] = useState(0);
  const [isFinished, setIsFinished] = useState(isAlreadyCompleted);
  const [claiming, setClaiming] = useState(false);

  const currentQ = challengeQuestions[currentIndex] || challengeQuestions[0];

  const handleSelect = (option: string) => {
    if (selectedOption !== null || !currentQ) return;
    setSelectedOption(option);

    const isCorrect = option === currentQ.correctAnswer;
    if (isCorrect) {
      sounds.playCorrect();
      setScore((s) => s + 1);
    } else {
      sounds.playWrong();
    }

    setTimeout(() => {
      if (currentIndex + 1 < challengeQuestions.length) {
        setCurrentIndex((i) => i + 1);
        setSelectedOption(null);
      } else {
        setIsFinished(true);
        handleClaimReward();
      }
    }, 1800);
  };

  const handleClaimReward = async () => {
    if (isAlreadyCompleted) return;
    setClaiming(true);
    sounds.playVictory();
    try {
      confetti({ particleCount: 80, spread: 60 });
    } catch {
      // ignore
    }

    await awardGameResults(
      user.uid,
      true,
      300,
      50,
      spotlightCountry.code,
      'Daily Cultural Guide',
      '🇲🇽'
    );

    await updateUserProfile(user.uid, {
      lastDailyChallengeDate: todayStr,
      dailyStreak: (user.dailyStreak || 1) + 1,
    });
    setClaiming(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-fade-in overflow-y-auto">
      <div className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl text-slate-100 my-8">
        {/* Close Button */}
        <button
          onClick={() => {
            sounds.playPop();
            onClose();
          }}
          className="absolute top-4 right-4 p-2 text-slate-400 hover:text-white rounded-full hover:bg-slate-800"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header */}
        <div className="text-center mb-5">
          <div className="inline-flex items-center gap-1.5 bg-amber-500/10 border border-amber-500/30 text-amber-400 text-[10px] font-black uppercase tracking-wider px-3 py-1 rounded-full mb-2">
            <Flame className="w-3.5 h-3.5 fill-amber-400" />
            <span>DAILY EXPEDITION</span>
          </div>
          <div className="text-5xl mb-1">{spotlightCountry.flag}</div>
          <h2 className="text-2xl font-black text-white tracking-tight">
            Today: {spotlightCountry.name}
          </h2>
          <p className="text-xs text-slate-400">
            5 quick cultural questions • Reward: <span className="text-amber-400 font-bold">+300 XP & 50 🪙</span>
          </p>
        </div>

        {/* Already Completed or Finished View */}
        {isFinished ? (
          <div className="text-center py-6 space-y-4">
            <div className="w-16 h-16 mx-auto rounded-3xl bg-amber-500/20 text-amber-400 flex items-center justify-center text-3xl">
              🏆
            </div>
            <div>
              <h3 className="text-lg font-black text-white">Daily Quest Completed!</h3>
              <p className="text-xs text-slate-400 mt-1">
                You scored {score} / 5 correct answers!
                {isAlreadyCompleted
                  ? ' You have already claimed today’s reward. Check back tomorrow for the next country!'
                  : ' +300 XP and 50 Coins added to your traveler profile!'}
              </p>
            </div>
            <button
              onClick={() => {
                sounds.playPop();
                onClose();
              }}
              className="w-full py-3 rounded-2xl bg-amber-500 text-slate-950 font-extrabold text-xs cursor-pointer hover:bg-amber-400"
            >
              Done & Return
            </button>
          </div>
        ) : (
          /* Active Question Step */
          <div className="space-y-4">
            <div className="flex items-center justify-between text-xs text-slate-400 font-bold">
              <span>Question {currentIndex + 1} of 5</span>
              <span className="text-amber-400">Score: {score}</span>
            </div>

            <div className="bg-slate-800/80 border border-slate-700/60 rounded-2xl p-4 text-center">
              <p className="text-sm font-bold text-white leading-relaxed">
                {currentQ.prompt}
              </p>
            </div>

            <div className="space-y-2">
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
                    className={`w-full p-3.5 rounded-xl border text-xs font-semibold text-left transition-all active:scale-98 flex items-center justify-between cursor-pointer ${btnClass}`}
                  >
                    <span>{opt}</span>
                    {selectedOption !== null && isCorrect && (
                      <CheckCircle2 className="w-4 h-4 text-white" />
                    )}
                    {selectedOption !== null && isSelected && !isCorrect && (
                      <AlertCircle className="w-4 h-4 text-white" />
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
