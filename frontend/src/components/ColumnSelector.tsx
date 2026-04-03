import { useState, useRef, useEffect, useMemo } from "react";
import type { Column } from "./DataTable";

interface Props<T> {
  columns: Column<T>[];
  visibleKeys: string[];
  onChange: (keys: string[]) => void;
}

function reorder(keys: string[], fromIndex: number, toIndex: number): string[] {
  if (
    fromIndex === toIndex ||
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= keys.length ||
    toIndex >= keys.length
  ) {
    return keys;
  }
  const next = [...keys];
  const [item] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, item);
  return next;
}

function columnLabel<T>(col: Column<T>) {
  return col.label ?? (typeof col.header === "string" ? col.header : col.key);
}

export function ColumnSelector<T>({
  columns,
  visibleKeys,
  onChange,
}: Props<T>) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const [dragFrom, setDragFrom] = useState<number | null>(null);

  const hiddenColumns = useMemo(
    () => columns.filter((c) => !visibleKeys.includes(c.key)),
    [columns, visibleKeys],
  );

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function toggle(key: string) {
    if (visibleKeys.includes(key)) {
      if (visibleKeys.length <= 1) return;
      onChange(visibleKeys.filter((k) => k !== key));
    } else {
      onChange([...visibleKeys, key]);
    }
  }

  function move(fromIndex: number, toIndex: number) {
    onChange(reorder(visibleKeys, fromIndex, toIndex));
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
      >
        <svg
          className="h-4 w-4 text-gray-500"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={2}
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75"
          />
        </svg>
        Columns
      </button>

      {open && (
        <div className="absolute right-0 z-20 mt-1 max-h-[min(70vh,28rem)] w-80 overflow-y-auto rounded-md border border-gray-200 bg-white py-1 shadow-lg">
          <div className="px-3 py-2 text-xs font-semibold tracking-wide text-gray-500 uppercase">
            Visible (drag to reorder)
          </div>
          {visibleKeys.map((key, index) => {
            const col = columns.find((c) => c.key === key);
            if (!col) return null;
            return (
              <div
                key={key}
                className="flex items-center gap-1 border-b border-gray-50 px-2 py-1.5 last:border-b-0"
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  const raw = e.dataTransfer.getData("text/plain");
                  const from = Number.parseInt(raw, 10);
                  if (Number.isNaN(from)) return;
                  onChange(reorder(visibleKeys, from, index));
                  setDragFrom(null);
                }}
              >
                <span
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData("text/plain", String(index));
                    e.dataTransfer.effectAllowed = "move";
                    setDragFrom(index);
                  }}
                  onDragEnd={() => setDragFrom(null)}
                  className="inline-flex shrink-0 cursor-grab touch-none rounded p-0.5 text-gray-400 active:cursor-grabbing hover:bg-gray-100 hover:text-gray-600"
                  aria-label={`Drag ${columnLabel(col)}`}
                >
                  <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
                    <circle cx="9" cy="8" r="1.5" />
                    <circle cx="15" cy="8" r="1.5" />
                    <circle cx="9" cy="12" r="1.5" />
                    <circle cx="15" cy="12" r="1.5" />
                    <circle cx="9" cy="16" r="1.5" />
                    <circle cx="15" cy="16" r="1.5" />
                  </svg>
                </span>
                <span
                  className={`min-w-0 flex-1 truncate text-sm text-gray-700 ${
                    dragFrom === index ? "opacity-50" : ""
                  }`}
                >
                  {columnLabel(col)}
                </span>
                <div className="flex shrink-0 flex-col gap-0">
                  <button
                    type="button"
                    disabled={index === 0}
                    onClick={() => move(index, index - 1)}
                    className="rounded px-1 text-gray-500 hover:bg-gray-100 hover:text-gray-800 disabled:cursor-not-allowed disabled:opacity-30"
                    aria-label={`Move ${columnLabel(col)} up`}
                  >
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    disabled={index === visibleKeys.length - 1}
                    onClick={() => move(index, index + 1)}
                    className="rounded px-1 text-gray-500 hover:bg-gray-100 hover:text-gray-800 disabled:cursor-not-allowed disabled:opacity-30"
                    aria-label={`Move ${columnLabel(col)} down`}
                  >
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                    </svg>
                  </button>
                </div>
                <label className="flex shrink-0 cursor-pointer items-center pl-1">
                  <input
                    type="checkbox"
                    checked
                    onChange={() => toggle(key)}
                    className="h-3.5 w-3.5 rounded border-gray-300 text-gray-900 focus:ring-gray-500"
                  />
                </label>
              </div>
            );
          })}

          <div className="mt-1 border-t border-gray-200 px-3 py-2 text-xs font-semibold tracking-wide text-gray-500 uppercase">
            Hidden
          </div>
          {hiddenColumns.length === 0 ? (
            <div className="px-3 pb-2 text-xs text-gray-400">All columns are visible</div>
          ) : (
            hiddenColumns.map((col) => (
              <label
                key={col.key}
                className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
              >
                <input
                  type="checkbox"
                  checked={false}
                  onChange={() => toggle(col.key)}
                  className="h-3.5 w-3.5 rounded border-gray-300 text-gray-900 focus:ring-gray-500"
                />
                {columnLabel(col)}
              </label>
            ))
          )}
        </div>
      )}
    </div>
  );
}
