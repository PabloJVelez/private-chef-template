import { MedusaError, MedusaService } from "@medusajs/framework/utils"
import ChefEventModel from "./models/chef-event"
import type { ChefEventAdditionalCharge } from "./models/chef-event"

type MutableAdditionalChargeInput = {
  id?: string
  name: string
  amount: number
  status?: "pending" | "paid" | "void"
  notes?: string | null
  sort_order?: number | null
}

type MarkChargePaidInput = {
  chargeId: string
  orderId: string
  paidAt?: Date
}

class ChefEventModuleService extends MedusaService({
  ChefEvent: ChefEventModel
}){
  private normalizeExistingCharges(raw: unknown): ChefEventAdditionalCharge[] {
    if (!Array.isArray(raw)) {
      return []
    }

    return raw.filter((row): row is ChefEventAdditionalCharge => {
      return (
        typeof row === "object" &&
        row !== null &&
        typeof (row as ChefEventAdditionalCharge).id === "string" &&
        typeof (row as ChefEventAdditionalCharge).name === "string" &&
        typeof (row as ChefEventAdditionalCharge).amount === "number" &&
        typeof (row as ChefEventAdditionalCharge).status === "string"
      )
    })
  }

  private nowIso(): string {
    return new Date().toISOString()
  }

  private normalizeIncomingRows(
    incoming: MutableAdditionalChargeInput[],
    existingById: Map<string, ChefEventAdditionalCharge>,
  ): ChefEventAdditionalCharge[] {
    const now = this.nowIso()

    return incoming.map((row, index) => {
      const id = row.id?.trim() || `charge_${crypto.randomUUID()}`
      const prior = existingById.get(id)

      if (row.amount < 0 || !Number.isInteger(row.amount)) {
        throw new MedusaError(
          MedusaError.Types.INVALID_DATA,
          `additionalCharges[${index}].amount must be a non-negative integer (cents)`,
        )
      }

      if (prior?.status === "paid") {
        if (row.name !== prior.name || row.amount !== prior.amount) {
          throw new MedusaError(
            MedusaError.Types.NOT_ALLOWED,
            `Paid additional charge rows cannot change name or amount (id: ${id})`,
          )
        }
      }

      const status = row.status ?? prior?.status ?? "pending"
      const created_at = prior?.created_at ?? now
      const paid_at = status === "paid" ? prior?.paid_at ?? now : null
      const paid_order_id = status === "paid" ? prior?.paid_order_id ?? null : null

      return {
        id,
        name: row.name.trim(),
        amount: row.amount,
        status,
        notes: row.notes ?? null,
        sort_order: row.sort_order ?? null,
        created_at,
        updated_at: now,
        paid_at,
        paid_order_id,
      }
    })
  }

  async setAdditionalCharges(
    chefEventId: string,
    incoming: MutableAdditionalChargeInput[],
  ) {
    const event = await this.retrieveChefEvent(chefEventId)
    if (!event) {
      throw new MedusaError(
        MedusaError.Types.NOT_FOUND,
        `Chef event with id ${chefEventId} not found`,
      )
    }

    const existing = this.normalizeExistingCharges((event as Record<string, unknown>).additionalCharges)
    const existingById = new Map(existing.map((c) => [c.id, c]))
    const normalized = this.normalizeIncomingRows(incoming, existingById)

    const updated = await this.updateChefEvents({
      id: chefEventId,
      additionalCharges: normalized as unknown as never,
    })

    return Array.isArray(updated) ? updated[0] : updated
  }

  async markChargesPaidByOrder(
    chefEventId: string,
    rows: MarkChargePaidInput[],
  ) {
    if (!rows.length) {
      return this.retrieveChefEvent(chefEventId)
    }

    const event = await this.retrieveChefEvent(chefEventId)
    if (!event) {
      throw new MedusaError(
        MedusaError.Types.NOT_FOUND,
        `Chef event with id ${chefEventId} not found`,
      )
    }

    const toMark = new Map(rows.map((r) => [r.chargeId, r]))
    const existing = this.normalizeExistingCharges((event as Record<string, unknown>).additionalCharges)
    const now = this.nowIso()

    const next = existing.map((charge) => {
      const marker = toMark.get(charge.id)
      if (!marker || charge.status === "paid") {
        return charge
      }

      return {
        ...charge,
        status: "paid" as const,
        paid_order_id: marker.orderId,
        paid_at: (marker.paidAt ?? new Date(now)).toISOString(),
        updated_at: now,
      }
    })

    const updated = await this.updateChefEvents({
      id: chefEventId,
      additionalCharges: next as unknown as never,
    })

    return Array.isArray(updated) ? updated[0] : updated
  }
}

export default ChefEventModuleService