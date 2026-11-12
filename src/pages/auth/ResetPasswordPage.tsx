import React, { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../../api/client';
import { PasswordInput } from '../../components/common/PasswordInput';
import { useToast } from '../../components/common/Toast';

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [token, setToken] = useState(params.get('token') || '');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirm) {
      showToast('Passwords do not match', 'error');
      return;
    }
    setSubmitting(true);
    try {
      await api.post('/auth/reset-password', { token, newPassword });
      showToast('Password reset successfully. Please sign in.', 'success');
      navigate('/login');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Reset failed', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-2xl border border-slate-200">
        <h1 className="text-xl font-bold text-slate-900">Set New Password</h1>
        <p className="text-sm text-slate-500 mt-1">Choose a strong password (minimum 8 characters).</p>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          {!params.get('token') && (
            <div>
              <label className="block text-xs font-semibold uppercase text-slate-600 mb-1.5">
                Reset Token
              </label>
              <input
                type="text"
                required
                value={token}
                onChange={(e) => setToken(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm font-mono"
              />
            </div>
          )}
          <div>
            <label className="block text-xs font-semibold uppercase text-slate-600 mb-1.5">
              New Password
            </label>
            <PasswordInput
              required
              minLength={8}
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="py-2.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase text-slate-600 mb-1.5">
              Confirm Password
            </label>
            <PasswordInput
              required
              minLength={8}
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="py-2.5 text-sm"
            />
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-slate-900 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {submitting ? 'Updating...' : 'Reset Password'}
          </button>
          <div className="text-center">
            <Link to="/login" className="text-xs font-semibold text-slate-500 hover:text-slate-900">
              Back to Sign In
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}

