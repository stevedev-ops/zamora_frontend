import React, { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

interface PasswordInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  leftIcon?: React.ReactNode;
}

/** Password input with a button to toggle plaintext visibility. */
export function PasswordInput({ leftIcon, className = '', ...props }: PasswordInputProps) {
  const [visible, setVisible] = useState(false);
  const paddingClass = leftIcon ? 'pl-9 pr-10' : 'pl-3 pr-10';

  return (
    <div className="relative">
      {leftIcon ? (
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
          {leftIcon}
        </span>
      ) : null}
      <input
        {...props}
        type={visible ? 'text' : 'password'}
        className={`w-full rounded-lg border border-slate-300 ${paddingClass} ${className}`.trim()}
      />
      <button
        type="button"
        onClick={() => setVisible((prev) => !prev)}
        aria-label={visible ? 'Hide password' : 'Show password'}
        aria-pressed={visible}
        title={visible ? 'Hide password' : 'Show password'}
        className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-300"
      >
        {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}

