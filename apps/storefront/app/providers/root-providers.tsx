import { MealPrepProvider } from './meal-prep-provider';
import { StorefrontProvider, storefrontInitialState } from '@app/providers/storefront-provider';
import { FC, PropsWithChildren } from 'react';
import { TooltipProvider } from '@medusajs/ui';

export const RootProviders: FC<PropsWithChildren> = ({ children }) => (
  <TooltipProvider>
    <StorefrontProvider data={storefrontInitialState}>
      <MealPrepProvider>{children}</MealPrepProvider>
    </StorefrontProvider>
  </TooltipProvider>
);
