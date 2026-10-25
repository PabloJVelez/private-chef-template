import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup, act } from '@testing-library/react';
import { AvailabilityCalendar } from '../AvailabilityCalendar';
import { CalendarCache } from '../calendar-cache';
import { arrivalLabel } from '../DateTimeForm';
const value = (month = '2026-11', experienceId = 'exp') => ({
  month,
  experienceId,
  timezone: 'America/Chicago',
  minDate: '2026-11-01',
  maxDate: '2027-01-31',
  dates: [{ date: `${month}-01`, available: true }],
});
const response = (body: unknown) => ({ ok: true, json: async () => body });
function deferred() {
  let resolve!: (value: any) => void;
  const promise = new Promise<any>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
let fetcher: jest.Mock;
beforeEach(() => {
  fetcher = jest.fn(async (url: string) => {
    const params = new URL(url, 'http://localhost').searchParams;
    return response(value(params.get('month') || '2026-11', params.get('experience_id') || 'exp'));
  });
  global.fetch = fetcher;
});
afterEach(() => {
  cleanup();
  jest.restoreAllMocks();
});

test('canonical first-month cache, request deduplication, expiration, and experience keys', async () => {
  const cache = new CalendarCache();
  const now = jest.spyOn(Date, 'now').mockReturnValue(1000);
  await Promise.all([cache.load('exp', ''), cache.load('exp', '')]);
  await cache.load('exp', '2026-11');
  expect(fetcher).toHaveBeenCalledTimes(1);
  await cache.load('other', '2026-11');
  expect(fetcher).toHaveBeenCalledTimes(2);
  now.mockReturnValue(62000);
  expect(cache.peek('exp', '2026-11')).toBeNull();
  await cache.load('exp', '2026-11');
  expect(fetcher).toHaveBeenCalledTimes(3);
});

test('refresh invalidates cached and in-flight results; failures and mismatched responses never cache', async () => {
  const cache = new CalendarCache();
  const late = deferred();
  fetcher.mockImplementationOnce(() => late.promise);
  const old = cache.load('exp', '2026-11');
  const rejected = expect(old).rejects.toThrow();
  cache.clear();
  await cache.load('exp', '2026-11');
  late.resolve(response({ ...value(), dates: [] }));
  await rejected;
  expect(cache.peek('exp', '2026-11')?.dates).toHaveLength(1);
  cache.clear();
  fetcher.mockResolvedValueOnce({ ok: false });
  await expect(cache.load('exp', '2026-11')).rejects.toThrow();
  expect(cache.peek('exp', '2026-11')).toBeNull();
  fetcher.mockResolvedValueOnce(response(value('2026-12')));
  await expect(cache.load('exp', '2026-11')).rejects.toThrow();
  expect(cache.peek('exp', '2026-11')).toBeNull();
});

test('prefetches only adjacent valid months and revisits without another request', async () => {
  render(<AvailabilityCalendar experienceId="exp" selected="" onSelect={jest.fn()} />);
  await screen.findByRole('button', { name: '2026-11-01, available' });
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
  expect(fetcher.mock.calls[1][0]).toContain('month=2026-12');
  expect(fetcher.mock.calls.some(([url]) => url.includes('2027-01'))).toBe(false);
  fireEvent.click(screen.getByRole('button', { name: 'Next month' }));
  await screen.findByRole('button', { name: '2026-12-01, available' });
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(3));
  fireEvent.click(screen.getByRole('button', { name: 'Previous month' }));
  await screen.findByRole('button', { name: '2026-11-01, available' });
  expect(fetcher).toHaveBeenCalledTimes(3);
  expect(screen.queryByText(/America\/Chicago|through/)).toBeNull();
});

test('pending prefetch is shared, calendar stays visible and disabled, and late navigation cannot replace current month', async () => {
  const late = deferred();
  fetcher.mockImplementation(async (url) => (url.includes('2026-12') ? late.promise : response(value())));
  render(<AvailabilityCalendar experienceId="exp" selected="" onSelect={jest.fn()} />);
  await screen.findByRole('button', { name: '2026-11-01, available' });
  fireEvent.click(screen.getByRole('button', { name: 'Next month' }));
  expect(screen.getByText('December 2026')).toBeTruthy();
  expect((screen.getByRole('button', { name: '2026-12-01, checking' }) as HTMLButtonElement).disabled).toBe(true);
  expect(fetcher).toHaveBeenCalledTimes(2);
  fireEvent.click(screen.getByRole('button', { name: 'Previous month' }));
  await screen.findByRole('button', { name: '2026-11-01, available' });
  await act(async () => late.resolve(response(value('2026-12'))));
  expect(screen.getByText('November 2026')).toBeTruthy();
});

test('experience changes ignore old prefetch and refresh errors leave all dates disabled', async () => {
  const late = deferred();
  fetcher.mockImplementation(async (url) => {
    const p = new URL(url, 'http://localhost').searchParams;
    return p.get('experience_id') === 'exp' && p.get('month')
      ? late.promise
      : response(value('2026-11', p.get('experience_id')!));
  });
  const onRefresh = jest.fn();
  const view = render(
    <AvailabilityCalendar experienceId="exp" selected="" onSelect={jest.fn()} onRefresh={onRefresh} />,
  );
  await screen.findByRole('button', { name: '2026-11-01, available' });
  view.rerender(<AvailabilityCalendar experienceId="other" selected="" onSelect={jest.fn()} onRefresh={onRefresh} />);
  await waitFor(() => expect(fetcher.mock.calls.some(([url]) => url.includes('experience_id=other'))).toBe(true));
  await act(async () => late.resolve(response(value('2026-12'))));
  expect(screen.getByText('November 2026')).toBeTruthy();
  fetcher.mockRejectedValue(new Error('Offline'));
  fireEvent.click(screen.getByRole('button', { name: 'Refresh dates' }));
  await screen.findByRole('alert');
  expect(onRefresh).toHaveBeenCalledTimes(1);
  expect(screen.getByText('November 2026')).toBeTruthy();
  expect(screen.queryByRole('button', { name: /, available$/ })).toBeNull();
});

test('repeated DST times retain distinct choices without timezone labels', () => {
  const slots = [
    { start: '2026-11-01T06:00Z', time: '01:00', label: 'EST' },
    { start: '2026-11-01T07:00Z', time: '01:00', label: 'CST' },
  ];
  expect(arrivalLabel(slots[0], slots)).toBe('1:00 AM (1 of 2)');
  expect(arrivalLabel(slots[1], slots)).toBe('1:00 AM (2 of 2)');
});
