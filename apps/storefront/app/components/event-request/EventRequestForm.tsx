import { useState, useEffect } from 'react';
import { Button } from '@app/components/common/buttons/Button';
import { ActionList } from '@app/components/common/actions-list/ActionList';
import type { StoreMenuDTO } from '@app/../types/menus';
import type { EventRequestFormData } from '@app/routes/request._index';
import { RemixFormProvider, useRemixForm } from 'remix-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { eventRequestSchema } from '@app/routes/request._index';
import { useActionData } from 'react-router';
import clsx from 'clsx';
import type { FC } from 'react';
import { Disclosure } from '@headlessui/react';
import ChevronDownIcon from '@heroicons/react/24/outline/ChevronDownIcon';

// Real form step components
import { MenuSelector } from './MenuSelector';
import { EventTypeSelector } from './EventTypeSelector';
import { PartySizeSelector } from './PartySizeSelector';
import { DateTimeForm } from './DateTimeForm';
import { LocationForm } from './LocationForm';
import { ContactDetails } from './ContactDetails';
import { SpecialRequests } from './SpecialRequests';
import { RequestSummary } from './RequestSummary';

export interface EventRequestFormProps {
  menus: StoreMenuDTO[];
  initialValues?: Partial<EventRequestFormData>;
}

// Type for action response
interface ActionResponse {
  success?: boolean;
  eventId?: string;
  redirectTo?: string;
  message?: string;
  errors?: any;
}

const STEPS = [
  { id: 1, title: 'Experience & Menu', subtitle: 'Choose your culinary experience, select a menu template, and tell us how many guests' },
  { id: 2, title: 'Schedule, Contact & Location', subtitle: 'Select date/time, provide contact info, and enter the event address' },
  { id: 3, title: 'Special Requests', subtitle: 'Any dietary restrictions or notes?' },
  { id: 4, title: 'Review & Submit', subtitle: 'Confirm your event details' },
];

export const EventRequestForm: FC<EventRequestFormProps> = ({ 
  menus, 
  initialValues = {} 
}) => {
  const [currentStep, setCurrentStep] = useState(1);
  const actionData = useActionData() as ActionResponse;
  
  const form = useRemixForm<EventRequestFormData>({
    resolver: zodResolver(eventRequestSchema),
    defaultValues: {
      currentStep: 1,
      partySize: 4, // Default party size
      ...initialValues,
    },
    mode: 'onChange', // Validate on change for better UX
  });

  // Handle action data errors
  useEffect(() => {
    // Process action data if present
  }, [actionData]);

  // Scroll to top whenever step changes
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [currentStep]);

  const nextStep = () => {
    if (currentStep < STEPS.length) {
      setCurrentStep(currentStep + 1);
    }
  };

  const prevStep = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const canProceed = () => {
    const values = form.getValues();
    const errors = form.formState.errors;
    
    switch (currentStep) {
      case 1:
        // Experience required, party size required
        return (
          !!values.eventType &&
          !errors.eventType &&
          !!values.menuId &&
          values.partySize >= 2 &&
          values.partySize <= 50 &&
          !errors.partySize
        );
      case 2:
        // Date/time, contact, and location required
        return (
          !!values.requestedDate &&
          !!values.requestedTime &&
          !errors.requestedDate &&
          !errors.requestedTime &&
          !!values.firstName &&
          !!values.lastName &&
          !!values.email &&
          !errors.firstName &&
          !errors.lastName &&
          !errors.email &&
          (!values.phone || !errors.phone) &&
          !!values.locationAddress &&
          values.locationAddress.length >= 10 &&
          !errors.locationAddress
        );
      case 3:
        // Special requests optional but must be valid if provided
        return !errors.specialRequirements && !errors.notes;
      case 4:
        // No validation errors on final step
        return Object.keys(errors).length === 0;
      default:
        return false;
    }
  };

  const isAllComplete = () => {
    const v = form.getValues();
    const e = form.formState.errors;
    const step1 = !!v.menuId && !!v.eventType && !e.eventType && v.partySize >= 2 && v.partySize <= 50 && !e.partySize;
    const step2Date = !!v.requestedDate && !!v.requestedTime && !e.requestedDate && !e.requestedTime;
    const step2Contact = !!v.firstName && !!v.lastName && !!v.email && !e.firstName && !e.lastName && !e.email && (!v.phone || !e.phone);
    const step2Location = !!v.locationAddress && v.locationAddress.length >= 10 && !e.locationAddress;
    return step1 && step2Date && step2Contact && step2Location; // step3 (special requests) is optional
  };

  const renderSectionHeader = (label: string, opts?: { complete?: boolean; optional?: boolean }) => (
    <div className="flex items-center gap-3">
      <h4 className="text-base font-semibold text-primary-900">{label}</h4>
      <span
        className={clsx(
          'inline-flex items-center rounded-full border px-2 py-0.5 text-xs',
          opts?.optional
            ? 'border-gray-300 text-gray-600'
            : opts?.complete
            ? 'border-green-300 text-green-700 bg-green-50'
            : 'border-gray-300 text-gray-600 bg-gray-50'
        )}
      >
        {opts?.optional ? 'Optional' : opts?.complete ? 'Complete' : 'Incomplete'}
      </span>
    </div>
  );

  const renderDisclosure = (
    args: {
      defaultOpen?: boolean;
      header: React.ReactNode;
      children: React.ReactNode;
      key?: string;
    }
  ) => (
    <Disclosure key={args.key} defaultOpen={args.defaultOpen}>
      {({ open }) => (
        <div
          className={clsx(
            'rounded-lg border bg-white transition-colors shadow-sm',
            open ? 'border-accent-300 ring-1 ring-accent-200' : 'border-gray-200 hover:border-gray-300'
          )}
        >
          <Disclosure.Button className="w-full px-4 py-3 text-left">
            <div className="flex items-center justify-between">
              <div>{args.header}</div>
              <ChevronDownIcon
                className={clsx('h-5 w-5 text-gray-500 transition-transform', open && 'rotate-180')}
              />
            </div>
          </Disclosure.Button>
          <Disclosure.Panel className="px-4 pb-4">
            {args.children}
          </Disclosure.Panel>
        </div>
      )}
    </Disclosure>
  );

  const renderStepContent = () => {
    switch (currentStep) {
      case 1:
        return (
          <div className="space-y-6">
            {(() => {
              const v = form.getValues();
              const e = form.formState.errors;
              const isEventTypeComplete = !!v.eventType && !e.eventType;
              const isPartySizeComplete = v.partySize >= 2 && v.partySize <= 50 && !e.partySize;
              const isMenuSelected = !!v.menuId;

              return (
                <>
                  {renderDisclosure({
                    key: `step1-menu-${currentStep}`,
                    defaultOpen: true,
                    header: renderSectionHeader('Select a Menu', { complete: isMenuSelected }),
                    children: <MenuSelector menus={menus} />,
                  })}

                  {renderDisclosure({
                    key: `step1-experience-${currentStep}`,
                    defaultOpen: false,
                    header: renderSectionHeader('Experience Type', { complete: isEventTypeComplete }),
                    children: <EventTypeSelector />,
                  })}

                  {renderDisclosure({
                    key: `step1-guests-${currentStep}`,
                    defaultOpen: false,
                    header: renderSectionHeader('Number of Guests', { complete: isPartySizeComplete }),
                    children: <PartySizeSelector />,
                  })}
                </>
              );
            })()}
          </div>
        );
      case 2:
        return (
          <div className="space-y-6">
            {(() => {
              const v = form.getValues();
              const e = form.formState.errors;
              const isDateComplete = !!v.requestedDate && !!v.requestedTime && !e.requestedDate && !e.requestedTime;
              const isContactComplete = !!v.firstName && !!v.lastName && !!v.email && !e.firstName && !e.lastName && !e.email && (!v.phone || !e.phone);
              const isLocationComplete = !!v.locationAddress && v.locationAddress.length >= 10 && !e.locationAddress;

              return (
                <>
                  {renderDisclosure({
                    key: `step2-date-${currentStep}`,
                    defaultOpen: true,
                    header: renderSectionHeader('Date & Time', { complete: isDateComplete }),
                    children: <DateTimeForm />,
                  })}

                  {renderDisclosure({
                    key: `step2-contact-${currentStep}`,
                    defaultOpen: false,
                    header: renderSectionHeader('Contact Information', { complete: isContactComplete }),
                    children: <ContactDetails />,
                  })}

                  {renderDisclosure({
                    key: `step2-location-${currentStep}`,
                    defaultOpen: false,
                    header: renderSectionHeader('Event Address', { complete: isLocationComplete }),
                    children: <LocationForm />,
                  })}
                </>
              );
            })()}
          </div>
        );
      case 3:
        return <SpecialRequests />;
      case 4:
        return (
          <RequestSummary 
            menus={menus} 
            onEditStep={(step: number, section?: string) => {
              setCurrentStep(step);
              // brief timeout to allow render then expand intended section
              setTimeout(() => {
                const sectionMap: Record<string, string[]> = {
                  // Step 1
                  menu: ['Select a Menu'],
                  experience: ['Experience Type'],
                  guests: ['Number of Guests'],
                  // Step 2
                  date: ['Date & Time'],
                  contact: ['Contact Information'],
                  location: ['Event Address'],
                  // Step 3
                  special: ['Special Requests'],
                };

                const labels = section && sectionMap[section];
                if (!labels) return;
                // Find disclosure button by header text and click to open
                labels.forEach((text) => {
                  const btn = Array.from(document.querySelectorAll('button'))
                    .find((b) => b.textContent?.trim().startsWith(text));
                  if (btn) (btn as HTMLButtonElement).click();
                });
              }, 0);
            }}
            onSubmit={() => {
              // Force update hidden inputs with current values
              const formValues = form.getValues();
              Object.entries(formValues).forEach(([key, value]) => {
                const input = document.querySelector(`input[name="${key}"]`) as HTMLInputElement;
                if (input && input.type === 'hidden') {
                  let processedValue = String(value || '');
                  
                  if (key === 'requestedDate' && value) {
                    const requestedTime = formValues.requestedTime || '12:00';
                    const dateTime = new Date(`${value}T${requestedTime}:00`);
                    processedValue = dateTime.toISOString();
                  }
                  
                  input.value = processedValue;
                }
              });
              
              const form_element = document.querySelector('form') as HTMLFormElement;
              if (form_element) {
                form_element.requestSubmit();
              }
            }}
            isSubmitting={form.formState.isSubmitting}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="max-w-3xl mx-auto">
      {/* Progress Indicator */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          {STEPS.map((step, index) => (
            <div
              key={step.id}
              className={clsx(
                'flex items-center',
                index < STEPS.length - 1 && 'flex-1'
              )}
            >
              <button
                className={clsx(
                  'w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium',
                  currentStep >= step.id
                    ? 'bg-accent-500 text-white'
                    : 'bg-gray-200 text-gray-600'
                )}
                onClick={() => setCurrentStep(step.id)}
              >
                {step.id}
              </button>
              {index < STEPS.length - 1 && (
                <div
                  className={clsx(
                    'flex-1 h-0.5 mx-4',
                    currentStep > step.id ? 'bg-accent-500' : 'bg-gray-200'
                  )}
                />
              )}
            </div>
          ))}
        </div>
        
        <div className="text-center">
          <h2 className="text-2xl font-semibold text-primary-900 mb-1">
            {STEPS[currentStep - 1].title}
          </h2>
          <p className="text-primary-600">
            {STEPS[currentStep - 1].subtitle}
          </p>
        </div>
      </div>

      {/* Form Content */}
      <RemixFormProvider {...form}>
        <form 
          method="post" 
          className="space-y-8"
          onSubmit={(e) => {
            // Don't prevent default - let remix-hook-form handle it
          }}

        >
          <input type="hidden" name="currentStep" value={currentStep} />
          
          {/* Hidden inputs to ensure form data is properly submitted */}
          <input type="hidden" name="menuId" value={form.watch('menuId') || ''} />
          <input type="hidden" name="eventType" value={form.watch('eventType') || ''} />
          <input type="hidden" name="requestedDate" value={form.watch('requestedDate') || ''} />
          <input type="hidden" name="requestedTime" value={form.watch('requestedTime') || ''} />
          <input type="hidden" name="partySize" value={form.watch('partySize') || ''} />
          <input type="hidden" name="locationAddress" value={form.watch('locationAddress') || ''} />
          <input type="hidden" name="firstName" value={form.watch('firstName') || ''} />
          <input type="hidden" name="lastName" value={form.watch('lastName') || ''} />
          <input type="hidden" name="email" value={form.watch('email') || ''} />
          <input type="hidden" name="phone" value={form.watch('phone') || ''} />
          <input type="hidden" name="specialRequirements" value={form.watch('specialRequirements') || ''} />
          <input type="hidden" name="notes" value={form.watch('notes') || ''} />
          
          <div className="bg-white rounded-lg shadow-md p-8">
            {renderStepContent()}
          </div>

          {/* Navigation Buttons */}
          <div className="flex justify-between">
            <div>
              {currentStep > 1 && (
                <Button
                  type="button"
                  variant="default"
                  onClick={prevStep}
                >
                  Previous
                </Button>
              )}
            </div>
            
            <div className="flex gap-4">
              {currentStep < STEPS.length && (
                <Button
                  type="button"
                  onClick={nextStep}
                  disabled={!canProceed()}
                >
                  Next Step
                </Button>
              )}
              {currentStep < STEPS.length - 1 && isAllComplete() && (
                <Button
                  type="button"
                  variant="default"
                  className="border border-gray-300 bg-white text-gray-800 hover:bg-gray-50"
                  onClick={() => setCurrentStep(STEPS.length)}
                >
                  Review Now
                </Button>
              )}
              {/* Note: Submit button is handled by RequestSummary component on final step */}
            </div>
          </div>
        </form>
      </RemixFormProvider>
    </div>
  );
};

export default EventRequestForm; 