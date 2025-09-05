import { Container } from '@app/components/common/container';
import { MenuCarousel } from '@app/components/menu/MenuCarousel';
import { MenuListItem } from '@app/components/menu/MenuListItem';
import { FC } from 'react';

interface FeaturedMenusProps {
  menus: any[];
  maxDisplay?: number;
}

export const FeaturedMenus: FC<FeaturedMenusProps> = ({ menus, maxDisplay = 3 }) => {
  // Validate and filter menus to ensure they have required properties
  const validMenus = menus?.filter(menu => 
    menu && 
    menu.id && 
    menu.name && 
    Array.isArray(menu.courses)
  ) || [];
  
  const displayMenus = validMenus.slice(0, maxDisplay);

  // If no valid menus are available, show a fallback message
  if (validMenus.length === 0) {
    return (
      <Container className="py-16 lg:py-24">
        <div className="text-center">
          <h2 className="text-3xl md:text-4xl font-italiana text-gray-900 mb-4">
            Featured Menus
          </h2>
          <p className="text-lg text-gray-600 mb-8">
            Our curated menus are being prepared. Please check back soon for our latest culinary offerings.
          </p>
          <div className="bg-gray-50 rounded-lg p-8">
            <p className="text-gray-500">
              Menu data is temporarily unavailable. We're working to bring you the best dining experiences.
            </p>
          </div>
        </div>
      </Container>
    );
  }

  return (
    <Container className="py-16 lg:py-24">
      <div className="text-center mb-12">
        <h2 className="text-3xl md:text-4xl font-italiana text-gray-900 mb-4">
          Featured Menus
        </h2>
        <p className="text-lg text-gray-600">
          Discover our carefully crafted menus, each designed to create unforgettable dining experiences.
        </p>
      </div>

      {/* Mobile: horizontal carousel for better ergonomics */}
      <div className="md:hidden">
        <MenuCarousel menus={displayMenus as any} singleItem autoAdvanceMs={4000} />
      </div>

      {/* Desktop/Tablets: keep existing grid layout */}
      <div className="hidden md:grid md:grid-cols-2 lg:grid-cols-3 gap-8">
        {displayMenus.map((menu) => (
          <MenuListItem key={menu.id} menu={menu} />
        ))}
      </div>

      {validMenus.length > maxDisplay && (
        <div className="text-center mt-12">
          <a
            href="/menus"
            className="inline-flex items-center px-6 py-3 border border-transparent text-base font-medium rounded-md text-white bg-accent-600 hover:bg-accent-700 transition-colors"
          >
            View All Menus
          </a>
        </div>
      )}
    </Container>
  );
};

export default FeaturedMenus; 
