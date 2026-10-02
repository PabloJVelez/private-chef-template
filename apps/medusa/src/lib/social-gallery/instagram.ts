export type InstagramSourceKind = 'profile' | 'post';

export type InstagramSource = {
  provider: 'instagram';
  kind: InstagramSourceKind;
  sourceUrl: string;
  handle: string | null;
  shortcode: string | null;
};

export type SocialMetadata = {
  title?: string;
  caption?: string;
  image?: string;
  video?: string;
};

const INSTAGRAM_RESERVED_PATHS = new Set(['p', 'reel', 'tv', 'stories']);

export const decodeHtml = (value?: string | null) =>
  value
    ?.replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim() || '';

export const getMetaContent = (html: string, property: string) => {
  const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    new RegExp(`<meta[^>]+property=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`, 'i'),
    new RegExp(`<meta[^>]+name=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${escaped}["'][^>]*>`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${escaped}["'][^>]*>`, 'i'),
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return decodeHtml(match[1]);
  }

  return '';
};

export const normalizeInstagramSource = (value: string): InstagramSource => {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error('Instagram handle or URL is required.');
  }

  const withoutAt = trimmed.replace(/^@/, '');
  const asUrl = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://www.instagram.com/${withoutAt.replace(/^instagram\.com\//, '')}`;

  const url = new URL(asUrl);
  if (!url.hostname.includes('instagram.com')) {
    throw new Error('Only Instagram imports are supported for this gallery.');
  }

  const pathParts = url.pathname.split('/').filter(Boolean);
  const firstPart = pathParts[0] || withoutAt;
  const isPost = INSTAGRAM_RESERVED_PATHS.has(firstPart);
  const shortcode = isPost ? pathParts[1] ?? null : null;
  const handle = isPost ? null : firstPart.replace('@', '') || null;

  return {
    provider: 'instagram',
    kind: isPost ? 'post' : 'profile',
    sourceUrl: isPost
      ? `https://www.instagram.com/${firstPart}/${shortcode || ''}`.replace(/\/$/, '')
      : `https://www.instagram.com/${handle}/`,
    handle,
    shortcode,
  };
};

export const titleFromInstagramSource = (source: InstagramSource) => {
  if (source.kind === 'profile' && source.handle) return `Instagram @${source.handle}`;
  if (source.kind === 'post') return 'Instagram post';
  return 'Instagram import';
};

export const scrapeSocialMetadata = async (sourceUrl?: string | null): Promise<SocialMetadata> => {
  if (!sourceUrl) return {};

  try {
    const response = await fetch(sourceUrl, {
      headers: {
        'user-agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      redirect: 'follow',
    });

    if (!response.ok) return {};

    const html = await response.text();
    const image = getMetaContent(html, 'og:image') || getMetaContent(html, 'twitter:image');
    const video = getMetaContent(html, 'og:video') || getMetaContent(html, 'og:video:url');
    const description = getMetaContent(html, 'og:description') || getMetaContent(html, 'description');
    const title = getMetaContent(html, 'og:title') || getMetaContent(html, 'twitter:title');

    return {
      title,
      caption: description,
      image,
      video,
    };
  } catch (error) {
    console.warn('Social gallery metadata scrape failed', error);
    return {};
  }
};
