export type InstagramSource = {
  provider: 'instagram';
  kind: 'profile' | 'post';
  sourceUrl: string;
  handle: string | null;
  shortcode: string | null;
};

const RESERVED = new Set([
  'p',
  'reel',
  'reels',
  'tv',
  'stories',
  'explore',
  'accounts',
  'direct',
  'about',
  'developer',
  'legal',
]);

export const normalizeInstagramSource = (value: string): InstagramSource => {
  const input = value.trim();
  if (!input || input.length > 2048) throw new Error('Enter an Instagram profile or post link.');
  const candidate = /^(?:https?:)?\/\//i.test(input)
    ? input
    : /^(?:www\.)?instagram\.com\//i.test(input)
      ? `https://${input}`
      : `https://www.instagram.com/${input.replace(/^@/, '')}`;
  const url = new URL(candidate);
  if (
    !['https:', 'http:'].includes(url.protocol) ||
    !['instagram.com', 'www.instagram.com'].includes(url.hostname.toLowerCase()) ||
    url.username ||
    url.password ||
    url.port
  ) {
    throw new Error('Use an instagram.com profile or post link.');
  }
  const parts = url.pathname.split('/').filter(Boolean);
  if (['p', 'reel', 'tv'].includes(parts[0]) && parts.length === 2 && /^[A-Za-z0-9_-]{3,64}$/.test(parts[1])) {
    return {
      provider: 'instagram',
      kind: 'post',
      handle: null,
      shortcode: parts[1],
      sourceUrl: `https://www.instagram.com/${parts[0]}/${parts[1]}/`,
    };
  }
  if (
    parts.length !== 1 ||
    RESERVED.has(parts[0].toLowerCase()) ||
    !/^[A-Za-z0-9_](?:[A-Za-z0-9_.]{0,28}[A-Za-z0-9_])?$/.test(parts[0]) ||
    parts[0].includes('..')
  ) {
    throw new Error('Enter a valid Instagram handle, profile URL, or post/reel URL.');
  }
  const handle = parts[0].toLowerCase();
  return {
    provider: 'instagram',
    kind: 'profile',
    handle,
    shortcode: null,
    sourceUrl: `https://www.instagram.com/${handle}/`,
  };
};
