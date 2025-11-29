import { Container } from '@app/components/common/container/Container';
import { ActionList } from '@app/components/common/actions-list/ActionList';
import clsx from 'clsx';
import type { FC } from 'react';

export interface HowItWorksProps {
  className?: string;
  title?: string;
  description?: string;
}

interface ProcessStep {
  step: number;
  title: string;
  description: string;
  timeline: string;
  icon: string;
}

const processSteps: ProcessStep[] = [
  {
    step: 1,
    title: 'Browse & Request',
    description:
      'Explore our menu collections and choose your preferred experience type. Submit a request with your event details.',
    timeline: '5 minutes',
    icon: '🍽️',
  },
  {
    step: 2,
    title: 'Chef Review & Approval',
    description:
      "Your request will be reviewed and availability confirmed. You'll receive a detailed proposal with menu customizations.",
    timeline: '24-48 hours',
    icon: '👨‍🍳',
  },
  {
    step: 3,
    title: 'Book & Purchase',
    description:
      'Once approved, your event becomes available for purchase. Buy tickets for your guests with secure payment processing.',
    timeline: 'Immediate',
    icon: '🎫',
  },
  {
    step: 4,
    title: 'Experience & Enjoy',
    description:
      'The chef arrives at your location with all ingredients and equipment. Relax and enjoy your personalized culinary experience.',
    timeline: 'Event day',
    icon: '🎉',
  },
];

interface StepCardProps {
  step: ProcessStep;
  isLast?: boolean;
  className?: string;
}

const StepCard: FC<StepCardProps> = ({ step, isLast = false, className }) => {
  return (
    <div className={clsx('relative h-full', className)}>
      {/* Connection line to next step */}
      {!isLast && (
        <div className="hidden md:block absolute top-16 left-1/2 transform translate-x-8 w-full h-0.5 bg-gradient-to-r from-blue-500 to-gray-300 z-0" />
      )}

      <div className="relative bg-white rounded-2xl shadow-lg p-8 hover:shadow-xl transition-shadow duration-300 z-10 h-full flex flex-col">
        <div className="text-center space-y-6 flex-1 flex flex-col">
          {/* Step number and icon */}
          <div className="relative mx-auto">
            <div className="w-20 h-20 bg-blue-500 rounded-full flex items-center justify-center text-white font-bold text-lg mb-4">
              {step.step}
            </div>
            <div className="text-4xl mb-4">{step.icon}</div>
          </div>

          {/* Step title and timeline */}
          <div>
            <h3 className="text-2xl font-semibold text-gray-900 mb-2">{step.title}</h3>
            <div className="inline-block bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm font-medium mb-4">
              {step.timeline}
            </div>
          </div>

          {/* Description */}
          <p className="text-gray-700 leading-relaxed">{step.description}</p>
        </div>
      </div>
    </div>
  );
};

export const HowItWorks: FC<HowItWorksProps> = ({
  className,
  title = 'How It Works',
  description = "From browsing menus to enjoying your culinary experience, we've made the process simple and transparent. Here's how your culinary journey unfolds:",
}) => {
  return (
    <Container className={clsx('py-16 lg:py-20 bg-gray-50', className)}>
      <div className="text-center mb-16">
        <h2 className="text-4xl md:text-5xl font-italiana text-gray-900 mb-4">{title}</h2>
        <p className="text-lg text-gray-600 max-w-4xl mx-auto leading-relaxed">{description}</p>
      </div>

      {/* <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
        {processSteps.map((step, index) => (
          <StepCard 
            key={step.step} 
            step={step}
            isLast={index === processSteps.length - 1}
          />
        ))}
      </div> */}

      {/* Call to action section */}
      <div className="text-center mt-16">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-2xl mx-auto">
          <h3 className="text-2xl font-semibold text-gray-900 mb-4">Ready to Start Your Culinary Journey?</h3>
          <p className="text-gray-600 mb-6">
            Begin by exploring our menu collections or jump straight to requesting your custom culinary experience. No
            commitments until the chef approves your event.
          </p>
          <ActionList
            actions={[
              {
                label: 'Browse Menus',
                url: '/menus',
              },
              {
                label: 'Request Event Now',
                url: '/request',
              },
            ]}
            className="flex-col gap-4 sm:flex-row sm:justify-center"
          />
        </div>
      </div>

      {/* FAQ section */}
      <div className="mt-16 text-center">
        <h3 className="text-xl font-semibold text-gray-900 mb-8">Frequently Asked Questions</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 text-left">
          <div className="bg-white rounded-lg p-6 shadow">
            <h4 className="font-semibold text-gray-900 mb-2">How far in advance should I book?</h4>
            <p className="text-sm text-gray-600">
              We recommend booking 1-2 weeks in advance, especially for weekend events. However, we can often
              accommodate shorter notice requests.
            </p>
          </div>

          <div className="bg-white rounded-lg p-6 shadow">
            <h4 className="font-semibold text-gray-900 mb-2">What's included in the service?</h4>
            <p className="text-sm text-gray-600">
              All ingredients, equipment, preparation, service, and cleanup are included. You just provide the location
              and we handle the rest.
            </p>
          </div>

          <div className="bg-white rounded-lg p-6 shadow">
            <h4 className="font-semibold text-gray-900 mb-2">Can menus be customized?</h4>
            <p className="text-sm text-gray-600">
              Absolutely! Our chef works with you to customize any menu based on dietary restrictions, preferences, and
              seasonal availability.
            </p>
          </div>
        </div>
      </div>
    </Container>
  );
};

export default HowItWorks;
