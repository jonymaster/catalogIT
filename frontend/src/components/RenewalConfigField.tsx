import type { RenewalConfig } from "../types/models";

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function selectClass(): string {
  return "block w-full rounded-md bg-surface px-2.5 py-1.5 text-sm text-fg border border-border-strong focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent";
}

interface Props {
  value: RenewalConfig | null;
  onChange: (next: RenewalConfig | null) => void;
  error?: string;
}

type Frequency = "none" | "monthly" | "annual";

function freqOf(cfg: RenewalConfig | null): Frequency {
  if (!cfg) return "none";
  return cfg.type;
}

function defaultFor(freq: Frequency, current: RenewalConfig | null): RenewalConfig | null {
  if (freq === "none") return null;
  const day = current?.day ?? 1;
  if (freq === "monthly") return { type: "monthly", day };
  const month =
    current && current.type === "annual" ? current.month : new Date().getMonth() + 1;
  return { type: "annual", month, day };
}

export function RenewalConfigField({ value, onChange, error }: Props) {
  const freq = freqOf(value);

  const handleFreq = (f: Frequency) => {
    onChange(defaultFor(f, value));
  };

  const handleDay = (day: number) => {
    if (!value) return;
    const clamped = Math.max(1, Math.min(31, day || 1));
    onChange({ ...value, day: clamped });
  };

  const handleMonth = (month: number) => {
    if (!value || value.type !== "annual") return;
    onChange({ ...value, month });
  };

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <div>
          <label className="text-xs font-medium uppercase tracking-wider text-fg-3">
            Frequency
          </label>
          <select
            value={freq}
            onChange={(e) => handleFreq(e.target.value as Frequency)}
            className={selectClass() + " mt-1"}
          >
            <option value="none">None</option>
            <option value="monthly">Monthly</option>
            <option value="annual">Annual</option>
          </select>
        </div>

        {value && value.type === "annual" && (
          <div>
            <label className="text-xs font-medium uppercase tracking-wider text-fg-3">
              Month
            </label>
            <select
              value={value.month}
              onChange={(e) => handleMonth(Number(e.target.value))}
              className={selectClass() + " mt-1"}
            >
              {MONTHS.map((name, idx) => (
                <option key={name} value={idx + 1}>
                  {name}
                </option>
              ))}
            </select>
          </div>
        )}

        {value && (
          <div>
            <label className="text-xs font-medium uppercase tracking-wider text-fg-3">
              Day
            </label>
            <input
              type="number"
              min={1}
              max={31}
              value={value.day}
              onChange={(e) => handleDay(Number(e.target.value))}
              className={selectClass() + " mt-1"}
            />
          </div>
        )}
      </div>
      {value && value.day === 31 && (
        <p className="text-xs text-fg-4">
          Day 31 falls back to the last day of the month (e.g. Feb 28 or 30-day months).
        </p>
      )}
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
