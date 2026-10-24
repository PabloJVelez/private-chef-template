import { Badge, Button, Container, Heading, Text, toast } from '@medusajs/ui';
import type { ReactNode } from 'react';
import { HelpTip } from './help-tip';
import {
  useGoogleCalendarConnectMutation,
  useGoogleCalendarDisconnectMutation,
  useGoogleCalendarStatus,
} from '../../hooks/google-calendar';
import type { GoogleCalendarStatus } from '../../../sdk/admin/admin-google-calendar';
const labels: Record<GoogleCalendarStatus, string> = {
  not_connected: 'Not connected',
  active: 'Connected',
  reauthorization_required: 'Reconnect needed',
  sync_error: 'Needs attention',
};
export default function GoogleCalendarPanel({
  checkWhenConnected = false,
  unsaved = false,
  children,
}: {
  checkWhenConnected?: boolean;
  unsaved?: boolean;
  children?: ReactNode;
}) {
  const status = useGoogleCalendarStatus();
  const connect = useGoogleCalendarConnectMutation();
  const disconnect = useGoogleCalendarDisconnectMutation();
  const data = status.data;
  const guidance = data?.status === 'not_connected'
    ? 'Google Calendar is optional. Connect it to help avoid double bookings with personal appointments. Without it, availability uses your working hours and bookings.'
    : !checkWhenConnected
      ? 'Google conflict checks are off. Enable them to help avoid double bookings with personal appointments.'
      : 'Google Calendar helps avoid conflicts with personal appointments. If Google cannot be checked, clients can still request times based on your working hours and bookings.';
  const busy = connect.isPending || disconnect.isPending;
  const handleConnect = async () => {
    try {
      const result = await connect.mutateAsync();
      if (result?.url) window.location.href = result.url;
    } catch {
      toast.error('Could not start the Google connection. Please try again.');
    }
  };
  const handleDisconnect = async () => {
    try {
      await disconnect.mutateAsync();
      toast.success('Google Calendar disconnected');
    } catch {
      toast.error('Could not disconnect Google Calendar. Please try again.');
    }
  };
  return (
    <Container className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Heading level="h2">Google Calendar</Heading>
        {data && (
          <div className="flex items-center gap-1">
            <Badge color={data.status === 'active' ? 'green' : 'orange'}>{labels[data.status]}</Badge>
            <HelpTip label="About Google Calendar availability" content={guidance} />
          </div>
        )}
      </div>
      {children}
      {status.isLoading && <Text size="small">Checking connection…</Text>}
      {status.isError && (
        <Text role="alert" className="text-ui-fg-error">
          Could not check the Google connection. Requests remain available using your working hours and bookings.{' '}
          <button type="button" className="underline" onClick={() => status.refetch()}>
            Retry
          </button>
        </Text>
      )}
      {unsaved && (
        <Text size="small" className="text-ui-fg-subtle">
          Save or discard your schedule changes before connecting or disconnecting.
        </Text>
      )}
      {data && (
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="small" variant="secondary" disabled={busy || unsaved} onClick={handleConnect}>
            {data.status === 'not_connected' ? 'Connect Google Calendar' : 'Reconnect'}
          </Button>
          {data.status !== 'not_connected' && (
            <Button
              type="button"
              size="small"
              variant="transparent"
              disabled={busy || unsaved}
              onClick={handleDisconnect}
            >
              Disconnect
            </Button>
          )}
        </div>
      )}
      {data && data.status !== 'not_connected' && (
        <details className="text-sm">
          <summary className="cursor-pointer">Connection details</summary>
          <Text size="small" className="mt-2 break-all">
            Calendar: {data.calendarId || 'Primary calendar'}
          </Text>
          {data.lastSyncError && <Text size="small">{data.lastSyncError}</Text>}
        </details>
      )}
    </Container>
  );
}
