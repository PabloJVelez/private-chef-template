import { Text, Column, Row, Section, Button } from "@react-email/components"
import { TransactionalEmailLayout } from "./transactional-email-layout"
import { layoutStyles } from "./transactional-email-layout-styles"

export type ChefEventAcceptedEmailProps = {
  customer: {
    first_name: string
    last_name: string
    email: string
    phone: string
  }
  booking: {
    date: string
    time: string
    menu?: string
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
    deposit_required: string
    deposit_deadline: string
    minimum_tickets: number
    is_full_deposit: boolean
  }
  product: {
    id: string
    handle: string
    title: string
    purchase_url: string
  }
  chef: {
    name: string
    email: string
    phone: string
  }
  requestReference: string
  acceptanceDate: string
  chefNotes: string
  emailType: "customer_acceptance"
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

function ChefEventAcceptedEmailComponent({
  customer,
  booking,
  event,
  product,
  chef,
  requestReference,
  acceptanceDate,
  chefNotes,
}: ChefEventAcceptedEmailProps) {
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
      <Text style={layoutStyles.metaText}>Accepted: {acceptanceDate}</Text>
      <Text style={{ ...layoutStyles.metaText, margin: 0 }}>Status: CONFIRMED</Text>
    </>
  )

  const bodyContent = (
    <>
      <Section style={layoutStyles.lineItemsSection}>
        <Text style={layoutStyles.lineItemDescription}>
          Great news — your booking is confirmed. Complete payment using the button below.
        </Text>
      </Section>

      <Section style={layoutStyles.lineItemsSection}>
        <Text style={{ ...layoutStyles.lineItemDescription, fontWeight: 700, marginBottom: "0.75rem" }}>
          Event details
        </Text>
        {row("Date", booking.date)}
        {row("Time", booking.time)}
        {row("Menu", booking.menu ?? "To be finalized with your chef")}
        {row("Event type", booking.event_type)}
        {row("Location", booking.location_type)}
        {row("Address", booking.location_address)}
        {row("Party size", `${booking.party_size} guests`)}
        {row("Notes", booking.notes)}
      </Section>

      <Section style={layoutStyles.lineItemsSection}>
        <Text style={{ ...layoutStyles.lineItemDescription, fontWeight: 700, marginBottom: "0.75rem" }}>
          Payment
        </Text>
        {row("Total", `$${event.total_price}`)}
        {row(
          event.is_full_deposit ? "Full payment due" : "Minimum deposit",
          `$${event.deposit_required}`
        )}
        {row("Deadline", event.deposit_deadline)}
        {!event.is_full_deposit ? row("Minimum tickets", String(event.minimum_tickets)) : null}
        <Text style={{ ...layoutStyles.lineItemSubtext, marginTop: "0.75rem" }}>
          {event.is_full_deposit
            ? `Pay the full amount by ${event.deposit_deadline} to secure your booking.`
            : `Purchase at least ${event.minimum_tickets} tickets by ${event.deposit_deadline}.`}
        </Text>
      </Section>

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
          {event.is_full_deposit ? "Pay full amount" : "Purchase tickets"}
        </Button>
      </Section>

      <Section style={layoutStyles.lineItemsSection}>
        <Text style={{ ...layoutStyles.lineItemDescription, fontWeight: 700, marginBottom: "0.5rem" }}>
          Chef note
        </Text>
        <Text style={layoutStyles.lineItemSubtext}>{chefNotes}</Text>
      </Section>
    </>
  )

  return (
    <TransactionalEmailLayout
      preview="Your chef event has been accepted"
      brandName={chef.name}
      headerLabel="BOOKING CONFIRMED"
      billToContent={billToContent}
      metaContent={metaContent}
      thankYouText="We look forward to hosting your event."
      brandContact={chef}
    >
      {bodyContent}
    </TransactionalEmailLayout>
  )
}

ChefEventAcceptedEmailComponent.PreviewProps = {
  customer: {
    first_name: "Alex",
    last_name: "Rivera",
    email: "alex@example.com",
    phone: "+1 555-0100",
  },
  booking: {
    date: "Saturday, April 12, 2026",
    time: "6:00 PM",
    menu: "Tasting menu",
    event_type: "Private dinner",
    location_type: "Client home",
    location_address: "123 Main St, Austin, TX",
    party_size: 8,
    notes: "Two vegetarians.",
  },
  event: {
    status: "accepted",
    total_price: "2,400.00",
    price_per_person: "300.00",
    deposit_required: "600.00",
    deposit_deadline: "April 5, 2026",
    minimum_tickets: 6,
    is_full_deposit: false,
  },
  product: {
    id: "prod_preview",
    handle: "private-chef-experience",
    title: "Private chef experience",
    purchase_url: "https://example.com/products/private-chef-experience",
  },
  chef: {
    name: "Chef John Doe",
    email: "chef@example.com",
    phone: "+1 555-0199",
  },
  requestReference: "REQ-PREVIEW-001",
  acceptanceDate: "March 20, 2026",
  chefNotes: "Looking forward to cooking for your group!",
  emailType: "customer_acceptance",
} satisfies ChefEventAcceptedEmailProps

export default ChefEventAcceptedEmailComponent

export const chefEventAcceptedEmail = (props: ChefEventAcceptedEmailProps) => (
  <ChefEventAcceptedEmailComponent {...props} />
)
