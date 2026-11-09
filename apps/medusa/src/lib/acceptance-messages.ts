// Shared, sanitized messages. The SDK clears an attempt only for a verified cleanup acknowledgment.
export const INVALID_TICKET_DETAILS =
  'Ticket details are invalid. Review the event details before retrying acceptance.';
export const RESOLVED_INVALID_TICKET_DETAILS = `${INVALID_TICKET_DETAILS} This attempt was cancelled and cleanup completed.`;
export const ACCEPTANCE_RECOVERY_REQUIRED =
  'Acceptance requires recovery. Protected time is retained until cleanup is verified.';
export const UNRESOLVED_INVALID_TICKET_DETAILS = `${INVALID_TICKET_DETAILS} Acceptance requires recovery; protected time is retained.`;
