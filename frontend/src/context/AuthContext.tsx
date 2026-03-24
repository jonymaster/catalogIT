import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";

interface UserInfo {
  sub: string;
  email: string;
  role: string;
}

interface AuthContextValue {
  token: string | null;
  user: UserInfo | null;
  login: () => void;
  logout: () => void;
  setToken: (token: string) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function decodePayload(token: string): UserInfo | null {
  try {
    const base64 = token.split(".")[1];
    const json = atob(base64.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(json) as UserInfo;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setTokenState] = useState<string | null>(() =>
    localStorage.getItem("catalogit_token"),
  );
  const [user, setUser] = useState<UserInfo | null>(() => {
    const saved = localStorage.getItem("catalogit_token");
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
    const params = new URLSearchParams(window.location.search);
    const callbackToken = params.get("token");
    if (callbackToken) {
      setToken(callbackToken);
      window.history.replaceState({}, "", "/");
    }
  }, [setToken]);

  return (
    <AuthContext.Provider value={{ token, user, login, logout, setToken }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
