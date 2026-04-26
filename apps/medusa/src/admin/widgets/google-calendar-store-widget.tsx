import { defineWidgetConfig } from "@medusajs/admin-sdk";
import { Badge, Button, Container, Heading, Text, toast } from "@medusajs/ui";
import {
  useGoogleCalendarConnectMutation,
  useGoogleCalendarDisconnectMutation,
  useGoogleCalendarStatus,
} from "../hooks/google-calendar";
import type { GoogleCalendarStatus } from "../../sdk/admin/admin-google-calendar";

const STATUS_LABELS: Record<GoogleCalendarStatus, string> = {
  not_connected: "Not connected",
  active: "Active",
  reauthorization_required: "Reauthorization required",
  sync_error: "Sync error",
};

const GoogleCalendarStoreWidget = () => {
  const { data, isLoading } = useGoogleCalendarStatus();
  const connectMutation = useGoogleCalendarConnectMutation();
  const disconnectMutation = useGoogleCalendarDisconnectMutation();

  const handleConnect = async () => {
    try {
      const result = await connectMutation.mutateAsync();
      if (result?.url) {
        window.location.href = result.url;
      }
    } catch (error) {
      toast.error("Could not start Google Calendar connection", {
        description: error instanceof Error ? error.message : "Unknown error",
        duration: 5000,
      });
    }
  };

  const handleDisconnect = async () => {
    try {
      await disconnectMutation.mutateAsync();
      toast.success("Google Calendar disconnected");
    } catch (error) {
      toast.error("Could not disconnect Google Calendar", {
        description: error instanceof Error ? error.message : "Unknown error",
        duration: 5000,
      });
    }
  };

  if (isLoading || !data) {
    return (
      <Container>
        <div className="flex h-32 items-center justify-center">
          <Text className="text-ui-fg-muted">Loading Google Calendar...</Text>
        </div>
      </Container>
    );
  }

  const status = data.status as GoogleCalendarStatus;

  return (
    <Container className="divide-y p-0">
      <div className="flex flex-col gap-4 px-6 py-6">
        <div className="flex items-center justify-between">
          <Heading level="h2">Google Calendar</Heading>
          <Badge
            size="large"
            color={
              status === "active"
                ? "green"
                : status === "not_connected"
                  ? "grey"
                  : "orange"
            }
          >
            {STATUS_LABELS[status]}
          </Badge>
        </div>

        {status === "not_connected" ? (
          <div className="flex flex-col gap-4 rounded-lg border border-ui-border-base p-4">
            <Text className="text-ui-fg-subtle">
              Connect your Google Calendar to mirror chef events.
            </Text>
            <Button onClick={handleConnect} disabled={connectMutation.isPending}>
              Connect Google Calendar
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="rounded-lg border border-ui-border-base p-4">
              <dl className="grid gap-2 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-ui-fg-muted">Calendar ID</dt>
                  <dd className="font-mono">{data.calendarId || "primary"}</dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="text-ui-fg-muted">Last sync error</dt>
                  <dd>{data.lastSyncError || "None"}</dd>
                </div>
              </dl>
            </div>

            <div className="flex gap-3">
              <Button
                variant="secondary"
                onClick={handleDisconnect}
                disabled={disconnectMutation.isPending}
              >
                Disconnect
              </Button>
            </div>
          </div>
        )}
      </div>
    </Container>
  );
};

export const config = defineWidgetConfig({
  zone: "store.details.after",
});

export default GoogleCalendarStoreWidget;
