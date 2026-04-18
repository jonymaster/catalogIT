import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import client from "../api/client";
import { PageTransition } from "../components/PageTransition";
import {
  ArrowDownTrayIcon,
  PlusIcon,
} from "../components/Icons";
import {
  BooleanYesNoBadge,
  ClassificationBadge,
  ColoredReferenceBadge,
  CriticalityBadge,
} from "../components/Badge";
import {
  ColumnHeaderMenu,
  type SortDirection,
} from "../components/ColumnHeaderMenu";
import { ColumnSelector } from "../components/ColumnSelector";
import type { Column } from "../components/DataTable";
import { DataTable } from "../components/DataTable";
import { SearchInput } from "../components/SearchInput";
import { StatusBadge } from "../components/StatusBadge";
import { Monogram } from "../components/ui/Monogram";
import { Avatar, AvatarStack } from "../components/ui/Avatar";
import { Days } from "../components/ui/Days";
import { Money } from "../components/ui/Money";
import { SegmentedControl } from "../components/ui/SegmentedControl";
import { formatMoneyFull } from "../components/ui/money-format";
import { useAuth } from "../context/useAuth";
import { useColumnPrefs } from "../hooks/useColumnPrefs";
import { formatBillingSchedule } from "../service/serviceBilling";
import type { Service, User, UserPreferences } from "../types/models";
import { buildCsv, downloadCsvFile } from "../utils/csv";
import { formatDateOnly } from "../utils/formatting";

type FilterType = "text" | "select";

interface ServiceColumnDefinition {
  key: string;
  label: string;
  filterType: FilterType;
  filterPlaceholder?: string;
  getFilterValue: (service: Service) => string;
  getSortValue: (service: Service) => string | number | boolean | null;
  getFilterOptions?: (services: Service[]) => string[];
  render?: (service: Service) => React.ReactNode;
}

type ServiceFilters = Record<string, string | string[]>;
type ViewMode = "table" | "gallery";

interface SortState {
  key: string | null;
  direction: SortDirection | null;
}

interface HoveredDescriptionState {
  text: string;
  left: number;
  top: number;
}

interface FacetOption {
  value: string;
  label: string;
}

const VIEW_STORAGE_KEY = "catalogit:services:view";

function loadViewPref(): ViewMode {
  try {
    const stored = localStorage.getItem(VIEW_STORAGE_KEY);
    if (stored === "table" || stored === "gallery") return stored;
  } catch {
    /* ignore */
  }
  return "table";
}

function getOwnerNames(service: Service) {
  return service.owners.map((owner) => `${owner.first_name} ${owner.last_name}`).join(", ");
}

function getOwnerDisplayName(user: Pick<User, "first_name" | "last_name" | "display_name" | "email">) {
  const full = `${user.first_name ?? ""} ${user.last_name ?? ""}`.trim();
  if (full) return full;
  return user.display_name ?? user.email;
}

function getBooleanLabel(value: boolean) {
  return value ? "Yes" : "No";
}

function getScimLabel(service: Service) {
  return service.scim_enabled == null ? "--" : getBooleanLabel(service.scim_enabled);
}

function getServiceSortValue(
  value: string | number | boolean | null,
): string | number {
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "boolean") {
    return value ? 1 : 0;
  }
  return (value ?? "").toString().toLowerCase();
}

function compareServiceValues(
  left: string | number,
  right: string | number,
): number {
  if (typeof left === "number" && typeof right === "number") {
    return left - right;
  }

  return String(left).localeCompare(String(right), undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

function getUniqueOptions(values: string[]) {
  return Array.from(
    new Set(values.map((value) => value.trim()).filter(Boolean)),
  ).sort((left, right) =>
    left.localeCompare(right, undefined, { sensitivity: "base" }),
  );
}

function categoryLabel(service: Service): string {
  return service.category_rel?.name ?? "";
}

function costCenterLabel(service: Service): string {
  return service.cost_center?.name ?? "";
}

function getServiceStatusLabel(service: Service): string {
  return service.service_status?.name ?? service.status;
}

const columnDefinitions: ServiceColumnDefinition[] = [
  {
    key: "name",
    label: "Name",
    filterType: "text",
    filterPlaceholder: "Filter by name...",
    getFilterValue: (service) => service.name,
    getSortValue: (service) => service.name,
  },
  {
    key: "status",
    label: "Status",
    filterType: "select",
    getFilterValue: (service) => getServiceStatusLabel(service),
    getSortValue: (service) => getServiceStatusLabel(service),
    getFilterOptions: (services) =>
      getUniqueOptions(services.map((service) => getServiceStatusLabel(service))),
    render: (service) =>
      service.service_status ? (
        <ColoredReferenceBadge
          label={service.service_status.name}
          color={service.service_status.color}
        />
      ) : (
        <StatusBadge status={getServiceStatusLabel(service)} />
      ),
  },
  {
    key: "spending_category",
    label: "Spending Category",
    filterType: "select",
    getFilterValue: (service) => categoryLabel(service),
    getSortValue: (service) => categoryLabel(service),
    getFilterOptions: (services) =>
      getUniqueOptions(services.map((service) => categoryLabel(service))),
    render: (service) =>
      service.category_rel ? (
        <ColoredReferenceBadge
          label={service.category_rel.name}
          color={service.category_rel.color}
        />
      ) : (
        "--"
      ),
  },
  {
    key: "cost_center",
    label: "Cost Center",
    filterType: "select",
    getFilterValue: (service) => costCenterLabel(service) || "--",
    getSortValue: (service) => costCenterLabel(service),
    getFilterOptions: (services) =>
      getUniqueOptions(services.map((service) => costCenterLabel(service))),
    render: (service) => costCenterLabel(service) || "--",
  },
  {
    key: "classification",
    label: "Classification",
    filterType: "select",
    getFilterValue: (service) =>
      service.service_classification?.name ?? "--",
    getSortValue: (service) => service.service_classification?.name ?? "",
    getFilterOptions: (services) =>
      getUniqueOptions(
        services.map(
          (service) => service.service_classification?.name ?? "--",
        ),
      ),
    render: (service) => (
      <ClassificationBadge classification={service.service_classification} />
    ),
  },
  {
    key: "criticality",
    label: "Criticality",
    filterType: "select",
    getFilterValue: (service) => service.criticality ?? "--",
    getSortValue: (service) => service.criticality ?? "",
    getFilterOptions: (services) =>
      getUniqueOptions(services.map((service) => service.criticality ?? "--")),
    render: (service) => <CriticalityBadge value={service.criticality} />,
  },
  {
    key: "nonprofit_pricing",
    label: "Nonprofit",
    filterType: "select",
    getFilterValue: (service) => getBooleanLabel(service.nonprofit_pricing),
    getSortValue: (service) => service.nonprofit_pricing,
    getFilterOptions: () => ["No", "Yes"],
    render: (service) => (
      <BooleanYesNoBadge value={service.nonprofit_pricing} />
    ),
  },
  {
    key: "yearly_cost",
    label: "Yearly Cost",
    filterType: "text",
    filterPlaceholder: "Filter by yearly cost...",
    getFilterValue: (service) =>
      service.yearly_cost != null ? String(service.yearly_cost) : "--",
    getSortValue: (service) => service.yearly_cost ?? -1,
    render: (service) => <Money value={service.yearly_cost} />,
  },
  {
    key: "payment_method",
    label: "Payment Method",
    filterType: "select",
    getFilterValue: (service) => service.payment_method?.name ?? "--",
    getSortValue: (service) => service.payment_method?.name ?? "",
    getFilterOptions: (services) =>
      getUniqueOptions(
        services.map((service) => service.payment_method?.name ?? "--"),
      ),
    render: (service) =>
      service.payment_method ? (
        <ColoredReferenceBadge
          label={service.payment_method.name}
          color={service.payment_method.color}
        />
      ) : (
        "--"
      ),
  },
  {
    key: "billing_schedule",
    label: "Billing Schedule",
    filterType: "select",
    getFilterValue: (service) =>
      formatBillingSchedule(service.billing_schedule),
    getSortValue: (service) => service.billing_schedule ?? "",
    getFilterOptions: (services) =>
      getUniqueOptions(
        services.map((service) => formatBillingSchedule(service.billing_schedule)),
      ),
    render: (service) => formatBillingSchedule(service.billing_schedule),
  },
  {
    key: "renewal_date",
    label: "Renewal Date",
    filterType: "text",
    filterPlaceholder: "Filter by renewal date...",
    getFilterValue: (service) => service.renewal_date ?? "--",
    getSortValue: (service) => service.renewal_date ?? "",
  },
  {
    key: "sso_integrated",
    label: "SSO",
    filterType: "select",
    getFilterValue: (service) => getBooleanLabel(service.sso_integrated),
    getSortValue: (service) => service.sso_integrated,
    getFilterOptions: () => ["No", "Yes"],
    render: (service) => (
      <BooleanYesNoBadge value={service.sso_integrated} />
    ),
  },
  {
    key: "scim_enabled",
    label: "SCIM",
    filterType: "select",
    getFilterValue: getScimLabel,
    getSortValue: (service) => service.scim_enabled ?? false,
    getFilterOptions: () => ["--", "No", "Yes"],
    render: (service) => <BooleanYesNoBadge value={service.scim_enabled} />,
  },
  {
    key: "vendor",
    label: "Vendor",
    filterType: "select",
    getFilterValue: (service) => service.vendor?.name ?? "--",
    getSortValue: (service) => service.vendor?.name ?? "",
    getFilterOptions: (services) =>
      getUniqueOptions(services.map((service) => service.vendor?.name ?? "--")),
    render: (service) => service.vendor?.name ?? "--",
  },
  {
    key: "owners",
    label: "Owners",
    filterType: "text",
    filterPlaceholder: "Filter by owner...",
    getFilterValue: (service) => getOwnerNames(service) || "--",
    getSortValue: (service) => getOwnerNames(service),
    render: (service) => {
      if (service.owners.length === 0) {
        return <span className="text-fg-4">—</span>;
      }
      if (service.owners.length === 1) {
        const owner = service.owners[0];
        return (
          <Link
            to={`/users/${owner.id}`}
            onClick={(event) => event.stopPropagation()}
            className="hlink inline-flex items-center gap-1.5 text-[13px] text-fg-2"
          >
            <Avatar user={owner} size={20} />
            <span>{getOwnerDisplayName(owner)}</span>
          </Link>
        );
      }
      return <AvatarStack users={service.owners} max={4} size={22} />;
    },
  },
];

const ALL_COLUMN_KEYS = columnDefinitions.map((column) => column.key);

function todayFilenameDate(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function getServiceExportValue(
  service: Service,
  key: string,
  preferences: UserPreferences | null,
): string {
  if (key === "yearly_cost") {
    return service.yearly_cost != null
      ? `$${Number(service.yearly_cost).toLocaleString()}`
      : "--";
  }
  if (key === "renewal_date") {
    return formatDateOnly(service.renewal_date, preferences);
  }
  const def = columnDefinitions.find((column) => column.key === key);
  return def ? def.getFilterValue(service) : "";
}

interface FacetFilterProps {
  label: string;
  options: FacetOption[];
  values: string[];
  onChange: (next: string[]) => void;
}

function FacetFilter({ label, options, values, onChange }: FacetFilterProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const active = values.length > 0;

  useEffect(() => {
    function handleClick(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function toggle(value: string) {
    onChange(
      values.includes(value)
        ? values.filter((v) => v !== value)
        : [...values, value],
    );
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={[
          "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[12.5px] font-medium transition-colors",
          active
            ? "border-accent bg-accent-soft text-accent-strong"
            : "border-border bg-surface text-fg-2 hover:border-border-strong hover:bg-surface-2",
        ].join(" ")}
      >
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M4.5 6h15l-6 7.5v4.5l-3 1.5v-6L4.5 6z"
          />
        </svg>
        <span>{label}</span>
        {active && (
          <span className="tnum rounded-sm bg-accent px-1 text-[10px] font-semibold text-white">
            {values.length}
          </span>
        )}
        <svg className="h-3 w-3 text-fg-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
        </svg>
      </button>
      {open && (
        <div className="absolute left-0 z-20 mt-1 w-56 rounded-md border border-border bg-surface py-1 shadow-lg">
          {options.length === 0 ? (
            <div className="px-3 py-2 text-xs text-fg-3">No values</div>
          ) : (
            <div className="max-h-64 overflow-y-auto">
              {options.map((opt) => {
                const checked = values.includes(opt.value);
                return (
                  <label
                    key={opt.value}
                    className="flex cursor-pointer items-center gap-2 px-2.5 py-1.5 text-[13px] text-fg-2 hover:bg-surface-2"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(opt.value)}
                      className="h-3.5 w-3.5"
                    />
                    <span className="truncate">{opt.label}</span>
                  </label>
                );
              })}
            </div>
          )}
          {active && (
            <div className="border-t border-border px-2 py-1.5">
              <button
                type="button"
                onClick={() => onChange([])}
                className="w-full rounded px-2 py-1 text-left text-[12px] text-fg-3 hover:bg-surface-2 hover:text-fg-2"
              >
                Clear
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface GalleryCardProps {
  service: Service;
  preferences: UserPreferences | null;
  onOpen: (service: Service) => void;
}

function ServiceGalleryCard({ service, preferences, onOpen }: GalleryCardProps) {
  const renewalIso = service.renewal_date;
  const renewalLabel = formatDateOnly(renewalIso, preferences);
  return (
    <button
      type="button"
      onClick={() => onOpen(service)}
      className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4 text-left shadow-sm transition-all hover:border-border-strong hover:shadow-md"
    >
      <div className="flex items-start gap-3">
        <Monogram name={service.name} seed={service.id} size={36} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[14px] font-semibold text-fg">
            {service.name}
          </div>
          <div className="truncate text-[12px] text-fg-3">
            {service.vendor?.name ?? "—"}
            {service.category_rel ? ` · ${service.category_rel.name}` : ""}
          </div>
        </div>
      </div>
      {service.description && (
        <div className="line-clamp-2 text-[12.5px] text-fg-3">
          {service.description}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-1.5">
        {service.service_status ? (
          <ColoredReferenceBadge
            label={service.service_status.name}
            color={service.service_status.color}
          />
        ) : (
          <StatusBadge status={getServiceStatusLabel(service)} />
        )}
        {service.service_classification && (
          <ClassificationBadge classification={service.service_classification} />
        )}
      </div>
      <div className="mt-auto flex items-center justify-between border-t border-border pt-2.5 text-[12px] text-fg-3">
        <span className="inline-flex items-center gap-1.5">
          {renewalIso ? (
            <>
              <span>Renews {renewalLabel}</span>
              <Days date={renewalIso} />
            </>
          ) : (
            <span className="text-fg-4">No renewal</span>
          )}
        </span>
        <Money value={service.yearly_cost} className="text-fg-2 font-medium" />
      </div>
    </button>
  );
}

export function Services() {
  const pageRef = useRef<HTMLDivElement | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [view, setView] = useState<"active" | "archived">("active");
  const [loadedView, setLoadedView] = useState<"active" | "archived" | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>(() => loadViewPref());
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<ServiceFilters>(() =>
    Object.fromEntries(
      columnDefinitions.map((column) => [
        column.key,
        column.filterType === "select" ? [] : "",
      ]),
    ) as ServiceFilters,
  );
  const [sortState, setSortState] = useState<SortState>({
    key: null,
    direction: null,
  });
  const [hoveredDescription, setHoveredDescription] =
    useState<HoveredDescriptionState | null>(null);
  const [visibleKeys, setVisibleKeys] = useColumnPrefs(
    "catalogit:services:columns",
    ALL_COLUMN_KEYS,
  );
  const { canEdit, preferences } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    try {
      localStorage.setItem(VIEW_STORAGE_KEY, viewMode);
    } catch {
      /* ignore */
    }
  }, [viewMode]);

  useEffect(() => {
    let cancelled = false;
    client
      .get<Service[]>("/api/services/", { params: { archived: view === "archived" } })
      .then((r) => {
        if (!cancelled) {
          setServices(r.data);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoadedView(view);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [view]);

  const loading = loadedView !== view;

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    const nextRows = services.filter((service) => {
      const matchesSearch =
        !q ||
        service.name.toLowerCase().includes(q) ||
        categoryLabel(service).toLowerCase().includes(q) ||
        costCenterLabel(service).toLowerCase().includes(q) ||
        (service.service_classification?.name ?? "")
          .toLowerCase()
          .includes(q) ||
        getServiceStatusLabel(service).toLowerCase().includes(q) ||
        (service.payment_method?.name ?? "").toLowerCase().includes(q) ||
        service.billing_schedule.toLowerCase().includes(q) ||
        (service.vendor?.name ?? "").toLowerCase().includes(q) ||
        service.owners.some(
          (owner) =>
            owner.first_name.toLowerCase().includes(q) ||
            owner.last_name.toLowerCase().includes(q),
        );

      if (!matchesSearch) {
        return false;
      }

      return columnDefinitions.every((column) => {
        const cellValue = column.getFilterValue(service);
        if (column.filterType === "select") {
          const selected = filters[column.key];
          const values = Array.isArray(selected) ? selected : [];
          if (values.length === 0) {
            return true;
          }
          return values.includes(cellValue);
        }

        const raw = filters[column.key];
        const filterValue = typeof raw === "string" ? raw.trim() : "";
        if (!filterValue) {
          return true;
        }

        return cellValue.toLowerCase().includes(filterValue.toLowerCase());
      });
    });

    if (!sortState.key || !sortState.direction) {
      return nextRows;
    }

    const activeColumn = columnDefinitions.find(
      (column) => column.key === sortState.key,
    );
    if (!activeColumn) {
      return nextRows;
    }

    return [...nextRows].sort((left, right) => {
      const leftValue = getServiceSortValue(activeColumn.getSortValue(left));
      const rightValue = getServiceSortValue(activeColumn.getSortValue(right));
      const comparison = compareServiceValues(leftValue, rightValue);
      return sortState.direction === "asc" ? comparison : -comparison;
    });
  }, [filters, search, services, sortState]);

  const handleExportCsv = useCallback(() => {
    const known = new Set(columnDefinitions.map((column) => column.key));
    const keysInOrder = visibleKeys.filter((key) => known.has(key));
    if (keysInOrder.length === 0 || filtered.length === 0) {
      return;
    }
    const headers = keysInOrder.map((key) => {
      const def = columnDefinitions.find((column) => column.key === key);
      return def?.label ?? key;
    });
    const rows = filtered.map((service) =>
      keysInOrder.map((key) =>
        getServiceExportValue(service, key, preferences),
      ),
    );
    downloadCsvFile(
      `services-${todayFilenameDate()}.csv`,
      buildCsv(headers, rows),
    );
  }, [filtered, preferences, visibleKeys]);

  const showDescriptionTooltip = useCallback(
    (event: React.SyntheticEvent<HTMLElement>, description: string) => {
      const containerRect = pageRef.current?.getBoundingClientRect();
      if (!containerRect) return;
      const rect = event.currentTarget.getBoundingClientRect();
      const viewportPadding = 16;
      const viewportLeft = Math.max(
        viewportPadding,
        Math.min(window.innerWidth - viewportPadding, rect.left),
      );
      setHoveredDescription({
        text: description,
        left: viewportLeft - containerRect.left,
        top: rect.bottom - containerRect.top + 8,
      });
    },
    [],
  );

  const hideDescriptionTooltip = useCallback(() => {
    setHoveredDescription(null);
  }, []);

  const hasActiveFilters = useMemo(() => {
    if (search.trim()) {
      return true;
    }
    return Object.values(filters).some((value) =>
      Array.isArray(value) ? value.length > 0 : value.trim(),
    );
  }, [search, filters]);

  const headerCounts = useMemo(() => {
    const activeCount = services.filter((service) => {
      const label = (service.service_status?.name ?? service.status ?? "").toLowerCase();
      return service.is_active && (label === "" || label === "active" || label === "contract");
    }).length;
    const annualTotal = services.reduce(
      (sum, service) => sum + (service.yearly_cost ?? 0),
      0,
    );
    return { activeCount, annualTotal };
  }, [services]);

  const facetOptions = useMemo(() => {
    const statusMap = new Map<string, FacetOption>();
    const categoryMap = new Map<string, FacetOption>();
    const classificationMap = new Map<string, FacetOption>();
    for (const service of services) {
      const status = service.service_status?.name ?? service.status;
      if (status) statusMap.set(status, { value: status, label: status });
      const category = service.category_rel?.name;
      if (category) categoryMap.set(category, { value: category, label: category });
      const classification = service.service_classification?.name;
      if (classification)
        classificationMap.set(classification, {
          value: classification,
          label: classification,
        });
    }
    const sortByLabel = (a: FacetOption, b: FacetOption) =>
      a.label.localeCompare(b.label, undefined, { sensitivity: "base" });
    return {
      status: Array.from(statusMap.values()).sort(sortByLabel),
      category: Array.from(categoryMap.values()).sort(sortByLabel),
      classification: Array.from(classificationMap.values()).sort(sortByLabel),
    };
  }, [services]);

  const setFacet = useCallback(
    (key: "status" | "spending_category" | "classification", values: string[]) => {
      setFilters((current) => ({ ...current, [key]: values }));
    },
    [],
  );

  const clearFacets = useCallback(() => {
    setFilters((current) => ({
      ...current,
      status: [],
      spending_category: [],
      classification: [],
    }));
  }, []);

  const activeFacetCount =
    (Array.isArray(filters.status) ? filters.status.length : 0) +
    (Array.isArray(filters.spending_category)
      ? filters.spending_category.length
      : 0) +
    (Array.isArray(filters.classification) ? filters.classification.length : 0);

  const columns = useMemo<Column<Service>[]>(() => {
    return columnDefinitions.map((column) => {
      const sortDirection =
        sortState.key === column.key ? sortState.direction : null;

      return {
        key: column.key,
        label: column.label,
        render:
          column.key === "name"
            ? (service) => (
                <div className="flex items-center gap-2.5">
                  <Monogram name={service.name} seed={service.id} size={26} />
                  <div className="min-w-0">
                    <div className="truncate font-medium text-fg">
                      {service.name}
                    </div>
                    {service.description && (
                      <div
                        className="max-w-[260px] truncate text-[11.5px] text-fg-3"
                        onMouseEnter={(event) =>
                          showDescriptionTooltip(event, service.description ?? "")
                        }
                        onMouseLeave={hideDescriptionTooltip}
                      >
                        {service.description}
                      </div>
                    )}
                  </div>
                </div>
              )
            : column.key === "renewal_date"
              ? (service) =>
                  service.renewal_date ? (
                    <div className="flex flex-col leading-tight">
                      <span className="tnum text-[12.5px]">
                        {formatDateOnly(service.renewal_date, preferences)}
                      </span>
                      <Days date={service.renewal_date} />
                    </div>
                  ) : (
                    <span className="text-fg-4">—</span>
                  )
              : column.render,
        header:
          column.filterType === "select" ? (
            <ColumnHeaderMenu
              label={column.label}
              filterType="select"
              filterOptions={column.getFilterOptions?.(services) ?? []}
              selectedValues={
                Array.isArray(filters[column.key])
                  ? (filters[column.key] as string[])
                  : []
              }
              sortDirection={sortDirection}
              onSelectedValuesChange={(values) =>
                setFilters((current) => ({
                  ...current,
                  [column.key]: values,
                }))
              }
              onSortChange={(direction) =>
                setSortState(
                  direction
                    ? { key: column.key, direction }
                    : { key: null, direction: null },
                )
              }
            />
          ) : (
            <ColumnHeaderMenu
              label={column.label}
              filterType="text"
              filterValue={
                typeof filters[column.key] === "string"
                  ? (filters[column.key] as string)
                  : ""
              }
              filterPlaceholder={column.filterPlaceholder}
              sortDirection={sortDirection}
              onFilterChange={(value) =>
                setFilters((current) => ({
                  ...current,
                  [column.key]: value,
                }))
              }
              onSortChange={(direction) =>
                setSortState(
                  direction
                    ? { key: column.key, direction }
                    : { key: null, direction: null },
                )
              }
            />
          ),
      };
    });
  }, [filters, hideDescriptionTooltip, preferences, services, showDescriptionTooltip, sortState]);

  return (
    <PageTransition>
      <div ref={pageRef} className="relative">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1
              className="text-fg"
              style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.02em", margin: 0 }}
            >
              Services
            </h1>
            <div className="mt-1 text-[13px] text-fg-3">
              {loading ? (
                "Loading…"
              ) : (
                <>
                  <span>
                    {services.length} {services.length === 1 ? "service" : "services"}
                  </span>
                  <span className="mx-1.5">·</span>
                  <span>{headerCounts.activeCount} active</span>
                  <span className="mx-1.5">·</span>
                  <span className="tnum">
                    {formatMoneyFull(headerCounts.annualTotal, "USD")} annualized
                  </span>
                </>
              )}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <SegmentedControl<ViewMode>
              value={viewMode}
              onChange={setViewMode}
              size="sm"
              options={[
                { value: "table", label: "Table" },
                { value: "gallery", label: "Gallery" },
              ]}
            />
            <div className="inline-flex rounded-md border border-border bg-surface-2 p-0.5">
              <button
                type="button"
                onClick={() => setView("active")}
                className={`rounded px-3 py-1 text-xs font-medium transition-all ${
                  view === "active"
                    ? "bg-surface text-fg shadow-sm"
                    : "text-fg-3 hover:text-fg-2"
                }`}
              >
                Active
              </button>
              <button
                type="button"
                onClick={() => setView("archived")}
                className={`rounded px-3 py-1 text-xs font-medium transition-all ${
                  view === "archived"
                    ? "bg-surface text-fg shadow-sm"
                    : "text-fg-3 hover:text-fg-2"
                }`}
              >
                Archived
              </button>
            </div>
            {!loading && (
              <button
                type="button"
                onClick={handleExportCsv}
                disabled={filtered.length === 0}
                className="inline-flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-1.5 text-[13px] font-medium text-fg-2 transition-colors hover:border-border-strong hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <ArrowDownTrayIcon className="h-4 w-4" />
                Export
              </button>
            )}
            {canEdit && view === "active" && (
              <Link
                to="/services/new"
                className="inline-flex items-center gap-2 rounded-md bg-accent px-3 py-1.5 text-[13px] font-medium text-white transition-colors hover:bg-accent-strong"
              >
                <PlusIcon className="h-4 w-4" />
                New service
              </Link>
            )}
          </div>
        </div>
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className="h-12 w-full animate-pulse rounded-lg bg-surface-2"
              />
            ))}
          </div>
        ) : (
          <>
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <div className="min-w-[220px] max-w-sm flex-1">
                <SearchInput
                  value={search}
                  onChange={setSearch}
                  placeholder="Search services..."
                />
              </div>
              <FacetFilter
                label="Status"
                options={facetOptions.status}
                values={Array.isArray(filters.status) ? filters.status : []}
                onChange={(values) => setFacet("status", values)}
              />
              <FacetFilter
                label="Category"
                options={facetOptions.category}
                values={
                  Array.isArray(filters.spending_category)
                    ? filters.spending_category
                    : []
                }
                onChange={(values) => setFacet("spending_category", values)}
              />
              <FacetFilter
                label="Type"
                options={facetOptions.classification}
                values={
                  Array.isArray(filters.classification)
                    ? filters.classification
                    : []
                }
                onChange={(values) => setFacet("classification", values)}
              />
              {activeFacetCount > 0 && (
                <button
                  type="button"
                  onClick={clearFacets}
                  className="rounded-md px-2 py-1 text-[12px] text-fg-3 hover:bg-surface-2 hover:text-fg-2"
                >
                  Clear
                </button>
              )}
              <div className="flex-1" />
              <p className="whitespace-nowrap text-[13px] text-fg-3">
                {hasActiveFilters ? (
                  <>
                    <span className="font-medium text-fg">{filtered.length}</span>
                    <span className="text-fg-3"> / {services.length} </span>
                    {services.length === 1 ? "service" : "services"}
                  </>
                ) : (
                  <>
                    {services.length}{" "}
                    {services.length === 1 ? "service" : "services"}
                  </>
                )}
              </p>
              {viewMode === "table" && (
                <ColumnSelector
                  columns={columns}
                  visibleKeys={visibleKeys}
                  onChange={setVisibleKeys}
                />
              )}
            </div>
            {viewMode === "table" ? (
              <DataTable
                columns={columns}
                data={filtered}
                visibleKeys={visibleKeys}
                striped
                primaryColumnKey="name"
                onRowClick={(s) => navigate(`/services/${s.id}`)}
              />
            ) : filtered.length === 0 ? (
              <div className="rounded-lg border border-border bg-surface py-12 text-center text-[13px] text-fg-3">
                No services match your filters.
              </div>
            ) : (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3">
                {filtered.map((service) => (
                  <ServiceGalleryCard
                    key={service.id}
                    service={service}
                    preferences={preferences}
                    onOpen={(s) => navigate(`/services/${s.id}`)}
                  />
                ))}
              </div>
            )}
          </>
        )}
        {hoveredDescription && (
          <div
            className="pointer-events-none absolute z-[9999] max-w-xs rounded-md border border-border bg-surface px-2 py-1 text-xs text-fg-2 shadow-lg"
            style={{ left: hoveredDescription.left, top: hoveredDescription.top }}
          >
            {hoveredDescription.text}
          </div>
        )}
      </div>
    </PageTransition>
  );
}
