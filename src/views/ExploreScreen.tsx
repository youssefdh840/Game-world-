import React, { useState } from 'react';
import { COUNTRIES } from '../services/countryData';
import { CountryData, PassportStamp } from '../types/game';
import { useAuth } from '../context/AuthContext';
import { CountryDetailModal } from '../components/CountryDetailModal';
import { Search, Compass, CheckCircle2, Lock, Sparkles } from 'lucide-react';
import { sounds } from '../services/soundEffects';

interface ExploreScreenProps {
  onStartMatchmakingWithCountry?: (code: string) => void;
  passportStamps: PassportStamp[];
}

export const ExploreScreen: React.FC<ExploreScreenProps> = ({
  onStartMatchmakingWithCountry,
  passportStamps,
}) => {
  const { userProfile } = useAuth();
  const [selectedContinent, setSelectedContinent] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCountry, setActiveCountry] = useState<CountryData | null>(null);

  const continents = ['All', 'Africa', 'Europe', 'Asia', 'Americas', 'Oceania'];

  const discoveredCodes = new Set(
    (userProfile?.discoveredCountries || []).map((c) => c.toUpperCase())
  );

  const filteredCountries = COUNTRIES.filter((c) => {
    const matchesContinent = selectedContinent === 'All' || c.continent === selectedContinent;
    const q = searchQuery.toLowerCase().trim();
    const matchesSearch =
      !q ||
      c.name.toLowerCase().includes(q) ||
      c.capital.toLowerCase().includes(q) ||
      c.languages.some((l) => l.toLowerCase().includes(q));

    return matchesContinent && matchesSearch;
  });

  return (
    <div className="space-y-5 sm:space-y-6 pb-8 animate-fade-in">
      {/* Header Banner */}
      <div className="bg-[#111827] border border-cyan-500/20 rounded-3xl p-5 sm:p-7 shadow-xl">
        <div className="flex items-center gap-2 text-cyan-400 font-extrabold text-xs tracking-wider uppercase mb-1.5">
          <Compass className="w-4 h-4 animate-spin-slow text-cyan-400" />
          <span>WORLD ATLAS</span>
        </div>
        <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">Explore the World</h2>
        <p className="text-xs sm:text-sm text-slate-300 mt-1.5 max-w-2xl leading-relaxed">
          Tap any country to discover cultural traditions, languages, and traditional cuisine.
        </p>

        {/* Search Input */}
        <div className="relative mt-4 sm:mt-5">
          <Search className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search by country, capital, or language..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[#0B0F19] border border-slate-800 rounded-2xl pl-10 pr-4 py-3 text-xs sm:text-sm text-white placeholder-slate-400 focus:outline-none focus:border-cyan-400 transition-colors"
          />
        </div>

        {/* Continents Filter */}
        <div className="flex items-center gap-2 overflow-x-auto mt-3.5 pb-1 no-scrollbar text-xs sm:text-sm">
          {continents.map((continent) => {
            const isSelected = selectedContinent === continent;
            return (
              <button
                key={continent}
                onClick={() => {
                  sounds.playPop();
                  setSelectedContinent(continent);
                }}
                className={`px-3.5 py-2 rounded-xl font-black whitespace-nowrap transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-cyan-500 text-slate-950 shadow-md'
                    : 'bg-[#0B0F19] text-slate-400 hover:text-slate-200 border border-slate-800'
                }`}
              >
                {continent}
              </button>
            );
          })}
        </div>
      </div>

      {/* Stats Counter */}
      <div className="flex items-center justify-between px-2 text-xs sm:text-sm text-slate-400 font-semibold">
        <span>Showing {filteredCountries.length} countries</span>
        <span className="text-emerald-400 font-bold">
          {discoveredCodes.size} / 195 in your passport
        </span>
      </div>

      {/* Countries Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3.5 sm:gap-4 md:gap-5">
        {filteredCountries.map((country) => {
          const isDiscovered = discoveredCodes.has(country.code.toUpperCase());

          return (
            <button
              key={country.code}
              onClick={() => {
                sounds.playPop();
                setActiveCountry(country);
              }}
              className={`p-4 sm:p-5 rounded-3xl border flex flex-col items-start text-left transition-all active:scale-97 cursor-pointer group ${
                isDiscovered
                  ? 'bg-[#111827] border-emerald-500/40 hover:border-emerald-500/70 shadow-lg'
                  : 'bg-[#111827]/60 border-slate-800 hover:border-slate-700 opacity-90'
              }`}
            >
              <div className="w-full flex items-start justify-between mb-2.5">
                <span className="text-3xl sm:text-4xl filter drop-shadow group-hover:scale-110 transition-transform">
                  {country.flag}
                </span>
                {isDiscovered ? (
                  <span className="text-emerald-400 text-xs flex items-center gap-1 bg-emerald-500/10 px-2 py-0.5 rounded-full font-bold">
                    <CheckCircle2 className="w-3 h-3" />
                    <span>Met</span>
                  </span>
                ) : (
                  <span className="text-slate-400 text-xs flex items-center gap-1 bg-slate-900/80 px-2 py-0.5 rounded-full">
                    <Lock className="w-2.5 h-2.5" />
                    <span>Lock</span>
                  </span>
                )}
              </div>

              <h3 className="font-black text-white text-sm sm:text-base tracking-tight truncate w-full">
                {country.name}
              </h3>
              <p className="text-xs text-slate-400 truncate w-full mt-0.5">
                {country.capital} • {country.continent}
              </p>

              <div className="mt-3 pt-2.5 border-t border-slate-700/60 w-full flex items-center justify-between text-[11px] text-slate-400">
                <span className="truncate max-w-[100px] sm:max-w-[130px]">{country.traditionalFoods[0]}</span>
                <span className="text-indigo-400 font-bold group-hover:underline">Explore</span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Country Detail Modal */}
      <CountryDetailModal
        country={activeCountry}
        isOpen={Boolean(activeCountry)}
        onClose={() => setActiveCountry(null)}
        stamp={activeCountry ? passportStamps.find((s) => s.countryCode === activeCountry.code) : undefined}
        onPlayWithCountry={(code) => {
          if (onStartMatchmakingWithCountry) onStartMatchmakingWithCountry(code);
        }}
      />
    </div>
  );
};
