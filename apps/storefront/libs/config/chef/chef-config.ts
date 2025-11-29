/**
 * Chef Configuration
 *
 * This file contains all chef-specific information that can be easily customized
 * for different chefs. Update these values to personalize the storefront.
 */

export interface ChefConfig {
  // Basic Information
  name: string;
  displayName: string; // e.g., "Chef [Name]"
  tagline: string;

  // Biography
  bio: {
    short: string; // 1-2 sentences
    long: string[]; // Array of paragraphs
    subtitle: string; // e.g., "Culinary Artistry"
  };

  // Experience & Credentials
  credentials: {
    yearsExperience: string;
    specialization: string;
    highlights: string[]; // Badge items like "Michelin Trained", "Local Sourcing"
  };

  // Hero Section
  hero: {
    tagline: string;
    description: string;
    imageUrl: string;
    imageAlt: string;
  };

  // Meta & SEO
  seo: {
    title: string;
    description: string;
    keywords: string[];
  };
}

/**
 * Default Configuration
 *
 * This provides a generic template that can be used as-is for demos
 * or customized for specific chefs.
 */
export const chefConfig: ChefConfig = {
  // Basic Information
  name: 'Your Chef',
  displayName: 'Your Private Chef',
  tagline: 'Premium Culinary Experiences',

  // Biography
  bio: {
    short:
      'A private chef specializing in premium at-home culinary experiences—cooking classes, plated dinners, and buffet-style events.',
    long: [
      'With years of culinary experience, our chef has honed their craft under renowned culinary experts. As a dedicated private chef, they create exquisite dining experiences for discerning clients who value exceptional cuisine.',
      'Their dedication to the culinary arts is evident in their mastery of various cooking techniques and deep understanding of culinary concepts. They bring a passion for food that transcends the ordinary, always seeking to educate and inspire those around them.',
      'Ready to showcase culinary expertise—not just cooking, but creating memorable experiences. Plan your next culinary journey and indulge in flavors that will delight your palate.',
    ],
    subtitle: 'Culinary Excellence',
  },

  // Experience & Credentials
  credentials: {
    yearsExperience: '15+ years',
    specialization: 'Contemporary cuisine with seasonal ingredients',
    highlights: ['Professional Training', 'Seasonal Sourcing', 'Custom Menus'],
  },

  // Hero Section
  hero: {
    tagline: 'CULINARY EXPERIENCES & PRIVATE DINING',
    description:
      'Transform your special occasions into unforgettable culinary experiences. From intimate cooking classes to elegant plated dinners, bringing restaurant-quality cuisine directly to your home.',
    imageUrl: '/assets/images/chef_scallops_home.jpg',
    imageAlt: 'Private chef preparing an elegant dish',
  },

  // Meta & SEO
  seo: {
    title: 'Private Chef - Premium Culinary Experiences',
    description:
      'Private chef experiences: cooking classes, plated dinners, and buffet-style events. Restaurant-quality cuisine crafted in your home.',
    keywords: [
      'private chef',
      'cooking classes',
      'plated dinner',
      'culinary experiences',
      'chef services',
      'private dining',
      'buffet style events',
      'at-home dining',
    ],
  },
};

/**
 * Helper function to get chef configuration
 * This allows for future extensibility (e.g., environment-based configs)
 */
export function getChefConfig(): ChefConfig {
  return chefConfig;
}
