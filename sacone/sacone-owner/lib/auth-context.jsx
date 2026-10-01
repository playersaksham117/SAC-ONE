'use client';

import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import {
  apiRequest,
  getToken,
  setToken,
  getStoredSession,
  setStoredSession,
  canAccess,
} from '../lib/api';

const AuthContext = createContext(null);

const PUBLIC_PATHS = ['/login'];

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  const refreshSession = useCallback(async () => {
    const token = getToken();
    if (!token) {
      setSession(null);
      setStoredSession(null);
      setLoading(false);
      return null;
    }

    try {
      const data = await apiRequest('/api/auth/me');
      const nextSession = { ...data, token };
      setSession(nextSession);
      setStoredSession(nextSession);
      return nextSession;
    } catch {
      setToken(null);
      setSession(null);
      setStoredSession(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const stored = getStoredSession();
    if (stored) setSession(stored);
    refreshSession();
  }, [refreshSession]);

  useEffect(() => {
    if (loading) return;

    const isPublic = PUBLIC_PATHS.includes(pathname);
    if (!session && !isPublic) {
      router.replace('/login');
    } else if (session && pathname === '/login') {
      router.replace('/');
    }
  }, [loading, session, pathname, router]);

  const login = async (email, password) => {
    const data = await apiRequest('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    setToken(data.token);
    const nextSession = {
      user: data.user,
      permissions: data.permissions,
      company: data.company,
      expiresAt: data.expiresAt,
      token: data.token,
    };
    setSession(nextSession);
    setStoredSession(nextSession);
    return nextSession;
  };

  const logout = async () => {
    try {
      await apiRequest('/api/auth/logout', { method: 'POST' });
    } catch {
      // ignore logout errors
    }
    setToken(null);
    setSession(null);
    setStoredSession(null);
    router.replace('/login');
  };

  const checkPermission = (key) => canAccess(session?.permissions, key);

  return (
    <AuthContext.Provider value={{ session, loading, login, logout, refreshSession, checkPermission }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export function RequirePermission({ permission, permissions, children, fallback = null }) {
  const { checkPermission, loading } = useAuth();
  if (loading) return null;
  const allowed = Array.isArray(permissions) && permissions.length
    ? permissions.some((key) => checkPermission(key))
    : checkPermission(permission);
  if (!allowed) return fallback;
  return children;
}
