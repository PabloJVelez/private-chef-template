import { Text, Column, Row, Section } from "@react-email/components"
import { TransactionalEmailLayout } from "./transactional-email-layout"
import { layoutStyles } from "./transactional-email-layout-styles"

export type ReceiptEmailProps = {
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
    purchase_url?: string
  }
  purchasedTickets: number
  totalPurchasedPrice: string
  tipAmount?: number
  tipMethod?: string
  chef: {
    name: string
    email: string
    phone: string
  }
  requestReference: string
  receiptDate?: string
  customNotes?: string
}

function formatCurrency(value: number | string): string {
  const n = typeof value === "string" ? parseFloat(value) : value
  if (Number.isNaN(n)) return String(value)
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(n)
}

function formatDate(dateStr?: string): string {
  if (!dateStr) {
    return new Date().toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    })
  }
  return new Date(dateStr).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  })
}

function ReceiptEmailComponent({
  customer,
  booking,
  event,
  product,
  purchasedTickets,
  totalPurchasedPrice,
  tipAmount,
  tipMethod,
  chef,
  requestReference,
  receiptDate,
  customNotes,
}: ReceiptEmailProps) {
  const receiptDateFormatted = formatDate(receiptDate)
  const showGratuity = tipAmount != null && tipAmount > 0

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
      <Text style={layoutStyles.metaText}>Receipt # {requestReference}</Text>
      <Text style={layoutStyles.metaText}>Date: {receiptDateFormatted}</Text>
      <Text style={{ ...layoutStyles.metaText, margin: 0 }}>
        Status: {event.status?.toUpperCase() ?? "PAID"}
      </Text>
    </>
  )

  const totalWithTip = showGratuity
    ? parseFloat(String(totalPurchasedPrice).replace(/[^0-9.-]/g, "")) + (tipAmount ?? 0)
    : parseFloat(String(totalPurchasedPrice).replace(/[^0-9.-]/g, ""))

  const bodyContent = (
    <>
      <Section style={layoutStyles.lineItemsSection}>
        <Row style={{ marginBottom: "0.5rem" }}>
          <Column style={{ width: "70%" }}>
            <Text style={layoutStyles.lineItemDescription}>
              {product.title} — {booking.event_type}
            </Text>
            <Text style={layoutStyles.lineItemSubtext}>
              {booking.date} at {booking.time} · {booking.party_size}{" "}
              {booking.party_size === 1 ? "ticket" : "tickets"}
            </Text>
          </Column>
          <Column align="right" style={{ width: "30%" }}>
            <Text style={layoutStyles.lineItemDescription}>
              {formatCurrency(totalPurchasedPrice)}
            </Text>
          </Column>
        </Row>
        <Row style={{ marginBottom: "0.5rem" }}>
          <Column style={{ width: "70%" }}>
            <Text style={layoutStyles.lineItemDescription}>
              {purchasedTickets} {purchasedTickets === 1 ? "ticket" : "tickets"} @ {event.price_per_person}{" "}
              per person
            </Text>
          </Column>
          <Column align="right" style={{ width: "30%" }}>
            <Text style={layoutStyles.lineItemDescription}>
              {formatCurrency(totalPurchasedPrice)}
            </Text>
          </Column>
        </Row>
        {showGratuity ? (
          <Row style={{ marginTop: "0.5rem" }}>
            <Column style={{ width: "70%" }}>
              <Text style={layoutStyles.lineItemDescription}>
                Gratuity{tipMethod ? ` (${tipMethod})` : ""}
              </Text>
            </Column>
            <Column align="right" style={{ width: "30%" }}>
              <Text style={layoutStyles.lineItemDescription}>{formatCurrency(tipAmount!)}</Text>
            </Column>
          </Row>
        ) : null}
      </Section>

      <Section style={layoutStyles.totalsSection}>
        <Row>
          <Column style={{ width: "70%" }}>
            <Text style={layoutStyles.metaText}>Subtotal</Text>
          </Column>
          <Column align="right" style={{ width: "30%" }}>
            <Text style={layoutStyles.lineItemDescription}>
              {formatCurrency(totalPurchasedPrice)}
            </Text>
          </Column>
        </Row>
        {showGratuity ? (
          <Row style={{ marginTop: "0.25rem" }}>
            <Column style={{ width: "70%" }}>
              <Text style={layoutStyles.metaText}>Gratuity</Text>
            </Column>
            <Column align="right" style={{ width: "30%" }}>
              <Text style={layoutStyles.lineItemDescription}>{formatCurrency(tipAmount!)}</Text>
            </Column>
          </Row>
        ) : null}
        <Row style={layoutStyles.totalRow}>
          <Column style={{ width: "70%" }}>
            <Text style={layoutStyles.totalLabel}>Total</Text>
          </Column>
          <Column align="right" style={{ width: "30%" }}>
            <Text style={layoutStyles.totalLabel}>{formatCurrency(totalWithTip)}</Text>
          </Column>
        </Row>
      </Section>
    </>
  )

  return (
    <TransactionalEmailLayout
      preview={`Your receipt for ${product.title}`}
      brandName={chef.name}
      headerLabel="RECEIPT"
      billToContent={billToContent}
      metaContent={metaContent}
      thankYouText="Thank you for your business."
      customNotes={customNotes}
      brandContact={chef}
    >
      {bodyContent}
    </TransactionalEmailLayout>
  )
}

export const receiptEmail = (props: ReceiptEmailProps) => <ReceiptEmailComponent {...props} />

export default ReceiptEmailComponent

ReceiptEmailComponent.PreviewProps = {
  customer: {
    first_name: "Jordan",
    last_name: "Smith",
    email: "jordan.smith@example.com",
    phone: "(555) 123-4567",
  },
  booking: {
    date: "Saturday, March 22, 2025",
    time: "6:00 PM",
    event_type: "Plated Dinner",
    location_type: "Customer's Location",
    location_address: "456 Elm St, Austin, TX 78701",
    party_size: 8,
    notes: "Outdoor seating preferred.",
  },
  event: {
    status: "Paid",
    total_price: "1199.92",
    price_per_person: "149.99",
  },
  product: {
    id: "prod_01",
    handle: "plated-dinner-jordan-smith-2025-03-22",
    title: "Plated Dinner — Jordan Smith — March 22, 2025",
    purchase_url: "https://example.com/products/plated-dinner-jordan-smith-2025-03-22",
  },
  purchasedTickets: 8,
  totalPurchasedPrice: "1199.92",
  tipAmount: 150,
  tipMethod: "Cash",
  chef: {
    name: "Chef John Doe",
    email: "support@example.com",
    phone: "(347) 695-4445",
  },
  requestReference: "CE-2025-001",
  receiptDate: "March 23, 2025",
  customNotes: undefined,
} satisfies ReceiptEmailProps
