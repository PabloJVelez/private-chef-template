type WatchResponse = {
  id: string;
  resourceId: string;
  expiration?: string;
};

export async function stopCalendarWatch({
  accessToken,
  channelId,
  resourceId,
}: {
  accessToken: string;
  channelId: string;
  resourceId: string;
}): Promise<void> {
  const response = await fetch(
    "https://www.googleapis.com/calendar/v3/channels/stop",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        id: channelId,
        resourceId,
      }),
    },
  );

  if (!response.ok && response.status !== 404) {
    throw new Error(`Google channels.stop failed: ${await response.text()}`);
  }
}

export async function startOrRenewCalendarWatch({
  accessToken,
  calendarId,
  webhookUrl,
  channelId,
  channelToken,
}: {
  accessToken: string;
  calendarId: string;
  webhookUrl: string;
  channelId: string;
  channelToken: string;
}): Promise<WatchResponse> {
  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/watch`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        id: channelId,
        type: "web_hook",
        address: webhookUrl,
        token: channelToken,
      }),
    },
  );

  if (!response.ok) {
    throw new Error(`Google events.watch failed: ${await response.text()}`);
  }

  return (await response.json()) as WatchResponse;
}
