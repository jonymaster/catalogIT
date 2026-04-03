import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import client from "../api/client";
import {
  ColumnHeaderMenu,
  type SortDirection,
} from "../components/ColumnHeaderMenu";
import { ColumnSelector } from "../components/ColumnSelector";
import type { Column } from "../components/DataTable";
import { DataTable } from "../components/DataTable";
import { SearchInput } from "../components/SearchInput";
import { StatusBadge } from "../components/StatusBadge";
import { useAuth } from "../context/useAuth";
import { useColumnPrefs } from "../hooks/useColumnPrefs";
import type { Laptop } from "../types/models";

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

type HardwareFilters = Record<string, string>;

interface SortState {
  key: string | null;
  direction: SortDirection | null;
}

function getAssigneeName(laptop: Laptop) {
  return laptop.assigned_to
    ? `${laptop.assigned_to.first_name} ${laptop.assigned_to.last_name}`
    : "--";
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
    getFilterValue: (laptop) => laptop.status,
    getSortValue: (laptop) => laptop.status,
    getFilterOptions: (laptops) =>
      getUniqueOptions(laptops.map((laptop) => laptop.status)),
    render: (laptop) => <StatusBadge status={laptop.status} />,
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
    render: getAssigneeName,
  },
];

const ALL_COLUMN_KEYS = columnDefinitions.map((column) => column.key);

export function Hardware() {
  const [laptops, setLaptops] = useState<Laptop[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<HardwareFilters>(() =>
    Object.fromEntries(
      columnDefinitions.map((column) => [column.key, ""]),
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
    client
      .get<Laptop[]>("/api/laptops/")
      .then((r) => setLaptops(r.data))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    const nextRows = laptops.filter((laptop) => {
      const matchesSearch =
        !q ||
        laptop.serial_number.toLowerCase().includes(q) ||
        laptop.model_name.toLowerCase().includes(q) ||
        laptop.cpu.toLowerCase().includes(q) ||
        laptop.status.toLowerCase().includes(q) ||
        getAssigneeName(laptop).toLowerCase().includes(q);

      if (!matchesSearch) {
        return false;
      }

      return columnDefinitions.every((column) => {
        const filterValue = filters[column.key]?.trim();
        if (!filterValue) {
          return true;
        }

        const cellValue = column.getFilterValue(laptop);
        if (column.filterType === "select") {
          return cellValue === filterValue;
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

  const columns = useMemo<Column<Laptop>[]>(() => {
    return columnDefinitions.map((column) => {
      const sortDirection =
        sortState.key === column.key ? sortState.direction : null;

      return {
        key: column.key,
        label: column.label,
        render: column.render,
        header: (
          <ColumnHeaderMenu
            label={column.label}
            filterType={column.filterType}
            filterValue={filters[column.key] ?? ""}
            filterPlaceholder={column.filterPlaceholder}
            filterOptions={column.getFilterOptions?.(laptops)}
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
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900">Hardware</h1>
        {canEdit && (
          <Link
            to="/hardware/new"
            className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
          >
            New Laptop
          </Link>
        )}
      </div>
      {loading ? (
        <p className="text-sm text-gray-500">Loading...</p>
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
            onRowClick={(l) => navigate(`/hardware/${l.id}`)}
          />
        </>
      )}
    </div>
  );
}
