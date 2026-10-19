import React from 'react';
import { TextEncoder, TextDecoder } from 'util';
// Router requires these in jsdom.
Object.assign(globalThis, { TextEncoder, TextDecoder });
const { createMemoryRouter, RouterProvider } = require('react-router');
const { render, screen, fireEvent, waitFor, cleanup } = require('@testing-library/react');
const { EventRequestForm } = require('../EventRequestForm');
const { AvailabilityCalendar } = require('../AvailabilityCalendar');
const experience = {
  id: 'exp',
  name: 'Dinner',
  slug: 'plated-dinner',
  is_active: true,
  is_featured: true,
  highlights: [],
};
const slot = { start: '2026-11-01T06:00:00.000Z', time: '01:00', label: '1:00 AM EST (-05:00)' };
const calendar = (month = '2026-11') => ({
  month,
  experienceId: 'exp',
  timezone: 'America/New_York',
  minDate: '2026-11-01',
  maxDate: '2026-12-31',
  dates: [
    { date: `${month}-01`, available: true },
    { date: `${month}-02`, available: false },
  ],
});
let slots = [slot];
let fail = false;
const request = jest.fn(async (url: string) => {
  if (fail) throw new Error('Offline');
  const params = new URL(url, 'http://localhost').searchParams;
  return {
    ok: true,
    json: async () =>
      url.includes('availability-calendar')
        ? calendar(params.get('month') || undefined)
        : { date: params.get('date'), experienceId: 'exp', timezone: 'America/New_York', slots },
  };
});
beforeEach(() => {
  slots = [slot];
  fail = false;
  request.mockClear();
  global.fetch = request as any;
  window.scrollTo = jest.fn();
  HTMLElement.prototype.scrollTo = jest.fn();
});
afterEach(cleanup);
function builder(experienceTypes = [experience]) {
  const router = createMemoryRouter(
    [
      {
        path: '/request',
        element: (
          <EventRequestForm
            menus={[]}
            experienceTypes={experienceTypes}
            initialValues={{
              menuId: 'menu',
              firstName: 'A',
              lastName: 'B',
              email: 'a@example.com',
              phone: '1234567890',
              locationAddress: '123 Example Street',
            }}
          />
        ),
      },
    ],
    { initialEntries: ['/request'] },
  );
  return render(<RouterProvider router={router} />);
}
async function schedule() {
  fireEvent.click(screen.getByRole('button', { name: 'Next Step' }));
  await screen.findByRole('button', { name: '2026-11-01, available' });
  fireEvent.click(screen.getByRole('button', { name: '2026-11-01, available' }));
  await screen.findByRole('option', { name: '1:00 AM' });
  fireEvent.change(screen.getByLabelText('Available arrival time'), { target: { value: slot.start } });
  await waitFor(() => expect(screen.getByRole('button', { name: 'Next Step' }).disabled).toBe(false));
}
test('real request builder retains and revalidates an arrival when returning, without timezone text in review', async () => {
  builder();
  await schedule();
  expect(screen.getByRole('button', { name: '2026-11-02, unavailable' }).disabled).toBe(true);
  expect(screen.queryByText(/Selected date:/)).toBeNull();
  expect(screen.queryByText(/Your selected experience’s duration/)).toBeNull();
  expect(screen.getByRole('button', { name: '2026-11-01, available' }).getAttribute('aria-pressed')).toBe('true');
  fireEvent.click(screen.getByRole('button', { name: 'Next Step' }));
  fireEvent.click(screen.getByRole('button', { name: 'Previous' }));
  await waitFor(() => expect(screen.getByLabelText('Available arrival time').value).toBe(slot.start));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Next Step' }).disabled).toBe(false));
  expect(request.mock.calls.filter(([url]) => !url.includes('availability-calendar')).length).toBe(2);
  fireEvent.click(screen.getByRole('button', { name: 'Review Now' }));
  expect(screen.getByText('1:00 AM')).toBeTruthy();
  expect(screen.queryByText(/America\/New_York/)).toBeNull();
});
test('revisiting clears a stale arrival and prevents continuation', async () => {
  builder();
  await schedule();
  fireEvent.click(screen.getByRole('button', { name: 'Next Step' }));
  slots = [];
  fireEvent.click(screen.getByRole('button', { name: 'Previous' }));
  await screen.findByText(/previous time is no longer available/);
  expect(screen.getByLabelText('Available arrival time').value).toBe('');
  expect(screen.getByRole('button', { name: 'Next Step' }).disabled).toBe(true);
});
test('failed revisit retains choice but blocks continuation until successful retry', async () => {
  builder();
  await schedule();
  fireEvent.click(screen.getByRole('button', { name: 'Next Step' }));
  fail = true;
  fireEvent.click(screen.getByRole('button', { name: 'Previous' }));
  await screen.findByText(/Arrival times could not be checked/);
  expect(screen.getByRole('button', { name: 'Next Step' }).disabled).toBe(true);
  fail = false;
  expect(screen.queryByRole('button', { name: 'Refresh arrival times' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Refresh dates' }));
  await waitFor(() => expect(screen.getByLabelText('Available arrival time').value).toBe(slot.start));
});
test('missing catalog is explained and cannot advance', () => {
  builder([]);
  expect(screen.getByRole('alert').textContent).toContain('catalog is unavailable');
  expect(screen.getByRole('button', { name: 'Next Step' }).disabled).toBe(true);
});
test('month navigation is bounded, disables closed dates and handles lookup failure', async () => {
  const select = jest.fn();
  render(<AvailabilityCalendar experienceId="exp" selected="" onSelect={select} />);
  await screen.findByText('November 2026');
  expect(screen.getByRole('button', { name: 'Previous month' }).disabled).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: '2026-11-02, unavailable' }));
  expect(select).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Next month' }));
  await screen.findByText('December 2026');
  expect(screen.getByRole('button', { name: 'Next month' }).disabled).toBe(true);
  fail = true;
  fireEvent.click(screen.getByRole('button', { name: 'Refresh dates' }));
  await screen.findByRole('alert');
  expect(screen.queryByRole('button', { name: '2026-12-01, available' })).toBeNull();
});

test('calendar arrow keys skip unavailable dates', async () => {
  request.mockImplementationOnce(async () => ({
    ok: true,
    json: async () => ({ ...calendar(), dates: [...calendar().dates, { date: '2026-11-03', available: true }] }),
  }));
  render(<AvailabilityCalendar experienceId="exp" selected="" onSelect={jest.fn()} />);
  const first = await screen.findByRole('button', { name: '2026-11-01, available' });
  first.focus();
  fireEvent.keyDown(first, { key: 'ArrowRight' });
  expect(document.activeElement).toBe(screen.getByRole('button', { name: '2026-11-03, available' }));
});

test('changing the experience invalidates the prior arrival', async () => {
  const view = builder([experience, { ...experience, id: 'other', name: 'Lunch', is_featured: false }]);
  await schedule();
  fireEvent.click(screen.getByRole('button', { name: 'Previous' }));
  fireEvent.click(screen.getByRole('button', { name: /^Experience Type/ }));
  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'exp:other' } });
  await waitFor(() =>
    expect((view.container.querySelector('input[name=slotStart]') as HTMLInputElement).value).toBe(''),
  );
});
test('request schema rejects a missing experience ID', () => {
  const { eventRequestSchema } = require('../schema');
  expect(eventRequestSchema.shape.experienceTypeId.safeParse(undefined).success).toBe(false);
  expect(eventRequestSchema.shape.experienceTypeId.safeParse('').success).toBe(false);
});

test('Refresh dates also rechecks a selected arrival and blocks a newly unavailable choice', async () => {
  builder();
  await schedule();
  slots = [];
  fireEvent.click(screen.getByRole('button', { name: 'Refresh dates' }));
  await screen.findByText(/previous time is no longer available/);
  expect(screen.getByLabelText('Available arrival time').value).toBe('');
  expect(screen.getByRole('button', { name: 'Next Step' }).disabled).toBe(true);
});
