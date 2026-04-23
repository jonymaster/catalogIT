import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { CommandPaletteProvider } from "../context/CommandPaletteContext";
import { SidebarProvider, useSidebar } from "../context/SidebarContext";

function ShellInner() {
  const { collapsed } = useSidebar();

  return (
    <div className="min-h-screen bg-bg text-fg">
      <Sidebar />
      <div
        className="min-h-screen flex flex-col"
        style={{
          marginLeft: collapsed ? "var(--sidebar-collapsed)" : "var(--sidebar-expanded)",
          transition: "margin-left 220ms cubic-bezier(.2,.8,.2,1)",
        }}
      >
        <TopBar />
        <main className="flex-1 overflow-auto px-7 pt-6 pb-12">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export function Shell() {
  return (
    <SidebarProvider>
      <CommandPaletteProvider>
        <ShellInner />
      </CommandPaletteProvider>
    </SidebarProvider>
  );
}
