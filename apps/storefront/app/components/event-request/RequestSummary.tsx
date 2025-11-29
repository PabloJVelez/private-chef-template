import { Button } from '@app/components/common/buttons/Button';
import { useFormContext } from 'react-hook-form';
import type { EventRequestFormData } from '@app/routes/request._index';
import { PRICING_STRUCTURE, getEventTypeDisplayName } from '@libs/constants/pricing';
import type { StoreMenuDTO } from '@libs/util/server/data/menus.server';
import clsx from 'clsx';
import type { FC } from 'react';

export interface RequestSummaryProps {
  className?: string;
  menus: StoreMenuDTO[];
  onEditStep: (step: number, section?: string) => void;
  onSubmit: () => void;
  isSubmitting: boolean;
}

export const RequestSummary: FC<RequestSummaryProps> = ({ className, menus, onEditStep, onSubmit, isSubmitting }) => {
  const { watch } = useFormContext<EventRequestFormData>();

  // Get all form data
  const formData = {
    menuId: watch('menuId'),
    eventType: watch('eventType'),
    partySize: watch('partySize'),
    requestedDate: watch('requestedDate'),
    requestedTime: watch('requestedTime'),
    locationAddress: watch('locationAddress'),
    firstName: watch('firstName'),
    lastName: watch('lastName'),
    email: watch('email'),
    phone: watch('phone'),
    specialRequirements: watch('specialRequirements'),
    notes: watch('notes'),
  };

  // Get selected menu
  const selectedMenu = formData.menuId ? menus.find((menu) => menu.id === formData.menuId) : null;

  // Calculate pricing
  const pricePerPerson = formData.eventType ? PRICING_STRUCTURE[formData.eventType] : 0;
  const totalPrice = pricePerPerson * (formData.partySize || 0);

  // Format date (parse YYYY-MM-DD as local to avoid UTC offset issues)
  const formatDateForDisplay = (dateString: string) => {
    if (!dateString) return '';
    const [y, m, d] = dateString.split('-').map(Number);
    const date = new Date(y, (m || 1) - 1, d || 1);
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const formatTimeForDisplay = (timeString: string) => {
    if (!timeString) return '';
    const [hours, minutes] = timeString.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${minutes} ${ampm}`;
  };

  return (
    <div className={clsx('space-y-6', className)}>
      {/* Header */}
      <div className="text-center">
        <h3 className="text-lg font-semibold text-primary-900 mb-2">Review Your Event Request</h3>
        <p className="text-primary-600">Please review all details before submitting your request.</p>
      </div>

      {/* Summary sections */}
      <div className="space-y-6">
        {/* Menu Selection */}
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-lg font-semibold text-primary-900">Menu Selection</h4>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onEditStep(1, 'menu')}
              className="text-accent-600 text-sm"
            >
              Edit
            </Button>
          </div>
          {selectedMenu ? (
            <div className="space-y-3">
              <div>
                <h5 className="font-medium text-primary-800">{selectedMenu.name}</h5>
              </div>
              {selectedMenu.courses && selectedMenu.courses.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-primary-700 mb-2">Courses ({selectedMenu.courses.length}):</p>
                  <div className="flex flex-wrap gap-2">
                    {selectedMenu.courses.map((course: any, index: number) => (
                      <span key={index} className="px-2 py-1 bg-accent-100 text-accent-700 text-xs rounded">
                        {course.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p className="text-primary-600">Custom menu - A unique experience will be designed for you</p>
          )}
        </div>

        {/* Experience Details */}
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-lg font-semibold text-primary-900">Experience Details</h4>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onEditStep(1, 'experience')}
              className="text-accent-600 text-sm"
            >
              Edit
            </Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p className="text-sm font-medium text-primary-700">Experience Type</p>
              <p className="text-primary-900">
                {formData.eventType ? getEventTypeDisplayName(formData.eventType) : 'Not selected'}
              </p>
            </div>
            <div>
              <p className="text-sm font-medium text-primary-700">Number of Guests</p>
              <p className="text-primary-900">{formData.partySize || 0} guests</p>
            </div>
          </div>
        </div>

        {/* Date & Time */}
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-lg font-semibold text-primary-900">Date & Time</h4>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onEditStep(2, 'date')}
              className="text-accent-600 text-sm"
            >
              Edit
            </Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p className="text-sm font-medium text-primary-700">Preferred Date</p>
              <p className="text-primary-900">
                {formData.requestedDate ? formatDateForDisplay(formData.requestedDate) : 'Not selected'}
              </p>
            </div>
            <div>
              <p className="text-sm font-medium text-primary-700">Start Time</p>
              <p className="text-primary-900">
                {formData.requestedTime ? formatTimeForDisplay(formData.requestedTime) : 'Not selected'}
              </p>
            </div>
          </div>
        </div>

        {/* Location */}
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-lg font-semibold text-primary-900">Location</h4>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onEditStep(2, 'location')}
              className="text-accent-600 text-sm"
            >
              Edit
            </Button>
          </div>
          <div className="space-y-3">
            <div>
              <p className="text-sm font-medium text-primary-700">Event Location</p>
              <p className="text-primary-900">Your Location</p>
            </div>
            {formData.locationAddress && (
              <div>
                <p className="text-sm font-medium text-primary-700">Address</p>
                <p className="text-primary-900 break-words">{formData.locationAddress}</p>
              </div>
            )}
          </div>
        </div>

        {/* Contact Information */}
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-lg font-semibold text-primary-900">Contact Information</h4>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onEditStep(2, 'contact')}
              className="text-accent-600 text-sm"
            >
              Edit
            </Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p className="text-sm font-medium text-primary-700">Name</p>
              <p className="text-primary-900">
                {formData.firstName && formData.lastName
                  ? `${formData.firstName} ${formData.lastName}`
                  : 'Not provided'}
              </p>
            </div>
            <div>
              <p className="text-sm font-medium text-primary-700">Email</p>
              <p className="text-primary-900">{formData.email || 'Not provided'}</p>
            </div>
            {formData.phone && (
              <div className="md:col-span-2">
                <p className="text-sm font-medium text-primary-700">Phone</p>
                <p className="text-primary-900">{formData.phone}</p>
              </div>
            )}
          </div>
        </div>

        {/* Special Requests */}
        {(formData.specialRequirements || formData.notes) && (
          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-lg font-semibold text-primary-900">Special Requests</h4>
              <Button
                type="button"
                variant="ghost"
                onClick={() => onEditStep(3, 'special')}
                className="text-accent-600 text-sm"
              >
                Edit
              </Button>
            </div>
            <div className="space-y-3">
              {formData.specialRequirements && (
                <div>
                  <p className="text-sm font-medium text-primary-700">Dietary Requirements</p>
                  <p className="text-primary-900">{formData.specialRequirements}</p>
                </div>
              )}
              {formData.notes && (
                <div>
                  <p className="text-sm font-medium text-primary-700">Additional Notes</p>
                  <p className="text-primary-900">{formData.notes}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Pricing Summary */}
        {formData.eventType && formData.partySize && (
          <div className="bg-accent-50 border border-accent-200 rounded-lg p-6">
            <h4 className="text-lg font-semibold text-accent-700 mb-4">Pricing Estimate</h4>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-accent-600">
                  {getEventTypeDisplayName(formData.eventType)} × {formData.partySize} guests
                </span>
                <span className="font-medium text-accent-800">
                  ${pricePerPerson.toFixed(2)} × {formData.partySize}
                </span>
              </div>
              <div className="border-t border-accent-200 pt-3">
                <div className="flex justify-between items-center">
                  <span className="text-lg font-semibold text-accent-700">Total Estimated Cost</span>
                  <span className="text-2xl font-bold text-accent-800">${totalPrice.toFixed(2)}</span>
                </div>
              </div>
            </div>
            <p className="text-sm text-accent-600 mt-3">
              * Final pricing will be confirmed and may include adjustments for location, special requirements, or menu
              customizations.
            </p>
          </div>
        )}
      </div>

      {/* Submit button */}
      <div className="text-center pt-6">
        <Button
          type="button"
          onClick={onSubmit}
          disabled={isSubmitting}
          className="bg-primary-800 hover:bg-primary-900 text-white px-12 py-4 text-xl font-semibold rounded-lg shadow-lg hover:shadow-xl transition-all duration-200 transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
        >
          {isSubmitting ? (
            <span className="flex items-center justify-center">
              <svg
                className="animate-spin -ml-1 mr-3 h-6 w-6 text-white"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                ></path>
              </svg>
              Submitting Request...
            </span>
          ) : (
            'Submit Event Request'
          )}
        </Button>
        <p className="text-sm text-primary-600 mt-3 max-w-md mx-auto">
          No payment required now - you'll receive a secure payment link after your event is confirmed
        </p>
      </div>
    </div>
  );
};

export default RequestSummary;
