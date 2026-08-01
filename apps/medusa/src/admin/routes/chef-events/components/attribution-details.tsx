import { Badge, Container, Label, Text } from "@medusajs/ui"

import type {
  MarketingAttributionPayload,
  MarketingAttributionTouch,
} from "../../../../sdk/admin/admin-chef-events"

type AttributionDetailsProps = {
  attribution?: MarketingAttributionPayload | null
}

const touchFields: Array<{
  key: keyof MarketingAttributionTouch
  label: string
}> = [
  { key: "utm_source", label: "Source" },
  { key: "utm_medium", label: "Medium" },
  { key: "utm_campaign", label: "Campaign" },
  { key: "utm_content", label: "Content" },
  { key: "utm_term", label: "Term" },
  { key: "gclid", label: "Google click id" },
  { key: "fbclid", label: "Meta click id" },
  { key: "landing_page", label: "Landing page" },
  { key: "referrer", label: "Referrer" },
  { key: "seen_at", label: "Captured at" },
]

const formatValue = (
  key: keyof MarketingAttributionTouch,
  value: string | undefined
) => {
  if (!value) {
    return "Not captured"
  }

  if (key !== "seen_at") {
    return value
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }

  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

const getTouchLabel = (touch?: MarketingAttributionTouch) => {
  if (!touch) {
    return "Not captured"
  }

  return [touch.utm_source, touch.utm_medium, touch.utm_campaign]
    .filter(Boolean)
    .join(" / ") || "Direct or unknown"
}

const AttributionTouchDetails = ({
  title,
  touch,
}: {
  title: string
  touch?: MarketingAttributionTouch
}) => {
  return (
    <div className="rounded-md border border-ui-border-base bg-ui-bg-field p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <Text weight="plus">{title}</Text>
        <Badge color={touch ? "blue" : "grey"}>{getTouchLabel(touch)}</Badge>
      </div>
      <dl className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {touchFields.map(({ key, label }) => (
          <div key={key} className={key === "landing_page" || key === "referrer" ? "md:col-span-2" : ""}>
            <Label>{label}</Label>
            <Text
              size="small"
              className="mt-1 break-words font-mono text-ui-fg-subtle"
            >
              {formatValue(key, touch?.[key])}
            </Text>
          </div>
        ))}
      </dl>
    </div>
  )
}

export const AttributionDetails = ({
  attribution,
}: AttributionDetailsProps) => {
  return (
    <Container className="p-6">
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold">Attribution</h3>
          <Text size="small" className="text-ui-fg-subtle">
            Source data attached to this request for channel reporting.
          </Text>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <AttributionTouchDetails
            title="First touch"
            touch={attribution?.first_touch}
          />
          <AttributionTouchDetails
            title="Last touch"
            touch={attribution?.last_touch}
          />
        </div>
      </div>
    </Container>
  )
}
