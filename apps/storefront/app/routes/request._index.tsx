import { Container } from '@app/components/common/container/Container';
import { getMergedPageMeta } from '@libs/util/page';
import type { LoaderFunctionArgs, MetaFunction, ActionFunctionArgs } from 'react-router';
import { useLoaderData, useSearchParams, redirect } from 'react-router';
import { fetchMenus } from '@libs/util/server/data/menus.server';
import { createChefEventRequest } from '@libs/util/server/data/chef-events.server';
import { fetchExperienceTypes } from '@libs/util/server/data/experience-types.server';
import { getValidatedFormData } from 'remix-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { EventRequestForm } from '@app/components/event-request/EventRequestForm';

const formString = z.coerce.string();

// Form validation schema
export const eventRequestSchema = z.object({
  // Step 1: Menu Selection (optional)
  menuId: formString.optional(),

  // Step 2: Event Type Selection
  eventType: formString.min(1, 'Please select an experience type'),
  experienceTypeId: formString.optional(),

  // Step 3: Date & Time
  requestedDate: formString.regex(/^\d{4}-\d{2}-\d{2}$/, 'Please select a date'),
  requestedTime: formString.regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Please select an arrival time'),
  slotStart: formString.datetime('Please select an available arrival time'),

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

const attributionTouchSchema = z
  .object({
    utm_source: z.string().optional(),
    utm_medium: z.string().optional(),
    utm_campaign: z.string().optional(),
    utm_content: z.string().optional(),
    utm_term: z.string().optional(),
    gclid: z.string().optional(),
    fbclid: z.string().optional(),
    landing_page: z.string(),
    referrer: z.string().optional(),
    seen_at: z.string(),
  })
  .passthrough();

const attributionSchema = z
  .object({
    first_touch: attributionTouchSchema.optional(),
    last_touch: attributionTouchSchema.optional(),
  })
  .passthrough();

function parseAttribution(value?: string) {
  if (!value) return undefined;

  try {
    return attributionSchema.parse(JSON.parse(value));
  } catch {
    return undefined;
  }
}

export const loader = async (args: LoaderFunctionArgs) => {
  try {
    const [menusData, experienceTypesData] = await Promise.all([fetchMenus({ limit: 20 }), fetchExperienceTypes()]);
    return {
      menus: menusData.menus || [],
      experienceTypes: experienceTypesData.experience_types || [],
      success: true,
    };
  } catch (error) {
    console.error('Failed to load request page data:', error);
    return {
      menus: [],
      experienceTypes: [],
      success: false,
    };
  }
};

export const action = async (actionArgs: ActionFunctionArgs) => {
  try {
    const rawFormData = await actionArgs.request.clone().formData();
    const attributionValue = rawFormData.get('attribution');
    const { errors, data } = await getValidatedFormData<EventRequestFormData>(
      actionArgs.request,
      zodResolver(eventRequestSchema),
    );

    if (errors) {
      return { errors, status: 400 };
    }

    const response = await createChefEventRequest({
      requestedDate: data.requestedDate,
      slotStart: data.slotStart,
      requestedTime: data.requestedTime,
      partySize: data.partySize,
      eventType: data.eventType,
      experience_type_id: data.experienceTypeId,
      templateProductId: data.menuId,
      locationType: 'customer_location',
      locationAddress: data.locationAddress,
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email,
      phone: data.phone,
      notes: data.notes,
      specialRequirements: data.specialRequirements,
      attribution: parseAttribution(typeof attributionValue === 'string' ? attributionValue : undefined),
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
          message: 'The selected time could not be booked. Return to Schedule, choose an available time and try again.',
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
  const { menus, experienceTypes } = useLoaderData<typeof loader>();
  const [searchParams] = useSearchParams();

  const initialValues = {
    menuId: searchParams.get('menu') || undefined,
    eventType: (searchParams.get('type') as EventRequestFormData['eventType']) || undefined,
    experienceTypeId: searchParams.get('experienceTypeId') || undefined,
  };

  return (
    <Container className="py-12 lg:py-16 max-w-4xl">
      <div className="text-center mb-12">
        <h1 className="text-4xl md:text-5xl font-italiana text-primary-900 mb-4">Request Your Culinary Experience</h1>
        <p className="text-lg text-primary-600 max-w-2xl mx-auto">
          Tell us about your event and we'll create a personalized proposal for your culinary experience.
        </p>
      </div>

      <EventRequestForm menus={menus} experienceTypes={experienceTypes} initialValues={initialValues} />
    </Container>
  );
}
