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

interface NavSection {
  label: string;
  items: NavItem[];
}

function SidebarLink({ item, collapsed }: { item: NavItem; collapsed: boolean }) {
  return (
    <NavLink
      to={item.to}
      end={item.end}
      title={collapsed ? item.name : undefined}
      className={({ isActive }) =>
        [
          "group relative flex items-center rounded-md text-[13.5px] font-medium transition-colors duration-150 whitespace-nowrap",
          collapsed ? "justify-center px-2 py-2" : "gap-2.5 px-2.5 py-1.5",
          isActive
            ? "bg-surface-3 text-fg"
            : "text-fg-3 hover:bg-surface-2 hover:text-fg-2",
        ].join(" ")
      }
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <span
              className="absolute top-1/2 -translate-y-1/2 rounded-full bg-accent"
              style={{
                width: 3,
                height: 16,
                left: collapsed ? 4 : -6,
              }}
            />
          )}
          <item.icon className="h-[17px] w-[17px] shrink-0" />
          {!collapsed && <span className="truncate">{item.name}</span>}
        </>
      )}
    </NavLink>
  );
}

function SectionHeader({ label, collapsed }: { label: string; collapsed: boolean }) {
  if (collapsed) return null;
  return (
    <div
      className="px-2.5 pb-1 pt-2 text-[10.5px] font-semibold uppercase text-fg-4"
      style={{ letterSpacing: "0.1em" }}
    >
      {label}
    </div>
  );
}

export function Sidebar() {
  const { user, logout, canFinancialView } = useAuth();
  const { collapsed, toggle } = useSidebar();
  const isAdmin = user?.role === "admin";
  const initial = user?.email?.charAt(0).toUpperCase() ?? "?";

  const sections: NavSection[] = [
    {
      label: "",
      items: [{ name: "Dashboard", to: "/", icon: HomeIcon, end: true }],
    },
    {
      label: "Inventory",
      items: [
        { name: "Services", to: "/services", icon: ServerStackIcon },
        { name: "Hardware", to: "/hardware", icon: ComputerDesktopIcon },
      ],
    },
    {
      label: "Planning",
      items: [
        { name: "Renewals", to: "/calendar", icon: CalendarDaysIcon },
        ...(canFinancialView
          ? [{ name: "Cost Report", to: "/costs", icon: BanknotesIcon }]
          : []),
      ],
    },
  ];

  if (isAdmin) {
    sections.push({
      label: "Admin",
      items: [
        { name: "People", to: "/users", icon: UsersIcon },
        { name: "Settings", to: "/settings", icon: Cog6ToothIcon },
        { name: "Audit log", to: "/audit", icon: ClipboardDocumentListIcon },
      ],
    });
  }

  return (
    <aside
      className="fixed left-0 top-0 z-40 flex h-screen flex-col border-r border-border bg-surface"
      style={{
        width: collapsed ? "var(--sidebar-collapsed)" : "var(--sidebar-expanded)",
        transition: "width 220ms cubic-bezier(.2,.8,.2,1)",
      }}
    >
      {/* Brand */}
      <div
        className="flex items-center border-b border-border"
        style={{
          padding: collapsed ? "14px 10px" : "14px 14px",
          minHeight: 52,
          justifyContent: collapsed ? "center" : "flex-start",
        }}
      >
        <BrandMark collapsed={collapsed} className="gap-0 [&_img]:max-h-9" />
      </div>

      {/* Navigation */}
      <nav
        className="flex-1 overflow-y-auto overflow-x-hidden"
        style={{ padding: collapsed ? "10px 6px" : "10px 10px" }}
      >
        {sections.map((sec, idx) => (
          <div key={sec.label || idx} className="mb-3.5">
            {sec.label && <SectionHeader label={sec.label} collapsed={collapsed} />}
            <div className="space-y-0.5">
              {sec.items.map((item) => (
                <SidebarLink key={item.to} item={item} collapsed={collapsed} />
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div
        className="border-t border-border"
        style={{ padding: collapsed ? "10px 6px" : "10px" }}
      >
        {user && (
          <div className={`mb-2 flex items-center gap-2 ${collapsed ? "justify-center" : ""}`}>
            {collapsed ? (
              <NavLink
                to="/me/settings"
                title={user.email}
                className="flex h-7 w-7 items-center justify-center rounded-full border border-border bg-surface-2 text-xs font-semibold text-fg-2 transition-colors hover:bg-surface-3"
              >
                {initial}
              </NavLink>
            ) : (
              <>
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border bg-surface-2 text-xs font-semibold text-fg-2">
                  {initial}
                </span>
                <div className="min-w-0 flex-1">
                  <div
                    className="truncate text-[12.5px] font-medium text-fg"
                    title={user.email}
                  >
                    {user.email}
                  </div>
                  <div className="text-[11px] text-fg-3">
                    {isAdmin ? "Admin" : "Member"} · CatalogIT
                  </div>
                </div>
                <button
                  type="button"
                  onClick={toggle}
                  title="Collapse sidebar"
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md text-fg-3 hover:bg-surface-2 hover:text-fg-2"
                >
                  <ChevronLeftIcon className="h-4 w-4" />
                </button>
              </>
            )}
          </div>
        )}

        {collapsed && (
          <button
            type="button"
            onClick={toggle}
            title="Expand sidebar"
            className="mb-1 inline-flex h-8 w-full items-center justify-center rounded-md text-fg-3 hover:bg-surface-2 hover:text-fg-2"
          >
            <ChevronRightIcon className="h-4 w-4" />
          </button>
        )}

        {!collapsed && (
          <NavLink
            to="/me/settings"
            className={({ isActive }) =>
              `mb-0.5 flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] font-medium transition-colors ${
                isActive
                  ? "bg-surface-3 text-fg"
                  : "text-fg-3 hover:bg-surface-2 hover:text-fg-2"
              }`
            }
          >
            <UserCircleIcon className="h-[17px] w-[17px] shrink-0" />
            <span>Personal settings</span>
          </NavLink>
        )}

        <button
          onClick={logout}
          title="Log out"
          className={[
            "flex w-full items-center rounded-md text-[13px] font-medium text-fg-3 hover:bg-surface-2 hover:text-fg-2 transition-colors",
            collapsed ? "justify-center px-2 py-2" : "gap-2.5 px-2.5 py-1.5",
          ].join(" ")}
        >
          <ArrowRightStartOnRectangleIcon className="h-[17px] w-[17px] shrink-0" />
          {!collapsed && <span>Log out</span>}
        </button>
      </div>
    </aside>
  );
}
