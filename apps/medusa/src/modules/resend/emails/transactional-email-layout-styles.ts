/**
 * Shared styles for transactional email layout (header, info block, body, thank-you, footer).
 */
export const layoutColors = {
  accentGreen: "#16a34a",
  dark: "#1a1a1a",
  grayMuted: "#6b7280",
  grayLight: "#9ca3af",
  grayBorder: "#e5e7eb",
  thankYouBg: "#dcfce7",
  footerBg: "#f9fafb",
  white: "#fff",
  bodyBg: "#f3f4f6",
} as const

export const layoutStyles = {
  main: {
    fontFamily: "sans-serif",
    backgroundColor: layoutColors.bodyBg,
  },
  body: {
    margin: "2rem auto",
    maxWidth: "36rem",
    backgroundColor: layoutColors.white,
  },
  headerSection: {
    backgroundColor: layoutColors.dark,
    color: layoutColors.white,
    padding: "1rem 1.5rem",
  },
  headerTitle: {
    margin: 0,
    fontSize: "1.25rem",
    fontWeight: 700,
  },
  headerLabel: {
    margin: 0,
    fontSize: "0.875rem",
    letterSpacing: "0.05em",
    color: layoutColors.grayLight,
  },
  infoSection: {
    padding: "1.5rem 1.5rem 0",
  },
  billToLabel: {
    margin: "0 0 0.25rem 0",
    fontSize: "0.75rem",
    color: layoutColors.accentGreen,
    fontWeight: 600,
    letterSpacing: "0.05em",
  },
  billToText: {
    margin: 0,
    fontSize: "0.9375rem",
    color: layoutColors.dark,
  },
  metaText: {
    margin: "0 0 0.25rem 0",
    fontSize: "0.75rem",
    color: layoutColors.grayMuted,
  },
  lineItemsSection: {
    padding: "1rem 1.5rem",
    borderTop: `1px solid ${layoutColors.grayBorder}`,
  },
  lineItemDescription: {
    margin: 0,
    fontSize: "0.875rem",
    color: layoutColors.dark,
  },
  lineItemSubtext: {
    margin: "0.25rem 0 0 0",
    fontSize: "0.75rem",
    color: layoutColors.grayMuted,
  },
  totalsSection: {
    padding: "0 1.5rem 1rem",
    borderTop: `1px solid ${layoutColors.grayBorder}`,
  },
  totalRow: {
    marginTop: "0.75rem",
    paddingTop: "0.75rem",
    borderTop: `2px solid ${layoutColors.grayBorder}`,
  },
  totalLabel: {
    margin: 0,
    fontSize: "1rem",
    fontWeight: 700,
    color: layoutColors.dark,
  },
  thankYouSection: {
    backgroundColor: layoutColors.thankYouBg,
    padding: "1.25rem 1.5rem",
    textAlign: "center" as const,
  },
  thankYouText: {
    margin: 0,
    fontSize: "0.9375rem",
    color: layoutColors.dark,
  },
  thankYouNotes: {
    margin: "0.5rem 0 0 0",
    fontSize: "0.875rem",
    color: "#4b5563",
  },
  footerSection: {
    padding: "1rem 1.5rem",
    backgroundColor: layoutColors.footerBg,
  },
  footerText: {
    margin: 0,
    fontSize: "0.8125rem",
    color: layoutColors.grayMuted,
    textAlign: "center" as const,
  },
  footerCopyright: {
    margin: "0.5rem 0 0 0",
    fontSize: "0.75rem",
    color: layoutColors.grayLight,
    textAlign: "center" as const,
  },
} as const
