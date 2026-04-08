import { Text, Column, Row, Section, Img } from "@react-email/components"
import { BigNumberValue, CustomerDTO, OrderDTO } from "@medusajs/framework/types"
import { TransactionalEmailLayout } from "./transactional-email-layout"
import { layoutStyles } from "./transactional-email-layout-styles"

export type OrderPlacedEmailProps = {
  order: OrderDTO & {
    customer: CustomerDTO
  }
  email_banner?: {
    body: string
    title: string
    url: string
  }
}

const STORE_BRAND = {
  name: "Chef John Doe",
  email: "support@example.com",
  phone: "(347) 695-4445",
}

function OrderPlacedEmailComponent({ order, email_banner }: OrderPlacedEmailProps) {
  const formatter = new Intl.NumberFormat([], {
    style: "currency",
    currencyDisplay: "narrowSymbol",
    currency: order.currency_code,
  })

  const formatPrice = (price: BigNumberValue) => {
    if (typeof price === "number") {
      return formatter.format(price)
    }
    if (typeof price === "string") {
      return formatter.format(parseFloat(price))
    }
    return price?.toString() ?? ""
  }

  const firstName =
    order.customer?.first_name || order.shipping_address?.first_name || "there"

  const billToContent = (
    <>
      <Text style={layoutStyles.billToLabel}>BILL TO</Text>
      <Text style={layoutStyles.billToText}>
        {order.customer?.first_name} {order.customer?.last_name}
      </Text>
      {order.customer?.email ? (
        <Text style={{ ...layoutStyles.metaText, margin: "0.25rem 0 0 0" }}>
          {order.customer.email}
        </Text>
      ) : null}
    </>
  )

  const metaContent = (
    <>
      <Text style={layoutStyles.metaText}>Order #{order.display_id}</Text>
      <Text style={{ ...layoutStyles.metaText, margin: 0 }}>Status: CONFIRMED</Text>
    </>
  )

  const bodyContent = (
    <>
      {email_banner && "title" in email_banner ? (
        <Section style={layoutStyles.lineItemsSection}>
          <Text style={{ ...layoutStyles.lineItemDescription, fontWeight: 700 }}>
            {email_banner.title}
          </Text>
          <Text style={layoutStyles.lineItemSubtext}>{email_banner.body}</Text>
        </Section>
      ) : null}

      <Section style={layoutStyles.lineItemsSection}>
        <Text style={layoutStyles.lineItemDescription}>
          Thank you for your order, {firstName}. We are processing it now.
        </Text>
      </Section>

      <Section style={layoutStyles.lineItemsSection}>
        <Text style={{ ...layoutStyles.lineItemDescription, fontWeight: 700, marginBottom: "0.75rem" }}>
          Items
        </Text>
        {order.items?.map((item) => (
          <Section key={item.id} style={{ marginBottom: "1rem" }}>
            <Row>
              {item.thumbnail ? (
                <Column style={{ width: "28%", verticalAlign: "top" }}>
                  <Img
                    src={item.thumbnail}
                    alt={item.product_title ?? ""}
                    width="100%"
                    style={{ borderRadius: "6px" }}
                  />
                </Column>
              ) : null}
              <Column style={{ width: item.thumbnail ? "72%" : "100%", paddingLeft: item.thumbnail ? "12px" : 0 }}>
                <Text style={layoutStyles.lineItemDescription}>{item.product_title}</Text>
                <Text style={layoutStyles.lineItemSubtext}>{item.variant_title}</Text>
                <Text style={{ ...layoutStyles.lineItemDescription, marginTop: "0.25rem" }}>
                  {formatPrice(item.total)}
                </Text>
              </Column>
            </Row>
          </Section>
        ))}
      </Section>

      <Section style={layoutStyles.totalsSection}>
        <Row>
          <Column style={{ width: "50%" }}>
            <Text style={layoutStyles.metaText}>Subtotal</Text>
          </Column>
          <Column align="right" style={{ width: "50%" }}>
            <Text style={layoutStyles.lineItemDescription}>{formatPrice(order.item_total)}</Text>
          </Column>
        </Row>
        {order.shipping_methods?.map((method) => (
          <Row key={method.id} style={{ marginTop: "0.25rem" }}>
            <Column style={{ width: "50%" }}>
              <Text style={layoutStyles.metaText}>{method.name}</Text>
            </Column>
            <Column align="right" style={{ width: "50%" }}>
              <Text style={layoutStyles.lineItemDescription}>{formatPrice(method.total)}</Text>
            </Column>
          </Row>
        ))}
        <Row style={{ marginTop: "0.25rem" }}>
          <Column style={{ width: "50%" }}>
            <Text style={layoutStyles.metaText}>Tax</Text>
          </Column>
          <Column align="right" style={{ width: "50%" }}>
            <Text style={layoutStyles.lineItemDescription}>
              {formatPrice(order.tax_total ?? 0)}
            </Text>
          </Column>
        </Row>
        <Row style={layoutStyles.totalRow}>
          <Column style={{ width: "50%" }}>
            <Text style={layoutStyles.totalLabel}>Total</Text>
          </Column>
          <Column align="right" style={{ width: "50%" }}>
            <Text style={layoutStyles.totalLabel}>{formatPrice(order.total)}</Text>
          </Column>
        </Row>
      </Section>

      <Section style={layoutStyles.lineItemsSection}>
        <Text style={layoutStyles.metaText}>Order reference: {order.id}</Text>
      </Section>
    </>
  )

  return (
    <TransactionalEmailLayout
      preview="Thank you for your order"
      brandName={STORE_BRAND.name}
      headerLabel="ORDER CONFIRMATION"
      billToContent={billToContent}
      metaContent={metaContent}
      thankYouText="We will notify you when your order updates."
      brandContact={STORE_BRAND}
    >
      {bodyContent}
    </TransactionalEmailLayout>
  )
}

const previewOrder = {
  id: "order_preview_01",
  display_id: 10042,
  currency_code: "usd",
  customer: {
    id: "cus_preview",
    first_name: "Casey",
    last_name: "Morgan",
    email: "casey@example.com",
  },
  shipping_address: {
    first_name: "Casey",
    last_name: "Morgan",
  },
  items: [
    {
      id: "item_1",
      thumbnail: "https://via.placeholder.com/120",
      product_title: "Chef tasting experience",
      variant_title: "Per guest",
      total: 19900,
    },
    {
      id: "item_2",
      thumbnail: "",
      product_title: "Wine pairing",
      variant_title: "Add-on",
      total: 4800,
    },
  ],
  item_total: 24700,
  shipping_methods: [
    {
      id: "sm_1",
      name: "Standard shipping",
      total: 1200,
    },
  ],
  tax_total: 1980,
  total: 27880,
} as OrderPlacedEmailProps["order"]

OrderPlacedEmailComponent.PreviewProps = {
  order: previewOrder,
  email_banner: {
    title: "Spring specials",
    body: "Enjoy 10% off your next booking.",
    url: "https://example.com/promo",
  },
} satisfies OrderPlacedEmailProps

export default OrderPlacedEmailComponent

export const orderPlacedEmail = (props: OrderPlacedEmailProps) => (
  <OrderPlacedEmailComponent {...props} />
)
