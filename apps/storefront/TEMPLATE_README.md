# Private Chef Storefront Template

This is a generic, customizable storefront template designed for private chefs and culinary professionals. It provides a complete e-commerce solution for booking culinary experiences, managing menus, and processing event requests.

## Overview

This template is built with:
- **React Router v7 (Remix)** - Modern React framework with server-side rendering
- **Medusa v2** - Headless commerce platform for backend
- **TypeScript** - Type-safe development
- **Tailwind CSS** - Utility-first styling
- **Zod** - Runtime validation

## Features

### Customer-Facing Features
- 📋 **Menu Browsing**: Display curated culinary menus with courses and dishes
- 📅 **Event Booking**: Request system for custom events and experiences
- 🎫 **Ticket Purchase**: Secure payment processing for event tickets
- 👨‍🍳 **Chef Profile**: Showcase credentials, experience, and culinary philosophy
- 📱 **Responsive Design**: Optimized for mobile, tablet, and desktop
- ♿ **Accessible**: WCAG compliant components and navigation

### Admin Features (via Medusa)
- Menu management (CRUD operations)
- Event request management
- Customer communication
- Order processing
- Analytics and reporting

## Quick Start

### 1. Installation

```bash
# Install dependencies
yarn install

# Set up environment variables
cp .env.example .env
```

### 2. Configuration

⚠️ **CRITICAL FIRST STEPS**:

1. **Replace Chef Images** - The template contains images of Chef John Doe that MUST be replaced:
   - See [IMAGE_REPLACEMENT_GUIDE.md](./IMAGE_REPLACEMENT_GUIDE.md) for detailed instructions
   - Images to replace are in `public/assets/images/`:
     - `chef_scallops_home.jpg` (hero)
     - `chef_experience.jpg` (about section)
     - `chef_book_experience.jpg` (booking CTA)

2. **Update Chef Configuration**:
   ```
   apps/storefront/libs/config/chef/chef-config.ts
   ```

See [CUSTOMIZATION_GUIDE.md](./CUSTOMIZATION_GUIDE.md) for complete instructions.

### 3. Development

```bash
# Start development server
yarn dev

# Visit http://localhost:3000
```

### 4. Build & Deploy

```bash
# Build for production
yarn build

# Start production server
yarn start
```

## Customization

This template is designed to be easily customized for any private chef.

### ⚠️ Before You Start

**The template currently shows Chef John Doe**. You must replace:
1. Chef-specific images (see [IMAGE_REPLACEMENT_GUIDE.md](./IMAGE_REPLACEMENT_GUIDE.md))
2. Chef information in configuration file

### Key Customization Points

1. **Images** ⚠️: Replace all chef photos (see IMAGE_REPLACEMENT_GUIDE.md)
2. **Chef Information**: Name, bio, credentials, and specializations
3. **Visual Design**: Colors, fonts, and layout via Tailwind
4. **Content**: Menus, services, and experience types
5. **Branding**: Logo, images, and brand voice
6. **Features**: Enable/disable specific functionality

### Documentation Files

- [CUSTOMIZATION_GUIDE.md](./CUSTOMIZATION_GUIDE.md) - Complete customization instructions
- [IMAGE_REPLACEMENT_GUIDE.md](./IMAGE_REPLACEMENT_GUIDE.md) - Detailed image replacement guide
- [REFACTORING_SUMMARY.md](./REFACTORING_SUMMARY.md) - Summary of template changes

## Directory Structure

```
apps/storefront/
├── app/
│   ├── components/        # Reusable UI components
│   │   ├── chef/         # Chef-specific components
│   │   ├── common/       # Generic UI elements
│   │   └── layout/       # Layout components
│   ├── routes/           # Application pages
│   └── styles/           # Global styles
├── libs/
│   ├── config/           # Configuration files
│   │   └── chef/        # Chef customization config
│   ├── types.ts          # TypeScript type definitions
│   └── util/            # Utility functions
├── public/
│   └── assets/          # Static assets (images, etc.)
└── types/               # Additional type definitions
```

## Key Components

### Chef-Specific Components

- **ChefHero**: Hero section with chef introduction
- **FeaturedMenus**: Showcase of menu offerings
- **ExperienceTypes**: Display different event types
- **HowItWorks**: Process explanation for booking

### Event Request Flow

1. Customer browses menus
2. Submits event request with details
3. Chef reviews and approves/customizes
4. Event becomes bookable
5. Customers purchase tickets
6. Chef receives booking details

## Configuration Files

### Main Configuration
- `chef-config.ts`: Central configuration for all chef-specific content
- `site-settings.ts`: Site-wide settings (SEO, social links)
- `navigation-items.ts`: Menu navigation structure

### Environment Variables
Required environment variables:
```
MEDUSA_BACKEND_URL=http://localhost:9000
STOREFRONT_URL=http://localhost:3000
```

## Styling

The template uses Tailwind CSS with a custom theme:

- **Primary Colors**: Main brand colors
- **Accent Colors**: Call-to-action and highlights
- **Typography**: Italiana (decorative), Sen (body)

Customize in `tailwind.config.js`.

## Integration with Medusa Backend

This storefront integrates with Medusa v2 for:

- Product/Menu management
- Order processing
- Customer data
- Event scheduling (custom module)
- Email notifications

## Performance Optimizations

- Server-side rendering for fast initial loads
- Image optimization with proper sizing
- Code splitting for efficient loading
- Caching strategies for static content
- Progressive enhancement

## SEO Features

- Dynamic meta tags for all pages
- Structured data (JSON-LD) for rich results
- Sitemap generation
- OpenGraph tags for social sharing
- Semantic HTML structure

## Accessibility

- ARIA labels and roles
- Keyboard navigation support
- Screen reader optimized
- Color contrast compliance
- Focus management

## Browser Support

- Chrome (latest)
- Firefox (latest)
- Safari (latest)
- Edge (latest)
- Mobile browsers (iOS Safari, Chrome Mobile)

## Testing

```bash
# Run tests (when implemented)
yarn test

# Type checking
yarn typecheck

# Linting
yarn lint
```

## Deployment

The storefront can be deployed to:

- **Vercel**: Optimized for React Router v7
- **Netlify**: Full support for SSR
- **Self-hosted**: Using Node.js server
- **Docker**: Containerized deployment

See deployment documentation in the main project README.

## Troubleshooting

### Common Issues

1. **Images not loading**: Check file paths in configuration
2. **Build errors**: Verify all imports and type definitions
3. **Styling issues**: Clear Tailwind cache with `yarn clean`
4. **API errors**: Verify Medusa backend is running

## Contributing

This is a template project. To contribute:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

See LICENSE file in the root directory.

## Support

For issues or questions:

1. Check the [CUSTOMIZATION_GUIDE.md](./CUSTOMIZATION_GUIDE.md)
2. Review Medusa documentation
3. Open an issue in the repository

---

**Template Version**: 1.0.0
**Last Updated**: January 2025

