import { MedusaError } from "@medusajs/framework/utils";
import { ACCEPTANCE_POLICY_MESSAGES } from "../acceptance-messages";

/** Explicit business outcomes from our availability calculation, never a provider/DB classification. */
export class AvailabilityPolicyError extends MedusaError {
  constructor(
    public readonly reason: "unavailable" | "unconfigured" | "inactive",
  ) {
    super(
      reason === "inactive"
        ? MedusaError.Types.INVALID_DATA
        : MedusaError.Types.NOT_ALLOWED,
      ACCEPTANCE_POLICY_MESSAGES[reason],
    );
  }
}
