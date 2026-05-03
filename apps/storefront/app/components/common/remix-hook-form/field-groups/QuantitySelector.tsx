import { StoreProductVariant } from '@medusajs/types';
import clsx from 'clsx';
import { FC } from 'react';
import { Controller } from 'react-hook-form';
import { useRemixFormContext } from 'remix-hook-form';

interface QuantitySelectorProps {
  variant: StoreProductVariant | undefined;
  maxInventory?: number;
  /** Lowest selectable quantity (default 1). Options run from this value up to available inventory. */
  minQuantity?: number;
  className?: string;
  formId?: string;
  onChange?: (quantity: number) => void;
  customInventoryQuantity?: number; // New prop for custom inventory quantity
}

export const QuantitySelector: FC<QuantitySelectorProps> = ({
  className,
  variant,
  maxInventory = 10,
  minQuantity = 1,
  onChange,
  customInventoryQuantity,
}) => {
  const formContext = useRemixFormContext();

  if (!formContext) {
    console.error('QuantitySelector must be used within a RemixFormProvider');
    return null;
  }

  const { control } = formContext;

  const variantInventory =
    customInventoryQuantity !== undefined
      ? customInventoryQuantity
      : variant?.manage_inventory && !variant.allow_backorder
        ? variant.inventory_quantity || 0
        : maxInventory;

  // When `customInventoryQuantity` is provided, trust it as the upper bound;
  // otherwise fall back to the legacy `maxInventory` cap.
  const maxOptions =
    customInventoryQuantity !== undefined
      ? variantInventory
      : Math.min(variantInventory, maxInventory);

  const minQ = Math.max(1, Math.floor(minQuantity))
  const safeMin = Math.min(minQ, Math.max(1, maxOptions))
  const optionCount = Math.max(0, maxOptions - safeMin + 1)
  const optionsArray = Array.from({ length: optionCount }, (_, index) => {
    const value = safeMin + index
    return {
      label: `${value}`,
      value,
    }
  })

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
              value={String(
                optionsArray.some((o) => o.value === Number(field.value))
                  ? field.value
                  : optionsArray[0]?.value ?? 1,
              )}
              onChange={(e) => {
                const value = parseInt(e.target.value, 10);
                field.onChange(value);
                onChange?.(value);
              }}
              disabled={optionsArray.length === 0}
            >
              {optionsArray.length === 0 ? (
                <option value="">No tickets available</option>
              ) : (
                optionsArray.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label} {option.value === 1 ? 'Ticket' : 'Tickets'}
                  </option>
                ))
              )}
            </select>
          </div>
        </div>
      )}
    />
  );
};
