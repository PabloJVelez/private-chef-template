import { ActionList } from '@app/components/common/actions-list/ActionList';
import { Container } from '@app/components/common/container/Container';
import type { CustomAction, ImageField } from '@libs/types';
import { getChefConfig } from '@libs/config/chef/chef-config';
import clsx from 'clsx';
import type { FC } from 'react';

const chefConfig = getChefConfig();

export interface ChefHeroProps {
  className?: string;
  backgroundClassName?: string;
  actionsClassName?: string;
  chefName?: string;
  tagline?: string;
  description?: string;
  image?: ImageField;
  actions?: CustomAction[];
}

export const ChefHero: FC<ChefHeroProps> = ({
  className,
  backgroundClassName,
  actionsClassName,
  chefName = chefConfig.displayName,
  tagline = chefConfig.hero.tagline,
  description = chefConfig.hero.description,
  image = {
    url: chefConfig.hero.imageUrl,
    alt: chefConfig.hero.imageAlt,
  },
  actions = [
    {
      label: 'Browse Our Menus',
      url: '/menus',
    },
    {
      label: 'Request an Event',
      url: '/request',
    },
  ],
}) => {
  return (
    <>
      {image?.url && <link rel="preload" href={image?.url} as="image" />}
      <Container className={clsx('flex flex-col justify-center items-center relative w-full bg-accent-50', className)}>
        <div
          className={clsx(
            'mkt-section__background-overlay flex-1 z-0 bg-cover bg-no-repeat bg-center',
            backgroundClassName,
          )}
          style={{
            // Add a subtle tint to improve text readability over the image
            backgroundImage: `linear-gradient(to bottom, rgba(0,0,0,0.35), rgba(0,0,0,0.35)), url(${image?.url})`,
          }}
        />
        <div className="overflow-hidden z-10 w-full text-white">
          <div className="inline-grid gap-6 w-full text-center">
            <h4 className="font-italiana text-xl md:text-2xl tracking-wider text-white">{tagline}</h4>
            <h1 className="text-5xl md:text-7xl lg:text-8xl font-italiana text-white drop-shadow-lg">{chefName}</h1>
            <p className="max-w-2xl mx-auto text-base md:text-lg leading-relaxed text-white drop-shadow-md">
              {description}
            </p>
          </div>

          {!!actions?.length && (
            <ActionList
              actions={actions}
              className={clsx('mt-8 lg:mt-10 flex-col gap-4 md:flex-row md:justify-center', actionsClassName)}
            />
          )}
        </div>
      </Container>
    </>
  );
};

export default ChefHero;
