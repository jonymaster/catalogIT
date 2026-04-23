import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import client from "../api/client";
import { PageTransition } from "../components/PageTransition";
import { ArrowDownTrayIcon, PlusIcon } from "../components/Icons";
import {
  ColumnHeaderMenu,
  type SortDirection,
} from "../components/ColumnHeaderMenu";
import { ColumnSelector } from "../components/ColumnSelector";
import type { Column } from "../components/DataTable";
import { DataTable } from "../components/DataTable";
import { SearchInput } from "../components/SearchInput";
import { BooleanYesNoBadge, ColoredReferenceBadge } from "../components/Badge";
import { StatusBadge } from "../components/StatusBadge";
import { UserLink } from "../components/UserLinks";
import { useAuth } from "../context/useAuth";
import { useColumnPrefs } from "../hooks/useColumnPrefs";
import { OsIcon } from "../components/ui/OsIcon";
import { operatingSystemLabel } from "../utils/operatingSystem";
import type { Laptop } from "../types/models";
import { buildCsv, downloadCsvFile } from "../utils/csv";

type FilterType = "text" | "select";

interface HardwareColumnDefinition {
  key: string;
  label: string;
  filterType: FilterType;
  filterPlaceholder?: string;
  getFilterValue: (laptop: Laptop) => string;
  getSortValue: (laptop: Laptop) => string | number | boolean | null;
  getFilterOptions?: (laptops: Laptop[]) => string[];
  render?: (laptop: Laptop) => ReactNode;
}

type HardwareFilters = Record<string, string | string[]>;

interface SortState {
  key: string | null;
  direction: SortDirection | null;
}

interface HardwareListState {
  view: "active" | "archived";
  search: string;
  filters: HardwareFilters;
  sortState: SortState;
}

const LIST_STATE_STORAGE_KEY = "catalogit:hardware:list-state";

function getAssigneeName(laptop: Laptop) {
  return laptop.assigned_to
    ? `${laptop.assigned_to.first_name} ${laptop.assigned_to.last_name}`
    : "--";
}

function getHardwareStatusDisplayLabel(laptop: Laptop): string {
  return laptop.hardware_status?.name ?? laptop.status;
}

function getHardwareSortValue(
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

function compareHardwareValues(
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

const columnDefinitions: HardwareColumnDefinition[] = [
  {
    key: "serial_number",
    label: "Serial Number",
    filterType: "text",
    filterPlaceholder: "Filter by serial number...",
    getFilterValue: (laptop) => laptop.serial_number,
    getSortValue: (laptop) => laptop.serial_number,
    render: (laptop) => (
      <div className="flex min-w-0 items-center gap-2.5">
        <OsIcon operatingSystem={laptop.operating_system} />
        <Link to={`/hardware/${laptop.id}`} className="hlink truncate text-fg">
          {laptop.serial_number}
        </Link>
      </div>
    ),
  },
  {
    key: "model_name",
    label: "Model",
    filterType: "text",
    filterPlaceholder: "Filter by model...",
    getFilterValue: (laptop) => laptop.model_name,
    getSortValue: (laptop) => laptop.model_name,
  },
  {
    key: "operating_system",
    label: "OS",
    filterType: "select",
    getFilterValue: (laptop) => operatingSystemLabel(laptop.operating_system),
    getSortValue: (laptop) => laptop.operating_system ?? "",
    getFilterOptions: (laptops) =>
      getUniqueOptions(laptops.map((l) => operatingSystemLabel(l.operating_system))),
    render: (laptop) => (
      <span className="truncate text-fg">{operatingSystemLabel(laptop.operating_system)}</span>
    ),
  },
  {
    key: "status",
    label: "Status",
    filterType: "select",
    getFilterValue: getHardwareStatusDisplayLabel,
    getSortValue: (laptop) => getHardwareStatusDisplayLabel(laptop),
    getFilterOptions: (laptops) =>
      getUniqueOptions(laptops.map((laptop) => getHardwareStatusDisplayLabel(laptop))),
    render: (laptop) =>
      laptop.hardware_status ? (
        <ColoredReferenceBadge
          label={laptop.hardware_status.name}
          color={laptop.hardware_status.color}
        />
      ) : (
        <StatusBadge status={laptop.status} />
      ),
  },
  {
    key: "hardware_location",
    label: "Location",
    filterType: "select",
    getFilterValue: (laptop) =>
      laptop.hardware_location?.name?.trim() ? laptop.hardware_location.name : "—",
    getSortValue: (laptop) =>
      laptop.hardware_location?.name?.trim() ? laptop.hardware_location.name : "",
    getFilterOptions: (laptops) =>
      getUniqueOptions(
        laptops.map((laptop) =>
          laptop.hardware_location?.name?.trim() ? laptop.hardware_location.name : "—",
        ),
      ),
    render: (laptop) =>
      laptop.hardware_location?.name?.trim() ? laptop.hardware_location.name : "—",
  },
  {
    key: "mdm_connected",
    label: "MDM Connected",
    filterType: "select",
    getFilterValue: (laptop) => (laptop.mdm_connected ? "Yes" : "No"),
    getSortValue: (laptop) => laptop.mdm_connected,
    getFilterOptions: () => ["No", "Yes"],
    render: (laptop) => <BooleanYesNoBadge value={laptop.mdm_connected} />,
  },
  {
    key: "cpu",
    label: "CPU",
    filterType: "text",
    filterPlaceholder: "Filter by CPU...",
    getFilterValue: (laptop) => laptop.cpu,
    getSortValue: (laptop) => laptop.cpu,
  },
  {
    key: "ram",
    label: "RAM",
    filterType: "text",
    filterPlaceholder: "Filter by RAM...",
    getFilterValue: (laptop) => laptop.ram,
    getSortValue: (laptop) => laptop.ram,
  },
  {
    key: "storage_size",
    label: "Storage",
    filterType: "text",
    filterPlaceholder: "Filter by storage...",
    getFilterValue: (laptop) => laptop.storage_size,
    getSortValue: (laptop) => laptop.storage_size,
  },
  {
    key: "assigned_to",
    label: "Assigned To",
    filterType: "text",
    filterPlaceholder: "Filter by assignee...",
    getFilterValue: getAssigneeName,
    getSortValue: getAssigneeName,
    render: (laptop) =>
      laptop.assigned_to ? <UserLink user={laptop.assigned_to} /> : "--",
  },
];

const ALL_COLUMN_KEYS = columnDefinitions.map((column) => column.key);

function createDefaultFilters(): HardwareFilters {
  return Object.fromEntries(
    columnDefinitions.map((column) => [
      column.key,
      column.filterType === "select" ? [] : "",
    ]),
  ) as HardwareFilters;
}

function loadListState(): HardwareListState | null {
  try {
    const raw = sessionStorage.getItem(LIST_STATE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<HardwareListState>;
    const defaultFilters = createDefaultFilters();
    const normalizedFilters: HardwareFilters = { ...defaultFilters };
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

function todayFilenameDate(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function Hardware() {
  const persistedState = useMemo(() => loadListState(), []);
  const [laptops, setLaptops] = useState<Laptop[]>([]);
  const [view, setView] = useState<"active" | "archived">(
    persistedState?.view ?? "active",
  );
  const [loadedView, setLoadedView] = useState<"active" | "archived" | null>(null);
  const [search, setSearch] = useState(persistedState?.search ?? "");
  const [filters, setFilters] = useState<HardwareFilters>(
    persistedState?.filters ?? createDefaultFilters(),
  );
  const [sortState, setSortState] = useState<SortState>(
    persistedState?.sortState ?? { key: null, direction: null },
  );
  const [visibleKeys, setVisibleKeys] = useColumnPrefs(
    "catalogit:hardware:columns:v2",
    ALL_COLUMN_KEYS,
  );
  const { canEdit } = useAuth();

  useEffect(() => {
    let cancelled = false;
    client
      .get<Laptop[]>("/api/laptops/", { params: { archived: view === "archived" } })
      .then((r) => {
        if (!cancelled) {
          setLaptops(r.data);
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

  useEffect(() => {
    try {
      sessionStorage.setItem(
        LIST_STATE_STORAGE_KEY,
        JSON.stringify({ view, search, filters, sortState } satisfies HardwareListState),
      );
    } catch {
      // Ignore unavailable storage.
    }
  }, [filters, search, sortState, view]);

  const loading = loadedView !== view;

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    const nextRows = laptops.filter((laptop) => {
      const locName = laptop.hardware_location?.name?.trim() ?? "";
      const matchesSearch =
        !q ||
        laptop.serial_number.toLowerCase().includes(q) ||
        laptop.model_name.toLowerCase().includes(q) ||
        laptop.cpu.toLowerCase().includes(q) ||
        laptop.status.toLowerCase().includes(q) ||
        (laptop.hardware_status?.name ?? "").toLowerCase().includes(q) ||
        locName.toLowerCase().includes(q) ||
        getAssigneeName(laptop).toLowerCase().includes(q) ||
        operatingSystemLabel(laptop.operating_system).toLowerCase().includes(q);

      if (!matchesSearch) {
        return false;
      }

      return columnDefinitions.every((column) => {
        const cellValue = column.getFilterValue(laptop);
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
      const leftValue = getHardwareSortValue(activeColumn.getSortValue(left));
      const rightValue = getHardwareSortValue(activeColumn.getSortValue(right));
      const comparison = compareHardwareValues(leftValue, rightValue);
      return sortState.direction === "asc" ? comparison : -comparison;
    });
  }, [filters, laptops, search, sortState]);

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
    const rows = filtered.map((laptop) =>
      keysInOrder.map((key) => {
        const def = columnDefinitions.find((column) => column.key === key);
        return def ? def.getFilterValue(laptop) : "";
      }),
    );
    downloadCsvFile(
      `hardware-${todayFilenameDate()}.csv`,
      buildCsv(headers, rows),
    );
  }, [filtered, visibleKeys]);

  const hasActiveFilters = useMemo(() => {
    if (search.trim()) {
      return true;
    }
    return Object.values(filters).some((value) =>
      Array.isArray(value) ? value.length > 0 : value.trim(),
    );
  }, [filters, search]);

  const clearAllFilters = useCallback(() => {
    setSearch("");
    setFilters(createDefaultFilters());
    setSortState({ key: null, direction: null });
  }, []);

  const columns = useMemo<Column<Laptop>[]>(() => {
    return columnDefinitions.map((column) => {
      const sortDirection =
        sortState.key === column.key ? sortState.direction : null;

      return {
        key: column.key,
        label: column.label,
        render: column.render,
        header:
          column.filterType === "select" ? (
            <ColumnHeaderMenu
              label={column.label}
              filterType="select"
              filterOptions={column.getFilterOptions?.(laptops) ?? []}
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
  }, [filters, laptops, sortState]);

  return (
    <PageTransition>
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Hardware</h1>
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
              to="/hardware/new"
              className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-all duration-150 hover:bg-brand-700"
            >
              <PlusIcon className="h-4 w-4" />
              New Laptop
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
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <div className="min-w-[220px] max-w-sm flex-1">
              <SearchInput
                value={search}
                onChange={setSearch}
                placeholder="Search hardware..."
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
                  <span className="text-fg-3"> / {laptops.length} </span>
                  {laptops.length === 1 ? "laptop" : "laptops"}
                </>
              ) : (
                <>
                  {laptops.length} {laptops.length === 1 ? "laptop" : "laptops"}
                </>
              )}
            </p>
            <ColumnSelector
              columns={columns}
              visibleKeys={visibleKeys}
              onChange={setVisibleKeys}
            />
          </div>
          <DataTable
            columns={columns}
            data={filtered}
            visibleKeys={visibleKeys}
            striped
            primaryColumnKey="serial_number"
          />
        </>
      )}
    </div>
    </PageTransition>
  );
}
