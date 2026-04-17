import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
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
import { ColoredReferenceBadge } from "../components/Badge";
import { StatusBadge } from "../components/StatusBadge";
import { UserLink } from "../components/UserLinks";
import { useAuth } from "../context/useAuth";
import { useColumnPrefs } from "../hooks/useColumnPrefs";
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
  render?: (laptop: Laptop) => React.ReactNode;
}

type HardwareFilters = Record<string, string | string[]>;

interface SortState {
  key: string | null;
  direction: SortDirection | null;
}

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

function todayFilenameDate(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function Hardware() {
  const [laptops, setLaptops] = useState<Laptop[]>([]);
  const [view, setView] = useState<"active" | "archived">("active");
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<HardwareFilters>(() =>
    Object.fromEntries(
      columnDefinitions.map((column) => [
        column.key,
        column.filterType === "select" ? [] : "",
      ]),
    ) as HardwareFilters,
  );
  const [sortState, setSortState] = useState<SortState>({
    key: null,
    direction: null,
  });
  const [visibleKeys, setVisibleKeys] = useColumnPrefs(
    "catalogit:hardware:columns",
    ALL_COLUMN_KEYS,
  );
  const { canEdit } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    setLoading(true);
    client
      .get<Laptop[]>("/api/laptops/", { params: { archived: view === "archived" } })
      .then((r) => setLaptops(r.data))
      .finally(() => setLoading(false));
  }, [view]);

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
        getAssigneeName(laptop).toLowerCase().includes(q);

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
          <div className="mb-4 flex items-center gap-3">
            <div className="max-w-sm flex-1">
              <SearchInput
                value={search}
                onChange={setSearch}
                placeholder="Search hardware..."
              />
            </div>
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
            onRowClick={(l) => navigate(`/hardware/${l.id}`)}
          />
        </>
      )}
    </div>
    </PageTransition>
  );
}
