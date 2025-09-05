import { Image } from '@app/components/common/images/Image';
import type { StoreMenuDTO } from '@libs/util/server/data/menus.server';
import clsx from 'clsx';
import type { FC } from 'react';
import { Link } from 'react-router';

export interface MenuListItemProps {
  menu: StoreMenuDTO;
  isTransitioning?: boolean;
  className?: string;
  compact?: boolean; // Mobile-inspired card, mirrors ExperienceTypes style
}

export const MenuListItem: FC<MenuListItemProps> = ({
  menu,
  isTransitioning = false,
  className,
  compact = false,
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

  // Compact card (mobile-inspired, like ExperienceTypes)
  if (compact) {
    return (
      <div
        className={clsx(
          'relative rounded-2xl bg-white shadow-md ring-1 ring-primary-100/60 transition-all',
          'before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-1 before:bg-accent-100 before:content-[""]',
          className,
        )}
      >
        <div className="p-5 pt-6">
          {/* Avatar image badge */}
          <div className="-mt-10 mb-2 flex justify-center">
            <div className="w-16 h-16 rounded-full overflow-hidden ring-2 ring-white shadow-md bg-gray-100">
              <Image
                src={menu.thumbnail || menu.images?.[0]?.url || '/assets/images/chef_beef_menu.JPG'}
                alt={menu.name}
                width={128}
                height={128}
                className="w-full h-full object-cover"
                loading="lazy"
              />
            </div>
          </div>

          {/* Title + meta */}
          <h3 className="text-2xl font-italiana text-primary-900 text-center">{menu.name}</h3>
          <p className="mt-0.5 text-sm text-primary-600 text-center">
            {courseCount} course{courseCount !== 1 ? 's' : ''} • {estimatedTime}
          </p>

          {/* Menu-like items */}
          {dishNames.length > 0 && (
            <ul className="mt-3 space-y-1.5">
              {dishNames.map((n, i) => (
                <li key={i} className="flex items-start">
                  <span className="mt-2 mr-3 inline-block h-1.5 w-1.5 rounded-full bg-accent-500 flex-shrink-0" />
                  <span className="text-[15px] leading-snug text-primary-800">{n}</span>
                </li>
              ))}
            </ul>
          )}

          {/* Footer actions */}
          <div className="mt-4 flex items-center gap-3">
            <span className="text-sm text-primary-700">From $99.99 per person</span>
            <div className="ml-auto grid grid-cols-2 gap-2 w-[min(100%,260px)]">
              <Link to={`/menus/${menu.id}`} className="rounded-lg bg-gray-900 text-white text-center py-2 text-sm">
                View details
              </Link>
              <Link
                to={`/request?menuId=${menu.id}`}
                className="rounded-lg bg-blue-600 text-white text-center py-2 text-sm"
              >
                Request this
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <Link 
      to={`/menus/${menu.id}`}
      className={clsx(
        // Make card a flex column so heights align and footer sticks to bottom
        "group relative bg-white rounded-2xl shadow-lg overflow-hidden hover:shadow-xl transition-all duration-300 h-full flex flex-col block",
        {
          'scale-105': isTransitioning,
        },
        className
      )}
    >
      {/* Menu Image — significantly shorter on mobile, classic on desktop */}
      <div className="overflow-hidden bg-gray-100 aspect-[32/9] sm:aspect-[20/9] md:aspect-[4/3]">
        <Image
          src={menu.thumbnail || menu.images?.[0]?.url || "/assets/images/chef_beef_menu.JPG"}
          alt={menu.name}
          className="w-full h-full object-cover [transform:translateX(var(--parallax-x,0))] group-hover:scale-105 transition-transform duration-300"
          width={400}
          height={300}
          loading="lazy"
        />
      </div>
      
      {/* Menu Content */}
      <div className="p-6 space-y-4 flex-1 flex flex-col" style={{ transform: 'scale(var(--scale,1))' }}>
        <div>
          <h3 className="text-3xl sm:text-3xl md:text-2xl font-semibold text-gray-900 group-hover:text-blue-600 transition-colors line-clamp-2">
            {menu.name}
          </h3>
          <p className="text-base md:text-sm text-gray-600 mt-1">
            {courseCount} course{courseCount !== 1 ? 's' : ''} • {estimatedTime}
          </p>
        </div>
        
        {/* Description */}
        <p className="text-gray-700 text-lg md:text-sm line-clamp-2 leading-relaxed flex-1">
          {description}
        </p>
        
        {/* Footer */}
        <div className="flex items-center justify-between pt-3 border-t border-gray-100 mt-auto">
          <div className="text-lg md:text-sm text-gray-600">
            <span className="font-medium">From $99.99</span> per person
          </div>
          <div className="text-lg md:text-sm font-medium text-blue-600 flex items-center">
            View Menu
            <svg className="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
