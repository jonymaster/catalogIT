import { createContext, useContext } from "react";

export interface SidebarState {
  collapsed: boolean;
  toggle: () => void;
}

export const SidebarContext = createContext<SidebarState | null>(null);

export function useSidebar() {
  const ctx = useContext(SidebarContext);
  if (!ctx) throw new Error("useSidebar must be used within SidebarProvider");
  return ctx;
}
