/** @jest-environment jsdom */
import React from 'react';
import { TooltipProvider } from '@medusajs/ui';
import { act } from 'react-dom/test-utils';
import { createRoot } from 'react-dom/client';
import GoogleCalendarPanel from '../../admin/components/availability/google-calendar-panel';
import { useGoogleCalendarStatus } from '../../admin/hooks/google-calendar';
jest.mock('../../admin/hooks/google-calendar', () => ({
  useGoogleCalendarStatus: jest.fn(),
  useGoogleCalendarConnectMutation: () => ({ isPending: false }),
  useGoogleCalendarDisconnectMutation: () => ({ isPending: false }),
}));
const status = jest.mocked(useGoogleCalendarStatus);
test.each([
  ['not_connected', true, 'Google Calendar is optional.'],
  ['active', false, 'Google conflict checks are off.'],
  ['reauthorization_required', true, 'clients can still request times'],
  ['sync_error', true, 'clients can still request times'],
])('keeps %s guidance in the badge tooltip', async (connection, enabled, message) => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  status.mockReturnValue({ data: { status: connection }, isLoading: false, isError: false } as any);
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  const settle = () => new Promise((resolve) => setTimeout(resolve, 20));
  try {
    await act(async () => root.render(React.createElement(TooltipProvider, null,
      React.createElement(GoogleCalendarPanel, { checkWhenConnected: enabled as boolean }))));
    expect(host.textContent).not.toContain(message);
    expect(host.textContent).not.toContain('resume availability');
    const trigger = host.querySelector<HTMLButtonElement>('[aria-label="About Google Calendar availability"]')!;
    await act(async () => { trigger.focus(); await settle(); });
    expect(document.querySelector('[role="tooltip"]')?.textContent).toContain(message);
    await act(async () => { trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await settle(); });
    expect(document.querySelector('[role="tooltip"]')).toBeNull();
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});
