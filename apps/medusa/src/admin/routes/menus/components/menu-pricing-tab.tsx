import { Button, Label, Text, Input } from "@medusajs/ui"
import { useState, useEffect, useMemo } from "react"
import { useAdminListMenuPricing, useAdminUpsertMenuPricingMutation } from "../../../hooks/menus"
import { useAdminListExperienceTypes } from "../../../hooks/experience-types"
import { toast } from "@medusajs/ui"

interface MenuPricingTabProps {
  menuId: string
}

interface PriceRow {
  experience_type_id: string
  name: string
  dollarValue: string
}

export const MenuPricingTab = ({ menuId }: MenuPricingTabProps) => {
  const { data: pricingData, isLoading: pricingLoading } = useAdminListMenuPricing(menuId)
  const { data: experienceTypesData, isLoading: experienceTypesLoading } = useAdminListExperienceTypes()
  const upsertPricing = useAdminUpsertMenuPricingMutation(menuId)

  const [rows, setRows] = useState<PriceRow[]>([])
  const [initialized, setInitialized] = useState(false)

  const experienceTypes = useMemo(() => {
    const list = experienceTypesData?.experience_types ?? []
    return list.filter((et: any) => et.is_active)
  }, [experienceTypesData])

  useEffect(() => {
    if (initialized || experienceTypesLoading || pricingLoading) return
    if (!experienceTypes.length) return

    const priceMap = new Map(
      (pricingData?.prices ?? []).map((p: any) => [p.experience_type_id, p])
    )

    const initial: PriceRow[] = experienceTypes.map((et: any) => {
      const existing = priceMap.get(et.id) as any
      const cents = existing ? Number(existing.price_per_person) : 0
      return {
        experience_type_id: et.id,
        name: et.name,
        dollarValue: cents > 0 ? (cents / 100).toFixed(2) : "",
      }
    })

    setRows(initial)
    setInitialized(true)
  }, [experienceTypes, pricingData, pricingLoading, experienceTypesLoading, initialized])

  const handlePriceChange = (experienceTypeId: string, value: string) => {
    const cleaned = value.replace(/[^0-9.]/g, "")
    setRows((prev) =>
      prev.map((r) =>
        r.experience_type_id === experienceTypeId ? { ...r, dollarValue: cleaned } : r
      )
    )
  }

  const handleSave = async () => {
    const prices = rows
      .filter((r) => r.dollarValue.trim() !== "")
      .map((r) => ({
        experience_type_id: r.experience_type_id,
        price_per_person: Math.round(parseFloat(r.dollarValue) * 100),
      }))
      .filter((r) => !isNaN(r.price_per_person) && r.price_per_person >= 0)

    try {
      await upsertPricing.mutateAsync({ prices })
      toast.success("Pricing Saved", {
        description: "Menu pricing has been updated successfully.",
        duration: 3000,
      })
    } catch (error) {
      console.error("Failed to save pricing:", error)
      toast.error("Save Failed", {
        description: "There was an error saving the pricing. Please try again.",
        duration: 5000,
      })
    }
  }

  if (pricingLoading || experienceTypesLoading) {
    return (
      <div className="p-6 text-center">
        <Text>Loading pricing data...</Text>
      </div>
    )
  }

  if (!experienceTypes.length) {
    return (
      <div className="p-6 text-center space-y-3">
        <Text className="text-lg font-medium">No Experience Types Available</Text>
        <Text className="text-gray-600">
          Create experience types first, then come back to set pricing for this menu.
        </Text>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <Text className="text-lg font-medium">Pricing per Experience Type</Text>
        <Text className="text-sm text-gray-600 mt-1">
          Set the per-person price for each experience type on this menu. Leave blank if this menu doesn't offer that experience.
        </Text>
      </div>

      <div className="space-y-4">
        {rows.map((row) => (
          <div key={row.experience_type_id} className="flex items-center gap-4">
            <div className="w-48 shrink-0">
              <Label>{row.name}</Label>
            </div>
            <div className="relative flex-1 max-w-xs">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
              <Input
                type="text"
                inputMode="decimal"
                placeholder="0.00"
                value={row.dollarValue}
                onChange={(e) => handlePriceChange(row.experience_type_id, e.target.value)}
                className="pl-7"
              />
            </div>
            <Text className="text-sm text-gray-500">per person</Text>
          </div>
        ))}
      </div>

      <div className="flex justify-end pt-4 border-t">
        <Button
          type="button"
          variant="primary"
          onClick={handleSave}
          disabled={upsertPricing.isPending}
        >
          {upsertPricing.isPending ? "Saving..." : "Save Pricing"}
        </Button>
      </div>
    </div>
  )
}
