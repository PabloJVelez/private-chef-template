import { Breadcrumbs } from '@app/components/common/breadcrumbs';
import { Container } from '@app/components/common/container';
import { MenuCarousel } from '@app/components/menu/MenuCarousel';
import HomeIcon from '@heroicons/react/24/solid/HomeIcon';
import { fetchMenus } from '@libs/util/server/data/menus.server';
import { getMergedPageMeta } from '@libs/util/page';
import type { LoaderFunctionArgs, MetaFunction } from 'react-router';
import { useLoaderData } from 'react-router';

export const loader = async ({ request }: LoaderFunctionArgs) => {
  try {
    const url = new URL(request.url);
    const limit = parseInt(url.searchParams.get('limit') || '12');
    const offset = parseInt(url.searchParams.get('offset') || '0');
    // Search is not needed for this page; only fetch paginated menus
    const { menus, count } = await fetchMenus({ limit, offset });

    return {
      menus,
      count,
      limit,
      offset,
      success: true,
    };
  } catch (error) {
    console.error('Failed to load menus:', error);
    return {
      menus: [],
      count: 0,
      limit: 12,
      offset: 0,
      success: false,
    };
  }
};

export const meta: MetaFunction<typeof loader> = ({ data }) => {
  const count = data?.count || 0;

  const title = `Menus (${count}) | Private Chef`;

  const description = `Browse ${count} expertly crafted menus. From intimate dinners to group celebrations, find the perfect menu for your culinary experience.`;

  return [
    { title },
    { name: 'description', content: description },
    { property: 'og:title', content: title },
    { property: 'og:description', content: description },
    { property: 'og:type', content: 'website' },
    { name: 'keywords', content: 'chef menus, private dining menus, tasting menus, cooking class menus, private chef' },
    ...(count === 0 ? [{ name: 'robots', content: 'noindex' }] : []),
  ];
};

export type MenusIndexRouteLoader = typeof loader;

export default function MenusIndexRoute() {
  const data = useLoaderData<MenusIndexRouteLoader>();

  if (!data) return null;

  const { menus, count, limit, offset } = data;

  const breadcrumbs = [
    {
      label: (
        <span className="flex whitespace-nowrap">
          <HomeIcon className="inline h-4 w-4" />
          <span className="sr-only">Home</span>
        </span>
      ),
      url: `/`,
    },
    {
      label: 'Menus',
    },
  ];

  return (
    <Container className="pb-16">
      <div className="my-8 flex flex-wrap items-center justify-between gap-4">
        <Breadcrumbs breadcrumbs={breadcrumbs} />
      </div>

      {/* Page Header */}
      <div className="mb-12 text-center">
        <h1 className="text-4xl md:text-5xl font-italiana text-gray-900 mb-4">Menus</h1>
        <p className="text-lg text-gray-600 max-w-3xl mx-auto leading-relaxed">
          Explore our carefully crafted menus, each designed to create memorable culinary experiences. Every menu can be
          customized to your preferences and dietary requirements.
        </p>
      </div>

      {/* Search removed by design as there are only a handful of menus */}

      {/* Menus - carousel across breakpoints to showcase motion polish */}
      <div className="flex flex-col gap-4">
        {/* Heading */}
        {count > 0 && (
          <h2 className="text-2xl md:text-3xl font-italiana text-gray-900">
            {count} Menu{count !== 1 ? 's' : ''}
          </h2>
        )}

        {/* Horizontal snap carousel on all sizes */}
        <MenuCarousel menus={menus} />
      </div>

      {/* Empty State */}
      {count === 0 && (
        <div className="text-center py-16">
          <div className="max-w-md mx-auto">
            <div className="text-6xl mb-4">🍽️</div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">No menus available</h3>
            <p className="text-gray-600 mb-6">
              We're currently preparing our menus. Check back soon for exciting culinary options!
            </p>
            <a
              href="/request"
              className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              Request Custom Event
            </a>
          </div>
        </div>
      )}
    </Container>
  );
}
