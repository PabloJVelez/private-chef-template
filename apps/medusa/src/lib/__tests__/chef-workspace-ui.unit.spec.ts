/**
 * @jest-environment jsdom
 * @jest-environment-options {"customExportConditions":["node","node-addons"]}
 */
import React from 'react';
import { act } from 'react-dom/test-utils';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@medusajs/ui';
import { ChefEventCalendar } from '../../admin/routes/chef-events/components/chef-event-calendar';
import { sdk } from '../../sdk';
import { privateEventSummary } from '../chef-workspace/private-event';

jest.mock('../../admin/styles/workspace-calendar.css', () => ({}));
jest.mock('../../sdk', () => ({
  sdk: {
    admin: {
      chefWorkspace: { calendar: jest.fn() },
      chefEvents: { retrieve: jest.fn() },
      googleCalendar: { getStatus: jest.fn() },
    },
  },
}));
const calendar = sdk.admin.chefWorkspace.calendar as jest.Mock;
const status = sdk.admin.googleCalendar.getStatus as jest.Mock;
const retrieve = sdk.admin.chefEvents.retrieve as jest.Mock;
let host: HTMLDivElement, root: Root, client: QueryClient;
const settle = () => new Promise((resolve) => setTimeout(resolve, 25));
const summary = privateEventSummary({
  id: 'evt_A',
  firstName: 'Example',
  lastName: 'Host',
  status: 'pending',
  eventType: 'plated_dinner',
  requestedDate: '2027-03-14T12:00:00Z',
  timeZone: 'UTC',
  estimatedDuration: 60,
});
const entry = { ...summary, displayTime: summary.requestedTime!, protectedTime: [] };
function Location() {
  return React.createElement('output', { 'data-location': true }, useLocation().pathname + useLocation().search);
}
async function render(url = '/chef-events?date=2027-03-14&view=agenda') {
  await act(async () => {
    root.render(
      React.createElement(
        QueryClientProvider,
        { client },
        React.createElement(
          MemoryRouter,
          { initialEntries: [url] },
          React.createElement(
            TooltipProvider,
            null,
            React.createElement(ChefEventCalendar),
            React.createElement(Location),
          ),
        ),
      ),
    );
    await settle();
  });
  await act(settle);
}
async function click(text: string) {
  const button = [...host.querySelectorAll('button')].find((node) => node.textContent === text || node.getAttribute('aria-label') === text);
  expect(button).toBeDefined();
  await act(async () => {
    button!.click();
    await settle();
  });
  await act(settle);
}
beforeAll(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as any;
  window.matchMedia = jest.fn(() => ({ matches: false, addListener() {}, removeListener() {} })) as any;
});
beforeEach(() => {
  jest.clearAllMocks();
  calendar.mockResolvedValue({ complete: true, entries: [entry] });
  status.mockResolvedValue({ status: 'not_connected', pendingIncidents: [] });
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});
afterEach(async () => {
  await act(async () => root.unmount());
  client.clear();
  host.remove();
});
it('renders the existing agenda, sends bounded reads and navigates to the existing detail URL', async () => {
  await render();
  expect(calendar).toHaveBeenCalledWith(
    expect.objectContaining({ start: expect.any(String), end: expect.any(String), statuses: ['pending', 'confirmed'] }),
    expect.anything(),
  );
  expect(calendar.mock.calls[0][0]).not.toHaveProperty('limit');
  expect(host.textContent).toContain('Pending request');
  const event = host.querySelector<HTMLElement>('.fc-list-event button')!;
  await act(async () => {
    event.click();
    await settle();
  });
  expect(host.querySelector('output')?.textContent).toBe('/chef-events/evt_A');
});
it('uses URL status filters on the very first read and preserves date on drilldown', async () => {
  await render('/chef-events?date=2027-03-14&view=month&statuses=completed');
  expect(calendar.mock.calls[0][0].statuses).toEqual(['completed']);
  const day = host.querySelector<HTMLButtonElement>('.workspace-date-button')!;
  expect(day).not.toBeNull();
  await act(async () => {
    day.click();
    await settle();
  });
  expect(host.querySelector('output')?.textContent).toContain('view=day');
  expect(host.querySelector('output')?.textContent).toContain('statuses=completed');
});
it('clears the previous range during loading and distinguishes failure/retry from empty', async () => {
  await render();
  calendar.mockImplementationOnce(() => new Promise(() => {}));
  await click('Next');
  expect(host.textContent).not.toContain('Example Host');
  expect(host.textContent).toContain('Loading events');
  calendar.mockRejectedValueOnce(new Error('Range read timed out'));
  await click('Next');
  expect(host.querySelector('[role="alert"]')?.textContent).toContain('Calendar unavailable');
  expect(host.textContent).not.toContain('No events in this range');
  calendar.mockResolvedValueOnce({ complete: true, entries: [] });
  await click('Retry');
  expect(host.querySelector('[role="alert"]')).toBeNull();
  expect(host.textContent).toContain('No events in this range');
});
it('loads selected incident detail even when it is outside the visible range', async () => {
  status.mockResolvedValue({
    status: 'not_connected',
    pendingIncidents: [{ id: 'incident', chefEventId: 'outside', payload: {} }],
  });
  retrieve.mockResolvedValue({
    id: 'outside',
    firstName: 'Incident',
    lastName: 'Host',
    requestedDate: '2028-01-01T12:00:00Z',
    timeZone: 'UTC',
  });
  await render('/chef-events?date=2027-03-14&view=agenda&incident=incident');
  await act(settle);
  expect(retrieve).toHaveBeenCalledWith('outside');
  expect(document.body.textContent).toContain('Incident Host');
});

it('shows the full November month, switches views and retains the exact chosen date', async () => {
  await render('/chef-events?date=2026-11-10&view=month&statuses=completed');
  expect(host.querySelector('[data-date="2026-11-29"]')).not.toBeNull();
  expect(host.querySelector('[data-date="2026-11-30"]')).not.toBeNull();
  expect(host.querySelector('[data-date="2026-10-18"]')).toBeNull();
  await click('Day');
  expect(host.querySelector('.fc-timeGridDay-view')).not.toBeNull();
  expect(host.querySelector('output')?.textContent).toContain('date=2026-11-10');
  expect(host.querySelector('output')?.textContent).toContain('statuses=completed');
  await click('Agenda');
  expect(host.querySelector('.fc-workspaceAgenda-view')).not.toBeNull();
  expect(host.querySelector('output')?.textContent).toContain('date=2026-11-10');
  expect(calendar.mock.calls.every(([query]) => query.start && query.end)).toBe(true);
});
it('does not display a late response from a previously selected range', async () => {
  await render();
  let resolveOld!: (value: unknown) => void;
  calendar.mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }));
  await click('Next');
  expect(host.textContent).not.toContain('Example Host');
  calendar.mockResolvedValueOnce({ complete: true, entries: [] });
  await click('Next');
  await act(async () => { resolveOld({ complete: true, entries: [entry] }); await settle(); });
  expect(host.textContent).not.toContain('Example Host');
  expect(host.textContent).toContain('No events in this range');
});
