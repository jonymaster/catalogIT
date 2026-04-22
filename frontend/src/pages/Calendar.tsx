import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import client from "../api/client";
import {
  Bars3Icon,
  CalendarDaysIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from "../components/Icons";
import { PageTransition } from "../components/PageTransition";
import { SegmentedControl } from "../components/ui/SegmentedControl";
import { formatMoneyCompact } from "../components/ui/money-format";
import { useAuth } from "../context/useAuth";
import type { Service } from "../types/models";
import { formatMonthYear, formatWeekdayShort } from "../utils/formatting";

type CalendarView = "month" | "timeline";
const VIEW_STORAGE_KEY = "catalogit:calendar:view";
const MAX_CHIPS_PER_DAY = 3;

interface CalendarEvent {
  id: string;
  service: Service;
  occurrence: Date;
}

function sameDay(left: Date, right: Date) {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

function isSameMonth(left: Date, right: Date) {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth()
  );
}

function monthStart(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), 1);
}

function monthEnd(value: Date) {
  return new Date(value.getFullYear(), value.getMonth() + 1, 0);
}

function weekStart(value: Date) {
  const result = new Date(value);
  const day = result.getDay();
  result.setDate(result.getDate() - day);
  return result;
}

function weekEnd(value: Date) {
  const result = new Date(value);
  const day = result.getDay();
  result.setDate(result.getDate() + (6 - day));
  return result;
}

function shiftMonth(value: Date, months: number) {
  return new Date(value.getFullYear(), value.getMonth() + months, 1, 12);
}

function occurrenceForMonth(service: Service, displayMonth: Date) {
  const config = service.renewal_config;
  if (!config) return null;

  const lastDay = monthEnd(displayMonth).getDate();
  const day = Math.min(config.day, lastDay);

  if (config.type === "monthly") {
    return new Date(
      displayMonth.getFullYear(),
      displayMonth.getMonth(),
      day,
      12,
    );
  }

  if (config.type === "annual" && config.month === displayMonth.getMonth() + 1) {
    return new Date(
      displayMonth.getFullYear(),
      displayMonth.getMonth(),
      day,
      12,
    );
  }

  return null;
}

function buildCalendarDays(displayMonth: Date) {
  const start = weekStart(monthStart(displayMonth));
  const end = weekEnd(monthEnd(displayMonth));
  const days: Date[] = [];

  for (
    const cursor = new Date(start);
    cursor <= end;
    cursor.setDate(cursor.getDate() + 1)
  ) {
    days.push(new Date(cursor));
  }

  return days;
}

// Walk each of the next `monthCount` months and collect every derived
// occurrence for a service — preserves the monthly/annually rules.
function collectOccurrences(
  services: Service[],
  fromMonth: Date,
  monthCount: number,
): CalendarEvent[] {
  const events: CalendarEvent[] = [];
  for (let i = 0; i < monthCount; i += 1) {
    const month = new Date(fromMonth.getFullYear(), fromMonth.getMonth() + i, 1);
    for (const service of services) {
      const occurrence = occurrenceForMonth(service, month);
      if (!occurrence) continue;
      events.push({
        id: `${service.id}-${occurrence.toISOString()}`,
        service,
        occurrence,
      });
    }
  }
  return events;
}

function criticalityChipClasses(criticality: string | null): string {
  switch ((criticality ?? "").toLowerCase()) {
    case "critical":
      return "bg-danger-soft text-danger";
    case "high":
      return "bg-warn-soft text-warn";
    case "medium":
      return "bg-info-soft text-info";
    case "low":
      return "bg-success-soft text-success";
    default:
      return "bg-accent-soft text-accent-strong";
  }
}

export function Calendar() {
  const { preferences } = useAuth();
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [displayMonth, setDisplayMonth] = useState(() => monthStart(new Date()));
  const [view, setView] = useState<CalendarView>(() => {
    if (typeof window === "undefined") return "month";
    const stored = window.localStorage.getItem(VIEW_STORAGE_KEY);
    return stored === "timeline" ? "timeline" : "month";
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(VIEW_STORAGE_KEY, view);
  }, [view]);

  const dayNames = useMemo(
    () =>
      // Start from Sunday (UTC Jan 4 2026 = Sunday) so the grid reads Sun–Sat.
      Array.from({ length: 7 }, (_, index) =>
        formatWeekdayShort(new Date(Date.UTC(2026, 0, 4 + index)), preferences),
      ),
    [preferences],
  );

  useEffect(() => {
    client
      .get<Service[]>("/api/services/")
      .then((response) => setServices(response.data))
      .finally(() => setLoading(false));
  }, []);

  const today = useMemo(() => new Date(), []);

  const monthEvents = useMemo<CalendarEvent[]>(() => {
    return services
      .map((service) => {
        const occurrence = occurrenceForMonth(service, displayMonth);
        if (!occurrence) return null;
        return {
          id: `${service.id}-${occurrence.toISOString()}`,
          service,
          occurrence,
        };
      })
      .filter((event): event is CalendarEvent => event !== null)
      .sort((left, right) => left.occurrence.getTime() - right.occurrence.getTime());
  }, [displayMonth, services]);

  const upcomingYearEvents = useMemo<CalendarEvent[]>(() => {
    const start = monthStart(today);
    const horizon = new Date(today);
    horizon.setDate(horizon.getDate() + 365);
    return collectOccurrences(services, start, 13)
      .filter((event) => event.occurrence >= today && event.occurrence <= horizon)
      .sort((left, right) => left.occurrence.getTime() - right.occurrence.getTime());
  }, [services, today]);

  const unscheduledCount = useMemo(() => {
    return services.reduce(
      (acc, service) => (service.renewal_config ? acc : acc + 1),
      0,
    );
  }, [services]);

  const days = useMemo(() => buildCalendarDays(displayMonth), [displayMonth]);

  const eventsByDay = useMemo(() => {
    return days.map((day) => ({
      day,
      events: monthEvents.filter((event) => sameDay(event.occurrence, day)),
    }));
  }, [days, monthEvents]);

  if (loading) {
    return (
      <PageTransition>
        <div>
          <h1
            className="text-fg"
            style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.02em", margin: 0 }}
          >
            Renewal calendar
          </h1>
          <p className="mt-4 text-sm text-fg-3">Loading renewal calendar...</p>
        </div>
      </PageTransition>
    );
  }

  return (
    <PageTransition>
      <div className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1
              className="text-fg"
              style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.02em", margin: 0 }}
            >
              Renewal calendar
            </h1>
            <p className="mt-1 text-[13px] text-fg-3">
              {upcomingYearEvents.length} renewals over the next 12 months
            </p>
          </div>
          <div className="flex items-center gap-2">
            <SegmentedControl<CalendarView>
              value={view}
              onChange={setView}
              options={[
                {
                  value: "month",
                  label: "Month",
                  icon: <CalendarDaysIcon className="h-3.5 w-3.5" aria-hidden />,
                },
                {
                  value: "timeline",
                  label: "Timeline",
                  icon: <Bars3Icon className="h-3.5 w-3.5" aria-hidden />,
                },
              ]}
            />
            {view === "month" && (
              <>
                <button
                  type="button"
                  aria-label="Previous month"
                  onClick={() => setDisplayMonth((current) => shiftMonth(current, -1))}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-surface text-fg-2 transition-colors hover:border-border-strong hover:bg-surface-2"
                >
                  <ChevronLeftIcon className="h-4 w-4" aria-hidden />
                </button>
                <div
                  className="min-w-[140px] text-center text-[14px] font-medium text-fg"
                  aria-live="polite"
                >
                  {formatMonthYear(displayMonth, preferences)}
                </div>
                <button
                  type="button"
                  aria-label="Next month"
                  onClick={() => setDisplayMonth((current) => shiftMonth(current, 1))}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-surface text-fg-2 transition-colors hover:border-border-strong hover:bg-surface-2"
                >
                  <ChevronRightIcon className="h-4 w-4" aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={() => setDisplayMonth(monthStart(new Date()))}
                  className="rounded-md border border-border bg-surface px-3 py-1.5 text-[13px] font-medium text-fg-2 transition-colors hover:border-border-strong hover:bg-surface-2"
                >
                  Today
                </button>
              </>
            )}
          </div>
        </div>

        {unscheduledCount > 0 && (
          <div className="rounded-md border border-border bg-surface-2 px-3 py-2 text-[12.5px] text-fg-3">
            {unscheduledCount} service{unscheduledCount === 1 ? "" : "s"} don&apos;t have a renewal schedule and can&apos;t appear on the calendar.{" "}
            <Link
              to="/services?filter=unscheduled"
              className="font-medium text-accent hover:text-accent-strong"
            >
              Review &rarr;
            </Link>
          </div>
        )}

        {view === "month" ? (
          <MonthView
            eventsByDay={eventsByDay}
            dayNames={dayNames}
            today={today}
            displayMonth={displayMonth}
          />
        ) : (
          <TimelineView services={services} today={today} />
        )}
      </div>
    </PageTransition>
  );
}

interface MonthViewProps {
  eventsByDay: { day: Date; events: CalendarEvent[] }[];
  dayNames: string[];
  today: Date;
  displayMonth: Date;
}

function MonthView({ eventsByDay, dayNames, today, displayMonth }: MonthViewProps) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-surface shadow-[var(--shadow-sm)]">
      <div className="grid grid-cols-7 border-b border-border bg-surface-2">
        {dayNames.map((dayName) => (
          <div
            key={dayName}
            className="px-3 py-2 text-[11px] font-medium uppercase tracking-wider text-fg-3"
          >
            {dayName}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7">
        {eventsByDay.map(({ day, events: dayEvents }, index) => {
          const inMonth = isSameMonth(day, displayMonth);
          const isToday = sameDay(day, today);
          const extra = dayEvents.length - MAX_CHIPS_PER_DAY;
          const isLastColumn = index % 7 === 6;

          return (
            <div
              key={day.toISOString()}
              className={[
                "min-h-[110px] border-b border-border p-2 align-top relative",
                isLastColumn ? "" : "border-r",
                isToday ? "bg-accent-soft" : "bg-surface",
              ].join(" ")}
            >
              <div className="mb-1 flex items-center justify-between">
                <span
                  className={[
                    "inline-flex items-center text-[11.5px]",
                    isToday
                      ? "font-semibold text-accent-strong"
                      : inMonth
                        ? "font-medium text-fg-2"
                        : "font-medium text-fg-4",
                  ].join(" ")}
                >
                  {day.getDate()}
                  {isToday && (
                    <span className="ml-1.5 rounded-full bg-accent px-1.5 py-px text-[9px] font-semibold uppercase tracking-wider text-white">
                      Today
                    </span>
                  )}
                </span>
                {dayEvents.length > MAX_CHIPS_PER_DAY && (
                  <span className="text-[10px] text-fg-4">{dayEvents.length}</span>
                )}
              </div>

              <div className="space-y-1">
                {dayEvents.slice(0, MAX_CHIPS_PER_DAY).map((event) => (
                  <Link
                    key={event.id}
                    to={`/services/${event.service.id}`}
                    title={event.service.name}
                    className={[
                      "block truncate rounded px-1.5 py-0.5 text-[11px]",
                      criticalityChipClasses(event.service.criticality),
                      "hover:brightness-105",
                    ].join(" ")}
                  >
                    {event.service.name}
                  </Link>
                ))}
                {extra > 0 && (
                  <div className="px-1.5 text-[10.5px] text-fg-3">+{extra} more</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface TimelineBucket {
  date: Date;
  events: CalendarEvent[];
  total: number;
}

interface TimelineViewProps {
  services: Service[];
  today: Date;
}

function TimelineView({ services, today }: TimelineViewProps) {
  const buckets = useMemo<TimelineBucket[]>(() => {
    const start = monthStart(today);
    const result: TimelineBucket[] = [];
    for (let i = 0; i < 12; i += 1) {
      const month = new Date(start.getFullYear(), start.getMonth() + i, 1);
      const events = services
        .map<CalendarEvent | null>((service) => {
          const occurrence = occurrenceForMonth(service, month);
          if (!occurrence) return null;
          return {
            id: `${service.id}-${occurrence.toISOString()}`,
            service,
            occurrence,
          };
        })
        .filter((event): event is CalendarEvent => event !== null)
        .sort((left, right) => left.occurrence.getTime() - right.occurrence.getTime());
      const total = events.reduce(
        (sum, event) => sum + (event.service.yearly_cost ?? 0),
        0,
      );
      result.push({ date: month, events, total });
    }
    return result;
  }, [services, today]);

  const maxCost = Math.max(1, ...buckets.map((bucket) => bucket.total));

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-surface shadow-[var(--shadow-sm)]">
      {buckets.map((bucket, bucketIndex) => {
        const isLast = bucketIndex === buckets.length - 1;
        const monthLabel = bucket.date.toLocaleDateString("en-US", { month: "long" });
        const widthPct = (bucket.total / maxCost) * 100;

        return (
          <div
            key={bucket.date.toISOString()}
            className={[
              "grid items-stretch",
              isLast ? "" : "border-b border-border",
            ].join(" ")}
            style={{ gridTemplateColumns: "140px 1fr" }}
          >
            <div className="border-r border-border bg-surface-2 px-4 py-3.5">
              <div className="text-[13px] font-semibold text-fg">{monthLabel}</div>
              <div className="mt-0.5 text-[11px] text-fg-3">
                {bucket.date.getFullYear()}
              </div>
              <div className="mt-2.5 text-[11.5px] text-fg-3">
                {bucket.events.length} renewal{bucket.events.length === 1 ? "" : "s"}
              </div>
              <div className="tnum text-[13px] font-semibold text-fg">
                {formatMoneyCompact(bucket.total)}
              </div>
              <div className="mt-2 h-1 overflow-hidden rounded-full bg-surface-3">
                <div
                  className="h-full bg-accent opacity-85 transition-[width] duration-300"
                  style={{ width: `${widthPct}%` }}
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-2 p-2.5">
              {bucket.events.length === 0 ? (
                <span className="px-2 py-1.5 text-[12px] text-fg-4">
                  No renewals this month
                </span>
              ) : (
                bucket.events.slice(0, 30).map((event) => (
                  <Link
                    key={event.id}
                    to={`/services/${event.service.id}`}
                    className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-2 px-2.5 py-1 text-xs text-fg-2 transition-colors hover:border-border-strong hover:text-fg"
                  >
                    <span className="tnum text-[10.5px] text-fg-3">
                      {event.occurrence.getDate()}
                    </span>
                    <span>{event.service.name}</span>
                    {event.service.yearly_cost != null && (
                      <span className="tnum text-[10.5px] text-fg-4">
                        {formatMoneyCompact(event.service.yearly_cost)}
                      </span>
                    )}
                  </Link>
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
