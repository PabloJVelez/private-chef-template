import { lookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';
import { request } from 'node:https';
import { createHash } from 'node:crypto';
import type { IFileModuleService } from '@medusajs/framework/types';
import { assetSchema, ImportError, type GalleryAsset } from './contracts';

const privateV4 = new BlockList();
for (const [address, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const)
  privateV4.addSubnet(address, prefix);
const globalV6 = new BlockList();
globalV6.addSubnet('2000::', 3, 'ipv6');
const excludedV6 = new BlockList();
excludedV6.addSubnet('2001::', 23, 'ipv6');
excludedV6.addSubnet('2002::', 16, 'ipv6');
excludedV6.addSubnet('2001:db8::', 32, 'ipv6');

export const isPublicAddress = (address: string) =>
  isIP(address) === 4
    ? !privateV4.check(address, 'ipv4')
    : isIP(address) === 6 && globalV6.check(address, 'ipv6') && !excludedV6.check(address, 'ipv6');

export function validateMediaSource(value: string): URL {
  const url = new URL(value);
  const host = url.hostname.toLowerCase();
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    (url.port && url.port !== '443') ||
    !['cdninstagram.com', 'fbcdn.net'].some((suffix) => host === suffix || host.endsWith(`.${suffix}`))
  ) {
    throw new ImportError('invalid_media', 'Instagram returned a media URL outside its supported media hosts.');
  }
  return url;
}

export function detectMedia(buffer: Buffer) {
  if (
    buffer.length >= 12 &&
    buffer.toString('ascii', 4, 8) === 'ftyp' &&
    ['avif', 'avis'].includes(buffer.toString('ascii', 8, 12))
  )
    return { type: 'image', mime: 'image/avif', extension: 'avif' } as const;
  if (buffer.length >= 12 && buffer.toString('ascii', 4, 8) === 'ftyp')
    return { type: 'video', mime: 'video/mp4', extension: 'mp4' } as const;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff)
    return { type: 'image', mime: 'image/jpeg', extension: 'jpg' } as const;
  if (buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
    return { type: 'image', mime: 'image/png', extension: 'png' } as const;
  if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP')
    return { type: 'image', mime: 'image/webp', extension: 'webp' } as const;
  throw new ImportError('invalid_media', 'Unsupported image/video content returned by Instagram.');
}

/** Resolve, reject private addresses, then pin the chosen address to prevent DNS rebinding. */
export async function downloadMedia(value: string, signal: AbortSignal, hops = 0): Promise<Buffer> {
  if (signal.aborted) throw new ImportError('timeout', 'Import timed out.', true);
  const url = validateMediaSource(value);
  if (hops > 3) throw new ImportError('invalid_media', 'Too many media redirects.');
  const addresses = await lookup(url.hostname, { all: true });
  if (!addresses.length || addresses.some(({ address }) => !isPublicAddress(address)))
    throw new ImportError('invalid_media', 'Media host did not resolve to a public address.');
  const pinned = addresses[0];
  const result = await new Promise<Buffer | URL>((resolve, reject) => {
    const req = request(
      url,
      {
        signal,
        family: pinned.family,
        headers: { Accept: 'image/jpeg,image/png,image/webp,video/mp4' },
        lookup: (_hostname, _options, callback) => callback(null, pinned.address, pinned.family),
      },
      (response) => {
        const status = response.statusCode || 0;
        if ([301, 302, 303, 307, 308].includes(status) && response.headers.location) {
          response.resume();
          resolve(new URL(response.headers.location, url));
          return;
        }
        if (status !== 200) {
          response.resume();
          reject(
            new ImportError(
              'media_download',
              `Media download returned HTTP ${status}.`,
              status === 429 || status >= 500,
            ),
          );
          return;
        }
        const max = 40 * 1024 * 1024;
        if (Number(response.headers['content-length'] || 0) > max) {
          response.destroy();
          reject(new ImportError('media_size', 'A media file exceeds the 40 MB import limit.'));
          return;
        }
        const chunks: Buffer[] = [];
        let bytes = 0;
        response.on('data', (chunk: Buffer) => {
          bytes += chunk.length;
          if (bytes > max) {
            response.destroy(new ImportError('media_size', 'A media file exceeds the 40 MB import limit.'));
            return;
          }
          chunks.push(chunk);
        });
        response.on('error', reject);
        response.on('end', () => resolve(Buffer.concat(chunks)));
      },
    );
    const timer = setTimeout(
      () => req.destroy(new ImportError('media_download', 'Media download timed out.', true)),
      30000,
    );
    req.setTimeout(12000, () => req.destroy(new ImportError('media_download', 'Media connection timed out.', true)));
    req.on('error', reject);
    req.on('close', () => clearTimeout(timer));
    req.end();
  });
  return result instanceof URL ? downloadMedia(result.toString(), signal, hops + 1) : result;
}

export async function persistMedia(
  files: IFileModuleService,
  assets: GalleryAsset[],
  signal: AbortSignal,
  budget: { bytes: number },
  download = downloadMedia,
): Promise<GalleryAsset[]> {
  const created: string[] = [];
  const save = async (source: string, type: 'image' | 'video') => {
    if (signal.aborted) throw new ImportError('timeout', 'Import timed out.', true);
    if (budget.bytes >= 150 * 1024 * 1024)
      throw new ImportError('media_size', 'This import exceeds the 150 MB limit. Import fewer posts.');
    const bytes = await download(source, signal);
    budget.bytes += bytes.length;
    if (budget.bytes > 150 * 1024 * 1024)
      throw new ImportError('media_size', 'This import exceeds the 150 MB limit. Import fewer posts.');
    const detected = detectMedia(bytes);
    if (detected.type !== type)
      throw new ImportError('invalid_media', 'Media content did not match the expected type.');
    const digest = createHash('sha256').update(bytes).digest('hex');
    if (signal.aborted) throw new ImportError('timeout', 'Import timed out.', true);
    const file = await files.createFiles({
      filename: `gallery-${digest}.${detected.extension}`,
      mimeType: detected.mime,
      content: bytes.toString('binary'),
      access: 'public',
    });
    created.push(file.id);
    return file;
  };
  try {
    const stored: GalleryAsset[] = [];
    for (const asset of assets) {
      const file = await save(asset.url, asset.type);
      const poster = asset.poster_url ? await save(asset.poster_url, 'image') : null;
      const parsed = assetSchema.safeParse({
        ...asset,
        url: file.url,
        file_id: file.id,
        poster_url: poster?.url || null,
        poster_file_id: poster?.id || null,
      });
      if (!parsed.success)
        throw new ImportError(
          'media_storage_config',
          'File storage returned an invalid public URL. Check the file provider URL configuration.',
        );
      stored.push(parsed.data);
    }
    return stored;
  } catch (error) {
    if (created.length) await files.deleteFiles(created).catch(() => undefined);
    if (error instanceof ImportError) throw error;
    throw new ImportError(
      'media_storage',
      'Could not store imported media. Check file storage and retry this import.',
      true,
    );
  }
}

export const assetFileIds = (assets: GalleryAsset[]) =>
  assets.flatMap((asset) => [asset.file_id, asset.poster_file_id].filter((id): id is string => !!id));
