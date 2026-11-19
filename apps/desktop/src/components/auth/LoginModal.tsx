import React, { useState } from 'react';
import { Scale, Lock, User, AlertCircle, Loader2, ShieldCheck } from 'lucide-react';
import { api } from '../../api/client.js';

interface LoginModalProps {
  onSuccess: (token: string, username: string) => void;
}

export const LoginModal: React.FC<LoginModalProps> = ({ onSuccess }) => {
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await api.post<{ token: string; username: string }>('/auth/login', { username, password });
      localStorage.setItem('erp_token', res.token);
      localStorage.setItem('erp_user', res.username);
      onSuccess(res.token, res.username);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-navy-950/95 backdrop-blur-md flex items-center justify-center p-4">

      {/* Background pattern */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-brand-600/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-sky-600/5 rounded-full blur-3xl" />
      </div>

      <div className="w-full max-w-sm relative animate-fade-in">
        {/* Card */}
        <div className="card overflow-hidden">

          {/* Top brand strip */}
          <div className="bg-gradient-to-r from-brand-700 to-navy-800 px-6 py-8 text-center border-b border-navy-700">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 mx-auto flex items-center justify-center shadow-lg shadow-brand-900/50 mb-4">
              <Scale className="w-8 h-8 text-white" />
            </div>
            <h2 className="text-lg font-bold text-white tracking-wide">SN Inventory ERP</h2>
            <p className="text-xs text-brand-300 mt-1 font-medium">Wholesale &amp; Commission System</p>
            <div className="flex items-center justify-center gap-1.5 mt-3">
              <ShieldCheck className="w-3.5 h-3.5 text-brand-400" />
              <span className="text-[10px] text-gray-500 font-medium">Single Owner Access Verification</span>
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            {error && (
              <div className="alert-error">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div>
              <label className="form-label">Username</label>
              <div className="relative">
                <User className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="form-input pl-9"
                  placeholder="admin"
                  autoFocus
                />
              </div>
            </div>

            <div>
              <label className="form-label">Password</label>
              <div className="relative">
                <Lock className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="form-input pl-9"
                  placeholder="••••••••••"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full justify-center py-3 text-sm mt-2"
            >
              {loading ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Authenticating…</>
              ) : (
                <><ShieldCheck className="w-4 h-4" /> Unlock ERP System</>
              )}
            </button>

            <p className="text-[11px] text-center text-slate-600 pt-1">
              Default setup credentials:&nbsp;
              <span className="text-gray-500 font-mono">admin / Password123!</span>
            </p>
          </form>
        </div>

        {/* Version tag */}
        <p className="text-center text-[10px] text-slate-700 mt-3">v1.1.0 • Local Server Mode</p>
      </div>
    </div>
  );
};
