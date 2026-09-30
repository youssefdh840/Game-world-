import React, { useState, useEffect } from 'react';
import {
  getActiveFirebaseConfig,
  saveCustomFirebaseConfig,
  resetFirebaseConfig,
  runFirebaseDiagnostics,
  DiagnosticResult,
} from '../services/firebase';
import { sounds } from '../services/soundEffects';
import {
  ShieldAlert,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Save,
  X,
  ExternalLink,
  Key,
  Database,
  RefreshCw,
} from 'lucide-react';

interface FirebaseConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const FirebaseConfigModal: React.FC<FirebaseConfigModalProps> = ({ isOpen, onClose }) => {
  const [config, setConfig] = useState(getActiveFirebaseConfig());
  const [apiKeyInput, setApiKeyInput] = useState(config.apiKey || '');
  const [projectIdInput, setProjectIdInput] = useState(config.projectId || '');
  const [appIdInput, setAppIdInput] = useState(config.appId || '');
  const [diagnostics, setDiagnostics] = useState<DiagnosticResult | null>(null);
  const [testing, setTesting] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const performTest = async () => {
    setTesting(true);
    try {
      const res = await runFirebaseDiagnostics();
      setDiagnostics(res);
    } catch {
      // ignore
    } finally {
      setTesting(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      const current = getActiveFirebaseConfig();
      setConfig(current);
      setApiKeyInput(current.apiKey || '');
      setProjectIdInput(current.projectId || '');
      setAppIdInput(current.appId || '');
      performTest();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    sounds.playPop();

    const updated = {
      apiKey: apiKeyInput.trim(),
      projectId: projectIdInput.trim(),
      appId: appIdInput.trim(),
    };

    saveCustomFirebaseConfig(updated);
    setSaveSuccess(true);
    sounds.playCorrect();

    setTimeout(() => {
      window.location.reload();
    }, 1200);
  };

  const handleReset = () => {
    sounds.playPop();
    resetFirebaseConfig();
    window.location.reload();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-fade-in overflow-y-auto">
      <div className="relative w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl text-slate-100 my-6">
        {/* Close Button */}
        <button
          onClick={() => {
            sounds.playPop();
            onClose();
          }}
          className="absolute top-4 right-4 p-2 text-slate-400 hover:text-white rounded-full hover:bg-slate-800 cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header */}
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400">
            <Key className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-black text-white">Firebase & Cloud Sync</h2>
            <p className="text-xs text-slate-400">Live project credentials and connection diagnostics</p>
          </div>
        </div>

        {/* Diagnostics Card */}
        <div className="bg-slate-800/80 border border-slate-700/60 rounded-2xl p-4 mb-5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Live Diagnostics</span>
            <button
              onClick={performTest}
              disabled={testing}
              className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1 font-semibold disabled:opacity-50 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${testing ? 'animate-spin' : ''}`} />
              <span>{testing ? 'Testing...' : 'Retest'}</span>
            </button>
          </div>

          {diagnostics && (
            <div className="space-y-2 text-xs">
              {/* Auth Status */}
              <div className="flex items-start gap-2.5 p-2.5 rounded-xl bg-slate-900/60 border border-slate-800">
                {diagnostics.authStatus === 'valid' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                )}
                <div>
                  <div className="font-bold flex items-center gap-1.5">
                    <span>Firebase Auth & Identity:</span>
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded font-black ${
                        diagnostics.authStatus === 'valid'
                          ? 'bg-emerald-500/20 text-emerald-300'
                          : 'bg-rose-500/20 text-rose-300'
                      }`}
                    >
                      {diagnostics.authStatus === 'valid' ? 'HEALTHY' : 'INVALID KEY'}
                    </span>
                  </div>
                  <p className="text-slate-400 mt-0.5 leading-snug">{diagnostics.authMessage}</p>
                </div>
              </div>

              {/* Firestore Status */}
              <div className="flex items-start gap-2.5 p-2.5 rounded-xl bg-slate-900/60 border border-slate-800">
                {diagnostics.firestoreStatus === 'connected' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                ) : diagnostics.firestoreStatus === 'permission_denied' ? (
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                ) : (
                  <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                )}
                <div>
                  <div className="font-bold flex items-center gap-1.5">
                    <span>Firestore Database:</span>
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded font-black ${
                        diagnostics.firestoreStatus === 'connected'
                          ? 'bg-emerald-500/20 text-emerald-300'
                          : diagnostics.firestoreStatus === 'permission_denied'
                          ? 'bg-amber-500/20 text-amber-300'
                          : 'bg-rose-500/20 text-rose-300'
                      }`}
                    >
                      {diagnostics.firestoreStatus.toUpperCase()}
                    </span>
                  </div>
                  <p className="text-slate-400 mt-0.5 leading-snug">{diagnostics.firestoreMessage}</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Setup Instructions Box */}
        <div className="p-3.5 bg-indigo-950/40 border border-indigo-500/30 rounded-2xl mb-5 text-xs text-slate-300 space-y-2">
          <div className="font-extrabold text-indigo-300 flex items-center gap-1.5">
            <span>ℹ️ How to fix the "API key not valid" error:</span>
          </div>
          <ol className="list-decimal pl-4 space-y-1 text-[11px] text-slate-300 leading-relaxed">
            <li>
              Go to{' '}
              <a
                href="https://console.firebase.google.com/"
                target="_blank"
                rel="noreferrer"
                className="text-indigo-400 underline inline-flex items-center gap-0.5"
              >
                Firebase Console <ExternalLink className="w-2.5 h-2.5" />
              </a>{' '}
              and select your project (<strong>{config.projectId}</strong>).
            </li>
            <li>Click the ⚙️ <strong>Project Settings</strong> gear icon in the top left sidebar.</li>
            <li>
              Scroll down to <strong>Your apps</strong> &rarr; <strong>Web apps</strong> to see your current valid Web{' '}
              <code className="bg-slate-800 px-1 py-0.5 rounded text-amber-300">apiKey</code>.
            </li>
            <li>
              In <strong>Authentication</strong> &rarr; <strong>Sign-in method</strong>, ensure <strong>Anonymous</strong> and{' '}
              <strong>Email/Password</strong> are enabled.
            </li>
            <li>Paste your Web API key below and click <strong>Save & Apply</strong>.</li>
          </ol>
        </div>

        {/* Form to update credentials */}
        <form onSubmit={handleSave} className="space-y-3 text-xs">
          <div>
            <label className="block text-[11px] font-bold text-slate-400 mb-1 uppercase tracking-wider">
              Firebase Project ID
            </label>
            <input
              type="text"
              required
              value={projectIdInput}
              onChange={(e) => setProjectIdInput(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2.5 text-white font-mono focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-400 mb-1 uppercase tracking-wider">
              Firebase Web API Key (apiKey)
            </label>
            <input
              type="text"
              required
              value={apiKeyInput}
              onChange={(e) => setApiKeyInput(e.target.value)}
              placeholder="AIzaSy..."
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2.5 text-white font-mono focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-400 mb-1 uppercase tracking-wider">
              Firebase App ID (appId)
            </label>
            <input
              type="text"
              required
              value={appIdInput}
              onChange={(e) => setAppIdInput(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2.5 text-white font-mono focus:outline-none focus:border-indigo-500"
            />
          </div>

          {saveSuccess && (
            <div className="p-3 bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 rounded-xl font-bold text-center">
              Configuration saved! Reloading application...
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <button
              type="submit"
              className="flex-1 bg-gradient-to-r from-indigo-600 to-rose-600 hover:opacity-95 text-white font-extrabold py-2.5 rounded-xl flex items-center justify-center gap-2 shadow-lg cursor-pointer"
            >
              <Save className="w-4 h-4" />
              <span>Save & Apply</span>
            </button>

            <button
              type="button"
              onClick={handleReset}
              className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Reset</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
