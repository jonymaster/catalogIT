import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export type SortDirection = "asc" | "desc";

type BaseProps = {
  label: string;
  sortDirection: SortDirection | null;
  onSortChange: (direction: SortDirection | null) => void;
};

type TextFilterProps = BaseProps & {
  filterType: "text";
  filterValue: string;
  filterPlaceholder?: string;
  onFilterChange: (value: string) => void;
};

type SelectFilterProps = BaseProps & {
  filterType: "select";
  filterOptions: string[];
  selectedValues: string[];
  onSelectedValuesChange: (values: string[]) => void;
};

export type ColumnHeaderMenuProps = TextFilterProps | SelectFilterProps;

function toggleSelected(current: string[], option: string): string[] {
  if (current.includes(option)) {
    return current.filter((value) => value !== option);
  }
  return [...current, option];
}

export function ColumnHeaderMenu(props: ColumnHeaderMenuProps) {
  const {
    label,
    sortDirection,
    onSortChange,
    filterType,
  } = props;

  const filterActive =
    filterType === "text"
      ? Boolean(props.filterValue.trim())
      : props.selectedValues.length > 0;

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
        width: Math.max(rect.width + 48, 240),
      });
    }

    setOpenMenu(menu);
  }

  function clearFilter() {
    if (filterType === "text") {
      props.onFilterChange("");
    } else {
      props.onSelectedValuesChange([]);
    }
    closeMenu();
  }

  const filterPlaceholder =
    filterType === "text"
      ? props.filterPlaceholder ?? `Filter ${label.toLowerCase()}...`
      : "";

  return (
    <div className="relative" ref={ref}>
      <div
        className="inline-flex items-center gap-1.5 rounded-md bg-white dark:bg-gray-900 px-2 py-1 text-left text-xs font-medium uppercase tracking-wider text-gray-700 dark:text-gray-200 shadow-sm ring-1 ring-gray-200 dark:ring-gray-700"
      >
        <button
          type="button"
          onClick={cycleSort}
          className="inline-flex items-center gap-1 rounded-md px-1 py-0.5 text-gray-700 dark:text-gray-200 transition-colors hover:bg-gray-100 dark:hover:bg-gray-800"
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
            filterActive
              ? "bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900"
              : "text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-700 dark:hover:text-gray-200"
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
            className="fixed z-50 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-3 shadow-lg"
            style={{
              top: menuPosition.top,
              left: menuPosition.left,
              width: menuPosition.width,
            }}
          >
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
              Filter {label}
            </p>
            {filterType === "select" ? (
              <div className="max-h-60 space-y-1 overflow-y-auto pr-1">
                {props.filterOptions.length === 0 ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400">No values</p>
                ) : (
                  props.filterOptions.map((option) => (
                    <label
                      key={option}
                      className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm text-gray-900 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-800"
                    >
                      <input
                        type="checkbox"
                        className="h-4 w-4 shrink-0 rounded border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 focus:ring-gray-500 dark:focus:ring-gray-400 dark:ring-gray-400"
                        checked={props.selectedValues.includes(option)}
                        onChange={() =>
                          props.onSelectedValuesChange(
                            toggleSelected(props.selectedValues, option),
                          )
                        }
                      />
                      <span className="min-w-0 truncate" title={option}>
                        {option}
                      </span>
                    </label>
                  ))
                )}
              </div>
            ) : (
              <input
                type="text"
                value={props.filterValue}
                onChange={(event) => props.onFilterChange(event.target.value)}
                placeholder={filterPlaceholder}
                className="w-full rounded-md border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:border-gray-500 dark:focus:border-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-500 dark:focus:ring-gray-400 dark:ring-gray-400"
              />
            )}
            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                onClick={clearFilter}
                className="rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-200 transition-colors hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={closeMenu}
                className="rounded-md bg-gray-900 dark:bg-gray-100 px-3 py-1.5 text-sm font-medium text-white dark:text-gray-900 transition-colors hover:bg-gray-800 dark:hover:bg-gray-200"
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
        sortDirection ? "text-gray-900 dark:text-gray-100" : "text-gray-300"
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
