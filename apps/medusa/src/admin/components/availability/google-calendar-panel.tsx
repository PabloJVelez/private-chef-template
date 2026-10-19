import { Badge, Button, Container, Heading, Text, toast } from '@medusajs/ui';
import type { ReactNode } from 'react';
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
  required = false,
  unsaved = false,
  children,
}: { required?: boolean; unsaved?: boolean; children?: ReactNode }) {
  const status = useGoogleCalendarStatus();
  const connect = useGoogleCalendarConnectMutation();
  const disconnect = useGoogleCalendarDisconnectMutation();
  const data = status.data;
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
        {data && <Badge color={data.status === 'active' ? 'green' : 'orange'}>{labels[data.status]}</Badge>}
      </div>
      {children}
      {status.isLoading && <Text size="small">Checking connection…</Text>}
      {status.isError && (
        <Text role="alert" className="text-ui-fg-error">
          Could not check the Google connection.{' '}
          <button type="button" className="underline" onClick={() => status.refetch()}>
            Retry
          </button>
        </Text>
      )}
      {required && !status.isLoading && (status.isError || data?.status !== 'active') && (
        <Text role="alert" size="small" className="text-ui-fg-error">
          Google checks are required. Connect or fix the calendar connection before offering times that need a conflict
          check.
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
