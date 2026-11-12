import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from '../api/client';
import { clearStoredOwnerToken, setStoredOwnerToken } from '../api/config';

export interface OwnerUser {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  role: 'OWNER';
}

interface AuthContextValue {
  user: OwnerUser | null;
  loading: boolean;
  refreshUser: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<OwnerUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    try {
      const data = await api.get<{ user: OwnerUser }>('/auth/me');
      setUser(data.user);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  const login = async (email: string, password: string) => {
    const data = await api.post<{ user: OwnerUser; token?: string }>('/auth/login', {
      email,
      password,
    });
    if (data.token) {
      setStoredOwnerToken(data.token);
    }
    setUser(data.user);
  };

  const logout = async () => {
    try {
      await api.post('/auth/logout');
    } finally {
      clearStoredOwnerToken();
      setUser(null);
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, refreshUser, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

