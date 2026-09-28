import React, { useEffect, useState } from 'react';
import { UserProfile, GameCategory, GameRoom } from '../types/game';
import {
  joinMatchmakingQueue,
  listenToMatchmakingTicket,
  leaveMatchmakingQueue,
  createBotGameRoom,
} from '../services/matchmakingService';
import { sounds } from '../services/soundEffects';
import { Globe2, X, Sparkles, CheckCircle2, Zap } from 'lucide-react';
import { SEED_LEADERBOARD } from '../services/userService';

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
  const [statusText, setStatusText] = useState('Searching worldwide...');
  const [matchedOpponent, setMatchedOpponent] = useState<UserProfile | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    sounds.playPop();
    setStatusText('Connecting to matchmaking radar...');
    let activeTicketId = '';
    let isCancelled = false;

    // Join matchmaking queue
    const startQueue = async () => {
      try {
        const { ticketId } = await joinMatchmakingQueue(user, category);
        activeTicketId = ticketId;

        if (isCancelled) return;
        setStatusText('Searching worldwide for a challenger...');

        // Fallback timer: If no opponent found within 3.5 seconds, match with a high-caliber seed challenger
        // so the user can immediately experience gameplay and unlock new country visas without infinite waiting!
        const botTimer = setTimeout(async () => {
          if (isCancelled) return;

          // Pick an opponent from a different country
          const candidateBots = SEED_LEADERBOARD.filter((b) => b.countryCode !== user.countryCode);
          const chosenBot = candidateBots[Math.floor(Math.random() * candidateBots.length)] || SEED_LEADERBOARD[0];

          setMatchedOpponent(chosenBot);
          setStatusText(`Challenger found in ${chosenBot.countryName}!`);
          sounds.playCorrect();

          // Create game room with bot
          const room = await createBotGameRoom(user, category, chosenBot);

          // 3 second countdown
          let cd = 3;
          setCountdown(cd);
          sounds.playCountdown();

          const cdInterval = setInterval(() => {
            cd -= 1;
            if (cd > 0) {
              setCountdown(cd);
              sounds.playCountdown();
            } else {
              clearInterval(cdInterval);
              onMatchFound(room);
            }
          }, 1000);
        }, 3200);

        // Listen for live opponent
        const unsub = listenToMatchmakingTicket(ticketId, async (roomId) => {
          clearTimeout(botTimer);
          setStatusText('Real opponent matched! Loading room...');
          sounds.playCorrect();
          // Room will be subscribed in GameRoom screen
          setTimeout(() => {
            onClose();
          }, 1500);
        });

        return () => {
          clearTimeout(botTimer);
          unsub();
        };
      } catch (err) {
        console.error('Matchmaking error:', err);
      }
    };

    startQueue();

    return () => {
      isCancelled = true;
      if (activeTicketId) {
        leaveMatchmakingQueue(activeTicketId);
      }
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-lg animate-fade-in">
      <div className="relative w-full max-w-sm bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl text-slate-100 text-center">
        {/* Close / Cancel Button */}
        <button
          onClick={() => {
            sounds.playPop();
            onClose();
          }}
          className="absolute top-4 right-4 p-2 text-slate-400 hover:text-white rounded-full hover:bg-slate-800"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Radar Animation */}
        {!matchedOpponent ? (
          <div className="my-8 relative flex items-center justify-center">
            {/* Pulsing radar waves */}
            <div className="absolute w-44 h-44 rounded-full border border-indigo-500/20 animate-ping" />
            <div className="absolute w-32 h-32 rounded-full border border-rose-500/30 animate-pulse" />
            <div className="w-24 h-24 rounded-full bg-gradient-to-tr from-amber-500 via-rose-500 to-indigo-600 flex items-center justify-center text-4xl shadow-xl shadow-rose-500/30">
              <Globe2 className="w-12 h-12 text-white animate-spin-slow" />
            </div>
          </div>
        ) : (
          /* Match Found Opponent Display */
          <div className="my-6 animate-scale-up">
            <div className="inline-flex items-center gap-1.5 bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 px-3 py-1 rounded-full text-xs font-bold mb-4">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>CHALLENGER FOUND!</span>
            </div>

            <div className="flex items-center justify-center gap-4">
              {/* You */}
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

              {/* VS */}
              <div className="flex flex-col items-center">
                <span className="w-10 h-10 rounded-full bg-rose-600 text-white font-black text-sm flex items-center justify-center shadow-lg">
                  VS
                </span>
              </div>

              {/* Opponent */}
              <div className="flex flex-col items-center">
                <img
                  src={matchedOpponent.avatar}
                  alt={matchedOpponent.username}
                  className="w-16 h-16 rounded-2xl object-cover ring-2 ring-rose-500 shadow-md bg-slate-800"
                />
                <span className="text-xs font-extrabold text-white mt-1.5 truncate max-w-[80px]">
                  {matchedOpponent.username}
                </span>
                <span className="text-base">{matchedOpponent.countryFlag}</span>
              </div>
            </div>

            {/* Countdown Badge */}
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
            ? 'Scanning international players looking for a duel...'
            : `Playing with a traveler from ${matchedOpponent.countryName}!`}
        </p>

        {/* Cancel button */}
        {!matchedOpponent && (
          <button
            onClick={() => {
              sounds.playPop();
              onClose();
            }}
            className="mt-6 w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs active:scale-98 transition-all cursor-pointer"
          >
            Cancel Search
          </button>
        )}
      </div>
    </div>
  );
};
