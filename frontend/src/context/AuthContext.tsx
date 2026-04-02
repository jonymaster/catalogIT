import { useState, useEffect, useCallback, type ReactNode } from "react";
import {
  AuthContext,
  ROLE_HIERARCHY,
  decodePayload,
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

  const setToken = useCallback((newToken: string) => {
    localStorage.setItem("catalogit_token", newToken);
    setTokenState(newToken);
    setUser(decodePayload(newToken));
  }, []);

  const login = useCallback(() => {
    window.location.href = "/auth/oidc/login";
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem("catalogit_token");
    setTokenState(null);
    setUser(null);
  }, []);

  // Capture token from OIDC callback redirect
  useEffect(() => {
    const callbackToken = new URLSearchParams(window.location.search).get("token");
    if (callbackToken) {
      window.history.replaceState({}, "", "/");
    }
  }, []);

  const canEdit =
    !!user?.role && (ROLE_HIERARCHY[user.role] ?? 0) >= ROLE_HIERARCHY.editor;

  return (
    <AuthContext.Provider value={{ token, user, canEdit, login, logout, setToken }}>
      {children}
    </AuthContext.Provider>
  );
}
