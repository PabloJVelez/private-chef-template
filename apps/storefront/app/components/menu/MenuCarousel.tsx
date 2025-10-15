import { ScrollArrowButtons } from '@app/components/common/buttons/ScrollArrowButtons';
import { useScrollArrows } from '@app/hooks/useScrollArrows';
import type { StoreMenuDTO } from '@libs/util/server/data/menus.server';
import clsx from 'clsx';
import { type FC, memo, useEffect } from 'react';
import { NavLink } from 'react-router';
import { MenuGridSkeleton } from './MenuGridSkeleton';
import type { MenuListItemProps } from './MenuListItem';
import { MenuListItem } from './MenuListItem';

export interface MenuCarouselProps {
  menus?: StoreMenuDTO[];
  className?: string;
  renderItem?: FC<MenuListItemProps>;
  singleItem?: boolean; // Show one card per view (mobile hero style)
  autoAdvanceMs?: number; // Auto-scroll interval (ms)
  showArrows?: boolean; // Show prev/next arrow buttons
}

export const MenuRow: FC<{ menus: StoreMenuDTO[]; singleItem?: boolean; renderItem?: FC<MenuListItemProps> }> = memo(({ menus, singleItem, renderItem }) => {
  return (
    <>
      {menus.map((menu) => (
        <div
          key={menu.id}
          data-card
          // Widths tuned to match grid steps while enabling snap scrolling
          className={clsx(
            'inline-block snap-center last:mr-0',
            singleItem
              ? 'w-full mr-4 xs:w-full sm:w-full'
              : 'w-[90%] mr-4 xs:w-[85%] sm:w-[70%] sm:mr-6 md:w-[48%] xl:w-[31%] xl:mr-8'
          )}
        >
          {renderItem ? (
            renderItem({ menu })
          ) : (
            <NavLink prefetch="viewport" to={`/menus/${menu.id}`} viewTransition>
              {({ isTransitioning }) => (
                <MenuListItem isTransitioning={isTransitioning} menu={menu} />
              )}
            </NavLink>
          )}
          {/* Quick actions removed per mobile UX decision; card tap + footer link suffice */}
        </div>
      ))}
    </>
  );
});

export const MenuCarousel: FC<MenuCarouselProps> = ({ menus, className, singleItem, autoAdvanceMs, showArrows = true, renderItem }) => {
  const { scrollableDivRef, ...scrollArrowProps } = useScrollArrows({
    buffer: 100,
    resetOnDepChange: [menus],
  });

  if (!menus) return <MenuGridSkeleton />;

  // Motion polish: parallax image and scale centered card
  useEffect(() => {
    const container = scrollableDivRef.current;
    if (!container) return;

    let rafId: number | null = null;

    const updateMotion = () => {
      rafId = null;
      const rect = container.getBoundingClientRect();
      const containerCenter = rect.left + rect.width / 2;

      const cards = container.querySelectorAll<HTMLElement>('[data-card]');
      cards.forEach((card) => {
        const cardRect = card.getBoundingClientRect();
        const cardCenter = cardRect.left + cardRect.width / 2;
        const delta = (cardCenter - containerCenter) / rect.width; // -1..1 approximately
        const clamped = Math.max(-1, Math.min(1, delta));

        const scale = 1 + (1 - Math.min(1, Math.abs(clamped) * 2)) * 0.05; // up to +5% in center
        const parallaxX = -clamped * 24; // px

        card.style.setProperty('--scale', scale.toFixed(3));
        card.style.setProperty('--parallax-x', `${parallaxX.toFixed(1)}px`);
      });
    };

    const onScroll = () => {
      if (rafId == null) {
        rafId = requestAnimationFrame(updateMotion);
      }
    };

    updateMotion();
    container.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    return () => {
      container.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (rafId != null) cancelAnimationFrame(rafId);
    };
  }, [menus, scrollableDivRef]);

  // Auto-advance between cards when requested
  useEffect(() => {
    if (!autoAdvanceMs || autoAdvanceMs <= 0) return;
    const container = scrollableDivRef.current;
    if (!container) return;

    const getCards = () => Array.from(container.querySelectorAll<HTMLElement>('[data-card]'));
    const getOffsets = () => {
      const cRect = container.getBoundingClientRect();
      return getCards().map((card) => {
        const rect = card.getBoundingClientRect();
        // Convert viewport position to scrollLeft target
        return rect.left - cRect.left + container.scrollLeft;
      });
    };

    let timer: number | null = null;
    const tick = () => {
      const offsets = getOffsets();
      if (offsets.length === 0) return;
      // Find nearest index to current scroll
      const currentLeft = container.scrollLeft;
      let nearest = 0;
      let best = Number.POSITIVE_INFINITY;
      offsets.forEach((left, i) => {
        const d = Math.abs(left - currentLeft);
        if (d < best) {
          best = d;
          nearest = i;
        }
      });
      const next = (nearest + 1) % offsets.length;
      container.scrollTo({ left: offsets[next], behavior: 'smooth' });
    };

    const start = () => {
      if (!timer) timer = window.setInterval(tick, autoAdvanceMs);
    };
    const stop = () => {
      if (timer) {
        window.clearInterval(timer);
        timer = null;
      }
    };

    // Pause on user interaction per UX best practices
    container.addEventListener('pointerdown', stop, { passive: true });
    container.addEventListener('pointerenter', stop, { passive: true });
    container.addEventListener('touchstart', stop, { passive: true });
    container.addEventListener('pointerleave', start, { passive: true });

    start();
    return () => {
      stop();
      container.removeEventListener('pointerdown', stop);
      container.removeEventListener('pointerenter', stop);
      container.removeEventListener('touchstart', stop);
      container.removeEventListener('pointerleave', start);
    };
  }, [autoAdvanceMs, menus, scrollableDivRef]);

  return (
    <div className={clsx('menu-carousel relative', className)}>
      <div
        ref={scrollableDivRef}
        className={clsx(
          'w-full snap-x snap-mandatory overflow-x-auto whitespace-nowrap pb-2 sm:snap-proximity text-center no-scrollbar',
          singleItem && 'px-4'
        )}
      >
        <MenuRow menus={menus} singleItem={singleItem} renderItem={renderItem} />
      </div>
      {showArrows && <ScrollArrowButtons className="-mt-12" {...scrollArrowProps} />}
    </div>
  );
};

export default MenuCarousel; 
