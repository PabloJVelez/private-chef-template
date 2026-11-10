// Shared, sanitized messages. The SDK clears an attempt only for a verified cleanup acknowledgment.
export const INVALID_TICKET_DETAILS =
  'Ticket details are invalid. Review the event details before retrying acceptance.';
export const RESOLVED_INVALID_TICKET_DETAILS = `${INVALID_TICKET_DETAILS} This attempt was cancelled and cleanup completed.`;
export const ACCEPTANCE_RECOVERY_REQUIRED =
  'Acceptance requires recovery. Protected time is retained until cleanup is verified.';
export const UNRESOLVED_INVALID_TICKET_DETAILS = `${INVALID_TICKET_DETAILS} Acceptance requires recovery; protected time is retained.`;

// Only these explicit pre-acceptance business rules are terminal; provider/database errors are not.
export const ACCEPTANCE_POLICY_MESSAGES = {
  unavailable: 'That arrival time is no longer available. Please choose another time.',
  unconfigured: 'Availability has not been configured. Please contact the chef.',
  inactive: 'Experience is not available.',
  missingExperience: 'Select an experience before accepting this legacy request.',
  changedTimezone: 'The chef timezone changed. Update the request before accepting.',
} as const;
export const POLICY_CLEANUP_COMPLETE = ' This attempt was cancelled and cleanup completed.';
export const RESOLVED_POLICY_MESSAGES = Object.values(ACCEPTANCE_POLICY_MESSAGES).map(
  (message) => message + POLICY_CLEANUP_COMPLETE,
);
export const UNRESOLVED_POLICY_MESSAGES = Object.values(ACCEPTANCE_POLICY_MESSAGES).map(
  (message) => `${message} ${ACCEPTANCE_RECOVERY_REQUIRED}`,
);
