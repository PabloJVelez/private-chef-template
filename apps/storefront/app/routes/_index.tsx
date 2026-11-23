// app/routes/_index.tsx
import * as React from 'react';
import type { LoaderFunctionArgs, MetaFunction } from 'react-router';
import { data } from 'react-router';
import { useLoaderData } from 'react-router';

import { Container } from '@app/components/common/container';
import { Image } from '@app/components/common/images/Image';
import { ChefHero } from '@app/components/chef/ChefHero';
import { FeaturedMenus } from '@app/components/chef/FeaturedMenus';
import { ExperienceTypes } from '@app/components/chef/ExperienceTypes';
import { fetchMenus, type StoreMenuDTO } from '@libs/util/server/data/menus.server';
import { fetchExperienceTypes } from '@libs/util/server/data/experience-types.server';
import { getMergedPageMeta } from '@libs/util/page';
import { getChefConfig } from '@libs/config/chef/chef-config';

const chefConfig = getChefConfig();

export const loader = async (_args: LoaderFunctionArgs) => {
  let menus: any[] = [];
  let experienceTypes: any[] = [];

  try {
    const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Request timeout')), 10000));

    const menusPromise = fetchMenus({ limit: 3 });
    const experienceTypesPromise = fetchExperienceTypes().then((r) => r.experience_types ?? []);

    const [menusData, etData]: any[] = await Promise.race([
      Promise.all([menusPromise, experienceTypesPromise]),
      timeoutPromise,
    ]) as [any, any[]];
    experienceTypes = etData ?? [];

    // Trim to a safe, serializable snapshot to avoid circular/BigInt/etc.
    menus = (menusData?.menus ?? []).map((m: any) => {
      const menu = {
        id: String(m.id),
        name: String(m.name),
        thumbnail: m.thumbnail ?? null,
        created_at: m.created_at ? new Date(m.created_at).toISOString() : null,
        updated_at: m.updated_at ? new Date(m.updated_at).toISOString() : null,
        // Include courses with dishes for MenuListItem component
        courses: Array.isArray(m.courses)
          ? m.courses.slice(0, 2).map((c: any) => ({
              id: String(c.id),
              name: String(c.name),
              dishes: Array.isArray(c.dishes)
                ? c.dishes.slice(0, 3).map((d: any) => ({
                    id: String(d.id),
                    name: String(d.name),
                    description: d.description || '',
                  }))
                : [],
            }))
          : [],
        images: Array.isArray(m.images) ? m.images : [],
      };

      // Debug log for first menu to understand structure
      if (menus.length === 0) {
      }

      return menu;
    });

    // Lightweight server log (shows up in server console)
  } catch (error: any) {
    // Log full server-side error details but don't fail the page
    console.error('Index loader failed to fetch menus:', {
      message: error?.message,
      stack: error?.stack,
      cause: error?.cause,
    });


  }

  return data(
    { menus, experienceTypes },
    {
      headers: {
        'X-Index-Debug': `menus=${menus.length},et=${experienceTypes.length}`,
      },
    },
  );
};

export const meta: MetaFunction<typeof loader> = () => {
  const chefConfig = getChefConfig();
  return [
    { title: chefConfig.seo.title },
    {
      name: 'description',
      content: chefConfig.seo.description,
    },
    { property: 'og:title', content: chefConfig.seo.title },
    {
      property: 'og:description',
      content: chefConfig.seo.description,
    },
    { property: 'og:type', content: 'website' },
    {
      name: 'keywords',
      content: chefConfig.seo.keywords.join(', '),
    },
  ];
};

function FeaturedMenusSection({ menus }: { menus: StoreMenuDTO[] }) {
  return <FeaturedMenus menus={menus} maxDisplay={3} />;
}

export default function IndexRoute() {
  const { menus, experienceTypes } = useLoaderData<typeof loader>();

  return (
    <>
      <ChefHero
        className="h-[800px] !max-w-full -mt-[calc(var(--mkt-header-height)+3rem)] md:-mt-[calc(var(--mkt-header-height-desktop)+2rem)] pt-[var(--mkt-header-height)] md:pt-[var(--mkt-header-height-desktop)]"
      />

      <FeaturedMenusSection menus={menus} />

      <ExperienceTypes apiExperienceTypes={experienceTypes} />

      <Container className="py-12 lg:py-24">
        {/* Mobile: show section title above the image with subtle underline */}
        <div className="lg:hidden text-center mb-6 pt-4">
          <h2 className="text-5xl font-italiana text-primary-900">Meet {chefConfig.name}</h2>
          <div className="w-16 mx-auto mt-3 border-t-2 border-blue-500" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <div className="relative order-1 lg:order-1">
            <Image
              src={chefConfig.portrait}
              loading="lazy"
              alt={chefConfig.displayName}
              className="rounded-2xl shadow-lg w-full h-[500px] object-cover"
              height={500}
              width={600}
            />
            <div className="absolute -bottom-6 -right-6 w-24 h-24 bg-accent-500 rounded-full opacity-20"></div>
          </div>

          <div className="order-2 lg:order-2 text-center lg:text-left space-y-6">
            <div className="space-y-4">
              <h2 className="hidden lg:block text-5xl md:text-6xl lg:text-7xl font-italiana text-primary-900">
                Meet {chefConfig.name}
              </h2>
            </div>

            {/* Biography paragraphs */}
            <div className="space-y-4 text-primary-700">
              {chefConfig.bio.long.map((paragraph, index) => (
                <p key={index} className={index === 0 ? 'text-lg leading-relaxed' : 'text-base leading-relaxed'}>
                  {paragraph}
                </p>
              ))}
            </div>

            <div className="flex flex-wrap gap-4 justify-center lg:justify-start">
              {chefConfig.credentials.highlights.map((highlight, index) => (
                <div key={index} className="bg-accent-100 px-4 py-2 rounded-full">
                  <span className="text-sm font-medium text-accent-700">{highlight}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Container>

    </>
  );
}

// Route-scoped ErrorBoundary so the real stack hits your server logs.
export function ErrorBoundary({ error }: { error: unknown }) {
  const e = error as any;
  console.error('IndexRoute ErrorBoundary:', {
    name: e?.name,
    message: e?.message,
    stack: e?.stack,
    cause: e?.cause,
  });

  return (
    <Container className="py-16">
      <div className="rounded-xl border p-6 bg-red-50">
        <h2 className="text-xl font-semibold mb-2">Something went wrong.</h2>
        <p className="text-sm text-red-700">
          {process.env.NODE_ENV === 'development' ? (e?.message ?? 'Unknown error') : 'Please try again in a bit.'}
        </p>
      </div>
    </Container>
  );
}
