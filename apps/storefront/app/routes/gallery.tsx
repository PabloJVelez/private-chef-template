import { Container } from '@app/components/common/container';
import { getChefConfig } from '@libs/config/chef/chef-config';
import {
  fetchSocialGalleryPosts,
  type StoreSocialGalleryCategory,
  type StoreSocialGalleryPostDTO,
} from '@libs/util/server/data/social-gallery.server';
import clsx from 'clsx';
import { useMemo, useState } from 'react';
import type { LoaderFunctionArgs, MetaFunction } from 'react-router';
import { Link, data, useLoaderData } from 'react-router';

const chefConfig = getChefConfig();

const demoPosts: StoreSocialGalleryPostDTO[] = [
  {
    id: 'demo-feature',
    title: 'A plated dinner built around the season',
    caption:
      'A long-table menu with bright herbs, market vegetables, and a slow finish designed for a relaxed evening at home.',
    media_type: 'image',
    media_url: 'https://images.unsplash.com/photo-1555244162-803834f70033?auto=format&fit=crop&w=1400&q=85',
    thumbnail_url: null,
    poster_url: null,
    alt_text: 'Private chef plating a composed dinner course',
    category: 'private_dinners',
    display_style: 'feature',
    linked_service_label: 'Private dinner',
    cta_label: 'Book a private dinner',
    cta_url: '/request',
    is_active: true,
    is_featured: true,
    sort_order: 0,
    source_url: 'https://instagram.com',
    instagram_handle: 'chef',
    posted_at: new Date().toISOString(),
  },
  {
    id: 'demo-video',
    title: 'Behind the pass',
    caption: 'Short prep clips, final touches, and the little details that make dinner feel hosted instead of catered.',
    media_type: 'video',
    media_url: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
    thumbnail_url: 'https://images.unsplash.com/photo-1514986888952-8cd320577b68?auto=format&fit=crop&w=900&q=85',
    poster_url: 'https://images.unsplash.com/photo-1514986888952-8cd320577b68?auto=format&fit=crop&w=900&q=85',
    alt_text: 'Chef preparing ingredients in a kitchen',
    category: 'behind_the_scenes',
    display_style: 'large',
    linked_service_label: 'Chef experience',
    cta_label: 'Plan your event',
    cta_url: '/request',
    is_active: true,
    is_featured: false,
    sort_order: 1,
    source_url: 'https://instagram.com',
    instagram_handle: 'chef',
    posted_at: new Date().toISOString(),
  },
  {
    id: 'demo-dish',
    title: 'Charred citrus and herbs',
    caption: 'A bright starter that works beautifully before richer courses.',
    media_type: 'image',
    media_url: 'https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=900&q=85',
    category: 'dishes',
    display_style: 'normal',
    is_active: true,
    is_featured: false,
    sort_order: 2,
  },
  {
    id: 'demo-event',
    title: 'Family-style celebration',
    caption: 'Large-format service for birthdays, anniversaries, and small gatherings that still deserve a real menu.',
    media_type: 'image',
    media_url: 'https://images.unsplash.com/photo-1551218808-94e220e084d2?auto=format&fit=crop&w=1000&q=85',
    category: 'events',
    display_style: 'wide',
    is_active: true,
    is_featured: false,
    sort_order: 3,
  },
  {
    id: 'demo-collab',
    title: 'Brand dinner table',
    caption: 'A composed service style for tastings, product dinners, and culinary collaborations.',
    media_type: 'image',
    media_url: 'https://images.unsplash.com/photo-1556910103-1c02745aae4d?auto=format&fit=crop&w=900&q=85',
    category: 'press_collabs',
    display_style: 'normal',
    is_active: true,
    is_featured: false,
    sort_order: 4,
  },
];

const categoryFilters: { label: string; value: StoreSocialGalleryCategory | 'all' }[] = [
  { label: 'All', value: 'all' },
  { label: 'Dishes', value: 'dishes' },
  { label: 'Private Dinners', value: 'private_dinners' },
  { label: 'Events', value: 'events' },
  { label: 'Behind the Scenes', value: 'behind_the_scenes' },
  { label: 'Press / Collabs', value: 'press_collabs' },
];

export const loader = async (_args: LoaderFunctionArgs) => {
  const response = await fetchSocialGalleryPosts();
  const posts = response.social_gallery_posts.length > 0 ? response.social_gallery_posts : demoPosts;

  return data({
    posts: posts.map((post) => ({
      ...post,
      posted_at: post.posted_at ?? null,
    })),
    isDemo: response.social_gallery_posts.length === 0,
  });
};

export const meta: MetaFunction<typeof loader> = () => [
  { title: `From the Kitchen | ${chefConfig.name}` },
  {
    name: 'description',
    content: `Recent dishes, events, and behind-the-scenes moments from ${chefConfig.name}.`,
  },
];

export default function GalleryRoute() {
  const { posts, isDemo } = useLoaderData<typeof loader>();
  const [activeCategory, setActiveCategory] = useState<StoreSocialGalleryCategory | 'all'>('all');
  const [selectedPost, setSelectedPost] = useState<StoreSocialGalleryPostDTO | null>(null);

  const featuredPost = posts.find((post) => post.is_featured || post.display_style === 'feature') ?? posts[0];
  const galleryPosts = useMemo(
    () =>
      posts.filter((post) => post.id !== featuredPost?.id).filter((post) => activeCategory === 'all' || post.category === activeCategory),
    [activeCategory, featuredPost?.id, posts],
  );

  return (
    <div className="bg-highlight-50 text-primary-900">
      <Container className="pb-16 pt-12 md:pb-24 md:pt-20">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.28em] text-accent-50">From the kitchen</p>
          <h1 className="mt-4 text-5xl font-italiana leading-tight text-primary-900 md:text-7xl">
            Recent dishes, dinners, and behind-the-scenes moments
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg leading-8 text-primary-700">
            A living portfolio of the food, gatherings, and details that shape each private chef experience.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link
              to="/request"
              className="rounded-full bg-primary-900 px-6 py-3 text-sm font-semibold text-white transition hover:bg-primary-700"
            >
              Book a Private Dinner
            </Link>
            <a
              href="#gallery-feed"
              className="rounded-full border border-primary-900/20 px-6 py-3 text-sm font-semibold text-primary-900 transition hover:border-primary-900"
            >
              View Gallery
            </a>
          </div>
          {isDemo && (
            <p className="mt-4 text-xs text-primary-500">
              Showing template sample posts until curated gallery content is added in admin.
            </p>
          )}
        </div>

        {featuredPost && (
          <section className="mt-14 overflow-hidden rounded-[2rem] bg-white shadow-xl shadow-primary-900/5 ring-1 ring-primary-900/10">
            <div className="grid min-h-[520px] grid-cols-1 lg:grid-cols-[1.15fr_0.85fr]">
              <button
                type="button"
                className="group relative min-h-[360px] overflow-hidden text-left lg:min-h-full"
                onClick={() => setSelectedPost(featuredPost)}
              >
                <PostMedia post={featuredPost} className="h-full min-h-[360px] w-full object-cover transition duration-700 group-hover:scale-[1.03]" />
                <div className="absolute left-5 top-5 rounded-full bg-white/90 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-primary-900">
                  Featured
                </div>
              </button>
              <div className="flex flex-col justify-center p-8 md:p-12">
                <p className="text-sm font-semibold uppercase tracking-[0.24em] text-accent-50">
                  {categoryLabel(featuredPost.category)}
                </p>
                <h2 className="mt-4 text-4xl font-italiana leading-tight text-primary-900 md:text-6xl">{featuredPost.title}</h2>
                {featuredPost.caption && <p className="mt-6 text-lg leading-8 text-primary-700">{featuredPost.caption}</p>}
                <div className="mt-8 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    className="rounded-full bg-accent-50 px-5 py-3 text-sm font-semibold text-white transition hover:bg-primary-800"
                    onClick={() => setSelectedPost(featuredPost)}
                  >
                    Open story
                  </button>
                  <Link
                    to={featuredPost.cta_url || '/request'}
                    className="rounded-full border border-primary-900/20 px-5 py-3 text-sm font-semibold text-primary-900 transition hover:border-primary-900"
                  >
                    {featuredPost.cta_label || 'Book this experience'}
                  </Link>
                </div>
              </div>
            </div>
          </section>
        )}

        <section id="gallery-feed" className="mt-16">
          <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-accent-50">Social portfolio</p>
              <h2 className="mt-3 text-4xl font-italiana text-primary-900 md:text-5xl">A better home for the feed</h2>
            </div>
            <div className="flex gap-2 overflow-x-auto pb-2 md:flex-wrap md:justify-end md:overflow-visible md:pb-0">
              {categoryFilters.map((filter) => (
                <button
                  key={filter.value}
                  type="button"
                  className={clsx(
                    'whitespace-nowrap rounded-full border px-4 py-2 text-sm font-semibold transition',
                    activeCategory === filter.value
                      ? 'border-primary-900 bg-primary-900 text-white'
                      : 'border-primary-900/15 bg-white/70 text-primary-700 hover:border-primary-900/40',
                  )}
                  onClick={() => setActiveCategory(filter.value)}
                >
                  {filter.label}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-8 grid auto-rows-[220px] grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {galleryPosts.map((post, index) => (
              <PostTile key={post.id} post={post} index={index} onSelect={setSelectedPost} />
            ))}
          </div>
        </section>

        <section className="mt-16 rounded-[2rem] bg-primary-900 p-8 text-center text-white md:p-12">
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-accent-700">Bring this to your table</p>
          <h2 className="mx-auto mt-4 max-w-3xl text-4xl font-italiana leading-tight md:text-6xl">
            Like what you see? Build a private chef experience around it.
          </h2>
          <Link
            to="/request"
            className="mt-8 inline-flex rounded-full bg-white px-6 py-3 text-sm font-semibold text-primary-900 transition hover:bg-highlight-100"
          >
            Start an Event Request
          </Link>
        </section>
      </Container>

      {selectedPost && <PostModal post={selectedPost} onClose={() => setSelectedPost(null)} />}
    </div>
  );
}

const PostTile = ({
  post,
  index,
  onSelect,
}: {
  post: StoreSocialGalleryPostDTO;
  index: number;
  onSelect: (post: StoreSocialGalleryPostDTO) => void;
}) => {
  const spanClass =
    post.display_style === 'large'
      ? 'sm:col-span-2 sm:row-span-2'
      : post.display_style === 'wide'
        ? 'sm:col-span-2'
        : index % 7 === 2
          ? 'lg:row-span-2'
          : '';

  return (
    <button
      type="button"
      className={clsx('group relative overflow-hidden rounded-3xl bg-primary-900 text-left shadow-lg shadow-primary-900/5', spanClass)}
      onClick={() => onSelect(post)}
    >
      <PostMedia post={post} className="h-full w-full object-cover transition duration-700 group-hover:scale-[1.04]" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
      <div className="absolute left-4 right-4 top-4 flex items-center justify-between gap-3">
        <span className="rounded-full bg-white/90 px-3 py-1 text-xs font-semibold text-primary-900">{categoryLabel(post.category)}</span>
        {post.media_type === 'video' && <span className="rounded-full bg-black/70 px-3 py-1 text-xs font-semibold text-white">Play</span>}
      </div>
      <div className="absolute bottom-0 left-0 right-0 p-5 text-white">
        <h3 className="text-2xl font-italiana leading-tight">{post.title}</h3>
        {post.caption && <p className="mt-2 line-clamp-2 text-sm leading-6 text-white/85">{post.caption}</p>}
      </div>
    </button>
  );
};

const PostMedia = ({ post, className }: { post: StoreSocialGalleryPostDTO; className?: string }) => {
  const imageUrl = post.thumbnail_url || post.poster_url || post.media_url;

  if (!imageUrl) {
    return (
      <div className={clsx('flex items-center justify-center bg-primary-900 p-6 text-center text-white', className)}>
        <span className="max-w-xs text-sm font-semibold">{post.source_url ? 'Social source added. Add media in admin when preview is unavailable.' : post.title}</span>
      </div>
    );
  }

  if (post.media_type === 'video' && post.media_url) {
    return (
      <video
        className={className}
        poster={post.poster_url || post.thumbnail_url || undefined}
        muted
        loop
        playsInline
        preload="metadata"
        autoPlay
      >
        <source src={post.media_url} />
      </video>
    );
  }

  return <img src={imageUrl} alt={post.alt_text || post.title} className={className} loading="lazy" />;
};

const PostModal = ({ post, onClose }: { post: StoreSocialGalleryPostDTO; onClose: () => void }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true">
    <div className="max-h-[92vh] w-full max-w-6xl overflow-hidden rounded-3xl bg-white shadow-2xl">
      <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="min-h-[320px] bg-primary-900 lg:min-h-[720px]">
          {post.media_type === 'video' && post.media_url ? (
            <video className="h-full w-full object-contain" controls poster={post.poster_url || post.thumbnail_url || undefined}>
              <source src={post.media_url} />
            </video>
          ) : !post.media_url ? (
            <div className="flex h-full w-full items-center justify-center bg-primary-900 p-8 text-center text-white">
              Social source added. Add media in admin when preview is unavailable.
            </div>
          ) : (
            <img src={post.media_url} alt={post.alt_text || post.title} className="h-full w-full object-cover" />
          )}
        </div>
        <div className="flex flex-col p-6 md:p-8">
          <button type="button" className="ml-auto rounded-full border px-4 py-2 text-sm font-semibold" onClick={onClose}>
            Close
          </button>
          <p className="mt-8 text-sm font-semibold uppercase tracking-[0.24em] text-accent-50">{categoryLabel(post.category)}</p>
          <h2 className="mt-4 text-4xl font-italiana leading-tight text-primary-900 md:text-5xl">{post.title}</h2>
          {post.caption && <p className="mt-5 text-base leading-8 text-primary-700">{post.caption}</p>}
          {post.linked_service_label && (
            <p className="mt-5 rounded-2xl bg-highlight-100 px-4 py-3 text-sm font-semibold text-primary-800">
              Good fit for: {post.linked_service_label}
            </p>
          )}
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              to={post.cta_url || '/request'}
              className="rounded-full bg-primary-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-primary-700"
            >
              {post.cta_label || 'Book this experience'}
            </Link>
            {post.source_url && (
              <a
                href={post.source_url}
                target="_blank"
                rel="noreferrer"
                className="rounded-full border border-primary-900/20 px-5 py-3 text-sm font-semibold text-primary-900 transition hover:border-primary-900"
              >
                View source
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  </div>
);

const categoryLabel = (category: StoreSocialGalleryCategory) =>
  category
    .split('_')
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(' ')
    .replace('Collabs', 'Collabs');
