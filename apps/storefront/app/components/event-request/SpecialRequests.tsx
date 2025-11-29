import { useState } from 'react';
import { useFormContext } from 'react-hook-form';
import type { EventRequestFormData } from '@app/routes/request._index';
import clsx from 'clsx';
import type { FC } from 'react';

export interface SpecialRequestsProps {
  className?: string;
}

// Common dietary restrictions
const DIETARY_RESTRICTIONS = [
  'Vegetarian',
  'Vegan',
  'Gluten-Free',
  'Dairy-Free',
  'Nut Allergies',
  'Seafood Allergies',
  'Shellfish Allergies',
  'Egg Allergies',
  'Keto/Low-Carb',
  'Paleo',
  'Halal',
  'Kosher',
];

export const SpecialRequests: FC<SpecialRequestsProps> = ({ className }) => {
  const {
    watch,
    setValue,
    formState: { errors },
  } = useFormContext<EventRequestFormData>();
  const notes = watch('notes');
  const specialRequirements = watch('specialRequirements');

  const [selectedDietaryRestrictions, setSelectedDietaryRestrictions] = useState<string[]>([]);

  const handleDietaryRestrictionToggle = (restriction: string) => {
    const newRestrictions = selectedDietaryRestrictions.includes(restriction)
      ? selectedDietaryRestrictions.filter((r) => r !== restriction)
      : [...selectedDietaryRestrictions, restriction];

    setSelectedDietaryRestrictions(newRestrictions);

    // Persist selection summary in specialRequirements
    const restrictionsText = newRestrictions.length > 0 ? `Dietary Restrictions: ${newRestrictions.join(', ')}` : '';
    setValue('specialRequirements', restrictionsText, { shouldValidate: true });
  };

  const handleNotesChange = (value: string) => {
    setValue('notes', value, { shouldValidate: true });
  };

  return (
    <div className={clsx('space-y-6', className)}>
      {/* Header */}
      <div className="text-center">
        <h3 className="text-lg font-semibold text-primary-900 mb-2">Special Requests & Dietary Needs</h3>
        <p className="text-primary-600">
          Help us customize your experience by sharing any dietary restrictions or special requests.
        </p>
      </div>

      {/* Dietary restrictions */}
      <div>
        <h4 className="text-sm font-medium text-primary-900 mb-3">Dietary Restrictions & Allergies</h4>
        <p className="text-sm text-primary-600 mb-4">
          Select any dietary restrictions or allergies that apply to your guests:
        </p>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {DIETARY_RESTRICTIONS.map((restriction) => {
            const isSelected = selectedDietaryRestrictions.includes(restriction);
            return (
              <button
                key={restriction}
                type="button"
                onClick={() => handleDietaryRestrictionToggle(restriction)}
                className={clsx(
                  'px-3 py-2 rounded-lg text-sm font-medium transition-colors border-2 text-center',
                  isSelected
                    ? 'bg-accent-500 text-white border-accent-500'
                    : 'bg-white text-primary-700 border-gray-200 hover:border-accent-300 hover:bg-accent-50',
                )}
              >
                {restriction}
              </button>
            );
          })}
        </div>

        {selectedDietaryRestrictions.length > 0 && (
          <div className="mt-4 p-3 bg-accent-50 border border-accent-200 rounded-lg">
            <h5 className="text-sm font-medium text-accent-700 mb-1">Selected Dietary Restrictions:</h5>
            <p className="text-sm text-accent-600">{selectedDietaryRestrictions.join(', ')}</p>
          </div>
        )}
      </div>

      {/* Single free-text section */}
      <div>
        <label className="block text-sm font-medium text-primary-900 mb-3">Additional Notes & Special Requests</label>
        <textarea
          value={notes || ''}
          onChange={(e) => handleNotesChange(e.target.value)}
          placeholder="Share any details, special occasions, preferences, allergies, or questions..."
          rows={5}
          className={clsx(
            'w-full px-4 py-3 border-2 rounded-lg focus:ring-2 focus:ring-accent-500 focus:border-accent-500 resize-none',
            errors.notes ? 'border-red-300 focus:border-red-500 focus:ring-red-500' : 'border-gray-300',
          )}
        />
        {errors.notes && <p className="text-red-600 text-sm mt-1">{errors.notes.message}</p>}
      </div>

      {/* Summary of special requests */}
      {(specialRequirements || notes) && (
        <div className="bg-accent-50 border border-accent-200 rounded-lg p-4">
          <h4 className="text-sm font-semibold text-accent-700 mb-2">Special Requests Summary</h4>
          <div className="space-y-2 text-sm text-accent-600">
            {specialRequirements && (
              <div>
                <span className="font-medium">Dietary Requirements:</span>
                <p className="mt-1">{specialRequirements}</p>
              </div>
            )}
            {notes && (
              <div>
                <span className="font-medium">Additional Notes:</span>
                <p className="mt-1">{notes}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Hidden field keeps dietary restriction summary */}
      <input type="hidden" name="specialRequirements" value={specialRequirements || ''} />
      <input type="hidden" name="notes" value={notes || ''} />
    </div>
  );
};

export default SpecialRequests;
