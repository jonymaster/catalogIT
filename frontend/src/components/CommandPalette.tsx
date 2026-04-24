import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type SVGProps,
} from "react";
import { useNavigate } from "react-router-dom";
import client from "../api/client";
import { useAuth } from "../context/useAuth";
import type { Laptop, Service, User } from "../types/models";
import {
  MagnifyingGlassIcon,
  HomeIcon,
  ServerStackIcon,
  ComputerDesktopIcon,
  CalendarDaysIcon,
  BanknotesIcon,
  UsersIcon,
  Cog6ToothIcon,
  ClipboardDocumentListIcon,
  CornerDownLeftIcon,
} from "./Icons";

type IconComp = ComponentType<SVGProps<SVGSVGElement> & { className?: string }>;

interface NavItem {
  kind: "nav";
  id: string;
  label: string;
  hint: string;
  to: string;
  icon: IconComp;
}

interface ServiceItem {
  kind: "service";
  id: string;
  label: string;
  hint: string;
  to: string;
  icon: IconComp;
}

interface LaptopItem {
  kind: "laptop";
  id: string;
  label: string;
  hint: string;
  to: string;
  icon: IconComp;
}

interface UserItem {
  kind: "user";
  id: string;
  label: string;
  hint: string;
  to: string;
  icon: IconComp;
}

type Item = NavItem | ServiceItem | LaptopItem | UserItem;

function baseNav(canFinancialView: boolean, canHardwareView: boolean, isAdmin: boolean): NavItem[] {
  const items: NavItem[] = [
    { kind: "nav", id: "dashboard", label: "Dashboard", hint: "Overview", to: "/", icon: HomeIcon },
    { kind: "nav", id: "services", label: "Services", hint: "Inventory", to: "/services", icon: ServerStackIcon },
  ];
  if (canHardwareView) {
    items.push({ kind: "nav", id: "hardware", label: "Hardware", hint: "Inventory", to: "/hardware", icon: ComputerDesktopIcon });
  }
  items.push({ kind: "nav", id: "calendar", label: "Renewals", hint: "Planning", to: "/calendar", icon: CalendarDaysIcon });
  if (canFinancialView) {
    items.push({ kind: "nav", id: "costs", label: "Cost Report", hint: "Planning", to: "/costs", icon: BanknotesIcon });
  }
  if (isAdmin) {
    items.push(
      { kind: "nav", id: "users", label: "People", hint: "Admin", to: "/users", icon: UsersIcon },
      { kind: "nav", id: "settings", label: "Settings", hint: "Admin", to: "/settings", icon: Cog6ToothIcon },
      { kind: "nav", id: "audit", label: "Audit log", hint: "Admin", to: "/audit", icon: ClipboardDocumentListIcon },
    );
  }
  return items;
}

interface PaletteProps {
  onClose: () => void;
}

function PaletteBody({ onClose }: PaletteProps) {
  const navigate = useNavigate();
  const { user, canFinancialView, canHardwareView } = useAuth();
  const isAdmin = user?.role === "admin";

  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const [services, setServices] = useState<Service[]>([]);
  const [laptops, setLaptops] = useState<Laptop[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loaded, setLoaded] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    Promise.all([
      client.get<Service[]>("/api/services/").catch(() => ({ data: [] as Service[] })),
      canHardwareView
        ? client.get<Laptop[]>("/api/laptops/").catch(() => ({ data: [] as Laptop[] }))
        : Promise.resolve({ data: [] as Laptop[] }),
      isAdmin
        ? client
            .get<{ items: User[] }>("/api/users/", { params: { per_page: 100 } })
            .catch(() => ({ data: { items: [] as User[] } }))
        : Promise.resolve({ data: { items: [] as User[] } }),
    ]).then(([sRes, lRes, uRes]) => {
      const rawUsers = uRes.data as User[] | { items: User[] };
      const userList = Array.isArray(rawUsers) ? rawUsers : (rawUsers?.items ?? []);
      setServices(Array.isArray(sRes.data) ? sRes.data : []);
      setLaptops(Array.isArray(lRes.data) ? lRes.data : []);
      setUsers(userList);
      setLoaded(true);
    });
  }, [isAdmin, canHardwareView]);

  useEffect(() => {
    const id = window.setTimeout(() => inputRef.current?.focus(), 10);
    document.body.classList.add("noscroll");
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(id);
      document.body.classList.remove("noscroll");
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const all = useMemo<Item[]>(() => {
    const nav = baseNav(canFinancialView, canHardwareView, isAdmin);
    const s: ServiceItem[] = services.slice(0, 120).map((svc) => ({
      kind: "service",
      id: svc.id,
      label: svc.name,
      hint: svc.vendor?.name ?? svc.category_rel?.name ?? "Service",
      to: `/services/${svc.id}`,
      icon: ServerStackIcon,
    }));
    const l: LaptopItem[] = laptops.slice(0, 80).map((lp) => ({
      kind: "laptop",
      id: lp.id,
      label: `${lp.model_name} · ${(lp.serial_number ?? "").slice(-6)}`,
      hint: lp.assigned_to
        ? `${lp.assigned_to.first_name} ${lp.assigned_to.last_name}`
        : "Unassigned",
      to: `/hardware/${lp.id}`,
      icon: ComputerDesktopIcon,
    }));
    const u: UserItem[] = users.slice(0, 100).map((usr) => ({
      kind: "user",
      id: usr.id,
      label:
        usr.display_name ??
        (`${usr.first_name} ${usr.last_name}`.trim() || usr.email),
      hint: usr.department ?? usr.email,
      to: `/users/${usr.id}`,
      icon: UsersIcon,
    }));
    return [...nav, ...s, ...l, ...u];
  }, [services, laptops, users, canFinancialView, canHardwareView, isAdmin]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return all.slice(0, 14);
    return all
      .filter((it) => {
        const label = String(it.label ?? "");
        const hint = String(it.hint ?? "");
        return label.toLowerCase().includes(q) || hint.toLowerCase().includes(q);
      })
      .slice(0, 18);
  }, [query, all]);

  // Clamp the selected index to the current results without a separate effect.
  const activeIndex = filtered.length === 0 ? 0 : Math.min(selected, filtered.length - 1);

  const jump = (it: Item) => {
    navigate(it.to);
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={(e) => e.stopPropagation()}
      className="rounded-[10px] border border-border bg-surface shadow-[0_1px_0_rgba(16,14,10,.03),0_8px_24px_-12px_rgba(16,14,10,.12)] animate-pop-in"
      style={{ width: 580, maxWidth: "calc(100vw - 32px)" }}
    >
      <div className="flex items-center gap-2.5 px-3.5 py-3 border-b border-border">
        <MagnifyingGlassIcon className="h-4 w-4 text-fg-3" />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSelected(0);
          }}
          placeholder="Jump to a service, laptop, person, or page…"
          className="flex-1 bg-transparent text-sm text-fg placeholder:text-fg-4 outline-none"
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setSelected((i) => Math.min(i + 1, filtered.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setSelected((i) => Math.max(i - 1, 0));
            } else if (e.key === "Enter" && filtered[activeIndex]) {
              e.preventDefault();
              jump(filtered[activeIndex]);
            }
          }}
        />
        <span className="kbd">ESC</span>
      </div>
      <div className="p-1.5 max-h-[360px] overflow-auto">
        {filtered.length === 0 ? (
          <div className="px-3 py-6 text-center text-sm text-fg-3">
            No matches{loaded ? "" : " — loading…"}
          </div>
        ) : (
          filtered.map((it, i) => {
            const Icon = it.icon;
            const isActive = i === activeIndex;
            return (
              <button
                key={`${it.kind}:${it.id}`}
                type="button"
                onClick={() => jump(it)}
                onMouseEnter={() => setSelected(i)}
                className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm ${
                  isActive ? "bg-surface-2" : "bg-transparent"
                }`}
              >
                <Icon className="h-4 w-4 text-fg-3" />
                <span className="flex-1 truncate text-fg">{it.label}</span>
                <span className="truncate text-[11.5px] text-fg-4 max-w-[160px]">
                  {it.hint}
                </span>
                <span className="text-[10.5px] uppercase tracking-wider text-fg-4">
                  {it.kind}
                </span>
              </button>
            );
          })
        )}
      </div>
      <div className="flex items-center gap-3.5 border-t border-border bg-surface-2 px-3.5 py-2 text-[11px] text-fg-3">
        <span className="flex items-center gap-1.5">
          <CornerDownLeftIcon className="h-3.5 w-3.5" />
          <span>open</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="kbd">↑</span>
          <span className="kbd">↓</span>
          <span>navigate</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="kbd">ESC</span>
          <span>close</span>
        </span>
      </div>
    </div>
  );
}

interface Props {
  open: boolean;
  onClose: () => void;
}

export function CommandPalette({ open, onClose }: Props) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center animate-fade-in"
      style={{
        background: "rgba(12,10,8,.38)",
        backdropFilter: "blur(2px)",
        paddingTop: "14vh",
      }}
      onClick={onClose}
    >
      <PaletteBody onClose={onClose} />
    </div>
  );
}
