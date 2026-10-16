import { useEffect, useRef, useState } from 'react';
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
}: { experienceId: string; selected: string; onSelect: (date: string) => void }) {
  const [month, setMonth] = useState(selected?.slice(0, 7) || '');
  const [result, setResult] = useState<CalendarResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const cache = useRef(new Map<string, { at: number; value: CalendarResult }>());
  const grid = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const controller = new AbortController();
    setResult(null);
    setError('');
    if (!experienceId) {
      setLoading(false);
      return;
    }
    const key = `${experienceId}:${month}`;
    const existing = cache.current.get(key);
    if (existing && Date.now() - existing.at < 20000) {
      setResult(existing.value);
      setLoading(false);
      return;
    }
    setLoading(true);
    const params = new URLSearchParams({ experience_id: experienceId });
    if (month) params.set('month', month);
    fetch(`/api/availability-calendar?${params}`, { signal: controller.signal })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.message);
        return body as CalendarResult;
      })
      .then((value) => {
        if (!controller.signal.aborted && value.experienceId === experienceId) {
          cache.current.set(key, { at: Date.now(), value });
          setResult(value);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setError('We could not check the calendar. Retry or contact the chef; dates are unavailable until checked.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [experienceId, month, retry]);
  const current = result?.experienceId === experienceId && (!month || result.month === month) ? result : null;
  const refresh = () => {
    cache.current.clear();
    setRetry((value) => value + 1);
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
  const blanks = current ? new Date(`${current.month}-01T12:00:00Z`).getUTCDay() : 0;
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
      {experienceId && (
        <button type="button" className="mb-2 text-sm underline" disabled={loading} onClick={refresh}>
          Refresh dates
        </button>
      )}
      {current && !loading && (
        <>
          <div className="mb-3 flex items-center justify-between gap-2">
            <button
              type="button"
              aria-label="Previous month"
              disabled={current.month <= current.minDate.slice(0, 7)}
              onClick={() => setMonth(shiftMonth(current.month, -1))}
              className="rounded border px-3 py-1 disabled:opacity-40"
            >
              ←
            </button>
            <h4 aria-live="polite" className="font-semibold">
              {new Date(`${current.month}-01T12:00:00Z`).toLocaleDateString('en-US', {
                month: 'long',
                year: 'numeric',
                timeZone: 'UTC',
              })}
            </h4>
            <button
              type="button"
              aria-label="Next month"
              disabled={current.month >= current.maxDate.slice(0, 7)}
              onClick={() => setMonth(shiftMonth(current.month, 1))}
              className="rounded border px-3 py-1 disabled:opacity-40"
            >
              →
            </button>
          </div>
          <p className="mb-2 text-sm">
            {current.timezone} · {current.minDate} through {current.maxDate}
          </p>
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
            {current.dates.map((day) => (
              <button
                type="button"
                key={day.date}
                data-date={day.date}
                disabled={!day.available || day.date < current.minDate || day.date > current.maxDate}
                aria-label={`${day.date}${day.available ? ', available' : ', unavailable'}`}
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
          {!current.dates.some((day) => day.available) && (
            <p role="status" className="mt-2">
              No available dates this month. Try another month or experience.
            </p>
          )}
        </>
      )}
    </section>
  );
}
