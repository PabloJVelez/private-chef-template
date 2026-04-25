/**
 * Google Calendar “event” colors (colorId 1–11) — hex values match the Calendar UI palette.
 * @see https://developers.google.com/calendar/api/v3/reference/colors
 */
const GOOGLE_EVENT_COLOR_ID_HEX: Record<string, string> = {
  "1": "#a4bdfc",
  "2": "#7ae7bf",
  "3": "#dbadff",
  "4": "#ff887c",
  "5": "#fbd75b",
  "6": "#ffb878",
  "7": "#46d6db",
  "8": "#e1e1e1",
  "9": "#5484ed",
  "10": "#51b749",
  "11": "#dc2127",
};

/** Maps chef event workflow status → Google `colorId` so admin dots match Google chips. */
export function chefEventStatusToGoogleColorId(status?: string | null): string {
  switch (status) {
    case "confirmed":
      return "9";
    case "completed":
      return "2";
    case "cancelled":
      return "11";
    default:
      return "6";
  }
}

export function googleEventColorIdToHex(colorId?: string | null): string {
  if (!colorId) {
    return GOOGLE_EVENT_COLOR_ID_HEX["6"]!;
  }
  return GOOGLE_EVENT_COLOR_ID_HEX[colorId] ?? GOOGLE_EVENT_COLOR_ID_HEX["6"]!;
}

/** Dot / chip color in admin calendar — same palette as Google for the same status. */
export function chefEventStatusToDisplayHex(status?: string | null): string {
  return googleEventColorIdToHex(chefEventStatusToGoogleColorId(status));
}
