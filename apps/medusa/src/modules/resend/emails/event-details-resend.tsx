import { Text, Column, Row, Section, Button } from "@react-email/components"
import { TransactionalEmailLayout } from "./transactional-email-layout"
import { layoutStyles } from "./transactional-email-layout-styles"

export type EventDetailsResendEmailProps = {
  customer: {
    first_name: string
    last_name: string
    email: string
    phone: string
  }
  booking: {
    date: string
    time: string
    event_type: string
    location_type: string
    location_address: string
    party_size: number
    notes: string
  }
  event: {
    status: string
    total_price: string
    price_per_person: string
  }
  product: {
    id: string
    handle: string
    title: string
    purchase_url: string
  } | null
  chef: {
    name: string
    email: string
    phone: string
  }
  requestReference: string
  customNotes?: string
  emailType: "event_details_resend"
}

function row(label: string, value: string) {
  return (
    <Row style={{ marginBottom: "0.5rem" }}>
      <Column style={{ width: "38%" }}>
        <Text style={layoutStyles.lineItemDescription}>{label}</Text>
      </Column>
      <Column style={{ width: "62%" }}>
        <Text style={layoutStyles.lineItemSubtext}>{value}</Text>
      </Column>
    </Row>
  )
}

function EventDetailsResendEmailComponent({
  customer,
  booking,
  event,
  product,
  chef,
  requestReference,
  customNotes,
}: EventDetailsResendEmailProps) {
  const billToContent = (
    <>
      <Text style={layoutStyles.billToLabel}>BILL TO</Text>
      <Text style={layoutStyles.billToText}>
        {customer.first_name} {customer.last_name}
      </Text>
      <Text style={{ ...layoutStyles.metaText, margin: "0.25rem 0 0 0" }}>{customer.email}</Text>
      <Text style={{ ...layoutStyles.metaText, margin: "0.25rem 0 0 0" }}>{customer.phone}</Text>
    </>
  )

  const metaContent = (
    <>
      <Text style={layoutStyles.metaText}>Reference #{requestReference}</Text>
      <Text style={{ ...layoutStyles.metaText, margin: 0 }}>Status: CONFIRMED</Text>
    </>
  )

  const bodyContent = (
    <>
      <Section style={layoutStyles.lineItemsSection}>
        <Text style={layoutStyles.lineItemDescription}>
          Hi {customer.first_name} — here are your confirmed event details.
        </Text>
      </Section>

      {customNotes ? (
        <Section style={layoutStyles.lineItemsSection}>
          <Text style={{ ...layoutStyles.lineItemDescription, fontWeight: 700, marginBottom: "0.5rem" }}>
            Message from {chef.name}
          </Text>
          <Text style={layoutStyles.lineItemSubtext}>{customNotes}</Text>
        </Section>
      ) : null}

      <Section style={layoutStyles.lineItemsSection}>
        <Text style={{ ...layoutStyles.lineItemDescription, fontWeight: 700, marginBottom: "0.75rem" }}>
          Event details
        </Text>
        {row("Date & time", `${booking.date} at ${booking.time}`)}
        {row("Event type", booking.event_type)}
        {row("Party size", `${booking.party_size} guests`)}
        {row("Location", `${booking.location_type} — ${booking.location_address}`)}
        {booking.notes ? row("Notes", booking.notes) : null}
        {row("Price per person", `$${event.price_per_person}`)}
        {row("Total", `$${event.total_price}`)}
      </Section>

      {product?.purchase_url ? (
        <Section style={{ ...layoutStyles.lineItemsSection, textAlign: "center" as const }}>
          <Button
            href={product.purchase_url}
            style={{
              backgroundColor: "#16a34a",
              color: "#fff",
              padding: "12px 24px",
              borderRadius: "6px",
              fontWeight: 600,
            }}
          >
            View event & tickets
          </Button>
        </Section>
      ) : null}

      <Section style={layoutStyles.lineItemsSection}>
        <Text style={{ ...layoutStyles.lineItemDescription, fontWeight: 700, marginBottom: "0.5rem" }}>
          Reminders
        </Text>
        <Text style={layoutStyles.lineItemSubtext}>
          • {chef.name} will follow up before your event{"\n"}• Share dietary needs in advance{"\n"}•
          Contact us right away if plans change
        </Text>
      </Section>
    </>
  )

  return (
    <TransactionalEmailLayout
      preview="Your chef event details and confirmation"
      brandName={chef.name}
      headerLabel="EVENT DETAILS"
      billToContent={billToContent}
      metaContent={metaContent}
      thankYouText="We're looking forward to your event."
      brandContact={chef}
    >
      {bodyContent}
    </TransactionalEmailLayout>
  )
}

EventDetailsResendEmailComponent.PreviewProps = {
  customer: {
    first_name: "Riley",
    last_name: "Nguyen",
    email: "riley@example.com",
    phone: "+1 555-0166",
  },
  booking: {
    date: "Saturday, July 19, 2026",
    time: "6:30 PM",
    event_type: "Birthday",
    location_type: "Private residence",
    location_address: "321 Elm St, San Antonio, TX",
    party_size: 14,
    notes: "Gluten-free options needed.",
  },
  event: {
    status: "confirmed",
    total_price: "3,200.00",
    price_per_person: "228.57",
  },
  product: {
    id: "prod_event_preview",
    handle: "celebration-package",
    title: "Celebration package",
    purchase_url: "https://example.com/products/celebration-package",
  },
  chef: {
    name: "Chef John Doe",
    email: "chef@example.com",
    phone: "+1 555-0199",
  },
  requestReference: "REQ-PREVIEW-004",
  customNotes: "Please arrive 30 minutes early for setup.",
  emailType: "event_details_resend",
} satisfies EventDetailsResendEmailProps

export default EventDetailsResendEmailComponent

export const eventDetailsResendEmail = (props: EventDetailsResendEmailProps) => (
  <EventDetailsResendEmailComponent {...props} />
)
