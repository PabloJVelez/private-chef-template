import { StoreProductVariant } from '@medusajs/types';
import clsx from 'clsx';
import { FC } from 'react';
import { Controller } from 'react-hook-form';
import { useRemixFormContext } from 'remix-hook-form';

interface QuantitySelectorProps {
  variant: StoreProductVariant | undefined;
  maxInventory?: number;
  className?: string;
  formId?: string;
  onChange?: (quantity: number) => void;
  customInventoryQuantity?: number; // New prop for custom inventory quantity
}

export const QuantitySelector: FC<QuantitySelectorProps> = ({ className, variant, maxInventory = 10, onChange, customInventoryQuantity }) => {
  const formContext = useRemixFormContext();

  if (!formContext) {
    console.error('QuantitySelector must be used within a RemixFormProvider');
    return null;
  }

  const { control } = formContext;

  const variantInventory = customInventoryQuantity !== undefined 
    ? customInventoryQuantity 
    : (variant?.manage_inventory && !variant.allow_backorder ? variant.inventory_quantity || 0 : maxInventory);

  // Debug logging for inventory calculation issues
  if (customInventoryQuantity !== undefined && variant?.inventory_quantity === 0) {
    console.log('🎫 QuantitySelector using custom inventory quantity:', {
      variantId: variant?.id,
      variantInventoryQuantity: variant?.inventory_quantity,
      customInventoryQuantity,
      calculatedVariantInventory: variantInventory
    });
  }

  // When customInventoryQuantity is provided, use it directly without maxInventory cap
  // Otherwise, use the maxInventory as a fallback cap for backwards compatibility
  const maxOptions = customInventoryQuantity !== undefined 
    ? variantInventory 
    : Math.min(variantInventory, maxInventory);

  const optionsArray = [...Array(maxOptions)].map((_, index) => ({
    label: `${index + 1}`,
    value: index + 1,
  }));

  return (
    <Controller
      name="quantity"
      control={control}
      render={({ field }) => (
        <div className={clsx('w-full', className)}>
          <label htmlFor="quantity" className="sr-only">
            Quantity
          </label>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-600 font-medium">Tickets</span>
            <select
              {...field}
              className="focus:border-orange-500 focus:ring-orange-500 !h-14 !w-full rounded-xl border-2 border-gray-200 pl-20 pr-4 text-lg font-semibold bg-white shadow-sm hover:border-orange-300 transition-colors"
              value={String(field.value ?? 1)}
              onChange={(e) => {
                const value = parseInt(e.target.value, 10);
                field.onChange(value);
                onChange?.(value);
              }}
            >
              {optionsArray.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label} {option.value === 1 ? 'Ticket' : 'Tickets'}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}
    />
  );
};
