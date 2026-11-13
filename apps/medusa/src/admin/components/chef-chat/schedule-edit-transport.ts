import { z } from "zod";

const id = z.string().min(1).max(200);
const instant = z.string().datetime();
const local = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  timezone: z.string().refine((zone) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: zone });
      return true;
    } catch {
      return false;
    }
  }),
  instant,
});
const previewSchema = z.object({
  reference: z.string().min(1).max(4096),
  operationId: z.string().uuid(),
  eventId: id,
  expectedRevision: z.string().regex(/^[a-f0-9]{32}$/),
  expiresAt: instant,
  current: local,
  proposed: local,
  reserved: z.literal(false),
  googleAvailability: z.literal("advisory"),
});
const receiptSchema = z
  .object({
    outcome: local.extend({
      operationId: z.string().uuid(),
      eventId: id,
      outcome: z.enum(["saved", "no_change", "rejected"]),
      committedRevision: z
        .string()
        .regex(/^[a-f0-9]{32}$/)
        .nullable(),
      reason: z.string().max(1000).optional(),
    }),
    googleSync: z.enum([
      "not_requested",
      "pending",
      "unknown",
      "requested",
      "failed",
    ]),
    historical: z.literal(true),
    reserved: z.literal(false),
  })
  .refine(({ outcome }) =>
    outcome.outcome === "rejected"
      ? outcome.committedRevision === null
      : outcome.committedRevision !== null,
  );
const unknownSchema = z.object({
  outcome: z.literal("unknown"),
  operationId: z.string().uuid(),
});
export type SchedulePreview = z.infer<typeof previewSchema>;
export type ScheduleReceipt = z.infer<typeof receiptSchema>;
export type ScheduleResult = ScheduleReceipt | z.infer<typeof unknownSchema>;
export type PreviewInput = { eventId: string; date?: string; time?: string };
export type ScheduleTransport = {
  backend: string;
  preview(
    input: PreviewInput,
    current: () => boolean,
  ): Promise<SchedulePreview>;
  attempt(
    action: "confirm" | "recover",
    reference: string,
    current: () => boolean,
  ): Promise<ScheduleResult>;
};
export class ScheduleTransportError extends Error {
  constructor(
    public kind:
      | "access"
      | "policy"
      | "configuration"
      | "malformed"
      | "network"
      | "cancelled",
    public status?: number,
    policyMessage?: string,
  ) {
    super(
      kind === "access" || kind === "configuration"
        ? "Schedule changes are unavailable."
        : kind === "policy"
          ? (policyMessage ??
            "This change could not be prepared. Check the event and availability, then preview again.")
          : "The schedule response could not be verified.",
    );
  }
}

/** Only this feature bypasses SDK response normalization (2.22.6 drops 409 receipts).
 * The mount supplies the dashboard's actual backend/auth settings and token getter.
 * Never patch SDK/global fetch, decode references, or log request/response bodies.
 */
export function createScheduleTransport(config: {
  backendUrl: string;
  authType: "session" | "jwt";
  getToken: () => Promise<string | null | undefined>;
  fetch?: typeof fetch;
}): ScheduleTransport {
  const backend = new URL(
    config.backendUrl === "/" || !config.backendUrl
      ? window.location.origin
      : config.backendUrl,
  ).href.replace(/\/$/, "");
  async function post(action: string, body: unknown, current: () => boolean) {
    try {
      const token =
        config.authType === "jwt" ? await config.getToken() : undefined;
      // Token lookup can yield through a logout/account change. Do not dispatch then.
      if (!current()) throw new ScheduleTransportError("cancelled");
      const response = await (config.fetch ?? globalThis.fetch)(
        `${backend}/admin/chef-events/schedule-edit/${action}`,
        {
          method: "POST",
          credentials: config.authType === "session" ? "include" : "omit",
          mode: "cors",
          cache: "no-store",
          redirect: "error",
          // Aborting the wait cannot undo a server commit. Attempt state remains recoverable.
          signal: AbortSignal.timeout(20000),
          headers: {
            "content-type": "application/json",
            accept: "application/json",
            ...(token ? { authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify(body),
        },
      );
      if ([401, 403].includes(response.status))
        throw new ScheduleTransportError("access", response.status);
      if (response.status === 503)
        throw new ScheduleTransportError("configuration", 503);
      if ([400, 404, 422].includes(response.status)) {
        // Preview accepts no reference and returns bounded, server-owned policy
        // messages. Never surface raw error bodies from attempted writes/recovery.
        const policy =
          action === "preview"
            ? z
                .object({ message: z.string().min(1).max(500) })
                .safeParse(await response.json().catch(() => null))
            : undefined;
        throw new ScheduleTransportError(
          "policy",
          response.status,
          policy?.success ? policy.data.message : undefined,
        );
      }
      const data: unknown = await response.json().catch(() => {
        throw new ScheduleTransportError("malformed");
      });
      return { status: response.status, data };
    } catch (error) {
      if (error instanceof ScheduleTransportError) throw error;
      throw new ScheduleTransportError("network");
    }
  }
  return {
    backend,
    async preview(input, current) {
      const { status, data } = await post("preview", input, current);
      const parsed = previewSchema.safeParse(data);
      if (
        status !== 200 ||
        !parsed.success ||
        parsed.data.eventId !== input.eventId
      )
        throw new ScheduleTransportError("malformed");
      return parsed.data;
    },
    async attempt(action, reference, current) {
      const { status, data } = await post(action, { reference }, current);
      if (status === 202) {
        const parsed = unknownSchema.safeParse(data);
        if (parsed.success) return parsed.data;
      }
      const parsed = receiptSchema.safeParse(data);
      if (
        parsed.success &&
        ((status === 409 && parsed.data.outcome.outcome === "rejected") ||
          (status === 200 && parsed.data.outcome.outcome !== "rejected"))
      )
        return parsed.data;
      throw new ScheduleTransportError("malformed");
    },
  };
}
