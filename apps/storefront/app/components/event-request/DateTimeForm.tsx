import { useState, useEffect } from 'react';
import { useFormContext } from 'react-hook-form';
import type { EventRequestFormData } from '@app/routes/request._index';
import clsx from 'clsx';
import type { FC } from 'react';

export interface DateTimeFormProps {
  className?: string;
}

// Time slots available for booking
const TIME_SLOTS = [
  '10:00',
  '10:30',
  '11:00',
  '11:30',
  '12:00',
  '12:30',
  '13:00',
  '13:30',
  '14:00',
  '14:30',
  '15:00',
  '15:30',
  '16:00',
  '16:30',
  '17:00',
  '17:30',
  '18:00',
  '18:30',
  '19:00',
  '19:30',
  '20:00',
  '20:30',
];

// Popular time slots for quick selection
const POPULAR_TIMES = ['12:00', '17:00', '18:00', '19:00'];

export const DateTimeForm: FC<DateTimeFormProps> = ({ className }) => {
  const {
    watch,
    setValue,
    formState: { errors },
  } = useFormContext<EventRequestFormData>();
  const selectedDate = watch('requestedDate');
  const selectedTime = watch('requestedTime');

  // Calculate minimum date (7 days from now)
  const getMinDate = () => {
    const today = new Date();
    today.setDate(today.getDate() + 7);
    return today.toISOString().split('T')[0];
  };

  // Calculate maximum date (6 months from now)
  const getMaxDate = () => {
    const maxDate = new Date();
    maxDate.setMonth(maxDate.getMonth() + 6);
    return maxDate.toISOString().split('T')[0];
  };

  const [minDate] = useState(getMinDate());
  const [maxDate] = useState(getMaxDate());

  // Helpers to parse a YYYY-MM-DD string as a LOCAL date (avoid UTC off-by-one)
  const parseLocalDate = (dateString: string) => {
    const [y, m, d] = dateString.split('-').map(Number);
    return new Date(y, (m || 1) - 1, d || 1);
  };

  // Format date for display (local)
  const formatDateForDisplay = (dateString: string) => {
    if (!dateString) return '';
    const date = parseLocalDate(dateString);
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  // Format time for display
  const formatTimeForDisplay = (timeString: string) => {
    if (!timeString) return '';
    const [hours, minutes] = timeString.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${minutes} ${ampm}`;
  };

  // Check if selected date is weekend (local)
  const isWeekend = (dateString: string) => {
    if (!dateString) return false;
    const date = parseLocalDate(dateString);
    const day = date.getDay();
    return day === 0 || day === 6; // Sunday or Saturday
  };

  const handleDateChange = (date: string) => {
    setValue('requestedDate', date, { shouldValidate: true });
  };

  const handleTimeChange = (time: string) => {
    setValue('requestedTime', time, { shouldValidate: true });
  };

  return (
    <div className={clsx('space-y-6', className)}>
      {/* Header */}
      <div className="text-center">
        <h3 className="text-lg font-semibold text-primary-900 mb-2">Select Your Preferred Date & Time</h3>
        <p className="text-primary-600">
          Choose when you'd like the chef to arrive. Typically needs about 2 hours before guests sit down to eat. Events
          require minimum 7 days advance notice.
        </p>
      </div>

      {/* Date Selection */}
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-primary-900 mb-3">Preferred Date</label>

          <input
            type="date"
            min={minDate}
            max={maxDate}
            value={selectedDate || ''}
            onChange={(e) => handleDateChange(e.target.value)}
            className={clsx(
              'w-full text-lg px-4 py-3 border-2 rounded-lg focus:ring-2 focus:ring-accent-500 focus:border-accent-500',
              errors.requestedDate ? 'border-red-300 focus:border-red-500 focus:ring-red-500' : 'border-gray-300',
            )}
          />

          {/* Date display and info */}
          {selectedDate && (
            <div className="mt-2 space-y-1">
              <p className="text-sm font-medium text-accent-700">Selected: {formatDateForDisplay(selectedDate)}</p>
              {isWeekend(selectedDate) && (
                <p className="text-sm text-blue-600 bg-blue-50 p-2 rounded">
                  💡 Weekend events are very popular! Consider booking early.
                </p>
              )}
            </div>
          )}

          {/* Error message */}
          {errors.requestedDate && <p className="text-red-600 text-sm mt-1">{errors.requestedDate.message}</p>}
        </div>
      </div>

      {/* Time Selection */}
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-primary-900 mb-3">Preferred Start Time</label>

          {/* Popular times quick selection */}
          <div className="mb-4">
            <p className="text-sm text-primary-700 mb-2">Popular times:</p>
            <div className="flex flex-wrap gap-2">
              {POPULAR_TIMES.map((time) => (
                <button
                  key={time}
                  type="button"
                  onClick={() => handleTimeChange(time)}
                  className={clsx(
                    'px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                    selectedTime === time
                      ? 'bg-accent-500 text-white'
                      : 'bg-accent-100 text-accent-700 hover:bg-accent-200',
                  )}
                >
                  {formatTimeForDisplay(time)}
                </button>
              ))}
            </div>
          </div>

          {/* Full time dropdown */}
          <select
            value={selectedTime || ''}
            onChange={(e) => handleTimeChange(e.target.value)}
            className={clsx(
              'w-full text-lg px-4 py-3 border-2 rounded-lg focus:ring-2 focus:ring-accent-500 focus:border-accent-500',
              errors.requestedTime ? 'border-red-300 focus:border-red-500 focus:ring-red-500' : 'border-gray-300',
            )}
          >
            <option value="">Select a time...</option>
            {TIME_SLOTS.map((time) => (
              <option key={time} value={time}>
                {formatTimeForDisplay(time)}
              </option>
            ))}
          </select>

          {/* Time display and info */}
          {selectedTime && (
            <div className="mt-2">
              <p className="text-sm font-medium text-accent-700">Selected: {formatTimeForDisplay(selectedTime)}</p>
              <p className="text-xs text-primary-600 mt-1">
                This is the chef arrival time. Plan for dining to start roughly 2 hours later.
              </p>
            </div>
          )}

          {/* Error message */}
          {errors.requestedTime && <p className="text-red-600 text-sm mt-1">{errors.requestedTime.message}</p>}
        </div>
      </div>

      {/* Date & Time Summary */}
      {selectedDate && selectedTime && (
        <div className="bg-accent-50 border border-accent-200 rounded-lg p-4">
          <div className="text-center">
            <h4 className="text-lg font-semibold text-accent-700 mb-2">Event Schedule</h4>
            <div className="space-y-1">
              <p className="text-accent-800">
                <span className="font-medium">Date:</span> {formatDateForDisplay(selectedDate)}
              </p>
              <p className="text-accent-800">
                <span className="font-medium">Start Time:</span> {formatTimeForDisplay(selectedTime)}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Important scheduling information */}
      <div className="bg-gray-50 rounded-lg p-4">
        <h4 className="text-sm font-medium text-gray-900 mb-2">Scheduling Information</h4>
        <ul className="text-sm text-gray-600 space-y-1">
          <li>• Minimum 7 days advance notice required</li>
          <li>• Events can be scheduled up to 6 months in advance</li>
          <li>• Start times available from 10:00 AM to 8:30 PM</li>
          <li>• Availability will be confirmed within 24 hours</li>
          <li>• Alternative dates may be suggested if requested time is unavailable</li>
        </ul>
      </div>

      {/* Hidden form fields */}
      <input type="hidden" name="requestedDate" value={selectedDate || ''} />
      <input type="hidden" name="requestedTime" value={selectedTime || ''} />
    </div>
  );
};

export default DateTimeForm;
