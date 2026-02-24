"use client";

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import * as api from "@/lib/api";

interface AuthState {
  isLoading: boolean;
  needsSetup: boolean;
  isAuthenticated: boolean;
  legacyMode: boolean;
  apiUnreachable: boolean;
}

interface AuthContextValue extends AuthState {
  refreshAuth: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    isLoading: true,
    needsSetup: false,
    isAuthenticated: false,
    legacyMode: false,
    apiUnreachable: false,
  });

  const refreshAuth = useCallback(async () => {
    try {
      const status = await api.getAuthStatus();

      // Legacy mode: env var handles auth, treat as authenticated
      if (status.legacy_mode) {
        setState({ isLoading: false, needsSetup: false, isAuthenticated: true, legacyMode: true, apiUnreachable: false });
        return;
      }

      // First-run: no admin account yet
      if (status.needs_setup) {
        setState({ isLoading: false, needsSetup: true, isAuthenticated: false, legacyMode: false, apiUnreachable: false });
        return;
      }

      // Admin exists — check if we have a valid session token
      const token = api.getToken();
      if (!token) {
        setState({ isLoading: false, needsSetup: false, isAuthenticated: false, legacyMode: false, apiUnreachable: false });
        return;
      }

      // Validate token by hitting a protected endpoint
      try {
        await api.getStats();
        setState({ isLoading: false, needsSetup: false, isAuthenticated: true, legacyMode: false, apiUnreachable: false });
      } catch {
        // Token invalid or expired
        api.clearToken();
        setState({ isLoading: false, needsSetup: false, isAuthenticated: false, legacyMode: false, apiUnreachable: false });
      }
    } catch {
      // API unreachable — signal it so the UI can show a message
      setState({ isLoading: false, needsSetup: false, isAuthenticated: false, legacyMode: false, apiUnreachable: true });
    }
  }, []);

  useEffect(() => {
    refreshAuth();
  }, [refreshAuth]);

  return (
    <AuthContext.Provider value={{ ...state, refreshAuth }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
