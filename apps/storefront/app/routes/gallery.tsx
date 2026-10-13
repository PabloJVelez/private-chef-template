import { Container } from '@app/components/common/container';
import { getChefConfig } from '@libs/config/chef/chef-config';
import {
  fetchSocialGalleryPosts,
  type StoreSocialGalleryCategory,
  type StoreSocialGalleryPostDTO,
} from '@libs/util/server/data/social-gallery.server';
import clsx from 'clsx';
import { useState } from 'react';
import { Dialog, DialogPanel, DialogTitle } from '@headlessui/react';
import type { LoaderFunctionArgs, MetaFunction } from 'react-router';
import { Link, data, useLoaderData } from 'react-router';

const chefConfig = getChefConfig();

const categoryFilters: { label: string; value: StoreSocialGalleryCategory | 'all' }[] = [
  { label: 'All', value: 'all' },
  { label: 'Dishes', value: 'dishes' },
  { label: 'Private Dinners', value: 'private_dinners' },
  { label: 'Events', value: 'events' },
  { label: 'Behind the Scenes', value: 'behind_the_scenes' },
  { label: 'Press / Collabs', value: 'press_collabs' },
];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const requestedPage = Number(url.searchParams.get('page') || 1);
  const page = Number.isInteger(requestedPage) && requestedPage > 0 && requestedPage <= 4000 ? requestedPage : 1;
  const category = categoryFilters.find((item) => item.value === url.searchParams.get('category'))?.value || 'all';
  const response = await fetchSocialGalleryPosts(page, category);
  return data(
    {
      posts: response.social_gallery_posts,
      count: response.count,
      page,
      category,
      unavailable: !!response.unavailable,
    },
    { status: response.unavailable ? 503 : 200 },
  );
};

export const meta: MetaFunction<typeof loader> = () => [
  { title: `From the Kitchen | ${chefConfig.name}` },
  {
    name: 'description',
    content: `Recent dishes, events, and behind-the-scenes moments from ${chefConfig.name}.`,
  },
];

export default function GalleryRoute() {
  const { posts, count, page, category: activeCategory, unavailable } = useLoaderData<typeof loader>();
  const [selectedPost, setSelectedPost] = useState<StoreSocialGalleryPostDTO | null>(null);

  const featuredPost = posts.find((post) => post.is_featured || post.display_style === 'feature') ?? posts[0];
  const galleryPosts = posts.filter((post) => post.id !== featuredPost?.id);

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
          {unavailable && <p className="mt-6">The gallery is temporarily unavailable. Please try again shortly.</p>}
          {!unavailable && posts.length === 0 && (
            <p className="mt-6">
              No published moments here yet. Explore another category or plan your own experience below.
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
                <PostMedia
                  post={featuredPost}
                  className="h-full min-h-[360px] w-full object-cover transition duration-700 group-hover:scale-[1.03]"
                />
                <div className="absolute left-5 top-5 rounded-full bg-white/90 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-primary-900">
                  Featured
                </div>
              </button>
              <div className="flex flex-col justify-center p-8 md:p-12">
                <p className="text-sm font-semibold uppercase tracking-[0.24em] text-accent-50">
                  {categoryLabel(featuredPost.category)}
                </p>
                <h2 className="mt-4 text-4xl font-italiana leading-tight text-primary-900 md:text-6xl">
                  {featuredPost.title}
                </h2>
                {featuredPost.caption && (
                  <p className="mt-6 text-lg leading-8 text-primary-700">{featuredPost.caption}</p>
                )}
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
                <Link
                  key={filter.value}
                  to={`?category=${filter.value}`}
                  aria-current={activeCategory === filter.value ? 'page' : undefined}
                  className={clsx(
                    'whitespace-nowrap rounded-full border px-4 py-2 text-sm font-semibold transition',
                    activeCategory === filter.value
                      ? 'border-primary-900 bg-primary-900 text-white'
                      : 'border-primary-900/15 bg-white/70 text-primary-700 hover:border-primary-900/40',
                  )}
                >
                  {filter.label}
                </Link>
              ))}
            </div>
          </div>

          <div className="mt-8 grid auto-rows-[220px] grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {galleryPosts.map((post, index) => (
              <PostTile key={post.id} post={post} index={index} onSelect={setSelectedPost} />
            ))}
          </div>
        </section>

        {count > 24 && (
          <nav className="mt-8 flex items-center justify-between" aria-label="Gallery pages">
            {page > 1 ? (
              <Link to={`?category=${activeCategory}&page=${page - 1}`} className="underline">
                Previous
              </Link>
            ) : (
              <span />
            )}
            <span>
              Page {page} of {Math.ceil(count / 24)}
            </span>
            {page * 24 < count ? (
              <Link to={`?category=${activeCategory}&page=${page + 1}`} className="underline">
                Next
              </Link>
            ) : (
              <span />
            )}
          </nav>
        )}
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

      {selectedPost && <PostModal key={selectedPost.id} post={selectedPost} onClose={() => setSelectedPost(null)} />}
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
      className={clsx(
        'group relative overflow-hidden rounded-3xl bg-primary-900 text-left shadow-lg shadow-primary-900/5',
        spanClass,
      )}
      onClick={() => onSelect(post)}
    >
      <PostMedia post={post} className="h-full w-full object-cover transition duration-700 group-hover:scale-[1.04]" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
      <div className="absolute left-4 right-4 top-4 flex items-center justify-between gap-3">
        <span className="rounded-full bg-white/90 px-3 py-1 text-xs font-semibold text-primary-900">
          {categoryLabel(post.category)}
        </span>
        {post.media_type === 'video' && (
          <span className="rounded-full bg-black/70 px-3 py-1 text-xs font-semibold text-white">Play</span>
        )}
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
        <span className="max-w-xs text-sm font-semibold">{post.title}</span>
      </div>
    );
  }

  if (post.media_type === 'video' && !post.poster_url && !post.thumbnail_url) {
    return <div className={clsx('flex items-center justify-center text-white', className)}>Open video</div>;
  }

  return <img src={imageUrl} alt={post.alt_text || post.title} className={className} loading="lazy" />;
};

const PostModal = ({ post, onClose }: { post: StoreSocialGalleryPostDTO; onClose: () => void }) => {
  const [index, setIndex] = useState(0);
  const assets = post.media_assets?.length
    ? post.media_assets
    : post.media_url
      ? [
          {
            type: post.media_type === 'video' ? ('video' as const) : ('image' as const),
            url: post.media_url,
            poster_url: post.poster_url,
          },
        ]
      : [];
  const asset = assets[index];
  return (
    <Dialog open onClose={onClose} className="relative z-50">
      <div className="fixed inset-0 bg-black/70" aria-hidden="true" />
      <div className="fixed inset-0 overflow-y-auto p-4">
        <div className="flex min-h-full items-center justify-center">
          <DialogPanel className="w-full max-w-6xl rounded-3xl bg-white p-4 shadow-2xl md:p-6">
            <div className="mb-4 flex justify-end">
              <button type="button" autoFocus className="rounded-full border px-4 py-2 font-semibold" onClick={onClose}>
                Close
              </button>
            </div>
            <div className="grid gap-6 lg:grid-cols-2">
              <div>
                <div className="flex min-h-[240px] items-center justify-center rounded-xl bg-primary-900">
                  {asset?.type === 'video' ? (
                    <video
                      key={asset.url}
                      className="max-h-[65vh] w-full"
                      controls
                      playsInline
                      preload="none"
                      poster={asset.poster_url || undefined}
                    >
                      <source src={asset.url} />
                    </video>
                  ) : asset ? (
                    <img
                      className="max-h-[65vh] w-full object-contain"
                      src={asset.url}
                      alt={post.alt_text || `${post.title}, item ${index + 1}`}
                    />
                  ) : (
                    <p className="p-8 text-white">Media unavailable</p>
                  )}
                </div>
                {assets.length > 1 && (
                  <div className="mt-4 flex items-center justify-between" aria-label="Carousel controls">
                    <button
                      className="rounded-full border px-4 py-2 disabled:opacity-40"
                      disabled={index === 0}
                      onClick={() => setIndex(index - 1)}
                    >
                      Previous item
                    </button>
                    <span aria-live="polite">
                      {index + 1} / {assets.length}
                    </span>
                    <button
                      className="rounded-full border px-4 py-2 disabled:opacity-40"
                      disabled={index === assets.length - 1}
                      onClick={() => setIndex(index + 1)}
                    >
                      Next item
                    </button>
                  </div>
                )}
              </div>
              <div className="p-2 md:p-4">
                <p className="text-sm font-semibold uppercase tracking-widest">{categoryLabel(post.category)}</p>
                <DialogTitle className="mt-4 text-4xl font-italiana text-primary-900">{post.title}</DialogTitle>
                {post.caption && (
                  <p className="mt-5 whitespace-pre-line break-words leading-8 text-primary-700">{post.caption}</p>
                )}
                {post.linked_service_label && <p className="mt-5">Good fit for: {post.linked_service_label}</p>}
                <div className="mt-8 flex flex-wrap gap-3">
                  <Link
                    to={post.cta_url || '/request'}
                    onClick={onClose}
                    className="rounded-full bg-primary-900 px-5 py-3 font-semibold text-white"
                  >
                    {post.cta_label || 'Book this experience'}
                  </Link>
                  {post.source_url && (
                    <a
                      href={post.source_url}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-full border px-5 py-3"
                    >
                      View source
                    </a>
                  )}
                </div>
              </div>
            </div>
          </DialogPanel>
        </div>
      </div>
    </Dialog>
  );
};

const categoryLabel = (category: StoreSocialGalleryCategory) =>
  category
    .split('_')
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(' ')
    .replace('Collabs', 'Collabs');
