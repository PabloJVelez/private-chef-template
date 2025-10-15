# Chef Event Email Management Implementation Plan

## Overview

This implementation plan adds advanced email management features to the chef event system, allowing chefs to control email notifications and resend event details to customers or additional recipients.

## Business Requirements

### Current State Analysis

**✅ Already Implemented:**
- Chef event lifecycle management (pending → confirmed/cancelled)
- Basic email notifications on event acceptance/rejection
- Admin interface for event management
- Email templates for customer notifications
- Resend email service integration

**🎯 New Requirements:**
1. **Email Opt-in Control**: Checkbox for chef to control whether acceptance emails are sent
2. **Event Detail Resend**: Tools to resend event details to host or custom email addresses
3. **Email Management Interface**: Enhanced admin interface for email operations
4. **Email History Tracking**: Track sent emails and their status

## Implementation Phases

---

## Phase 1: Database Schema Updates ✅ PLANNED

### 1.1 Chef Event Model Extensions

**File: `apps/medusa/src/modules/chef-event/models/chef-event.ts`**

Add new fields to track email preferences and history:

```typescript
export const ChefEvent = model.define("chef_event", {
  // ... existing fields ...
  
  // Email management fields
  sendAcceptanceEmail: model.boolean().default(true), // Chef preference for sending acceptance emails
  emailHistory: model.json().nullable(), // Track sent emails with timestamps and recipients
  lastEmailSentAt: model.dateTime().nullable(), // Last email activity timestamp
  customEmailRecipients: model.json().nullable(), // Additional email recipients for resends
})
```

### 1.2 Database Migration

**File: `apps/medusa/src/modules/chef-event/migrations/add-email-management-fields.ts`**

```typescript
import { Migration } from "@mikro-orm/migrations"

export class AddEmailManagementFields20241201000000 extends Migration {
  async up(): Promise<void> {
    this.addSql(`
      ALTER TABLE "chef_event" 
      ADD COLUMN "send_acceptance_email" boolean DEFAULT true,
      ADD COLUMN "email_history" jsonb,
      ADD COLUMN "last_email_sent_at" timestamptz,
      ADD COLUMN "custom_email_recipients" jsonb;
    `)
  }

  async down(): Promise<void> {
    this.addSql(`
      ALTER TABLE "chef_event"
      DROP COLUMN "send_acceptance_email",
      DROP COLUMN "email_history", 
      DROP COLUMN "last_email_sent_at",
      DROP COLUMN "custom_email_recipients";
    `)
  }
}
```

---

## Phase 2: Enhanced Admin Interface ✅ PLANNED

### 2.1 Updated Accept Event Modal

**File: `apps/medusa/src/admin/routes/chef-events/[id]/page.tsx`**

Enhance the acceptance modal to include email control:

```typescript
// Add state for email preferences
const [sendAcceptanceEmail, setSendAcceptanceEmail] = useState(true)

// Updated Accept Event Modal
{showAcceptModal && (
  <FocusModal open onOpenChange={setShowAcceptModal}>
    <FocusModal.Content>
      <FocusModal.Header>
        <FocusModal.Title>Accept Event</FocusModal.Title>
      </FocusModal.Header>
      <FocusModal.Body>
        <div className="space-y-4">
          <p>This will accept the event and create a product for ticket sales.</p>
          
          {/* Email Notification Control */}
          <div className="flex items-center space-x-2">
            <Checkbox
              id="send-acceptance-email"
              checked={sendAcceptanceEmail}
              onCheckedChange={setSendAcceptanceEmail}
            />
            <Label htmlFor="send-acceptance-email">
              Send acceptance email to customer
            </Label>
          </div>
          
          <div>
            <Label htmlFor="chef-notes">Chef Notes (Optional)</Label>
            <Textarea
              id="chef-notes"
              placeholder="Add any notes about this acceptance..."
              value={chefNotes}
              onChange={(e) => setChefNotes(e.target.value)}
            />
          </div>
          
          {/* Action Buttons */}
          <div className="flex justify-end space-x-2">
            <Button variant="secondary" onClick={() => setShowAcceptModal(false)}>
              Cancel
            </Button>
            <Button 
              variant="primary"
              onClick={handleAcceptEvent}
              disabled={acceptChefEvent.isPending}
            >
              {acceptChefEvent.isPending ? "Accepting..." : "Accept Event"}
            </Button>
          </div>
        </div>
      </FocusModal.Body>
    </FocusModal.Content>
  </FocusModal>
)}
```

### 2.2 Email Management Section

Add a new section to the event detail page for email operations:

```typescript
// Add after MenuDetails component
{isConfirmed && (
  <EmailManagementSection 
    chefEvent={chefEvent}
    onEmailSent={(emailData) => {
      // Refresh event data to show updated email history
      refetch()
    }}
  />
)}
```

### 2.3 Email Management Component

**File: `apps/medusa/src/admin/routes/chef-events/components/EmailManagementSection.tsx`**

```typescript
import { useState } from "react"
import { Card, Button, Label, Input, Textarea, Badge, FocusModal } from "@medusajs/ui"
import { useAdminResendEventEmailMutation } from "../../../hooks/chef-events"

interface EmailManagementSectionProps {
  chefEvent: any
  onEmailSent: (emailData: any) => void
}

export const EmailManagementSection = ({ chefEvent, onEmailSent }: EmailManagementSectionProps) => {
  const [showResendModal, setShowResendModal] = useState(false)
  const [customEmails, setCustomEmails] = useState("")
  const [emailNotes, setEmailNotes] = useState("")
  const [emailType, setEmailType] = useState<"host" | "custom">("host")
  
  const resendEmail = useAdminResendEventEmailMutation()

  const handleResendEmail = async () => {
    try {
      const recipients = emailType === "host" 
        ? [chefEvent.email]
        : customEmails.split(",").map(email => email.trim()).filter(Boolean)
      
      await resendEmail.mutateAsync({
        chefEventId: chefEvent.id,
        recipients,
        notes: emailNotes,
        emailType: "event_details_resend"
      })
      
      toast.success("Email Sent", {
        description: `Event details sent to ${recipients.length} recipient(s)`,
        duration: 3000,
      })
      
      setShowResendModal(false)
      setCustomEmails("")
      setEmailNotes("")
      onEmailSent({ recipients, sentAt: new Date() })
      
    } catch (error) {
      toast.error("Email Failed", {
        description: "Failed to send email. Please try again.",
        duration: 5000,
      })
    }
  }

  return (
    <Card className="p-6">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Email Management</h3>
          <Button 
            variant="secondary" 
            size="small"
            onClick={() => setShowResendModal(true)}
          >
            Resend Event Details
          </Button>
        </div>
        
        {/* Email History */}
        {chefEvent.emailHistory && chefEvent.emailHistory.length > 0 && (
          <div>
            <Label>Recent Email Activity</Label>
            <div className="mt-2 space-y-2">
              {chefEvent.emailHistory.slice(-3).map((email: any, index: number) => (
                <div key={index} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                  <div>
                    <span className="text-sm font-medium">{email.type}</span>
                    <span className="text-xs text-gray-500 ml-2">
                      to {email.recipients.join(", ")}
                    </span>
                  </div>
                  <Badge variant="secondary">
                    {new Date(email.sentAt).toLocaleDateString()}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        )}
        
        {/* Resend Modal */}
        {showResendModal && (
          <FocusModal open onOpenChange={setShowResendModal}>
            <FocusModal.Content>
              <FocusModal.Header>
                <FocusModal.Title>Resend Event Details</FocusModal.Title>
              </FocusModal.Header>
              <FocusModal.Body>
                <div className="space-y-4">
                  <p>Send event details and confirmation to recipients.</p>
                  
                  {/* Recipient Selection */}
                  <div>
                    <Label>Send to</Label>
                    <div className="mt-2 space-y-2">
                      <div className="flex items-center space-x-2">
                        <input
                          type="radio"
                          id="host-email"
                          name="email-type"
                          checked={emailType === "host"}
                          onChange={() => setEmailType("host")}
                        />
                        <Label htmlFor="host-email">
                          Host ({chefEvent.email})
                        </Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <input
                          type="radio"
                          id="custom-emails"
                          name="email-type"
                          checked={emailType === "custom"}
                          onChange={() => setEmailType("custom")}
                        />
                        <Label htmlFor="custom-emails">
                          Custom email addresses
                        </Label>
                      </div>
                    </div>
                  </div>
                  
                  {/* Custom Email Input */}
                  {emailType === "custom" && (
                    <div>
                      <Label htmlFor="custom-email-list">Email Addresses</Label>
                      <Input
                        id="custom-email-list"
                        placeholder="email1@example.com, email2@example.com"
                        value={customEmails}
                        onChange={(e) => setCustomEmails(e.target.value)}
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        Separate multiple emails with commas
                      </p>
                    </div>
                  )}
                  
                  {/* Additional Notes */}
                  <div>
                    <Label htmlFor="email-notes">Additional Notes (Optional)</Label>
                    <Textarea
                      id="email-notes"
                      placeholder="Add any additional notes for this email..."
                      value={emailNotes}
                      onChange={(e) => setEmailNotes(e.target.value)}
                    />
                  </div>
                  
                  {/* Action Buttons */}
                  <div className="flex justify-end space-x-2">
                    <Button variant="secondary" onClick={() => setShowResendModal(false)}>
                      Cancel
                    </Button>
                    <Button 
                      variant="primary"
                      onClick={handleResendEmail}
                      disabled={resendEmail.isPending || (emailType === "custom" && !customEmails.trim())}
                    >
                      {resendEmail.isPending ? "Sending..." : "Send Email"}
                    </Button>
                  </div>
                </div>
              </FocusModal.Body>
            </FocusModal.Content>
          </FocusModal>
        )}
      </div>
    </Card>
  )
}
```

---

## Phase 3: Backend API Enhancements ✅ PLANNED

### 3.1 Updated Accept Event API

**File: `apps/medusa/src/api/admin/chef-events/[id]/accept/route.ts`**

Update to handle email preferences:

```typescript
const acceptChefEventSchema = z.object({
  chefNotes: z.string().optional(),
  acceptedBy: z.string().optional(),
  sendAcceptanceEmail: z.boolean().default(true) // New field
})

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const { id } = req.params
  const validatedBody = acceptChefEventSchema.parse(req.body)
  
  try {
    const { result } = await acceptChefEventWorkflow(req.scope).run({
      input: {
        chefEventId: id,
        chefNotes: validatedBody.chefNotes,
        acceptedBy: validatedBody.acceptedBy || 'chef',
        sendAcceptanceEmail: validatedBody.sendAcceptanceEmail
      }
    })
    
    res.status(200).json({
      success: true,
      data: result
    })
  } catch (error) {
    // ... error handling
  }
}
```

### 3.2 New Resend Email API

**File: `apps/medusa/src/api/admin/chef-events/[id]/resend-email/route.ts`**

```typescript
import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "zod"
import { resendEventEmailWorkflow } from "../../../../../workflows/resend-event-email"

const resendEmailSchema = z.object({
  recipients: z.array(z.string().email()),
  notes: z.string().optional(),
  emailType: z.enum(["event_details_resend", "custom_message"]).default("event_details_resend")
})

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const { id } = req.params
  const validatedBody = resendEmailSchema.parse(req.body)
  
  try {
    const { result } = await resendEventEmailWorkflow(req.scope).run({
      input: {
        chefEventId: id,
        recipients: validatedBody.recipients,
        notes: validatedBody.notes,
        emailType: validatedBody.emailType
      }
    })
    
    res.status(200).json({
      success: true,
      data: result
    })
  } catch (error) {
    console.error("Error resending event email:", error)
    res.status(500).json({
      success: false,
      message: "Failed to resend event email",
      error: error instanceof Error ? error.message : "Unknown error"
    })
  }
}
```

---

## Phase 4: Workflow Updates ✅ PLANNED

### 4.1 Enhanced Accept Chef Event Workflow

**File: `apps/medusa/src/workflows/accept-chef-event.ts`**

Update to handle email preferences:

```typescript
type AcceptChefEventWorkflowInput = {
  chefEventId: string
  chefNotes?: string
  acceptedBy?: string
  sendAcceptanceEmail?: boolean // New field
}

const updateChefEventStep = createStep(
  "update-chef-event-step",
  async (input: AcceptChefEventWorkflowInput, { container }) => {
    // ... existing logic ...
    
    // Update chef event with email preference
    const updatedChefEvent = await chefEventModuleService.updateChefEvents({
      id: input.chefEventId,
      status: 'confirmed',
      acceptedAt: new Date(),
      acceptedBy: input.acceptedBy || 'chef',
      chefNotes: input.chefNotes,
      sendAcceptanceEmail: input.sendAcceptanceEmail ?? true
    })
    
    return new StepResponse(updatedChefEvent)
  }
)

const conditionalEmitEventStep = createStep(
  "conditional-emit-event-step", 
  async (input: { chefEvent: any; sendEmail: boolean }, { container }) => {
    // Only emit event if email should be sent
    if (input.sendEmail) {
      const eventBusModuleService = container.resolve(Modules.EVENT_BUS)
      await eventBusModuleService.emit("chef-event.accepted", {
        chefEventId: input.chefEvent.id
      })
    }
    
    return new StepResponse({ emailSent: input.sendEmail })
  }
)

export const acceptChefEventWorkflow = createWorkflow(
  "accept-chef-event-workflow",
  function (input: AcceptChefEventWorkflowInput) {
    const updatedChefEvent = updateChefEventStep(input)
    const productCreated = createEventProductStep(updatedChefEvent)
    const emailResult = conditionalEmitEventStep({
      chefEvent: updatedChefEvent,
      sendEmail: input.sendAcceptanceEmail ?? true
    })
    
    return new WorkflowResponse({
      chefEvent: updatedChefEvent,
      product: productCreated,
      emailSent: emailResult
    })
  }
)
```

### 4.2 New Resend Event Email Workflow

**File: `apps/medusa/src/workflows/resend-event-email.ts`**

```typescript
import { 
  createStep,
  createWorkflow,
  StepResponse,
  WorkflowResponse
} from "@medusajs/workflows-sdk"
import { CHEF_EVENT_MODULE } from "../modules/chef-event"
import { Modules } from "@medusajs/framework/utils"

type ResendEventEmailWorkflowInput = {
  chefEventId: string
  recipients: string[]
  notes?: string
  emailType: "event_details_resend" | "custom_message"
}

const updateEmailHistoryStep = createStep(
  "update-email-history-step",
  async (input: ResendEventEmailWorkflowInput, { container }) => {
    const chefEventModuleService = container.resolve(CHEF_EVENT_MODULE)
    
    // Get current chef event
    const chefEvent = await chefEventModuleService.retrieveChefEvent(input.chefEventId)
    
    // Update email history
    const currentHistory = chefEvent.emailHistory || []
    const newEmailEntry = {
      type: input.emailType,
      recipients: input.recipients,
      notes: input.notes,
      sentAt: new Date().toISOString(),
      sentBy: "chef_admin" // Could be dynamic based on user
    }
    
    const updatedChefEvent = await chefEventModuleService.updateChefEvents({
      id: input.chefEventId,
      emailHistory: [...currentHistory, newEmailEntry],
      lastEmailSentAt: new Date()
    })
    
    return new StepResponse(updatedChefEvent)
  }
)

const emitResendEmailEventStep = createStep(
  "emit-resend-email-event-step",
  async (input: ResendEventEmailWorkflowInput, { container }) => {
    const eventBusModuleService = container.resolve(Modules.EVENT_BUS)
    
    await eventBusModuleService.emit("chef-event.email-resend", {
      chefEventId: input.chefEventId,
      recipients: input.recipients,
      notes: input.notes,
      emailType: input.emailType
    })
    
    return new StepResponse({ emailEventEmitted: true })
  }
)

export const resendEventEmailWorkflow = createWorkflow(
  "resend-event-email-workflow",
  function (input: ResendEventEmailWorkflowInput) {
    const updatedChefEvent = updateEmailHistoryStep(input)
    const emailEvent = emitResendEmailEventStep(input)
    
    return new WorkflowResponse({
      chefEvent: updatedChefEvent,
      emailSent: emailEvent
    })
  }
)
```

---

## Phase 5: Email Templates & Subscribers ✅ PLANNED

### 5.1 New Event Details Resend Template

**File: `apps/medusa/src/modules/resend/emails/event-details-resend.tsx`**

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
  Button,
} from "@react-email/components"

type EventDetailsResendEmailProps = {
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
  customNotes?: string
  emailType: "event_details_resend"
}

function EventDetailsResendEmailComponent({ 
  customer, 
  booking, 
  event, 
  product, 
  chef, 
  requestReference,
  customNotes
}: EventDetailsResendEmailProps) {
  
  return (
    <Tailwind>
      <Html className="font-sans bg-gray-100">
        <Head />
        <Preview>Your chef event details and confirmation</Preview>
        <Body className="bg-white my-10 mx-auto w-full max-w-2xl">
          {/* Header */}
          <Section className="bg-gradient-to-r from-blue-500 to-blue-600 text-white px-6 py-4">
            <Container>
              <Row>
                <Column>
                  <Heading className="text-2xl font-bold m-0">
                    📧 Event Details Reminder
                  </Heading>
                  <Text className="text-blue-100 m-0">
                    Your confirmed chef event information
                  </Text>
                </Column>
              </Row>
            </Container>
          </Section>

          {/* Main Content */}
          <Container className="p-6">
            <Heading className="text-2xl font-bold text-gray-800 mb-4">
              Hi {customer.first_name}!
            </Heading>
            <Text className="text-gray-600 mb-6">
              Here are your confirmed event details. We're looking forward to creating an amazing culinary experience for you!
            </Text>

            {/* Custom Notes from Chef */}
            {customNotes && (
              <Section className="bg-blue-50 rounded-lg p-6 mb-6">
                <Heading className="text-lg font-semibold text-gray-800 mb-4">
                  Message from Chef Luis
                </Heading>
                <Text className="text-gray-600 italic">
                  "{customNotes}"
                </Text>
              </Section>
            )}

            {/* Event Details - Same as acceptance email */}
            <Section className="bg-gray-50 rounded-lg p-6 mb-6">
              <Heading className="text-lg font-semibold text-gray-800 mb-4">
                Your Event Details
              </Heading>
              
              {/* Event details rows - same structure as acceptance email */}
              {/* ... */}
            </Section>

            {/* Payment Link (if not fully paid) */}
            <Section className="bg-green-50 rounded-lg p-6 mb-6">
              <Heading className="text-lg font-semibold text-gray-800 mb-4">
                Event Access
              </Heading>
              <Text className="text-gray-600 mb-4">
                Access your event details and purchase additional tickets if needed.
              </Text>
              
              <Row className="text-center">
                <Column>
                  <Button 
                    href={product.purchase_url}
                    className="bg-green-600 text-white px-8 py-4 rounded-lg font-semibold text-lg"
                  >
                    View Event Details
                  </Button>
                </Column>
              </Row>
            </Section>

            {/* Reference Number */}
            <Section className="text-center mb-6">
              <Text className="text-sm text-gray-500">
                Reference: <strong>{requestReference}</strong>
              </Text>
            </Section>
          </Container>

          {/* Footer - Same as other templates */}
          {/* ... */}
        </Body>
      </Html>
    </Tailwind>
  )
}

export const eventDetailsResendEmail = (props: EventDetailsResendEmailProps) => (
  <EventDetailsResendEmailComponent {...props} />
)
```

### 5.2 New Email Resend Subscriber

**File: `apps/medusa/src/subscribers/chef-event-email-resend.ts`**

```typescript
import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { CHEF_EVENT_MODULE } from "../modules/chef-event"
import { Modules } from "@medusajs/framework/utils"
import { DateTime } from "luxon"

type EventData = {
  chefEventId: string
  recipients: string[]
  notes?: string
  emailType: "event_details_resend" | "custom_message"
}

export default async function chefEventEmailResendHandler({
  event: { data },
  container,
}: SubscriberArgs<EventData>) {
  console.log("🔄 CHEF EVENT EMAIL RESEND SUBSCRIBER: Processing resend request:", data)

  try {
    const chefEventModuleService = container.resolve(CHEF_EVENT_MODULE)
    const notificationService = container.resolve(Modules.NOTIFICATION)

    // Get chef event details
    const chefEvent = await chefEventModuleService.retrieveChefEvent(data.chefEventId)
    
    if (!chefEvent) {
      throw new Error(`Chef event not found: ${data.chefEventId}`)
    }

    // Get product details if event is confirmed
    let product = null
    if (chefEvent.productId) {
      const productModuleService = container.resolve(Modules.PRODUCT)
      product = await productModuleService.retrieveProduct(chefEvent.productId)
    }

    // Format data for email template
    const formattedDate = DateTime.fromJSDate(chefEvent.requestedDate).toFormat('LLL d, yyyy')
    const formattedTime = chefEvent.requestedTime

    const eventTypeMap: Record<string, string> = {
      cooking_class: "Cooking Class",
      plated_dinner: "Plated Dinner",
      buffet_style: "Buffet Style"
    }

    const locationTypeMap: Record<string, string> = {
      customer_location: "at Customer's Location",
      chef_location: "at Chef's Location"
    }

    // Calculate pricing
    const PRICING_STRUCTURE = {
      buffet_style: 99.99,
      cooking_class: 119.99,
      plated_dinner: 149.99
    }
    
    const pricePerPerson = PRICING_STRUCTURE[chefEvent.eventType as keyof typeof PRICING_STRUCTURE]
    const totalPrice = pricePerPerson * chefEvent.partySize

    // Common email data
    const emailData = {
      customer: {
        first_name: chefEvent.firstName,
        last_name: chefEvent.lastName,
        email: chefEvent.email,
        phone: chefEvent.phone || "Not provided"
      },
      booking: {
        date: formattedDate,
        time: formattedTime,
        event_type: eventTypeMap[chefEvent.eventType] || chefEvent.eventType,
        location_type: locationTypeMap[chefEvent.locationType] || chefEvent.locationType,
        location_address: chefEvent.locationAddress || "Not provided",
        party_size: chefEvent.partySize,
        notes: chefEvent.notes || "No special notes provided"
      },
      event: {
        status: chefEvent.status,
        total_price: totalPrice.toFixed(2),
        price_per_person: pricePerPerson.toFixed(2)
      },
      product: product ? {
        id: product.id,
        handle: product.handle,
        title: product.title,
        purchase_url: `${process.env.STOREFRONT_URL}/products/${product.handle}`
      } : null,
      chef: {
        name: "Chef Luis Velez",
        email: "support@chefvelez.com",
        phone: "(347) 695-4445"
      }
      requestReference: chefEvent.id.slice(0, 8).toUpperCase(),
      customNotes: data.notes,
      emailType: data.emailType
    }

    // Send emails to all recipients
    for (const recipient of data.recipients) {
      await notificationService.createNotifications({
        to: recipient,
        channel: "email",
        template: "event-details-resend",
        data: emailData
      })
      
      console.log(`✅ CHEF EVENT EMAIL RESEND SUBSCRIBER: Email sent to ${recipient}`)
    }

  } catch (error) {
    console.error("❌ CHEF EVENT EMAIL RESEND SUBSCRIBER: Failed to process resend:", error)
    throw error
  }
}

export const config: SubscriberConfig = {
  event: "chef-event.email-resend",
}
```

---

## Phase 6: SDK & Hooks Updates ✅ PLANNED

### 6.1 Updated Admin SDK

**File: `apps/medusa/src/sdk/admin/admin-chef-events.ts`**

Add new methods for email management:

```typescript
export interface AdminAcceptChefEventDTO {
  chefNotes?: string
  acceptedBy?: string
  sendAcceptanceEmail?: boolean // New field
}

export interface AdminResendEventEmailDTO {
  recipients: string[]
  notes?: string
  emailType?: "event_details_resend" | "custom_message"
}

export class AdminChefEventsResource {
  // ... existing methods ...

  /**
   * Accept a chef event with email preferences
   */
  async accept(id: string, data: AdminAcceptChefEventDTO = {}) {
    const response = await this.client.fetch<{ success: boolean; data: any }>(`/admin/chef-events/${id}/accept`, {
      method: 'POST',
      body: {
        ...data,
        sendAcceptanceEmail: data.sendAcceptanceEmail ?? true
      },
    })
    return response
  }

  /**
   * Resend event details to specified recipients
   */
  async resendEmail(id: string, data: AdminResendEventEmailDTO) {
    const response = await this.client.fetch<{ success: boolean; data: any }>(`/admin/chef-events/${id}/resend-email`, {
      method: 'POST',
      body: data,
    })
    return response
  }
}
```

### 6.2 Updated Admin Hooks

**File: `apps/medusa/src/admin/hooks/chef-events.ts`**

Add new React Query hooks:

```typescript
/**
 * Hook for resending event emails
 */
export const useAdminResendEventEmailMutation = () => {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async ({ chefEventId, ...data }: { chefEventId: string } & AdminResendEventEmailDTO) => {
      const sdk = getAdminSDK()
      return await sdk.admin.chefEvents.resendEmail(chefEventId, data)
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["admin", "chef-events"] })
      queryClient.invalidateQueries({ queryKey: ["admin", "chef-events", variables.chefEventId] })
    },
  })
}

/**
 * Updated accept mutation to handle email preferences
 */
export const useAdminAcceptChefEventMutation = () => {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: AdminAcceptChefEventDTO }) => {
      const sdk = getAdminSDK()
      return await sdk.admin.chefEvents.accept(id, data)
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["admin", "chef-events"] })
      queryClient.invalidateQueries({ queryKey: ["admin", "chef-events", variables.id] })
    },
  })
}
```

---

## Phase 7: Testing & Validation ✅ PLANNED

### 7.1 Unit Tests

**File: `apps/medusa/src/workflows/__tests__/accept-chef-event.test.ts`**

```typescript
describe("Accept Chef Event Workflow", () => {
  it("should accept event without sending email when disabled", async () => {
    const input = {
      chefEventId: "event_123",
      chefNotes: "Test notes",
      sendAcceptanceEmail: false
    }
    
    const result = await acceptChefEventWorkflow(container).run({ input })
    
    expect(result.chefEvent.status).toBe("confirmed")
    expect(result.emailSent).toBe(false)
  })

  it("should accept event and send email when enabled", async () => {
    const input = {
      chefEventId: "event_123", 
      chefNotes: "Test notes",
      sendAcceptanceEmail: true
    }
    
    const result = await acceptChefEventWorkflow(container).run({ input })
    
    expect(result.chefEvent.status).toBe("confirmed")
    expect(result.emailSent).toBe(true)
  })
})
```

### 7.2 Integration Tests

**File: `apps/medusa/src/api/__tests__/chef-events-email.test.ts`**

```typescript
describe("Chef Events Email API", () => {
  it("should accept event with email preference", async () => {
    const response = await api.post(`/admin/chef-events/${eventId}/accept`, {
      chefNotes: "Looking forward to this event!",
      sendAcceptanceEmail: false
    })
    
    expect(response.status).toBe(200)
    expect(response.data.success).toBe(true)
  })

  it("should resend event details to custom recipients", async () => {
    const response = await api.post(`/admin/chef-events/${eventId}/resend-email`, {
      recipients: ["test1@example.com", "test2@example.com"],
      notes: "Additional information for the event",
      emailType: "event_details_resend"
    })
    
    expect(response.status).toBe(200)
    expect(response.data.success).toBe(true)
  })
})
```

### 7.3 Component Tests

**File: `apps/medusa/src/admin/routes/chef-events/components/__tests__/EmailManagementSection.test.tsx`**

```typescript
describe("EmailManagementSection", () => {
  it("should render email history", () => {
    const chefEvent = {
      emailHistory: [
        {
          type: "event_details_resend",
          recipients: ["test@example.com"],
          sentAt: "2024-01-01T00:00:00Z"
        }
      ]
    }
    
    render(<EmailManagementSection chefEvent={chefEvent} onEmailSent={jest.fn()} />)
    
    expect(screen.getByText("Recent Email Activity")).toBeInTheDocument()
    expect(screen.getByText("event_details_resend")).toBeInTheDocument()
  })

  it("should open resend modal when button clicked", () => {
    render(<EmailManagementSection chefEvent={{}} onEmailSent={jest.fn()} />)
    
    fireEvent.click(screen.getByText("Resend Event Details"))
    
    expect(screen.getByText("Send to")).toBeInTheDocument()
  })
})
```

---

## Implementation Timeline

### Week 1: Database & Backend
- [ ] Database migration for new fields
- [ ] Update chef event model
- [ ] Enhanced accept event API
- [ ] New resend email API
- [ ] Updated workflows

### Week 2: Admin Interface
- [ ] Enhanced accept event modal
- [ ] Email management section component
- [ ] Updated admin hooks
- [ ] SDK updates

### Week 3: Email System
- [ ] New email templates
- [ ] Email resend subscriber
- [ ] Email history tracking
- [ ] Template testing

### Week 4: Testing & Polish
- [ ] Unit tests
- [ ] Integration tests
- [ ] Component tests
- [ ] End-to-end testing
- [ ] Documentation updates

## Success Criteria

### Functional Requirements
- ✅ Chef can opt-in/out of sending acceptance emails
- ✅ Chef can resend event details to host email
- ✅ Chef can send event details to custom email addresses
- ✅ Email history is tracked and displayed
- ✅ All existing functionality remains intact

### Technical Requirements
- ✅ Database schema properly migrated
- ✅ API endpoints follow existing patterns
- ✅ Email templates are responsive and professional
- ✅ Admin interface is intuitive and consistent
- ✅ Comprehensive test coverage

### User Experience
- ✅ Clear and intuitive email controls
- ✅ Helpful feedback on email operations
- ✅ Professional email templates
- ✅ Consistent with existing admin interface

## Future Enhancements

### Phase 8+: Advanced Features
- [ ] Email scheduling (send reminders at specific times)
- [ ] Email templates customization
- [ ] Bulk email operations
- [ ] Email analytics and tracking
- [ ] SMS notifications integration
- [ ] Customer email preferences
- [ ] Email automation rules

This implementation plan provides a comprehensive approach to adding advanced email management features to the chef event system while maintaining consistency with the existing codebase architecture and patterns. 