import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import client from "../api/client";
import { ClassificationBadge, CriticalityBadge } from "../components/Badge";
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
import type { Service } from "../types/models";
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

type ServiceFilters = Record<string, string>;

interface SortState {
  key: string | null;
  direction: SortDirection | null;
}

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
    getFilterValue: (service) => service.status,
    getSortValue: (service) => service.status,
    getFilterOptions: (services) =>
      getUniqueOptions(services.map((service) => service.status)),
    render: (service) => <StatusBadge status={service.status} />,
  },
  {
    key: "category",
    label: "Category",
    filterType: "select",
    getFilterValue: (service) => categoryLabel(service),
    getSortValue: (service) => categoryLabel(service),
    getFilterOptions: (services) =>
      getUniqueOptions(services.map((service) => categoryLabel(service))),
  },
  {
    key: "license_type",
    label: "License",
    filterType: "select",
    getFilterValue: (service) => service.license_type,
    getSortValue: (service) => service.license_type,
    getFilterOptions: (services) =>
      getUniqueOptions(services.map((service) => service.license_type)),
  },
  {
    key: "classification",
    label: "Classification",
    filterType: "select",
    getFilterValue: (service) => service.classification ?? "--",
    getSortValue: (service) => service.classification ?? "",
    getFilterOptions: (services) =>
      getUniqueOptions(
        services.map((service) => service.classification ?? "--"),
      ),
    render: (service) => <ClassificationBadge value={service.classification} />,
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
    render: (service) => getBooleanLabel(service.nonprofit_pricing),
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
    key: "billing_schedule",
    label: "Billing Schedule",
    filterType: "select",
    getFilterValue: (service) =>
      service.billing_schedule.trim() ? service.billing_schedule.trim() : "--",
    getSortValue: (service) => service.billing_schedule ?? "",
    getFilterOptions: (services) =>
      getUniqueOptions(
        services.map((service) =>
          service.billing_schedule.trim() ? service.billing_schedule.trim() : "--",
        ),
      ),
    render: (service) =>
      service.billing_schedule.trim() ? service.billing_schedule.trim() : "--",
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
    render: (service) => getBooleanLabel(service.sso_integrated),
  },
  {
    key: "scim_enabled",
    label: "SCIM",
    filterType: "select",
    getFilterValue: getScimLabel,
    getSortValue: (service) => service.scim_enabled ?? false,
    getFilterOptions: () => ["--", "No", "Yes"],
    render: getScimLabel,
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
    render: (service) => getOwnerNames(service) || "--",
  },
];

const ALL_COLUMN_KEYS = columnDefinitions.map((column) => column.key);

export function Services() {
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<ServiceFilters>(() =>
    Object.fromEntries(
      columnDefinitions.map((column) => [column.key, ""]),
    ) as ServiceFilters,
  );
  const [sortState, setSortState] = useState<SortState>({
    key: null,
    direction: null,
  });
  const [visibleKeys, setVisibleKeys] = useColumnPrefs(
    "catalogit:services:columns",
    ALL_COLUMN_KEYS,
  );
  const { canEdit, preferences } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    client
      .get<Service[]>("/api/services/")
      .then((r) => setServices(r.data))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    const nextRows = services.filter((service) => {
      const matchesSearch =
        !q ||
        service.name.toLowerCase().includes(q) ||
        categoryLabel(service).toLowerCase().includes(q) ||
        service.license_type.toLowerCase().includes(q) ||
        service.status.toLowerCase().includes(q) ||
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
        const filterValue = filters[column.key]?.trim();
        if (!filterValue) {
          return true;
        }

        const cellValue = column.getFilterValue(service);
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
      const leftValue = getServiceSortValue(activeColumn.getSortValue(left));
      const rightValue = getServiceSortValue(activeColumn.getSortValue(right));
      const comparison = compareServiceValues(leftValue, rightValue);
      return sortState.direction === "asc" ? comparison : -comparison;
    });
  }, [filters, search, services, sortState]);

  const columns = useMemo<Column<Service>[]>(() => {
    return columnDefinitions.map((column) => {
      const sortDirection =
        sortState.key === column.key ? sortState.direction : null;

      return {
        key: column.key,
        label: column.label,
        render:
          column.key === "renewal_date"
            ? (service) => formatDateOnly(service.renewal_date, preferences)
            : column.render,
        header: (
          <ColumnHeaderMenu
            label={column.label}
            filterType={column.filterType}
            filterValue={filters[column.key] ?? ""}
            filterPlaceholder={column.filterPlaceholder}
            filterOptions={column.getFilterOptions?.(services)}
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
  }, [filters, preferences, services, sortState]);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900">Services</h1>
        {canEdit && (
          <Link
            to="/services/new"
            className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
          >
            New Service
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
                placeholder="Search services..."
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
            onRowClick={(s) => navigate(`/services/${s.id}`)}
          />
        </>
      )}
    </div>
  );
}
