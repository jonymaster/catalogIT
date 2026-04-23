import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import client from "../api/client";
import { useToast } from "../context/useToast";
import { XMarkIcon } from "./Icons";
import type { Tag } from "../types/models";
import { ColoredReferenceBadge } from "./Badge";

export const MAX_TAGS_PER_SERVICE = 5;
const MAX_TAG_NAME_LENGTH = 50;

interface Props {
  value: Tag[];
  onChange: (next: Tag[]) => void;
  disabled?: boolean;
}

interface ApiErrorDetail {
  response?: { data?: { detail?: string } };
}

function errorMessage(err: unknown, fallback: string): string {
  const detail = (err as ApiErrorDetail)?.response?.data?.detail;
  if (typeof detail === "string" && detail.trim()) return detail;
  if (err instanceof Error && err.message.trim()) return err.message;
  return fallback;
}

export function TagPicker({ value, onChange, disabled }: Props) {
  const { showToast } = useToast();
  const [allTags, setAllTags] = useState<Tag[] | null>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Load the workspace tag list once, lazily.
  useEffect(() => {
    let cancelled = false;
    client
      .get<Tag[]>("/api/tags/")
      .then((res) => {
        if (cancelled) return;
        setAllTags(res.data);
      })
      .catch(() => {
        if (cancelled) return;
        setAllTags([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Close on outside click.
  useEffect(() => {
    function handlePointer(event: MouseEvent) {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handlePointer);
    return () => document.removeEventListener("mousedown", handlePointer);
  }, []);

  const selectedIds = useMemo(
    () => new Set(value.map((tag) => tag.id)),
    [value],
  );

  const normalizedQuery = query.trim().toLowerCase();
  const atLimit = value.length >= MAX_TAGS_PER_SERVICE;

  const suggestions = useMemo(() => {
    if (!allTags) return [];
    return allTags
      .filter((tag) => !selectedIds.has(tag.id))
      .filter((tag) =>
        normalizedQuery
          ? tag.name.toLowerCase().includes(normalizedQuery)
          : true,
      )
      .slice(0, 20);
  }, [allTags, selectedIds, normalizedQuery]);

  const exactMatch = useMemo(() => {
    if (!allTags || !normalizedQuery) return null;
    return (
      allTags.find((tag) => tag.name.toLowerCase() === normalizedQuery) ?? null
    );
  }, [allTags, normalizedQuery]);

  const canCreate =
    !disabled &&
    !atLimit &&
    normalizedQuery.length > 0 &&
    normalizedQuery.length <= MAX_TAG_NAME_LENGTH &&
    !normalizedQuery.includes(",") &&
    !exactMatch;

  const addTag = useCallback(
    (tag: Tag) => {
      if (selectedIds.has(tag.id)) return;
      if (value.length >= MAX_TAGS_PER_SERVICE) {
        showToast({
          type: "error",
          text: `A service can have at most ${MAX_TAGS_PER_SERVICE} tags.`,
        });
        return;
      }
      onChange([...value, tag]);
      setQuery("");
      inputRef.current?.focus();
    },
    [onChange, selectedIds, showToast, value],
  );

  const removeTag = useCallback(
    (id: string) => {
      onChange(value.filter((tag) => tag.id !== id));
    },
    [onChange, value],
  );

  const createAndAdd = useCallback(async () => {
    if (!canCreate || !normalizedQuery) return;
    const name = query.trim();
    setCreating(true);
    try {
      const res = await client.post<Tag>("/api/tags/", { name });
      const created = res.data;
      setAllTags((prev) => (prev ? [...prev, created] : [created]));
      addTag(created);
    } catch (err) {
      showToast({
        type: "error",
        text: errorMessage(err, "Failed to create tag."),
      });
    } finally {
      setCreating(false);
    }
  }, [addTag, canCreate, normalizedQuery, query, showToast]);

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      if (suggestions.length > 0) {
        addTag(suggestions[0]);
      } else if (canCreate) {
        void createAndAdd();
      }
    } else if (event.key === "Backspace" && query === "" && value.length > 0) {
      removeTag(value[value.length - 1].id);
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <div
        className={`flex min-h-[2.25rem] flex-wrap items-center gap-1.5 rounded-md border px-2 py-1.5 transition-shadow ${
          disabled
            ? "border-border bg-surface-2 opacity-60"
            : "border-border-strong bg-surface focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/30"
        }`}
        onClick={() => {
          if (!disabled) {
            inputRef.current?.focus();
            setOpen(true);
          }
        }}
      >
        {value.map((tag) => (
          <span
            key={tag.id}
            className="inline-flex items-center gap-1"
            onClick={(event) => event.stopPropagation()}
          >
            <ColoredReferenceBadge label={tag.name} color={tag.color} />
            {!disabled && (
              <button
                type="button"
                aria-label={`Remove ${tag.name}`}
                onClick={() => removeTag(tag.id)}
                className="inline-flex h-4 w-4 items-center justify-center rounded-full text-fg-3 hover:bg-surface-2 hover:text-fg"
              >
                <XMarkIcon className="h-3 w-3" />
              </button>
            )}
          </span>
        ))}
        {!disabled && (
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onFocus={() => setOpen(true)}
            onKeyDown={handleKeyDown}
            placeholder={
              value.length === 0
                ? "Add tags…"
                : atLimit
                  ? ""
                  : "Add another…"
            }
            disabled={atLimit}
            maxLength={MAX_TAG_NAME_LENGTH}
            className="min-w-[8rem] flex-1 bg-transparent text-sm text-fg placeholder:text-fg-4 focus:outline-none disabled:cursor-not-allowed"
          />
        )}
      </div>
      <div className="mt-1 text-[11px] text-fg-3">
        {atLimit
          ? `Maximum of ${MAX_TAGS_PER_SERVICE} tags reached.`
          : `${value.length} / ${MAX_TAGS_PER_SERVICE} tags`}
      </div>

      {open && !disabled && (
        <div className="absolute z-30 mt-1 w-full max-w-md overflow-hidden rounded-md border border-border bg-surface shadow-lg">
          {allTags === null ? (
            <div className="px-3 py-2 text-xs text-fg-3">Loading tags…</div>
          ) : (
            <ul className="max-h-60 overflow-y-auto py-1">
              {suggestions.map((tag) => (
                <li key={tag.id}>
                  <button
                    type="button"
                    onClick={() => addTag(tag)}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-surface-2"
                  >
                    <ColoredReferenceBadge
                      label={tag.name}
                      color={tag.color}
                    />
                  </button>
                </li>
              ))}
              {suggestions.length === 0 && !canCreate && (
                <li className="px-3 py-2 text-xs text-fg-3">
                  {normalizedQuery
                    ? "No matching tags."
                    : allTags.length === 0
                      ? "No tags yet — type to create one."
                      : "Start typing to filter tags."}
                </li>
              )}
              {canCreate && (
                <li>
                  <button
                    type="button"
                    disabled={creating}
                    onClick={() => {
                      void createAndAdd();
                    }}
                    className="flex w-full items-center gap-2 border-t border-border px-3 py-1.5 text-left text-sm text-accent hover:bg-surface-2 disabled:opacity-60"
                  >
                    {creating ? "Creating…" : `Create "${query.trim()}"`}
                  </button>
                </li>
              )}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
