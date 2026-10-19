/** @jest-environment jsdom */
import React from 'react';
import { TooltipProvider } from '@medusajs/ui';
import { act, Simulate } from 'react-dom/test-utils';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ArrivalPreview } from '../../admin/components/availability/arrival-preview';
import { ExceptionsEditor } from '../../admin/components/availability/exceptions-editor';
import AvailabilityPage from '../../admin/routes/availability/page';
import { sdk } from '../../sdk';
import type { Settings } from '../availability/slots';
jest.mock('../../sdk', () => ({
  sdk: {
    admin: {
      availability: { get: jest.fn(), save: jest.fn(), preview: jest.fn() },
      experienceTypes: { list: jest.fn() },
    },
  },
}));
jest.mock('../../admin/components/availability/google-calendar-panel', () => ({
  __esModule: true,
  default: ({ children }: any) => React.createElement('section', null, children),
}));
const api = sdk.admin.availability as jest.Mocked<typeof sdk.admin.availability>;
const list = sdk.admin.experienceTypes.list as jest.Mock;
const saved: Settings = {
  timezone: 'America/Chicago',
  weekly: { '1': [{ start: '10:00', end: '20:00' }] },
  overrides: { '2026-11-01': [{ start: '11:00', end: '17:00' }] },
  google_mode: 'internal_only',
};
let host: HTMLDivElement;
let root: Root;
let client: QueryClient;
const settle = () => new Promise((resolve) => setTimeout(resolve, 15));
async function render(element: React.ReactElement) {
  await act(async () => {
    root.render(
      React.createElement(
        QueryClientProvider,
        { client },
        React.createElement(MemoryRouter, null, React.createElement(TooltipProvider, null, element)),
      ),
    );
    await settle();
  });
}
async function change(element: Element, value: string) {
  await act(async () => {
    Simulate.change(element, { target: { value } } as any);
    await settle();
  });
}
async function click(text: string) {
  const button = [...host.querySelectorAll('button')].find((node) => node.textContent === text);
  expect(button).toBeDefined();
  await act(async () => {
    button!.click();
    await settle();
  });
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  jest.clearAllMocks();
  api.get.mockResolvedValue({ settings: saved });
  list.mockResolvedValue({ experience_types: [{ id: 'exp', name: 'Dinner', is_active: true }] });
});
afterEach(async () => {
  await act(async () => root.unmount());
  client.clear();
  host.remove();
});
test('duplicate date opens existing custom hours without overwriting them', async () => {
  const onChange = jest.fn();
  await render(React.createElement(ExceptionsEditor, { settings: saved, onChange, onEditing: jest.fn() }));
  await click('Add dates');
  await change(host.querySelector('input[type=date]')!, '2026-11-01');
  await click('Apply to draft');
  expect(onChange).not.toHaveBeenCalled();
  expect((host.querySelector('input[type=time]') as HTMLInputElement).value).toBe('11:00');
  expect(host.textContent).toContain('already has an exception');
});
test('preview labels unsaved edits and ignores late responses for an earlier date', async () => {
  const first = deferred<any>();
  const second = deferred<any>();
  api.preview.mockImplementation((date) => (date === '2026-11-01' ? first.promise : second.promise));
  await render(React.createElement(ArrivalPreview, { configured: true, dirty: true, revision: 0 }));
  await change(host.querySelector('select')!, 'exp');
  await change(host.querySelector('input[type=date]')!, '2026-11-01');
  await change(host.querySelector('input[type=date]')!, '2026-11-02');
  await act(async () => {
    second.resolve({
      date: '2026-11-02',
      experienceId: 'exp',
      timezone: 'America/Chicago',
      slots: [{ start: 'second', label: 'NEW TIME' }],
    });
    await settle();
  });
  await act(async () => {
    first.resolve({
      date: '2026-11-01',
      experienceId: 'exp',
      timezone: 'America/Chicago',
      slots: [{ start: 'first', label: 'OLD TIME' }],
    });
    await settle();
  });
  expect(host.textContent).toContain('Your draft is not live');
  expect(host.textContent).toContain('NEW TIME');
  expect(host.textContent).not.toContain('OLD TIME');
});
test('preview distinguishes failed lookups from no arrival times', async () => {
  api.preview.mockRejectedValue(new Error('Offline'));
  await render(React.createElement(ArrivalPreview, { configured: true, dirty: false, revision: 0 }));
  await change(host.querySelector('select')!, 'exp');
  await change(host.querySelector('input[type=date]')!, '2026-11-01');
  await act(settle);
  expect(host.textContent).toContain('Could not check availability');
  expect(host.textContent).not.toContain('No arrival times available');
});
test('save in flight and background refetch cannot overwrite newer input; failures preserve it', async () => {
  const saving = deferred<any>();
  api.save.mockReturnValueOnce(saving.promise);
  await render(React.createElement(AvailabilityPage));
  await act(settle);
  const timezone = () => host.querySelector('input[list=chef-timezones]') as HTMLInputElement;
  await change(timezone(), 'Europe/London');
  await click('Save availability');
  await change(timezone(), 'Europe/Paris');
  await act(async () => {
    client.setQueryData(['availability'], { settings: saved });
    saving.resolve({ settings: { ...saved, timezone: 'Europe/London' } });
    await settle();
  });
  expect(timezone().value).toBe('Europe/Paris');
  expect(host.textContent).toContain('Unsaved changes');
  api.save.mockRejectedValueOnce(new Error('Save failed'));
  await click('Save availability');
  expect(timezone().value).toBe('Europe/Paris');
  expect(host.textContent).toContain('Save failed');
  await click('Discard');
  expect(timezone().value).toBe('Europe/London');
});
test('configured days can move and be removed; adding excludes duplicates and starts with blank hours', async () => {
  await render(React.createElement(AvailabilityPage));
  await act(settle);
  expect(host.querySelector('[aria-label="Working day Monday"]')).not.toBeNull();
  expect(host.querySelector('[aria-label="Working day Tuesday"]')).toBeNull();
  await click('Add working day');
  const newDay = host.querySelector('[aria-label="New working day"]')!;
  expect(newDay.textContent).not.toContain('Monday');
  await change(newDay, '2');
  expect((host.querySelector('[aria-label="Tuesday start 1"]') as HTMLInputElement).value).toBe('');
  await change(host.querySelector('[aria-label="Working day Monday"]')!, '3');
  expect((host.querySelector('[aria-label="Wednesday start 1"]') as HTMLInputElement).value).toBe('10:00');
  await act(async () => Simulate.click(host.querySelector('[aria-label="Remove Wednesday working day"]')!));
  expect(host.querySelector('[aria-label="Wednesday start 1"]')).toBeNull();
  await click('Discard');
  expect((host.querySelector('[aria-label="Monday start 1"]') as HTMLInputElement).value).toBe('10:00');
  expect(host.querySelector('[aria-label="Tuesday start 1"]')).toBeNull();
});
test('empty schedule starts with an uncommitted day and never publishes default hours', async () => {
  api.get.mockResolvedValue({ settings: { ...saved, weekly: {} } });
  await render(React.createElement(AvailabilityPage));
  await act(settle);
  expect(host.querySelector('[aria-label="New working day"]')).not.toBeNull();
  expect(host.querySelector('input[type=time]')).toBeNull();
  expect(host.textContent).toContain('Days not listed are unavailable');
  expect(api.save).not.toHaveBeenCalled();
});
test('successful saved revision refreshes preview while unsaved edits do not', async () => {
  api.preview.mockResolvedValue({ date: '2026-11-01', experienceId: 'exp', timezone: 'America/Chicago', slots: [] });
  await render(React.createElement(ArrivalPreview, { configured: true, dirty: false, revision: 0 }));
  await change(host.querySelector('select')!, 'exp');
  await change(host.querySelector('input[type=date]')!, '2026-11-01');
  await act(settle);
  expect(host.textContent).toContain('No arrival times available');
  const calls = api.preview.mock.calls.length;
  await render(React.createElement(ArrivalPreview, { configured: true, dirty: true, revision: 0 }));
  expect(api.preview).toHaveBeenCalledTimes(calls);
  await render(React.createElement(ArrivalPreview, { configured: true, dirty: false, revision: 1 }));
  expect(api.preview).toHaveBeenCalledTimes(calls + 1);
});

test('working-window guidance uses a named keyboard tooltip and removal controls identify their scope', async () => {
  await render(React.createElement(AvailabilityPage));
  await act(settle);
  expect(host.textContent).not.toContain('Leave room for the whole visit');
  const help = host.querySelector<HTMLButtonElement>('[aria-label="About working hours"]')!;
  expect(help.tagName).toBe('BUTTON');
  await act(async () => {
    help.focus();
    await settle();
  });
  expect(document.querySelector('[role="tooltip"]')?.textContent).toContain('Leave room for the whole visit');
  await act(async () => {
    help.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await settle();
  });
  expect(document.querySelector('[role="tooltip"]')).toBeNull();
  expect(host.querySelector('[aria-label="Remove Monday period 1"]')?.textContent).toBe('Remove period');
  expect(host.querySelector('[aria-label="Remove Monday working day"]')?.textContent).toBe('Remove day');
});
test('split periods retain distinct labels and independent remove actions', async () => {
  api.get.mockResolvedValue({
    settings: {
      ...saved,
      weekly: {
        '1': [
          { start: '09:00', end: '12:00' },
          { start: '14:00', end: '18:00' },
        ],
      },
    },
  });
  await render(React.createElement(AvailabilityPage));
  await act(settle);
  await act(async () => Simulate.click(host.querySelector('[aria-label="Remove Monday period 1"]')!));
  expect((host.querySelector('[aria-label="Monday start 1"]') as HTMLInputElement).value).toBe('14:00');
  expect(host.querySelector('[aria-label="Remove Monday working day"]')).not.toBeNull();
});

test('preview displays the server’s actionable Google connection diagnostic', async () => {
  api.preview.mockRejectedValue(new Error('Connect Google Calendar in Availability settings.'));
  await render(React.createElement(ArrivalPreview, { configured: true, dirty: false, revision: 0 }));
  await change(host.querySelector('select')!, 'exp');
  await change(host.querySelector('input[type=date]')!, '2026-11-01');
  await act(settle);
  expect(host.textContent).toContain('Connect Google Calendar in Availability settings.');
  expect(host.textContent).toContain('This does not mean the day is free.');
});

test('save and discard appear only for edits; reset restores saved values and hides actions', async () => {
  await render(React.createElement(AvailabilityPage));
  await act(settle);
  const button = (text: string) => [...host.querySelectorAll('button')].find((node) => node.textContent === text);
  expect(button('Save availability')).toBeUndefined();
  expect(button('Discard')).toBeUndefined();
  await act(async () => Simulate.submit(host.querySelector('form')!));
  expect(api.save).not.toHaveBeenCalled();
  const timezone = host.querySelector('input[list=chef-timezones]') as HTMLInputElement;
  await change(timezone, 'Europe/London');
  expect(button('Save availability')?.type).toBe('submit');
  expect(button('Discard')).toBeDefined();
  await click('Discard');
  expect(timezone.value).toBe('America/Chicago');
  expect(button('Save availability')).toBeUndefined();
  expect(button('Discard')).toBeUndefined();
});

test('form submission validates before save and hides actions after a successful save', async () => {
  api.save.mockImplementation(async (settings) => ({ settings }));
  await render(React.createElement(AvailabilityPage));
  await act(settle);
  const timezone = host.querySelector('input[list=chef-timezones]')!;
  await change(timezone, 'Not/AZone');
  await act(async () => Simulate.submit(host.querySelector('form')!));
  expect(api.save).not.toHaveBeenCalled();
  expect(timezone.getAttribute('aria-describedby')).toBe('availability-timezone-error');
  await change(timezone, 'Europe/London');
  await act(async () => {
    Simulate.submit(host.querySelector('form')!);
    await settle();
  });
  expect(api.save).toHaveBeenCalledWith({ ...saved, timezone: 'Europe/London' });
  expect([...host.querySelectorAll('button')].find((node) => node.textContent === 'Save availability')).toBeUndefined();
  expect(host.textContent).toContain('All changes saved');
});

test('working-day and period actions never submit the availability form', async () => {
  await render(React.createElement(AvailabilityPage));
  await act(settle);
  const day = host.querySelector('[aria-label="Monday working hours"]')!;
  expect(day).not.toBeNull();
  expect([...day.querySelectorAll('button')].every((button) => button.type === 'button')).toBe(true);
  await click('+ Add a period');
  expect(host.querySelector('[aria-label="Monday start 2"]')).not.toBeNull();
  expect(api.save).not.toHaveBeenCalled();
});
