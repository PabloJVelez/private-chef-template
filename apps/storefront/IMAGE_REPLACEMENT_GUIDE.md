# Image Replacement Guide

## ⚠️ Critical: Chef-Specific Images

The storefront template currently contains images of **Chef Luis Velez**. These images are for demonstration purposes only and **MUST be replaced** with your chef's actual photographs before launching the site.

## Images That Need Replacement

### 1. Homepage Hero Image
**File**: `public/assets/images/chef_scallops_home.jpg`

**Current Image**: Paella dish being prepared with mussels and clams  
**Location Used**: Main hero section on homepage  
**Configuration Reference**: `chefConfig.hero.imageUrl`

**Replacement Requirements**:
- Dimensions: 1920x1080px (16:9 aspect ratio)
- Orientation: Landscape
- Content: Chef preparing food, signature dish, or action cooking shot
- Quality: High-resolution, professional photography
- File Size: <500KB (optimized)
- Format: JPG preferred

**Photo Ideas**:
- Chef plating a signature dish
- Close-up of hands preparing food
- Chef cooking over heat/flame
- Beautifully plated final dish
- Chef's signature cooking technique

---

### 2. "Meet Your Chef" Section Image
**File**: `public/assets/images/chef_experience.jpg`

**Current Image**: Chef Luis at an outdoor desert cooking location  
**Location Used**: Homepage "Meet Your Chef" section (below featured menus)  
**Direct Reference**: Line 169 in `app/routes/_index.tsx`

**Replacement Requirements**:
- Dimensions: 800x800px (square) OR 1200x800px (landscape)
- Orientation: Square or landscape
- Content: Professional chef portrait or environmental portrait
- Quality: High-resolution, well-lit
- File Size: <400KB (optimized)
- Format: JPG preferred

**Photo Ideas**:
- Professional headshot in chef's whites
- Chef in their kitchen environment
- Candid shot while cooking
- Chef presenting a dish
- Environmental portrait showing personality

---

### 3. Booking CTA Section Image
**File**: `public/assets/images/chef_book_experience.jpg`

**Current Image**: Chef Luis cooking at outdoor scenic location  
**Location Used**: Homepage "Book Your Experience" call-to-action section  
**Direct Reference**: Line 262 in `app/routes/_index.tsx`

**Replacement Requirements**:
- Dimensions: 1200x800px (3:2 aspect ratio)
- Orientation: Landscape
- Content: Chef in action, engaging with food or guests
- Quality: High-resolution, natural lighting
- File Size: <400KB (optimized)
- Format: JPG preferred

**Photo Ideas**:
- Chef interacting with guests
- Chef teaching/demonstrating technique
- Preparing food at a client's location
- Setting up for an event
- Chef smiling while cooking

---

## How to Replace Images

### Method 1: Simple File Replacement (Recommended)

1. Prepare your three images according to the specifications above
2. Name them exactly as follows:
   - `chef_scallops_home.jpg`
   - `chef_experience.jpg`
   - `chef_book_experience.jpg`
3. Navigate to: `apps/storefront/public/assets/images/`
4. Replace the existing files with your new images
5. Clear browser cache and refresh to see changes

### Method 2: Custom File Names

If you prefer different file names:

1. Add your images to `apps/storefront/public/assets/images/`
2. Update the configuration file: `libs/config/chef/chef-config.ts`
3. Change the `hero.imageUrl` value to your new image path:

```typescript
hero: {
  imageUrl: '/assets/images/your-custom-hero-image.jpg',
  imageAlt: 'Your chef preparing delicious cuisine',
}
```

4. Update direct references in these files:
   - `app/routes/_index.tsx` (lines 169 and 262)
   - Look for `src="/assets/images/` in the code

---

## Image Optimization Tips

### Before Uploading

1. **Resize Images**: Use correct dimensions (don't rely on CSS to resize)
2. **Compress**: Use tools like:
   - [TinyPNG](https://tinypng.com/) - Easy drag-and-drop
   - [Squoosh](https://squoosh.app/) - Advanced controls
   - ImageOptim (Mac)
   - GIMP (Free, cross-platform)

3. **Quality Settings**:
   - JPG Quality: 80-85% is usually perfect
   - Aim for <500KB for hero images
   - Aim for <400KB for section images

4. **File Format Guidelines**:
   - **JPG**: Best for photos (recommended)
   - **PNG**: Use only if transparency needed (rare for these images)
   - **WebP**: Modern format, but ensure fallback for older browsers

### Test Your Images

After uploading, verify:
- [ ] Images load quickly (< 1 second on 3G)
- [ ] Images look sharp on retina displays
- [ ] Images are properly cropped/centered
- [ ] Text overlay is readable (for hero image)
- [ ] Images work on mobile devices
- [ ] No stretched or distorted images

---

## Professional Photography Recommendations

### Option 1: Hire a Professional Photographer

**Cost**: $500-$2,000 for a photo session  
**Benefits**: 
- High-quality, professional results
- Multiple shots and angles
- Proper lighting and composition
- Rights to use images

**Finding Photographers**:
- Local food photographers
- Restaurant/culinary photographers
- Search: "food photographer near me"
- Check portfolios on Instagram

### Option 2: DIY Photography

**Equipment Needed**:
- Modern smartphone (iPhone 11+ or equivalent)
- Natural lighting (shoot near windows)
- Simple background (kitchen, clean space)
- Tripod or stable surface

**Tips for DIY**:
- Shoot during golden hour (early morning or late afternoon)
- Use portrait mode for background blur
- Take LOTS of photos - choose the best
- Get multiple angles and expressions
- Avoid harsh overhead lighting
- Use natural light from windows

### Option 3: Stock Photography (Temporary)

**Use Only as Placeholder**:
- Free sources: [Unsplash](https://unsplash.com), [Pexels](https://pexels.com)
- Search terms: "chef cooking", "private chef", "food preparation"
- **Important**: Replace with real chef photos ASAP
- Generic stock photos reduce authenticity and trust

---

## Image Alt Text Guidelines

When replacing images, also update alt text for accessibility:

### Hero Image Alt Text
**Current**: "Chef Luis Velez preparing an elegant dish"  
**Update to**: "[Your Chef Name] preparing [signature dish/cuisine type]"

**Example**: "Chef Maria Garcia preparing fresh pasta"

### Meet Your Chef Alt Text
**Current**: "Chef Luis Velez in his kitchen"  
**Update to**: "Professional chef [Your Name] [in kitchen/cooking/portrait]"

**Example**: "Professional chef James Wilson in his culinary kitchen"

### Booking CTA Alt Text
**Current**: "Guests enjoying a Chef Velez experience"  
**Update to**: "Guests enjoying a culinary experience"

**Where to Update Alt Text**:
1. Configuration: `libs/config/chef/chef-config.ts` - `hero.imageAlt`
2. Code files: `app/routes/_index.tsx` - Look for `alt=` attributes

---

## Quick Reference: Image Locations in Code

```
Hero Image:
- File: public/assets/images/chef_scallops_home.jpg
- Config: libs/config/chef/chef-config.ts (line 75)
- Used in: ChefHero component (automatic from config)

Meet Your Chef Image:
- File: public/assets/images/chef_experience.jpg
- Code: app/routes/_index.tsx (line 169)
- Alt text: line 171

Booking CTA Image:
- File: public/assets/images/chef_book_experience.jpg
- Code: app/routes/_index.tsx (line 262)
- Alt text: line 263
```

---

## Troubleshooting

### Image Not Updating?

1. **Clear browser cache**: Ctrl+Shift+R (Windows) or Cmd+Shift+R (Mac)
2. **Hard refresh**: Hold Shift and click Reload button
3. **Check file name**: Must match exactly (case-sensitive on some systems)
4. **Verify file path**: Ensure images are in `public/assets/images/`
5. **Restart dev server**: Stop and restart with `yarn dev`

### Image Looks Stretched?

- Check dimensions match recommendations
- Verify aspect ratio is correct
- Don't use portrait images where landscape is expected

### Image Too Large (Slow Loading)?

- Compress image using TinyPNG or Squoosh
- Reduce dimensions to recommended size
- Lower JPG quality to 80-85%

---

## Before Going Live Checklist

- [ ] All three chef images replaced with actual chef photos
- [ ] Images are properly sized and optimized
- [ ] Alt text updated to reflect new chef
- [ ] Images tested on mobile and desktop
- [ ] Loading speed is acceptable (< 2 seconds)
- [ ] Images look professional and match brand
- [ ] No copyright issues with images
- [ ] Backup copies of images saved elsewhere

---

**Need Help?**

If you need assistance with image replacement or optimization, consider:
- Hiring a photographer for professional results
- Using a designer to help with image selection
- Consulting the main [CUSTOMIZATION_GUIDE.md](./CUSTOMIZATION_GUIDE.md) for more details

---

**Last Updated**: January 2025  
**Version**: 1.0.0

