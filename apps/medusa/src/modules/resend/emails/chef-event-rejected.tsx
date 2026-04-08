import { Text, Column, Row, Section, Button } from "@react-email/components"
import { TransactionalEmailLayout } from "./transactional-email-layout"
import { layoutStyles } from "./transactional-email-layout-styles"

export type ChefEventRejectedEmailProps = {
  customer: {
    first_name: string
    last_name: string
    email: string
    phone: string
  }
  booking: {
    date: string
    time: string
    menu: string
    event_type: string
    location_type: string
    location_address: string
    party_size: number
    notes: string
  }
  rejection: {
    reason: string
    chefNotes: string
  }
  chef: {
    name: string
    email: string
    phone: string
  }
  requestReference: string
  rejectionDate: string
  emailType: "customer_rejection"
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

function ChefEventRejectedEmailComponent({
  customer,
  booking,
  rejection,
  chef,
  requestReference,
  rejectionDate,
}: ChefEventRejectedEmailProps) {
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
      <Text style={layoutStyles.metaText}>Updated: {rejectionDate}</Text>
      <Text style={{ ...layoutStyles.metaText, margin: 0 }}>Status: NOT AVAILABLE</Text>
    </>
  )

  const bodyContent = (
    <>
      <Section style={layoutStyles.lineItemsSection}>
        <Text style={layoutStyles.lineItemDescription}>
          Thank you for your interest. We are unable to accommodate this request at this time.
        </Text>
      </Section>

      <Section style={layoutStyles.lineItemsSection}>
        <Text style={{ ...layoutStyles.lineItemDescription, fontWeight: 700, marginBottom: "0.75rem" }}>
          Request summary
        </Text>
        {row("Date & time", `${booking.date} at ${booking.time}`)}
        {row("Event type", booking.event_type)}
        {row("Party size", `${booking.party_size} guests`)}
        {row("Location", `${booking.location_type} — ${booking.location_address}`)}
      </Section>

      <Section style={layoutStyles.lineItemsSection}>
        <Text style={{ ...layoutStyles.lineItemDescription, fontWeight: 700, marginBottom: "0.5rem" }}>
          Reason
        </Text>
        <Text style={layoutStyles.lineItemSubtext}>{rejection.reason}</Text>
        {rejection.chefNotes ? (
          <>
            <Text
              style={{ ...layoutStyles.lineItemDescription, fontWeight: 700, marginTop: "0.75rem" }}
            >
              Note from {chef.name}
            </Text>
            <Text style={layoutStyles.lineItemSubtext}>{rejection.chefNotes}</Text>
          </>
        ) : null}
      </Section>

      <Section style={layoutStyles.lineItemsSection}>
        <Text style={{ ...layoutStyles.lineItemDescription, fontWeight: 700, marginBottom: "0.5rem" }}>
          Other options
        </Text>
        <Text style={layoutStyles.lineItemSubtext}>
          • Try a different date or time{"\n"}• Explore other event formats{"\n"}• Contact us for a custom
          arrangement
        </Text>
      </Section>

      <Section style={{ ...layoutStyles.lineItemsSection, textAlign: "center" as const }}>
        <Button
          href={`mailto:${chef.email}`}
          style={{
            backgroundColor: "#1a1a1a",
            color: "#fff",
            padding: "12px 24px",
            borderRadius: "6px",
            fontWeight: 600,
          }}
        >
          Contact {chef.name}
        </Button>
      </Section>
    </>
  )

  return (
    <TransactionalEmailLayout
      preview="Update regarding your chef event request"
      brandName={chef.name}
      headerLabel="REQUEST UPDATE"
      billToContent={billToContent}
      metaContent={metaContent}
      thankYouText="We hope to work with you on a future event."
      brandContact={chef}
    >
      {bodyContent}
    </TransactionalEmailLayout>
  )
}

ChefEventRejectedEmailComponent.PreviewProps = {
  customer: {
    first_name: "Jordan",
    last_name: "Lee",
    email: "jordan@example.com",
    phone: "+1 555-0123",
  },
  booking: {
    date: "Friday, May 2, 2026",
    time: "7:30 PM",
    menu: "Four-course dinner",
    event_type: "Anniversary",
    location_type: "Venue",
    location_address: "456 Oak Ave, Dallas, TX",
    party_size: 12,
    notes: "Outdoor patio preferred.",
  },
  rejection: {
    reason: "Chef unavailable on requested date",
    chefNotes: "Our calendar is fully booked that weekend.",
  },
  chef: {
    name: "Chef John Doe",
    email: "chef@example.com",
    phone: "+1 555-0199",
  },
  requestReference: "REQ-PREVIEW-002",
  rejectionDate: "March 18, 2026",
  emailType: "customer_rejection",
} satisfies ChefEventRejectedEmailProps

export default ChefEventRejectedEmailComponent

export const chefEventRejectedEmail = (props: ChefEventRejectedEmailProps) => (
  <ChefEventRejectedEmailComponent {...props} />
)
