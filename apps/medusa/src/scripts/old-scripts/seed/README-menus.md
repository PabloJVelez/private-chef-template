# Menu Seeding Documentation

This document describes the menu seeding functionality for creating chef experience menus with proper inventory management.

## Overview

The menu seeding system creates four distinct chef experience menus:

1. **Winter Wonderland Feast** - Elegant winter dining with herb-crusted lamb and cocktails
2. **Tropical Holiday Escape** - Fresh seafood and tropical flavors 
3. **Rustic Autumn Gathering** - Comfort food classics with seasonal ingredients
4. **Elegant Evening Soirée** - Upscale surf and turf dining experience

## Architecture

### Menu Structure
Each menu follows this hierarchy:
- **Menu** (top level)
  - **Course** (e.g., Cocktails, Appetizers, Entrees, Sides, Dessert)
    - **Dish** (individual menu items)
      - **Ingredient** (components of each dish)

### Inventory Management
- Each menu has a corresponding **Product** that represents tickets/reservations
- Products use the digital shipping profile (no physical shipping required)
- Inventory is tracked in product metadata with `available_tickets` field
- Each experience has different pricing, duration, and guest limits

## Files

- `apps/medusa/src/scripts/seed/menus.ts` - Main menu seeding logic
- `apps/medusa/src/scripts/seed-menus.ts` - Standalone menu seeding script
- Integration in `apps/medusa/src/scripts/seed.ts` - Full seed script with menus

## Usage

### Full Seeding (includes menus + products)
```bash
npx medusa exec ./src/scripts/seed.ts
```

### Menu Entities Only
```bash
npx medusa exec ./src/scripts/seed-menus.ts
```

## Menu Details

### Winter Wonderland Feast
- **Price**: $125 USD / $165 CAD
- **Duration**: 3 hours
- **Max Guests**: 12
- **Type**: Plated dinner
- **Tickets Available**: 15

### Tropical Holiday Escape  
- **Price**: $110 USD / $145 CAD
- **Duration**: 2.75 hours
- **Max Guests**: 14
- **Type**: Buffet style
- **Tickets Available**: 18

### Rustic Autumn Gathering
- **Price**: $95 USD / $125 CAD
- **Duration**: 2.5 hours  
- **Max Guests**: 16
- **Type**: Cooking class
- **Tickets Available**: 12

### Elegant Evening Soirée
- **Price**: $150 USD / $195 CAD
- **Duration**: 3.5 hours
- **Max Guests**: 10
- **Type**: Plated dinner
- **Tickets Available**: 10

## Data Structure

### Menu Entity
```typescript
{
  id: string;
  name: string;
  courses: Course[];
}
```

### Course Entity
```typescript
{
  id: string;
  name: string;
  menu_id: string;
  dishes: Dish[];
}
```

### Dish Entity
```typescript
{
  id: string;
  name: string;
  description?: string;
  course_id: string;
  ingredients: Ingredient[];
}
```

### Ingredient Entity
```typescript
{
  id: string;
  name: string;
  optional: boolean;
  dish_id: string;
}
```

## Integration with Products

Each menu is linked to a corresponding product that serves as the "ticket" for the experience:

- Products are created in the "Chef Experiences" collection
- Tagged with "Chef Experience" and "Limited Availability"
- Use digital shipping profile (no physical delivery)
- Metadata includes experience details (duration, max guests, etc.)
- Links established between menu entities and products for easy retrieval

## Customization

To add new menus:

1. Add menu definition to `menuDefinitions` array in `menus.ts`
2. Add corresponding product data to `menuProductData` array
3. Run the seeding script to create the new menu

The system will automatically create all courses, dishes, ingredients, and the corresponding product with proper links. 