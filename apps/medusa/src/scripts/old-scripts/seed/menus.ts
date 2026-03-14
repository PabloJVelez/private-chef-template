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

// Menu definitions
export const menuDefinitions: MenuSeedData[] = [
  {
    name: "Winter Wonderland Feast",
    courses: [
      {
        name: "Cocktails",
        dishes: [
          {
            name: "Frosted Cranberry Martini",
            description: "A refreshing blend of vodka, cranberry juice, and a splash of sparkling wine, garnished with fresh cranberries.",
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
            description: "A cozy mix of spiced apple cider, ginger beer, and vodka, served in a copper mug with a cinnamon stick.",
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
        name: "Cocktail Appetizers",
        dishes: [
          {
            name: "Mini Goat Cheese and Fig Tartlets",
            description: "Flaky pastry filled with creamy goat cheese and sweet fig jam, topped with a drizzle of balsamic glaze.",
            ingredients: [
              { name: "Puff pastry" },
              { name: "Goat cheese" },
              { name: "Fig jam" },
              { name: "Balsamic glaze" },
              { name: "Fresh thyme", optional: true }
            ]
          },
          {
            name: "Pomegranate and Avocado Bites",
            description: "Diced avocado and pomegranate seeds on toasted baguette slices, drizzled with lime juice.",
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
        name: "Entrees",
        dishes: [
          {
            name: "Herb-Crusted Rack of Lamb",
            description: "Juicy lamb rack coated with a savory herb crust, served with a red wine reduction.",
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
            name: "Grilled Lemon-Herb Salmon",
            description: "Tender salmon fillet marinated in lemon and herbs, grilled to perfection.",
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
            description: "A medley of seasonal root vegetables roasted with olive oil and herbs.",
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
            description: "Creamy mashed potatoes infused with roasted garlic.",
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
            description: "A rich chocolate mousse topped with whipped cream and crushed peppermint candies.",
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
    name: "Tropical Holiday Escape",
    courses: [
      {
        name: "Cocktails",
        dishes: [
          {
            name: "Pineapple Coconut Mojito",
            description: "A refreshing mix of rum, fresh mint, pineapple juice, and coconut water, served over ice.",
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
            description: "A bubbly blend of prosecco and mango-passionfruit puree, garnished with a slice of fresh mango.",
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
        name: "Cocktail Appetizers",
        dishes: [
          {
            name: "Shrimp and Avocado Ceviche",
            description: "Fresh shrimp marinated in lime juice with diced avocado, tomatoes, and cilantro.",
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
            description: "Skewers of assorted tropical fruits like pineapple, mango, and kiwi, drizzled with honey.",
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
        name: "Entrees",
        dishes: [
          {
            name: "Grilled Mahi Mahi with Mango Salsa",
            description: "Flaky mahi-mahi fillets grilled and topped with a vibrant mango salsa.",
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
            description: "Juicy chicken breasts baked with an herb crust and served with sweet pineapple salsa.",
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
            name: "Coconut Rice",
            description: "Fluffy jasmine rice cooked with coconut milk for a tropical twist.",
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
            description: "Tender asparagus spears lightly seasoned and grilled.",
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
            description: "A zesty lime tart with a coconut crust, topped with whipped cream and toasted coconut flakes.",
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
    name: "Rustic Autumn Gathering",
    courses: [
      {
        name: "Cocktails",
        dishes: [
          {
            name: "Maple Bourbon Old Fashioned",
            description: "A warm and inviting cocktail made with bourbon, maple syrup, and a dash of bitters.",
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
            name: "Pear and Ginger Sparkler",
            description: "A delightful mix of pear juice, ginger ale, and a splash of gin, garnished with a slice of fresh pear.",
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
        name: "Cocktail Appetizers",
        dishes: [
          {
            name: "Butternut Squash Soup Shots",
            description: "Creamy butternut squash soup served in shot glasses, garnished with a sprinkle of nutmeg.",
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
            name: "Brie and Cranberry Puff Pastry Bites",
            description: "Flaky pastry filled with creamy brie and tart cranberry sauce.",
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
        name: "Entrees",
        dishes: [
          {
            name: "Roasted Herb Chicken",
            description: "Oven-roasted chicken seasoned with herbs and served with a rich gravy.",
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
            name: "Baked Pesto Stuffed Chicken Breast",
            description: "Chicken breasts filled with basil pesto and mozzarella, baked to perfection.",
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
            description: "A colorful mix of roasted seasonal vegetables.",
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
            description: "Nutty wild rice cooked with herbs and spices.",
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
            description: "Warm baked apples topped with a crunchy oat topping, served with vanilla ice cream.",
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
    name: "Elegant Evening Soirée",
    courses: [
      {
        name: "Cocktails",
        dishes: [
          {
            name: "Blackberry Gin Fizz",
            description: "A refreshing cocktail made with gin, fresh blackberries, lemon juice, and tonic water.",
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
            description: "A classic cocktail made with gin, lemon juice, sugar, and topped with champagne.",
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
        name: "Cocktail Appetizers",
        dishes: [
          {
            name: "Caprese Skewers",
            description: "Fresh mozzarella, cherry tomatoes, and basil drizzled with balsamic reduction on skewers.",
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
            description: "Mini pancakes topped with smoked salmon and crème fraîche.",
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
        name: "Entrees",
        dishes: [
          {
            name: "Surf and Turf",
            description: "A delicious combination of grilled lobster tail and filet mignon, served with a lemon butter sauce.",
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
            description: "Juicy chicken thighs baked with a flavorful herb crust.",
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
            description: "Fresh green beans sautéed with garlic and olive oil.",
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
            description: "Creamy mashed potatoes infused with truffle oil.",
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
            description: "A classic Italian dessert made with layers of coffee-soaked ladyfingers and mascarpone cheese.",
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
  }
];

// Product data for menu experience tickets
export const menuProductData: MenuTicketProductData[] = [
  {
    title: "Winter Wonderland Feast Experience",
    description: "Indulge in a magical winter dining experience featuring sophisticated cocktails, herb-crusted lamb, and decadent chocolate peppermint mousse. Perfect for holiday celebrations and intimate gatherings.",
    handle: "winter-wonderland-feast-experience",
    price: {
      usd: 125,
      cad: 165
    },
    estimatedDuration: 180, // 3 hours
    maxGuests: 12,
    eventType: "plated_dinner",
    images: [
      "https://lambdacurrysites.s3.us-east-1.amazonaws.com/barrio/winter-wonderland-feast.jpg"
    ],
    availableTickets: 15
  },
  {
    title: "Tropical Holiday Escape Experience",
    description: "Transport yourself to paradise with this tropical-inspired dining experience featuring fresh seafood, exotic cocktails, and coconut lime desserts. A perfect escape from winter blues.",
    handle: "tropical-holiday-escape-experience",
    price: {
      usd: 110,
      cad: 145
    },
    estimatedDuration: 165, // 2.75 hours
    maxGuests: 14,
    eventType: "buffet_style",
    images: [
      "https://lambdacurrysites.s3.us-east-1.amazonaws.com/barrio/tropical-escape.jpg"
    ],
    availableTickets: 18
  },
  {
    title: "Rustic Autumn Gathering Experience",
    description: "Celebrate the harvest season with comfort food classics, seasonal vegetables, and warm bourbon cocktails. A cozy gathering perfect for fall celebrations.",
    handle: "rustic-autumn-gathering-experience",
    price: {
      usd: 95,
      cad: 125
    },
    estimatedDuration: 150, // 2.5 hours
    maxGuests: 16,
    eventType: "cooking_class",
    images: [
      "https://lambdacurrysites.s3.us-east-1.amazonaws.com/barrio/autumn-gathering.jpg"
    ],
    availableTickets: 12
  },
  {
    title: "Elegant Evening Soirée Experience",
    description: "An upscale dining experience featuring surf and turf, sophisticated cocktails, and classic tiramisu. Perfect for special occasions and romantic evenings.",
    handle: "elegant-evening-soiree-experience",
    price: {
      usd: 150,
      cad: 195
    },
    estimatedDuration: 210, // 3.5 hours
    maxGuests: 10,
    eventType: "plated_dinner",
    images: [
      "https://lambdacurrysites.s3.us-east-1.amazonaws.com/barrio/elegant-soiree.jpg"
    ],
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