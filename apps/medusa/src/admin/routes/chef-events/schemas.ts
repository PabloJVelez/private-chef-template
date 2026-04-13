import { z } from "zod"

export const chefEventSchema = z.object({
  status: z.enum(['pending', 'confirmed', 'cancelled', 'completed']).default('pending'),
  requestedDate: z.string().refine(
    (date) => {
      const eventDate = new Date(date)
      const now = new Date()
      now.setHours(0, 0, 0, 0) // Reset to start of day for comparison
      return eventDate >= now
    },
    "Event date must be today or in the future"
  ),
  requestedTime: z.string().regex(
    /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/,
    "Time must be in HH:MM format"
  ),
  partySize: z.number().min(1, "Party size must be at least 1").max(50, "Party size cannot exceed 50"),
  eventType: z.enum(['cooking_class', 'plated_dinner', 'buffet_style']),
  experience_type_id: z.string().optional().nullable(),
  templateProductId: z.string().optional(),
  locationType: z.enum(['customer_location', 'chef_location']),
  locationAddress: z.string().min(1, "Location address is required"),
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  email: z.string().email("Invalid email address"),
  phone: z.string().optional(),
  notes: z.string().optional(),
  totalPrice: z.number().min(0, "Total price cannot be negative").optional(),
  depositPaid: z.boolean().optional(),
  specialRequirements: z.string().optional(),
  estimatedDuration: z.number().min(30, "Duration must be at least 30 minutes").optional()
})

export const chefEventUpdateSchema = chefEventSchema.partial()

// Status transition validation
export const getValidStatusTransitions = (currentStatus: string) => {
  const transitions: Record<string, string[]> = {
    pending: ['confirmed', 'cancelled'],
    confirmed: ['completed', 'cancelled'],
    cancelled: [], // Final state
    completed: [] // Final state
  }
  return transitions[currentStatus] || []
}

export const validateStatusTransition = (from: string, to: string) => {
  const validTransitions = getValidStatusTransitions(from)
  return validTransitions.includes(to)
}

// Helper functions for form validation
export const eventTypeOptions = [
  { value: 'cooking_class', label: 'Cooking Class' },
  { value: 'plated_dinner', label: 'Plated Dinner' },
  { value: 'buffet_style', label: 'Buffet Style' }
]

export const locationTypeOptions = [
  { value: 'customer_location', label: 'Customer Location' },
  { value: 'chef_location', label: 'Chef Location' }
]

export const statusOptions = [
  { value: 'pending', label: 'Pending' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'completed', label: 'Completed' }
]

// Form field groups for tab organization
export const getFormFieldGroups = () => ({
  general: [
    'requestedDate',
    'requestedTime', 
    'partySize',
    'eventType',
    'experience_type_id',
    'templateProductId',
    'estimatedDuration'
  ],
  contact: [
    'firstName',
    'lastName',
    'email',
    'phone'
  ],
  location: [
    'locationType',
    'locationAddress'
  ],
  details: [
    'notes',
    'specialRequirements',
    'totalPrice',
    'depositPaid',
    'status'
  ]
})

// Default values for new chef events
export const getDefaultChefEventValues = () => ({
  status: 'pending' as const,
  requestedDate: '',
  requestedTime: '',
  partySize: 1,
  eventType: 'plated_dinner' as const,
  experience_type_id: '' as string | null,
  templateProductId: '',
  locationType: 'customer_location' as const,
  locationAddress: '',
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  notes: '',
  totalPrice: 0,
  depositPaid: false,
  specialRequirements: '',
  estimatedDuration: 120
})

// Validation error messages
export const validationMessages = {
  required: (field: string) => `${field} is required`,
  email: 'Please enter a valid email address',
  dateInFuture: 'Event date must be today or in the future',
  timeFormat: 'Time must be in HH:MM format',
  partySizeRange: 'Party size must be between 1 and 50',
  priceNonNegative: 'Price cannot be negative',
  durationMinimum: 'Duration must be at least 30 minutes'
} 