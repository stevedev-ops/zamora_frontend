import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Lock, Mail, Wine } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { PasswordInput } from '../../components/common/PasswordInput';
import { useToast } from '../../components/common/Toast';

export function LoginPage() {
  const { login } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await login(email, password);
      showToast('Welcome back to Zamora Liquor Store', 'success');
      navigate('/');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Login failed', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-2xl border border-slate-200">
        <div className="flex flex-col items-center text-center mb-6">
          <div className="h-12 w-12 rounded-xl bg-slate-900 text-emerald-400 flex items-center justify-center mb-3">
            <Wine className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Zamora Liquor Store</h1>
          <p className="text-sm text-slate-500 mt-1">Owner Administration & POS Portal</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1.5">
              Owner Email
            </label>
            <div className="relative">
              <Mail className="h-4 w-4 text-slate-400 absolute left-3 top-3" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="owner@zamoraliquor.com"
                className="w-full rounded-lg border border-slate-300 pl-9 pr-3 py-2.5 text-sm focus:border-slate-900 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600">
                Password
              </label>
              <Link
                to="/forgot-password"
                className="text-xs font-semibold text-emerald-700 hover:text-emerald-800"
              >
                Forgot password?
              </Link>
            </div>
            <PasswordInput
              leftIcon={<Lock className="h-4 w-4" />}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              autoComplete="current-password"
              className="py-2.5 text-sm focus:border-slate-900 focus:outline-none"
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-slate-900 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {submitting ? 'Signing in...' : 'Sign In to Store Dashboard'}
          </button>
        </form>

        <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-xs text-slate-600 flex items-center justify-between gap-3">
          <div>
            <p className="font-semibold text-slate-800">Admin Credentials</p>
            <p className="mt-0.5 font-mono text-[11px] text-slate-700">
              owner@zamoraliquor.com / OwnerPass123!
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setEmail('owner@zamoraliquor.com');
              setPassword('OwnerPass123!');
            }}
            className="shrink-0 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 font-semibold text-slate-800 hover:bg-slate-100"
          >
            Fill
          </button>
        </div>
      </div>
    </div>
  );
}

