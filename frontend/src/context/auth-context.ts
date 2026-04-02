import { createContext } from "react";

export interface UserInfo {
  sub: string;
  email: string;
  role: string;
}

export interface AuthContextValue {
  token: string | null;
  user: UserInfo | null;
  canEdit: boolean;
  login: () => void;
  logout: () => void;
  setToken: (token: string) => void;
}

export const ROLE_HIERARCHY: Record<string, number> = {
  viewer: 0,
  editor: 1,
  admin: 2,
};

export const AuthContext = createContext<AuthContextValue | null>(null);

export function decodePayload(token: string): UserInfo | null {
  try {
    const base64 = token.split(".")[1];
    const json = atob(base64.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(json) as UserInfo;
  } catch {
    return null;
  }
}
