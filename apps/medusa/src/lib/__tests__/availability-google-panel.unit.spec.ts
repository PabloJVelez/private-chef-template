/** @jest-environment jsdom */
import React from 'react';
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
  ['not_connected', true, 'Google Calendar is optional and is not connected.', false],
  ['active', false, 'conflict checks are off', false],
  ['reauthorization_required', true, 'Google conflict checks are enabled but unavailable.', true],
  ['sync_error', true, 'Google conflict checks are enabled but unavailable.', true],
])('shows actionable guidance for %s with checking %s', async (connection, enabled, message, blocked) => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  status.mockReturnValue({
    data: { status: connection },
    isLoading: false,
    isError: false,
  } as any);
  const host = document.createElement('div');
  const root = createRoot(host);
  try {
    await act(async () =>
      root.render(
        React.createElement(GoogleCalendarPanel, {
          checkWhenConnected: enabled as boolean,
        }),
      ),
    );
    expect(host.textContent).toContain(message);
    expect(!!host.querySelector('[role="alert"]')).toBe(blocked);
    if (connection === 'not_connected') expect(host.textContent).toContain('help prevent double bookings');
  } finally {
    await act(async () => root.unmount());
  }
});
