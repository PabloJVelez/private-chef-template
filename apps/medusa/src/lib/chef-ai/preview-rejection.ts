export const previewRejectionCodes = [
  "slot_unavailable",
  "event_ineligible",
  "timezone_mismatch",
  "availability_unconfigured",
  "experience_inactive",
  "invalid_local_time",
  "preview_unavailable",
] as const;
export type PreviewRejectionCode = (typeof previewRejectionCodes)[number];
