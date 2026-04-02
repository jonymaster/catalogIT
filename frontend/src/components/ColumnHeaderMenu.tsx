import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export type SortDirection = "asc" | "desc";

interface Props {
  label: string;
  filterValue: string;
  filterType: "text" | "select";
  filterOptions?: string[];
  filterPlaceholder?: string;
  sortDirection: SortDirection | null;
  onFilterChange: (value: string) => void;
  onSortChange: (direction: SortDirection | null) => void;
}

export function ColumnHeaderMenu({
  label,
  filterValue,
  filterType,
  filterOptions = [],
  filterPlaceholder = `Filter ${label.toLowerCase()}...`,
  sortDirection,
  onFilterChange,
  onSortChange,
}: Props) {
  const [openMenu, setOpenMenu] = useState<"filter" | null>(null);
  const [menuPosition, setMenuPosition] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node;
      const clickedTrigger = ref.current?.contains(target);
      const clickedMenu = menuRef.current?.contains(target);

      if (!clickedTrigger && !clickedMenu) {
        closeMenu();
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  function closeMenu() {
    setOpenMenu(null);
    setMenuPosition(null);
  }

  function cycleSort() {
    if (sortDirection === null) {
      onSortChange("asc");
      return;
    }
    if (sortDirection === "asc") {
      onSortChange("desc");
      return;
    }
    onSortChange(null);
  }

  function toggleMenu(menu: "filter") {
    if (openMenu === menu) {
      closeMenu();
      return;
    }

    if (ref.current) {
      const rect = ref.current.getBoundingClientRect();
      setMenuPosition({
        top: rect.bottom + window.scrollY + 8,
        left: rect.left + window.scrollX,
        width: Math.max(rect.width + 48, 224),
      });
    }

    setOpenMenu(menu);
  }

  return (
    <div className="relative" ref={ref}>
      <div
        className="inline-flex items-center gap-1.5 rounded-md bg-white px-2 py-1 text-left text-xs font-medium uppercase tracking-wider text-gray-700 shadow-sm ring-1 ring-gray-200"
      >
        <button
          type="button"
          onClick={cycleSort}
          className="inline-flex items-center gap-1 rounded-md px-1 py-0.5 text-gray-700 transition-colors hover:bg-gray-100"
        >
          <span>{label}</span>
          <SortStateIcon sortDirection={sortDirection} />
        </button>
        <button
          type="button"
          aria-label={`Filter ${label}`}
          onClick={(event) => {
            event.stopPropagation();
            toggleMenu("filter");
          }}
          className={`rounded-md p-1 transition-colors ${
            filterValue
              ? "bg-gray-900 text-white"
              : "text-gray-500 hover:bg-gray-100 hover:text-gray-700"
          }`}
        >
          <FilterIcon />
        </button>
      </div>

      {openMenu === "filter" &&
        menuPosition &&
        createPortal(
          <div
            ref={menuRef}
            className="fixed z-50 rounded-md border border-gray-200 bg-white p-3 shadow-lg"
            style={{
              top: menuPosition.top,
              left: menuPosition.left,
              width: menuPosition.width,
            }}
          >
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
              Filter {label}
            </p>
            {filterType === "select" ? (
              <select
                value={filterValue}
                onChange={(event) => onFilterChange(event.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
              >
                <option value="">All</option>
                {filterOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={filterValue}
                onChange={(event) => onFilterChange(event.target.value)}
                placeholder={filterPlaceholder}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
              />
            )}
            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  onFilterChange("");
                  closeMenu();
                }}
                className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={closeMenu}
                className="rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-gray-800"
              >
                Done
              </button>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

function SortStateIcon({
  sortDirection,
}: {
  sortDirection: SortDirection | null;
}) {
  return (
    <svg
      className={`h-3.5 w-3.5 ${
        sortDirection ? "text-gray-900" : "text-gray-300"
      }`}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={2}
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d={
          sortDirection === "asc"
            ? "m8.25 15 3.75-6 3.75 6"
            : sortDirection === "desc"
              ? "m8.25 9 3.75 6 3.75-6"
              : "M12 7.5v9m0 0-3-3m3 3 3-3"
        }
      />
    </svg>
  );
}

function FilterIcon() {
  return (
    <svg
      className="h-3.5 w-3.5"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={2}
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4.5 6h15l-6 7.5v4.5l-3 1.5v-6L4.5 6z"
      />
    </svg>
  );
}
