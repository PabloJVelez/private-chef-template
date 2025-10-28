import { Container } from '@app/components/common/container/Container';
import { ActionList } from '@app/components/common/actions-list/ActionList';
import { Image } from '@app/components/common/images/Image';
import { Accordion } from 'radix-ui';
import { ChevronDownIcon } from '@heroicons/react/24/outline';
import clsx from 'clsx';
import type { FC } from 'react';

export interface ExperienceTypesProps {
  className?: string;
  title?: string;
  description?: string;
}

interface ExperienceType {
  id: string;
  name: string;
  price: string;
  description: string;
  highlights: string[];
  icon: string;
  idealFor: string;
  duration: string;
}

const experienceTypes: ExperienceType[] = [
  {
    id: 'buffet_style',
    name: 'Buffet Style',
    price: '$99.99',
    description: 'Perfect for larger gatherings and casual entertaining. A variety of dishes served buffet-style, allowing guests to mingle and enjoy at their own pace.',
    highlights: [
      'Multiple dishes and appetizers',
      'Self-service dining style',
      'Great for mingling',
      'Flexible timing'
    ],
    icon: '/assets/images/buffet.jpg',
    idealFor: 'Birthday parties, family gatherings, casual celebrations',
    duration: '2.5 hours'
  },
  {
    id: 'cooking_class',
    name: 'Cooking Class',
    price: '$119.99',
    description: 'An interactive culinary experience where you learn professional techniques while preparing a delicious meal together.',
    highlights: [
      'Hands-on cooking instruction',
      'Learn professional techniques',
      'Interactive experience',
      'Take home new skills'
    ],
    icon: '/assets/images/cooking_class.jpg',
    idealFor: 'Date nights, team building, skill development',
    duration: '3 hours'
  },
  {
    id: 'plated_dinner',
    name: 'Plated Dinner',
    price: '$149.99',
    description: 'An elegant, restaurant-quality dining experience with multiple courses served individually. Perfect for special occasions.',
    highlights: [
      'Multi-course tasting menu',
      'Restaurant-quality presentation',
      'Full-service dining',
      'Premium ingredients'
    ],
    icon: '/assets/images/plated_dinner.jpg',
    idealFor: 'Anniversaries, proposals, formal celebrations',
    duration: '4 hours'
  }
];

interface ExperienceCardProps {
  experience: ExperienceType;
  className?: string;
  featured?: boolean;
}

interface ExperienceAccordionItemProps {
  experience: ExperienceType;
  className?: string;
  featured?: boolean;
}

const ExperienceCard: FC<ExperienceCardProps> = ({ experience, className, featured = false }) => {
  return (
    <div className={clsx(
      "relative bg-white rounded-lg shadow-md p-6 transition-all duration-300 h-full flex flex-col border-2 border-transparent",
      "hover:shadow-lg hover:scale-[1.02] hover:border-accent-500 focus-within:border-accent-500 focus-within:shadow-lg focus-within:scale-[1.02]",
      className
    )}>
      {featured && (
        <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
          <span className="bg-accent-500 text-white px-3 py-1 rounded-full text-sm font-medium">
            Most Popular
          </span>
        </div>
      )}
      
      <div className="text-center space-y-4 flex-grow flex flex-col">
        <div className="w-full h-32 rounded-t-lg overflow-hidden">
          <Image
            src={experience.icon}
            alt={`${experience.name} banner`}
            width={400}
            height={128}
            className="w-full h-full object-cover"
            fallbackSrc={['/assets/images/chef_experience.jpg', '/assets/images/chef_book_experience.jpg']}
          />
        </div>
        
        <div>
          <h3 className="text-xl font-semibold text-primary-900 mb-1">
            {experience.name}
          </h3>
          <div className="text-3xl font-bold text-accent-500 mb-1">
            {experience.price}
          </div>
          <p className="text-sm text-primary-600">per person</p>
        </div>
        
        <p className="text-primary-700 leading-relaxed text-sm flex-grow">
          {experience.description}
        </p>
        
        <div className="space-y-3">
          <h4 className="font-semibold text-primary-900 text-sm">What's Included:</h4>
          <ul className="space-y-1">
            {experience.highlights.map((highlight, index) => (
              <li key={index} className="flex items-center text-xs text-primary-700">
                <span className="w-1 h-1 bg-accent-500 rounded-full mr-2 flex-shrink-0" />
                {highlight}
              </li>
            ))}
          </ul>
        </div>
        
        <div className="space-y-1 pt-3 border-t border-accent-100">
          <div className="flex justify-between items-center text-xs">
            <span className="text-primary-600">Duration:</span>
            <span className="font-medium text-primary-800">{experience.duration}</span>
          </div>
          <div className="text-xs text-primary-600">
            <span className="font-medium">Ideal for:</span> {experience.idealFor}
          </div>
        </div>
        
        <div className="pt-4 mt-auto">
          <ActionList
            actions={[
              {
                label: 'Request This Experience',
                url: `/request?type=${experience.id}`,
              }
            ]}
            className=""
          />
        </div>
      </div>
    </div>
  );
};

const ExperienceAccordionItem: FC<ExperienceAccordionItemProps> = ({ 
  experience, 
  className, 
  featured = false
}) => {
  // Define background colors for each experience type
  const getBackgroundColor = () => {
    if (experience.id === 'buffet_style') return 'bg-blue-50'
    if (experience.id === 'cooking_class') return 'bg-green-50'
    if (experience.id === 'plated_dinner') return 'bg-yellow-50'
    return 'bg-gray-50'
  }

  const getIconBackground = () => {
    if (experience.id === 'buffet_style') return 'bg-blue-100'
    if (experience.id === 'cooking_class') return 'bg-green-100'
    if (experience.id === 'plated_dinner') return 'bg-yellow-100'
    return 'bg-gray-100'
  }

  return (
    <Accordion.Item 
      value={experience.id}
      className={clsx(
        // Mobile-first styling for pill-like cards
        // Avoid transform-based scaling to prevent layout jank during height animations
        "relative rounded-3xl shadow-md ring-1 ring-black/5 transition-colors duration-300 ease-[cubic-bezier(0.87,0,0.13,1)] overflow-hidden",
        getBackgroundColor(),
        className
      )}
    >
      {featured && (
        <div className="absolute top-2 right-4 z-10">
          <span className="bg-accent-600 text-white px-3 py-1.5 rounded-full text-xs font-semibold shadow-md">
            Most Popular
          </span>
        </div>
      )}
      
      <Accordion.Header>
        <Accordion.Trigger
          className={clsx(
            // Two-row header layout. Row 1: title + duration. Row 2: price + caret.
            "w-full px-5 md:px-6 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 rounded-3xl transition-colors duration-300 ease-[cubic-bezier(0.87,0,0.13,1)] hover:bg-white/20 motion-reduce:transition-none group",
            featured ? "pt-10 pb-6" : "py-6"
          )}
        >
          {/* Grid: 30% image (left), 70% details (right). Image spans both rows. */}
          <div className="grid grid-cols-[30%_1fr] gap-4 items-center">
            <div className="row-span-2 rounded-2xl overflow-hidden h-32 md:h-36 bg-white/40 shadow-sm">
              <Image
                src={experience.icon}
                alt={`${experience.name} image`}
                width={200}
                height={160}
                className="w-full h-full object-cover"
                fallbackSrc={['/assets/images/chef_experience.jpg', '/assets/images/chef_book_experience.jpg']}
              />
            </div>

            {/* Row 1: Title only (more room for duration+price below) */}
            <div className="flex items-center">
              <h3 className="truncate text-[22px] md:text-[28px] leading-7 md:leading-8 font-semibold text-primary-900">
                {experience.name}
              </h3>
            </div>

            {/* Row 2: Duration • Price (left), caret on right */}
            <div className="flex items-center justify-between">
              <span className="flex items-baseline gap-2 text-primary-700 whitespace-nowrap">
                <span className="text-base md:text-xl">{experience.duration}</span>
                <span aria-hidden className="text-primary-400">•</span>
                <span className="text-xl md:text-[30px] font-extrabold text-accent-600">{experience.price}</span>
              </span>
              <ChevronDownIcon
                className="h-5 w-5 md:h-6 md:w-6 text-primary-400 transition-transform duration-300 ease-[cubic-bezier(0.87,0,0.13,1)] flex-shrink-0 transform-gpu group-data-[state=open]:rotate-180 group-data-[state=open]:text-accent-600"
              />
            </div>
          </div>
        </Accordion.Trigger>
      </Accordion.Header>
      
      <Accordion.Content
        className="px-6 pb-6 bg-white/60 border-t border-white/40 data-[state=closed]:animate-slideUp data-[state=open]:animate-slideDown overflow-hidden transition-opacity duration-300 ease-[cubic-bezier(0.87,0,0.13,1)] motion-reduce:transition-none data-[state=open]:opacity-100 data-[state=closed]:opacity-0 will-change-[height,opacity]"
      >
          <div className="space-y-5 pt-4">
          <p className="text-primary-700 leading-relaxed text-lg">
            {experience.description}
          </p>
          
          <div className="space-y-3">
            <h4 className="font-semibold text-primary-900 text-lg">What's Included:</h4>
            <ul className="space-y-1.5">
              {experience.highlights.map((highlight, index) => (
                <li key={index} className="flex items-center text-base text-primary-700">
                  <span className="w-1.5 h-1.5 bg-accent-500 rounded-full mr-3 flex-shrink-0" />
                  {highlight}
                </li>
              ))}
            </ul>
          </div>
          
          <div className="space-y-2 pt-3 border-t border-white/40">
            <div className="flex justify-between items-center text-lg">
              <span className="text-primary-600 font-medium">Duration:</span>
              <span className="font-semibold text-primary-800">{experience.duration}</span>
            </div>
            <div className="text-lg text-primary-600">
              <span className="font-medium">Ideal for:</span> {experience.idealFor}
            </div>
          </div>
          
          <div className="pt-4">
            <ActionList
              actions={[
                {
                  label: 'Request This Experience',
                  url: `/request?type=${experience.id}`,
                }
              ]}
              className=""
            />
          </div>
        </div>
      </Accordion.Content>
    </Accordion.Item>
  );
};

export const ExperienceTypes: FC<ExperienceTypesProps> = ({ 
  className,
  title = "Culinary Experiences",
  description = "Each experience is carefully crafted to match the occasion. All prices are per person with no hidden fees or deposits required."
}) => {
  return (
    <Container className={clsx('py-12 lg:py-16', className)}>
      <div className="text-center mb-8 lg:mb-12">
        <h2 className="text-3xl md:text-4xl font-italiana text-primary-900 mb-2 md:mb-3">
          {title}
        </h2>
        {/* Desktop copy stays the same */}
        <p className="hidden lg:block text-base text-primary-600 max-w-2xl mx-auto leading-relaxed">
          {description}
        </p>
        {/* Mobile-friendly helper line to match design intent */}
        <p className="lg:hidden text-primary-600 text-xl">
          Tap to explore • All prices per person
        </p>
      </div>

      {/* Desktop Grid Layout */}
      <div className="hidden lg:grid lg:grid-cols-3 gap-6 lg:gap-8">
        {experienceTypes.map((experience, index) => (
          <ExperienceCard 
            key={experience.id} 
            experience={experience}
            featured={index === 1} // Make cooking class featured (middle option)
          />
        ))}
      </div>

      {/* Mobile Accordion Layout */}
      <div className="lg:hidden pt-2">
        <Accordion.Root
          type="single"
          collapsible
          className="space-y-6"
        >
          {experienceTypes.map((experience, index) => (
            <ExperienceAccordionItem
              key={experience.id}
              experience={experience}
              featured={index === 1} // Make cooking class featured (middle option)
            />
          ))}
        </Accordion.Root>
      </div>

      {/* Helper CTA — copy tweaked for mobile only */}
      <div className="text-center mt-10 lg:mt-12">
        <div className="max-w-xl mx-auto">
          {/* Desktop message unchanged */}
          <h3 className="hidden lg:block text-lg font-semibold text-primary-900 mb-3">
            Not sure which experience is right for you?
          </h3>
          <p className="hidden lg:block text-primary-600 mb-6 text-sm">
            Let us help you choose the perfect culinary experience for your occasion. 
            Let's start with selecting a menu...
          </p>

          {/* Mobile streamlined copy to mirror mock */}
          <p className="lg:hidden text-primary-600 mb-6 text-base">
            Need help choosing? Start by browsing our menus.
          </p>

          <ActionList
            actions={[
              { label: 'Browse Our Menus', url: '/menus' }
            ]}
            className="flex-col gap-3 sm:flex-row sm:justify-center"
          />
        </div>
      </div>
    </Container>
  );
};

export default ExperienceTypes; 
