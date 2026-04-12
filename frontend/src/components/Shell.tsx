import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { SidebarProvider, useSidebar } from "../context/SidebarContext";

function ShellInner() {
  const { collapsed } = useSidebar();

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <Sidebar />
      <main
        className="min-h-screen overflow-auto p-8"
        style={{
          marginLeft: collapsed ? "var(--sidebar-collapsed)" : "var(--sidebar-expanded)",
          transition: "margin-left 250ms var(--ease-out-expo)",
        }}
      >
        <Outlet />
      </main>
    </div>
  );
}

export function Shell() {
  return (
    <SidebarProvider>
      <ShellInner />
    </SidebarProvider>
  );
}
