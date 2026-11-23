import { CreateProductWorkflowInputDTO, ProductCollectionDTO, ProductTagDTO } from '@medusajs/framework/types';
import { ProductStatus } from '@medusajs/framework/utils';
import type { ExecArgs } from '@medusajs/framework/types';
import { ContainerRegistrationKeys } from '@medusajs/framework/utils';

// Menu creation data structure
export interface MenuSeedData {
  name: string;
  courses: {
    name: string;
    dishes: {
      name: string;
      description?: string;
      ingredients: {
        name: string;
        optional?: boolean;
      }[];
    }[];
  }[];
  /** When true, menu pricing can be saved with no positive matrix rows (TBD / quote flow). */
  allow_tbd_pricing?: boolean;
  /** Optional hero image for storefront cards (menu module thumbnail). */
  thumbnail?: string | null;
}

// Product data for menu tickets
interface MenuTicketProductData {
  title: string;
  description: string;
  handle: string;
  price: {
    usd: number;
    cad: number;
  };
  estimatedDuration: number; // in minutes
  maxGuests: number;
  eventType: 'cooking_class' | 'plated_dinner' | 'buffet_style';
  images: string[];
  availableTickets: number;
}

// Menu definitions — elegant private-chef experiences
export const menuDefinitions: MenuSeedData[] = [
  {
    name: "Hill Country Supper",
    thumbnail: "/assets/images/elena-duck.webp",
    courses: [
      {
        name: "First course",
        dishes: [{
          name: "Little gems with mustard vinaigrette",
          description: "Tender lettuce, toasted pecans and a sharp Dijon dressing.",
          ingredients: [{ name: "Little gem lettuce" }, { name: "Dijon mustard" }, { name: "Pecans" }],
        }],
      },
      {
        name: "Main course",
        dishes: [{
          name: "Duck with caramelized shallots",
          description: "Pan-seared duck breast with thyme jus and slow-cooked shallots.",
          ingredients: [{ name: "Duck breast" }, { name: "Shallots" }, { name: "Thyme" }],
        }],
      },
      {
        name: "Dessert",
        dishes: [{
          name: "Pear tarte Tatin",
          description: "Caramelized pears under a lid of buttery pastry.",
          ingredients: [{ name: "Pears" }, { name: "Butter" }, { name: "Puff pastry" }],
        }],
      },
    ],
  },
  {
    name: "Sunday in Provence",
    thumbnail: "/assets/images/elena-chicken.webp",
    courses: [
      {
        name: "To start",
        dishes: [{
          name: "Tapenade tartines",
          description: "Grilled sourdough with black olives and lemon zest.",
          ingredients: [{ name: "Sourdough" }, { name: "Black olives" }, { name: "Lemon" }],
        }],
      },
      {
        name: "For the table",
        dishes: [{
          name: "Poulet rôti",
          description: "Roast chicken carved for sharing with green beans and pan juices.",
          ingredients: [{ name: "Chicken" }, { name: "Green beans" }, { name: "Shallots" }],
        }],
      },
      {
        name: "Dessert",
        dishes: [{
          name: "Stone fruit clafoutis",
          description: "Soft baked custard studded with seasonal fruit.",
          ingredients: [{ name: "Stone fruit" }, { name: "Eggs" }, { name: "Cream" }, { name: "Flour" }],
        }],
      },
    ],
  },
  {
    name: "The Pastry Kitchen",
    thumbnail: "/assets/images/elena-tatin.webp",
    courses: [
      {
        name: "Savory pastry",
        dishes: [{
          name: "Leek and chèvre galette",
          description: "Fold a free-form tart around soft leeks and fresh goat cheese.",
          ingredients: [{ name: "Flour" }, { name: "Butter" }, { name: "Leeks" }, { name: "Goat cheese" }],
        }],
      },
      {
        name: "Sweet pastry",
        dishes: [{
          name: "Pear tarte Tatin",
          description: "Learn to cook a deep amber caramel and turn out the tart.",
          ingredients: [{ name: "Pears" }, { name: "Sugar" }, { name: "Butter" }, { name: "Puff pastry" }],
        }],
      },
    ],
  },
  {
    name: "Bistro by Candlelight",
    thumbnail: "/assets/images/elena-steak.webp",
    courses: [
      {
        name: "First course",
        dishes: [{
          name: "Onion soup gratinée",
          description: "Slow-cooked onions beneath a crisp Gruyère toast.",
          ingredients: [{ name: "Onions" }, { name: "Gruyère" }, { name: "Sourdough" }],
        }],
      },
      {
        name: "Main course",
        dishes: [{
          name: "Steak au poivre",
          description: "Beef with cracked peppercorns, cream and potato gratin.",
          ingredients: [{ name: "Beef" }, { name: "Black peppercorns" }, { name: "Cream" }, { name: "Potatoes" }],
        }],
      },
      {
        name: "Dessert",
        dishes: [{
          name: "Dark chocolate pots de crème",
          description: "Small pots of chocolate custard finished with flaky salt.",
          ingredients: [{ name: "Dark chocolate" }, { name: "Eggs" }, { name: "Cream" }, { name: "Sea salt" }],
        }],
      },
    ],
  },
  {
    name: 'Custom',
    allow_tbd_pricing: true,
    thumbnail:
      '/assets/images/elena-portrait.webp',
    courses: [
      {
        name: 'Your menu',
        dishes: [
          {
            name: 'Designed with your chef',
            description:
              'No fixed template—dishes, dietary needs, and style are finalized after you submit your request.',
            ingredients: [],
          },
        ],
      },
    ],
  },
];

// Product data for menu experience tickets (legacy USD+CAD; see chef-experiences.ts for USD-only seed)
export const menuProductData: MenuTicketProductData[] = [
  {
    title: "Hill Country Supper",
    description: "Duck breast with shallots, followed by a pear tart turned out warm at the table.",
    handle: "the-winter-table",
    price: { usd: 125, cad: 165 },
    estimatedDuration: 180,
    maxGuests: 12,
    eventType: "plated_dinner",
    images: ["/assets/images/elena-duck.webp"],
    availableTickets: 15
  },
  {
    title: "Sunday in Provence",
    description: "A shared table of roast chicken, green beans and stone fruit.",
    handle: "salt-and-sun",
    price: { usd: 110, cad: 145 },
    estimatedDuration: 165,
    maxGuests: 14,
    eventType: "buffet_style",
    images: ["/assets/images/elena-chicken.webp"],
    availableTickets: 18
  },
  {
    title: "The Pastry Kitchen",
    description: "Roll, fold and caramelize your way through a hands-on pastry class.",
    handle: "the-harvest-table",
    price: { usd: 95, cad: 125 },
    estimatedDuration: 150,
    maxGuests: 16,
    eventType: "cooking_class",
    images: ["/assets/images/elena-tatin.webp"],
    availableTickets: 12
  },
  {
    title: "Bistro by Candlelight",
    description: "A three-course bistro dinner with onion soup and a peppercorn pan sauce.",
    handle: "noir-and-blanc",
    price: { usd: 150, cad: 195 },
    estimatedDuration: 210,
    maxGuests: 10,
    eventType: "plated_dinner",
    images: ["/assets/images/elena-steak.webp"],
    availableTickets: 10
  }
];

// Helper function to build product data for menu experiences
const buildMenuProductData = ({
  sales_channels,
  sku,
  prices: { usd, cad },
  availableTickets,
  eventType,
  estimatedDuration,
  maxGuests,
}: {
  sales_channels: { id: string }[];
  sku: string;
  prices: {
    usd: number;
    cad: number;
  };
  availableTickets: number;
  eventType: string;
  estimatedDuration: number;
  maxGuests: number;
}) => ({
  options: [
    {
      title: 'Event Type',
      values: [eventType],
    },
    {
      title: 'Max Guests',
      values: [maxGuests.toString()],
    },
  ],
  sales_channels: sales_channels.map(({ id }) => ({
    id,
  })),
  variants: [
    {
      title: `${eventType} Experience`,
      sku: `${sku}-EXPERIENCE`,
      options: {
        'Event Type': eventType,
        'Max Guests': maxGuests.toString(),
      },
      manage_inventory: false,
      prices: [
        {
          amount: cad * 100, // Convert to cents
          currency_code: 'cad',
        },
        {
          amount: usd * 100, // Convert to cents
          currency_code: 'usd',
        },
      ],
    },
  ],
  metadata: {
    event_type: eventType,
    estimated_duration: estimatedDuration,
    max_guests: maxGuests,
    available_tickets: availableTickets,
    is_menu_experience: true,
  },
});

// Function to generate product data for all menu experiences
export const seedMenuProducts = ({
  collections,
  tags,
  sales_channels,
  categories,
  shipping_profile_id,
}: {
  collections: ProductCollectionDTO[];
  tags: ProductTagDTO[];
  categories: { id: string; name: string }[];
  sales_channels: { id: string }[];
  shipping_profile_id: string;
}): CreateProductWorkflowInputDTO[] => {
  return menuProductData.map((menuProduct, index) => {
    const sku = menuProduct.handle.toUpperCase().replace(/-/g, '_');
    
    return {
      title: menuProduct.title,
      description: menuProduct.description,
      handle: menuProduct.handle,
      status: ProductStatus.PUBLISHED,
      category_ids: categories.filter(({ name }) => name === 'Chef Experiences').map(({ id }) => id),
      tag_ids: tags.filter((t) => ['Chef Experience', 'Limited Availability'].includes(t.value)).map((t) => t.id),
      thumbnail: menuProduct.images[0],
      collection_id: collections.find(({ title }) => title === 'Chef Experiences')?.id,
      shipping_profile_id,
      type_id: 'experience', // Custom product type for experiences
      images: menuProduct.images.map(url => ({ url })),
      ...buildMenuProductData({
        sales_channels,
        sku,
        prices: menuProduct.price,
        availableTickets: menuProduct.availableTickets,
        eventType: menuProduct.eventType,
        estimatedDuration: menuProduct.estimatedDuration,
        maxGuests: menuProduct.maxGuests,
      }),
    };
  });
}; 

// Function to create menu entities in the database
export const seedMenuEntities = async (menuModuleService: any): Promise<{ id: string; name: string }[]> => {
  const createdMenus: { id: string; name: string }[] = [];

  for (const menuDefinition of menuDefinitions) {
    try {
      // Create the menu first
      const [createdMenu] = await menuModuleService.createMenus([{
        name: menuDefinition.name,
        status: "active",
      }]);

      console.log(`Created menu: ${menuDefinition.name}`);

      // Create courses for this menu
      for (const courseDefinition of menuDefinition.courses) {
        const [createdCourse] = await menuModuleService.createCourses([{
          name: courseDefinition.name,
          menu_id: createdMenu.id,
        }]);

        console.log(`  Created course: ${courseDefinition.name}`);

        // Create dishes for this course
        for (const dishDefinition of courseDefinition.dishes) {
          const [createdDish] = await menuModuleService.createDishes([{
            name: dishDefinition.name,
            description: dishDefinition.description || null,
            course_id: createdCourse.id,
          }]);

          console.log(`    Created dish: ${dishDefinition.name}`);

          // Create ingredients for this dish
          const ingredientData = dishDefinition.ingredients.map(ingredientDefinition => ({
            name: ingredientDefinition.name,
            optional: ingredientDefinition.optional || false,
            dish_id: createdDish.id,
          }));
          
          if (ingredientData.length > 0) {
            await menuModuleService.createIngredients(ingredientData);
            console.log(`      Created ${ingredientData.length} ingredients for ${dishDefinition.name}`);
          }
        }
      }

      const menuPatch: { id: string; thumbnail?: string | null; allow_tbd_pricing?: boolean } = {
        id: createdMenu.id,
      };
      if (menuDefinition.thumbnail != null) {
        menuPatch.thumbnail = menuDefinition.thumbnail;
      }
      if (menuDefinition.allow_tbd_pricing === true) {
        menuPatch.allow_tbd_pricing = true;
      }
      if (menuPatch.thumbnail !== undefined || menuPatch.allow_tbd_pricing !== undefined) {
        await menuModuleService.updateMenus(menuPatch);
      }

      createdMenus.push({
        id: createdMenu.id,
        name: createdMenu.name,
      });

    } catch (error) {
      console.error(`Error creating menu ${menuDefinition.name}:`, error);
    }
  }

  return createdMenus;
};

// Default export function for Medusa CLI execution
export default async function seedMenuData({ container }: ExecArgs) {
  const logger = container.resolve<import("@medusajs/framework/types").Logger>(ContainerRegistrationKeys.LOGGER);

  try {
    logger.info('Starting menu seeding...');
    
    // Get the menu module service
    const menuModuleService = container.resolve("menuModuleService");
    
    // Seed the menu entities
    const createdMenus = await seedMenuEntities(menuModuleService);
    
    logger.info(`Successfully created ${createdMenus.length} menus:`);
    createdMenus.forEach(menu => {
      logger.info(`- ${menu.name} (ID: ${menu.id})`);
    });
    
    logger.info('Menu seeding completed successfully!');
    
  } catch (error) {
    logger.error(`Error seeding menu data: ${error}`);
    throw error;
  }
} 