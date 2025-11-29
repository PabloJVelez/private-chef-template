import { Button } from '@app/components/common/buttons/Button';
import { Container } from '@app/components/common/container/Container';
import { Grid } from '@app/components/common/grid/Grid';
import { GridColumn } from '@app/components/common/grid/GridColumn';
import { SubmitButton } from '@app/components/common/remix-hook-form/buttons/SubmitButton';
import { QuantitySelector } from '@app/components/common/remix-hook-form/field-groups/QuantitySelector';
import { ProductPrice } from '@app/components/product/ProductPrice';
import { Share } from '@app/components/share';
import { useCart } from '@app/hooks/useCart';
import { useRegion } from '@app/hooks/useRegion';
import { FetcherKeys } from '@libs/util/fetcher-keys';
import { formatPrice, getVariantPrices } from '@libs/util/prices';
import { isEventProduct, parseEventSku, getEventVariant } from '@libs/util/products';
import { StoreProduct } from '@medusajs/types';
import { useCallback, useRef } from 'react';
import { useFetcher } from 'react-router';
import { RemixFormProvider, useRemixForm } from 'remix-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import clsx from 'clsx';

// Schema for add to cart form
const addToCartSchema = z.object({
  productId: z.string(),
  options: z.record(z.string()),
  quantity: z.number().min(1),
});

type AddToCartFormData = z.infer<typeof addToCartSchema>;

export interface EventProductDetailsProps {
  product: StoreProduct;
  chefEvent?: any; // Will be fetched from backend
  menu?: any; // Will be fetched from backend
}

/**
 * Enhanced product details component for event products
 * Displays event-specific information like date, time, location, party size
 */
export const EventProductDetails = ({ product, chefEvent, menu }: EventProductDetailsProps) => {
  const formRef = useRef<HTMLFormElement>(null);
  const addToCartFetcher = useFetcher<any>({ key: FetcherKeys.cart.createLineItem });
  const { toggleCartDrawer } = useCart();
  const { region } = useRegion();

  const eventVariant = getEventVariant(product);
  const eventInfo = eventVariant?.sku ? parseEventSku(eventVariant.sku) : null;

  if (!isEventProduct(product) || !eventInfo) {
    return null; // Not an event product, don't render
  }

  // Check if event is sold out
  const soldOut = !eventVariant || (eventVariant.inventory_quantity || 0) <= 0;
  const isAddingToCart = ['submitting', 'loading'].includes(addToCartFetcher.state);

  // Get inventory quantity with fallback
  const getInventoryQuantity = () => {
    if (eventVariant?.inventory_quantity !== undefined && eventVariant?.inventory_quantity !== null) {
      if (eventVariant.inventory_quantity === 0 && eventVariant.manage_inventory) {
        return chefEvent?.partySize || 10; // Use party size as fallback
      }
      return eventVariant.inventory_quantity;
    }
    // Fallback: if manage_inventory is true but no quantity, assume it's available
    if (eventVariant?.manage_inventory) {
      return 10; // Default to 10 tickets available
    }
    return 0;
  };

  const inventoryQuantity = getInventoryQuantity();
  const isSoldOut = inventoryQuantity <= 0;

  // Get the option values for the event variant
  const getEventVariantOptions = () => {
    if (!eventVariant?.options) return {};

    const options: Record<string, string> = {};
    eventVariant.options.forEach((option) => {
      if (option.option_id && option.value) {
        options[option.option_id] = option.value;
      }
    });

    return options;
  };

  const eventVariantOptions = getEventVariantOptions();

  // Setup form with remix-hook-form
  const form = useRemixForm<AddToCartFormData>({
    resolver: zodResolver(addToCartSchema),
    defaultValues: {
      productId: product.id,
      options: eventVariantOptions,
      quantity: 1,
    },
  });

  // Format event date and time from product description
  const formatEventDateTime = () => {
    // Extract date and time from product description
    // Format: "Private chef event for {name} on {date} at {time}"
    const description = product.description || '';
    const dateMatch = description.match(/on ([^,]+)/);
    const timeMatch = description.match(/at (\d{1,2}:\d{2})/);

    if (dateMatch && timeMatch) {
      // Simple date formatting without luxon
      const dateStr = dateMatch[1];
      const timeStr = timeMatch[1];

      return {
        date: dateStr, // Will format properly when we have the actual data
        time: timeStr,
      };
    }

    return null;
  };

  const eventDateTime = formatEventDateTime();
  const pricePerPerson = eventVariant ? getVariantPrices(eventVariant).original || 0 : 0;
  const totalPrice = pricePerPerson * (chefEvent?.partySize || 0);

  // Handle add to cart submission
  const handleAddToCart = useCallback(() => {
    toggleCartDrawer(true);
  }, [toggleCartDrawer]);

  return (
    <Container className="px-0 sm:px-6 md:px-8">
      <Grid>
        <GridColumn>
          <div className="md:py-6">
            <Grid className="!gap-0">
              <GridColumn className="mb-8 md:col-span-6 lg:col-span-7 xl:pr-16 xl:pl-9">
                {/* Hero Section with Enhanced Design */}
                <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-orange-50 via-amber-50 to-yellow-50 p-8 mb-8 shadow-lg">
                  {/* Decorative background elements */}
                  <div className="absolute top-0 right-0 w-32 h-32 bg-orange-100 rounded-full opacity-20 -translate-y-16 translate-x-16"></div>
                  <div className="absolute bottom-0 left-0 w-24 h-24 bg-amber-100 rounded-full opacity-30 translate-y-12 -translate-x-12"></div>

                  <div className="relative z-10">
                    <div className="flex items-center gap-4 mb-6">
                      <div className="w-16 h-16 bg-gradient-to-br from-orange-500 to-amber-500 rounded-2xl flex items-center justify-center shadow-lg">
                        <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                          />
                        </svg>
                      </div>
                      <div>
                        <h1 className="text-3xl font-bold text-gray-900 mb-1">Private Chef Event</h1>
                        <p className="text-orange-600 font-semibold text-lg">Exclusive Experience</p>
                      </div>
                    </div>

                    {eventDateTime && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="bg-white/80 backdrop-blur-sm rounded-xl p-4 border border-orange-200">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
                              <svg
                                className="w-5 h-5 text-orange-600"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                                />
                              </svg>
                            </div>
                            <div>
                              <p className="text-sm text-gray-600 font-medium">Date</p>
                              <p className="text-lg font-bold text-gray-900">{eventDateTime.date}</p>
                            </div>
                          </div>
                        </div>

                        <div className="bg-white/80 backdrop-blur-sm rounded-xl p-4 border border-orange-200">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
                              <svg
                                className="w-5 h-5 text-orange-600"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                                />
                              </svg>
                            </div>
                            <div>
                              <p className="text-sm text-gray-600 font-medium">Time</p>
                              <p className="text-lg font-bold text-gray-900">{eventDateTime.time}</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Event Details Section with Enhanced Design */}
                <div className="bg-white rounded-2xl border border-gray-200 p-8 mb-8 shadow-sm hover:shadow-md transition-shadow">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
                      <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                        />
                      </svg>
                    </div>
                    <h3 className="text-2xl font-bold text-gray-900">Event Details</h3>
                  </div>

                  <div className="space-y-6">
                    <div className="flex justify-between items-center py-3 border-b border-gray-100">
                      <span className="text-gray-600 font-medium">Event Type</span>
                      <span className="font-bold text-gray-900">
                        {eventInfo.type === 'cooking_class' && "Chef's Cooking Class"}
                        {eventInfo.type === 'plated_dinner' && 'Plated Dinner Service'}
                        {eventInfo.type === 'buffet_style' && 'Buffet Style Service'}
                      </span>
                    </div>

                    <div className="flex justify-between items-center py-3">
                      <span className="text-gray-600 font-medium">Price per Person</span>
                      <span className="font-bold text-2xl text-gray-900">
                        {formatPrice(pricePerPerson, { currency: 'usd' })}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Menu Information with Enhanced Design */}
                {menu && (
                  <div className="bg-white rounded-2xl border border-gray-200 p-8 mb-8 shadow-sm hover:shadow-md transition-shadow">
                    <div className="flex items-center gap-3 mb-6">
                      <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center">
                        <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.746 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
                          />
                        </svg>
                      </div>
                      <h3 className="text-2xl font-bold text-gray-900">Menu Details</h3>
                    </div>
                    <div className="space-y-4">
                      <div className="flex justify-between items-center">
                        <span className="text-gray-600 font-medium">Menu</span>
                        <span className="font-bold text-gray-900">{menu.title}</span>
                      </div>
                      {menu.courses && menu.courses.length > 0 && (
                        <div className="flex justify-between items-center">
                          <span className="text-gray-600 font-medium">Courses</span>
                          <span className="font-bold text-gray-900">{menu.courses.length}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Chef Information with Enhanced Design */}
                <div className="bg-white rounded-2xl border border-gray-200 p-8 shadow-sm hover:shadow-md transition-shadow">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center">
                      <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                        />
                      </svg>
                    </div>
                    <h3 className="text-2xl font-bold text-gray-900">About Your Chef</h3>
                  </div>
                  <div className="flex items-center gap-6">
                    <div className="w-20 h-20 bg-gradient-to-br from-orange-400 to-amber-500 rounded-full flex items-center justify-center shadow-lg">
                      <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                        />
                      </svg>
                    </div>
                    <div className="flex-1">
                      <h4 className="text-xl font-bold text-gray-900 mb-2">Your Private Chef</h4>
                      <p className="text-gray-600 font-medium mb-1">Professional culinary experience</p>
                      <p className="text-sm text-gray-500">Specializing in custom culinary experiences</p>
                    </div>
                  </div>
                </div>
              </GridColumn>

              <GridColumn className="flex flex-col md:col-span-6 lg:col-span-5">
                <div className="px-0 sm:px-6 md:p-10 md:pt-0">
                  {/* Event Ticket Purchase Section with Enhanced Design */}
                  <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-orange-50 via-amber-50 to-yellow-50 p-8 mb-8 shadow-lg">
                    {/* Decorative elements */}
                    <div className="absolute top-0 right-0 w-24 h-24 bg-orange-100 rounded-full opacity-20 -translate-y-12 translate-x-12"></div>

                    <div className="relative z-10">
                      <div className="flex items-center gap-3 mb-6">
                        <div className="w-12 h-12 bg-gradient-to-br from-orange-500 to-amber-500 rounded-xl flex items-center justify-center shadow-lg">
                          <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z"
                            />
                          </svg>
                        </div>
                        <h3 className="text-2xl font-bold text-gray-900">Purchase Event Tickets</h3>
                      </div>

                      <p className="text-gray-600 mb-6 leading-relaxed">
                        Secure your spot for this exclusive chef experience. Tickets are limited to the event party
                        size.
                      </p>

                      <div className="space-y-4">
                        <div className="flex justify-between items-center py-3 bg-white/80 backdrop-blur-sm rounded-xl px-4">
                          <span className="text-gray-600 font-medium">Available Tickets</span>
                          <span className="font-bold text-lg text-gray-900">{inventoryQuantity} remaining</span>
                        </div>

                        <div className="flex justify-between items-center py-3 bg-white/80 backdrop-blur-sm rounded-xl px-4">
                          <span className="text-gray-600 font-medium">Price per Ticket</span>
                          <span className="font-bold text-xl text-gray-900">
                            {formatPrice(pricePerPerson, { currency: 'usd' })}
                          </span>
                        </div>
                      </div>

                      <RemixFormProvider {...form}>
                        <addToCartFetcher.Form
                          id="addToCartForm"
                          ref={formRef}
                          method="post"
                          action="/api/cart/line-items/create"
                          onSubmit={handleAddToCart}
                        >
                          <input type="hidden" name="productId" value={product.id} />
                          {Object.entries(eventVariantOptions).map(([optionId, value]) => (
                            <input key={optionId} type="hidden" name={`options.${optionId}`} value={value} />
                          ))}

                          <div className="space-y-4">
                            {!isSoldOut && (
                              <div className="bg-white/90 backdrop-blur-sm rounded-xl p-4 border border-white/20">
                                <div className="flex items-center justify-between mb-3">
                                  <span className="text-white font-semibold text-lg">Number of Tickets</span>
                                  <span className="text-orange-200 text-sm font-medium">Max: {inventoryQuantity}</span>
                                </div>
                                <QuantitySelector
                                  variant={eventVariant}
                                  className="w-full"
                                  customInventoryQuantity={inventoryQuantity}
                                />
                              </div>
                            )}

                            <SubmitButton
                              disabled={isSoldOut}
                              className={clsx(
                                'w-full bg-gradient-to-r from-orange-500 to-red-500 text-white hover:from-orange-600 hover:to-red-600 font-bold py-5 rounded-xl shadow-lg hover:shadow-xl transition-all duration-200 text-lg',
                                isSoldOut &&
                                  'opacity-50 cursor-not-allowed bg-gray-400 hover:from-gray-400 hover:to-gray-400',
                              )}
                            >
                              {isAddingToCart ? 'Adding to Cart...' : isSoldOut ? 'Sold Out' : 'Purchase Tickets'}
                            </SubmitButton>
                          </div>
                        </addToCartFetcher.Form>
                      </RemixFormProvider>
                    </div>
                  </div>

                  {/* Share Section with Enhanced Design */}
                  <div className="bg-white rounded-2xl border border-gray-200 p-8 mb-8 shadow-sm hover:shadow-md transition-shadow">
                    <div className="flex items-center gap-3 mb-6">
                      <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
                        <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.367 2.684 3 3 0 00-5.367-2.684z"
                          />
                        </svg>
                      </div>
                      <h3 className="text-xl font-bold text-gray-900">Share This Event</h3>
                    </div>
                    <p className="text-gray-600 mb-6 leading-relaxed">
                      Invite friends and family to join this exclusive culinary experience.
                    </p>
                    <Share
                      itemType="product"
                      shareData={{
                        title: product.title,
                        text: `Join me for an exclusive chef experience: ${product.title}`,
                      }}
                    />
                  </div>

                  {/* Important Information with Enhanced Design */}
                  <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl p-8 border border-blue-200 shadow-sm">
                    <div className="flex items-center gap-3 mb-6">
                      <div className="w-10 h-10 bg-blue-500 rounded-xl flex items-center justify-center">
                        <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                          />
                        </svg>
                      </div>
                      <h3 className="text-xl font-bold text-blue-900">Important Information</h3>
                    </div>
                    <ul className="space-y-4">
                      <li className="flex items-start gap-3">
                        <div className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                          <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                            <path
                              fillRule="evenodd"
                              d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                              clipRule="evenodd"
                            />
                          </svg>
                        </div>
                        <span className="text-blue-800 font-medium">All dietary restrictions will be accommodated</span>
                      </li>
                      <li className="flex items-start gap-3">
                        <div className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                          <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                            <path
                              fillRule="evenodd"
                              d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                              clipRule="evenodd"
                            />
                          </svg>
                        </div>
                        <span className="text-blue-800 font-medium">Chef will arrive 30 minutes before event time</span>
                      </li>
                      <li className="flex items-start gap-3">
                        <div className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                          <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                            <path
                              fillRule="evenodd"
                              d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                              clipRule="evenodd"
                            />
                          </svg>
                        </div>
                        <span className="text-blue-800 font-medium">Full payment required to confirm booking</span>
                      </li>
                    </ul>
                  </div>
                </div>
              </GridColumn>
            </Grid>
          </div>
        </GridColumn>
      </Grid>
    </Container>
  );
};
