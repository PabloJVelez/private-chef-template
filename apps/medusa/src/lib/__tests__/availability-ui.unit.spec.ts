/** @jest-environment jsdom */
import React from 'react';
import { TooltipProvider, toast } from '@medusajs/ui';
import { act, Simulate } from 'react-dom/test-utils';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ExceptionsEditor } from '../../admin/components/availability/exceptions-editor';
import AvailabilityPage from '../../admin/routes/settings/availability/page';
import { sdk } from '../../sdk';
import { emptyMealPrepSetup, type Settings } from '../availability/slots';
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
async function click(text: string, scope: ParentNode = document) {
  const button = [...scope.querySelectorAll('button')].find((node) => node.textContent === text && !node.closest('[hidden]'));
  expect(button).toBeDefined();
  await act(async () => {
    button!.click();
    await settle();
  });
}
function expectSaveBarHidden() {
  expect(host.querySelector('section[aria-label="Availability changes"]')).toBeNull();
  expect(host.querySelector('button[form=availability-settings]')).toBeNull();
  expect([...host.querySelectorAll('button')].some((node) => node.textContent === 'Discard')).toBe(false);
  expect(host.textContent).not.toContain('All changes saved');
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
  expect(host.querySelector('section[aria-label="Availability changes"]')).not.toBeNull();
  api.save.mockRejectedValueOnce(new Error('Save failed'));
  await click('Save availability');
  expect(timezone().value).toBe('Europe/Paris');
  expect(host.textContent).toContain('Save needs review');
  await click('Discard');
  expect(host.textContent).toContain('Europe/London');
  expect(host.querySelector('input[list=chef-timezones]')).toBeNull();
  expectSaveBarHidden();
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

test('the whole save bar appears only for edits; discard restores values and hides it', async () => {
  await render(React.createElement(AvailabilityPage));
  await act(settle);
  const button = (text: string) => [...host.querySelectorAll('button')].find((node) => node.textContent === text);
  expect(button('Save availability')).toBeUndefined();
  expect(button('Discard')).toBeUndefined();
  expectSaveBarHidden();
  for (const tab of ['Private events', 'Meal Prep', 'Availability']) {
    await selectTab(tab);
    expectSaveBarHidden();
  }
  await act(async () => Simulate.submit(host.querySelector('form')!));
  expect(api.save).not.toHaveBeenCalled();
  await click('Change timezone');
  const timezone = host.querySelector('input[list=chef-timezones]') as HTMLInputElement;
  await change(timezone, 'Europe/London');
  expect(button('Save availability')?.type).toBe('submit');
  expect(button('Discard')).toBeDefined();
  expect(host.querySelector('section[aria-label="Availability changes"] [role=status]')?.textContent).toBe('Unsaved changes');
  await click('Discard');
  expect(host.textContent).toContain('America/Chicago');
  expect(host.querySelector('input[list=chef-timezones]')).toBeNull();
  expect(button('Save availability')).toBeUndefined();
  expect(button('Discard')).toBeUndefined();
  expectSaveBarHidden();
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
  expectSaveBarHidden();
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

async function openMenu(day: string, method = '') {
  const trigger = host.querySelector<HTMLButtonElement>(`[aria-label="${method ? `${method} ` : ''}Actions for ${day}"]`)!;
  await act(async () => {
    trigger.focus();
    trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await settle();
  });
  expect(trigger.getAttribute('aria-expanded')).toBe('true');
  return trigger;
}
async function menuAction(day: string, text: string, method = '') {
  await openMenu(day, method);
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
  expectSaveBarHidden();
  await act(async () => root.unmount());
  client.clear();
  root = createRoot(host);
  await render(React.createElement(AvailabilityPage));
  await act(settle);
  expect(host.querySelector<HTMLInputElement>('[aria-label="Monday start 1"]')!.value).toBe('09:01');
  expect(host.querySelector<HTMLInputElement>('[aria-label="Monday end 1"]')!.value).toBe('21:02');
  expect(host.querySelector('button[form=availability-settings]')).toBeNull();
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
  expect(host.querySelector('[aria-labelledby=shared-availability-heading]')!.textContent).not.toContain('Add working day');
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
  expectSaveBarHidden();
});

test('adding Saturday exposes save guidance before applying and persists the new hours after applying', async () => {
  api.save.mockImplementation(async (settings) => ({ settings }));
  await render(React.createElement(AvailabilityPage));
  await act(settle);
  await click('Add working day');
  const saveButton = () => [...host.querySelectorAll('button')].find((node) => node.textContent === 'Save availability')!;
  expect(saveButton()).toBeDefined();
  expect(saveButton().disabled).toBe(true);
  expect(host.textContent).toContain('Apply the working-day changes in Availability, then save availability.');
  await checkDay('Saturday');
  await change(host.querySelector('[aria-label="New working days start 1"]')!, '09:00');
  await change(host.querySelector('[aria-label="New working days end 1"]')!, '21:37');
  await act(async () => Simulate.submit(host.querySelector('form')!));
  expect(api.save).not.toHaveBeenCalled();
  await click('Apply working days');
  expect(saveButton().disabled).toBe(false);
  await click('Save availability');
  expect(api.save).toHaveBeenCalledWith(expect.objectContaining({ weekly: { ...saved.weekly, '6': [{ start: '09:00', end: '21:37' }] } }));
  expectSaveBarHidden();
});

test('the save bar stays while saving, then disappears with one Medusa toast despite JSONB key ordering', async () => {
  const success = jest.spyOn(toast, 'success').mockImplementation(() => 'saved');
  const pending = deferred<any>();
  const loaded = { ...saved, weekly: { '1': [{ end: '21:02', start: '09:01' }] }, notice_rules: [{ days: 7, scope: 'all' as const, enabled: true, experience_ids: [] }] };
  api.get.mockResolvedValue({ settings: loaded });
  api.save.mockReturnValueOnce(pending.promise);
  try {
    await render(React.createElement(AvailabilityPage));
    await act(settle);
    expectSaveBarHidden();
    expect(success).not.toHaveBeenCalled();
    await click('Change timezone');
    await change(host.querySelector('input[list=chef-timezones]')!, 'America/New_York');
    await click('Save availability');
    expect(host.querySelector('section[aria-label="Availability changes"] [role=status]')?.textContent).toContain('Saving');
    expect(host.querySelector<HTMLButtonElement>('button[form=availability-settings]')!.disabled).toBe(true);
    expect([...host.querySelectorAll('button')].find((node) => node.textContent === 'Discard')!.disabled).toBe(true);
    expect(success).not.toHaveBeenCalled();
    await act(async () => {
      pending.resolve({ settings: { ...api.save.mock.calls[0][0], weekly: { '1': [{ end: '21:02', start: '09:01' }] } } });
      await settle();
    });
    expectSaveBarHidden();
    expect([...host.querySelectorAll('button')].some((node) => node.textContent === 'Save availability')).toBe(false);
    expect(success).toHaveBeenCalledWith('Availability saved');
    expect(success).toHaveBeenCalledTimes(1);
  } finally { success.mockRestore(); }
});

test('failed mutation shows Medusa error feedback and can retry without losing the draft', async () => {
  const failure = jest.spyOn(toast, 'error').mockImplementation(() => 'error');
  api.save.mockRejectedValueOnce(new Error('Connection lost'));
  api.save.mockImplementationOnce(async (settings) => ({ settings }));
  try {
    await render(React.createElement(AvailabilityPage));
    await act(settle);
    await click('Change timezone');
    await change(host.querySelector('input[list=chef-timezones]')!, 'Europe/London');
    await click('Save availability');
    expect(failure).toHaveBeenCalledWith('Save needs review', expect.objectContaining({ description: expect.stringContaining('Saved settings were checked') }));
    expect(host.querySelector('section[aria-label="Availability changes"] [role=alert]')?.textContent).toContain('Saved settings were checked');
    expect(host.querySelector<HTMLInputElement>('input[list=chef-timezones]')!.value).toBe('Europe/London');
    await click('Save availability');
    expect(api.save).toHaveBeenCalledTimes(2);
    expectSaveBarHidden();
  } finally { failure.mockRestore(); }
});

test('reverting an edit clears form dirtiness and invalid timezone cannot submit', async () => {
  await render(React.createElement(AvailabilityPage));
  await act(settle);
  await click('Change timezone');
  const timezone = host.querySelector('input[list=chef-timezones]')!;
  await change(timezone, 'Not/AZone');
  await act(async () => { Simulate.submit(host.querySelector('form')!); await settle(); });
  expect(api.save).not.toHaveBeenCalled();
  await change(timezone, saved.timezone);
  expectSaveBarHidden();
  expect([...host.querySelectorAll('button')].some((node) => node.textContent === 'Save availability')).toBe(false);
});

test('first setup displays and saves imported notice requirements instead of silently turning them off', async () => {
  const notice_rules = [{ enabled: true, days: 7, scope: 'selected' as const, experience_ids: ['exp'] }];
  api.get.mockResolvedValue({ settings: null, initial_notice_rules: notice_rules });
  api.save.mockImplementation(async (settings) => ({ settings }));
  await render(React.createElement(AvailabilityPage));
  await act(settle);
  expect(host.textContent).toContain('Your existing advance-notice requirements are in Private events');
  expect(host.textContent).toContain('No arrival times are offered until you save');
  await change(host.querySelector('input[list=chef-timezones]')!, 'America/Chicago');
  await click('Save availability');
  expect(api.save.mock.calls[0][0]).toMatchObject({ notice_rules, weekly: {}, overrides: {} });
  expectSaveBarHidden();
});

test('meal prep draft methods/styles save together, discard, and keep revisions during in-flight edits', async () => {
  const meal_prep = emptyMealPrepSetup();
  api.get.mockResolvedValue({ settings: { ...saved, version: 4, meal_prep } });
  const saving = deferred<any>();
  api.save.mockReturnValueOnce(saving.promise);
  await render(React.createElement(AvailabilityPage)); await act(settle);
  const toggle = async (label: string) => {
    await act(async () => { (host.querySelector(`[aria-label="Enable ${label}"]`) as HTMLInputElement).click(); await settle(); });
  };
  await selectTab('Meal Prep');
  await toggle('Delivery'); await toggle('Pickup');
  await click('Save availability');
  expect(api.save.mock.calls[0][0]).toMatchObject({ version: 4, meal_prep: { methods: { delivery: { enabled: true }, pickup: { enabled: true }, in_home: { enabled: false } } } });
  await toggle('In-home cooking');
  await act(async () => { saving.resolve({ settings: { ...api.save.mock.calls[0][0], version: 5 } }); await settle(); });
  api.save.mockRejectedValueOnce(new Error('Availability changed in another editor.'));
  await click('Save availability');
  expect(api.save.mock.calls[1][0]).toMatchObject({ version: 5, meal_prep: { methods: { in_home: { enabled: true } } } });
  expect(host.querySelector('[aria-label="Enable In-home cooking"]')!.getAttribute('aria-checked')).toBe('true');
  expect(host.textContent).toContain('Reload saved settings (discard draft)');
  await click('Discard');
  expect(host.querySelector('[aria-label="Enable In-home cooking"]')!.getAttribute('aria-checked')).toBe('false');
  expect(host.querySelector('[aria-label="Enable Delivery"]')!.getAttribute('aria-checked')).toBe('true');
  expect(host.textContent).not.toContain('not live yet');
  expect(host.textContent).toContain('Saving makes these settings effective');
});

test('delivery area editing preserves retired method windows and work plans through save and remount', async () => {
  const meal_prep = populatedSetup();
  let stored: Settings = { ...saved, version: 3, meal_prep };
  api.get.mockImplementation(async () => ({ settings: stored }));
  api.save.mockImplementation(async (settings) => ({ settings: stored = JSON.parse(JSON.stringify({ ...settings, version: 4 })) }));
  await render(React.createElement(AvailabilityPage)); await act(settle); await selectTab('Meal Prep');
  await openDrawer('delivery area');
  await click('Clear ZIP codes');
  await act(async () => { document.querySelector<HTMLButtonElement>('#delivery-radius')!.click(); await settle(); });
  await click('Apply changes');
  await click('Save availability');
  expect(stored).toMatchObject({ overrides: saved.overrides, weekly: saved.weekly, version: 4,
    meal_prep: { methods: meal_prep.methods, work_plans: meal_prep.work_plans, delivery_area: { radius: null, zip_codes: [] } },
  });
  await act(async () => root.unmount()); client.clear(); root = createRoot(host);
  await render(React.createElement(AvailabilityPage)); await act(settle); await selectTab('Meal Prep');
  expect(host.querySelector('[aria-label="Edit method windows"]')).toBeNull();
  expect(host.querySelector('[aria-label="Edit work planning"]')).toBeNull();
  expectSaveBarHidden();
});

test('explicit stale-settings reload replaces the draft only on success', async () => {
  api.get.mockResolvedValue({ settings: { ...saved, version: 1 } });
  api.save.mockRejectedValueOnce(new Error('Availability changed in another editor.'));
  await render(React.createElement(AvailabilityPage)); await act(settle);
  await click('Change timezone'); await change(host.querySelector('input[list=chef-timezones]')!, 'UTC');
  await click('Save availability');
  api.get.mockResolvedValue({ settings: { ...saved, timezone: 'Europe/Paris', version: 2 } });
  await click('Reload saved settings (discard draft)');
  expect(host.textContent).toContain('Europe/Paris');
  expectSaveBarHidden();
});

test('conflict reload blocks edits and actions and preserves unrelated remote changes in the next save', async () => {
  api.get.mockResolvedValue({ settings: { ...saved, version: 1 } });
  api.save.mockRejectedValueOnce(new Error('Availability changed in another editor.'));
  await render(React.createElement(AvailabilityPage)); await act(settle);
  await click('Change timezone'); await change(host.querySelector('input[list=chef-timezones]')!, 'UTC');
  await click('Save availability');
  const reloading = deferred<any>();
  api.get.mockReturnValueOnce(reloading.promise);
  const reads = api.get.mock.calls.length;
  await click('Reload saved settings (discard draft)');
  expect(host.textContent).toContain('Reloading saved settings');
  expect(host.querySelector('input[list=chef-timezones]')!.matches(':disabled')).toBe(true);
  for (const label of ['Save availability', 'Discard', 'Reload saved settings (discard draft)']) {
    const button = [...host.querySelectorAll('button')].find((node) => node.textContent === label)!;
    expect(button.disabled).toBe(true);
    // Bypass native disabled handling to exercise synchronous handler guards too.
    await act(async () => { Simulate.click(button); await settle(); });
  }
  await change(host.querySelector('input[list=chef-timezones]')!, 'Europe/London');
  await act(async () => { Simulate.submit(host.querySelector('form')!); await settle(); });
  expect(api.save).toHaveBeenCalledTimes(1);
  expect(api.get).toHaveBeenCalledTimes(reads + 1);
  const meal_prep = emptyMealPrepSetup();
  meal_prep.methods.delivery.enabled = true;
  meal_prep.delivery_area.zip_codes = ['00501'];
  const remote = { ...saved, timezone: 'Europe/Paris', version: 2,
    overrides: { ...saved.overrides, '2026-11-03': [] }, meal_prep };
  await act(async () => { reloading.resolve({ settings: remote }); await settle(); });
  expect(host.textContent).toContain('Europe/Paris');
  expectSaveBarHidden();
  expect(host.querySelector('[aria-label="Enable Delivery"]')!.getAttribute('aria-checked')).toBe('true');
  await click('Change timezone');
  await change(host.querySelector('input[list=chef-timezones]')!, 'Europe/London');
  api.save.mockImplementation(async (settings) => ({ settings: { ...settings, version: 3 } }));
  await click('Save availability');
  expect(api.save.mock.calls[1][0]).toMatchObject({ ...remote, timezone: 'Europe/London' });
});

test('failed conflict reload preserves the draft and revision and permits an unchanged retry', async () => {
  const failure = jest.spyOn(toast, 'error');
  api.get.mockResolvedValue({ settings: { ...saved, version: 1 } });
  api.save.mockRejectedValue(new Error('Availability changed in another editor.'));
  await render(React.createElement(AvailabilityPage)); await act(settle);
  await click('Change timezone'); await change(host.querySelector('input[list=chef-timezones]')!, 'UTC');
  await click('Save availability');
  api.get.mockRejectedValueOnce(new Error('Network unavailable'));
  await click('Reload saved settings (discard draft)');
  expect(failure).toHaveBeenCalledWith('Reload failed', expect.objectContaining({ description: 'Network unavailable' }));
  expect((host.querySelector('input[list=chef-timezones]') as HTMLInputElement).value).toBe('UTC');
  expect(host.querySelector('input[list=chef-timezones]')!.matches(':disabled')).toBe(false);
  await click('Save availability');
  expect(api.save.mock.calls[1][0]).toMatchObject({ timezone: 'UTC', version: 1 });
  api.get.mockResolvedValue({ settings: { ...saved, version: 2, timezone: 'Europe/Paris' } });
  await click('Reload saved settings (discard draft)');
  expectSaveBarHidden();
  expect(host.textContent).toContain('Europe/Paris');
  failure.mockRestore();
});


async function selectTab(name: string) {
  const tab = [...host.querySelectorAll<HTMLButtonElement>('[role=tab]')].find((node) => node.textContent === name)!;
  expect(tab).toBeDefined();
  await act(async () => { tab.focus(); await settle(); });
  expect(tab.getAttribute('aria-selected')).toBe('true');
  return tab;
}
function populatedSetup() {
  const setup = emptyMealPrepSetup();
  setup.methods.delivery.weekly = { '1': [{ start: '09:00', end: '11:00' }] };
  setup.methods.pickup.dates = { '2026-11-02': [], '2026-11-03': [{ start: '12:00', end: '14:00' }] };
  setup.delivery_area = { radius: { address: 'Draft center', distance: 5, unit: 'mi' }, zip_codes: ['00501'] };
  setup.work_plans = [{ id: 'saved-plan', purpose: 'preparation', start: '2026-11-02T09:00:00Z', end: '2026-11-02T10:00:00Z' }];
  return setup;
}
async function openDrawer(section: string) {
  await act(async () => { host.querySelector<HTMLButtonElement>(`[aria-label="Edit ${section}"]`)!.click(); await settle(); });
  const dialog = document.querySelector<HTMLElement>('[role=dialog]')!;
  expect(dialog).not.toBeNull();
  expect(document.getElementById(dialog.getAttribute('aria-labelledby')!)).not.toBeNull();
  return dialog;
}
async function toggleStyle(id: string) {
  await act(async () => { document.querySelector<HTMLButtonElement>(`#meal-style-${id}`)!.click(); await settle(); });
}

test('three Medusa tabs precede the schedule and support linked panels and arrow/Home/End navigation', async () => {
  await render(React.createElement(AvailabilityPage)); await act(settle);
  const list = host.querySelector('[role=tablist]')!;
  expect(list.getAttribute('aria-label')).toBe('Availability settings sections');
  const tabs = [...host.querySelectorAll<HTMLButtonElement>('[role=tab]')];
  expect(tabs.map((tab) => tab.textContent)).toEqual(['Availability', 'Private events', 'Meal Prep']);
  const panel = (tab: HTMLButtonElement) => document.getElementById(tab.getAttribute('aria-controls')!)!;
  for (const tab of tabs) expect(panel(tab).getAttribute('aria-labelledby')).toBe(tab.id);
  expect(list.compareDocumentPosition(host.querySelector('[aria-labelledby=shared-availability-heading]')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  await selectTab('Availability');
  for (const [key, selected] of [['ArrowRight', 1], ['ArrowRight', 2], ['Home', 0], ['End', 2], ['ArrowLeft', 1], ['Home', 0]] as const) {
    await act(async () => {
      document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })); await settle();
    });
    expect(document.activeElement).toBe(tabs[selected]);
    tabs.forEach((tab, index) => {
      expect(tab.getAttribute('aria-selected')).toBe(String(index === selected));
      expect(panel(tab).hidden).toBe(index !== selected);
    });
  }
  expect(host.querySelector('button[form=availability-settings]')).toBeNull();
  expect(api.save).not.toHaveBeenCalled();
});

test('Meal Prep presents service methods and menu choices without duplicate schedules or planning controls', async () => {
  api.get.mockResolvedValue({ settings: { ...saved, meal_prep: populatedSetup() } });
  await render(React.createElement(AvailabilityPage)); await act(settle); await selectTab('Meal Prep');
  const panel = host.querySelector('[role=tabpanel]:not([hidden])')!;
  expect(panel.querySelectorAll('[role=switch]')).toHaveLength(3);
  expect(panel.querySelectorAll('input[type=time], input[type=date], input[type=datetime-local]')).toHaveLength(0);
  expect(panel.textContent).not.toContain('Add working day');
  expect(panel.textContent).not.toContain('work planning');
  expect(panel.textContent).not.toContain('Advanced');
  expect(panel.querySelector('[aria-label="Edit menu choices"]')).not.toBeNull();
  expect(panel.querySelector('[aria-label="Edit delivery area"]')).not.toBeNull();
  expect(document.querySelector('[role=dialog]')).toBeNull();
  await click('View shared availability');
  expect(host.querySelector('[role=tab][aria-selected=true]')!.textContent).toBe('Availability');
  expect(host.querySelectorAll('[aria-label="Monday start 1"]')).toHaveLength(1);
});

test('service and menu edits save with shared hours and notice while preserving all removed settings', async () => {
  const meal_prep = populatedSetup();
  let stored: Settings = { ...saved, version: 8, meal_prep,
    notice_rules: [{ enabled: true, days: 7, scope: 'all', experience_ids: [] }] };
  api.get.mockImplementation(async () => ({ settings: stored }));
  api.save.mockImplementation(async (settings) => ({ settings: stored = JSON.parse(JSON.stringify({ ...settings, version: settings.version! + 1 })) }));
  await render(React.createElement(AvailabilityPage)); await act(settle);
  await change(host.querySelector('[aria-label="Monday start 1"]')!, '08:30');
  await selectTab('Private events');
  await act(async () => { Simulate.change(host.querySelector('[aria-label="Advance notice (days)"]')!, { target: { valueAsNumber: 5 } } as any); await settle(); });
  await selectTab('Meal Prep');
  for (const method of ['In-home cooking', 'Delivery', 'Pickup']) {
    await act(async () => { host.querySelector<HTMLButtonElement>(`[aria-label="Enable ${method}"]`)!.click(); await settle(); });
  }
  await openDrawer('menu choices'); await toggleStyle('package'); await click('Apply changes');
  await selectTab('Private events'); await click('Save availability');
  expect(stored).toMatchObject({ version: 9, timezone: saved.timezone, overrides: saved.overrides, google_mode: saved.google_mode,
    weekly: { '1': [{ start: '08:30', end: '20:00' }] }, notice_rules: [{ days: 5 }], meal_prep: {
      selection_styles: { package: true }, work_plans: meal_prep.work_plans, delivery_area: meal_prep.delivery_area,
    } });
  for (const key of ['in_home', 'delivery', 'pickup'] as const) {
    expect(stored.meal_prep!.methods[key]).toEqual({ ...meal_prep.methods[key], enabled: true });
  }
  await act(async () => root.unmount()); client.clear(); root = createRoot(host);
  await render(React.createElement(AvailabilityPage)); await act(settle); await selectTab('Meal Prep');
  expect(host.querySelector('[role=tabpanel]:not([hidden])')!.textContent).toContain('Packages');
  expect(host.querySelector('[aria-label="Enable Delivery"]')!.getAttribute('aria-checked')).toBe('true');
});

test('unfinished global hours survive tab switches and the review action restores focus', async () => {
  await render(React.createElement(AvailabilityPage)); await act(settle);
  await click('Add working day');
  await checkDay('Wednesday');
  await change(host.querySelector('[aria-label="New working days start 1"]')!, '13:00');
  await selectTab('Meal Prep');
  expect(host.querySelector<HTMLButtonElement>('button[form=availability-settings]')!.disabled).toBe(true);
  await act(async () => { Simulate.submit(host.querySelector('form')!); await settle(); });
  expect(api.save).not.toHaveBeenCalled();
  const leaving = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(leaving);
  expect(leaving.defaultPrevented).toBe(true);
  await click('Review availability edits');
  expect(document.activeElement?.getAttribute('role')).toBe('tab');
  expect(document.activeElement?.textContent).toBe('Availability');
  expect(host.querySelector<HTMLInputElement>('[aria-label="New working days start 1"]')!.value).toBe('13:00');
  await click('Discard');
  expect(host.querySelector('fieldset[tabindex]')).toBeNull();
  expectSaveBarHidden();
});

test('drawers stage changes, cancel on Escape, restore focus, and never submit the enclosing form', async () => {
  await render(React.createElement(AvailabilityPage)); await act(settle); await selectTab('Meal Prep');
  const dialog = await openDrawer('menu choices');
  expect(dialog.contains(document.activeElement)).toBe(true);
  await toggleStyle('package');
  expect(host.querySelector<HTMLButtonElement>('button[form=availability-settings]')!.disabled).toBe(true);
  const leaving = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(leaving);
  expect(leaving.defaultPrevented).toBe(true);
  await act(async () => { document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await settle(); });
  expect(document.querySelector('[role=dialog]')).toBeNull();
  await act(settle);
  expect(document.activeElement?.getAttribute('aria-label')).toBe('Edit menu choices');
  expect(host.querySelector('button[form=availability-settings]')).toBeNull();
  await openDrawer('menu choices');
  expect(document.querySelector('#meal-style-package')!.getAttribute('aria-checked')).toBe('false');
  await toggleStyle('individual_dishes'); await click('Apply changes');
  expect(api.save).not.toHaveBeenCalled();
  expect(host.querySelector('[role=tabpanel]:not([hidden])')!.textContent).toContain('Individual dishes and quantities');
  await click('Discard');
  expect(host.querySelector('[role=tabpanel]:not([hidden])')!.textContent).toContain('Not selected');
});

test('a save from Meal Prep retains newer private-event and method edits and their next version', async () => {
  const meal_prep = emptyMealPrepSetup();
  const notice_rules = [{ enabled: true, days: 7, scope: 'all' as const, experience_ids: [] }];
  api.get.mockResolvedValue({ settings: { ...saved, version: 3, meal_prep, notice_rules } });
  const pending = deferred<any>(); api.save.mockReturnValueOnce(pending.promise);
  await render(React.createElement(AvailabilityPage)); await act(settle); await selectTab('Meal Prep');
  await act(async () => { host.querySelector<HTMLInputElement>('[aria-label="Enable Pickup"]')!.click(); await settle(); });
  await click('Save availability');
  await selectTab('Private events');
  await act(async () => { Simulate.change(host.querySelector('[aria-label="Advance notice (days)"]')!, { target: { valueAsNumber: 3 } } as any); await settle(); });
  await selectTab('Meal Prep');
  await act(async () => { host.querySelector<HTMLInputElement>('[aria-label="Enable Delivery"]')!.click(); await settle(); });
  await act(async () => { pending.resolve({ settings: { ...api.save.mock.calls[0][0], version: 4 } }); await settle(); });
  api.save.mockRejectedValueOnce(new Error('Availability changed in another editor.'));
  await click('Save availability');
  expect(api.save.mock.calls[1][0]).toMatchObject({ version: 4, notice_rules: [{ days: 3 }], meal_prep: { methods: { delivery: { enabled: true }, pickup: { enabled: true } } } });
  await selectTab('Private events');
  expect(host.querySelector<HTMLInputElement>('[aria-label="Advance notice (days)"]')!.value).toBe('3');
  await click('Discard');
  expect(host.querySelector<HTMLInputElement>('[aria-label="Advance notice (days)"]')!.value).toBe('7');
  await selectTab('Meal Prep');
  expect(host.querySelector('[aria-label="Enable Pickup"]')!.getAttribute('aria-checked')).toBe('true');
  expect(host.querySelector('[aria-label="Enable Delivery"]')!.getAttribute('aria-checked')).toBe('false');
});


test('invalid delivery drafts cannot apply; Cancel restores saved details and enabling another method keeps them', async () => {
  api.get.mockResolvedValue({ settings: { ...saved, version: 3, meal_prep: populatedSetup() } });
  api.save.mockImplementation(async (settings) => ({ settings: { ...settings, version: 4 } }));
  await render(React.createElement(AvailabilityPage)); await act(settle); await selectTab('Meal Prep');
  const dialog = await openDrawer('delivery area');
  await change(dialog.querySelector('#delivery-zips')!, 'invalid');
  expect([...dialog.querySelectorAll('button')].find((node) => node.textContent === 'Apply changes')!.disabled).toBe(true);
  expect(dialog.querySelector('[role=alert]')?.textContent).toContain('five-digit ZIP');
  await click('Cancel', dialog);
  await openDrawer('delivery area');
  expect(document.querySelector<HTMLTextAreaElement>('#delivery-zips')!.value).toBe('00501');
  await click('Cancel', document.querySelector('[role=dialog]')!);
  await act(async () => { host.querySelector<HTMLButtonElement>('[aria-label="Enable Pickup"]')!.click(); await settle(); });
  await click('Save availability');
  expect(api.save.mock.calls[0][0]).toMatchObject({ meal_prep: { delivery_area: populatedSetup().delivery_area, work_plans: populatedSetup().work_plans } });
});

test('drawer apply after an in-flight save uses the new version and preserves the saved service choices', async () => {
  const meal_prep = populatedSetup();
  api.get.mockResolvedValue({ settings: { ...saved, version: 4, meal_prep } });
  const pending = deferred<any>(); api.save.mockReturnValueOnce(pending.promise);
  await render(React.createElement(AvailabilityPage)); await act(settle); await selectTab('Meal Prep');
  await act(async () => { host.querySelector<HTMLButtonElement>('[aria-label="Enable Delivery"]')!.click(); await settle(); });
  await click('Save availability');
  await openDrawer('menu choices'); await toggleStyle('package');
  await act(async () => { pending.resolve({ settings: { ...api.save.mock.calls[0][0], version: 5 } }); await settle(); });
  await click('Apply changes');
  api.save.mockImplementation(async (settings) => ({ settings: { ...settings, version: 6 } }));
  await click('Save availability');
  expect(api.save.mock.calls[1][0]).toMatchObject({ version: 5, meal_prep: { methods: { delivery: { ...meal_prep.methods.delivery, enabled: true } }, work_plans: meal_prep.work_plans, selection_styles: { package: true } } });
});


test('SD-13 committed readiness does not advertise unsaved method edits; valid incomplete setup saves', async () => {
  let stored = { ...saved, version: 1, meal_prep: emptyMealPrepSetup() };
  api.get.mockImplementation(async () => ({ settings: stored }));
  api.save.mockImplementation(async (settings) => ({ settings: stored = { ...settings, version: 2 } as typeof stored }));
  await render(React.createElement(AvailabilityPage)); await act(settle); await selectTab('Meal Prep');
  const guidance = () => host.querySelector('[aria-label="Committed Meal Prep discovery"]')!.textContent!;
  expect(guidance()).toContain('not advertised');
  expect(host.textContent).not.toContain('not live yet');
  await act(async () => { host.querySelector<HTMLButtonElement>('[aria-label="Enable Delivery"]')!.click(); await settle(); });
  expect(guidance()).toContain('not advertised');
  expect(guidance()).toContain('unsaved changes');
  await click('Save availability');
  expect(guidance()).toContain('Delivery: Information visible');
  expect(guidance()).toContain('Customer requests and booking remain unavailable');
  expect(guidance()).not.toContain('unsaved changes');
});

test('SD-02 lost Save response re-reads and confirms committed settings while preserving later edits', async () => {
  let stored: Settings = { ...saved, version: 1, meal_prep: emptyMealPrepSetup() };
  api.get.mockImplementation(async () => ({ settings: stored }));
  const lost = deferred<any>();
  api.save.mockImplementationOnce((settings) => { stored = { ...settings, version: 2 }; return lost.promise; });
  await render(React.createElement(AvailabilityPage)); await act(settle); await selectTab('Meal Prep');
  await act(async () => { host.querySelector<HTMLButtonElement>('[aria-label="Enable Pickup"]')!.click(); await settle(); });
  await click('Save availability');
  await act(async () => { host.querySelector<HTMLButtonElement>('[aria-label="Enable Delivery"]')!.click(); await settle(); });
  await act(async () => { lost.reject(new Error('Connection lost')); await settle(); });
  expect(api.get.mock.calls.length).toBeGreaterThan(1);
  expect(host.textContent).toContain('Pickup: Information visible');
  expect(host.textContent).toContain('Delivery: Not enabled');
  api.save.mockImplementation(async (settings) => ({ settings: stored = { ...settings, version: 3 } }));
  await click('Save availability');
  expect(api.save.mock.calls[1][0]).toMatchObject({ version: 2, meal_prep: { methods: { pickup: { enabled: true }, delivery: { enabled: true } } } });
});

test('SD-02 failed Save and failed verification show unknown outcome without replacing the draft', async () => {
  api.get.mockResolvedValueOnce({ settings: { ...saved, version: 1 } });
  api.get.mockRejectedValue(new Error('Offline'));
  api.save.mockRejectedValue(new Error('Response lost'));
  await render(React.createElement(AvailabilityPage)); await act(settle);
  await click('Change timezone'); await change(host.querySelector('input[list=chef-timezones]')!, 'UTC');
  await click('Save availability');
  expect(host.textContent).toContain('Save outcome is unknown');
  expect(host.textContent).not.toContain('Not saved');
  expect((host.querySelector('input[list=chef-timezones]') as HTMLInputElement).value).toBe('UTC');
});


test('SD-02 first-setup lost response confirms nullable Meal Prep without fabricating failure', async () => {
  let stored: Settings | null = null;
  api.get.mockImplementation(async () => ({ settings: stored, initial_notice_rules: [] }));
  api.save.mockImplementationOnce(async (settings) => {
    stored = { ...settings, version: 1, meal_prep: null };
    throw new Error('Response lost after commit');
  });
  await render(React.createElement(AvailabilityPage)); await act(settle);
  await change(host.querySelector('input[list=chef-timezones]')!, 'UTC');
  await click('Save availability');
  expectSaveBarHidden();
  expect(host.textContent).not.toContain('Save needs review');
  expect(host.textContent).toContain('not advertised');
});
