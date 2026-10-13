import { z } from 'zod';
import { ImportError, importedPostSchema, type ImportedPost } from './contracts';
import { normalizeInstagramSource } from './instagram';

const API = 'https://api.apify.com/v2';
const runSchema = z.object({
  data: z.object({
    id: z.string().regex(/^[A-Za-z0-9]+$/),
    status: z.string(),
    defaultDatasetId: z
      .string()
      .regex(/^[A-Za-z0-9]+$/)
      .optional(),
  }),
});

export const apifyConfig = () => {
  const token = process.env.APIFY_API_TOKEN;
  if (!token)
    throw new ImportError(
      'setup_required',
      'Instagram import is not configured yet. Ask your site administrator to connect Apify.',
    );
  const limit = Number(process.env.SOCIAL_GALLERY_IMPORT_LIMIT || 12);
  const maxCharge = Number(process.env.SOCIAL_GALLERY_APIFY_MAX_CHARGE_USD || 0.1);
  const actor = process.env.SOCIAL_GALLERY_APIFY_ACTOR || 'apify~instagram-scraper';
  if (
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 24 ||
    !Number.isFinite(maxCharge) ||
    maxCharge < 0.01 ||
    maxCharge > 1 ||
    !/^[\w-]+(?:~[\w-]+)?$/.test(actor)
  ) {
    throw new ImportError('invalid_config', 'Invalid Instagram importer limits or actor configuration.');
  }
  return { token, limit, maxCharge, actor };
};

async function request(path: string, init: RequestInit = {}, signal?: AbortSignal): Promise<unknown> {
  const { token } = apifyConfig();
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) abort();
  signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(abort, 20000);
  try {
    const response = await fetch(`${API}${path}`, {
      ...init,
      redirect: 'error',
      signal: controller.signal,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new ImportError(
        [400, 401, 403, 404, 422].includes(response.status) ? 'provider_rejected' : 'provider_request',
        `Apify returned HTTP ${response.status}. Check the account connection, usage limit, and run in Apify Console.`,
        response.status === 429 || response.status >= 500,
      );
    }
    // Bound JSON responses as well as media. Never include provider bodies/tokens in errors.
    const reader = response.body?.getReader();
    if (!reader) throw new ImportError('provider_response', 'Apify returned an empty response.');
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 8 * 1024 * 1024) {
        await reader.cancel();
        throw new ImportError('provider_response', 'Apify returned too much data. Reduce the import limit.');
      }
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch (error) {
    if (error instanceof ImportError) throw error;
    throw new ImportError(
      'provider_request',
      'Apify could not be reached or returned an invalid response. Try again later.',
      true,
    );
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}

export async function startApifyRun(source: string, signal?: AbortSignal) {
  const config = apifyConfig();
  const canonical = normalizeInstagramSource(source);
  const params = new URLSearchParams({
    timeout: '180',
    restartOnError: 'false',
    maxTotalChargeUsd: String(config.maxCharge),
    maxItems: String(config.limit),
  });
  // Deliberately no automatic retry: a lost POST response could still have started a billed run.
  try {
    const result = await request(
      `/actors/${config.actor}/runs?${params}`,
      {
        method: 'POST',
        body: JSON.stringify({
          directUrls: [canonical.sourceUrl],
          resultsType: 'posts',
          resultsLimit: canonical.kind === 'post' ? 1 : config.limit,
          addParentData: false,
        }),
      },
      signal,
    );
    return runSchema.parse(result).data;
  } catch (error) {
    if (error instanceof ImportError && error.code === 'provider_rejected') throw error;
    throw new ImportError(
      'provider_start_uncertain',
      'Apify run start could not be confirmed. Check Apify Console before starting another import to avoid duplicate charges.',
    );
  }
}

export async function getApifyRun(id: string, signal?: AbortSignal) {
  if (!/^[A-Za-z0-9]+$/.test(id)) throw new ImportError('provider_response', 'Invalid Apify run ID.');
  return runSchema.parse(await request(`/actor-runs/${id}`, {}, signal)).data;
}

export async function getApifyPosts(datasetId: string, signal?: AbortSignal) {
  if (!/^[A-Za-z0-9]+$/.test(datasetId)) throw new ImportError('provider_response', 'Invalid Apify dataset ID.');
  const { limit } = apifyConfig();
  const value = await request(`/datasets/${datasetId}/items?clean=true&format=json&limit=${limit}`, {}, signal);
  if (!Array.isArray(value) || value.length > limit)
    throw new ImportError('provider_response', 'Apify returned an invalid dataset.');
  const posts: ImportedPost[] = [];
  let rejected = 0;
  for (const item of value) {
    try {
      posts.push(normalizeApifyPost(item));
    } catch {
      rejected++;
    }
  }
  return { posts, rejected };
}

/** Apify's documented post dataset: Image, Video, or Sidecar with childPosts. */
export function normalizeApifyPost(value: unknown): ImportedPost {
  const item = z
    .object({
      id: z.string().min(1),
      shortCode: z.string().min(1),
      url: z.string().optional(),
      ownerUsername: z.string().nullable().optional(),
      caption: z.string().nullable().optional(),
      timestamp: z.string().nullable().optional(),
      type: z.enum(['Image', 'Video', 'Sidecar']),
      displayUrl: z.string().optional(),
      videoUrl: z.string().optional(),
      dimensionsWidth: z.number().optional(),
      dimensionsHeight: z.number().optional(),
      childPosts: z
        .array(
          z.object({
            type: z.enum(['Image', 'Video']),
            displayUrl: z.string(),
            videoUrl: z.string().optional(),
            dimensionsWidth: z.number().optional(),
            dimensionsHeight: z.number().optional(),
          }),
        )
        .max(20)
        .optional(),
    })
    .parse(value);
  const children = item.type === 'Sidecar' ? item.childPosts || [] : [item];
  return importedPostSchema.parse({
    id: item.id,
    shortcode: item.shortCode,
    permalink: normalizeInstagramSource(`https://www.instagram.com/p/${item.shortCode}/`).sourceUrl,
    handle: item.ownerUsername || null,
    caption: item.caption || '',
    posted_at: item.timestamp || null,
    assets: children.map((child) => ({
      type: child.type === 'Video' ? 'video' : 'image',
      url: child.type === 'Video' ? child.videoUrl : child.displayUrl,
      poster_url: child.type === 'Video' ? child.displayUrl : null,
      width: child.dimensionsWidth || null,
      height: child.dimensionsHeight || null,
    })),
  });
}
