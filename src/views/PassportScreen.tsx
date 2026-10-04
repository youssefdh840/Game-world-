import React, { useState } from 'react';
import { UserProfile, PassportStamp, CountryData } from '../types/game';
import { COUNTRIES } from '../services/countryData';
import { CountryDetailModal } from '../components/CountryDetailModal';
import { BookMarked, Globe, Check, Lock, Award, Calendar, Search } from 'lucide-react';
import { sounds } from '../services/soundEffects';

interface PassportScreenProps {
  user: UserProfile;
  stamps: PassportStamp[];
  onStartMatchWithCountry: (code: string) => void;
}

export const PassportScreen: React.FC<PassportScreenProps> = ({
  user,
  stamps,
  onStartMatchWithCountry,
}) => {
  const [selectedContinent, setSelectedContinent] = useState<string>('All');
  const [search, setSearch] = useState<string>('');
  const [selectedCountry, setSelectedCountry] = useState<CountryData | null>(null);

  const discoveredCodes = new Set(
    (user.discoveredCountries || []).map((c) => c.toUpperCase())
  );

  const continents = ['All', 'Africa', 'Europe', 'Asia', 'Americas', 'Oceania'];

  const filteredCountries = COUNTRIES.filter((c) => {
    const matchesContinent = selectedContinent === 'All' || c.continent === selectedContinent;
    const matchesSearch = !search || c.name.toLowerCase().includes(search.toLowerCase().trim());
    return matchesContinent && matchesSearch;
  });

  const discoveredList = filteredCountries.filter((c) => discoveredCodes.has(c.code.toUpperCase()));
  const lockedList = filteredCountries.filter((c) => !discoveredCodes.has(c.code.toUpperCase()));

  return (
    <div className="space-y-6 sm:space-y-7 pb-8 animate-fade-in">
      {/* Exquisite Virtual Passport Booklet Cover / Identification Card */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-950 via-slate-900 to-slate-950 border-2 border-amber-500/40 p-5 sm:p-7 shadow-2xl">
        {/* Gold foil watermark effect */}
        <div className="absolute top-2 right-2 text-7xl opacity-5 pointer-events-none font-serif">
          PASSPORT
        </div>
        <div className="absolute -top-10 -right-10 w-40 h-40 bg-amber-500/10 rounded-full blur-2xl pointer-events-none" />

        {/* Passport Header */}
        <div className="flex items-center justify-between border-b border-amber-500/20 pb-3.5 mb-5">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
              <BookMarked className="w-4 h-4" />
            </div>
            <div>
              <span className="text-[10px] font-black uppercase tracking-widest text-amber-400">
                OFFICIAL DOCUMENT
              </span>
              <h3 className="text-sm sm:text-base font-black text-white tracking-wider">
                VIRTUAL WORLD PASSPORT
              </h3>
            </div>
          </div>
          <span className="text-2xl">🌐</span>
        </div>

        {/* Traveler Details Layout */}
        <div className="flex gap-4 sm:gap-6 items-center">
          <div className="relative shrink-0">
            <img
              src={user.avatar}
              alt={user.username}
              className="w-20 h-24 sm:w-24 sm:h-28 rounded-2xl object-cover ring-2 ring-amber-500/50 shadow-lg bg-slate-800"
            />
            <span className="absolute -bottom-1 -right-1 text-xl bg-slate-900 rounded-full shadow p-0.5">
              {user.countryFlag}
            </span>
          </div>

          <div className="flex-1 space-y-2 text-xs sm:text-sm">
            <div>
              <span className="text-[10px] font-bold text-amber-400/80 uppercase block">Name / Nom</span>
              <span className="font-extrabold text-white text-sm sm:text-base">{user.username}</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div>
                <span className="text-[10px] font-bold text-amber-400/80 uppercase block">Nationality</span>
                <span className="font-bold text-slate-200">{user.countryName}</span>
              </div>
              <div>
                <span className="text-[10px] font-bold text-amber-400/80 uppercase block">Rank / Level</span>
                <span className="font-bold text-amber-300">Level {user.level}</span>
              </div>
              <div className="col-span-2 sm:col-span-1">
                <span className="text-[10px] font-bold text-amber-400/80 uppercase block">Passport ID</span>
                <span className="font-mono text-[11px] text-slate-400">
                  WC-{user.uid.slice(0, 8).toUpperCase()}-2026
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Countries Discovered Counter Bar */}
        <div className="mt-5 pt-4 border-t border-amber-500/20">
          <div className="flex justify-between items-center text-xs sm:text-sm mb-1.5 font-bold">
            <span className="text-amber-300 flex items-center gap-1.5">
              <Globe className="w-4 h-4" />
              <span>Countries Discovered</span>
            </span>
            <span className="text-white font-mono font-black">
              {discoveredCodes.size} <span className="text-slate-400 font-normal">/ 195</span>
            </span>
          </div>

          <div className="w-full h-3 bg-slate-800 rounded-full overflow-hidden p-0.5 border border-amber-500/20">
            <div
              className="h-full rounded-full bg-gradient-to-r from-amber-500 via-rose-500 to-indigo-500 transition-all duration-700"
              style={{ width: `${Math.max(4, (discoveredCodes.size / 195) * 100)}%` }}
            />
          </div>
        </div>
      </div>

      {/* Filter / Search Controls */}
      <div className="space-y-3">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search passport countries..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-slate-900 border border-slate-800 rounded-2xl pl-10 pr-4 py-2.5 sm:py-3 text-xs sm:text-sm text-white placeholder-slate-400 focus:outline-none focus:border-amber-500"
          />
        </div>

        {/* Continents */}
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1 text-xs sm:text-sm">
          {continents.map((continent) => (
            <button
              key={continent}
              onClick={() => {
                sounds.playPop();
                setSelectedContinent(continent);
              }}
              className={`px-3.5 py-2 rounded-xl font-bold whitespace-nowrap transition-colors cursor-pointer ${
                selectedContinent === continent
                  ? 'bg-amber-500 text-slate-950 shadow'
                  : 'bg-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              {continent}
            </button>
          ))}
        </div>
      </div>

      {/* 1. Discovered Visa Stamps Section */}
      <div>
        <div className="flex items-center justify-between mb-3.5 px-1">
          <h4 className="text-xs sm:text-sm font-black uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
            <Check className="w-4 h-4" />
            <span>DISCOVERED &amp; STAMPED ({discoveredList.length})</span>
          </h4>
          <span className="text-xs text-slate-400">Tap to inspect visa</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3.5 sm:gap-4 md:gap-5">
          {discoveredList.map((country) => (
            <button
              key={country.code}
              onClick={() => {
                sounds.playPop();
                setSelectedCountry(country);
              }}
              className="relative p-4 sm:p-5 rounded-3xl bg-slate-900 border-2 border-emerald-500/40 hover:border-emerald-400 flex flex-col items-center text-center shadow-lg active:scale-97 transition-all cursor-pointer group overflow-hidden"
            >
              {/* Circular Stamp Border Design */}
              <div className="w-16 h-16 sm:w-18 sm:h-18 rounded-full border-2 border-dashed border-emerald-500/50 flex flex-col items-center justify-center p-1 mb-2.5 bg-emerald-500/10 group-hover:scale-105 transition-transform">
                <span className="text-2xl sm:text-3xl filter drop-shadow">{country.flag}</span>
                <span className="text-[8px] font-mono font-black text-emerald-400 tracking-widest uppercase">
                  VISITED
                </span>
              </div>

              <h5 className="font-extrabold text-white text-xs sm:text-sm tracking-tight">{country.name}</h5>
              <span className="text-[11px] text-slate-400">{country.capital}</span>

              <div className="mt-2.5 text-[10px] text-emerald-300 font-semibold bg-emerald-950/60 px-2.5 py-0.5 rounded-full border border-emerald-500/30">
                {country.badgeTitle}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* 2. Locked Countries Section */}
      <div>
        <div className="flex items-center justify-between mb-3.5 px-1">
          <h4 className="text-xs sm:text-sm font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
            <Lock className="w-3.5 h-3.5" />
            <span>LOCKED VISAS ({lockedList.length})</span>
          </h4>
          <span className="text-xs text-slate-500">Play with them to stamp</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3.5 sm:gap-4">
          {lockedList.map((country) => (
            <button
              key={country.code}
              onClick={() => {
                sounds.playPop();
                setSelectedCountry(country);
              }}
              className="p-3.5 sm:p-4 rounded-2xl bg-slate-900/40 border border-slate-800 hover:border-slate-700 flex items-center gap-3 text-left opacity-75 hover:opacity-100 transition-all cursor-pointer"
            >
              <div className="w-11 h-11 rounded-xl bg-slate-800 flex items-center justify-center text-xl shrink-0 grayscale">
                {country.flag}
              </div>
              <div className="overflow-hidden">
                <h5 className="font-bold text-slate-300 text-xs sm:text-sm truncate">{country.name}</h5>
                <span className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                  <Lock className="w-2.5 h-2.5" />
                  <span>Unexplored</span>
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Country Detail Modal */}
      <CountryDetailModal
        country={selectedCountry}
        isOpen={Boolean(selectedCountry)}
        onClose={() => setSelectedCountry(null)}
        stamp={
          selectedCountry
            ? stamps.find((s) => s.countryCode.toUpperCase() === selectedCountry.code.toUpperCase())
            : undefined
        }
        onPlayWithCountry={(code) => {
          onStartMatchWithCountry(code);
        }}
      />
    </div>
  );
};
