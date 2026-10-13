import { Container } from "@app/components/common/container";
import { getChefConfig } from "@libs/config/chef/chef-config";
import {
  fetchSocialGalleryPosts,
  type StoreSocialGalleryCategory,
  type StoreSocialGalleryPostDTO,
} from "@libs/util/server/data/social-gallery.server";
import clsx from "clsx";
import { useEffect, useRef, useState } from "react";
import { Dialog, DialogPanel, DialogTitle } from "@headlessui/react";
import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { Link, data, useLoaderData } from "react-router";

const chefConfig = getChefConfig();

const categoryFilters: {
  label: string;
  value: StoreSocialGalleryCategory | "all";
}[] = [
  { label: "All", value: "all" },
  { label: "Dishes", value: "dishes" },
  { label: "Private Dinners", value: "private_dinners" },
  { label: "Events", value: "events" },
  { label: "Behind the Scenes", value: "behind_the_scenes" },
  { label: "Press / Collabs", value: "press_collabs" },
];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const requestedPage = Number(url.searchParams.get("page") || 1);
  const page =
    Number.isInteger(requestedPage) &&
    requestedPage > 0 &&
    requestedPage <= 4000
      ? requestedPage
      : 1;
  const category =
    categoryFilters.find(
      (item) => item.value === url.searchParams.get("category"),
    )?.value || "all";
  const response = await fetchSocialGalleryPosts(page, category);
  return data(
    {
      posts: response.social_gallery_posts,
      count: response.count,
      categories: response.categories || [
        ...new Set(response.social_gallery_posts.map((post) => post.category)),
      ],
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
    name: "description",
    content: `Recent dishes, events, and behind-the-scenes moments from ${chefConfig.name}.`,
  },
];

export default function GalleryRoute() {
  const {
    posts,
    count,
    page,
    categories,
    category: activeCategory,
    unavailable,
  } = useLoaderData<typeof loader>();
  const [selectedPost, setSelectedPost] =
    useState<StoreSocialGalleryPostDTO | null>(null);

  const filters = categoryFilters.filter((filter) =>
    filter.value === "all"
      ? categories.length > 1
      : categories.includes(filter.value),
  );
  const selectedCategory =
    activeCategory === "all" && categories.length === 1
      ? categories[0]
      : activeCategory;

  const spotlightIndex = posts.findIndex(
    (post) => post.is_featured || post.display_style === "feature",
  );

  return (
    <div className="bg-highlight-50 text-primary-900">
      <Container className="max-w-6xl pb-12 pt-8 md:pb-16 md:pt-12">
        <header className="mb-8 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-accent-50">
              A glimpse inside
            </p>
            <h1 className="mt-2 text-4xl font-italiana leading-tight md:text-5xl">
              From the kitchen
            </h1>
          </div>
          <p className="max-w-sm text-sm leading-6 text-primary-700">
            A few favorite plates, shared tables, and moments along the way.
            Take a look around.
          </p>
        </header>

        <section aria-label="Gallery">
          <nav
            aria-label="Gallery categories"
            className="mb-5 flex gap-2 overflow-x-auto pb-2"
          >
            {filters.map((filter) => (
              <Link
                key={filter.value}
                to={`?category=${filter.value}`}
                aria-current={
                  selectedCategory === filter.value ? "page" : undefined
                }
                className={clsx(
                  "whitespace-nowrap rounded-full border px-4 py-2 text-xs font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2",
                  selectedCategory === filter.value
                    ? "border-primary-900 bg-primary-900 text-white"
                    : "border-primary-900/10 text-primary-700 hover:border-primary-900/40",
                )}
              >
                {filter.label}
              </Link>
            ))}
          </nav>
          {unavailable ? (
            <p
              role="status"
              className="rounded-2xl border border-primary-900/10 p-10 text-center"
            >
              The gallery is temporarily unavailable. Please try again shortly.
            </p>
          ) : posts.length === 0 ? (
            <p className="rounded-2xl border border-primary-900/10 p-10 text-center">
              No moments here just yet. Check back soon or explore another
              category.
            </p>
          ) : (
            <GalleryPlayback
              key={`${activeCategory}:${page}`}
              suspended={!!selectedPost}
            >
              <div className="grid auto-rows-[150px] grid-cols-2 gap-3 sm:auto-rows-[200px] lg:auto-rows-[220px] lg:grid-cols-3 lg:gap-4">
                {posts.map((post, index) => (
                  <PostTile
                    key={post.id}
                    post={post}
                    tall={
                      posts.length >= 3 &&
                      (index === (spotlightIndex >= 0 ? spotlightIndex : 1) ||
                        (index % 9 === 7 && index < posts.length - 2))
                    }
                    onSelect={setSelectedPost}
                  />
                ))}
              </div>
            </GalleryPlayback>
          )}
        </section>

        {count > 24 && (
          <nav
            className="mt-8 flex items-center justify-between"
            aria-label="Gallery pages"
          >
            {page > 1 ? (
              <Link
                to={`?category=${activeCategory}&page=${page - 1}`}
                className="underline"
              >
                Previous
              </Link>
            ) : (
              <span />
            )}
            <span>
              Page {page} of {Math.ceil(count / 24)}
            </span>
            {page * 24 < count ? (
              <Link
                to={`?category=${activeCategory}&page=${page + 1}`}
                className="underline"
              >
                Next
              </Link>
            ) : (
              <span />
            )}
          </nav>
        )}
        <footer className="mt-10 flex flex-col items-start gap-3 border-t border-primary-900/10 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-lg font-italiana">
            Good food. Great company. Your table next?
          </p>
          <Link
            to="/request"
            className="text-sm font-semibold underline underline-offset-4 hover:text-accent-50"
          >
            Let’s plan a gathering <span aria-hidden="true">↗</span>
          </Link>
        </footer>
      </Container>

      {selectedPost && (
        <PostModal
          key={selectedPost.id}
          post={selectedPost}
          onClose={() => setSelectedPost(null)}
        />
      )}
    </div>
  );
}

// Keep playback local to this page and rotate only through visible tiles.
const GalleryPlayback = ({
  children,
  suspended,
}: {
  children: React.ReactNode;
  suspended: boolean;
}) => {
  const root = useRef<HTMLDivElement>(null);
  const [paused, setPaused] = useState(false);
  const [hasVideos, setHasVideos] = useState(false);
  useEffect(() => {
    const videos = Array.from(
      root.current?.querySelectorAll<HTMLVideoElement>(
        "[data-gallery-video]",
      ) || [],
    );
    setHasVideos(videos.length > 0);
    const visible = new Set<HTMLVideoElement>();
    const failed = new Set<HTMLVideoElement>();
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let current: HTMLVideoElement | undefined;
    let disposed = false;
    const stop = () => {
      videos.forEach((video) => video.pause());
      current = undefined;
    };
    const playNext = (after?: HTMLVideoElement) => {
      if (disposed) return;
      if (paused || suspended || document.hidden || motion.matches) {
        stop();
        return;
      }
      const start = after ? videos.indexOf(after) + 1 : 0;
      const ordered = [...videos.slice(start), ...videos.slice(0, start)];
      const next = ordered.find(
        (video) => visible.has(video) && !failed.has(video),
      );
      stop();
      if (!next) return;
      current = next;
      next.muted = true;
      if (after || next.ended) next.currentTime = 0;
      void next.play().catch(() => {
        if (disposed || current !== next) return;
        failed.add(next);
        playNext(next);
      });
    };
    const ended = (event: Event) =>
      playNext(event.currentTarget as HTMLVideoElement);
    const error = (event: Event) => {
      const video = event.currentTarget as HTMLVideoElement;
      failed.add(video);
      if (current === video) playNext(video);
    };
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const video = entry.target as HTMLVideoElement;
          if (entry.isIntersecting && entry.intersectionRatio >= 0.25)
            visible.add(video);
          else visible.delete(video);
        });
        if (!current || !visible.has(current)) playNext(current);
      },
      { threshold: [0, 0.25] },
    );
    videos.forEach((video) => {
      observer.observe(video);
      video.addEventListener("ended", ended);
      video.addEventListener("error", error);
    });
    const refresh = () => playNext();
    document.addEventListener("visibilitychange", refresh);
    motion.addEventListener("change", refresh);
    return () => {
      disposed = true;
      observer.disconnect();
      stop();
      videos.forEach((video) => {
        video.removeEventListener("ended", ended);
        video.removeEventListener("error", error);
      });
      document.removeEventListener("visibilitychange", refresh);
      motion.removeEventListener("change", refresh);
    };
  }, [paused, suspended]);
  return (
    <div ref={root}>
      {hasVideos && (
        <button
          type="button"
          className="mb-3 text-xs underline underline-offset-4 motion-reduce:hidden"
          aria-pressed={paused}
          onClick={() => setPaused(!paused)}
        >
          {paused ? "Play gallery videos" : "Pause gallery videos"}
        </button>
      )}
      {children}
    </div>
  );
};

// Imported titles often contain the entire Instagram caption. Keep the original
// caption intact, but never promote hashtags or a paragraph into a headline.
const displayTitle = (post: StoreSocialGalleryPostDTO) => {
  const title = post.title
    .replace(/[#@][^\s]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return title
    ? title.length > 80
      ? `${title.slice(0, 77).trimEnd()}…`
      : title
    : categoryLabel(post.category);
};

const PostTile = ({
  post,
  tall,
  onSelect,
}: {
  post: StoreSocialGalleryPostDTO;
  tall: boolean;
  onSelect: (post: StoreSocialGalleryPostDTO) => void;
}) => (
  <button
    type="button"
    aria-label={`Open ${post.media_type === "video" ? "video" : "photo"}: ${displayTitle(post)}`}
    className={clsx(
      "group relative min-w-0 overflow-hidden rounded-2xl bg-primary-900 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary-900",
      tall && "row-span-2",
    )}
    onClick={() => onSelect(post)}
  >
    <PostMedia
      post={post}
      className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 motion-safe:group-hover:scale-[1.03] motion-reduce:transition-none"
    />
    <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/70 to-transparent" />
    {post.media_type !== "image" && (
      <span className="absolute right-3 top-3 rounded-full bg-black/60 px-2.5 py-1 text-xs font-medium text-white">
        {post.media_type === "video"
          ? "▶ Video"
          : `▧ ${post.media_assets?.length || "Photos"}`}
      </span>
    )}
    <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 p-3 text-white sm:p-4">
      <span className="text-xs font-medium">
        {categoryLabel(post.category)}
      </span>
      <span
        aria-hidden="true"
        className="text-lg transition-transform motion-safe:group-hover:-translate-y-0.5"
      >
        ↗
      </span>
    </div>
  </button>
);

const PostMedia = ({
  post,
  className,
}: {
  post: StoreSocialGalleryPostDTO;
  className?: string;
}) => {
  const imageUrl = post.thumbnail_url || post.poster_url || post.media_url;

  const video =
    post.media_type === "video"
      ? {
          url:
            post.media_url ||
            post.media_assets?.find((asset) => asset.type === "video")?.url,
          poster_url: imageUrl,
        }
      : post.media_assets?.find((asset) => asset.type === "video");
  if (video?.url) {
    return (
      <video
        data-gallery-video
        muted
        playsInline
        preload="none"
        poster={video.poster_url || imageUrl || undefined}
        src={video.url}
        className={className}
        aria-hidden="true"
      />
    );
  }

  if (!imageUrl) {
    return (
      <div
        className={clsx(
          "flex items-center justify-center bg-primary-900 p-6 text-center text-white",
          className,
        )}
      >
        <span className="max-w-xs text-sm font-semibold">{post.title}</span>
      </div>
    );
  }

  if (post.media_type === "video" && !post.poster_url && !post.thumbnail_url) {
    return (
      <div
        className={clsx(
          "flex items-center justify-center text-white",
          className,
        )}
      >
        Open video
      </div>
    );
  }

  return (
    <img
      src={imageUrl}
      alt={post.alt_text || post.title}
      className={className}
      loading="lazy"
    />
  );
};

const PostModal = ({
  post,
  onClose,
}: {
  post: StoreSocialGalleryPostDTO;
  onClose: () => void;
}) => {
  const [index, setIndex] = useState(0);
  const assets = post.media_assets?.length
    ? post.media_assets
    : post.media_url
      ? [
          {
            type:
              post.media_type === "video"
                ? ("video" as const)
                : ("image" as const),
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
          <DialogPanel className="w-full max-w-4xl rounded-3xl bg-white p-4 shadow-2xl md:p-6">
            <div className="mb-4 flex justify-end">
              <button
                type="button"
                autoFocus
                className="rounded-full border px-4 py-2 font-semibold"
                onClick={onClose}
              >
                Close
              </button>
            </div>
            <div className="grid gap-6 lg:grid-cols-2">
              <div>
                <div className="flex min-h-[240px] items-center justify-center rounded-xl bg-primary-900">
                  {asset?.type === "video" ? (
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
                  <div
                    className="mt-4 flex items-center justify-between"
                    aria-label="Carousel controls"
                  >
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
                <p className="text-sm font-semibold uppercase tracking-widest">
                  {categoryLabel(post.category)}
                </p>
                <DialogTitle className="mt-3 break-words text-2xl font-italiana text-primary-900 sm:text-3xl">
                  {displayTitle(post)}
                </DialogTitle>
                {post.caption && (
                  <p className="mt-4 whitespace-pre-line break-words text-sm leading-7 text-primary-700">
                    {post.caption}
                  </p>
                )}
                <div className="mt-6 flex flex-wrap gap-3">
                  {post.source_url && (
                    <a
                      href={post.source_url}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-full border px-5 py-3"
                    >
                      View original post ↗
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
    .split("_")
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ")
    .replace("Collabs", "Collabs");
