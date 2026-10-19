import { useEffect, useRef, useState } from 'react';
import { CalendarCache } from './calendar-cache';
export type CalendarResult = {
  month: string;
  experienceId: string;
  timezone: string;
  minDate: string;
  maxDate: string;
  dates: { date: string; available: boolean }[];
};
export function shiftMonth(month: string, amount: number) {
  const [year, number] = month.split('-').map(Number);
  return new Date(Date.UTC(year, number - 1 + amount, 1)).toISOString().slice(0, 7);
}
export function AvailabilityCalendar({
  experienceId,
  selected,
  onSelect,
  onRefresh,
}: { experienceId: string; selected: string; onSelect: (date: string) => void; onRefresh?: () => void }) {
  const [view, setView] = useState({ experienceId, month: selected?.slice(0, 7) || '' });
  const month = view.experienceId === experienceId ? view.month : '';
  const setMonth = (next: string) => setView({ experienceId, month: next });
  const [result, setResult] = useState<CalendarResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const cache = useRef(new CalendarCache());
  const grid = useRef<HTMLDivElement>(null);
  useEffect(() => () => cache.current.clear(), []);
  useEffect(() => {
    let active = true;
    setError('');
    if (!experienceId) {
      setResult(null);
      setLoading(false);
      return;
    }
    const cached = cache.current.peek(experienceId, month);
    setLoading(!cached);
    if (cached) setResult(cached);
    cache.current
      .load(experienceId, month)
      .then((value) => {
        if (!active) return;
        setResult(value);
        // Only adjacent valid months, never recursively prefetch the full horizon.
        for (const offset of [-1, 1]) {
          const adjacent = shiftMonth(value.month, offset);
          if (adjacent >= value.minDate.slice(0, 7) && adjacent <= value.maxDate.slice(0, 7))
            void cache.current.load(experienceId, adjacent).catch(() => {});
        }
      })
      .catch(() => {
        if (active)
          setError('We could not check the calendar. Retry or contact the chef; dates are unavailable until checked.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [experienceId, month, retry]);
  const context = result?.experienceId === experienceId ? result : null;
  const checked = cache.current.peek(experienceId, month);
  const current = checked && !error ? checked : null;
  const displayMonth = month || context?.month;
  const display =
    current ||
    (context && displayMonth
      ? {
          ...context,
          month: displayMonth,
          dates: Array.from(
            {
              length: new Date(
                Date.UTC(Number(displayMonth.slice(0, 4)), Number(displayMonth.slice(5)), 0),
              ).getUTCDate(),
            },
            (_, index) => ({ date: `${displayMonth}-${String(index + 1).padStart(2, '0')}`, available: false }),
          ),
        }
      : null);
  const refresh = () => {
    cache.current.clear();
    setLoading(true);
    setRetry((value) => value + 1);
    onRefresh?.();
  };
  const moveFocus = (event: React.KeyboardEvent<HTMLButtonElement>, date: string) => {
    const offset = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[event.key];
    if (!offset || !current) return;
    event.preventDefault();
    const index = current.dates.findIndex((day) => day.date === date);
    for (let next = index + offset; next >= 0 && next < current.dates.length; next += Math.sign(offset)) {
      if (current.dates[next].available) {
        grid.current?.querySelector<HTMLButtonElement>(`[data-date="${current.dates[next].date}"]`)?.focus();
        return;
      }
    }
  };
  const blanks = display ? new Date(`${display.month}-01T12:00:00Z`).getUTCDay() : 0;
  return (
    <section aria-label="Available dates" className="mb-4 rounded-lg border p-3" aria-busy={loading}>
      {!experienceId && (
        <p role="alert">
          Choose an available experience in step 1 before selecting a date. If no experiences are listed, reload the
          page or contact the chef.
        </p>
      )}
      {loading && <p role="status">Checking available dates…</p>}
      {error && <p role="alert">{error}</p>}
      {display && !loading && !error && !current && <p role="status">Refresh dates to check availability.</p>}
      {experienceId && (
        <button type="button" className="mb-2 text-sm underline" disabled={loading} onClick={refresh}>
          Refresh dates
        </button>
      )}
      {display && (
        <>
          <div className="mb-3 flex items-center justify-between gap-2">
            <button
              type="button"
              aria-label="Previous month"
              disabled={display.month <= display.minDate.slice(0, 7)}
              onClick={() => setMonth(shiftMonth(display.month, -1))}
              className="rounded border px-3 py-1 disabled:opacity-40"
            >
              ←
            </button>
            <h4 aria-live="polite" className="font-semibold">
              {new Date(`${display.month}-01T12:00:00Z`).toLocaleDateString('en-US', {
                month: 'long',
                year: 'numeric',
                timeZone: 'UTC',
              })}
            </h4>
            <button
              type="button"
              aria-label="Next month"
              disabled={display.month >= display.maxDate.slice(0, 7)}
              onClick={() => setMonth(shiftMonth(display.month, 1))}
              className="rounded border px-3 py-1 disabled:opacity-40"
            >
              →
            </button>
          </div>
          <div
            ref={grid}
            className="grid grid-cols-7 gap-1"
            role="group"
            aria-label="Choose a date with available arrival times"
          >
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
              <span className="text-center text-xs" key={day}>
                {day}
              </span>
            ))}
            {Array.from({ length: blanks }, (_, index) => (
              <span key={`blank-${index}`} aria-hidden="true" />
            ))}
            {display.dates.map((day) => (
              <button
                type="button"
                key={day.date}
                data-date={day.date}
                disabled={
                  !current || loading || !day.available || day.date < display.minDate || day.date > display.maxDate
                }
                aria-label={`${day.date}${!current || loading ? ', checking' : day.available ? ', available' : ', unavailable'}`}
                aria-pressed={day.date === selected}
                onKeyDown={(e) => moveFocus(e, day.date)}
                onClick={() => onSelect(day.date)}
                className={`rounded border py-2 text-sm disabled:cursor-not-allowed disabled:opacity-30 ${day.date === selected ? 'bg-primary-900 text-white' : 'hover:bg-primary-50'}`}
              >
                {Number(day.date.slice(-2))}
              </button>
            ))}
          </div>
          <p className="mt-3 text-sm">
            Only dates with available arrival times can be selected. Use Tab or arrow keys to move between available
            dates.
          </p>
          {current && !loading && !display.dates.some((day) => day.available) && (
            <p role="status" className="mt-2">
              No available dates this month. Try another month or experience.
            </p>
          )}
        </>
      )}
    </section>
  );
}
