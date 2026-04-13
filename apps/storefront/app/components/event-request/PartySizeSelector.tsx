import { useState } from 'react';
import { useFormContext } from 'react-hook-form';
import type { EventRequestFormData } from '@app/routes/request._index';
import { estimatePricePerPersonForRequest, getEventTypeDisplayName } from '@libs/constants/pricing';
import type { StoreExperienceTypeDTO } from '@libs/util/server/data/experience-types.server';
import type { StoreMenuDTO } from '@libs/util/server/data/menus.server';
import clsx from 'clsx';
import type { FC } from 'react';

export interface PartySizeSelectorProps {
  className?: string;
  experienceTypes?: StoreExperienceTypeDTO[];
  menus?: StoreMenuDTO[];
}

const PARTY_SIZE_PRESETS = [2, 4, 6, 8, 10, 12];
const MIN_PARTY_SIZE = 2;
const MAX_PARTY_SIZE = 50;

export const PartySizeSelector: FC<PartySizeSelectorProps> = ({ className, experienceTypes = [], menus = [] }) => {
  const { watch, setValue, formState: { errors } } = useFormContext<EventRequestFormData>();
  const partySize = watch('partySize') || 4;
  const eventType = watch('eventType');
  const experienceTypeId = watch('experienceTypeId');
  const menuId = watch('menuId');
  
  const [inputValue, setInputValue] = useState(partySize.toString());

  const getPrice = () => {
    if (!eventType && !experienceTypeId) return null;
    return estimatePricePerPersonForRequest({
      eventType: eventType || '',
      experienceTypeId,
      experienceTypes,
      menus,
      menuId,
    });
  };

  const price = getPrice();
  const totalPrice = price ? price * partySize : 0;

  const handlePartySizeChange = (newSize: number) => {
    if (newSize >= MIN_PARTY_SIZE && newSize <= MAX_PARTY_SIZE) {
      setValue('partySize', newSize, { shouldValidate: true });
      setInputValue(newSize.toString());
    }
  };

  const handleInputChange = (value: string) => {
    setInputValue(value);
    const numValue = parseInt(value);
    if (!isNaN(numValue) && numValue >= MIN_PARTY_SIZE && numValue <= MAX_PARTY_SIZE) {
      setValue('partySize', numValue, { shouldValidate: true });
    }
  };

  const incrementSize = () => {
    if (partySize < MAX_PARTY_SIZE) {
      handlePartySizeChange(partySize + 1);
    }
  };

  const decrementSize = () => {
    if (partySize > MIN_PARTY_SIZE) {
      handlePartySizeChange(partySize - 1);
    }
  };

  const getEventTypeName = () => {
    return eventType ? getEventTypeDisplayName(eventType) : 'Selected Experience';
  };

  return (
    <div className={clsx('space-y-6', className)}>
      {/* Header */}
      <div className="text-center">
        <h3 className="text-lg font-semibold text-primary-900 mb-2">
          How Many Guests Will Attend?
        </h3>
        <p className="text-primary-600">
          Select the number of guests for your culinary experience.
        </p>
      </div>

      {/* Party size selector */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <div className="space-y-6">
          {/* Manual input with +/- buttons */}
          <div>
            <label className="block text-sm font-medium text-primary-900 mb-3">
              Number of Guests
            </label>
            
            <div className="flex items-center justify-center space-x-4">
              <button
                type="button"
                onClick={decrementSize}
                disabled={partySize <= MIN_PARTY_SIZE}
                className={clsx(
                  "w-12 h-12 rounded-full border-2 flex items-center justify-center text-lg font-semibold transition-colors",
                  partySize > MIN_PARTY_SIZE
                    ? "border-accent-500 text-accent-600 hover:bg-accent-50"
                    : "border-gray-300 text-gray-400 cursor-not-allowed"
                )}
              >
                -
              </button>
              
              <div className="text-center">
                <input
                  type="number"
                  min={MIN_PARTY_SIZE}
                  max={MAX_PARTY_SIZE}
                  value={inputValue}
                  onChange={(e) => handleInputChange(e.target.value)}
                  className="w-20 text-center text-2xl font-bold text-primary-900 border-none bg-transparent focus:outline-none"
                />
                <p className="text-sm text-primary-600">guests</p>
              </div>
              
              <button
                type="button"
                onClick={incrementSize}
                disabled={partySize >= MAX_PARTY_SIZE}
                className={clsx(
                  "w-12 h-12 rounded-full border-2 flex items-center justify-center text-lg font-semibold transition-colors",
                  partySize < MAX_PARTY_SIZE
                    ? "border-accent-500 text-accent-600 hover:bg-accent-50"
                    : "border-gray-300 text-gray-400 cursor-not-allowed"
                )}
              >
                +
              </button>
            </div>
            
            <p className="text-sm text-primary-600 mt-2 text-center">
              Minimum {MIN_PARTY_SIZE} guests, maximum {MAX_PARTY_SIZE} guests
            </p>
          </div>

          {/* Quick selection presets */}
          <div>
            <p className="text-sm font-medium text-primary-900 mb-3">Quick Selection:</p>
            <div className="flex flex-wrap gap-2">
              {PARTY_SIZE_PRESETS.map((size) => (
                <button
                  key={size}
                  type="button"
                  onClick={() => handlePartySizeChange(size)}
                  className={clsx(
                    "px-4 py-2 rounded-lg text-sm font-medium transition-colors border-2",
                    partySize === size
                      ? "bg-accent-500 text-white border-accent-500"
                      : "bg-white text-primary-700 border-gray-200 hover:border-accent-300 hover:bg-accent-50"
                  )}
                >
                  {size} guests
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Pricing display */}
      {eventType && price && (
        <div className="bg-accent-50 border border-accent-200 rounded-lg p-4">
          <div className="text-center">
            <h4 className="text-sm font-semibold text-accent-700 mb-2">
              Pricing Estimate
            </h4>
            <div className="space-y-1">
              <p className="text-sm text-accent-600">
                {getEventTypeName()}
              </p>
              <p className="text-lg font-bold text-accent-800">
                ${price.toFixed(2)} per person
              </p>
              <p className="text-sm text-accent-600">
                Total: ${totalPrice.toFixed(2)} for {partySize} guests
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Error message */}
      {errors.partySize && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-600 text-sm">
            {errors.partySize.message}
          </p>
        </div>
      )}

      {/* Hidden form field */}
      <input type="hidden" name="partySize" value={partySize} />
    </div>
  );
};

export default PartySizeSelector; 