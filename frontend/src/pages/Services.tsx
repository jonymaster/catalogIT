import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
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
import { useToast } from "../context/useToast";
import { useColumnPrefs } from "../hooks/useColumnPrefs";
import { useDashboardCostData } from "../hooks/useDashboardCostData";
import { formatRenewalConfig } from "../service/renewalConfig";
import type { Service, User, UserPreferences } from "../types/models";
import { buildCsv, downloadCsvFile } from "../utils/csv";
import {
  combinedActualEstimatedByYear,
  totalByYear,
  visualAmountForRecordTypeAndYear,
} from "../utils/dashboardCostAggregates";
import { formatDateOnly } from "../utils/formatting";

type FilterType = "text" | "select";

interface ServiceColumnDefinition {
  key: string;
  label: string;
  filterType: FilterType;
  filterPlaceholder?: string;
  getFilterValue: (service: Service) => string;
  /**
   * For "multi-valued" columns (e.g. tags) a service carries several labels at
   * once. When provided, the list filter treats a service as a match if ANY of
   * the labels intersects with the selected filter values. When omitted, the
   * standard single-value `getFilterValue` equality is used.
   */
  getFilterValues?: (service: Service) => string[];
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

const VIEW_STORAGE_KEY = "catalogit:services:view";
const FLASH_TOAST_KEY = "catalogit:flash-toast";
const LIST_STATE_STORAGE_KEY = "catalogit:services:list-state";

interface ServicesListState {
  view: "active" | "archived";
  search: string;
  filters: ServiceFilters;
  sortState: SortState;
}

function loadViewPref(): ViewMode {
  try {
    const stored = localStorage.getItem(VIEW_STORAGE_KEY);
    if (stored === "table" || stored === "gallery") return stored;
  } catch {
    /* ignore */
  }
  return "table";
}

function createDefaultFilters(): ServiceFilters {
  return Object.fromEntries(
    columnDefinitions.map((column) => [
      column.key,
      column.filterType === "select" ? [] : "",
    ]),
  ) as ServiceFilters;
}

function loadListState(): ServicesListState | null {
  try {
    const raw = sessionStorage.getItem(LIST_STATE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ServicesListState>;
    const defaultFilters = createDefaultFilters();
    const normalizedFilters: ServiceFilters = { ...defaultFilters };
    const keys = new Set(columnDefinitions.map((column) => column.key));
    const parsedFilters = parsed.filters ?? {};
    for (const column of columnDefinitions) {
      const value = parsedFilters[column.key];
      if (column.filterType === "select") {
        normalizedFilters[column.key] = Array.isArray(value)
          ? value.filter((entry): entry is string => typeof entry === "string")
          : [];
      } else {
        normalizedFilters[column.key] = typeof value === "string" ? value : "";
      }
    }
    const normalizedSortState: SortState =
      parsed.sortState &&
      typeof parsed.sortState === "object" &&
      ((parsed.sortState.direction === "asc" ||
        parsed.sortState.direction === "desc" ||
        parsed.sortState.direction === null) &&
        ((typeof parsed.sortState.key === "string" &&
          keys.has(parsed.sortState.key)) ||
          parsed.sortState.key === null))
        ? {
            key: parsed.sortState.key,
            direction: parsed.sortState.direction,
          }
        : { key: null, direction: null };

    return {
      view: parsed.view === "archived" ? "archived" : "active",
      search: typeof parsed.search === "string" ? parsed.search : "",
      filters: normalizedFilters,
      sortState: normalizedSortState,
    };
  } catch {
    return null;
  }
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
    key: "renewal",
    label: "Renewal",
    filterType: "select",
    getFilterValue: (service) => formatRenewalConfig(service.renewal_config),
    getSortValue: (service) => formatRenewalConfig(service.renewal_config),
    getFilterOptions: (services) =>
      getUniqueOptions(
        services.map((service) => formatRenewalConfig(service.renewal_config)),
      ),
    render: (service) => formatRenewalConfig(service.renewal_config),
  },
  {
    key: "renewal_date",
    label: "Next Renewal",
    filterType: "text",
    filterPlaceholder: "Filter by next renewal...",
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
    key: "tags",
    label: "Tags",
    filterType: "select",
    getFilterValue: (service) =>
      service.tags.map((tag) => tag.name).join(", "),
    getFilterValues: (service) => service.tags.map((tag) => tag.name),
    getSortValue: (service) =>
      service.tags.map((tag) => tag.name).join(", ").toLowerCase(),
    getFilterOptions: (services) =>
      getUniqueOptions(services.flatMap((service) => service.tags.map((tag) => tag.name))),
    render: (service) => {
      if (!service.tags?.length) {
        return <span className="text-fg-4">—</span>;
      }
      const visible = service.tags.slice(0, 3);
      const extra = service.tags.length - visible.length;
      return (
        <div className="flex flex-wrap items-center gap-1">
          {visible.map((tag) => (
            <ColoredReferenceBadge
              key={tag.id}
              label={tag.name}
              color={tag.color}
            />
          ))}
          {extra > 0 && (
            <span
              className="text-[11px] text-fg-3"
              title={service.tags
                .slice(3)
                .map((tag) => tag.name)
                .join(", ")}
            >
              +{extra} more
            </span>
          )}
        </div>
      );
    },
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

interface GalleryCardProps {
  service: Service;
  preferences: UserPreferences | null;
  showDescriptionTooltip: (
    event: React.SyntheticEvent<HTMLElement>,
    description: string,
  ) => void;
  hideDescriptionTooltip: () => void;
}

function ServiceGalleryCard({
  service,
  preferences,
  showDescriptionTooltip,
  hideDescriptionTooltip,
}: GalleryCardProps) {
  const renewalIso = service.renewal_date;
  const renewalLabel = formatDateOnly(renewalIso, preferences);
  return (
    <Link
      to={`/services/${service.id}`}
      className="interactive-record flex flex-col gap-3 rounded-lg border border-border bg-surface p-4 text-left shadow-sm transition-all hover:border-border-strong hover:shadow-md"
    >
      <div className="flex items-start gap-3">
        <span
          className={`shrink-0 ${service.description ? "cursor-help" : ""}`}
          onMouseEnter={
            service.description
              ? (event) =>
                  showDescriptionTooltip(event, service.description ?? "")
              : undefined
          }
          onMouseLeave={
            service.description ? hideDescriptionTooltip : undefined
          }
        >
          <Monogram name={service.name} seed={service.id} size={36} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="record-primary-label truncate text-[14px] font-semibold text-fg">
            {service.name}
          </div>
          <div className="truncate text-[12px] text-fg-3">
            {service.vendor?.name ?? "—"}
            {service.category_rel ? ` · ${service.category_rel.name}` : ""}
          </div>
        </div>
      </div>
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
        {service.tags?.slice(0, 3).map((tag) => (
          <ColoredReferenceBadge
            key={tag.id}
            label={tag.name}
            color={tag.color}
          />
        ))}
        {(service.tags?.length ?? 0) > 3 && (
          <span
            className="text-[11px] text-fg-3"
            title={service.tags
              .slice(3)
              .map((tag) => tag.name)
              .join(", ")}
          >
            +{service.tags.length - 3}
          </span>
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
    </Link>
  );
}

export function Services() {
  const persistedState = useMemo(() => loadListState(), []);
  const pageRef = useRef<HTMLDivElement | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [view, setView] = useState<"active" | "archived">(
    persistedState?.view ?? "active",
  );
  const [loadedView, setLoadedView] = useState<"active" | "archived" | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>(() => loadViewPref());
  const [search, setSearch] = useState(persistedState?.search ?? "");
  const [filters, setFilters] = useState<ServiceFilters>(
    persistedState?.filters ?? createDefaultFilters(),
  );
  const [sortState, setSortState] = useState<SortState>(
    persistedState?.sortState ?? { key: null, direction: null },
  );
  const [hoveredDescription, setHoveredDescription] =
    useState<HoveredDescriptionState | null>(null);
  const [visibleKeys, setVisibleKeys] = useColumnPrefs(
    "catalogit:services:columns",
    ALL_COLUMN_KEYS,
  );
  const { canEdit, preferences } = useAuth();
  const { showToast } = useToast();
  const { records, fiscalYears } = useDashboardCostData();

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(FLASH_TOAST_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { type?: "success" | "error"; text?: string };
      if (parsed.type && parsed.text) {
        showToast({ type: parsed.type, text: parsed.text });
      }
      sessionStorage.removeItem(FLASH_TOAST_KEY);
    } catch {
      // Ignore malformed or unavailable storage.
    }
  }, [showToast]);

  useEffect(() => {
    try {
      localStorage.setItem(VIEW_STORAGE_KEY, viewMode);
    } catch {
      /* ignore */
    }
  }, [viewMode]);

  useEffect(() => {
    try {
      sessionStorage.setItem(
        LIST_STATE_STORAGE_KEY,
        JSON.stringify({ view, search, filters, sortState } satisfies ServicesListState),
      );
    } catch {
      // Ignore unavailable storage.
    }
  }, [filters, search, sortState, view]);

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
        formatRenewalConfig(service.renewal_config).toLowerCase().includes(q) ||
        (service.vendor?.name ?? "").toLowerCase().includes(q) ||
        service.tags.some((tag) => tag.name.toLowerCase().includes(q)) ||
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
          if (column.getFilterValues) {
            // Multi-valued column (e.g. tags): ANY-of semantics.
            const serviceValues = column.getFilterValues(service);
            return serviceValues.some((entry) => values.includes(entry));
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
    const currentYear = new Date().getFullYear();
    const dashYear =
      fiscalYears.length === 0
        ? currentYear
        : fiscalYears.includes(currentYear)
          ? currentYear
          : fiscalYears[fiscalYears.length - 1];
    const actualRecords = records.filter((record) => record.record_type === "actual");
    const actualByYear = totalByYear(actualRecords, fiscalYears);
    const combinedByYear = combinedActualEstimatedByYear(
      records,
      fiscalYears,
      currentYear,
    );
    const annualTotal = visualAmountForRecordTypeAndYear(
      "actual",
      dashYear,
      actualByYear[dashYear] ?? 0,
      combinedByYear[dashYear] ?? 0,
      currentYear,
    );
    return { activeCount, annualTotal };
  }, [fiscalYears, records, services]);

  const clearAllFilters = useCallback(() => {
    setSearch("");
    setFilters(createDefaultFilters());
    setSortState({ key: null, direction: null });
  }, []);

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
                  <span
                    className={`shrink-0 ${service.description ? "cursor-help" : ""}`}
                    onMouseEnter={
                      service.description
                        ? (event) =>
                            showDescriptionTooltip(
                              event,
                              service.description ?? "",
                            )
                        : undefined
                    }
                    onMouseLeave={
                      service.description ? hideDescriptionTooltip : undefined
                    }
                  >
                    <Monogram name={service.name} seed={service.id} size={26} />
                  </span>
                  <div className="min-w-0">
                    <div className="truncate">
                      <Link
                        to={`/services/${service.id}`}
                        className="hlink text-fg"
                      >
                      {service.name}
                      </Link>
                    </div>
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
              <div className="flex-1" />
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={clearAllFilters}
                  className="rounded-md px-2 py-1 text-[12px] text-fg-3 hover:bg-surface-2 hover:text-fg-2"
                >
                  Clear all filters
                </button>
              )}
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
                    showDescriptionTooltip={showDescriptionTooltip}
                    hideDescriptionTooltip={hideDescriptionTooltip}
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
