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
    icon: 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=100&q=80',
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
    icon: 'https://images.unsplash.com/photo-1556908114-574ce6b1d42a?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=100&q=80',
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
    icon: 'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=100&q=80',
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
        <div className="mx-auto w-12 h-12 bg-accent-100 rounded-full flex items-center justify-center">
          <Image
            src={experience.icon}
            alt={`${experience.name} icon`}
            width={24}
            height={24}
            className="w-6 h-6"
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
        "relative rounded-xl transition-all duration-400 ease-[cubic-bezier(0.16,1,0.3,1)] overflow-hidden transform-gpu data-[state=open]:scale-[1.02] data-[state=open]:shadow-lg data-[state=closed]:scale-100 hover:scale-[1.01]",
        getBackgroundColor(),
        className
      )}
    >
      {featured && (
        <div className="absolute top-2 right-4 z-10">
          <span className="bg-accent-500 text-white px-3 py-1.5 rounded-full text-xs font-semibold shadow-md">
            Most Popular
          </span>
        </div>
      )}
      
      <Accordion.Header>
        <Accordion.Trigger
          className={clsx(
            "w-full px-6 text-left focus:outline-none transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:bg-white/20 group",
            featured ? "pt-10 pb-5" : "py-5"
          )}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4 flex-1">
              <div className={clsx(
                "w-14 h-14 rounded-full flex items-center justify-center flex-shrink-0",
                getIconBackground()
              )}>
                <Image
                  src={experience.icon}
                  alt={`${experience.name} icon`}
                  width={28}
                  height={28}
                  className="w-7 h-7"
                />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-xl font-bold text-primary-900 mb-1">
                  {experience.name}
                </h3>
                <div className="text-primary-600 text-sm">
                  {experience.duration} • per person
                </div>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <span className="text-2xl font-bold text-accent-600">
                {experience.price}
              </span>
              <ChevronDownIcon
                className="h-6 w-6 text-primary-400 transition-all duration-400 ease-[cubic-bezier(0.16,1,0.3,1)] flex-shrink-0 transform-gpu group-data-[state=open]:rotate-180 group-data-[state=open]:text-accent-600 group-data-[state=open]:scale-110"
              />
            </div>
          </div>
        </Accordion.Trigger>
      </Accordion.Header>
      
      <Accordion.Content
        className="px-6 pb-6 bg-white/60 backdrop-blur-sm border-t border-white/40 data-[state=closed]:animate-slideUp data-[state=open]:animate-slideDown overflow-hidden transition-all duration-300 ease-out"
      >
        <div className="space-y-4 pt-4">
          <p className="text-primary-700 leading-relaxed text-sm">
            {experience.description}
          </p>
          
          <div className="space-y-3">
            <h4 className="font-semibold text-primary-900 text-sm">What's Included:</h4>
            <ul className="space-y-1.5">
              {experience.highlights.map((highlight, index) => (
                <li key={index} className="flex items-center text-sm text-primary-700">
                  <span className="w-1.5 h-1.5 bg-accent-500 rounded-full mr-3 flex-shrink-0" />
                  {highlight}
                </li>
              ))}
            </ul>
          </div>
          
          <div className="space-y-2 pt-3 border-t border-white/40">
            <div className="flex justify-between items-center text-sm">
              <span className="text-primary-600 font-medium">Duration:</span>
              <span className="font-semibold text-primary-800">{experience.duration}</span>
            </div>
            <div className="text-sm text-primary-600">
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
  title = "Choose Your Culinary Experience",
  description = "Each experience is carefully crafted to match the occasion. All prices are per person with no hidden fees or deposits required."
}) => {
  return (
    <Container className={clsx('py-12 lg:py-16', className)}>
      <div className="text-center mb-12">
        <h2 className="text-3xl md:text-4xl font-italiana text-primary-900 mb-3">
          {title}
        </h2>
        <p className="text-base text-primary-600 max-w-2xl mx-auto leading-relaxed">
          {description}
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

      <div className="text-center mt-12">
        <div className="max-w-xl mx-auto">
          <h3 className="text-lg font-semibold text-primary-900 mb-3">
            Not sure which experience is right for you?
          </h3>
          <p className="text-primary-600 mb-6 text-sm">
            Let us help you choose the perfect culinary experience for your occasion. 
            Let's start with selecting a menu...
          </p>
          <ActionList
            actions={[
              {
                label: 'Browse Our Menus',
                url: '/menus',
              }
            ]}
            className="flex-col gap-3 sm:flex-row sm:justify-center"
          />
        </div>
      </div>
    </Container>
  );
};

export default ExperienceTypes; 