import { model } from "@medusajs/framework/utils"

export const ChefEvent = model.define("chef_event", {
  // Basic fields
  id: model.id().primaryKey(),
  status: model.enum([
    'pending',
    'confirmed', 
    'cancelled',
    'completed'
  ]).default('pending'),
  
  // Event details
  requestedDate: model.dateTime(),
  requestedTime: model.text(), // Format: HH:mm
  partySize: model.number(),
  eventType: model.enum([
    'cooking_class',
    'plated_dinner',
    'buffet_style'
  ]),
  templateProductId: model.text(),
  
  // Location details
  locationType: model.enum([
    'customer_location',
    'chef_location'
  ]),
  locationAddress: model.text(),
  
  // Contact information
  firstName: model.text(),
  lastName: model.text(),
  email: model.text(),
  phone: model.text(),
  notes: model.text(),
  
  // Additional event-specific fields
  totalPrice: model.bigNumber(),
  depositPaid: model.boolean().default(false),
  specialRequirements: model.text(),
  estimatedDuration: model.number().nullable(), // Duration in minutes
  
  // Acceptance/Rejection tracking fields
  productId: model.text().nullable(), // Link to created product for ticket sales
  acceptedAt: model.dateTime().nullable(), // When chef accepted the event
  acceptedBy: model.text().nullable(), // Chef who accepted (for multi-chef future)
  rejectionReason: model.text().nullable(), // Reason for rejection
  chefNotes: model.text().nullable(), // Chef's notes for acceptance/rejection
  
  // Email management fields
  sendAcceptanceEmail: model.boolean().default(true), // Chef preference for sending acceptance emails
  emailHistory: model.json().nullable(), // Track sent emails with timestamps and recipients
  lastEmailSentAt: model.dateTime().nullable(), // Last email activity timestamp
  customEmailRecipients: model.json().nullable(), // Additional email recipients for resends

  /** Optional gratuity amount (set when sending receipt to host) */
  tipAmount: model.number().nullable(),
  /** How gratuity was provided, e.g. cash / Venmo / other */
  tipMethod: model.text().nullable(),
  
}).cascades({
  delete: [] // Add any cascading deletes if needed
})

export default ChefEvent

export type ChefEventType = {
  id: string
  status: 'pending' | 'confirmed' | 'cancelled' | 'completed'
  requestedDate: Date
  requestedTime: string
  partySize: number
  eventType: 'cooking_class' | 'plated_dinner' | 'buffet_style'
  locationType: 'customer_location' | 'chef_location'
  locationAddress?: string
  firstName: string
  lastName: string
  email: string
  phone?: string
  notes?: string
  menu?: { id: string }
  createdAt: Date
  updatedAt: Date
  totalPrice?: number
  depositPaid: boolean
  specialRequirements?: string
  estimatedDuration?: number
  assignedChefId?: string
  // New fields for acceptance workflow
  productId?: string
  acceptedAt?: Date
  acceptedBy?: string
  rejectionReason?: string
  chefNotes?: string
  // Email management fields
  sendAcceptanceEmail?: boolean
  emailHistory?: Array<{
    type: string
    recipients: string[]
    notes?: string
    sentAt: string
    sentBy: string
  }>
  lastEmailSentAt?: Date
  customEmailRecipients?: string[]
  tipAmount?: number | null
  tipMethod?: string | null
}