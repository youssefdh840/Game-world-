import React from 'react';
import { CountryData, PassportStamp } from '../types/game';
import { X, Award, Utensils, Landmark, Globe, MessageSquare, Gamepad2, Users } from 'lucide-react';
import { sounds } from '../services/soundEffects';

interface CountryDetailModalProps {
  country: CountryData | null;
  isOpen: boolean;
  onClose: () => void;
  stamp?: PassportStamp;
  onPlayWithCountry?: (code: string) => void;
}

export const CountryDetailModal: React.FC<CountryDetailModalProps> = ({
  country,
  isOpen,
  onClose,
  stamp,
  onPlayWithCountry,
}) => {
  if (!isOpen || !country) return null;

  const isUnlocked = Boolean(stamp);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-fade-in overflow-y-auto">
      <div className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl text-slate-100 my-8">
        {/* Close Button */}
        <button
          onClick={() => {
            sounds.playPop();
            onClose();
          }}
          className="absolute top-4 right-4 p-2 text-slate-400 hover:text-white rounded-full hover:bg-slate-800 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Country Header */}
        <div className="text-center mb-5">
          <div className="text-6xl mb-2 filter drop-shadow-lg">{country.flag}</div>
          <h2 className="text-2xl font-black tracking-tight text-white">{country.name}</h2>
          <div className="flex items-center justify-center gap-2 mt-1 text-xs text-indigo-300 font-semibold">
            <span>Capital: {country.capital}</span>
            <span>•</span>
            <span>{country.continent}</span>
          </div>

          {/* Status Badge */}
          <div className="mt-3">
            {isUnlocked ? (
              <span className="inline-flex items-center gap-1.5 bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 px-3 py-1 rounded-full text-xs font-bold">
                <span>✓</span> Discovered in Virtual Passport
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 bg-slate-800 border border-slate-700 text-slate-400 px-3 py-1 rounded-full text-xs font-medium">
                <span>🔒</span> Locked — Meet a player from {country.name} to unlock!
              </span>
            )}
          </div>
        </div>

        {/* Encounter Statistics */}
        <div className="grid grid-cols-2 gap-2.5 mb-5">
          <div className="bg-slate-800/80 rounded-2xl p-3 border border-slate-700/50 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[10px] text-slate-400 font-bold uppercase block">Players Met</span>
              <span className="text-base font-black text-white">
                {stamp ? stamp.gamesPlayedWith : 0}
              </span>
            </div>
          </div>

          <div className="bg-slate-800/80 rounded-2xl p-3 border border-slate-700/50 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center">
              <Gamepad2 className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[10px] text-slate-400 font-bold uppercase block">Games Played</span>
              <span className="text-base font-black text-white">
                {stamp ? stamp.gamesPlayedWith : 0}
              </span>
            </div>
          </div>
        </div>

        {/* Country Cultural Highlights */}
        <div className="space-y-3.5 text-xs">
          {/* Languages */}
          <div className="bg-slate-800/50 rounded-2xl p-3.5 border border-slate-800">
            <div className="flex items-center gap-1.5 text-indigo-400 font-bold mb-1.5">
              <MessageSquare className="w-3.5 h-3.5" />
              <span>Languages</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {country.languages.map((l) => (
                <span
                  key={l}
                  className="bg-slate-700/70 text-slate-200 px-2.5 py-0.5 rounded-lg text-[11px] font-medium"
                >
                  {l}
                </span>
              ))}
            </div>
          </div>

          {/* Traditional Foods */}
          <div className="bg-slate-800/50 rounded-2xl p-3.5 border border-slate-800">
            <div className="flex items-center gap-1.5 text-amber-400 font-bold mb-1.5">
              <Utensils className="w-3.5 h-3.5" />
              <span>Traditional Cuisine</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {country.traditionalFoods.map((f) => (
                <span
                  key={f}
                  className="bg-amber-500/10 border border-amber-500/20 text-amber-200 px-2 py-0.5 rounded-lg text-[11px]"
                >
                  {f}
                </span>
              ))}
            </div>
          </div>

          {/* Landmarks */}
          <div className="bg-slate-800/50 rounded-2xl p-3.5 border border-slate-800">
            <div className="flex items-center gap-1.5 text-rose-400 font-bold mb-1.5">
              <Landmark className="w-3.5 h-3.5" />
              <span>Iconic Landmarks</span>
            </div>
            <ul className="list-disc list-inside text-slate-300 space-y-1">
              {country.landmarks.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          </div>

          {/* Cultural Facts */}
          <div className="bg-slate-800/50 rounded-2xl p-3.5 border border-slate-800">
            <div className="flex items-center gap-1.5 text-emerald-400 font-bold mb-1.5">
              <Globe className="w-3.5 h-3.5" />
              <span>Fascinating Cultural Fact</span>
            </div>
            <p className="text-slate-300 leading-relaxed italic">
              "{country.facts[0]}"
            </p>
          </div>

          {/* Explorer Badge Title */}
          <div className="bg-gradient-to-r from-indigo-950 to-slate-900 border border-indigo-500/30 rounded-2xl p-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Award className="w-5 h-5 text-amber-400" />
              <div>
                <span className="text-[10px] text-indigo-300 font-bold block uppercase">Country Explorer Badge</span>
                <span className="font-extrabold text-white">{country.badgeTitle}</span>
              </div>
            </div>
            <span className="text-xl">🏆</span>
          </div>
        </div>

        {/* Action Button */}
        <div className="mt-5">
          <button
            onClick={() => {
              sounds.playPop();
              onClose();
              if (onPlayWithCountry) onPlayWithCountry(country.code);
            }}
            className="w-full py-3 rounded-2xl bg-gradient-to-r from-indigo-600 via-rose-600 to-amber-600 hover:opacity-95 text-white font-black text-sm flex items-center justify-center gap-2 shadow-lg shadow-rose-500/20 active:scale-98 transition-all cursor-pointer"
          >
            <Gamepad2 className="w-4 h-4" />
            <span>Play Game Featuring {country.name}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
