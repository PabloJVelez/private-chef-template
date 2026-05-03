import {
  buildChefEventPaymentSummary,
  getPendingAdditionalCharges,
  normalizeAdditionalCharges,
  requiresMinimumTicketsWithPendingCharges,
} from "../chef-event-additional-charges"
import { isEventTicketSku } from "../event-ticket"

describe("chef-event-additional-charges", () => {
  it("first checkout: pending charges bundle with minimum ticket total in cents", () => {
    const charges = normalizeAdditionalCharges([
      {
        id: "c1",
        name: "Travel surcharge",
        amount: 2500,
        status: "pending",
        created_at: "2026-04-01T00:00:00.000Z",
        updated_at: "2026-04-01T00:00:00.000Z",
      },
    ])

    const pending = getPendingAdditionalCharges(charges)
    expect(pending).toHaveLength(1)
    expect(requiresMinimumTicketsWithPendingCharges(charges)).toBe(true)

    const summary = buildChefEventPaymentSummary({
      partySize: 6,
      pricePerTicket: 10000,
      charges,
    })

    expect(summary.minimumInitialTicketQuantity).toBe(4)
    expect(summary.minimumTicketsRequiredWithPendingCharges).toBe(true)
    expect(summary.pendingChargesTotal).toBe(2500)
    expect(summary.dueNowMinimumTotal).toBe(4 * 10000 + 2500)
  })

  it("after a paid charge: new pending rows do not add minimum ticket bundle to due total", () => {
    const charges = normalizeAdditionalCharges([
      {
        id: "c1",
        name: "Travel surcharge",
        amount: 2500,
        status: "pending",
        created_at: "2026-04-01T00:00:00.000Z",
        updated_at: "2026-04-01T00:00:00.000Z",
      },
      {
        id: "c2",
        name: "Equipment fee",
        amount: 1000,
        status: "paid",
        created_at: "2026-04-01T00:00:00.000Z",
        updated_at: "2026-04-01T00:00:00.000Z",
      },
    ])

    expect(requiresMinimumTicketsWithPendingCharges(charges)).toBe(false)

    const summary = buildChefEventPaymentSummary({
      partySize: 6,
      pricePerTicket: 10000,
      charges,
    })

    expect(summary.minimumTicketsRequiredWithPendingCharges).toBe(false)
    expect(summary.pendingChargesTotal).toBe(2500)
    expect(summary.dueNowMinimumTotal).toBe(2500)
  })

  it("keeps system charge SKU out of event-ticket detection", () => {
    expect(isEventTicketSku("SYS-CHEF-CHARGE")).toBe(false)
  })
})
