import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import client from "../api/client";
import { useAuth } from "../context/useAuth";
import type { Service } from "../types/models";
import { formatDateOnly, formatMonthYear, formatWeekdayShort } from "../utils/formatting";

interface CalendarEvent {
  id: string;
  service: Service;
  occurrence: Date;
}

function parseDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day, 12);
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
  result.setDate(result.getDate() - result.getDay());
  return result;
}

function weekEnd(value: Date) {
  const result = new Date(value);
  result.setDate(result.getDate() + (6 - result.getDay()));
  return result;
}

function shiftMonth(value: Date, months: number) {
  return new Date(value.getFullYear(), value.getMonth() + months, 1, 12);
}

function occurrenceForMonth(service: Service, displayMonth: Date) {
  if (!service.renewal_date) {
    return null;
  }

  const activation = parseDate(service.renewal_date);
  const schedule = service.billing_schedule.trim().toLowerCase();
  const lastDay = monthEnd(displayMonth).getDate();
  const day = Math.min(activation.getDate(), lastDay);
  const candidate = new Date(
    displayMonth.getFullYear(),
    displayMonth.getMonth(),
    day,
    12,
  );

  if (candidate < activation) {
    return null;
  }

  if (schedule === "monthly") {
    return candidate;
  }

  if (
    schedule === "annually" &&
    activation.getMonth() === displayMonth.getMonth()
  ) {
    return candidate;
  }

  return null;
}

function isSupportedSchedule(service: Service) {
  const schedule = service.billing_schedule.trim().toLowerCase();
  return schedule === "monthly" || schedule === "annually";
}

function isExplicitlyUnscheduled(service: Service) {
  const schedule = service.billing_schedule.trim().toLowerCase();
  return schedule === "na" || schedule === "on_demand";
}

function getUnscheduledReason(service: Service) {
  if (isExplicitlyUnscheduled(service)) {
    return null;
  }

  if (!service.renewal_date) {
    return "Missing renewal date";
  }

  if (!isSupportedSchedule(service)) {
    return service.billing_schedule
      ? `Unsupported billing schedule: ${service.billing_schedule}`
      : "Missing billing schedule";
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

export function Calendar() {
  const { preferences } = useAuth();
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [displayMonth, setDisplayMonth] = useState(() => monthStart(new Date()));
  const dayNames = useMemo(
    () =>
      Array.from({ length: 7 }, (_, index) =>
        formatWeekdayShort(new Date(2026, 0, 4 + index), preferences),
      ),
    [preferences],
  );

  useEffect(() => {
    client
      .get<Service[]>("/api/services/")
      .then((response) => setServices(response.data))
      .finally(() => setLoading(false));
  }, []);

  const events = useMemo<CalendarEvent[]>(() => {
    return services
      .map((service) => {
        const occurrence = occurrenceForMonth(service, displayMonth);
        if (!occurrence) {
          return null;
        }

        return {
          id: `${service.id}-${occurrence.toISOString()}`,
          service,
          occurrence,
        };
      })
      .filter((event): event is CalendarEvent => event !== null)
      .sort((left, right) => left.occurrence.getTime() - right.occurrence.getTime());
  }, [displayMonth, services]);

  const unscheduledServices = useMemo(() => {
    return services
      .map((service) => ({
        service,
        reason: getUnscheduledReason(service),
      }))
      .filter(
        (entry): entry is { service: Service; reason: string } => entry.reason != null,
      )
      .sort((left, right) => left.service.name.localeCompare(right.service.name));
  }, [services]);

  const days = useMemo(() => buildCalendarDays(displayMonth), [displayMonth]);
  const today = new Date();

  const eventsByDay = useMemo(() => {
    return days.map((day) => ({
      day,
      events: events.filter((event) => sameDay(event.occurrence, day)),
    }));
  }, [days, events]);

  if (loading) {
    return (
      <div>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Calendar</h1>
        <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">Loading renewal calendar...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Calendar</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Renewal events are derived from each service renewal date and its
            monthly or annual billing schedule.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setDisplayMonth((current) => shiftMonth(current, -1))}
            className="rounded-md border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            Previous
          </button>
          <button
            type="button"
            onClick={() => setDisplayMonth(monthStart(new Date()))}
            className="rounded-md border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            Today
          </button>
          <button
            type="button"
            onClick={() => setDisplayMonth((current) => shiftMonth(current, 1))}
            className="rounded-md border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            Next
          </button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
            Visible Month
          </p>
          <p className="mt-1 text-lg font-semibold text-gray-900 dark:text-gray-100">
            {formatMonthYear(displayMonth, preferences)}
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
            Renewals This Month
          </p>
          <p className="mt-1 text-lg font-semibold text-gray-900 dark:text-gray-100">{events.length}</p>
        </div>
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
            Not Scheduled
          </p>
          <p className="mt-1 text-lg font-semibold text-gray-900 dark:text-gray-100">
            {unscheduledServices.length}
          </p>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
        <div className="grid grid-cols-7 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-950">
          {dayNames.map((dayName) => (
            <div
              key={dayName}
              className="px-3 py-2 text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400"
            >
              {dayName}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7">
          {eventsByDay.map(({ day, events: dayEvents }) => {
            const inMonth = isSameMonth(day, displayMonth);
            const isToday = sameDay(day, today);

            return (
              <div
                key={day.toISOString()}
                className={`min-h-36 border-b border-r border-gray-200 dark:border-gray-700 p-2 align-top ${
                  inMonth ? "bg-white dark:bg-gray-900" : "bg-gray-50 dark:bg-gray-950/70"
                }`}
              >
                <div className="mb-2 flex items-center justify-between">
                  <span
                    className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-sm ${
                      isToday
                        ? "bg-gray-900 dark:bg-gray-100 font-medium text-white dark:text-gray-900"
                        : inMonth
                          ? "text-gray-900 dark:text-gray-100"
                          : "text-gray-400"
                    }`}
                  >
                    {day.getDate()}
                  </span>
                  {dayEvents.length > 0 && (
                    <span className="text-xs text-gray-400">{dayEvents.length}</span>
                  )}
                </div>

                <div className="space-y-2">
                  {dayEvents.map((event) => (
                    <Link
                      key={event.id}
                      to={`/services/${event.service.id}`}
                      className="block rounded-md border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/40 p-2 text-xs text-blue-900 hover:bg-blue-100"
                    >
                      <p className="font-medium">{event.service.name}</p>
                      <p className="mt-0.5 text-blue-800 dark:text-blue-200">
                        {event.service.vendor?.name ?? "No vendor"}
                      </p>
                      <p className="mt-0.5 text-blue-700">
                        {event.service.billing_schedule || "No billing schedule"}
                      </p>
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-6">
          <h2 className="text-lg font-medium text-gray-900 dark:text-gray-100">Month Renewal List</h2>
          {events.length === 0 ? (
            <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
              No derived renewals fall in {formatMonthYear(displayMonth, preferences)}.
            </p>
          ) : (
            <div className="mt-4 space-y-3">
              {events.map((event) => (
                <div
                  key={event.id}
                  className="flex items-start justify-between gap-4 rounded-lg border border-gray-200 dark:border-gray-700 p-3"
                >
                  <div>
                    <Link
                      to={`/services/${event.service.id}`}
                      className="text-sm font-medium text-gray-900 dark:text-gray-100 hover:text-gray-700 dark:hover:text-gray-200"
                    >
                      {event.service.name}
                    </Link>
                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                      {event.service.vendor?.name ?? "No vendor"} •{" "}
                      {event.service.status}
                    </p>
                  </div>
                  <p className="whitespace-nowrap text-sm text-gray-600 dark:text-gray-300">
                    {formatDateOnly(
                      event.occurrence,
                      preferences,
                      { month: "short", day: "numeric", year: "numeric" },
                    )}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-6">
          <h2 className="text-lg font-medium text-gray-900 dark:text-gray-100">Not Yet Scheduled</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Services need both a renewal date and a monthly or annual billing
            schedule to appear on the calendar.
          </p>
          {unscheduledServices.length === 0 ? (
            <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">
              All services are schedulable.
            </p>
          ) : (
            <div className="mt-4 space-y-3">
              {unscheduledServices.map(({ service, reason }) => (
                <div
                  key={service.id}
                  className="rounded-lg border border-amber-200 bg-amber-50 p-3"
                >
                  <Link
                    to={`/services/${service.id}`}
                    className="text-sm font-medium text-amber-950 hover:text-amber-800"
                  >
                    {service.name}
                  </Link>
                  <p className="mt-1 text-xs text-amber-800">{reason}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
