import { useState, useEffect, useCallback, type ReactNode } from "react";
import client from "../api/client";
import type { UserPreferences } from "../types/models";
import {
  AuthContext,
  ROLE_HIERARCHY,
  decodePayload,
  userHasFinancialView,
  type UserInfo,
} from "./auth-context";

function getInitialToken() {
  const callbackToken = new URLSearchParams(window.location.search).get("token");
  if (callbackToken) {
    localStorage.setItem("catalogit_token", callbackToken);
    return callbackToken;
  }

  return localStorage.getItem("catalogit_token");
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setTokenState] = useState<string | null>(getInitialToken);
  const [user, setUser] = useState<UserInfo | null>(() => {
    const saved = getInitialToken();
    return saved ? decodePayload(saved) : null;
  });
  const [preferences, setPreferencesState] = useState<UserPreferences | null>(null);
  const [preferencesLoading, setPreferencesLoading] = useState(() =>
    Boolean(getInitialToken()),
  );

  const setPreferences = useCallback((nextPreferences: UserPreferences | null) => {
    setPreferencesState(nextPreferences);
  }, []);

  const setToken = useCallback((newToken: string) => {
    localStorage.setItem("catalogit_token", newToken);
    setTokenState(newToken);
    setUser(decodePayload(newToken));
    setPreferencesState(null);
    setPreferencesLoading(true);
  }, []);

  const login = useCallback(() => {
    window.location.href = "/auth/oidc/login";
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem("catalogit_token");
    setTokenState(null);
    setUser(null);
    setPreferencesState(null);
    setPreferencesLoading(false);
  }, []);

  const refreshPreferences = useCallback(async () => {
    const savedToken = localStorage.getItem("catalogit_token");
    if (!savedToken) {
      setPreferencesState(null);
      return;
    }

    setPreferencesLoading(true);
    try {
      const response = await client.get<UserPreferences>("/api/me/preferences");
      setPreferencesState(response.data);
    } catch {
      setPreferencesState(null);
    } finally {
      setPreferencesLoading(false);
    }
  }, []);

  // Capture token from OIDC callback redirect
  useEffect(() => {
    const callbackToken = new URLSearchParams(window.location.search).get("token");
    if (callbackToken) {
      window.history.replaceState({}, "", "/");
    }
  }, []);

  useEffect(() => {
    if (!token) {
      setPreferencesState(null);
      setPreferencesLoading(false);
      return;
    }

    void refreshPreferences();
  }, [token, refreshPreferences]);

  const canEdit =
    !!user?.role && (ROLE_HIERARCHY[user.role] ?? 0) >= ROLE_HIERARCHY.editor;

  const canFinancialView = userHasFinancialView(user);

  return (
    <AuthContext.Provider
      value={{
        token,
        user,
        preferences,
        preferencesLoading,
        canEdit,
        canFinancialView,
        login,
        logout,
        setToken,
        refreshPreferences,
        setPreferences,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
