import { useFormContext } from 'react-hook-form';
import type { EventRequestFormData } from '@app/routes/request._index';
import clsx from 'clsx';
import type { FC } from 'react';

export interface ContactDetailsProps {
  className?: string;
}

export const ContactDetails: FC<ContactDetailsProps> = ({ className }) => {
  const {
    watch,
    setValue,
    formState: { errors },
  } = useFormContext<EventRequestFormData>();
  const firstName = watch('firstName');
  const lastName = watch('lastName');
  const email = watch('email');
  const phone = watch('phone');

  // Format phone number as user types
  const formatPhoneNumber = (value: string) => {
    // Remove all non-digits
    const digits = value.replace(/\D/g, '');

    // Format as (XXX) XXX-XXXX
    if (digits.length <= 3) {
      return digits;
    } else if (digits.length <= 6) {
      return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
    } else {
      return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
    }
  };

  const handlePhoneChange = (value: string) => {
    const formatted = formatPhoneNumber(value);
    setValue('phone', formatted, { shouldValidate: true });
  };

  const handleInputChange = (field: keyof EventRequestFormData, value: string) => {
    setValue(field, value, { shouldValidate: true });
  };

  return (
    <div className={clsx('space-y-6', className)}>
      {/* Header */}
      <div className="text-center">
        <h3 className="text-lg font-semibold text-primary-900 mb-2">Contact Information</h3>
        <p className="text-primary-600">
          Please provide your contact details so we can reach you about your event request.
        </p>
      </div>

      {/* Name fields */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-primary-900 mb-2">
            First Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={firstName || ''}
            onChange={(e) => handleInputChange('firstName', e.target.value)}
            placeholder="Enter your first name"
            className={clsx(
              'w-full px-4 py-3 border-2 rounded-lg focus:ring-2 focus:ring-accent-500 focus:border-accent-500',
              errors.firstName ? 'border-red-300 focus:border-red-500 focus:ring-red-500' : 'border-gray-300',
            )}
          />
          {errors.firstName && <p className="text-red-600 text-sm mt-1">{errors.firstName.message}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium text-primary-900 mb-2">
            Last Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={lastName || ''}
            onChange={(e) => handleInputChange('lastName', e.target.value)}
            placeholder="Enter your last name"
            className={clsx(
              'w-full px-4 py-3 border-2 rounded-lg focus:ring-2 focus:ring-accent-500 focus:border-accent-500',
              errors.lastName ? 'border-red-300 focus:border-red-500 focus:ring-red-500' : 'border-gray-300',
            )}
          />
          {errors.lastName && <p className="text-red-600 text-sm mt-1">{errors.lastName.message}</p>}
        </div>
      </div>

      {/* Email field */}
      <div>
        <label className="block text-sm font-medium text-primary-900 mb-2">
          Email Address <span className="text-red-500">*</span>
        </label>
        <input
          type="email"
          value={email || ''}
          onChange={(e) => handleInputChange('email', e.target.value)}
          placeholder="Enter your email address"
          className={clsx(
            'w-full px-4 py-3 border-2 rounded-lg focus:ring-2 focus:ring-accent-500 focus:border-accent-500',
            errors.email ? 'border-red-300 focus:border-red-500 focus:ring-red-500' : 'border-gray-300',
          )}
        />
        <p className="text-sm text-primary-600 mt-1">Used for event confirmations and communication</p>
        {errors.email && <p className="text-red-600 text-sm mt-1">{errors.email.message}</p>}
      </div>

      {/* Phone field */}
      <div>
        <label className="block text-sm font-medium text-primary-900 mb-2">
          Phone Number <span className="text-primary-500">(Optional)</span>
        </label>
        <input
          type="tel"
          value={phone || ''}
          onChange={(e) => handlePhoneChange(e.target.value)}
          placeholder="(702) 349-6158"
          maxLength={14}
          className={clsx(
            'w-full px-4 py-3 border-2 rounded-lg focus:ring-2 focus:ring-accent-500 focus:border-accent-500',
            errors.phone ? 'border-red-300 focus:border-red-500 focus:ring-red-500' : 'border-gray-300',
          )}
        />
        <p className="text-sm text-primary-600 mt-1">For quick communication and day-of-event coordination</p>
        {errors.phone && <p className="text-red-600 text-sm mt-1">{errors.phone.message}</p>}
      </div>

      {/* Contact summary */}
      {firstName && lastName && email && (
        <div className="bg-accent-50 border border-accent-200 rounded-lg p-4">
          <h4 className="text-sm font-semibold text-accent-700 mb-2">Contact Summary</h4>
          <div className="space-y-1 text-sm text-accent-600">
            <p>
              <span className="font-medium">Name:</span> {firstName} {lastName}
            </p>
            <p>
              <span className="font-medium">Email:</span> {email}
            </p>
            {phone && (
              <p>
                <span className="font-medium">Phone:</span> {phone}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Hidden form fields */}
      <input type="hidden" name="firstName" value={firstName || ''} />
      <input type="hidden" name="lastName" value={lastName || ''} />
      <input type="hidden" name="email" value={email || ''} />
      <input type="hidden" name="phone" value={phone || ''} />
    </div>
  );
};

export default ContactDetails;
