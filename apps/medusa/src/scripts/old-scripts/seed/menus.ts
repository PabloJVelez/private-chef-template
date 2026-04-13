import { CreateProductWorkflowInputDTO, ProductCollectionDTO, ProductTagDTO } from '@medusajs/framework/types';
import { ProductStatus } from '@medusajs/utils';
import type { ExecArgs } from '@medusajs/types';
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
    name: "The Winter Table",
    courses: [
      {
        name: "Cocktails",
        dishes: [
          {
            name: "Frosted Cranberry Martini",
            description: "Vodka, cranberry, and a splash of sparkling wine, garnished with fresh cranberries.",
            ingredients: [
              { name: "Vodka" },
              { name: "Cranberry juice" },
              { name: "Sparkling wine" },
              { name: "Fresh cranberries" },
              { name: "Ice" }
            ]
          },
          {
            name: "Spiced Apple Cider Mule",
            description: "Spiced apple cider, ginger beer, and vodka in a copper mug with a cinnamon stick.",
            ingredients: [
              { name: "Spiced apple cider" },
              { name: "Ginger beer" },
              { name: "Vodka" },
              { name: "Cinnamon stick" },
              { name: "Copper mug" }
            ]
          }
        ]
      },
      {
        name: "Canapés",
        dishes: [
          {
            name: "Goat Cheese & Fig Tartlets",
            description: "Flaky pastry with creamy goat cheese and fig jam, finished with balsamic glaze.",
            ingredients: [
              { name: "Puff pastry" },
              { name: "Goat cheese" },
              { name: "Fig jam" },
              { name: "Balsamic glaze" },
              { name: "Fresh thyme", optional: true }
            ]
          },
          {
            name: "Pomegranate & Avocado Crostini",
            description: "Toasted baguette with avocado and pomegranate, lime and sea salt.",
            ingredients: [
              { name: "Baguette slices" },
              { name: "Avocado" },
              { name: "Pomegranate seeds" },
              { name: "Lime juice" },
              { name: "Sea salt" }
            ]
          }
        ]
      },
      {
        name: "Entrées",
        dishes: [
          {
            name: "Herb-Crusted Rack of Lamb",
            description: "Lamb rack with a savory herb crust and red wine reduction.",
            ingredients: [
              { name: "Rack of lamb" },
              { name: "Fresh rosemary" },
              { name: "Fresh thyme" },
              { name: "Garlic" },
              { name: "Breadcrumbs" },
              { name: "Red wine" },
              { name: "Beef stock" }
            ]
          },
          {
            name: "Lemon-Herb Salmon",
            description: "Salmon fillet marinated in lemon and herbs, grilled to perfection.",
            ingredients: [
              { name: "Salmon fillet" },
              { name: "Lemon" },
              { name: "Fresh dill" },
              { name: "Olive oil" },
              { name: "Garlic" },
              { name: "Black pepper" }
            ]
          }
        ]
      },
      {
        name: "Sides",
        dishes: [
          {
            name: "Roasted Root Vegetables",
            description: "Seasonal roots and vegetables roasted with olive oil and herbs.",
            ingredients: [
              { name: "Carrots" },
              { name: "Parsnips" },
              { name: "Brussels sprouts" },
              { name: "Sweet potatoes" },
              { name: "Olive oil" },
              { name: "Fresh herbs" }
            ]
          },
          {
            name: "Garlic Mashed Potatoes",
            description: "Creamy Yukon gold potatoes with roasted garlic.",
            ingredients: [
              { name: "Yukon potatoes" },
              { name: "Roasted garlic" },
              { name: "Heavy cream" },
              { name: "Butter" },
              { name: "Salt" },
              { name: "White pepper" }
            ]
          }
        ]
      },
      {
        name: "Dessert",
        dishes: [
          {
            name: "Chocolate Peppermint Mousse",
            description: "Dark chocolate mousse with whipped cream and crushed peppermint.",
            ingredients: [
              { name: "Dark chocolate" },
              { name: "Heavy cream" },
              { name: "Eggs" },
              { name: "Sugar" },
              { name: "Peppermint extract" },
              { name: "Peppermint candies" }
            ]
          }
        ]
      }
    ]
  },
  {
    name: "Salt & Sun",
    courses: [
      {
        name: "Cocktails",
        dishes: [
          {
            name: "Pineapple Coconut Mojito",
            description: "White rum, fresh mint, pineapple and coconut water over ice.",
            ingredients: [
              { name: "White rum" },
              { name: "Fresh mint" },
              { name: "Pineapple juice" },
              { name: "Coconut water" },
              { name: "Lime juice" },
              { name: "Simple syrup" }
            ]
          },
          {
            name: "Mango Passionfruit Bellini",
            description: "Prosecco with mango and passionfruit purée, garnished with fresh mango.",
            ingredients: [
              { name: "Prosecco" },
              { name: "Mango puree" },
              { name: "Passionfruit puree" },
              { name: "Fresh mango slice" }
            ]
          }
        ]
      },
      {
        name: "Canapés",
        dishes: [
          {
            name: "Shrimp & Avocado Ceviche",
            description: "Shrimp cured in lime with avocado, tomatoes, and cilantro.",
            ingredients: [
              { name: "Fresh shrimp" },
              { name: "Lime juice" },
              { name: "Avocado" },
              { name: "Cherry tomatoes" },
              { name: "Red onion" },
              { name: "Cilantro" },
              { name: "Jalapeño", optional: true }
            ]
          },
          {
            name: "Tropical Fruit Skewers",
            description: "Pineapple, mango, kiwi and papaya with honey and lime.",
            ingredients: [
              { name: "Pineapple" },
              { name: "Mango" },
              { name: "Kiwi" },
              { name: "Papaya" },
              { name: "Honey" },
              { name: "Lime zest" }
            ]
          }
        ]
      },
      {
        name: "Entrées",
        dishes: [
          {
            name: "Mahi Mahi with Mango Salsa",
            description: "Grilled mahi-mahi with a vibrant mango salsa.",
            ingredients: [
              { name: "Mahi-mahi fillets" },
              { name: "Mango" },
              { name: "Red bell pepper" },
              { name: "Red onion" },
              { name: "Cilantro" },
              { name: "Lime juice" },
              { name: "Olive oil" }
            ]
          },
          {
            name: "Herb-Crusted Chicken with Pineapple Salsa",
            description: "Chicken breast with herb crust and sweet pineapple salsa.",
            ingredients: [
              { name: "Chicken breasts" },
              { name: "Fresh herbs" },
              { name: "Breadcrumbs" },
              { name: "Pineapple" },
              { name: "Red onion" },
              { name: "Jalapeño" },
              { name: "Cilantro" }
            ]
          }
        ]
      },
      {
        name: "Sides",
        dishes: [
          {
            name: "Coconut Jasmine Rice",
            description: "Jasmine rice cooked with coconut milk and a touch of salt.",
            ingredients: [
              { name: "Jasmine rice" },
              { name: "Coconut milk" },
              { name: "Water" },
              { name: "Salt" },
              { name: "Toasted coconut flakes", optional: true }
            ]
          },
          {
            name: "Grilled Asparagus",
            description: "Asparagus spears grilled with olive oil and lemon.",
            ingredients: [
              { name: "Fresh asparagus" },
              { name: "Olive oil" },
              { name: "Salt" },
              { name: "Black pepper" },
              { name: "Lemon zest", optional: true }
            ]
          }
        ]
      },
      {
        name: "Dessert",
        dishes: [
          {
            name: "Coconut Lime Tart",
            description: "Lime tart on coconut crust with whipped cream and toasted coconut.",
            ingredients: [
              { name: "Coconut" },
              { name: "Graham crackers" },
              { name: "Butter" },
              { name: "Lime juice" },
              { name: "Lime zest" },
              { name: "Condensed milk" },
              { name: "Heavy cream" }
            ]
          }
        ]
      }
    ]
  },
  {
    name: "The Harvest Table",
    courses: [
      {
        name: "Cocktails",
        dishes: [
          {
            name: "Maple Bourbon Old Fashioned",
            description: "Bourbon, maple syrup, and bitters with orange peel.",
            ingredients: [
              { name: "Bourbon whiskey" },
              { name: "Maple syrup" },
              { name: "Angostura bitters" },
              { name: "Orange peel" },
              { name: "Ice" },
              { name: "Maraschino cherry", optional: true }
            ]
          },
          {
            name: "Pear & Ginger Sparkler",
            description: "Pear juice, ginger ale, and gin with a slice of fresh pear.",
            ingredients: [
              { name: "Pear juice" },
              { name: "Ginger ale" },
              { name: "Gin" },
              { name: "Fresh pear slice" },
              { name: "Lemon juice" }
            ]
          }
        ]
      },
      {
        name: "Canapés",
        dishes: [
          {
            name: "Butternut Squash Soup Shots",
            description: "Creamy butternut squash soup in shot glasses with nutmeg.",
            ingredients: [
              { name: "Butternut squash" },
              { name: "Vegetable broth" },
              { name: "Onion" },
              { name: "Heavy cream" },
              { name: "Nutmeg" },
              { name: "Salt" },
              { name: "Black pepper" }
            ]
          },
          {
            name: "Brie & Cranberry Puff Pastry Bites",
            description: "Puff pastry with brie and cranberry, finished with thyme.",
            ingredients: [
              { name: "Puff pastry" },
              { name: "Brie cheese" },
              { name: "Cranberry sauce" },
              { name: "Fresh thyme" },
              { name: "Egg wash" }
            ]
          }
        ]
      },
      {
        name: "Entrées",
        dishes: [
          {
            name: "Roasted Herb Chicken",
            description: "Whole chicken with rosemary, sage and garlic, served with gravy.",
            ingredients: [
              { name: "Whole chicken" },
              { name: "Fresh rosemary" },
              { name: "Fresh sage" },
              { name: "Garlic" },
              { name: "Butter" },
              { name: "Chicken stock" },
              { name: "Flour" }
            ]
          },
          {
            name: "Pesto-Stuffed Chicken Breast",
            description: "Chicken breast with basil pesto, mozzarella and sun-dried tomato.",
            ingredients: [
              { name: "Chicken breasts" },
              { name: "Basil pesto" },
              { name: "Mozzarella cheese" },
              { name: "Sun-dried tomatoes" },
              { name: "Olive oil" },
              { name: "Italian seasoning" }
            ]
          }
        ]
      },
      {
        name: "Sides",
        dishes: [
          {
            name: "Seasonal Vegetable Medley",
            description: "Roasted seasonal vegetables with olive oil and herbs.",
            ingredients: [
              { name: "Butternut squash" },
              { name: "Acorn squash" },
              { name: "Brussels sprouts" },
              { name: "Carrots" },
              { name: "Red onion" },
              { name: "Olive oil" },
              { name: "Fresh herbs" }
            ]
          },
          {
            name: "Wild Rice Pilaf",
            description: "Wild rice with vegetable broth, celery, onion and herbs.",
            ingredients: [
              { name: "Wild rice" },
              { name: "Vegetable broth" },
              { name: "Celery" },
              { name: "Onion" },
              { name: "Fresh parsley" },
              { name: "Bay leaves" },
              { name: "Butter" }
            ]
          }
        ]
      },
      {
        name: "Dessert",
        dishes: [
          {
            name: "Apple Crisp",
            description: "Baked apples with oat topping and vanilla ice cream.",
            ingredients: [
              { name: "Granny Smith apples" },
              { name: "Rolled oats" },
              { name: "Brown sugar" },
              { name: "Flour" },
              { name: "Butter" },
              { name: "Cinnamon" },
              { name: "Vanilla ice cream" }
            ]
          }
        ]
      }
    ]
  },
  {
    name: "Noir & Blanc",
    courses: [
      {
        name: "Cocktails",
        dishes: [
          {
            name: "Blackberry Gin Fizz",
            description: "Gin, fresh blackberries, lemon and tonic with mint.",
            ingredients: [
              { name: "Gin" },
              { name: "Fresh blackberries" },
              { name: "Lemon juice" },
              { name: "Simple syrup" },
              { name: "Tonic water" },
              { name: "Fresh mint", optional: true }
            ]
          },
          {
            name: "French 75",
            description: "Gin, lemon, sugar and champagne with a lemon twist.",
            ingredients: [
              { name: "Gin" },
              { name: "Fresh lemon juice" },
              { name: "Simple syrup" },
              { name: "Champagne" },
              { name: "Lemon twist" }
            ]
          }
        ]
      },
      {
        name: "Canapés",
        dishes: [
          {
            name: "Caprese Skewers",
            description: "Mozzarella, cherry tomatoes and basil with balsamic reduction.",
            ingredients: [
              { name: "Fresh mozzarella balls" },
              { name: "Cherry tomatoes" },
              { name: "Fresh basil leaves" },
              { name: "Balsamic reduction" },
              { name: "Extra virgin olive oil" }
            ]
          },
          {
            name: "Smoked Salmon Blinis",
            description: "Buckwheat blinis with smoked salmon and crème fraîche.",
            ingredients: [
              { name: "Buckwheat flour" },
              { name: "Eggs" },
              { name: "Milk" },
              { name: "Smoked salmon" },
              { name: "Crème fraîche" },
              { name: "Fresh dill" },
              { name: "Capers", optional: true }
            ]
          }
        ]
      },
      {
        name: "Entrées",
        dishes: [
          {
            name: "Surf & Turf",
            description: "Grilled lobster tail and filet mignon with lemon butter.",
            ingredients: [
              { name: "Lobster tail" },
              { name: "Filet mignon" },
              { name: "Butter" },
              { name: "Lemon juice" },
              { name: "Garlic" },
              { name: "Fresh parsley" },
              { name: "Black pepper" }
            ]
          },
          {
            name: "Herb-Crusted Chicken Thighs",
            description: "Chicken thighs with herb crust and Parmesan.",
            ingredients: [
              { name: "Chicken thighs" },
              { name: "Fresh herbs" },
              { name: "Breadcrumbs" },
              { name: "Parmesan cheese" },
              { name: "Olive oil" },
              { name: "Garlic" }
            ]
          }
        ]
      },
      {
        name: "Sides",
        dishes: [
          {
            name: "Sautéed Green Beans",
            description: "Green beans with garlic, olive oil and optional almonds.",
            ingredients: [
              { name: "Fresh green beans" },
              { name: "Garlic" },
              { name: "Olive oil" },
              { name: "Salt" },
              { name: "Black pepper" },
              { name: "Almonds", optional: true }
            ]
          },
          {
            name: "Truffle Mashed Potatoes",
            description: "Yukon gold potatoes with cream and truffle oil.",
            ingredients: [
              { name: "Yukon potatoes" },
              { name: "Heavy cream" },
              { name: "Butter" },
              { name: "Truffle oil" },
              { name: "Salt" },
              { name: "White pepper" }
            ]
          }
        ]
      },
      {
        name: "Dessert",
        dishes: [
          {
            name: "Tiramisu",
            description: "Espresso-soaked ladyfingers with mascarpone and cocoa.",
            ingredients: [
              { name: "Ladyfinger cookies" },
              { name: "Strong espresso" },
              { name: "Mascarpone cheese" },
              { name: "Heavy cream" },
              { name: "Sugar" },
              { name: "Cocoa powder" },
              { name: "Dark rum", optional: true }
            ]
          }
        ]
      }
    ]
  },
  {
    name: 'Custom',
    allow_tbd_pricing: true,
    thumbnail:
      'https://images.unsplash.com/photo-1556910103-1c02745aae4d?w=800&q=80',
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
    title: "The Winter Table",
    description: "A refined winter tasting: cocktails, canapés, herb-crusted lamb or salmon, roasted roots, and chocolate peppermint mousse. Ideal for intimate holiday gatherings.",
    handle: "the-winter-table",
    price: { usd: 125, cad: 165 },
    estimatedDuration: 180,
    maxGuests: 12,
    eventType: "plated_dinner",
    images: ["https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=800&q=80"],
    availableTickets: 15
  },
  {
    title: "Salt & Sun",
    description: "Coastal-inspired dining: tropical cocktails, ceviche, mahi-mahi or herb chicken, coconut rice, and coconut lime tart. Perfect for a relaxed, elegant gathering.",
    handle: "salt-and-sun",
    price: { usd: 110, cad: 145 },
    estimatedDuration: 165,
    maxGuests: 14,
    eventType: "buffet_style",
    images: ["https://images.unsplash.com/photo-1559339352-11d035aa65de?w=800&q=80"],
    availableTickets: 18
  },
  {
    title: "The Harvest Table",
    description: "Farm-to-table experience: bourbon cocktails, squash soup, roast or pesto-stuffed chicken, seasonal vegetables, wild rice, and apple crisp. A warm, convivial evening.",
    handle: "the-harvest-table",
    price: { usd: 95, cad: 125 },
    estimatedDuration: 150,
    maxGuests: 16,
    eventType: "cooking_class",
    images: ["https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=800&q=80"],
    availableTickets: 12
  },
  {
    title: "Noir & Blanc",
    description: "Upscale soirée: French 75 and blackberry fizz, caprese and salmon blinis, surf & turf or herb chicken, truffle mash, and tiramisu. For milestone celebrations.",
    handle: "noir-and-blanc",
    price: { usd: 150, cad: 195 },
    estimatedDuration: 210,
    maxGuests: 10,
    eventType: "plated_dinner",
    images: ["https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=800&q=80"],
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
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);

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