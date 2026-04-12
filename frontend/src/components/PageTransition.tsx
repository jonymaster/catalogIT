import type { ReactNode } from "react";

export function PageTransition({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`animate-fade-in-up ${className}`}>{children}</div>;
}
