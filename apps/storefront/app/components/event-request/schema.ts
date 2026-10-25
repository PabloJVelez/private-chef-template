import { z } from 'zod';

const formString = z.coerce.string();

// Form validation schema
export const eventRequestSchema = z.object({
  // Step 1: Menu Selection (optional)
  menuId: formString.optional(),

  // Step 2: Event Type Selection
  eventType: formString.min(1, 'Please select an experience type'),
  experienceTypeId: z.string().min(1, 'Choose an available experience'),

  // Step 3: Date & Time
  requestedDate: formString.regex(/^\d{4}-\d{2}-\d{2}$/, 'Please select a date'),
  requestedTime: formString.regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Please select an arrival time'),
  slotStart: formString.datetime('Please select an available arrival time'),
  slotTimezone: formString.optional(),
  slotLabel: formString.optional(),
  slotValidated: z.boolean().optional(),

  // Step 4: Party Size
  partySize: z.coerce.number().min(2, 'Minimum 2 guests required').max(50, 'Maximum 50 guests allowed'),

  // Step 5: Location (now only customer location)
  locationAddress: formString.min(10, 'Please provide a complete address').max(500, 'Address is too long'),

  // Step 6: Contact Details
  firstName: formString.min(1, 'First name is required').max(50, 'First name is too long'),
  lastName: formString.min(1, 'Last name is required').max(50, 'Last name is too long'),
  email: formString.email('Please enter a valid email address').max(255, 'Email address is too long'),
  phone: formString.min(1, 'Phone number is required').refine((phone) => {
    // Remove all non-digits to check length
    const digitsOnly = phone.replace(/\D/g, '');
    return digitsOnly.length === 10;
  }, 'Please enter a valid 10-digit phone number'),

  // Step 7: Special Requests
  specialRequirements: formString.optional().refine((req) => {
    if (!req) return true;
    return req.length <= 1000;
  }, 'Special requirements must be less than 1000 characters'),
  notes: formString.optional().refine((notes) => {
    if (!notes) return true;
    return notes.length <= 1000;
  }, 'Notes must be less than 1000 characters'),
  attribution: formString.optional(),

  // Hidden fields
  currentStep: z.coerce.number().optional(),
});

export type EventRequestFormData = z.infer<typeof eventRequestSchema>;
