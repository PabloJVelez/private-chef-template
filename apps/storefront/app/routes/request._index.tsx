import { Container } from '@app/components/common/container/Container';
import { getMergedPageMeta } from '@libs/util/page';
import type { LoaderFunctionArgs, MetaFunction, ActionFunctionArgs } from 'react-router';
import { useLoaderData, useSearchParams, redirect } from 'react-router';
import { fetchMenus } from '@libs/util/server/data/menus.server';
import { createChefEventRequest } from '@libs/util/server/data/chef-events.server';
import { getValidatedFormData } from 'remix-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { EventRequestForm } from '@app/components/event-request/EventRequestForm';

// Form validation schema
export const eventRequestSchema = z.object({
  // Step 1: Menu Selection (optional)
  menuId: z.string().optional(),

  // Step 2: Event Type Selection
  eventType: z.enum(['cooking_class', 'plated_dinner', 'buffet_style'], {
    required_error: 'Please select an experience type',
  }),

  // Step 3: Date & Time
  requestedDate: z
    .string()
    .min(1, 'Please select a date')
    .refine((date) => {
      const selectedDate = new Date(date);
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Must be at least 7 days from now
      const minDate = new Date();
      minDate.setDate(minDate.getDate() + 7);
      minDate.setHours(0, 0, 0, 0);

      return selectedDate >= minDate;
    }, 'Events must be scheduled at least 7 days in advance')
    .refine((date) => {
      const selectedDate = new Date(date);
      const maxDate = new Date();
      maxDate.setMonth(maxDate.getMonth() + 6);

      return selectedDate <= maxDate;
    }, 'Events cannot be scheduled more than 6 months in advance'),

  requestedTime: z
    .string()
    .regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Please enter a valid time (HH:MM format)')
    .refine((time) => {
      const [hours, minutes] = time.split(':').map(Number);
      // Business hours: 10:00 AM to 8:30 PM
      const startTime = 10 * 60; // 10:00 AM in minutes
      const endTime = 20 * 60 + 30; // 8:30 PM in minutes
      const timeInMinutes = hours * 60 + minutes;

      return timeInMinutes >= startTime && timeInMinutes <= endTime;
    }, 'Please select a time between 10:00 AM and 8:30 PM'),

  // Step 4: Party Size
  partySize: z.number().min(2, 'Minimum 2 guests required').max(50, 'Maximum 50 guests allowed'),

  // Step 5: Location (now only customer location)
  locationAddress: z.string().min(10, 'Please provide a complete address').max(500, 'Address is too long'),

  // Step 6: Contact Details
  firstName: z.string().min(1, 'First name is required').max(50, 'First name is too long'),
  lastName: z.string().min(1, 'Last name is required').max(50, 'Last name is too long'),
  email: z.string().email('Please enter a valid email address').max(255, 'Email address is too long'),
  phone: z
    .string()
    .optional()
    .refine((phone) => {
      if (!phone) return true; // Optional field
      // Remove all non-digits to check length
      const digitsOnly = phone.replace(/\D/g, '');
      return digitsOnly.length === 10;
    }, 'Please enter a valid 10-digit phone number'),

  // Step 7: Special Requests
  specialRequirements: z
    .string()
    .optional()
    .refine((req) => {
      if (!req) return true;
      return req.length <= 1000;
    }, 'Special requirements must be less than 1000 characters'),
  notes: z
    .string()
    .optional()
    .refine((notes) => {
      if (!notes) return true;
      return notes.length <= 1000;
    }, 'Notes must be less than 1000 characters'),

  // Hidden fields
  currentStep: z.number().optional(),
});

export type EventRequestFormData = z.infer<typeof eventRequestSchema>;

export const loader = async (args: LoaderFunctionArgs) => {
  try {
    // Fetch menus for menu selector step
    const menusData = await fetchMenus({ limit: 20 });
    return {
      menus: menusData.menus || [],
      success: true,
    };
  } catch (error) {
    console.error('Failed to load menus for request page:', error);
    return {
      menus: [],
      success: false,
    };
  }
};

export const action = async (actionArgs: ActionFunctionArgs) => {
  try {
    const { errors, data } = await getValidatedFormData<EventRequestFormData>(
      actionArgs.request,
      zodResolver(eventRequestSchema),
    );

    if (errors) {
      return { errors, status: 400 };
    }

    // Create the chef event request
    const response = await createChefEventRequest({
      requestedDate: data.requestedDate,
      requestedTime: data.requestedTime,
      partySize: data.partySize,
      eventType: data.eventType,
      templateProductId: data.menuId,
      locationType: 'customer_location', // Default to customer location since we removed the selection
      locationAddress: data.locationAddress,
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email,
      phone: data.phone,
      notes: data.notes,
      specialRequirements: data.specialRequirements,
    });

    const successUrl = `/request/success?eventId=${response.chefEvent.id}`;
    return redirect(successUrl);
  } catch (error) {
    console.error('Failed to create chef event request:', error);

    if (error instanceof Error) {
      console.error('Error details:', error.message);
    }

    return {
      errors: {
        root: {
          message: 'Failed to submit request. Please try again.',
        },
      },
      status: 500,
    };
  }
};

export const meta: MetaFunction<typeof loader> = ({ data }) => {
  return [
    { title: 'Request Your Culinary Experience - Private Chef' },
    {
      name: 'description',
      content:
        'Book a personalized culinary experience. Choose from cooking classes, plated dinners, or buffet-style events.',
    },
    { property: 'og:title', content: 'Request Your Culinary Experience - Private Chef' },
    {
      property: 'og:description',
      content:
        'Submit a request for your personalized culinary experience. Your request will be reviewed and a custom proposal will be created for your event.',
    },
    { property: 'og:type', content: 'website' },
    { name: 'keywords', content: 'request event, book chef, cooking class, private dining, culinary experience' },
  ];
};

export default function RequestPage() {
  const { menus } = useLoaderData<typeof loader>();
  const [searchParams] = useSearchParams();

  // Get initial values from URL params (e.g., pre-selected menu or event type)
  const initialValues = {
    menuId: searchParams.get('menu') || undefined,
    eventType: (searchParams.get('type') as EventRequestFormData['eventType']) || undefined,
  };

  return (
    <Container className="py-12 lg:py-16 max-w-4xl">
      <div className="text-center mb-12">
        <h1 className="text-4xl md:text-5xl font-italiana text-primary-900 mb-4">Request Your Culinary Experience</h1>
        <p className="text-lg text-primary-600 max-w-2xl mx-auto">
          Tell us about your event and we'll create a personalized proposal for your culinary experience.
        </p>
      </div>

      <EventRequestForm menus={menus} initialValues={initialValues} />
    </Container>
  );
}
