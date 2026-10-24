/** @jest-environment jsdom */
import React from 'react';
import { TooltipProvider, toast } from '@medusajs/ui';
import { act, Simulate } from 'react-dom/test-utils';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ExceptionsEditor } from '../../admin/components/availability/exceptions-editor';
import AvailabilityPage from '../../admin/routes/availability/page';
import { sdk } from '../../sdk';
import type { Settings } from '../availability/slots';
jest.mock('../../sdk', () => ({
  sdk: {
    admin: {
      availability: { get: jest.fn(), save: jest.fn() },
      experienceTypes: { list: jest.fn() },
    },
  },
}));
jest.mock('../../admin/components/availability/google-calendar-panel', () => ({
  __esModule: true,
  default: ({ children }: any) => React.createElement('section', null, children),
}));
class TestResizeObserver { observe() {} unobserve() {} disconnect() {} }
beforeAll(() => { globalThis.ResizeObserver = TestResizeObserver as unknown as typeof ResizeObserver; });
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
test('save in flight and background refetch cannot overwrite newer input; failures preserve it', async () => {
  const saving = deferred<any>();
  api.save.mockReturnValueOnce(saving.promise);
  await render(React.createElement(AvailabilityPage));
  await act(settle);
  await click('Change timezone');
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
  expect(host.textContent).toContain('Europe/London');
  expect(host.querySelector('input[list=chef-timezones]')).toBeNull();
});
test('empty schedule starts with an uncommitted day and never publishes default hours', async () => {
  api.get.mockResolvedValue({ settings: { ...saved, weekly: {} } });
  await render(React.createElement(AvailabilityPage));
  await act(settle);
  expect(host.textContent).toContain('No working days yet');
  expect(host.querySelector('input[type=time]')).toBeNull();
  expect(host.textContent).toContain('Days not listed are unavailable');
  expect(api.save).not.toHaveBeenCalled();
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
  expect(host.querySelector('[aria-label="Remove Monday time range 1"]')).toBeNull();
  expect(host.querySelector('[aria-label="Actions for Monday"]')).not.toBeNull();
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
  await act(async () => Simulate.click(host.querySelector('[aria-label="Remove Monday time range 1"]')!));
  expect((host.querySelector('[aria-label="Monday start 1"]') as HTMLInputElement).value).toBe('14:00');
  expect(host.querySelector('[aria-label="Actions for Monday"]')).not.toBeNull();
});

test('save and discard appear only for edits; reset restores saved values and hides actions', async () => {
  await render(React.createElement(AvailabilityPage));
  await act(settle);
  const button = (text: string) => [...host.querySelectorAll('button')].find((node) => node.textContent === text);
  expect(button('Save availability')).toBeUndefined();
  expect(button('Discard')).toBeUndefined();
  await act(async () => Simulate.submit(host.querySelector('form')!));
  expect(api.save).not.toHaveBeenCalled();
  await click('Change timezone');
  const timezone = host.querySelector('input[list=chef-timezones]') as HTMLInputElement;
  await change(timezone, 'Europe/London');
  expect(button('Save availability')?.type).toBe('submit');
  expect(button('Discard')).toBeDefined();
  await click('Discard');
  expect(host.textContent).toContain('America/Chicago');
  expect(host.querySelector('input[list=chef-timezones]')).toBeNull();
  expect(button('Save availability')).toBeUndefined();
  expect(button('Discard')).toBeUndefined();
});

test('form submission validates before save and hides actions after a successful save', async () => {
  api.save.mockImplementation(async (settings) => ({ settings }));
  await render(React.createElement(AvailabilityPage));
  await act(settle);
  await click('Change timezone');
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
  await menuAction('Monday', 'Add another time range');
  expect(host.querySelector('[aria-label="Monday start 2"]')).not.toBeNull();
  expect(api.save).not.toHaveBeenCalled();
});

test('availability loads experiences for notice rules without the old preview/settings strip', async () => {
  await render(React.createElement(AvailabilityPage));
  await act(settle);
  expect(host.textContent).not.toContain('What clients can request');
  expect(host.querySelector('#preview-heading')).toBeNull();
  expect(list).toHaveBeenCalledTimes(1);
  expect(host.textContent).toContain('Advance notice');
  const link = host.querySelector('a[href="/experience-types"]');
  expect(link).toBeNull();
  expect(host.textContent).not.toContain('Set experience duration, preparation, travel and cleanup in Experiences.');
});

async function openMenu(day: string) {
  const trigger = host.querySelector<HTMLButtonElement>(`[aria-label="Actions for ${day}"]`)!;
  await act(async () => {
    trigger.focus();
    trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await settle();
  });
  expect(trigger.getAttribute('aria-expanded')).toBe('true');
  return trigger;
}
async function menuAction(day: string, text: string) {
  await openMenu(day);
  const item = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(
    (node) => node.textContent === text,
  )!;
  expect(item).toBeDefined();
  await act(async () => {
    item.click();
    await settle();
  });
}
async function checkDay(text: string) {
  const label = [...host.querySelectorAll('fieldset label')].find((node) => node.textContent?.trim() === text)!;
  expect(label).toBeDefined();
  await act(async () => {
    label.querySelector<HTMLInputElement>('input')!.click();
    await settle();
  });
}
test('multi-day add excludes configured days, validates, creates independent rows and resets', async () => {
  await render(React.createElement(AvailabilityPage));
  await act(settle);
  await click('Add working day');
  expect(document.activeElement?.tagName).toBe('FIELDSET');
  expect([...host.querySelectorAll('fieldset label')].some((node) => node.textContent === 'Monday')).toBe(false);
  expect((host.querySelector('[aria-label="New working days start 1"]') as HTMLInputElement).value).toBe('');
  await click('Apply working days');
  expect(host.textContent).toContain('Select at least one day');
  await checkDay('Tuesday');
  await checkDay('Wednesday');
  await click('Apply working days');
  expect(host.textContent).toContain('Enter valid hours');
  await change(host.querySelector('[aria-label="New working days start 1"]')!, '09:00');
  await change(host.querySelector('[aria-label="New working days end 1"]')!, '17:00');
  await click('Apply working days');
  await change(host.querySelector('[aria-label="Tuesday start 1"]')!, '10:00');
  expect((host.querySelector('[aria-label="Wednesday start 1"]') as HTMLInputElement).value).toBe('09:00');
  expect(api.save).not.toHaveBeenCalled();
  await click('Discard');
  expect(host.querySelector('[aria-label="Tuesday start 1"]')).toBeNull();
  expect((host.querySelector('[aria-label="Monday start 1"]') as HTMLInputElement).value).toBe('10:00');
});
test('cancel and Escape discard only the new-day editor and restore focus', async () => {
  await render(React.createElement(AvailabilityPage));
  await act(settle);
  await click('Add working day');
  await checkDay('Tuesday');
  await click('Cancel');
  expect(document.activeElement?.textContent).toBe('Add working day');
  expect(host.querySelector('[aria-label="Tuesday start 1"]')).toBeNull();
  await click('Add working day');
  await act(async () => {
    host.querySelector('fieldset[tabindex]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await settle();
  });
  expect(document.activeElement?.textContent).toBe('Add working day');
  expect(host.querySelector('fieldset[tabindex]')).toBeNull();
  expect(api.save).not.toHaveBeenCalled();
});
test('native day menu opens from keyboard, closes with Escape and returns focus', async () => {
  await render(React.createElement(AvailabilityPage));
  await act(settle);
  const trigger = await openMenu('Monday');
  expect(document.querySelector('[role="menu"]')).not.toBeNull();
  await act(async () => {
    document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await settle();
  });
  await act(settle);
  expect(document.querySelector('[role="menu"]')).toBeNull();
  expect(document.activeElement).toBe(trigger);
});
test('copy keeps all ranges and requires replacement confirmation; remove day removes final range', async () => {
  api.get.mockResolvedValue({
    settings: {
      ...saved,
      weekly: {
        '1': [
          { start: '09:00', end: '12:00' },
          { start: '14:00', end: '18:00' },
        ],
        '2': [{ start: '10:00', end: '11:00' }],
      },
    },
  });
  await render(React.createElement(AvailabilityPage));
  await act(settle);
  await menuAction('Monday', 'Copy to other days');
  await checkDay('Tuesday');
  await click('Apply copy');
  expect(host.textContent).toContain('Confirm replacement');
  expect((host.querySelector('[aria-label="Tuesday end 1"]') as HTMLInputElement).value).toBe('11:00');
  await checkDay('Replace existing hours on selected days');
  await click('Apply copy');
  expect((host.querySelector('[aria-label="Tuesday start 2"]') as HTMLInputElement).value).toBe('14:00');
  await act(async () => {
    host.querySelector<HTMLButtonElement>('[aria-label="Remove Tuesday time range 1"]')!.click();
    await settle();
  });
  expect(host.querySelector('[aria-label="Remove Tuesday time range 1"]')).toBeNull();
  await menuAction('Tuesday', 'Remove day');
  expect(host.querySelector('[aria-label="Tuesday start 1"]')).toBeNull();
});

test('timezone summary preserves the exact IANA value until an explicit edit', async () => {
  await render(React.createElement(AvailabilityPage));
  await act(settle);
  expect(host.textContent).toContain('Chicago · America/Chicago');
  expect(host.querySelector('input[list=chef-timezones]')).toBeNull();
  await click('Change timezone');
  expect((host.querySelector('input[list=chef-timezones]') as HTMLInputElement).value).toBe('America/Chicago');
  await click('Done');
  expect(host.textContent).toContain('Chicago · America/Chicago');
  expect([...host.querySelectorAll('button')].some((button) => button.textContent === 'Save availability')).toBe(false);
  expect(api.save).not.toHaveBeenCalled();
});

test('top Save owns the form, accepts minute times on native click, and reloads the saved response', async () => {
  let stored = saved;
  api.get.mockImplementation(async () => ({ settings: stored }));
  api.save.mockImplementation(async (settings) => {
    stored = JSON.parse(JSON.stringify(settings));
    return { settings: stored };
  });
  await render(React.createElement(AvailabilityPage));
  await act(settle);
  await change(host.querySelector('[aria-label="Monday start 1"]')!, '09:01');
  await change(host.querySelector('[aria-label="Monday end 1"]')!, '21:02');
  const form = host.querySelector('form')!;
  const button = [...host.querySelectorAll('button')].find((node) => node.textContent === 'Save availability')!;
  expect(button.form).toBe(form);
  expect(form.contains(button)).toBe(false);
  expect(form.checkValidity()).toBe(true);
  await click('Save availability');
  expect(api.save).toHaveBeenCalledWith({ ...saved, weekly: { '1': [{ start: '09:01', end: '21:02' }] } });
  expect(host.textContent).toContain('All changes saved');
  await act(async () => root.unmount());
  client.clear();
  root = createRoot(host);
  await render(React.createElement(AvailabilityPage));
  await act(settle);
  expect(host.querySelector<HTMLInputElement>('[aria-label="Monday start 1"]')!.value).toBe('09:01');
  expect(host.querySelector<HTMLInputElement>('[aria-label="Monday end 1"]')!.value).toBe('21:02');
  expect(host.textContent).not.toContain('Save availability');
});

test('all seven days hide Add and its help; removing a day restores both', async () => {
  api.get.mockResolvedValue({
    settings: {
      ...saved,
      weekly: Object.fromEntries(
        Array.from({ length: 7 }, (_, i) => [String(i + 1), [{ start: '09:01', end: '21:02' }]]),
      ),
    },
  });
  await render(React.createElement(AvailabilityPage));
  await act(settle);
  expect(host.textContent).not.toContain('Add working day');
  expect(host.querySelector('[aria-label="About adding working days"]')).toBeNull();
  const end = host.querySelector('[aria-label="Monday end 1"]')!;
  expect(end.closest('label')!.nextElementSibling?.getAttribute('aria-label')).toBe('Actions for Monday');
  await menuAction('Monday', 'Remove day');
  expect(host.textContent).toContain('Add working day');
  expect(host.querySelector('[aria-label="About adding working days"]')).not.toBeNull();
  await act(settle);
  expect(document.activeElement?.textContent).toBe('Add working day');
});

test('removing Sunday submits a six-day snapshot and remains removed after save and remount', async () => {
  let stored: Settings = {
    ...saved,
    weekly: Object.fromEntries(
      Array.from({ length: 7 }, (_, i) => [String(i + 1), [{ start: '09:01', end: '21:02' }]]),
    ),
  };
  api.get.mockImplementation(async () => ({ settings: stored }));
  api.save.mockImplementation(async (settings) => {
    stored = JSON.parse(JSON.stringify(settings));
    return { settings: stored };
  });
  await render(React.createElement(AvailabilityPage));
  await act(settle);
  await menuAction('Sunday', 'Remove day');
  await click('Save availability');
  expect(Object.keys(api.save.mock.calls[0][0].weekly)).toEqual(['1', '2', '3', '4', '5', '6']);
  expect(host.querySelector('[aria-label="Sunday working hours"]')).toBeNull();
  await act(async () => root.unmount());
  client.clear();
  root = createRoot(host);
  await render(React.createElement(AvailabilityPage));
  await act(settle);
  expect(host.querySelector('[aria-label="Sunday working hours"]')).toBeNull();
  expect(host.textContent).toContain('All changes saved');
});

test('adding Saturday exposes save guidance before applying and persists the new hours after applying', async () => {
  api.save.mockImplementation(async (settings) => ({ settings }));
  await render(React.createElement(AvailabilityPage));
  await act(settle);
  await click('Add working day');
  const saveButton = () => [...host.querySelectorAll('button')].find((node) => node.textContent === 'Save availability')!;
  expect(saveButton()).toBeDefined();
  expect(saveButton().disabled).toBe(true);
  expect(host.textContent).toContain('Apply the working-day changes below, then save availability.');
  await checkDay('Saturday');
  await change(host.querySelector('[aria-label="New working days start 1"]')!, '09:00');
  await change(host.querySelector('[aria-label="New working days end 1"]')!, '21:37');
  await act(async () => Simulate.submit(host.querySelector('form')!));
  expect(api.save).not.toHaveBeenCalled();
  await click('Apply working days');
  expect(saveButton().disabled).toBe(false);
  await click('Save availability');
  expect(api.save).toHaveBeenCalledWith(expect.objectContaining({ weekly: { ...saved.weekly, '6': [{ start: '09:00', end: '21:37' }] } }));
  expect(host.textContent).toContain('All changes saved');
});

test('JSONB key ordering does not leave a successful save dirty and uses Medusa confirmation', async () => {
  const success = jest.spyOn(toast, 'success').mockImplementation(() => 'saved');
  const loaded = { ...saved, weekly: { '1': [{ end: '21:02', start: '09:01' }] }, notice_rules: [{ days: 7, scope: 'all' as const, enabled: true, experience_ids: [] }] };
  api.get.mockResolvedValue({ settings: loaded });
  api.save.mockImplementation(async (settings) => ({ settings: { ...settings, weekly: { '1': [{ end: '21:02', start: '09:01' }] } } }));
  try {
    await render(React.createElement(AvailabilityPage));
    await act(settle);
    await click('Change timezone');
    await change(host.querySelector('input[list=chef-timezones]')!, 'America/New_York');
    await click('Save availability');
    expect(host.textContent).toContain('All changes saved');
    expect([...host.querySelectorAll('button')].some((node) => node.textContent === 'Save availability')).toBe(false);
    expect(success).toHaveBeenCalledWith('Availability saved');
  } finally { success.mockRestore(); }
});
