import { useState } from 'react';
import { useFormContext } from 'react-hook-form';
import type { EventRequestFormData } from '@app/routes/request._index';
import clsx from 'clsx';
import type { FC } from 'react';

interface Address {
  address1: string;
  address2: string;
  city: string;
  province: string;
  countryCode: string;
  postalCode: string;
}

interface AddressData {
  address: Address;
  completed: boolean;
}

export interface LocationFormProps {
  className?: string;
}

export const LocationForm: FC<LocationFormProps> = ({ className }) => {
  const { watch, setValue } = useFormContext<EventRequestFormData>();

  // Address-only structure (contact details collected separately)
  const [address, setAddress] = useState<AddressData>({
    address: {
      address1: '',
      address2: '',
      city: '',
      province: '',
      countryCode: 'us',
      postalCode: '',
    },
    completed: false,
  });

  const handleAddressChange = (field: keyof Address, value: string) => {
    const newAddress = {
      ...address,
      address: {
        ...address.address,
        [field]: value,
      },
    };
    setAddress(newAddress);

    // Required address fields
    const requiredFields: (keyof Address)[] = ['address1', 'city', 'province', 'postalCode'];
    newAddress.completed = requiredFields.every((f) => !!newAddress.address[f]);

    // Format address for form submission
    const formattedAddress = [
      newAddress.address.address1,
      newAddress.address.address2,
      newAddress.address.city,
      newAddress.address.province,
      newAddress.address.postalCode,
      newAddress.address.countryCode,
    ]
      .filter(Boolean)
      .join(', ');

    setValue('locationAddress', formattedAddress, { shouldValidate: true });
  };

  return (
    <div className={clsx('space-y-6', className)}>
      {/* Header */}
      <div className="text-center">
        <h3 className="text-lg font-semibold text-primary-900 mb-2">Event Location</h3>
        <p className="text-primary-600">Please provide the address where your culinary experience will take place.</p>
      </div>

      {/* Address Form */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h4 className="text-sm font-medium text-gray-900 mb-4">Event Location Address</h4>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">Street Address *</label>
            <input
              type="text"
              value={address.address.address1}
              onChange={(e) => handleAddressChange('address1', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="123 Main St"
            />
          </div>

          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">Apartment, suite, etc. (optional)</label>
            <input
              type="text"
              value={address.address.address2}
              onChange={(e) => handleAddressChange('address2', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Apt 4B"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">City *</label>
            <input
              type="text"
              value={address.address.city}
              onChange={(e) => handleAddressChange('city', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="New York"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">State *</label>
            <input
              type="text"
              value={address.address.province}
              onChange={(e) => handleAddressChange('province', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="NY"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">ZIP Code *</label>
            <input
              type="text"
              value={address.address.postalCode}
              onChange={(e) => handleAddressChange('postalCode', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="10001"
            />
          </div>
        </div>
      </div>

      {/* Address Guidelines */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h4 className="text-sm font-medium text-blue-900 mb-2">📍 Address Guidelines</h4>
        <ul className="text-sm text-blue-800 space-y-1">
          <li>• Please provide the complete address where the event will take place</li>
          <li>• Include apartment/unit number if applicable</li>
          <li>• The chef will arrive with all necessary equipment and ingredients</li>
          <li>• Travel within 30 miles is included in the service</li>
        </ul>
      </div>

      {/* Selected address summary */}
      {address.address.address1 && (
        <div className="bg-accent-50 border border-accent-200 rounded-lg p-4">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <h4 className="text-sm font-semibold text-accent-700 mb-1">Event Location</h4>
              <p className="text-sm text-accent-600 break-words">
                {address.address.address1}
                {address.address.address2 && `, ${address.address.address2}`}
                {address.address.city && `, ${address.address.city}`}
                {address.address.province && `, ${address.address.province}`}
                {address.address.postalCode && ` ${address.address.postalCode}`}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setAddress({
                  address: {
                    address1: '',
                    address2: '',
                    city: '',
                    province: '',
                    countryCode: 'us',
                    postalCode: '',
                  },
                  completed: false,
                });
                setValue('locationAddress', '');
              }}
              className="text-accent-600 text-sm hover:text-accent-700 flex-shrink-0 ml-4"
            >
              Change
            </button>
          </div>
        </div>
      )}

      {/* Hidden form fields */}
      <input type="hidden" name="locationAddress" value={watch('locationAddress') || ''} />
    </div>
  );
};

export default LocationForm;
