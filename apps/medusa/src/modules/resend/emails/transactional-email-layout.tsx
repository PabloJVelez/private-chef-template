import type { ReactNode } from "react"
import {
  Text,
  Column,
  Container,
  Html,
  Row,
  Section,
  Head,
  Preview,
  Body,
  Link,
} from "@react-email/components"
import { layoutColors, layoutStyles } from "./transactional-email-layout-styles"

export type TransactionalEmailLayoutProps = {
  preview?: string
  brandName: string
  headerLabel: string
  billToContent: ReactNode
  metaContent: ReactNode
  children: ReactNode
  thankYouText: string
  customNotes?: string
  brandContact: {
    name: string
    email: string
    phone: string
  }
}

export function TransactionalEmailLayout({
  preview = "",
  brandName,
  headerLabel,
  billToContent,
  metaContent,
  children,
  thankYouText,
  customNotes,
  brandContact,
}: TransactionalEmailLayoutProps) {
  return (
    <Html style={layoutStyles.main}>
      <Head>{preview ? <Preview>{preview}</Preview> : null}</Head>
      <Body style={layoutStyles.body}>
        <Section style={layoutStyles.headerSection}>
          <Container>
            <Row>
              <Column style={{ width: "70%" }}>
                <Text style={layoutStyles.headerTitle}>{brandName}</Text>
              </Column>
              <Column align="right" style={{ width: "30%" }}>
                <Text style={layoutStyles.headerLabel}>{headerLabel}</Text>
              </Column>
            </Row>
          </Container>
        </Section>

        <Section style={layoutStyles.infoSection}>
          <Row>
            <Column style={{ width: "50%", verticalAlign: "top" }}>
              {billToContent}
            </Column>
            <Column align="right" style={{ width: "50%", verticalAlign: "top" }}>
              {metaContent}
            </Column>
          </Row>
        </Section>

        {children}

        <Section style={layoutStyles.thankYouSection}>
          <Text style={layoutStyles.thankYouText}>{thankYouText}</Text>
          {customNotes ? (
            <Text style={layoutStyles.thankYouNotes}>{customNotes}</Text>
          ) : null}
        </Section>

        <Section style={layoutStyles.footerSection}>
          <Text style={layoutStyles.footerText}>
            Questions? Contact {brandContact.name} —{" "}
            <Link href={`mailto:${brandContact.email}`} style={{ color: layoutColors.accentGreen }}>
              {brandContact.email}
            </Link>
            {brandContact.phone ? ` | ${brandContact.phone}` : ""}
          </Text>
          <Text style={layoutStyles.footerCopyright}>
            © {new Date().getFullYear()} {brandContact.name}. All rights reserved.
          </Text>
        </Section>
      </Body>
    </Html>
  )
}
