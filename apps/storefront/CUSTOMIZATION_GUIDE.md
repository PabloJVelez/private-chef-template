# Storefront Customization Guide

This guide explains how to customize the storefront for a new chef or culinary professional. The storefront has been designed as a generic template that can be easily personalized.

## Quick Start

⚠️ **IMPORTANT**: The storefront currently contains images of Chef Luis Velez. You MUST replace these images before going live with a new chef.

### Two Main Steps:

1. **Update Configuration File**:
```
apps/storefront/libs/config/chef/chef-config.ts
```
Edit this file to customize all chef-specific content throughout the application.

2. **Replace Chef Images** (see section 5 below for details):
```
apps/storefront/public/assets/images/
- chef_scallops_home.jpg
- chef_experience.jpg
- chef_book_experience.jpg
```

## Configuration Structure

### Basic Information

```typescript
{
  name: 'Your Chef',                    // Short name
  displayName: 'Your Private Chef',     // Full display name (e.g., "Chef [Name]")
  tagline: 'Premium Culinary Experiences', // Business tagline
}
```

### Biography

```typescript
{
  bio: {
    short: '1-2 sentence summary',      // Used in hero sections and cards
    long: [                              // Array of paragraphs for full bio
      'First paragraph...',
      'Second paragraph...',
      'Third paragraph...'
    ],
    subtitle: 'Culinary Excellence',    // Subtitle for bio section
  }
}
```

### Credentials & Experience

```typescript
{
  credentials: {
    yearsExperience: '15+ years',       // Display text for experience
    specialization: 'Contemporary cuisine...', // Chef's specialty
    highlights: [                        // Badge items displayed on homepage
      'Professional Training',
      'Seasonal Sourcing',
      'Custom Menus',
    ],
  }
}
```

### Hero Section

```typescript
{
  hero: {
    tagline: 'CULINARY EXPERIENCES & PRIVATE DINING',
    description: 'Full description for hero section...',
    imageUrl: '/assets/images/chef_scallops_home.jpg',  // Path to hero image
    imageAlt: 'Private chef preparing an elegant dish',  // Alt text for accessibility
  }
}
```

### SEO & Metadata

```typescript
{
  seo: {
    title: 'Private Chef - Premium Culinary Experiences',
    description: 'Private chef experiences: cooking classes...',
    keywords: [
      'private chef',
      'cooking classes',
      'plated dinner',
      // Add relevant keywords
    ],
  }
}
```

## Step-by-Step Customization

### 1. Update Chef Information

Open `apps/storefront/libs/config/chef/chef-config.ts` and update:

1. **Name and Display Name**: Change `name` and `displayName` to the chef's actual name
2. **Tagline**: Update with the chef's unique value proposition
3. **Biography**: 
   - Update `bio.short` with a brief 1-2 sentence introduction
   - Replace all paragraphs in `bio.long` with the chef's story
   - Update `bio.subtitle` with an appropriate subtitle

### 2. Update Credentials

1. **Years of Experience**: Update `credentials.yearsExperience`
2. **Specialization**: Describe the chef's culinary specialty
3. **Highlights**: Replace the array with 3-4 key credentials or achievements

### 3. Customize Hero Section

1. **Tagline**: Update the all-caps tagline for the hero section
2. **Description**: Write a compelling 2-3 sentence description
3. **Images**: 
   - Add chef's photos to `apps/storefront/public/assets/images/`
   - Update `hero.imageUrl` with the new image path
   - Update `hero.imageAlt` with descriptive alt text

### 4. Optimize SEO

1. **Title**: Create a unique, keyword-rich title
2. **Description**: Write a compelling meta description (155-160 characters)
3. **Keywords**: Add relevant keywords for the chef's specialty and location

### 5. Update Images ⚠️ IMPORTANT

**The current images show Chef Luis Velez and MUST be replaced with your chef's photos before going live.**

Replace these specific images in `apps/storefront/public/assets/images/`:

**Required Image Replacements:**
1. **`chef_scallops_home.jpg`** - Main hero image on homepage
   - Current: Shows paella dish preparation
   - Should show: Your chef preparing food or a signature dish
   - Dimensions: 1920x1080px (landscape)
   - Used in: Homepage hero section

2. **`chef_experience.jpg`** - "Meet Your Chef" section
   - Current: Shows Chef Luis at a scenic outdoor cooking location
   - Should show: Professional photo of your chef (headshot or action shot)
   - Dimensions: 800x800px (square) or 1200x800px (landscape)
   - Used in: Homepage "Meet Your Chef" section

3. **`chef_book_experience.jpg`** - Booking call-to-action section
   - Current: Shows Chef Luis cooking at outdoor location
   - Should show: Your chef in action, engaging with food or guests
   - Dimensions: 1200x800px (landscape)
   - Used in: Homepage booking section, various CTAs

**Image Guidelines:**
- **Quality**: Use high-quality, professional photos only
- **Lighting**: Well-lit photos that show the chef and food clearly
- **Consistency**: Maintain similar style/color tone across all images
- **Format**: JPG (preferred) or PNG
- **File Size**: Optimize to <500KB for web performance (use tools like TinyPNG)
- **Optimization**: Run images through compression before uploading

**Pro Tips:**
- Consider hiring a professional food/lifestyle photographer
- Shoot in natural light when possible
- Show personality - let the chef's style shine through
- Include action shots (cooking, plating, serving)
- Get multiple angles and options for each scene

**Temporary Solution:**
If you don't have chef photos yet, consider using:
- High-quality stock photos from Unsplash or Pexels
- Generic culinary/food preparation images
- Abstract food/ingredient closeups
- Note: Update with real chef photos as soon as possible for authenticity

## Advanced Customization

### Custom Styling

The storefront uses Tailwind CSS. To customize colors and fonts:

1. Edit `apps/storefront/tailwind.config.js`
2. Update theme colors in the `extend` section:

```javascript
theme: {
  extend: {
    colors: {
      primary: {
        50: '#f0f9ff',
        // ... your custom colors
      },
      accent: {
        // ... your accent colors
      }
    }
  }
}
```

### Store Name & Logo

The store name is pulled from your Medusa backend configuration. To update:

1. Log into your Medusa admin panel
2. Go to Settings > Store Details
3. Update the store name

The name will automatically display in the header navigation.

### Contact Information

Update contact details in the following locations:

1. **Success Page**: `apps/storefront/app/routes/request.success.tsx`
   - Update `supportEmail` and `supportPhone` in the loader function

2. **Footer**: Can be managed through your Medusa admin or by editing:
   - `apps/storefront/app/components/layout/footer/Footer.tsx`

### Navigation Menu

To customize navigation items:

1. Edit `apps/storefront/libs/config/site/navigation-items.ts`
2. Add or remove menu items as needed

## Testing Your Changes

After making changes:

1. **Development**: Run `yarn dev` to see changes locally
2. **Build**: Run `yarn build` to ensure no build errors
3. **Preview**: Test all pages and user flows
4. **SEO Check**: Verify meta tags are correct in page source

## Content Checklist

Before launching with a new chef, verify:

### Critical (Must Complete)
- [ ] ⚠️ **Replace ALL Chef Luis photos with chef's actual photos**
  - [ ] `chef_scallops_home.jpg` - Homepage hero
  - [ ] `chef_experience.jpg` - Meet Your Chef section
  - [ ] `chef_book_experience.jpg` - Booking CTA
- [ ] Chef name and display name updated in config
- [ ] Biography written and personalized
- [ ] Store name configured in Medusa admin

### Important (Should Complete)
- [ ] Credentials and highlights updated
- [ ] SEO title and description optimized
- [ ] Keywords relevant to chef's specialty and location
- [ ] Contact information updated (email, phone)
- [ ] Images optimized for web performance
- [ ] Social media links added (if applicable)

### Testing (Before Launch)
- [ ] All pages manually tested
- [ ] Mobile responsiveness verified
- [ ] Forms tested (event request, contact)
- [ ] Image loading speed checked
- [ ] SEO tags verified in page source
- [ ] Analytics configured (if using)

## Common Customization Scenarios

### Using First Person vs. Third Person

The default configuration uses third-person language ("The chef will..."). To switch to first person:

Update the configuration descriptions to use "I" or "we":
- "I bring restaurant-quality cuisine..."
- "We craft unique culinary experiences..."

### Multiple Chef Locations

If the chef operates in multiple locations:

1. Add location-specific information to the configuration
2. Consider creating location-specific pages
3. Update SEO keywords to include location names

### Special Services

To highlight unique services or specialties:

1. Add them to `credentials.highlights`
2. Update `credentials.specialization`
3. Consider adding custom sections to the homepage

## Support & Resources

- **Medusa Documentation**: [https://docs.medusajs.com](https://docs.medusajs.com)
- **React Router Documentation**: [https://reactrouter.com](https://reactrouter.com)
- **Tailwind CSS**: [https://tailwindcss.com](https://tailwindcss.com)

## Need Help?

If you encounter issues or need assistance with customization:

1. Check the console for any error messages
2. Verify all file paths are correct
3. Ensure images are in the correct directory
4. Test in development mode before deploying

---

**Last Updated**: January 2025
**Template Version**: 1.0.0



