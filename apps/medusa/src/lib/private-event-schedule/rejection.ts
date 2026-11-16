import { MedusaError } from "@medusajs/framework/utils";
import { AvailabilityPolicyError } from "../availability/policy-error";

import type { PreviewRejectionCode } from "../chef-ai/preview-rejection";
export type { PreviewRejectionCode } from "../chef-ai/preview-rejection";
export class SchedulePolicyError extends MedusaError {
  constructor(
    public code: PreviewRejectionCode,
    message: string,
  ) {
    super(MedusaError.Types.NOT_ALLOWED, message);
  }
}
/** Only explicit domain policy errors carry public details. No string classification. */
export function publicPreviewRejection(error: unknown) {
  if (error instanceof SchedulePolicyError)
    return { code: error.code, message: error.message };
  if (error instanceof AvailabilityPolicyError)
    return {
      code: (
        {
          unavailable: "slot_unavailable",
          unconfigured: "availability_unconfigured",
          inactive: "experience_inactive",
        } as const
      )[error.reason],
      message: error.message,
    };
  return {
    code: "preview_unavailable" as const,
    message:
      "I can't check scheduling right now. Open the event or try again later.",
  };
}
