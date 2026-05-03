import type { ChefEventAdditionalCharge } from "../modules/chef-event/models/chef-event"

export type ChefEventPaymentSummary = {
  minimumInitialTicketQuantity: number
  /**
   * When true, checkout with pending additional charges must include at least
   * `minimumInitialTicketQuantity` tickets (first invoice / deposit path).
   * After any charge has been paid, new pending rows are add-ons: charges only, no ticket floor.
   */
  minimumTicketsRequiredWithPendingCharges: boolean
  pendingCharges: Array<{
    id: string
    name: string
    amount: number
  }>
  pendingChargesTotal: number
  dueNowMinimumTotal: number
}

export function normalizeAdditionalCharges(
  raw: unknown,
): ChefEventAdditionalCharge[] {
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

export function getMinimumInitialTicketQuantity(partySize: number): number {
  return partySize > 4 ? 4 : Math.max(1, partySize)
}

export function getPendingAdditionalCharges(charges: ChefEventAdditionalCharge[]) {
  return charges.filter((charge) => charge.status === "pending")
}

export function hasAnyPaidAdditionalCharge(charges: ChefEventAdditionalCharge[]): boolean {
  return charges.some((charge) => charge.status === "paid")
}

/**
 * True when pending charges exist and the host has never completed a paid additional-charge
 * checkout yet — the first checkout must bundle the minimum ticket count with those charges.
 */
export function requiresMinimumTicketsWithPendingCharges(
  charges: ChefEventAdditionalCharge[],
): boolean {
  return getPendingAdditionalCharges(charges).length > 0 && !hasAnyPaidAdditionalCharge(charges)
}

export function buildChefEventPaymentSummary(input: {
  partySize: number
  pricePerTicket: number
  charges: ChefEventAdditionalCharge[]
}): ChefEventPaymentSummary {
  const minimumInitialTicketQuantity = getMinimumInitialTicketQuantity(input.partySize)
  const pendingCharges = getPendingAdditionalCharges(input.charges).map((charge) => ({
    id: charge.id,
    name: charge.name,
    amount: charge.amount,
  }))
  const pendingChargesTotal = pendingCharges.reduce((sum, charge) => sum + charge.amount, 0)
  const minimumTicketsRequiredWithPendingCharges =
    requiresMinimumTicketsWithPendingCharges(input.charges)
  const dueNowMinimumTotal = minimumTicketsRequiredWithPendingCharges
    ? minimumInitialTicketQuantity * input.pricePerTicket + pendingChargesTotal
    : pendingChargesTotal

  return {
    minimumInitialTicketQuantity,
    minimumTicketsRequiredWithPendingCharges,
    pendingCharges,
    pendingChargesTotal,
    dueNowMinimumTotal,
  }
}
