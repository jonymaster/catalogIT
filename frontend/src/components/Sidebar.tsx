import { NavLink } from "react-router-dom";
import { useAuth } from "../context/useAuth";
import { useSidebar } from "../context/SidebarContext";
import { BrandMark } from "./BrandMark";
import {
  HomeIcon,
  ServerStackIcon,
  ComputerDesktopIcon,
  CalendarDaysIcon,
  BanknotesIcon,
  UsersIcon,
  Cog6ToothIcon,
  ClipboardDocumentListIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ArrowRightStartOnRectangleIcon,
  UserCircleIcon,
} from "./Icons";
import type { ComponentType, SVGProps } from "react";

interface NavItem {
  name: string;
  to: string;
  icon: ComponentType<SVGProps<SVGSVGElement> & { className?: string }>;
  end?: boolean;
}

const mainNav: NavItem[] = [
  { name: "Dashboard", to: "/", icon: HomeIcon, end: true },
];

const inventoryNav: NavItem[] = [
  { name: "Services", to: "/services", icon: ServerStackIcon },
  { name: "Hardware", to: "/hardware", icon: ComputerDesktopIcon },
];

const planningNav: NavItem[] = [
  { name: "Renewal Calendar", to: "/calendar", icon: CalendarDaysIcon },
];

const adminNav: NavItem[] = [
  { name: "Users", to: "/users", icon: UsersIcon },
  { name: "Settings", to: "/settings", icon: Cog6ToothIcon },
  { name: "Audit logs", to: "/audit", icon: ClipboardDocumentListIcon },
];

function SidebarLink({ item, collapsed }: { item: NavItem; collapsed: boolean }) {
  return (
    <NavLink
      to={item.to}
      end={item.end}
      className={({ isActive }) =>
        `group relative flex items-center rounded-lg text-sm font-medium transition-all duration-150 ${
          collapsed ? "justify-center px-2 py-2.5" : "gap-3 px-3 py-2"
        } ${
          isActive
            ? "bg-sidebar-bg-active text-sidebar-text-active"
            : "text-sidebar-text hover:bg-sidebar-bg-hover hover:text-sidebar-text-active"
        }`
      }
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-sidebar-accent" />
          )}
          <item.icon className="h-5 w-5 shrink-0" />
          {!collapsed && <span className="truncate">{item.name}</span>}
          {collapsed && (
            <span className="pointer-events-none absolute left-full z-40 ml-3 whitespace-nowrap rounded-md border border-sidebar-border bg-sidebar-bg-active px-2.5 py-1.5 text-xs font-medium text-sidebar-text-active opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
              {item.name}
            </span>
          )}
        </>
      )}
    </NavLink>
  );
}

function NavSection({ items, collapsed }: { items: NavItem[]; collapsed: boolean }) {
  return (
    <div className="space-y-0.5">
      {items.map((item) => (
        <SidebarLink key={item.to} item={item} collapsed={collapsed} />
      ))}
    </div>
  );
}

function Divider() {
  return <div className="my-3 h-px bg-sidebar-border" />;
}

export function Sidebar() {
  const { user, logout, canFinancialView } = useAuth();
  const { collapsed, toggle } = useSidebar();
  const isAdmin = user?.role === "admin";
  const initial = user?.email?.charAt(0).toUpperCase() ?? "?";

  return (
    <aside
      className="fixed left-0 top-0 z-30 flex h-screen flex-col bg-sidebar-bg"
      style={{
        width: collapsed ? "var(--sidebar-collapsed)" : "var(--sidebar-expanded)",
        transition: "width 250ms var(--ease-out-expo)",
      }}
    >
      {/* Brand */}
      <div className={`flex items-center border-b border-sidebar-border ${collapsed ? "justify-center px-3 py-4" : "px-5 py-4"}`}>
        <BrandMark collapsed={collapsed} />
      </div>

      {/* Navigation */}
      <nav className={`flex-1 overflow-y-auto overflow-x-hidden py-4 ${collapsed ? "px-2" : "px-3"}`}>
        <NavSection items={mainNav} collapsed={collapsed} />
        <Divider />
        <NavSection items={inventoryNav} collapsed={collapsed} />
        <Divider />
        <NavSection items={planningNav} collapsed={collapsed} />

        {canFinancialView && (
          <>
            <Divider />
            <NavSection
              items={[{ name: "Costs", to: "/costs", icon: BanknotesIcon }]}
              collapsed={collapsed}
            />
          </>
        )}

        {isAdmin && (
          <>
            <Divider />
            {!collapsed && (
              <p className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-widest text-sidebar-text/50">
                Admin
              </p>
            )}
            <NavSection items={adminNav} collapsed={collapsed} />
          </>
        )}
      </nav>

      {/* Collapse toggle: circular, vertically centered on the sidebar */}
      <button
        type="button"
        onClick={toggle}
        title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        aria-expanded={!collapsed}
        className="absolute right-0 top-1/2 z-40 flex h-9 w-9 -translate-y-1/2 translate-x-1/2 items-center justify-center rounded-full border border-sidebar-border bg-sidebar-bg text-sidebar-text shadow-md transition-colors hover:bg-sidebar-bg-hover hover:text-sidebar-text-active"
      >
        {collapsed ? <ChevronRightIcon className="h-4 w-4" /> : <ChevronLeftIcon className="h-4 w-4" />}
      </button>

      {/* Footer */}
      <div className={`border-t border-sidebar-border ${collapsed ? "px-2 py-3" : "px-3 py-3"}`}>
        {user && (
          <div className={`mb-2 ${collapsed ? "flex justify-center" : ""}`}>
            {collapsed ? (
              <NavLink
                to="/me/settings"
                className="flex h-8 w-8 items-center justify-center rounded-full bg-sidebar-accent/20 text-xs font-semibold text-sidebar-accent transition-colors hover:bg-sidebar-accent/30"
                title={user.email}
              >
                {initial}
              </NavLink>
            ) : (
              <>
                <div className="mb-2 flex items-center gap-2.5">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-sidebar-accent/20 text-xs font-semibold text-sidebar-accent">
                    {initial}
                  </span>
                  <span className="truncate text-sm text-sidebar-text">{user.email}</span>
                </div>
                <NavLink
                  to="/me/settings"
                  className={({ isActive }) =>
                    `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-150 ${
                      isActive
                        ? "bg-sidebar-bg-active text-sidebar-text-active"
                        : "text-sidebar-text hover:bg-sidebar-bg-hover hover:text-sidebar-text-active"
                    }`
                  }
                >
                  <UserCircleIcon className="h-5 w-5 shrink-0" />
                  <span>Personal Settings</span>
                </NavLink>
              </>
            )}
          </div>
        )}
        <button
          onClick={logout}
          className={`flex w-full items-center rounded-lg text-sm font-medium text-sidebar-text transition-all duration-150 hover:bg-sidebar-bg-hover hover:text-sidebar-text-active ${
            collapsed ? "justify-center px-2 py-2.5" : "gap-3 px-3 py-2"
          }`}
          title="Log out"
        >
          <ArrowRightStartOnRectangleIcon className="h-5 w-5 shrink-0" />
          {!collapsed && <span>Log out</span>}
        </button>
      </div>
    </aside>
  );
}
