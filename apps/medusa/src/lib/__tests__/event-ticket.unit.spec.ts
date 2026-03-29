import { getUnfulfilledEventTicketLineItems, isEventTicketSku } from "../event-ticket"

describe("event-ticket", () => {
  describe("isEventTicketSku", () => {
    it("returns true for EVENT- prefix", () => {
      expect(isEventTicketSku("EVENT-abc-2026-04-16-cooking_class")).toBe(true)
    })
    it("returns false for non-event SKUs", () => {
      expect(isEventTicketSku("MENU-123")).toBe(false)
      expect(isEventTicketSku("")).toBe(false)
      expect(isEventTicketSku(null)).toBe(false)
      expect(isEventTicketSku(undefined)).toBe(false)
    })
  })

  describe("getUnfulfilledEventTicketLineItems", () => {
    it("returns open quantities for EVENT lines only", () => {
      const items = [
        {
          id: "l1",
          variant_sku: "EVENT-x-2026-01-01-class",
          quantity: 3,
          detail: { fulfilled_quantity: 1 },
        },
        {
          id: "l2",
          variant_sku: "OTHER",
          quantity: 1,
          detail: { fulfilled_quantity: 0 },
        },
        {
          id: "l3",
          variant_sku: "EVENT-y-2026-01-02-class",
          quantity: 2,
          detail: { fulfilled_quantity: 2 },
        },
      ]
      expect(getUnfulfilledEventTicketLineItems(items)).toEqual([{ id: "l1", quantity: 2 }])
    })

    it("returns empty for null items", () => {
      expect(getUnfulfilledEventTicketLineItems(null)).toEqual([])
    })
  })
})
