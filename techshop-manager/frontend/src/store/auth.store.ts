import { create } from 'zustand';
import type { AuthUser, Role } from '@/types';
import { hasMinimumRole } from '@/lib/roles';

interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  hasLoggedOut: boolean;
  sessionVersion: number;
  isLoading: boolean;
  loginAttempts: number;
  lockedUntil: Date | null;
  isOfflineMode: boolean;
  lastSyncAt: Date | null;

  setAuth: (user: AuthUser, accessToken: string) => void;
  setAccessToken: (token: string) => void;
  logout: () => void;
  hasRole: (minRole: Role) => boolean;
  setLoading: (loading: boolean) => void;
  incrementAttempts: () => void;
  resetAttempts: () => void;
  setLockedUntil: (date: Date | null) => void;
  setOfflineMode: (offline: boolean) => void;
  setLastSyncAt: (date: Date) => void;
}

// ── LocalStorage helpers ──────────────────────────────────────────────────────
const STORAGE_KEY = 'ebn_auth_v1';

interface StoredAuth {
  user: AuthUser;
  accessToken: string;
}

function saveToStorage(user: AuthUser, accessToken: string) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ user, accessToken } as StoredAuth));
  } catch {
    // storage quota exceeded or private mode — ignore
  }
}

function clearStorage() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

function loadFromStorage(): StoredAuth | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as StoredAuth;
  } catch {
    return null;
  }
}

// Hydrate initial state from localStorage on first load (survives F5 / Ctrl+R)
const stored = loadFromStorage();

export const useAuthStore = create<AuthState>()((set, get) => ({
  // Restore persisted session if available
  user: stored?.user ?? null,
  accessToken: stored?.accessToken ?? null,
  isAuthenticated: !!stored?.accessToken,
  hasLoggedOut: false,
  sessionVersion: 0,
  isLoading: false,
  loginAttempts: 0,
  lockedUntil: null,
  isOfflineMode: false,
  lastSyncAt: null,

  setAuth: (user, accessToken) => {
    const current = get();
    const sameSession = current.isAuthenticated && current.user?.id === user.id && current.accessToken === accessToken;
    saveToStorage(user, accessToken);
    set({
      user, accessToken, isAuthenticated: true, hasLoggedOut: false,
      sessionVersion: sameSession ? current.sessionVersion : current.sessionVersion + 1,
      loginAttempts: 0, lockedUntil: null,
    });
  },

  setAccessToken: (accessToken) => {
    const user = get().user;
    if (user) saveToStorage(user, accessToken);
    set({ accessToken });
  },

  logout: () => {
    clearStorage();
    set(current => ({
      user: null, accessToken: null, isAuthenticated: false, hasLoggedOut: true,
      sessionVersion: current.sessionVersion + 1,
    }));
  },

  hasRole: (minRole) => {
    const user = get().user;
    if (!user) return false;
    return hasMinimumRole(user.role, minRole);
  },

  setLoading: (isLoading) => set({ isLoading }),
  incrementAttempts: () => set((s) => ({ loginAttempts: s.loginAttempts + 1 })),
  resetAttempts: () => set({ loginAttempts: 0, lockedUntil: null }),
  setLockedUntil: (lockedUntil) => set({ lockedUntil }),
  setOfflineMode: (isOfflineMode) => set({ isOfflineMode }),
  setLastSyncAt: (lastSyncAt) => set({ lastSyncAt }),
}));
