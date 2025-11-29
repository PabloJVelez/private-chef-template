import { Container } from '@app/components/common/container';
import Hero from '@app/components/sections/Hero';
import { getMergedPageMeta } from '@libs/util/page';
import { getChefConfig } from '@libs/config/chef/chef-config';
import type { LoaderFunctionArgs, MetaFunction } from 'react-router';

const chefConfig = getChefConfig();

// Remove coffee shop location blocks; not applicable for chef About page.
const locations: LocationProps[] = [];

export const loader = async (args: LoaderFunctionArgs) => {
  return {};
};

export const meta: MetaFunction<typeof loader> = getMergedPageMeta;

type LocationProps = {
  title: string;
  hours: string[];
  phone: string;
  addressLines: string[];
  imageUrl: string;
};

const Location = ({ title, addressLines, phone, hours, imageUrl }: LocationProps) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-16 text-xl">
      <div className="w-full h-full flex items-center justify-center col-span-2">
        <div
          className="bg-cover bg-no-repeat bg-center w-full rounded-3xl h-72"
          style={{
            backgroundImage: `url(${imageUrl})`,
          }}
        />
      </div>

      <div className="flex flex-col gap-4 col-span-1 md:justify-center">
        <h3 className="text-2xl font-bold">{title}</h3>
        <div>
          {addressLines.map((line) => (
            <p>{line}</p>
          ))}
          <p>p. {phone}</p>
        </div>
        <div>
          <h4 className="font-bold">Hours</h4>
          {hours.map((hour) => (
            <p>{hour}</p>
          ))}
        </div>
      </div>
    </div>
  );
};

export default function IndexRoute() {
  return (
    <>
      <Container className="!px-0 py-0 sm:!p-16">
        <Hero
          className="min-h-[400px] !max-w-full bg-accent-50 sm:rounded-3xl p-6 sm:p-10 md:p-[88px] md:px-[88px]"
          content={
            <div className="text-center w-full space-y-9">
              <h4 className="text-lg md:text-2xl font-italiana tracking-wider">ABOUT THE CHEF</h4>
              <h1 className="text-4xl md:text-8xl font-italiana tracking-wider [text-shadow:_1px_1px_2px_rgb(0_0_0_/_40%)]">
                {chefConfig.displayName}
              </h1>
              <p className="mx-auto text-md md:text-2xl !leading-normal">
                {chefConfig.bio.short} With years of professional experience, crafting unforgettable menus using fresh,
                seasonal ingredients and providing a seamless, restaurant-quality experience in your home.
              </p>
            </div>
          }
          actionsClassName="!flex-row w-full justify-center !font-base"
          actions={[
            {
              label: 'View Menus',
              url: '/menus',
            },
            {
              label: 'Request an Event',
              url: '/request',
            },
          ]}
        />
      </Container>

      <Container className="pt-4 flex flex-col gap-16 py-0 sm:!px-16 pb-44">
        <div className="font-italiana text-4xl break-words md:text-6xl lg:text-7xl">
          Experiences crafted with passion, precision, and hospitality
        </div>
        {locations.map((location) => (
          <Location {...location} />
        ))}
      </Container>
    </>
  );
}
