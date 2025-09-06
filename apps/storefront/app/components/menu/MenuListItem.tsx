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
}

export const MenuListItem: FC<MenuListItemProps> = ({
  menu,
  isTransitioning = false,
  className,
  tightMobile = false,
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
      {/* Menu Image — default 4/3; optionally tighter on mobile when used by Featured section */}
      <div className={clsx(
        'overflow-hidden bg-gray-100',
        tightMobile ? 'aspect-[20/9] md:aspect-[4/3]' : 'aspect-[4/3]'
      )}>
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
          <h3 className={clsx(
            'font-semibold text-gray-900 group-hover:text-blue-600 transition-colors line-clamp-2',
            tightMobile ? 'text-3xl md:text-2xl' : 'text-xl'
          )}>
            {menu.name}
          </h3>
          <p className={clsx('text-gray-600 mt-1', tightMobile ? 'text-base md:text-sm' : 'text-sm')}>
            {courseCount} course{courseCount !== 1 ? 's' : ''} • {estimatedTime}
          </p>
        </div>
        
        {/* Description */}
        <p className={clsx('text-gray-700 leading-relaxed flex-1', tightMobile ? 'text-base md:text-sm line-clamp-2' : 'text-sm line-clamp-3')}>
          {description}
        </p>
        
        {/* Footer */}
        <div className={clsx('flex items-center justify-between border-t border-gray-100 mt-auto', tightMobile ? 'pt-3' : 'pt-2')}>
          <div className={clsx('text-gray-600', tightMobile ? 'text-lg md:text-sm' : 'text-sm')}>
            <span className="font-medium">From $99.99</span> per person
          </div>
          <div className={clsx('font-medium text-blue-600 flex items-center', tightMobile ? 'text-lg md:text-sm' : 'text-sm')}>
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
