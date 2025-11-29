import { LogoStoreName } from '@app/components/LogoStoreName/LogoStoreName';
import { Container } from '@app/components/common/container/Container';
// import { Select } from '@app/components/common/forms/inputs/Select';
import { URLAwareNavLink } from '@app/components/common/link/URLAwareNavLink';
// import { NewsletterSubscription } from '@app/components/newsletter/Newsletter';
// import { useRegion } from '@app/hooks/useRegion';
// import { useRegions } from '@app/hooks/useRegions';
import { useRootLoaderData } from '@app/hooks/useRootLoaderData';
import { useSiteDetails } from '@app/hooks/useSiteDetails';
// import { convertToFormData } from '@libs/util/forms/objectToFormData';
import clsx from 'clsx';
// import { useMemo } from 'react';
// import { useFetcher } from 'react-router';
import { StripeSecurityImage } from '../../images/StripeSecurityImage';
import { SocialIcons } from './SocialIcons';

export const Footer = () => {
  const { footerNavigationItems, settings } = useSiteDetails();
  const rootData = useRootLoaderData();
  const hasProducts = rootData?.hasPublishedProducts;
  // const fetcher = useFetcher();
  // const { regions } = useRegions();
  // const { region } = useRegion();

  // const regionOptions = useMemo(() => {
  //   return regions.map((region) => ({
  //     label: `${region.name} (${region.currency_code})`,
  //     value: region.id,
  //   }));
  // }, [regions]);

  // const onRegionChange = (regionId: string) => {
  //   fetcher.submit(
  //     convertToFormData({
  //       regionId,
  //     }),
  //     { method: 'post', action: '/api/region' },
  //   );
  // };

  return (
    <footer className="bg-accent-50 min-h-[140px] py-8 text-white">
      <Container>
        {/* Mobile-first responsive grid: stacks on mobile, 2 cols on sm, 3 cols on lg */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 w-full flex-col items-center gap-8 sm:flex-row sm:items-start sm:gap-16">
          {/* Culinary Experiences - Full width on mobile, spans 2 cols on sm, 1 col on lg */}
          <div className="flex w-full flex-col items-center gap-8 sm:w-auto sm:items-start sm:gap-9 sm:col-span-2 lg:col-span-1">
            <div className="flex flex-col gap-5 text-center sm:text-left">
              <h4 className="font-bold">Culinary Experiences</h4>
              <p className="text-sm">
                Premium private chef experiences including cooking classes, plated dinners, and buffet-style events.
                Restaurant-quality cuisine crafted in your home with professional service and unforgettable flavors.
              </p>
            </div>
            <LogoStoreName />
          </div>

          {/* Quick Links - Full width on mobile, 1 col on sm and lg */}
          {footerNavigationItems && footerNavigationItems.length > 0 && (
            <nav className="pt-2 w-full sm:w-auto text-center sm:text-left">
              <h5 className="font-bold mb-4">Quick Links</h5>
              {footerNavigationItems.map(({ id, new_tab, ...navItemProps }) => (
                <URLAwareNavLink
                  key={id}
                  {...navItemProps}
                  newTab={new_tab}
                  className="hover:text-slate-200 block pb-2 text-sm"
                  prefetch="viewport"
                >
                  {navItemProps.label}
                </URLAwareNavLink>
              ))}
            </nav>
          )}

          {/* Payment & Social - Full width on mobile, 1 col on sm and lg */}
          <div className="flex flex-col gap-5 w-full sm:w-auto text-center sm:text-left">
            <div className="flex flex-col gap-4">
              <h5 className="font-bold">Payment</h5>
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-center sm:justify-start gap-2 text-sm">
                  <span>🔒</span>
                  <span>Guaranteed safe & secure checkout</span>
                </div>
                <div className="flex justify-center sm:justify-start">
                  <StripeSecurityImage className="mt-2" />
                </div>
              </div>
            </div>

            <div className="flex justify-center sm:justify-start">
              <SocialIcons siteSettings={settings} />
            </div>

            {/*
            <div className="flex flex-col gap-4 mt-4">
              <h5>Location</h5>
              <p className="text-sm">
                1619 E Cesar Chavez St, Austin, TX 78702
                <br />
                Open 7AM - 4PM Daily
              </p>
            </div>
            */}
          </div>
        </div>
        <div className="flex flex-col max-md:items-center gap-8 mt-8 md:flex-row md:justify-between">
          <div className="flex flex-col gap-8">
            {/*
            <div className="flex items-center gap-2 ">
              <Select
                className="!text-base border-1 border-white text-white bg-transparent !shadow-none"
                options={regionOptions}
                defaultValue={region?.id}
                onChange={(e) => {
                  onRegionChange(e.target.value);
                }}
              />
            </div>

            <a
              href="https://www.lambdacurry.dev/"
              target="_blank"
              rel="noopener noreferrer"
              className="flex flex-col items-start gap-1 text-sm"
            >
              © {new Date().getFullYear()} Made with ❤️ by LambdaCurry
            </a>
            */}
          </div>
        </div>
      </Container>
    </footer>
  );
};
