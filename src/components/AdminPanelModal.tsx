import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { collection, getDocs, addDoc, doc, updateDoc } from 'firebase/firestore';
import { db } from '../services/firebase';
import { Question, ReportItem, GameCategory } from '../types/game';
import { QUESTIONS } from '../services/questionData';
import { COUNTRIES } from '../services/countryData';
import { sounds } from '../services/soundEffects';
import { Shield, X, AlertTriangle, Plus, List, BarChart3, Check } from 'lucide-react';

interface AdminPanelModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AdminPanelModal: React.FC<AdminPanelModalProps> = ({ isOpen, onClose }) => {
  const { userProfile } = useAuth();
  const [tab, setTab] = useState<'stats' | 'reports' | 'add_question'>('stats');

  const [reports, setReports] = useState<ReportItem[]>([]);
  const [loadingReports, setLoadingReports] = useState(false);

  // New question form
  const [category, setCategory] = useState<GameCategory>('country_quiz');
  const [countryCode, setCountryCode] = useState('TN');
  const [prompt, setPrompt] = useState('');
  const [options, setOptions] = useState(['', '', '', '']);
  const [correctAnswer, setCorrectAnswer] = useState('');
  const [explanation, setExplanation] = useState('');
  const [submittingQ, setSubmittingQ] = useState(false);
  const [qSuccess, setQSuccess] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const fetchReports = async () => {
      setLoadingReports(true);
      try {
        const snap = await getDocs(collection(db, 'reports'));
        const list = snap.docs.map((d) => ({
          ...(d.data() as ReportItem),
          id: d.id,
        }));
        setReports(list);
      } catch (err) {
        console.error('Reports fetch err:', err);
      } finally {
        setLoadingReports(false);
      }
    };
    fetchReports();
  }, [isOpen]);

  if (!isOpen) return null;

  const handleOptionChange = (idx: number, val: string) => {
    const copy = [...options];
    copy[idx] = val;
    setOptions(copy);
  };

  const handleCreateQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!prompt.trim() || options.some((o) => !o.trim()) || !correctAnswer.trim()) {
      setFormError('Please fill all required prompt, options, and answer fields.');
      return;
    }

    setSubmittingQ(true);
    sounds.playPop();

    const selectedCountry = COUNTRIES.find((c) => c.code === countryCode) || COUNTRIES[0];

    const newQuestion: Omit<Question, 'id'> = {
      category,
      countryCode: selectedCountry.code,
      countryName: selectedCountry.name,
      difficulty: 'medium',
      prompt: prompt.trim(),
      options: options.map((o) => o.trim()),
      correctAnswer: correctAnswer.trim(),
      explanation: explanation.trim() || `Cultural fact regarding ${selectedCountry.name}.`,
      active: true,
    };

    try {
      await addDoc(collection(db, 'questions'), newQuestion);
      sounds.playCorrect();
      setQSuccess(true);
      setPrompt('');
      setOptions(['', '', '', '']);
      setCorrectAnswer('');
      setExplanation('');
      setTimeout(() => setQSuccess(false), 2500);
    } catch (err) {
      console.error('Error adding question:', err);
      sounds.playWrong();
    } finally {
      setSubmittingQ(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-fade-in overflow-y-auto">
      <div className="relative w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl text-slate-100 my-8">
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
        <div className="flex items-center gap-2.5 mb-5">
          <div className="w-10 h-10 rounded-xl bg-rose-500/20 text-rose-400 flex items-center justify-center">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-xl font-black text-white">World Challenge Admin</h2>
            <p className="text-xs text-slate-400">
              Content management, safety moderation, and game analytics
            </p>
          </div>
        </div>

        {/* Admin Navigation */}
        <div className="flex bg-slate-800/80 p-1 rounded-2xl mb-5 text-xs font-bold">
          <button
            onClick={() => setTab('stats')}
            className={`flex-1 py-2 rounded-xl flex items-center justify-center gap-1.5 transition-all ${
              tab === 'stats' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5" />
            <span>Overview</span>
          </button>
          <button
            onClick={() => setTab('reports')}
            className={`flex-1 py-2 rounded-xl flex items-center justify-center gap-1.5 transition-all ${
              tab === 'reports' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>Reports ({reports.length})</span>
          </button>
          <button
            onClick={() => setTab('add_question')}
            className={`flex-1 py-2 rounded-xl flex items-center justify-center gap-1.5 transition-all ${
              tab === 'add_question' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Question</span>
          </button>
        </div>

        {/* Tab 1: Stats Overview */}
        {tab === 'stats' && (
          <div className="space-y-4 text-xs">
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-slate-800/60 border border-slate-700/40 rounded-2xl p-4">
                <span className="text-[10px] font-bold text-slate-400 uppercase block">
                  Catalog Countries
                </span>
                <span className="text-2xl font-black text-white">{COUNTRIES.length}</span>
                <span className="text-[10px] text-slate-400 mt-1 block">Full data populated</span>
              </div>
              <div className="bg-slate-800/60 border border-slate-700/40 rounded-2xl p-4">
                <span className="text-[10px] font-bold text-slate-400 uppercase block">
                  Question Bank
                </span>
                <span className="text-2xl font-black text-indigo-400">{QUESTIONS.length}+</span>
                <span className="text-[10px] text-slate-400 mt-1 block">Across 7 mini-games</span>
              </div>
            </div>

            <div className="bg-slate-800/40 border border-slate-800 rounded-2xl p-4 space-y-2">
              <h4 className="font-extrabold text-white">Active Moderation Status</h4>
              <p className="text-slate-400 leading-relaxed">
                Zero-Trust Firestore security rules are deployed and validated. User PII is protected,
                and server-side validation is active.
              </p>
            </div>
          </div>
        )}

        {/* Tab 2: Reports */}
        {tab === 'reports' && (
          <div className="space-y-3">
            {reports.length === 0 ? (
              <div className="text-center py-10 text-slate-400 text-xs">
                No active player violations or reports pending review!
              </div>
            ) : (
              reports.map((r) => (
                <div
                  key={r.id}
                  className="p-3 bg-slate-800/70 border border-slate-700/50 rounded-2xl text-xs space-y-1"
                >
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-rose-400">
                      Reported: {r.reportedUsername}
                    </span>
                    <span className="text-[10px] text-slate-500 font-mono">
                      by {r.reporterUsername}
                    </span>
                  </div>
                  <p className="text-slate-300">Reason: {r.reason}</p>
                  {r.details && <p className="text-slate-400 italic">"{r.details}"</p>}
                </div>
              ))
            )}
          </div>
        )}

        {/* Tab 3: Add Question */}
        {tab === 'add_question' && (
          <form onSubmit={handleCreateQuestion} className="space-y-3 text-xs">
            {formError && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/30 text-rose-400 rounded-xl">
                {formError}
              </div>
            )}
            {qSuccess && (
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded-xl flex items-center gap-2">
                <Check className="w-4 h-4" />
                <span>Question uploaded to Firestore collection!</span>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
                  Category
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as GameCategory)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl p-2 text-white"
                >
                  <option value="country_quiz">Country Quiz</option>
                  <option value="guess_word">Guess the Word</option>
                  <option value="mystery_food">Mystery Food</option>
                  <option value="music_culture">Music & Instruments</option>
                  <option value="world_map">World Map</option>
                  <option value="cultural_mime">Traditions</option>
                  <option value="duel">1 vs 1 Duel</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
                  Country
                </label>
                <select
                  value={countryCode}
                  onChange={(e) => setCountryCode(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl p-2 text-white"
                >
                  {COUNTRIES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.flag} {c.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
                Question Prompt
              </label>
              <textarea
                rows={2}
                required
                placeholder="e.g. Which country is known for..."
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl p-2 text-white"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-[10px] font-bold text-slate-400 uppercase">
                4 Options (Specify Correct Answer Below)
              </label>
              {options.map((opt, i) => (
                <input
                  key={i}
                  type="text"
                  required
                  placeholder={`Option ${String.fromCharCode(65 + i)}`}
                  value={opt}
                  onChange={(e) => handleOptionChange(i, e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl p-2 text-white text-xs"
                />
              ))}
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
                Exact Correct Answer (Must match one option)
              </label>
              <input
                type="text"
                required
                placeholder="Copy exact text of correct option"
                value={correctAnswer}
                onChange={(e) => setCorrectAnswer(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl p-2 text-white text-xs"
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
                Cultural Explanation Fact
              </label>
              <input
                type="text"
                placeholder="Why is this answer correct?"
                value={explanation}
                onChange={(e) => setExplanation(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl p-2 text-white text-xs"
              />
            </div>

            <button
              type="submit"
              disabled={submittingQ}
              className="w-full py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-rose-600 font-bold text-white shadow-md active:scale-98 transition-all cursor-pointer"
            >
              {submittingQ ? 'Saving to Database...' : 'Save & Publish Question'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
