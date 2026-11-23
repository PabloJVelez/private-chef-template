/**
 * Chef Configuration
 *
 * This file contains all chef-specific information that can be easily customized
 * for different chefs. Update these values to personalize the storefront.
 */

export interface ChefConfig {
  demo?: boolean;
  portrait: string;
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

  // Contact details shown after booking requests
  contact: {
    email: string;
    phone: string;
    responseTime: string;
  };
}

/**
 * Default Configuration
 *
 * This provides a generic template that can be used as-is for demos
 * or customized for specific chefs.
 */
export const chefConfig: ChefConfig = {
  demo: true,
  name: 'Elena Marín',
  displayName: 'Chef Elena Marín',
  tagline: 'Private chef in Austin',
  portrait: '/assets/images/elena-portrait.webp',
  bio: {
    short: 'I cook French food with Texas produce, in kitchens across Austin and the Hill Country.',
    subtitle: 'At home in Austin',
    long: [
      'I’m Elena Marín, a private chef in Austin. I cook in homes across the city and the Hill Country, using French techniques and whatever looks best at the Texas markets that week.',
      'The first thing I plan is usually the vegetable. A crate of green beans might call for a sharp shallot vinaigrette; the last pears of the season belong in a tarte Tatin.',
      'I also teach hands-on cooking classes. My favorite part is standing at the stove with someone, tasting a vinaigrette together, and letting them decide whether it needs another splash of vinegar.',
    ],
  },
  credentials: {
    yearsExperience: '',
    specialization: 'French cooking with Texas produce',
    highlights: [],
  },
  hero: {
    tagline: 'Private chef in Austin',
    description: 'Seasonal French dinners and hands-on classes, in your own kitchen.',
    imageUrl: '/assets/images/elena-duck.webp',
    imageAlt: 'Seared duck breast with caramelized shallots and thyme',
  },
  seo: {
    title: 'Chef Elena Marín | Private dining in Austin',
    description: 'Explore seasonal menus for private dinners and cooking classes with Elena Marín in Austin.',
    keywords: ['Austin private chef', 'French cooking classes', 'Hill Country private dining'],
  },
  contact: { email: '', phone: '', responseTime: '24 hours' },
};

export function getChefConfig(): ChefConfig {
  return chefConfig;
}
