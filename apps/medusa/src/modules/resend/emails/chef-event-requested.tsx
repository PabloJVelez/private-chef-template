import { Text, Column, Row, Section, Button } from "@react-email/components"
import { TransactionalEmailLayout } from "./transactional-email-layout"
import { layoutStyles } from "./transactional-email-layout-styles"

export type ChefEventRequestedEmailProps = {
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
  event: {
    status: string
    total_price: string
    conflict: boolean
  }
  requestReference: string
  chefContact: {
    email: string
    phone: string
  }
  emailType: "customer_confirmation" | "chef_notification"
}

const BRAND_NAME = "Chef John Doe"

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

function ChefEventRequestedEmailComponent({
  customer,
  booking,
  event,
  requestReference,
  chefContact,
  emailType,
}: ChefEventRequestedEmailProps) {
  const isCustomerEmail = emailType === "customer_confirmation"
  const brandContact = {
    name: BRAND_NAME,
    email: chefContact.email,
    phone: chefContact.phone,
  }

  const billToContent = isCustomerEmail ? (
    <>
      <Text style={layoutStyles.billToLabel}>BILL TO</Text>
      <Text style={layoutStyles.billToText}>
        {customer.first_name} {customer.last_name}
      </Text>
      <Text style={{ ...layoutStyles.metaText, margin: "0.25rem 0 0 0" }}>{customer.email}</Text>
      <Text style={{ ...layoutStyles.metaText, margin: "0.25rem 0 0 0" }}>{customer.phone}</Text>
    </>
  ) : (
    <>
      <Text style={layoutStyles.billToLabel}>CUSTOMER</Text>
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
      <Text style={{ ...layoutStyles.metaText, margin: 0 }}>
        Status: {event.conflict ? "REVIEW" : "PENDING"}
      </Text>
    </>
  )

  const adminBase = process.env.ADMIN_BACKEND_URL ?? process.env.MEDUSA_ADMIN_URL ?? ""

  const bodyContent = (
    <>
      <Section style={layoutStyles.lineItemsSection}>
        <Text style={layoutStyles.lineItemDescription}>
          {isCustomerEmail
            ? `Hi ${customer.first_name}, we've received your request and will respond within 24–48 hours.`
            : "You have a new event request to review in the admin."}
        </Text>
      </Section>

      <Section style={layoutStyles.lineItemsSection}>
        <Text style={{ ...layoutStyles.lineItemDescription, fontWeight: 700, marginBottom: "0.75rem" }}>
          Event details
        </Text>
        {row("Date & time", `${booking.date} at ${booking.time}`)}
        {row("Event type", booking.event_type)}
        {row("Party size", `${booking.party_size} guests`)}
        {row("Location", `${booking.location_type} — ${booking.location_address}`)}
        {row("Menu", booking.menu)}
        {booking.notes ? row("Notes", booking.notes) : null}
        {row("Quoted total", event.total_price)}
      </Section>

      {!isCustomerEmail && adminBase ? (
        <Section style={{ ...layoutStyles.lineItemsSection, textAlign: "center" as const }}>
          <Row>
            <Column>
              <Button
                href={`${adminBase}/app/chef-events`}
                style={{
                  backgroundColor: "#16a34a",
                  color: "#fff",
                  padding: "12px 20px",
                  borderRadius: "6px",
                  fontWeight: 600,
                  marginRight: "8px",
                }}
              >
                Open admin
              </Button>
            </Column>
          </Row>
        </Section>
      ) : null}

      {isCustomerEmail ? (
        <Section style={layoutStyles.lineItemsSection}>
          <Text style={{ ...layoutStyles.lineItemDescription, fontWeight: 700, marginBottom: "0.5rem" }}>
            What happens next
          </Text>
          <Text style={layoutStyles.lineItemSubtext}>
            1. We review your request{"\n"}
            2. You receive our decision by email{"\n"}
            3. If accepted, you get a payment link{"\n"}
            4. We confirm details before your event
          </Text>
        </Section>
      ) : null}
    </>
  )

  return (
    <TransactionalEmailLayout
      preview={
        isCustomerEmail
          ? "Your chef event request has been received"
          : "New chef event request received"
      }
      brandName={BRAND_NAME}
      headerLabel={isCustomerEmail ? "REQUEST RECEIVED" : "NEW REQUEST"}
      billToContent={billToContent}
      metaContent={metaContent}
      thankYouText={
        isCustomerEmail ? "Thank you for choosing us for your event." : "Please review this request in admin."
      }
      brandContact={brandContact}
    >
      {bodyContent}
    </TransactionalEmailLayout>
  )
}

ChefEventRequestedEmailComponent.PreviewProps = {
  customer: {
    first_name: "Sam",
    last_name: "Taylor",
    email: "sam@example.com",
    phone: "+1 555-0144",
  },
  booking: {
    date: "Sunday, June 8, 2026",
    time: "5:00 PM",
    menu: "Family-style brunch",
    event_type: "Brunch",
    location_type: "Home",
    location_address: "789 Pine Rd, Houston, TX",
    party_size: 10,
    notes: "Kids welcome.",
  },
  event: {
    status: "pending",
    total_price: "$1,800.00",
    conflict: false,
  },
  requestReference: "REQ-PREVIEW-003",
  chefContact: {
    email: "bookings@example.com",
    phone: "+1 555-0177",
  },
  emailType: "customer_confirmation",
} satisfies ChefEventRequestedEmailProps

export default ChefEventRequestedEmailComponent

export const chefEventRequestedEmail = (props: ChefEventRequestedEmailProps) => (
  <ChefEventRequestedEmailComponent {...props} />
)
