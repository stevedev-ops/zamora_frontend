import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Mail } from 'lucide-react';
import { api } from '../../api/client';
import { useToast } from '../../components/common/Toast';

export function ForgotPasswordPage() {
  const { showToast } = useToast();
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sentInfo, setSentInfo] = useState<{ message: string; devResetToken?: string } | null>(
    null
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await api.post<{ message: string; devResetToken?: string }>(
        '/auth/forgot-password',
        { email }
      );
      setSentInfo(res);
      showToast('Password reset instructions sent', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Request failed', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-2xl border border-slate-200">
        <Link
          to="/login"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-900 mb-4"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Sign In
        </Link>
        <h1 className="text-xl font-bold text-slate-900">Reset Owner Password</h1>
        <p className="text-sm text-slate-500 mt-1">
          Enter your store owner email address to receive a secure reset link.
        </p>

        {sentInfo ? (
          <div className="mt-5 rounded-xl bg-emerald-50 border border-emerald-200 p-4 text-sm text-emerald-900 space-y-2">
            <p>{sentInfo.message}</p>
            {sentInfo.devResetToken && (
              <div className="pt-2 border-t border-emerald-200 text-xs">
                <p className="font-semibold">Development Reset Link:</p>
                <Link
                  to={`/reset-password?token=${sentInfo.devResetToken}`}
                  className="text-emerald-700 underline font-mono break-all"
                >
                  Open Password Reset Form
                </Link>
              </div>
            )}
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-5 space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase text-slate-600 mb-1.5">
                Email Address
              </label>
              <div className="relative">
                <Mail className="h-4 w-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 pl-9 pr-3 py-2.5 text-sm focus:border-slate-900 focus:outline-none"
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-lg bg-slate-900 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {submitting ? 'Sending...' : 'Send Reset Link'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

