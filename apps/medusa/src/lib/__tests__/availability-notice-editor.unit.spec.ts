/** @jest-environment jsdom */
import React from 'react';
import { act } from 'react-dom/test-utils';
import { createRoot } from 'react-dom/client';
import { ExperienceTypeForm } from '../../admin/routes/experience-types/components/experience-type-form';
import { experienceTypeSchema, getDefaultExperienceTypeValues } from '../../admin/routes/experience-types/schemas';

// jsdom does not implement the observer used by Radix Switch's hidden input.
class TestResizeObserver { observe() {} unobserve() {} disconnect() {} }
beforeAll(() => { globalThis.ResizeObserver = TestResizeObserver as unknown as typeof ResizeObserver; });

test('notice toggle hides the day count when disabled and restores it when enabled', async () => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement('div');
  const root = createRoot(host);
  try {
    await act(async () => root.render(React.createElement(ExperienceTypeForm, { onSubmit: jest.fn(), onCancel: jest.fn() })));
    const toggle = host.querySelector<HTMLButtonElement>('[role="switch"]')!;
    expect(toggle.getAttribute('aria-checked')).toBe('true');
    expect(host.querySelector<HTMLInputElement>('[aria-label="Advance notice (days)"]')?.value).toBe('7');
    await act(async () => toggle.click());
    expect(host.querySelector('[aria-label="Advance notice (days)"]')).toBeNull();
    expect(host.textContent).toContain('same-day arrivals');
    await act(async () => toggle.click());
    expect(host.querySelector<HTMLInputElement>('[aria-label="Advance notice (days)"]')?.value).toBe('7');
  } finally {
    await act(async () => root.unmount());
  }
});
test('enabled notice requires an explicit positive whole day count; disabled notice does not', () => {
  const base = { ...getDefaultExperienceTypeValues(), name: 'Dinner' };
  for (const days of [undefined, NaN, 0, -1, 1.5]) {
    expect(experienceTypeSchema.safeParse({ ...base, requires_advance_notice: true, advance_notice_days: days }).success).toBe(false);
  }
  expect(experienceTypeSchema.safeParse({ ...base, requires_advance_notice: true, advance_notice_days: 3 }).success).toBe(true);
  expect(experienceTypeSchema.safeParse({ ...base, requires_advance_notice: false, advance_notice_days: undefined }).success).toBe(true);
});
