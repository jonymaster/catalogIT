import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import client from "../api/client";
import { Badge } from "../components/Badge";
import { ChevronDownIcon, ChevronRightIcon } from "../components/Icons";
import { PageTransition } from "../components/PageTransition";
import { Button } from "../components/ui/Button";
import { useAuth } from "../context/useAuth";
import {
  FISCAL_YEAR_CLOSE_API,
  type FiscalYearCloseBatch,
  type FiscalYearCloseExecuteResponse,
  type FiscalYearClosePreview,
  type FiscalYearCloseRevertResponse,
} from "../types/fiscalYearClose";
import type { UserPreferences } from "../types/models";
import { formatDateTime } from "../utils/formatting";
import {
  apiErrorDetail,
  buildExecuteRequest,
  centsToInput,
  costsReportPathForYear,
  derivePlan,
  flagDescription,
  flagLabel,
  formatCents,
  initialEdits,
  keepWithOnlyFlagged,
  MAX_BATCH_TOTAL_CENTS,
  MIN_FISCAL_YEAR,
  parseFiscalYear,
  parseUplift,
  parseUtcTimestamp,
  skipReasonLabel,
  toCents,
  type CloseEdits,
  type ConversionEdit,
  type NextYearEdit,
  type ServiceDerived,
} from "../utils/fiscalYearClose";

type Step = "pick" | "review" | "confirm" | "done";

const STEPS: { id: Step; label: string }[] = [
  { id: "pick", label: "Pick year" },
  { id: "review", label: "Review" },
  { id: "confirm", label: "Confirm" },
  { id: "done", label: "Done" },
];

/**
 * How many past years the year picker lists, counting the current one. Older
 * years (down to MIN_FISCAL_YEAR) are typed after choosing "Other year".
 */
const PICKER_YEARS = 15;
const OTHER_YEAR = "other";

const PLAN_CHANGED_NOTICE =
  "Cost records changed since the preview was loaded. The preview was reloaded and your edits were reset. Review it and confirm again.";

const inputCls =
  "block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100";
const labelCls = "block text-sm font-medium text-gray-700 dark:text-gray-200";
const checkboxCls =
  "rounded border-gray-300 text-brand-600 focus:ring-brand-500 disabled:opacity-40 dark:border-gray-600 dark:bg-gray-900";
const cardCls =
  "rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900";
const thCls =
  "px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400";

function amountInputCls(invalid: boolean): string {
  return [
    "w-32 rounded-md border px-2 py-1 text-right text-sm tabular-nums text-gray-900 focus:outline-none focus:ring-2 dark:bg-gray-900 dark:text-gray-100",
    invalid
      ? "border-red-500 focus:border-red-500 focus:ring-red-500/20"
      : "border-gray-300 focus:border-brand-500 focus:ring-brand-500/30 dark:border-gray-600",
  ].join(" ");
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

function formatPct(pct: number): string {
  return `${pct > 0 ? "+" : ""}${pct}%`;
}

const TIMESTAMP_OPTIONS: Intl.DateTimeFormatOptions = {
  dateStyle: "medium",
  timeStyle: "short",
};

/** Formats a UTC API timestamp in the user's time zone; shows it raw if unparsable. */
function formatTimestamp(value: string, preferences: UserPreferences | null): string {
  const date = parseUtcTimestamp(value);
  return Number.isNaN(date.getTime())
    ? value
    : formatDateTime(date, preferences, TIMESTAMP_OPTIONS);
}

type NoticeTone = "warn" | "error" | "info" | "success";

const NOTICE_CLASSES: Record<NoticeTone, string> = {
  warn: "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200",
  error:
    "border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300",
  info: "border-blue-200 bg-blue-50 text-blue-900 dark:border-blue-900/60 dark:bg-blue-950/40 dark:text-blue-200",
  success:
    "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-200",
};

function Notice({ tone, children }: { tone: NoticeTone; children: ReactNode }) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={`rounded-md border px-3 py-2 text-sm ${NOTICE_CLASSES[tone]}`}
    >
      {children}
    </div>
  );
}

function StepIndicator({ step }: { step: Step }) {
  const activeIndex = STEPS.findIndex((s) => s.id === step);
  return (
    <ol aria-label="Wizard steps" className="flex flex-wrap items-center gap-2 text-sm">
      {STEPS.map((s, index) => {
        const active = index === activeIndex;
        const done = index < activeIndex;
        return (
          <li
            key={s.id}
            aria-current={active ? "step" : undefined}
            className={`flex items-center gap-2 rounded-full px-3 py-1 ${
              active
                ? "bg-brand-600 text-white"
                : done
                  ? "bg-accent-soft text-accent"
                  : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300"
            }`}
          >
            <span className="tabular-nums font-semibold">{index + 1}</span>
            <span>{s.label}</span>
          </li>
        );
      })}
    </ol>
  );
}

function FlagBadges({ flags }: { flags: string[] }) {
  if (flags.length === 0) return null;
  return (
    <span className="flex flex-wrap gap-1">
      {flags.map((flag) => (
        <span key={flag} title={flagDescription(flag)}>
          <Badge color="amber">{flagLabel(flag)}</Badge>
        </span>
      ))}
    </span>
  );
}

function SummaryCard({
  label,
  value,
  sub,
  testId,
}: {
  label: string;
  value: string;
  sub?: string;
  testId?: string;
}) {
  return (
    <div className="rounded-[10px] border border-border bg-surface px-4 py-3">
      <dt
        className="text-[11px] font-semibold uppercase text-fg-3"
        style={{ letterSpacing: "0.06em" }}
      >
        {label}
      </dt>
      <dd
        className="tnum mt-1 text-fg"
        style={{ fontSize: 20, fontWeight: 600, letterSpacing: "-0.02em" }}
        data-testid={testId}
      >
        {value}
      </dd>
      {sub && <dd className="mt-0.5 text-[12px] text-fg-3">{sub}</dd>}
    </div>
  );
}

interface RevertTarget {
  id: string;
  fiscal_year: number;
  converted_count: number;
  created_count: number;
  /** Null when not known yet (the batch list has not been reloaded). */
  changed_since_close: number | null;
}

function revertConfirmMessage(target: RevertTarget): string {
  const lines = [
    `Revert the FY${target.fiscal_year} close?`,
    "",
    `${plural(target.converted_count, "converted record")} go back to estimated and keep their current amount.`,
    `${plural(target.created_count, "record")} created for FY${target.fiscal_year + 1} will be deleted.`,
  ];
  if (target.changed_since_close != null) {
    lines.push(
      "",
      target.changed_since_close > 0
        ? `${plural(target.changed_since_close, "record")} of this close changed after the close. They are reverted anyway.`
        : "No record of this close changed after the close.",
    );
  }
  return lines.join("\n");
}

function PreviousCloses({
  batches,
  error,
  revertingId,
  preferences,
  onRevert,
}: {
  batches: FiscalYearCloseBatch[] | null;
  error: string | null;
  revertingId: string | null;
  preferences: UserPreferences | null;
  onRevert: (batch: FiscalYearCloseBatch) => void;
}) {
  if (error) {
    return <p className="text-sm text-red-600">{error}</p>;
  }
  if (batches === null) {
    return <p className="text-sm text-gray-500 dark:text-gray-400">Loading...</p>;
  }
  if (batches.length === 0) {
    return (
      <p className="text-sm text-gray-500 dark:text-gray-400">No previous closes yet.</p>
    );
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-800">
      <table className="min-w-full divide-y divide-gray-200 text-sm dark:divide-gray-700">
        <thead className="bg-gray-50 dark:bg-gray-950">
          <tr>
            <th className={thCls}>Year</th>
            <th className={thCls}>Closed</th>
            <th className={`${thCls} text-right`}>Converted</th>
            <th className={`${thCls} text-right`}>Created</th>
            <th className={`${thCls} text-right`}>Uplift</th>
            <th className={thCls}>Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-900">
          {batches.map((batch) => (
            <tr key={batch.id} className={batch.reverted_at ? "text-fg-3" : "text-fg"}>
              <td className="whitespace-nowrap px-4 py-3 font-medium">
                FY{batch.fiscal_year}
              </td>
              <td className="px-4 py-3">
                <div>{formatTimestamp(batch.created_at, preferences)}</div>
                <div className="text-xs text-fg-3">
                  by {batch.created_by_name ?? "unknown user"}
                </div>
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">
                <div>{formatCents(toCents(batch.converted_total))}</div>
                <div className="text-xs text-fg-3">
                  {plural(batch.converted_count, "record")}
                </div>
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">
                <div>{formatCents(toCents(batch.next_year_total))}</div>
                <div className="text-xs text-fg-3">
                  {plural(batch.created_count, "record")} in FY{batch.fiscal_year + 1}
                </div>
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">
                {formatPct(batch.uplift_pct)}
              </td>
              <td className="px-4 py-3">
                {batch.reverted_at ? (
                  <div>
                    <div>Reverted {formatTimestamp(batch.reverted_at, preferences)}</div>
                    <div className="text-xs">by {batch.reverted_by_name ?? "unknown user"}</div>
                  </div>
                ) : (
                  <div className="flex flex-col items-start gap-1">
                    <button
                      type="button"
                      disabled={revertingId !== null}
                      onClick={() => onRevert(batch)}
                      aria-label={`Revert FY${batch.fiscal_year} close`}
                      className="rounded-md border border-red-300 px-3 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-60 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950/40"
                    >
                      {revertingId === batch.id ? "Reverting..." : "Revert"}
                    </button>
                    {batch.changed_since_close > 0 && (
                      <span className="text-xs text-amber-700 dark:text-amber-300">
                        {plural(batch.changed_since_close, "record")} changed since
                      </span>
                    )}
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function NextYearCell({
  row,
  nextFiscalYear,
  onChange,
}: {
  row: ServiceDerived;
  nextFiscalYear: number;
  onChange: (patch: Partial<NextYearEdit>) => void;
}) {
  const name = row.service.service_name;
  if (row.nextStatus === "next_year_exists") {
    return (
      <span className="text-xs text-fg-3">
        Skipped: FY{nextFiscalYear} already has records
      </span>
    );
  }
  const overridden = row.nextEdit.amount !== null;
  const invalid = row.nextError !== null;
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          className={checkboxCls}
          checked={row.nextStatus === "create"}
          disabled={row.nextStatus === "zero_amount"}
          onChange={(e) => onChange({ include: e.target.checked })}
          aria-label={`Create FY${nextFiscalYear} estimate for ${name}`}
        />
        <input
          type="text"
          inputMode="decimal"
          autoComplete="off"
          className={amountInputCls(invalid)}
          value={row.nextEdit.amount ?? centsToInput(row.computedNextCents)}
          onChange={(e) => onChange({ amount: e.target.value })}
          aria-label={`FY${nextFiscalYear} amount for ${name}`}
          aria-invalid={invalid}
        />
        {overridden && (
          <button
            type="button"
            onClick={() => onChange({ amount: null })}
            className="text-xs font-medium text-accent hover:underline"
            aria-label={`Use computed FY${nextFiscalYear} amount for ${name}`}
          >
            Reset
          </button>
        )}
      </div>
      {row.nextError !== null ? (
        <p className="text-xs text-red-600">{row.nextError}</p>
      ) : row.nextStatus === "zero_amount" ? (
        // Invalid estimate amounts count as 0, so the amount is not known yet.
        row.conversionErrorCount > 0 ? null : (
          <p className="text-xs text-fg-3">Amount is zero, so no estimate is created.</p>
        )
      ) : row.nextStatus === "excluded" ? (
        <p className="text-xs text-fg-3">Not created.</p>
      ) : overridden ? (
        <p className="text-xs text-fg-3">Computed: {formatCents(row.computedNextCents)}</p>
      ) : null}
    </div>
  );
}

function ServiceRows({
  row,
  nextFiscalYear,
  expanded,
  onToggle,
  onConversionChange,
  onNextYearChange,
}: {
  row: ServiceDerived;
  nextFiscalYear: number;
  expanded: boolean;
  onToggle: () => void;
  onConversionChange: (recordId: string, patch: Partial<ConversionEdit>) => void;
  onNextYearChange: (patch: Partial<NextYearEdit>) => void;
}) {
  const { service } = row;
  const name = service.service_name;
  const hasConversions = row.conversions.length > 0;
  // Errors in collapsed estimate rows are flagged on the service row.
  const errorId = `close-errors-${service.service_id}`;
  const conversionErrors = row.conversionErrorCount > 0;
  return (
    <tbody className="border-t border-gray-200 dark:border-gray-700">
      <tr className="align-top">
        <td className="px-4 py-3">
          <div className="flex items-start gap-2">
            {hasConversions ? (
              <button
                type="button"
                onClick={onToggle}
                aria-expanded={expanded}
                aria-label={`${expanded ? "Hide" : "Show"} estimates for ${name}`}
                aria-describedby={conversionErrors ? errorId : undefined}
                className={`mt-0.5 rounded ${
                  conversionErrors
                    ? "text-red-600 hover:text-red-700"
                    : "text-fg-3 hover:text-fg"
                }`}
              >
                {expanded ? (
                  <ChevronDownIcon className="h-4 w-4" />
                ) : (
                  <ChevronRightIcon className="h-4 w-4" />
                )}
              </button>
            ) : (
              <span className="inline-block h-4 w-4 shrink-0" aria-hidden />
            )}
            <div>
              <Link
                to={`/services/${service.service_id}/costs`}
                className="font-medium text-fg hover:text-accent"
              >
                {name}
              </Link>
              {row.errorCount > 0 && (
                <p id={errorId} className="mt-0.5 text-xs text-red-600">
                  {plural(row.errorCount, "invalid amount")}
                </p>
              )}
            </div>
          </div>
        </td>
        <td className="px-4 py-3">
          {hasConversions ? (
            <div>
              <div className="tabular-nums text-fg">{formatCents(row.includedCents)}</div>
              <div className="text-xs text-fg-3">
                {row.includedCount} of {plural(row.conversions.length, "estimate")}
              </div>
            </div>
          ) : (
            <span className="text-xs text-fg-3">None</span>
          )}
        </td>
        <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-fg-2">
          {formatCents(row.existingActualCents)}
        </td>
        <td className="px-4 py-3">
          <NextYearCell row={row} nextFiscalYear={nextFiscalYear} onChange={onNextYearChange} />
        </td>
        <td className="px-4 py-3">
          {row.flags.length > 0 ? (
            <FlagBadges flags={row.flags} />
          ) : (
            <span className="text-xs text-fg-4">—</span>
          )}
        </td>
      </tr>
      {expanded &&
        row.conversions.map((c, index) => {
          const label = `estimate ${index + 1} of ${name}`;
          return (
            <tr
              key={c.conversion.record_id}
              className="bg-gray-50/70 dark:bg-gray-950/40"
            >
              <td />
              <td colSpan={4} className="px-4 py-2">
                <div className="flex flex-wrap items-center gap-3">
                  <label className="flex items-center gap-2 text-sm text-fg-2">
                    <input
                      type="checkbox"
                      className={checkboxCls}
                      checked={c.edit.include}
                      onChange={(e) =>
                        onConversionChange(c.conversion.record_id, {
                          include: e.target.checked,
                        })
                      }
                      aria-label={`Convert ${label}`}
                    />
                    Convert
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    className={amountInputCls(!c.parsed.ok)}
                    value={c.edit.amount}
                    onChange={(e) =>
                      onConversionChange(c.conversion.record_id, {
                        amount: e.target.value,
                      })
                    }
                    aria-label={`Amount of ${label}`}
                    aria-invalid={!c.parsed.ok}
                  />
                  <span
                    className="max-w-xs truncate text-xs text-fg-3"
                    title={c.conversion.notes ?? undefined}
                  >
                    {c.conversion.notes || "No notes"}
                  </span>
                  <FlagBadges flags={c.conversion.flags} />
                  {!c.parsed.ok && (
                    <span className="text-xs text-red-600">{c.parsed.error}</span>
                  )}
                </div>
              </td>
            </tr>
          );
        })}
    </tbody>
  );
}

interface DoneState {
  fiscalYear: number;
  response: FiscalYearCloseExecuteResponse;
  reverted: FiscalYearCloseRevertResponse | null;
}

export function CloseFiscalYear() {
  const { preferences } = useAuth();
  // The server rejects years after the current UTC calendar year.
  const [currentYear] = useState(() => new Date().getUTCFullYear());
  const [step, setStep] = useState<Step>("pick");

  /** A listed year, or OTHER_YEAR to type one in `otherYearInput`. */
  const [yearChoice, setYearChoice] = useState(() => String(currentYear));
  const [otherYearInput, setOtherYearInput] = useState("");
  const [upliftInput, setUpliftInput] = useState("0");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [pickError, setPickError] = useState<string | null>(null);

  const [preview, setPreview] = useState<FiscalYearClosePreview | null>(null);
  const [edits, setEdits] = useState<CloseEdits | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [onlyFlagged, setOnlyFlagged] = useState(false);
  const [reviewNotice, setReviewNotice] = useState<string | null>(null);

  const [confirmText, setConfirmText] = useState("");
  const [executing, setExecuting] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [done, setDone] = useState<DoneState | null>(null);

  const [batches, setBatches] = useState<FiscalYearCloseBatch[] | null>(null);
  const [batchesError, setBatchesError] = useState<string | null>(null);
  const [batchesVersion, setBatchesVersion] = useState(0);
  const [revertingId, setRevertingId] = useState<string | null>(null);
  const [revertMessage, setRevertMessage] = useState<{
    tone: NoticeTone;
    text: string;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    client
      .get<FiscalYearCloseBatch[]>(`${FISCAL_YEAR_CLOSE_API}/batches`)
      .then((res) => {
        if (cancelled) return;
        setBatches(res.data);
        setBatchesError(null);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setBatchesError(apiErrorDetail(err, "Could not load previous closes."));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [batchesVersion]);

  const pickerYears = useMemo(
    () => Array.from({ length: PICKER_YEARS }, (_, i) => currentYear - i),
    [currentYear],
  );
  const otherYear = yearChoice === OTHER_YEAR;
  const yearParse = parseFiscalYear(otherYear ? otherYearInput : yearChoice, currentYear);
  const selectedYear = yearParse.ok ? yearParse.year : null;
  // An empty "Other year" field disables Preview without showing an error yet.
  const otherYearError =
    otherYear && !yearParse.ok && otherYearInput.trim() !== "" ? yearParse.error : null;
  const upliftParse = parseUplift(upliftInput);

  const plan = useMemo(
    () => (preview && edits ? derivePlan(preview, edits) : null),
    [preview, edits],
  );

  const visibleServices = useMemo(() => {
    if (!plan) return [];
    return onlyFlagged ? plan.services.filter(keepWithOnlyFlagged) : plan.services;
  }, [plan, onlyFlagged]);

  const skippedRows = useMemo(() => {
    if (!preview || !plan) return [];
    return [
      ...preview.skipped.map((s) => ({
        key: `skipped-${s.service_id}`,
        name: s.service_name,
        reason: s.reason as string,
      })),
      ...plan.services
        // With invalid amounts the zero is not final, so the row is not listed yet.
        .filter(
          (s) =>
            s.nextStatus === "next_year_exists" ||
            (s.nextStatus === "zero_amount" && s.errorCount === 0),
        )
        .map((s) => ({
          key: `next-${s.service.service_id}`,
          name: s.service.service_name,
          reason: s.nextStatus as string,
        })),
    ];
  }, [preview, plan]);

  function showPreview(data: FiscalYearClosePreview, keepEdits: boolean) {
    setPreview(data);
    if (!keepEdits) {
      setEdits(initialEdits(data));
      setExpanded(new Set());
    }
    setConfirmText("");
    setConfirmError(null);
  }

  async function requestPreview(fiscalYear: number, upliftPct: number) {
    const res = await client.post<FiscalYearClosePreview>(
      `${FISCAL_YEAR_CLOSE_API}/preview`,
      { fiscal_year: fiscalYear, uplift_pct: upliftPct },
    );
    return res.data;
  }

  async function handlePreview() {
    if (!upliftParse.ok || selectedYear === null) return;
    setPreviewLoading(true);
    setPickError(null);
    try {
      const data = await requestPreview(selectedYear, upliftParse.pct);
      // Same year and same records: keep the user's edits (only the uplift changed).
      const keepEdits =
        preview !== null &&
        edits !== null &&
        preview.fiscal_year === data.fiscal_year &&
        preview.plan_hash === data.plan_hash;
      showPreview(data, keepEdits);
      setReviewNotice(null);
      setRevertMessage(null);
      setStep("review");
    } catch (err) {
      setPickError(apiErrorDetail(err, "Could not load the preview."));
    } finally {
      setPreviewLoading(false);
    }
  }

  async function handleExecute() {
    if (!preview || !plan) return;
    setExecuting(true);
    setConfirmError(null);
    try {
      const res = await client.post<FiscalYearCloseExecuteResponse>(
        `${FISCAL_YEAR_CLOSE_API}/execute`,
        buildExecuteRequest(preview, plan),
      );
      setDone({ fiscalYear: preview.fiscal_year, response: res.data, reverted: null });
      setRevertMessage(null);
      setStep("done");
      setBatchesVersion((v) => v + 1);
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 409) {
        try {
          const data = await requestPreview(preview.fiscal_year, preview.uplift_pct);
          showPreview(data, false);
          setReviewNotice(PLAN_CHANGED_NOTICE);
          setStep("review");
        } catch (reloadErr) {
          setPreview(null);
          setEdits(null);
          setPickError(
            `Cost records changed since the preview was loaded, and reloading it failed: ${apiErrorDetail(
              reloadErr,
              "unknown error",
            )}`,
          );
          setStep("pick");
        }
      } else {
        setConfirmError(apiErrorDetail(err, "Could not close the year."));
      }
    } finally {
      setExecuting(false);
    }
  }

  async function revert(target: RevertTarget): Promise<FiscalYearCloseRevertResponse | null> {
    if (!window.confirm(revertConfirmMessage(target))) return null;
    setRevertingId(target.id);
    setRevertMessage(null);
    try {
      const res = await client.post<FiscalYearCloseRevertResponse>(
        `${FISCAL_YEAR_CLOSE_API}/revert`,
        { batch_id: target.id },
      );
      setRevertMessage({
        tone: "success",
        text: `FY${target.fiscal_year} close reverted: ${plural(
          res.data.restored_count,
          "record",
        )} back to estimated, ${plural(res.data.deleted_count, "created record")} deleted.`,
      });
      setBatchesVersion((v) => v + 1);
      return res.data;
    } catch (err) {
      // 409 details are meant for the user, for example "Revert these later
      // closes first: FY2027", "Unarchive these services before reverting: ...",
      // or "Cost records changed during revert; try again".
      setRevertMessage({
        tone: "error",
        text: apiErrorDetail(err, "Could not revert the close."),
      });
      // The batch list may be stale (for example reverted by someone else).
      if (axios.isAxiosError(err) && err.response?.status === 409) {
        setBatchesVersion((v) => v + 1);
      }
      return null;
    } finally {
      setRevertingId(null);
    }
  }

  async function revertDone() {
    if (!done) return;
    const batch = batches?.find((b) => b.id === done.response.batch_id);
    const reverted = await revert(
      batch ?? {
        id: done.response.batch_id,
        fiscal_year: done.fiscalYear,
        converted_count: done.response.converted_count,
        created_count: done.response.created_count,
        changed_since_close: null,
      },
    );
    if (reverted) {
      setDone((current) => (current ? { ...current, reverted } : current));
    }
  }

  function startOver() {
    setStep("pick");
    setPreview(null);
    setEdits(null);
    setDone(null);
    setReviewNotice(null);
    setRevertMessage(null);
    setConfirmText("");
  }

  function updateConversion(recordId: string, patch: Partial<ConversionEdit>) {
    setEdits((current) => {
      const previous = current?.conversions[recordId];
      if (!current || !previous) return current;
      return {
        ...current,
        conversions: { ...current.conversions, [recordId]: { ...previous, ...patch } },
      };
    });
  }

  function updateNextYear(serviceId: string, patch: Partial<NextYearEdit>) {
    setEdits((current) => {
      const previous = current?.nextYear[serviceId];
      if (!current || !previous) return current;
      return {
        ...current,
        nextYear: { ...current.nextYear, [serviceId]: { ...previous, ...patch } },
      };
    });
  }

  function toggleExpanded(serviceId: string) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(serviceId)) next.delete(serviceId);
      else next.add(serviceId);
      return next;
    });
  }

  const allExpanded =
    plan !== null &&
    plan.services.length > 0 &&
    plan.services.every(
      (s) => s.conversions.length === 0 || expanded.has(s.service.service_id),
    );
  const nothingToClose = plan !== null && plan.convertedCount === 0 && plan.createdCount === 0;
  const totalTooLarge =
    plan !== null && (plan.convertedTotalTooLarge || plan.nextYearTotalTooLarge);
  const canContinue =
    plan !== null && plan.errorCount === 0 && !nothingToClose && !totalTooLarge;
  const canConfirm =
    preview !== null && confirmText.trim() === String(preview.fiscal_year) && !executing;

  return (
    <PageTransition>
      <div className="space-y-6 text-gray-900 dark:text-gray-100">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1
              className="text-fg"
              style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.02em", margin: 0 }}
            >
              Close financial year
            </h1>
            <p className="mt-1 max-w-2xl text-[13px] text-fg-3">
              Converts a year's estimated service costs to actual and creates one estimated
              record per service for the next year. Archived services are skipped. Records stay
              editable afterwards, and a close can be reverted.
            </p>
          </div>
          <Link
            to="/costs"
            className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-fg-2 hover:bg-surface-2"
          >
            Back to Costs report
          </Link>
        </div>

        <StepIndicator step={step} />

        {step === "pick" && (
          <>
            <section className={`${cardCls} space-y-4`} aria-labelledby="close-pick-heading">
              <h2 id="close-pick-heading" className="text-base font-medium text-fg">
                Pick the year to close
              </h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="close-year" className={labelCls}>
                    Financial year
                  </label>
                  <select
                    id="close-year"
                    className={`${inputCls} mt-1`}
                    value={yearChoice}
                    onChange={(e) => setYearChoice(e.target.value)}
                  >
                    <option value={String(currentYear + 1)} disabled>
                      {currentYear + 1} (future years cannot be closed)
                    </option>
                    {pickerYears.map((y) => (
                      <option key={y} value={String(y)}>
                        {y}
                        {y === currentYear ? " (current year)" : ""}
                      </option>
                    ))}
                    <option value={OTHER_YEAR}>Other year...</option>
                  </select>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Financial years follow the calendar year.
                  </p>
                  {otherYear && (
                    <div className="mt-3">
                      <label htmlFor="close-year-other" className={labelCls}>
                        Other year
                      </label>
                      <input
                        id="close-year-other"
                        type="text"
                        inputMode="numeric"
                        autoComplete="off"
                        placeholder="YYYY"
                        className={`${inputCls} mt-1`}
                        value={otherYearInput}
                        onChange={(e) => setOtherYearInput(e.target.value)}
                        aria-invalid={otherYearError !== null}
                        aria-describedby="close-year-other-help"
                      />
                      <p
                        id="close-year-other-help"
                        className={`mt-1 text-xs ${
                          otherYearError ? "text-red-600" : "text-gray-500 dark:text-gray-400"
                        }`}
                      >
                        {otherYearError ?? `Any year from ${MIN_FISCAL_YEAR} to ${currentYear}.`}
                      </p>
                    </div>
                  )}
                </div>
                <div>
                  <label htmlFor="close-uplift" className={labelCls}>
                    Uplift for next year (%)
                  </label>
                  {/* Text, not type="number": the raw text is validated, so input the
                      browser cannot parse is never read as an empty field (0%). No
                      decimal inputMode: some mobile keypads lack the minus sign. */}
                  <input
                    id="close-uplift"
                    type="text"
                    autoComplete="off"
                    className={`${inputCls} mt-1`}
                    value={upliftInput}
                    onChange={(e) => setUpliftInput(e.target.value)}
                    aria-invalid={!upliftParse.ok}
                  />
                  {upliftParse.ok ? (
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      Optional. Applied to every{" "}
                      {selectedYear !== null ? `FY${selectedYear + 1}` : "next-year"} estimate,
                      for example 5 for a 5% increase.
                    </p>
                  ) : (
                    <p className="mt-1 text-xs text-red-600">{upliftParse.error}</p>
                  )}
                </div>
              </div>
              {selectedYear === currentYear && (
                <Notice tone="warn">
                  FY{currentYear} has not ended yet. Costs may still change.
                </Notice>
              )}
              {pickError && <Notice tone="error">{pickError}</Notice>}
              <div className="flex justify-end">
                <Button
                  onClick={() => void handlePreview()}
                  disabled={!upliftParse.ok || selectedYear === null || previewLoading}
                >
                  {previewLoading ? "Loading preview..." : "Preview changes"}
                </Button>
              </div>
            </section>

            <section className={`${cardCls} space-y-3`} aria-labelledby="close-batches-heading">
              <h2 id="close-batches-heading" className="text-base font-medium text-fg">
                Previous closes
              </h2>
              {revertMessage && <Notice tone={revertMessage.tone}>{revertMessage.text}</Notice>}
              <PreviousCloses
                batches={batches}
                error={batchesError}
                revertingId={revertingId}
                preferences={preferences}
                onRevert={(batch) => void revert(batch)}
              />
            </section>
          </>
        )}

        {step === "review" && preview && plan && (
          <section className="space-y-4" aria-labelledby="close-review-heading">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="close-review-heading" className="text-base font-medium text-fg">
                Review FY{preview.fiscal_year}
              </h2>
              <span className="text-xs text-fg-3">
                Uplift {formatPct(preview.uplift_pct)} on FY{preview.next_fiscal_year} estimates
              </span>
            </div>
            {reviewNotice && <Notice tone="info">{reviewNotice}</Notice>}
            {preview.year_not_ended && (
              <Notice tone="warn">
                FY{preview.fiscal_year} has not ended yet. Costs may still change.
              </Notice>
            )}

            <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <SummaryCard
                label={`Convert to actual (FY${preview.fiscal_year})`}
                value={formatCents(plan.convertedCents)}
                sub={plural(plan.convertedCount, "record")}
                testId="total-converted"
              />
              <SummaryCard
                label={`New estimates (FY${preview.next_fiscal_year})`}
                value={formatCents(plan.nextYearCents)}
                sub={plural(plan.createdCount, "record")}
                testId="total-next-year"
              />
            </dl>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <label className="flex items-center gap-2 text-sm text-fg-2">
                <input
                  type="checkbox"
                  className={checkboxCls}
                  checked={onlyFlagged}
                  onChange={(e) => setOnlyFlagged(e.target.checked)}
                />
                Only rows with flags
              </label>
              {plan.services.some((s) => s.conversions.length > 0) && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() =>
                    setExpanded(
                      allExpanded
                        ? new Set()
                        : new Set(plan.services.map((s) => s.service.service_id)),
                    )
                  }
                >
                  {allExpanded ? "Collapse all" : "Expand all"}
                </Button>
              )}
            </div>

            {plan.services.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">
                No active service has actual or estimated cost records in FY
                {preview.fiscal_year}.
              </p>
            ) : visibleServices.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">No rows with flags.</p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50 dark:bg-gray-950">
                    <tr>
                      <th className={thCls}>Service</th>
                      <th className={thCls}>Estimates to convert</th>
                      <th className={`${thCls} text-right`}>Existing actuals</th>
                      <th className={thCls}>FY{preview.next_fiscal_year} estimate</th>
                      <th className={thCls}>Flags</th>
                    </tr>
                  </thead>
                  {visibleServices.map((row) => (
                    <ServiceRows
                      key={row.service.service_id}
                      row={row}
                      nextFiscalYear={preview.next_fiscal_year}
                      expanded={expanded.has(row.service.service_id)}
                      onToggle={() => toggleExpanded(row.service.service_id)}
                      onConversionChange={updateConversion}
                      onNextYearChange={(patch) => updateNextYear(row.service.service_id, patch)}
                    />
                  ))}
                </table>
              </div>
            )}

            {skippedRows.length > 0 && (
              <div className={`${cardCls} space-y-2`}>
                <h3 className="text-sm font-medium text-fg">Skipped</h3>
                <ul className="space-y-1 text-sm">
                  {skippedRows.map((s) => (
                    <li key={s.key}>
                      <span className="font-medium text-fg">{s.name}</span>
                      <span className="text-fg-3">
                        {" "}
                        · {skipReasonLabel(s.reason, preview.next_fiscal_year)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {plan.errorCount > 0 && (
              <Notice tone="error">Fix the highlighted amounts to continue.</Notice>
            )}
            {plan.convertedTotalTooLarge && (
              <Notice tone="error">
                The total to convert is above the {formatCents(MAX_BATCH_TOTAL_CENTS)} limit of
                one close. Exclude or lower some estimates to continue.
              </Notice>
            )}
            {plan.nextYearTotalTooLarge && (
              <Notice tone="error">
                The total of new FY{preview.next_fiscal_year} estimates is above the{" "}
                {formatCents(MAX_BATCH_TOTAL_CENTS)} limit of one close. Untick or lower some
                next-year amounts to continue.
              </Notice>
            )}
            {plan.errorCount === 0 && !totalTooLarge && nothingToClose && (
              <Notice tone="warn">Nothing to close for this year with the current selection.</Notice>
            )}

            <div className="flex flex-wrap justify-between gap-2">
              <Button variant="secondary" onClick={() => setStep("pick")}>
                Back
              </Button>
              <Button
                disabled={!canContinue}
                onClick={() => {
                  setConfirmText("");
                  setConfirmError(null);
                  setStep("confirm");
                }}
              >
                Continue
              </Button>
            </div>
          </section>
        )}

        {step === "confirm" && preview && plan && (
          <section className={`${cardCls} space-y-4`} aria-labelledby="close-confirm-heading">
            <h2 id="close-confirm-heading" className="text-base font-medium text-fg">
              Confirm closing FY{preview.fiscal_year}
            </h2>
            {preview.year_not_ended && (
              <Notice tone="warn">
                FY{preview.fiscal_year} has not ended yet. Costs may still change.
              </Notice>
            )}
            <ul className="list-disc space-y-1 pl-5 text-sm text-fg-2" data-testid="confirm-summary">
              <li>
                Convert {plural(plan.convertedCount, "estimated record")} of FY
                {preview.fiscal_year} to actual, total {formatCents(plan.convertedCents)}.
              </li>
              {plan.excludedConversionCount > 0 && (
                <li>
                  {plural(plan.excludedConversionCount, "estimated record")} stay estimated and
                  unchanged.
                </li>
              )}
              <li>
                Create {plural(plan.createdCount, "estimated record")} for FY
                {preview.next_fiscal_year}, total {formatCents(plan.nextYearCents)}
                {preview.uplift_pct !== 0 ? ` (uplift ${formatPct(preview.uplift_pct)})` : ""}.
              </li>
              {preview.skipped.length > 0 && (
                <li>{plural(preview.skipped.length, "archived service")} skipped.</li>
              )}
            </ul>
            <div className="max-w-xs">
              <label htmlFor="close-confirm-year" className={labelCls}>
                Type {preview.fiscal_year} to confirm
              </label>
              <input
                id="close-confirm-year"
                className={`${inputCls} mt-1`}
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                autoComplete="off"
                inputMode="numeric"
              />
            </div>
            {confirmError && <Notice tone="error">{confirmError}</Notice>}
            <div className="flex flex-wrap justify-between gap-2">
              <Button
                variant="secondary"
                disabled={executing}
                onClick={() => setStep("review")}
              >
                Back to review
              </Button>
              <Button disabled={!canConfirm} onClick={() => void handleExecute()}>
                {executing ? "Closing..." : `Close FY${preview.fiscal_year}`}
              </Button>
            </div>
          </section>
        )}

        {step === "done" && done && (
          <section className={`${cardCls} space-y-4`} aria-labelledby="close-done-heading">
            <h2 id="close-done-heading" className="text-base font-medium text-fg">
              FY{done.fiscalYear} closed
            </h2>
            <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <SummaryCard
                label="Converted to actual"
                value={formatCents(toCents(done.response.totals.converted))}
                sub={plural(done.response.converted_count, "record")}
                testId="done-converted"
              />
              <SummaryCard
                label={`Created for FY${done.fiscalYear + 1}`}
                value={formatCents(toCents(done.response.totals.next_year))}
                sub={plural(done.response.created_count, "record")}
                testId="done-created"
              />
            </dl>
            <p className="text-sm text-fg-2">
              Batch id:{" "}
              <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-xs">
                {done.response.batch_id}
              </code>
            </p>
            {revertMessage && <Notice tone={revertMessage.tone}>{revertMessage.text}</Notice>}
            <div className="flex flex-wrap items-center gap-2">
              <Link
                to={costsReportPathForYear(done.fiscalYear + 1, currentYear)}
                className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
              >
                Open the Costs report for FY{done.fiscalYear + 1}
              </Link>
              {!done.reverted && (
                <Button
                  variant="secondary"
                  disabled={revertingId !== null}
                  onClick={() => void revertDone()}
                >
                  {revertingId !== null ? "Reverting..." : "Revert this close"}
                </Button>
              )}
              <Button variant="secondary" onClick={startOver}>
                Close another year
              </Button>
            </div>
          </section>
        )}
      </div>
    </PageTransition>
  );
}
