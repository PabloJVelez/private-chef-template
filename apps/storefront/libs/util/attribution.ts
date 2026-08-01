export type MarketingAttributionTouch = {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
  gclid?: string;
  fbclid?: string;
  landing_page: string;
  referrer?: string;
  seen_at: string;
};

export type MarketingAttributionPayload = {
  first_touch?: MarketingAttributionTouch;
  last_touch?: MarketingAttributionTouch;
};

export const MARKETING_ATTRIBUTION_STORAGE_KEY = 'marketing_attribution';

const TRACKED_PARAM_KEYS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'utm_term',
  'gclid',
  'fbclid',
] as const;

const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 180;

const truncate = (value: string) => value.trim().slice(0, 500);

function readCookie(name: string, doc: Document): string | undefined {
  const match = doc.cookie
    .split('; ')
    .find((part) => part.startsWith(`${encodeURIComponent(name)}=`));

  if (!match) return undefined;

  return decodeURIComponent(match.split('=').slice(1).join('='));
}

function writeCookie(name: string, value: string, doc: Document) {
  doc.cookie = `${encodeURIComponent(name)}=${encodeURIComponent(value)}; Max-Age=${COOKIE_MAX_AGE_SECONDS}; Path=/; SameSite=Lax`;
}

function parseStoredAttribution(value?: string | null): MarketingAttributionPayload | undefined {
  if (!value) return undefined;

  try {
    const parsed = JSON.parse(value) as MarketingAttributionPayload;
    if (!parsed || typeof parsed !== 'object') return undefined;
    return parsed;
  } catch {
    return undefined;
  }
}

function readStoredAttribution(win: Window): MarketingAttributionPayload | undefined {
  const localValue = win.localStorage.getItem(MARKETING_ATTRIBUTION_STORAGE_KEY);
  const local = parseStoredAttribution(localValue);
  if (local) return local;

  return parseStoredAttribution(readCookie(MARKETING_ATTRIBUTION_STORAGE_KEY, win.document));
}

function writeStoredAttribution(payload: MarketingAttributionPayload, win: Window) {
  const serialized = JSON.stringify(payload);
  win.localStorage.setItem(MARKETING_ATTRIBUTION_STORAGE_KEY, serialized);
  writeCookie(MARKETING_ATTRIBUTION_STORAGE_KEY, serialized, win.document);
}

function externalReferrer(referrer: string | undefined, currentUrl: URL): string | undefined {
  if (!referrer) return undefined;

  try {
    const referrerUrl = new URL(referrer);
    if (referrerUrl.hostname === currentUrl.hostname) return undefined;
  } catch {
    return truncate(referrer);
  }

  return truncate(referrer);
}

function buildTouch(win: Window): MarketingAttributionTouch {
  const url = new URL(win.location.href);
  const tracked = TRACKED_PARAM_KEYS.reduce<Partial<MarketingAttributionTouch>>((acc, key) => {
    const value = url.searchParams.get(key);
    if (value) {
      acc[key] = truncate(value);
    }
    return acc;
  }, {});

  return {
    ...tracked,
    landing_page: truncate(`${url.origin}${url.pathname}${url.search}`),
    referrer: externalReferrer(win.document.referrer, url),
    seen_at: new Date().toISOString(),
  };
}

function hasAttributionSignal(touch: MarketingAttributionTouch) {
  return TRACKED_PARAM_KEYS.some((key) => Boolean(touch[key])) || Boolean(touch.referrer);
}

export function readMarketingAttribution(win: Window = window): MarketingAttributionPayload | undefined {
  if (typeof win === 'undefined') return undefined;
  return readStoredAttribution(win);
}

export function captureMarketingAttribution(win: Window = window): MarketingAttributionPayload | undefined {
  if (typeof win === 'undefined') return undefined;

  const existing = readStoredAttribution(win) ?? {};
  const touch = buildTouch(win);
  const shouldUpdateLastTouch = !existing.last_touch || hasAttributionSignal(touch);

  const next: MarketingAttributionPayload = {
    first_touch: existing.first_touch ?? touch,
    last_touch: shouldUpdateLastTouch ? touch : existing.last_touch,
  };

  writeStoredAttribution(next, win);
  return next;
}
