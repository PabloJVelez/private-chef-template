import { useMealPrep } from '@app/providers/meal-prep-provider';
import { NavigationItemLocation } from '@libs/types';
import { useRootLoaderData } from './useRootLoaderData';

export const useSiteDetails = () => {
  const data = useRootLoaderData();

  const { navigation } = useMealPrep();
  const details = data.siteDetails || {};
  return {
    ...details,
    headerNavigationItems:
      navigation?.status === 'available'
        ? [
            ...(details.headerNavigationItems || []),
            {
              id: 6,
              label: 'Meal Prep',
              url: '/meal-prep',
              sort_order: 5,
              location: NavigationItemLocation.header,
              new_tab: false,
            },
          ]
        : details.headerNavigationItems,
  };
};
