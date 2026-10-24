/** @jest-environment jsdom */
import React from 'react';
import { act } from 'react-dom/test-utils';
import { createRoot } from 'react-dom/client';
import { ExperienceTypeForm } from '../../admin/routes/experience-types/components/experience-type-form';
import { NoticeRules } from '../../admin/components/availability/notice-rules';
import { noticeRuleSchema, type NoticeRule } from '../availability/slots';

// jsdom does not implement the observer used by Radix Switch's hidden input.
class TestResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
beforeAll(() => {
  globalThis.ResizeObserver = TestResizeObserver as unknown as typeof ResizeObserver;
});

test('notice toggle hides the day count when disabled and restores it when enabled', async () => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement('div');
  const root = createRoot(host);
  try {
    function Editor() {
      const [rules, setRules] = React.useState<NoticeRule[]>([
        { enabled: true, days: 7, scope: 'all', experience_ids: [] },
      ]);
      return React.createElement(NoticeRules, {
        rules,
        experiences: [{ id: 'dinner', name: 'Dinner', is_active: true }],
        onChange: setRules,
      });
    }
    await act(async () => root.render(React.createElement(Editor)));
    const toggle = host.querySelector<HTMLButtonElement>('[role="switch"]')!;
    expect(toggle.getAttribute('aria-checked')).toBe('true');
    expect(host.querySelector<HTMLInputElement>('[aria-label="Advance notice (days)"]')?.value).toBe('7');
    await act(async () => toggle.click());
    expect(host.querySelector('[aria-label="Advance notice (days)"]')).toBeNull();
    expect(host.textContent).toContain('same-day requests');
    await act(async () => toggle.click());
    expect(host.querySelector<HTMLInputElement>('[aria-label="Advance notice (days)"]')?.value).toBe('7');
    const scope = host.querySelector<HTMLSelectElement>('[aria-label="Applies to"]')!;
    await act(async () => {
      scope.value = 'selected';
      scope.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(host.textContent).toContain('Select at least one experience.');
    await act(async () =>
      host.querySelector<HTMLInputElement>('input[type="checkbox"]:not([aria-hidden])')!.click(),
    );
    expect(host.querySelector('[role="alert"]')).toBeNull();
  } finally {
    await act(async () => root.unmount());
  }
});
test('notice rules reject invalid day counts and empty enabled selections', () => {
  const base = { enabled: true, scope: 'all', experience_ids: [] };
  for (const days of [undefined, NaN, 0, -1, 1.5]) {
    expect(noticeRuleSchema.safeParse({ ...base, days }).success).toBe(false);
  }
  expect(noticeRuleSchema.safeParse({ ...base, days: 3 }).success).toBe(true);
  expect(noticeRuleSchema.safeParse({ ...base, days: 3, scope: 'selected' }).success).toBe(false);
  expect(
    noticeRuleSchema.safeParse({
      ...base,
      days: 3,
      scope: 'selected',
      enabled: false,
    }).success,
  ).toBe(true);
});
test('experience editor no longer exposes advance-notice controls', async () => {
  const host = document.createElement('div');
  const root = createRoot(host);
  try {
    await act(async () =>
      root.render(
        React.createElement(ExperienceTypeForm, {
          onSubmit: jest.fn(),
          onCancel: jest.fn(),
        }),
      ),
    );
    expect(host.querySelector('[aria-label="Advance notice (days)"]')).toBeNull();
    expect(host.textContent).toContain('Advance notice is managed on the Availability page.');
  } finally {
    await act(async () => root.unmount());
  }
});

test('mixed existing lead times stay unchanged until the chef chooses one shared setting', async () => {
  const host = document.createElement('div');
  const root = createRoot(host);
  const onChange = jest.fn();
  try {
    await act(async () =>
      root.render(
        React.createElement(NoticeRules, {
          rules: [
            { enabled: true, days: 3, scope: 'selected', experience_ids: ['prep'] },
            { enabled: true, days: 7, scope: 'selected', experience_ids: ['dinner'] },
          ],
          experiences: [
            { id: 'prep', name: 'Meal prep', is_active: true },
            { id: 'dinner', name: 'Dinner', is_active: true },
          ],
          onChange,
        }),
      ),
    );
    expect(onChange).not.toHaveBeenCalled();
    expect(host.textContent).toContain('Meal prep');
    expect(host.textContent).toContain('Dinner');
    await act(async () => host.querySelector<HTMLButtonElement>('button')!.click());
    expect(onChange).toHaveBeenCalledWith([{ enabled: true, days: 7, scope: 'all', experience_ids: [] }]);
  } finally {
    await act(async () => root.unmount());
  }
});
