import clsx from 'clsx';
import { useEffect, useState, type FC } from 'react';

export type MobileSection = { id: string; label: string };

type MobileSectionNavProps = {
  sections: MobileSection[];
  className?: string;
};

// Lightweight sticky, horizontally scrollable quick-jump for mobile only
export const MobileSectionNav: FC<MobileSectionNavProps> = ({ sections, className }) => {
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    const els = sections
      .map((s) => ({ id: s.id, el: document.getElementById(s.id) }))
      .filter((x): x is { id: string; el: Element } => !!x.el);

    if (els.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const topEntry = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (topEntry) setActiveId(topEntry.target.id);
      },
      {
        // trigger as a section nears the top; header is sticky
        rootMargin: `-64px 0px -60% 0px`,
        threshold: [0, 0.25, 0.5, 1],
      },
    );

    els.forEach(({ el }) => observer.observe(el));
    return () => observer.disconnect();
  }, [sections]);

  return (
    <nav
      aria-label="Quick section navigation"
      className={clsx(
        // mobile-only sticky bar just under the header
        'lg:hidden sticky top-[var(--mkt-header-height)] z-30 -mt-3 mb-2',
        'bg-white/80 backdrop-blur supports-[backdrop-filter]:bg-white/70',
        'border-b border-gray-200',
        className,
      )}
    >
      <div className="mx-auto max-w-screen-2xl px-4 sm:px-6 md:px-8 xl:px-[86px]">
        <div className="flex gap-2 overflow-x-auto py-2">
          {sections.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              className={clsx(
                'whitespace-nowrap px-3 py-1.5 rounded-full text-sm border',
                'transition-colors',
                activeId === s.id
                  ? 'bg-accent-600 text-white border-accent-600'
                  : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50',
              )}
            >
              {s.label}
            </a>
          ))}
        </div>
      </div>
    </nav>
  );
};

export default MobileSectionNav;

