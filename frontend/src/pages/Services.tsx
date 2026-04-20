import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import client from "../api/client";
import { PageTransition } from "../components/PageTransition";
import {
  ArrowDownTrayIcon,
  InformationCircleIcon,
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
} from "../components/ColumnHeaderMenu";
import { ColumnSelector } from "../components/ColumnSelector";
import type { Column } from "../components/DataTable";
import { DataTable } from "../components/DataTable";
import { SearchInput } from "../components/SearchInput";
import { StatusBadge } from "../components/StatusBadge";
import { UserLinkList } from "../components/UserLinks";
import { useAuth } from "../context/useAuth";
import { formatBillingSchedule } from "../service/serviceBilling";
import type {
  Service,
  ServiceListPreferences,
  ServiceListSortPreference,
  UserPreferences,
} from "../types/models";
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

type SortState = ServiceListSortPreference;

interface HoveredDescriptionState {
  text: string;
  left: number;
  top: number;
}

interface ResolvedServiceListPreferences {
  visible_columns: string[];
  filters: ServiceFilters;
  sort: SortState;
}

const SERVICE_LIST_PREFERENCES_STORAGE_KEY = "catalogit:services:preferences";

function getOwnerNames(service: Service) {
  return service.owners.map((owner) => `${owner.first_name} ${owner.last_name}`).join(", ");
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
    key: "description",
    label: "Description",
    filterType: "text",
    filterPlaceholder: "Filter by description...",
    getFilterValue: (service) => service.description ?? "",
    getSortValue: (service) => service.description ?? "",
    render: (service) => service.description?.trim() || "—",
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
    render: (service) =>
      service.yearly_cost != null
        ? `$${Number(service.yearly_cost).toLocaleString()}`
        : "--",
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
    render: (service) => <UserLinkList users={service.owners} />,
  },
  {
    key: "seat_usage",
    label: "Seat Usage",
    filterType: "text",
    filterPlaceholder: "Filter by seat usage...",
    getFilterValue: (service) => {
      const occupied = service.assignees?.length ?? 0;
      const capacity = service.total_seats != null ? String(service.total_seats) : "Unlimited";
      return `${occupied} / ${capacity}`;
    },
    getSortValue: (service) => service.assignees?.length ?? 0,
    render: (service) => {
      const occupied = service.assignees?.length ?? 0;
      return `${occupied} / ${service.total_seats ?? "Unlimited"}`;
    },
  },
  {
    key: "point_of_contact",
    label: "Point of Contact",
    filterType: "text",
    filterPlaceholder: "Filter by contact...",
    getFilterValue: (service) => service.point_of_contact ?? "",
    getSortValue: (service) => service.point_of_contact ?? "",
    render: (service) => service.point_of_contact?.trim() || "—",
  },
];

const ALL_COLUMN_KEYS = columnDefinitions.map((column) => column.key);
const DEFAULT_VISIBLE_COLUMN_KEYS = [
  "name",
  "status",
  "spending_category",
  "cost_center",
  "classification",
  "criticality",
  "nonprofit_pricing",
  "yearly_cost",
  "payment_method",
  "billing_schedule",
  "renewal_date",
  "sso_integrated",
  "scim_enabled",
  "vendor",
  "owners",
];

function createDefaultServiceFilters(): ServiceFilters {
  return Object.fromEntries(
    columnDefinitions.map((column) => [
      column.key,
      column.filterType === "select" ? [] : "",
    ]),
  ) as ServiceFilters;
}

function cloneServiceFilters(filters: ServiceFilters): ServiceFilters {
  return Object.fromEntries(
    Object.entries(filters).map(([key, value]) => [
      key,
      Array.isArray(value) ? [...value] : value,
    ]),
  ) as ServiceFilters;
}

function normalizeVisibleColumns(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    return [...DEFAULT_VISIBLE_COLUMN_KEYS];
  }

  const valid = Array.from(
    new Set(
      raw.filter(
        (key): key is string =>
          typeof key === "string" && ALL_COLUMN_KEYS.includes(key),
      ),
    ),
  );

  return valid.length > 0 ? valid : [...DEFAULT_VISIBLE_COLUMN_KEYS];
}

function normalizeSortPreference(raw: unknown): SortState {
  if (!raw || typeof raw !== "object") {
    return { key: null, direction: null };
  }

  const candidate = raw as { key?: unknown; direction?: unknown };
  const key =
    typeof candidate.key === "string" && ALL_COLUMN_KEYS.includes(candidate.key)
      ? candidate.key
      : null;
  const direction =
    candidate.direction === "asc" || candidate.direction === "desc"
      ? candidate.direction
      : null;

  if (!key || !direction) {
    return { key: null, direction: null };
  }

  return { key, direction };
}

function normalizeFilters(raw: unknown): ServiceFilters {
  const defaults = createDefaultServiceFilters();
  if (!raw || typeof raw !== "object") {
    return defaults;
  }

  const source = raw as Record<string, unknown>;
  return Object.fromEntries(
    columnDefinitions.map((column) => {
      const value = source[column.key];
      if (column.filterType === "select") {
        const selected = Array.isArray(value)
          ? Array.from(
              new Set(
                value.filter(
                  (entry): entry is string =>
                    typeof entry === "string" && entry.trim().length > 0,
                ),
              ),
            )
          : [];
        return [column.key, selected];
      }

      return [column.key, typeof value === "string" ? value : ""];
    }),
  ) as ServiceFilters;
}

function normalizeServiceListPreferences(
  raw: ServiceListPreferences | null | undefined,
): ResolvedServiceListPreferences {
  return {
    visible_columns: normalizeVisibleColumns(raw?.visible_columns),
    filters: normalizeFilters(raw?.filters),
    sort: normalizeSortPreference(raw?.sort),
  };
}

function readStoredServiceListPreferences(): ResolvedServiceListPreferences {
  try {
    const stored = localStorage.getItem(SERVICE_LIST_PREFERENCES_STORAGE_KEY);
    if (!stored) {
      return normalizeServiceListPreferences(null);
    }

    return normalizeServiceListPreferences(
      JSON.parse(stored) as ServiceListPreferences,
    );
  } catch {
    return normalizeServiceListPreferences(null);
  }
}

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

export function Services() {
  const pageRef = useRef<HTMLDivElement | null>(null);
  const storedServiceListPreferences = useMemo(
    () => readStoredServiceListPreferences(),
    [],
  );
  const [services, setServices] = useState<Service[]>([]);
  const [view, setView] = useState<"active" | "archived">("active");
  const [loadedView, setLoadedView] = useState<"active" | "archived" | null>(null);
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<ServiceFilters>(() =>
    cloneServiceFilters(storedServiceListPreferences.filters),
  );
  const [sortState, setSortState] = useState<SortState>(() => ({
    ...storedServiceListPreferences.sort,
  }));
  const [hoveredDescription, setHoveredDescription] =
    useState<HoveredDescriptionState | null>(null);
  const [visibleKeys, setVisibleKeys] = useState<string[]>(
    () => [...storedServiceListPreferences.visible_columns],
  );
  const { canEdit, preferences, preferencesLoading, setPreferences } = useAuth();
  const navigate = useNavigate();
  const loading = loadedView !== view;
  const serviceListPreferencesHydratedRef = useRef(false);
  const lastSyncedServiceListSignatureRef = useRef<string | null>(null);

  const profileServiceListPreferences = useMemo(
    () => normalizeServiceListPreferences(preferences?.ui_preferences.service_list),
    [preferences],
  );
  const currentServiceListPreferences = useMemo(
    () =>
      normalizeServiceListPreferences({
        visible_columns: visibleKeys,
        filters,
        sort: sortState,
      }),
    [filters, sortState, visibleKeys],
  );

  useEffect(() => {
    if (preferencesLoading || serviceListPreferencesHydratedRef.current) {
      return;
    }

    const hasProfilePreferences =
      preferences?.ui_preferences.service_list !== undefined;
    const sourcePreferences = hasProfilePreferences
      ? profileServiceListPreferences
      : storedServiceListPreferences;

    const timeoutId = window.setTimeout(() => {
      setVisibleKeys([...sourcePreferences.visible_columns]);
      setFilters(cloneServiceFilters(sourcePreferences.filters));
      setSortState({ ...sourcePreferences.sort });
      lastSyncedServiceListSignatureRef.current = hasProfilePreferences
        ? JSON.stringify(profileServiceListPreferences)
        : null;
      serviceListPreferencesHydratedRef.current = true;
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [
    preferences,
    preferencesLoading,
    profileServiceListPreferences,
    storedServiceListPreferences,
  ]);

  useEffect(() => {
    const serialized = JSON.stringify(currentServiceListPreferences);

    try {
      localStorage.setItem(SERVICE_LIST_PREFERENCES_STORAGE_KEY, serialized);
    } catch {
      // Ignore storage failures; per-user persistence still attempts to save.
    }

    if (!serviceListPreferencesHydratedRef.current) {
      return;
    }
    if (serialized === lastSyncedServiceListSignatureRef.current) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      client
        .patch<UserPreferences>("/api/me/preferences", {
          ui_preferences: {
            service_list: currentServiceListPreferences,
          },
        })
        .then((response) => {
          lastSyncedServiceListSignatureRef.current = serialized;
          setPreferences(response.data);
        })
        .catch(() => {
          // Keep local fallback state if profile sync fails.
        });
    }, 300);

    return () => window.clearTimeout(timeoutId);
  }, [currentServiceListPreferences, setPreferences]);

  useEffect(() => {
    let cancelled = false;
    client
      .get<Service[]>("/api/services/", { params: { archived: view === "archived" } })
      .then((r) => {
        if (!cancelled) {
          setServices(r.data);
          setLoadedView(view);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLoadedView(view);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [view]);

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
    (event: React.SyntheticEvent<HTMLSpanElement>, description: string) => {
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

  const resetServiceListView = useCallback(() => {
    const defaults = normalizeServiceListPreferences(null);
    setSearch("");
    setVisibleKeys([...defaults.visible_columns]);
    setFilters(cloneServiceFilters(defaults.filters));
    setSortState({ ...defaults.sort });
  }, []);

  const hasActiveFilters = useMemo(() => {
    if (search.trim()) {
      return true;
    }
    return Object.values(filters).some((value) =>
      Array.isArray(value) ? value.length > 0 : value.trim(),
    );
  }, [search, filters]);

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
              <div className="inline-flex items-center gap-1.5">
                {service.description && (
                  <span
                    role="button"
                    tabIndex={0}
                    aria-label={`Description: ${service.description}`}
                    onMouseEnter={(event) =>
                      showDescriptionTooltip(event, service.description ?? "")
                    }
                    onMouseLeave={hideDescriptionTooltip}
                    onFocus={(event) =>
                      showDescriptionTooltip(event, service.description ?? "")
                    }
                    onBlur={hideDescriptionTooltip}
                    className="inline-flex cursor-help text-[#4f46e5]"
                  >
                    <InformationCircleIcon className="h-5 w-5" strokeWidth={2.25} />
                  </span>
                )}
                <span>{service.name}</span>
              </div>
            )
            : column.key === "renewal_date"
            ? (service) => formatDateOnly(service.renewal_date, preferences)
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
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Services</h1>
        <div className="flex shrink-0 items-center gap-2">
          <div className="rounded-md border border-gray-300 dark:border-gray-700 p-0.5 flex">
            <button
              type="button"
              onClick={() => setView("active")}
              className={`px-3 py-1.5 text-sm rounded ${
                view === "active"
                  ? "bg-brand-600 text-white"
                  : "text-gray-600 dark:text-gray-300"
              }`}
            >
              Active
            </button>
            <button
              type="button"
              onClick={() => setView("archived")}
              className={`px-3 py-1.5 text-sm rounded ${
                view === "archived"
                  ? "bg-brand-600 text-white"
                  : "text-gray-600 dark:text-gray-300"
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
              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 shadow-sm transition-all duration-150 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <ArrowDownTrayIcon className="h-4 w-4" />
              Export CSV
            </button>
          )}
          {canEdit && view === "active" && (
            <Link
              to="/services/new"
              className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-all duration-150 hover:bg-brand-700"
            >
              <PlusIcon className="h-4 w-4" />
              New Service
            </Link>
          )}
        </div>
      </div>
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-12 w-full animate-pulse rounded-lg bg-gray-200 dark:bg-gray-800" />
          ))}
        </div>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <div className="max-w-sm min-w-[200px] flex-1">
              <SearchInput
                value={search}
                onChange={setSearch}
                placeholder="Search services..."
              />
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-300 whitespace-nowrap">
              {hasActiveFilters ? (
                <>
                  <span className="font-medium text-gray-900 dark:text-gray-100">
                    {filtered.length}
                  </span>
                  <span className="text-gray-500 dark:text-gray-400"> / {services.length} </span>
                  {services.length === 1 ? "service" : "services"}
                </>
              ) : (
                <>
                  {services.length}{" "}
                  {services.length === 1 ? "service" : "services"}
                </>
              )}
            </p>
            <ColumnSelector
              columns={columns}
              visibleKeys={visibleKeys}
              onChange={setVisibleKeys}
            />
            <button
              type="button"
              onClick={resetServiceListView}
              className="inline-flex items-center gap-2 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              Reset view
            </button>
          </div>
          <DataTable
            columns={columns}
            data={filtered}
            visibleKeys={visibleKeys}
            striped
            primaryColumnKey="name"
            onRowClick={(s) => navigate(`/services/${s.id}`)}
          />
        </>
      )}
      {hoveredDescription && (
        <div
          className="pointer-events-none absolute z-[9999] max-w-xs rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-2 py-1 text-xs text-gray-700 dark:text-gray-200 shadow-lg"
          style={{ left: hoveredDescription.left, top: hoveredDescription.top }}
        >
          {hoveredDescription.text}
        </div>
      )}
    </div>
    </PageTransition>
  );
}
