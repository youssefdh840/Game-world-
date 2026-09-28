import React, { useState, useEffect } from 'react';
import { UserProfile } from '../types/game';
import { getLeaderboard } from '../services/userService';
import { sounds } from '../services/soundEffects';
import { Trophy, Globe, Flame, Medal, Award, Crown } from 'lucide-react';

interface LeaderboardScreenProps {
  currentUser: UserProfile;
}

export const LeaderboardScreen: React.FC<LeaderboardScreenProps> = ({ currentUser }) => {
  const [boardType, setBoardType] = useState<'global' | 'weekly' | 'country'>('global');
  const [players, setPlayers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    const fetchBoard = async () => {
      setLoading(true);
      try {
        const list = await getLeaderboard();
        setPlayers(list);
      } catch (err) {
        console.error('Leaderboard fetch error:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchBoard();
  }, []);

  // Filter based on tab
  let displayPlayers = [...players];
  if (boardType === 'country') {
    displayPlayers = players.filter(
      (p) => p.countryCode.toUpperCase() === currentUser.countryCode.toUpperCase()
    );
    // If only current user in that country, add demo compatriots
    if (displayPlayers.length === 0) {
      displayPlayers = [currentUser];
    }
  }

  // Sort by XP
  displayPlayers.sort((a, b) => (b.xp || 0) - (a.xp || 0));

  const top3 = displayPlayers.slice(0, 3);
  const rest = displayPlayers.slice(3);

  return (
    <div className="space-y-5 pb-24 animate-fade-in">
      {/* Header */}
      <div className="text-center">
        <div className="w-14 h-14 mx-auto rounded-3xl bg-gradient-to-tr from-amber-400 via-yellow-500 to-amber-600 flex items-center justify-center text-3xl shadow-xl shadow-yellow-500/20 mb-2">
          🏆
        </div>
        <h2 className="text-2xl font-black text-white tracking-tight">World Leaderboard</h2>
        <p className="text-xs text-slate-400 mt-0.5">
          Top cultural champions and globetrotters worldwide
        </p>
      </div>

      {/* Tabs Switcher: Global, Weekly, Country */}
      <div className="flex bg-slate-900 border border-slate-800 p-1 rounded-2xl text-xs font-bold">
        <button
          onClick={() => {
            sounds.playPop();
            setBoardType('global');
          }}
          className={`flex-1 py-2 rounded-xl transition-all cursor-pointer ${
            boardType === 'global'
              ? 'bg-indigo-600 text-white shadow-md'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          🌍 Global
        </button>
        <button
          onClick={() => {
            sounds.playPop();
            setBoardType('weekly');
          }}
          className={`flex-1 py-2 rounded-xl transition-all cursor-pointer ${
            boardType === 'weekly'
              ? 'bg-indigo-600 text-white shadow-md'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          ⚡ Weekly
        </button>
        <button
          onClick={() => {
            sounds.playPop();
            setBoardType('country');
          }}
          className={`flex-1 py-2 rounded-xl transition-all cursor-pointer ${
            boardType === 'country'
              ? 'bg-indigo-600 text-white shadow-md'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          {currentUser.countryFlag} By Country
        </button>
      </div>

      {/* Top 3 Podium Visual */}
      {top3.length >= 3 && (
        <div className="pt-6 pb-2 px-2 flex items-end justify-center gap-2">
          {/* 2nd Place (Silver) */}
          <div className="flex-1 flex flex-col items-center">
            <div className="relative mb-2">
              <img
                src={top3[1].avatar}
                alt={top3[1].username}
                className="w-14 h-14 rounded-2xl object-cover ring-2 ring-slate-400 shadow-md bg-slate-800"
              />
              <span className="absolute -top-2 -right-1 text-base">🥈</span>
              <span className="absolute -bottom-1 -left-1 text-xs">{top3[1].countryFlag}</span>
            </div>
            <span className="font-extrabold text-white text-xs truncate max-w-[85px]">
              {top3[1].username}
            </span>
            <span className="font-mono text-[10px] text-slate-300 font-bold">
              {top3[1].xp.toLocaleString()} XP
            </span>
            <div className="w-full h-16 bg-slate-800/80 border-t-2 border-slate-400 rounded-t-2xl mt-2 flex items-center justify-center font-black text-slate-400 text-sm">
              2
            </div>
          </div>

          {/* 1st Place (Gold) */}
          <div className="flex-1 flex flex-col items-center -mt-4">
            <div className="relative mb-2">
              <img
                src={top3[0].avatar}
                alt={top3[0].username}
                className="w-18 h-18 rounded-2xl object-cover ring-4 ring-yellow-400 shadow-xl shadow-yellow-500/20 bg-slate-800"
              />
              <Crown className="w-6 h-6 text-yellow-400 fill-yellow-400 absolute -top-4 left-1/2 -translate-x-1/2" />
              <span className="absolute -bottom-1 -left-1 text-xs">{top3[0].countryFlag}</span>
            </div>
            <span className="font-extrabold text-white text-sm truncate max-w-[95px]">
              {top3[0].username}
            </span>
            <span className="font-mono text-xs text-yellow-300 font-black">
              {top3[0].xp.toLocaleString()} XP
            </span>
            <div className="w-full h-22 bg-gradient-to-t from-yellow-500/20 to-yellow-500/40 border-t-2 border-yellow-400 rounded-t-2xl mt-2 flex items-center justify-center font-black text-yellow-300 text-lg">
              1
            </div>
          </div>

          {/* 3rd Place (Bronze) */}
          <div className="flex-1 flex flex-col items-center">
            <div className="relative mb-2">
              <img
                src={top3[2].avatar}
                alt={top3[2].username}
                className="w-14 h-14 rounded-2xl object-cover ring-2 ring-amber-700 shadow-md bg-slate-800"
              />
              <span className="absolute -top-2 -right-1 text-base">🥉</span>
              <span className="absolute -bottom-1 -left-1 text-xs">{top3[2].countryFlag}</span>
            </div>
            <span className="font-extrabold text-white text-xs truncate max-w-[85px]">
              {top3[2].username}
            </span>
            <span className="font-mono text-[10px] text-amber-400 font-bold">
              {top3[2].xp.toLocaleString()} XP
            </span>
            <div className="w-full h-12 bg-slate-800/60 border-t-2 border-amber-700 rounded-t-2xl mt-2 flex items-center justify-center font-black text-amber-600 text-sm">
              3
            </div>
          </div>
        </div>
      )}

      {/* Ranks 4+ List */}
      <div className="space-y-2">
        {rest.map((p, index) => {
          const rank = index + 4;
          const isCurrentUser = p.uid === currentUser.uid;

          return (
            <div
              key={p.uid}
              className={`p-3 rounded-2xl border flex items-center justify-between text-xs transition-colors ${
                isCurrentUser
                  ? 'bg-indigo-950/60 border-indigo-500/60 ring-1 ring-indigo-500'
                  : 'bg-slate-900 border-slate-800'
              }`}
            >
              <div className="flex items-center gap-3">
                <span className="w-5 text-center font-mono font-bold text-slate-400">
                  {rank}
                </span>
                <img
                  src={p.avatar}
                  alt={p.username}
                  className="w-10 h-10 rounded-xl object-cover ring-1 ring-slate-700 bg-slate-800"
                />
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="font-black text-white">{p.username}</span>
                    <span className="text-xs">{p.countryFlag}</span>
                    {isCurrentUser && (
                      <span className="text-[9px] bg-indigo-500 text-white px-1.5 py-0.2 rounded font-bold">
                        YOU
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] text-slate-400">
                    Level {p.level} • {p.gamesWon || 0} Wins
                  </span>
                </div>
              </div>

              <div className="text-right">
                <span className="font-mono font-bold text-amber-300 block">
                  {p.xp.toLocaleString()} XP
                </span>
                <span className="text-[10px] text-slate-500">
                  {p.discoveredCountries?.length || 0} Visas
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
