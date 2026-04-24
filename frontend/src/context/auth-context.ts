import { createContext } from "react";
import { PERMISSION_FINANCIAL_VIEW, PERMISSION_HARDWARE_VIEW } from "../constants/permissions";
import type { UserPreferences } from "../types/models";

export interface UserInfo {
  sub: string;
  email: string;
  role: string;
  /** From JWT; when true, user must complete /reset-password before using the app. */
  must_reset_password?: boolean;
  /** Global permission slugs (e.g. financial_view). Admins do not rely on this list. */
  permissions?: string[];
}

export interface AuthContextValue {
  token: string | null;
  user: UserInfo | null;
  preferences: UserPreferences | null;
  preferencesLoading: boolean;
  canEdit: boolean;
  /** Dashboard aggregate / IT Financial Report (/costs). Admins always true. */
  canFinancialView: boolean;
  /** Hardware inventory + hardware reference data. Admins always true. */
  canHardwareView: boolean;
  login: () => void;
  logout: () => void;
  setToken: (token: string) => void;
  refreshPreferences: () => Promise<void>;
  setPreferences: (preferences: UserPreferences | null) => void;
}

export const ROLE_HIERARCHY: Record<string, number> = {
  viewer: 0,
  editor: 1,
  admin: 2,
};

export const AuthContext = createContext<AuthContextValue | null>(null);

export function userHasFinancialView(user: UserInfo | null): boolean {
  if (!user?.role) return false;
  if (user.role === "admin") return true;
  return user.permissions?.includes(PERMISSION_FINANCIAL_VIEW) ?? false;
}

export function userHasHardwareView(user: UserInfo | null): boolean {
  if (!user?.role) return false;
  if (user.role === "admin") return true;
  return user.permissions?.includes(PERMISSION_HARDWARE_VIEW) ?? false;
}

export function decodePayload(token: string): UserInfo | null {
  try {
    const base64 = token.split(".")[1];
    const json = atob(base64.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(json) as UserInfo;
  } catch {
    return null;
  }
}
