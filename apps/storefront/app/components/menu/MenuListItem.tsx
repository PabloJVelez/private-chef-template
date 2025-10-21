import { Image } from '@app/components/common/images/Image';
import type { StoreMenuDTO } from '@libs/util/server/data/menus.server';
import clsx from 'clsx';
import type { FC } from 'react';
import { Link } from 'react-router';

export interface MenuListItemProps {
  menu: StoreMenuDTO;
  isTransitioning?: boolean;
  className?: string;
  tightMobile?: boolean; // Featured-only: tighter image + larger text on mobile
  previewOnly?: boolean; // When true, show a single-line/short preview with ellipsis on mobile
}

export const MenuListItem: FC<MenuListItemProps> = ({
  menu,
  isTransitioning = false,
  className,
  tightMobile = false,
  previewOnly = false,
}) => {
  const courseCount = menu.courses?.length || 0;
  const estimatedTime = "3-4 hours"; // Default estimate since not in data model yet
  
  // Generate a description from the first few dishes with defensive programming
  const description = menu.courses
    ?.slice(0, 2)
    .map(course => 
      course.dishes?.slice(0, 2).map(dish => dish.name).join(', ') || course.name
    )
    .join(' • ') || 'A carefully crafted menu experience';

  // Build a short list of dish names (menu-like rendering for compact view)
  const dishNames: string[] = (menu.courses || [])
    .flatMap((c) => (c.dishes || []).map((d) => d.name))
    .filter(Boolean)
    .slice(0, 4);

  const fullDescription = description;
  // Preview: show the first dish from the first two courses (fallback to course name), then ellipsis if more
  const previewDescription = (() => {
    const courses = (menu.courses || []).slice(0, 2);
    const names = courses
      .map((c) => (c.dishes && c.dishes[0]?.name) || c.name)
      .filter(Boolean);
    const base = names.join(', ');
    const hasMore = (menu.courses || []).length > 2 || (menu.courses || []).some((c) => (c.dishes || []).length > 1);
    return hasMore ? `${base}...` : base;
  })();

  return (
    <Link 
      to={`/menus/${menu.id}`}
      className={clsx(
        // Make card a flex column so heights align and footer sticks to bottom
        'group relative rounded-2xl shadow-lg overflow-hidden hover:shadow-xl transition-all duration-300 h-full block',
        tightMobile
          ? 'bg-transparent grid grid-rows-[2fr_3fr] min-h-[520px] md:min-h-0 md:bg-white md:flex md:flex-col'
          : 'bg-white flex flex-col',
        {
          'scale-105': isTransitioning,
        },
        className
      )}
    >
      {/* Menu Image — default 4/3; optionally tighter on mobile when used by Featured section */}
      <div
        className={clsx(
          'overflow-hidden bg-gray-100',
          tightMobile ? 'h-full rounded-t-2xl md:aspect-[4/3]' : 'aspect-[4/3]'
        )}
      >
        <Image
          src={menu.thumbnail || menu.images?.[0]?.url || "/assets/images/chef_beef_menu.jpg"}
          alt={menu.name}
          className="w-full h-full object-cover [transform:translateX(var(--parallax-x,0))] group-hover:scale-105 transition-transform duration-300"
          width={400}
          height={300}
          loading="lazy"
        />
      </div>
      
      {/* Menu Content */}
      <div
        className={clsx(
          'flex-1 flex flex-col',
          tightMobile
            ? 'bg-white -mt-4 mx-3 rounded-2xl p-4 shadow-sm ring-1 ring-black/5 space-y-3'
            : 'p-6 space-y-4',
        )}
        style={{ transform: 'scale(var(--scale,1))' }}
      >
        <div>
          <h3
            className={clsx(
              'font-semibold text-gray-900 group-hover:text-blue-600 transition-colors line-clamp-2',
              tightMobile ? 'text-[32px] md:text-2xl leading-tight' : 'text-xl'
            )}
          >
            {menu.name}
          </h3>
          <p className={clsx('text-gray-600', tightMobile ? 'text-[17px] md:text-sm mt-0.5' : 'text-sm mt-1')}>
            {courseCount} course{courseCount !== 1 ? 's' : ''} • {estimatedTime}
          </p>
        </div>
        
        {/* Description (dish previews) */}
        {previewOnly ? (
          // Always show a single preview string with an explicit ellipsis when trimmed
          <p className={clsx('text-gray-700 flex-1', tightMobile ? 'text-[17px] leading-snug' : 'text-sm leading-relaxed')}>
            {previewDescription}
          </p>
        ) : (
          // Default: graceful multi-line clamp (no duplication)
          <p className={clsx('text-gray-700 flex-1', tightMobile ? 'text-sm ellipsis-3 leading-snug' : 'text-sm ellipsis-3 leading-relaxed')}>
            {fullDescription}
          </p>
        )}
        
        {/* Footer */}
        <div className={clsx('flex items-center justify-between border-t border-gray-100 mt-auto', tightMobile ? 'pt-2' : 'pt-2')}>
          <div className={clsx('text-gray-600', tightMobile ? 'text-xl md:text-sm' : 'text-sm')}>
            <span className="font-medium">From $99.99</span> per person
          </div>
          <div className={clsx('font-medium text-blue-600 flex items-center', tightMobile ? 'text-xl md:text-sm' : 'text-sm')}>
            View Menu
            <svg className={clsx('ml-1 group-hover:translate-x-1 transition-transform', tightMobile ? 'w-5 h-5' : 'w-4 h-4')} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </div>
      </div>

      {/* Hover overlay */}
      <div className="absolute inset-0 bg-blue-600 bg-opacity-0 group-hover:bg-opacity-5 transition-all duration-300 rounded-2xl" />
    </Link>
  );
};
