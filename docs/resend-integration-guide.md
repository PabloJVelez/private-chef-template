# Integrate Medusa with Resend (Email Notifications)

## Overview

This guide will help you integrate Medusa with Resend for email notifications, replacing the current SendGrid implementation. Resend provides a modern, developer-friendly email service with excellent deliverability and React-based email templates.

## Prerequisites

- Node.js 26.13.1 LTS
- Medusa v2 application (already set up)
- Resend account (create at [resend.com](https://resend.com))

## Step 1: Install Resend Dependencies

```bash
cd apps/medusa
yarn add resend @react-email/components
yarn add -D react-email
```

## Step 2: Create Resend Module Provider

### Create Module Directory Structure

```
src/modules/resend/
├── index.ts
├── service.ts
└── emails/
    ├── order-placed.tsx
    ├── chef-event-requested.tsx
    ├── chef-event-accepted.tsx
    └── chef-event-rejected.tsx
```

### Create Service (`src/modules/resend/service.ts`)

```typescript
import { 
  AbstractNotificationProviderService,
  MedusaError,
} from "@medusajs/framework/utils"
import { 
  Logger,
  ProviderSendNotificationDTO, 
  ProviderSendNotificationResultsDTO,
} from "@medusajs/framework/types"
import { Resend, CreateEmailOptions } from "resend"

type ResendOptions = {
  api_key: string
  from: string
  html_templates?: Record<string, {
    subject?: string
    content: string
  }>
}

type InjectedDependencies = {
  logger: Logger
}

enum Templates {
  ORDER_PLACED = "order-placed",
  CHEF_EVENT_REQUESTED = "chef-event-requested",
  CHEF_EVENT_ACCEPTED = "chef-event-accepted",
  CHEF_EVENT_REJECTED = "chef-event-rejected",
}

const templates: {[key in Templates]?: (props: unknown) => React.ReactNode} = {
  [Templates.ORDER_PLACED]: orderPlacedEmail,
  [Templates.CHEF_EVENT_REQUESTED]: chefEventRequestedEmail,
  [Templates.CHEF_EVENT_ACCEPTED]: chefEventAcceptedEmail,
  [Templates.CHEF_EVENT_REJECTED]: chefEventRejectedEmail,
}

class ResendNotificationProviderService extends AbstractNotificationProviderService {
  static identifier = "notification-resend"
  private resendClient: Resend
  private options: ResendOptions
  private logger: Logger

  constructor(
    { logger }: InjectedDependencies, 
    options: ResendOptions
  ) {
    super()
    this.resendClient = new Resend(options.api_key)
    this.options = options
    this.logger = logger
  }

  static validateOptions(options: Record<any, any>) {
    if (!options.api_key) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Option `api_key` is required in the provider's options."
      )
    }
    if (!options.from) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Option `from` is required in the provider's options."
      )
    }
  }

  getTemplate(template: Templates) {
    if (this.options.html_templates?.[template]) {
      return this.options.html_templates[template].content
    }
    const allowedTemplates = Object.keys(templates)

    if (!allowedTemplates.includes(template)) {
      return null
    }

    return templates[template]
  }

  getTemplateSubject(template: Templates) {
    if (this.options.html_templates?.[template]?.subject) {
      return this.options.html_templates[template].subject
    }
    switch(template) {
      case Templates.ORDER_PLACED:
        return "Order Confirmation"
      case Templates.CHEF_EVENT_REQUESTED:
        return "Chef Event Request Confirmation"
      case Templates.CHEF_EVENT_ACCEPTED:
        return "Booking Confirmed! 🎉"
      case Templates.CHEF_EVENT_REJECTED:
        return "Chef Event Update"
      default:
        return "New Email"
    }
  }

  async send(
    notification: ProviderSendNotificationDTO
  ): Promise<ProviderSendNotificationResultsDTO> {
    const template = this.getTemplate(notification.template as Templates)

    if (!template) {
      this.logger.error(`Couldn't find an email template for ${notification.template}. The valid options are ${Object.values(Templates)}`)
      return {}
    }

    const commonOptions = {
      from: this.options.from,
      to: [notification.to],
      subject: this.getTemplateSubject(notification.template as Templates),
    }

    let emailOptions: CreateEmailOptions
    if (typeof template === "string") {
      emailOptions = {
        ...commonOptions,
        html: template,
      }
    } else {
      emailOptions = {
        ...commonOptions,
        react: template(notification.data),
      }
    }

    const { data, error } = await this.resendClient.emails.send(emailOptions)

    if (error || !data) {
      if (error) {
        this.logger.error("Failed to send email", error)
      } else {
        this.logger.error("Failed to send email: unknown error")
      }
      return {}
    }

    return { id: data.id }
  }
}

export default ResendNotificationProviderService
```

### Create Module Export (`src/modules/resend/index.ts`)

```typescript
import { 
  ModuleProvider, 
  Modules,
} from "@medusajs/framework/utils"
import ResendNotificationProviderService from "./service"

export default ModuleProvider(Modules.NOTIFICATION, {
  services: [ResendNotificationProviderService],
})
```

## Step 3: Create Enhanced Email Templates

### Chef Event Requested Template (`src/modules/resend/emails/chef-event-requested.tsx`)

```typescript
import { 
  Text, 
  Column, 
  Container, 
  Heading, 
  Html, 
  Row, 
  Section, 
  Tailwind, 
  Head, 
  Preview, 
  Body, 
  Link, 
  Button,
} from "@react-email/components"

type ChefEventRequestedEmailProps = {
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

function ChefEventRequestedEmailComponent({ 
  customer, 
  booking, 
  event, 
  requestReference, 
  chefContact,
  emailType 
}: ChefEventRequestedEmailProps) {
  const isCustomerEmail = emailType === "customer_confirmation"
  
  return (
    <Tailwind>
      <Html className="font-sans bg-gray-100">
        <Head />
        <Preview>
          {isCustomerEmail 
            ? "Your chef event request has been received" 
            : "New chef event request received"
          }
        </Preview>
        <Body className="bg-white my-10 mx-auto w-full max-w-2xl">
          {/* Header */}
          <Section className="bg-gradient-to-r from-orange-500 to-red-600 text-white px-6 py-4">
            <Container>
              <Row>
                <Column>
                  <Heading className="text-2xl font-bold m-0">
                    🍳 Chef Elena Rodriguez
                  </Heading>
                  <Text className="text-orange-100 m-0">
                    Private Chef & Culinary Experiences
                  </Text>
                </Column>
              </Row>
            </Container>
          </Section>

          {/* Main Content */}
          <Container className="p-6">
            {isCustomerEmail ? (
              <>
                <Heading className="text-2xl font-bold text-gray-800 mb-4">
                  Thank you for your event request!
                </Heading>
                <Text className="text-gray-600 mb-6">
                  Hi {customer.first_name}, we've received your request for a private chef experience. 
                  We'll review your details and get back to you within 24-48 hours.
                </Text>
              </>
            ) : (
              <>
                <Heading className="text-2xl font-bold text-gray-800 mb-4">
                  New Event Request Received
                </Heading>
                <Text className="text-gray-600 mb-6">
                  You have a new chef event request that requires your review.
                </Text>
              </>
            )}

            {/* Event Details */}
            <Section className="bg-gray-50 rounded-lg p-6 mb-6">
              <Heading className="text-lg font-semibold text-gray-800 mb-4">
                Event Details
              </Heading>
              
              <Row className="mb-3">
                <Column className="w-1/3">
                  <Text className="font-semibold text-gray-700">Date & Time</Text>
                </Column>
                <Column className="w-2/3">
                  <Text className="text-gray-600">{booking.date} at {booking.time}</Text>
                </Column>
              </Row>

              <Row className="mb-3">
                <Column className="w-1/3">
                  <Text className="font-semibold text-gray-700">Event Type</Text>
                </Column>
                <Column className="w-2/3">
                  <Text className="text-gray-600">{booking.event_type}</Text>
                </Column>
              </Row>

              <Row className="mb-3">
                <Column className="w-1/3">
                  <Text className="font-semibold text-gray-700">Party Size</Text>
                </Column>
                <Column className="w-2/3">
                  <Text className="text-gray-600">{booking.party_size} guests</Text>
                </Column>
              </Row>

              <Row className="mb-3">
                <Column className="w-1/3">
                  <Text className="font-semibold text-gray-700">Location</Text>
                </Column>
                <Column className="w-2/3">
                  <Text className="text-gray-600">
                    {booking.location_type} - {booking.location_address}
                  </Text>
                </Column>
              </Row>

              <Row className="mb-3">
                <Column className="w-1/3">
                  <Text className="font-semibold text-gray-700">Menu</Text>
                </Column>
                <Column className="w-2/3">
                  <Text className="text-gray-600">{booking.menu}</Text>
                </Column>
              </Row>

              {booking.notes && (
                <Row className="mb-3">
                  <Column className="w-1/3">
                    <Text className="font-semibold text-gray-700">Special Notes</Text>
                  </Column>
                  <Column className="w-2/3">
                    <Text className="text-gray-600">{booking.notes}</Text>
                  </Column>
                </Row>
              )}

              <Row className="mb-3">
                <Column className="w-1/3">
                  <Text className="font-semibold text-gray-700">Total Price</Text>
                </Column>
                <Column className="w-2/3">
                  <Text className="text-gray-600 font-bold">${event.total_price}</Text>
                </Column>
              </Row>
            </Section>

            {/* Customer Information */}
            <Section className="bg-blue-50 rounded-lg p-6 mb-6">
              <Heading className="text-lg font-semibold text-gray-800 mb-4">
                Customer Information
              </Heading>
              
              <Row className="mb-2">
                <Text className="text-gray-600">
                  <strong>Name:</strong> {customer.first_name} {customer.last_name}
                </Text>
              </Row>
              
              <Row className="mb-2">
                <Text className="text-gray-600">
                  <strong>Email:</strong> {customer.email}
                </Text>
              </Row>
              
              <Row className="mb-2">
                <Text className="text-gray-600">
                  <strong>Phone:</strong> {customer.phone}
                </Text>
              </Row>
            </Section>

            {/* Reference Number */}
            <Section className="text-center mb-6">
              <Text className="text-sm text-gray-500">
                Reference: <strong>{requestReference}</strong>
              </Text>
            </Section>

            {/* Action Buttons for Chef */}
            {!isCustomerEmail && (
              <Section className="text-center mb-6">
                <Row>
                  <Column>
                    <Button 
                      href={`${process.env.ADMIN_BACKEND_URL}/admin/events/${requestReference}/accept`}
                      className="bg-green-600 text-white px-6 py-3 rounded-lg font-semibold mr-4"
                    >
                      Accept Request
                    </Button>
                    <Button 
                      href={`${process.env.ADMIN_BACKEND_URL}/admin/events/${requestReference}/reject`}
                      className="bg-red-600 text-white px-6 py-3 rounded-lg font-semibold"
                    >
                      Decline Request
                    </Button>
                  </Column>
                </Row>
              </Section>
            )}

            {/* Next Steps for Customer */}
            {isCustomerEmail && (
              <Section className="bg-green-50 rounded-lg p-6 mb-6">
                <Heading className="text-lg font-semibold text-gray-800 mb-4">
                  What happens next?
                </Heading>
                <Text className="text-gray-600 mb-3">
                  1. We'll review your request within 24-48 hours
                </Text>
                <Text className="text-gray-600 mb-3">
                  2. You'll receive an email with our decision
                </Text>
                <Text className="text-gray-600 mb-3">
                  3. If accepted, you'll get a secure payment link
                </Text>
                <Text className="text-gray-600">
                  4. We'll confirm all details before your event
                </Text>
              </Section>
            )}
          </Container>

          {/* Footer */}
          <Section className="bg-gray-50 p-6">
            <Container>
              <Row>
                <Column>
                  <Text className="text-center text-gray-500 text-sm mb-4">
                    Questions? Contact us at {chefContact.email} or {chefContact.phone}
                  </Text>
                  <Text className="text-center text-gray-400 text-xs">
                    © {new Date().getFullYear()} Chef Elena Rodriguez. All rights reserved.
                  </Text>
                </Column>
              </Row>
            </Container>
          </Section>
        </Body>
      </Html>
    </Tailwind>
  )
}

export const chefEventRequestedEmail = (props: ChefEventRequestedEmailProps) => (
  <ChefEventRequestedEmailComponent {...props} />
)
```

### Chef Event Accepted Template (`src/modules/resend/emails/chef-event-accepted.tsx`)

```typescript
import { 
  Text, 
  Column, 
  Container, 
  Heading, 
  Html, 
  Row, 
  Section, 
  Tailwind, 
  Head, 
  Preview, 
  Body, 
  Link, 
  Button,
} from "@react-email/components"

type ChefEventAcceptedEmailProps = {
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

function ChefEventAcceptedEmailComponent({ 
  customer, 
  booking, 
  event, 
  product, 
  chef, 
  requestReference, 
  acceptanceDate,
  chefNotes 
}: ChefEventAcceptedEmailProps) {
  
  return (
    <Tailwind>
      <Html className="font-sans bg-gray-100">
        <Head />
        <Preview>Great news! Your chef event has been accepted</Preview>
        <Body className="bg-white my-10 mx-auto w-full max-w-2xl">
          {/* Header */}
          <Section className="bg-gradient-to-r from-green-500 to-green-600 text-white px-6 py-4">
            <Container>
              <Row>
                <Column>
                  <Heading className="text-2xl font-bold m-0">
                    🎉 Booking Confirmed!
                  </Heading>
                  <Text className="text-green-100 m-0">
                    Your chef event request has been confirmed
                  </Text>
                </Column>
              </Row>
            </Container>
          </Section>

          {/* Main Content */}
          <Container className="p-6">
            <Heading className="text-2xl font-bold text-gray-800 mb-4">
              Great News!
            </Heading>
            <Text className="text-gray-600 mb-6">
              Dear {customer.first_name},
            </Text>
            <Text className="text-gray-600 mb-6">
              Your chef has confirmed your booking! Here are your event details:
            </Text>

            {/* Event Details */}
            <Section className="bg-gray-50 rounded-lg p-6 mb-6">
              <Heading className="text-lg font-semibold text-gray-800 mb-4">
                Event Details
              </Heading>
              
              <Row className="mb-3">
                <Column className="w-1/3">
                  <Text className="font-semibold text-gray-700">Date:</Text>
                </Column>
                <Column className="w-2/3">
                  <Text className="text-gray-600">{booking.date}</Text>
                </Column>
              </Row>

              <Row className="mb-3">
                <Column className="w-1/3">
                  <Text className="font-semibold text-gray-700">Time:</Text>
                </Column>
                <Column className="w-2/3">
                  <Text className="text-gray-600">{booking.time}</Text>
                </Column>
              </Row>

              <Row className="mb-3">
                <Column className="w-1/3">
                  <Text className="font-semibold text-gray-700">Menu:</Text>
                </Column>
                <Column className="w-2/3">
                  <Text className="text-gray-600">{booking.menu}</Text>
                </Column>
              </Row>

              <Row className="mb-3">
                <Column className="w-1/3">
                  <Text className="font-semibold text-gray-700">Event Type:</Text>
                </Column>
                <Column className="w-2/3">
                  <Text className="text-gray-600">{booking.event_type}</Text>
                </Column>
              </Row>

              <Row className="mb-3">
                <Column className="w-1/3">
                  <Text className="font-semibold text-gray-700">Location:</Text>
                </Column>
                <Column className="w-2/3">
                  <Text className="text-gray-600">{booking.location_type}</Text>
                </Column>
              </Row>

              <Row className="mb-3">
                <Column className="w-1/3">
                  <Text className="font-semibold text-gray-700">Address:</Text>
                </Column>
                <Column className="w-2/3">
                  <Text className="text-gray-600">{booking.location_address}</Text>
                </Column>
              </Row>

              <Row className="mb-3">
                <Column className="w-1/3">
                  <Text className="font-semibold text-gray-700">Party Size:</Text>
                </Column>
                <Column className="w-2/3">
                  <Text className="text-gray-600">{booking.party_size} guests</Text>
                </Column>
              </Row>
            </Section>

            {/* Payment Details */}
            <Section className="bg-green-50 rounded-lg p-6 mb-6">
              <Heading className="text-lg font-semibold text-gray-800 mb-4">
                Payment Details
              </Heading>
              
              <Row className="mb-3">
                <Column className="w-1/3">
                  <Text className="font-semibold text-gray-700">Total Price:</Text>
                </Column>
                <Column className="w-2/3">
                  <Text className="text-gray-600 font-bold">${event.total_price}</Text>
                </Column>
              </Row>

              <Row className="mb-3">
                <Column className="w-1/3">
                  <Text className="font-semibold text-gray-700">Deposit Required:</Text>
                </Column>
                <Column className="w-2/3">
                  <Text className="text-gray-600">${event.total_price}</Text>
                </Column>
              </Row>

              <Text className="text-gray-600 mt-4">
                To secure your booking, please pay the deposit within the next 24 hours.
              </Text>
            </Section>

            {/* Payment Button */}
            <Section className="text-center mb-6">
              <Button 
                href={product.purchase_url}
                className="bg-green-600 text-white px-8 py-4 rounded-lg font-semibold text-lg"
              >
                Pay Deposit Now
              </Button>
            </Section>

            {/* What's Next */}
            <Section className="bg-blue-50 rounded-lg p-6 mb-6">
              <Heading className="text-lg font-semibold text-gray-800 mb-4">
                What's Next?
              </Heading>
              <Text className="text-gray-600 mb-3">
                1. Pay your deposit to secure the booking
              </Text>
              <Text className="text-gray-600 mb-3">
                2. Our chef will contact you to discuss menu details
              </Text>
              <Text className="text-gray-600">
                3. We'll send you a reminder 48 hours before the event
              </Text>
            </Section>

            {/* Reference Number */}
            <Section className="text-center mb-6">
              <Text className="text-sm text-gray-500">
                Reference: <strong>{requestReference}</strong>
              </Text>
              <Text className="text-sm text-gray-500">
                Accepted on: {acceptanceDate}
              </Text>
            </Section>
          </Container>

          {/* Footer */}
          <Section className="bg-gray-50 p-6">
            <Container>
              <Row>
                <Column>
                  <Text className="text-center text-gray-500 text-sm mb-4">
                    If you have any questions, please don't hesitate to contact us at {chef.email}
                  </Text>
                  <Text className="text-center text-gray-400 text-xs">
                    © {new Date().getFullYear()} Chef Elena Rodriguez. All rights reserved.
                  </Text>
                </Column>
              </Row>
            </Container>
          </Section>
        </Body>
      </Html>
    </Tailwind>
  )
}

export const chefEventAcceptedEmail = (props: ChefEventAcceptedEmailProps) => (
  <ChefEventAcceptedEmailComponent {...props} />
)
```

## Step 4: Update Configuration

### Update `medusa-config.ts`

Replace the SendGrid configuration with Resend:

```typescript
const notificationModule = {
  resolve: "@medusajs/medusa/notification",
  options: {
    providers: [
      {
        resolve: "./src/modules/resend",
        id: "resend",
        options: {
          channels: ["email"],
          api_key: process.env.RESEND_API_KEY,
          from: process.env.RESEND_FROM_EMAIL,
        },
      },
    ],
  },
};
```

### Update Environment Variables

Add to your `.env` file:

```bash
RESEND_API_KEY=your_resend_api_key_here
RESEND_FROM_EMAIL=onboarding@resend.dev
```

## Step 5: Update Email Templates in Service

Update the templates import in `src/modules/resend/service.ts`:

```typescript
import { orderPlacedEmail } from "./emails/order-placed"
import { chefEventRequestedEmail } from "./emails/chef-event-requested"
import { chefEventAcceptedEmail } from "./emails/chef-event-accepted"
import { chefEventRejectedEmail } from "./emails/chef-event-rejected"

const templates: {[key in Templates]?: (props: unknown) => React.ReactNode} = {
  [Templates.ORDER_PLACED]: orderPlacedEmail,
  [Templates.CHEF_EVENT_REQUESTED]: chefEventRequestedEmail,
  [Templates.CHEF_EVENT_ACCEPTED]: chefEventAcceptedEmail,
  [Templates.CHEF_EVENT_REJECTED]: chefEventRejectedEmail,
}
```

## Step 6: Update Subscribers

Update your existing subscribers to use the new template names:

### Update `src/subscribers/chef-event-requested.ts`

```typescript
// Send confirmation email to customer
await notificationService.createNotifications({
  to: chefEvent.email,
  channel: "email",
  template: "chef-event-requested", // Updated template name
  data: {
    customer: { /* customer data */ },
    booking: { /* booking data */ },
    event: { /* event data */ },
    requestReference: chefEvent.id.slice(0, 8).toUpperCase(),
    chefContact: { /* chef contact info */ },
    emailType: "customer_confirmation"
  }
} as CreateNotificationDTO)
```

### Update `src/subscribers/chef-event-accepted.ts`

```typescript
// Send acceptance email to customer
await notificationService.createNotifications({
  to: chefEvent.email,
  channel: "email",
  template: "chef-event-accepted", // Updated template name
  data: {
    customer: { /* customer data */ },
    booking: { /* booking data */ },
    event: { /* event data */ },
    product: { /* product data */ },
    chef: { /* chef data */ },
    requestReference: chefEvent.id.slice(0, 8).toUpperCase(),
    acceptanceDate: DateTime.now().toFormat('LLL d, yyyy'),
    chefNotes: chefEvent.chefNotes || "Looking forward to creating an amazing experience for you!",
    emailType: "customer_acceptance"
  }
} as CreateNotificationDTO)
```

### Update `src/subscribers/chef-event-rejected.ts`

```typescript
// Send rejection email to customer
await notificationService.createNotifications({
  to: chefEvent.email,
  channel: "email",
  template: "chef-event-rejected", // Updated template name
  data: {
    customer: { /* customer data */ },
    booking: { /* booking data */ },
    rejection: { /* rejection data */ },
    chef: { /* chef data */ },
    requestReference: chefEvent.id.slice(0, 8).toUpperCase(),
    rejectionDate: DateTime.now().toFormat('LLL d, yyyy'),
    emailType: "customer_rejection"
  }
} as CreateNotificationDTO)
```

## Step 7: Test Email Templates

Add a development script to test email templates:

```json
// package.json
{
  "scripts": {
    "dev:email": "email dev --dir ./src/modules/resend/emails"
  }
}
```

Test your templates:

```bash
yarn dev:email
```

## Step 8: Migration Checklist

### Before Migration
- [ ] Backup current SendGrid configuration
- [ ] Set up Resend account and domain
- [ ] Get Resend API key
- [ ] Test Resend with development domain

### During Migration
- [ ] Install Resend dependencies with yarn
- [ ] Create Resend module provider
- [ ] Create enhanced email templates
- [ ] Update configuration
- [ ] Update environment variables
- [ ] Update subscribers

### After Migration
- [ ] Test order confirmation emails
- [ ] Test chef event notification emails
- [ ] Verify email delivery
- [ ] Monitor email analytics in Resend dashboard
- [ ] Remove SendGrid dependencies

## Step 9: Environment Setup

### Development Environment
```bash
RESEND_API_KEY=re_1234567890abcdef
RESEND_FROM_EMAIL=onboarding@resend.dev
```

### Production Environment
```bash
RESEND_API_KEY=re_production_key_here
RESEND_FROM_EMAIL=hello@yourdomain.com
```

## Benefits of Resend Integration

1. **Modern API**: Clean, RESTful API with excellent TypeScript support
2. **React Email Templates**: Use React components for email templates
3. **Better Deliverability**: Advanced email infrastructure
4. **Developer Experience**: Intuitive dashboard and documentation
5. **Analytics**: Built-in email analytics and tracking
6. **Webhooks**: Real-time delivery and bounce notifications

## Troubleshooting

### Common Issues

1. **API Key Issues**: Ensure your Resend API key is correct and has proper permissions
2. **Domain Verification**: Make sure your sending domain is verified in Resend
3. **Template Errors**: Check that all email templates are properly exported
4. **Environment Variables**: Verify all environment variables are set correctly

### Debug Steps

1. Check Resend dashboard for delivery status
2. Review application logs for error messages
3. Test email templates locally with React Email
4. Verify module registration in Medusa configuration

## Next Steps

After successful integration:

1. **Customize Templates**: Brand your email templates with your logo and colors
2. **Add Analytics**: Implement email tracking and analytics
3. **Set Up Webhooks**: Handle delivery and bounce notifications
4. **Optimize Deliverability**: Configure SPF, DKIM, and DMARC records
5. **Scale**: Monitor usage and upgrade your Resend plan as needed

This implementation provides a complete migration path from SendGrid to Resend while maintaining all existing email functionality in your Medusa application. 