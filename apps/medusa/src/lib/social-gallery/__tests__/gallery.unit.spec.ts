import { normalizeInstagramSource } from '../instagram';
import { normalizeApifyPost, startApifyRun, getApifyPosts } from '../apify';
import { publicPost, publicationError, destinationUrl, mediaUrl } from '../contracts';
import { isPublicAddress, validateMediaSource, detectMedia, persistMedia } from '../media-storage';
import { importDraft } from '../import-worker';
import { POST as createManual } from '../../../api/admin/social-gallery-posts/route';

jest.mock('../../../modules/social-gallery', () => ({ SOCIAL_GALLERY_MODULE: 'social' }));

const image = { type: 'image' as const, url: 'https://scontent.cdninstagram.com/photo.jpg' };
const ownedImage = { ...image, url: 'https://media.example.com/photo.jpg', file_id: 'file1' };
const post = {
  id: '123',
  shortcode: 'abc123',
  permalink: 'https://www.instagram.com/p/abc123/',
  handle: 'chef',
  caption: 'Original',
  posted_at: null,
  assets: [image],
};
const lease = jest.fn().mockResolvedValue(undefined);
const signal = () => new AbortController().signal;
const originalFetch = global.fetch;
const response = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });

afterEach(() => {
  global.fetch = originalFetch;
  delete process.env.APIFY_API_TOKEN;
  jest.clearAllMocks();
});

describe('Instagram input', () => {
  test.each([
    'chef.velez',
    '@Chef.Velez',
    'www.instagram.com/Chef.Velez/',
    'https://instagram.com/chef.velez/?igsh=abc',
  ])('canonicalizes %s', (input) => {
    expect(normalizeInstagramSource(input).sourceUrl).toBe('https://www.instagram.com/chef.velez/');
  });
  test.each([
    'https://instagram.com.attacker.test/chef',
    'https://instagram.com/',
    'https://instagram.com/p/',
    'https://instagram.com/stories/chef/123',
    'https://user:pass@instagram.com/chef',
    'https://instagram.com:444/chef',
    'bad handle',
    'https://127.0.0.1/chef',
  ])('rejects %s', (input) => {
    expect(() => normalizeInstagramSource(input)).toThrow();
  });
  it('supports reel links without an Instagram login', () => {
    expect(normalizeInstagramSource('https://instagram.com/reel/abc123/')).toMatchObject({
      kind: 'post',
      shortcode: 'abc123',
      handle: null,
    });
  });
});

describe('Apify boundary', () => {
  it('normalizes ordered mixed carousel children', () => {
    const parsed = normalizeApifyPost({
      id: '123',
      shortCode: 'abc123',
      type: 'Sidecar',
      caption: '',
      childPosts: [
        { type: 'Image', displayUrl: image.url },
        { type: 'Video', displayUrl: image.url, videoUrl: 'https://video.fbcdn.net/reel.mp4' },
      ],
    });
    expect(parsed.assets.map((asset) => asset.type)).toEqual(['image', 'video']);
    expect(parsed.assets[1].poster_url).toBe(image.url);
  });
  it('rejects a carousel with missing children rather than silently truncating it', () => {
    expect(() =>
      normalizeApifyPost({ id: '123', shortCode: 'abc123', type: 'Sidecar', displayUrl: image.url }),
    ).toThrow();
  });
  it('sets a run spend/result cap and keeps the token out of URLs', async () => {
    process.env.APIFY_API_TOKEN = 'fixture-token';
    global.fetch = jest.fn().mockResolvedValue(response({ data: { id: 'run123', status: 'READY' } }));
    await startApifyRun('@chef');
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toContain('maxTotalChargeUsd=0.1');
    expect(url).toContain('maxItems=12');
    expect(url).not.toContain('fixture-token');
    expect(init.headers.Authorization).toBe('Bearer fixture-token');
    expect(JSON.parse(init.body)).toMatchObject({ resultsLimit: 12, directUrls: ['https://www.instagram.com/chef/'] });
  });
  it('does not retry an ambiguous paid run start or expose provider response secrets', async () => {
    process.env.APIFY_API_TOKEN = 'fixture-token';
    global.fetch = jest.fn().mockRejectedValue(new Error('fixture-token'));
    await expect(startApifyRun('@chef')).rejects.toMatchObject({ code: 'provider_start_uncertain', retryable: false });
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
  it('reports a rejected token as configuration failure, not an ambiguous paid run', async () => {
    process.env.APIFY_API_TOKEN = 'fixture-token';
    global.fetch = jest.fn().mockResolvedValue(response({ error: 'unauthorized' }, 401));
    await expect(startApifyRun('@chef')).rejects.toMatchObject({ code: 'provider_rejected', retryable: false });
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
  it('retains valid results and reports invalid records', async () => {
    process.env.APIFY_API_TOKEN = 'fixture-token';
    global.fetch = jest
      .fn()
      .mockResolvedValue(
        response([{ id: '1', shortCode: 'abc', type: 'Image', displayUrl: image.url }, { error: 'restricted' }]),
      );
    const result = await getApifyPosts('dataset123');
    expect(result.posts).toHaveLength(1);
    expect(result.rejected).toBe(1);
  });
});

describe('Durable media safety', () => {
  it('accepts local file-provider URLs in development but rejects private remote media URLs', () => {
    expect(mediaUrl.safeParse('http://localhost:9000/static/photo.jpg').success).toBe(true);
    expect(mediaUrl.safeParse('http://10.0.0.1/photo.jpg').success).toBe(false);
    expect(() => validateMediaSource('http://localhost:9000/static/photo.jpg')).toThrow();
  });
  it('recognizes AVIF as an image rather than an MP4', () => {
    expect(detectMedia(Buffer.from('0000ftypavif0000')).type).toBe('image');
  });
  test.each([
    '127.0.0.1',
    '10.1.2.3',
    '169.254.169.254',
    '172.16.1.1',
    '192.168.1.1',
    '100.64.1.1',
    '::1',
    '::ffff:127.0.0.1',
    'fd00::1',
    'fe80::1',
    '2001:db8::1',
  ])('blocks non-public address %s', (address) => expect(isPublicAddress(address)).toBe(false));
  it('permits public IPv4/IPv6', () => {
    expect(isPublicAddress('8.8.8.8')).toBe(true);
    expect(isPublicAddress('2606:4700:4700::1111')).toBe(true);
  });
  test.each([
    'http://scontent.cdninstagram.com/a',
    'https://cdninstagram.com.attacker.test/a',
    'https://127.0.0.1/a',
    'https://scontent.fbcdn.net:444/a',
  ])('rejects unsafe media URL %s', (url) => expect(() => validateMediaSource(url)).toThrow());
  it('rejects HTML/SVG masquerading as media', () => {
    expect(() => detectMedia(Buffer.from('<svg></svg>'))).toThrow();
    expect(() => detectMedia(Buffer.from('<html>'))).toThrow();
  });
  it('copies assets through Medusa file storage', async () => {
    const files = {
      createFiles: jest.fn().mockResolvedValue({ id: 'file1', url: ownedImage.url }),
      deleteFiles: jest.fn(),
    };
    const result = await persistMedia(
      files as any,
      [image],
      signal(),
      { bytes: 0 },
      jest.fn().mockResolvedValue(Buffer.from([255, 216, 255, 1])),
    );
    expect(result[0]).toMatchObject({ url: ownedImage.url, file_id: 'file1' });
    expect(files.createFiles.mock.calls[0][0]).toMatchObject({ mimeType: 'image/jpeg', access: 'public' });
  });
  it('removes partial uploads when later assets fail', async () => {
    const files = {
      createFiles: jest.fn().mockResolvedValue({ id: 'file1', url: ownedImage.url }),
      deleteFiles: jest.fn().mockResolvedValue(undefined),
    };
    const download = jest
      .fn()
      .mockResolvedValueOnce(Buffer.from([255, 216, 255, 1]))
      .mockResolvedValueOnce(Buffer.from('<html>'));
    await expect(persistMedia(files as any, [image, image], signal(), { bytes: 0 }, download)).rejects.toThrow();
    expect(files.deleteFiles).toHaveBeenCalledWith(['file1']);
  });
});

describe('Curation and publishing', () => {
  it('preserves published chef edits and makes no new storage writes on re-import', async () => {
    const existing = {
      id: 'post1',
      title: 'Edited',
      import_status: 'published',
      is_active: true,
      is_featured: true,
      media_assets: { items: [ownedImage] },
    };
    const svc = {
      listSocialGalleryPosts: jest.fn().mockResolvedValue([existing]),
      updateSocialGalleryPosts: jest.fn(),
    };
    const store = jest.fn();
    await expect(importDraft(svc as any, {} as any, post, signal(), { bytes: 0 }, lease, store)).resolves.toBe(
      'skipped',
    );
    expect(store).not.toHaveBeenCalled();
    expect(svc.updateSocialGalleryPosts).not.toHaveBeenCalled();
  });
  it('does not resurrect archived posts', async () => {
    const svc = { listSocialGalleryPosts: jest.fn().mockResolvedValue([{ id: 'post1', import_status: 'archived' }]) };
    const store = jest.fn();
    await expect(importDraft(svc as any, {} as any, post, signal(), { bytes: 0 }, lease, store)).resolves.toBe(
      'skipped',
    );
    expect(store).not.toHaveBeenCalled();
  });
  it('repairs legacy media without touching publication or edits', async () => {
    const svc = {
      listSocialGalleryPosts: jest.fn().mockResolvedValue([{ id: 'post1', import_status: 'published' }]),
      updateSocialGalleryPosts: jest.fn().mockResolvedValue({}),
    };
    await importDraft(
      svc as any,
      {} as any,
      post,
      signal(),
      { bytes: 0 },
      lease,
      jest.fn().mockResolvedValue([ownedImage]),
    );
    const update = svc.updateSocialGalleryPosts.mock.calls[0][0];
    expect(update.media_assets.items[0].file_id).toBe('file1');
    for (const field of ['title', 'caption', 'category', 'is_active', 'is_featured', 'import_status'])
      expect(update).not.toHaveProperty(field);
  });
  it('new posts are drafts only and failed DB writes clean uploaded assets', async () => {
    const svc = {
      listSocialGalleryPosts: jest.fn().mockResolvedValue([]),
      createSocialGalleryPosts: jest.fn().mockRejectedValue(new Error('db unavailable')),
    };
    const files = { deleteFiles: jest.fn().mockResolvedValue(undefined) };
    await expect(
      importDraft(
        svc as any,
        files as any,
        post,
        signal(),
        { bytes: 0 },
        lease,
        jest.fn().mockResolvedValue([ownedImage]),
      ),
    ).rejects.toThrow();
    expect(svc.createSocialGalleryPosts.mock.calls[0][0]).toMatchObject({ is_active: false, import_status: 'draft' });
    expect(files.deleteFiles).toHaveBeenCalledWith(['file1']);
  });
  it('projects public fields and removes provider/file metadata', () => {
    const result = publicPost({
      id: 'post1',
      media_assets: { items: [ownedImage] },
      raw_provider_data: { secret: true },
      content_hash: 'private',
      provider_media_id: '123',
    });
    expect(result).not.toHaveProperty('raw_provider_data');
    expect(result).not.toHaveProperty('content_hash');
    expect(result).not.toHaveProperty('provider_media_id');
    expect(result.media_assets[0]).not.toHaveProperty('file_id');
  });
  it('rejects publishing missing or non-durable imported media', () => {
    expect(publicationError({ is_active: true, import_status: 'published', media_url: null })).not.toBeNull();
    expect(
      publicationError({
        is_active: true,
        import_status: 'published',
        provider: 'instagram',
        media_url: image.url,
        media_assets: { items: [image] },
      }),
    ).not.toBeNull();
    expect(
      publicationError({
        is_active: true,
        import_status: 'published',
        provider: 'instagram',
        media_url: ownedImage.url,
        media_assets: { items: [ownedImage] },
      }),
    ).toBeNull();
  });
  test.each(['javascript:alert(1)', '//attacker.test', '/\\attacker.test'])('rejects unsafe CTA %s', (url) =>
    expect(destinationUrl.safeParse(url).success).toBe(false),
  );
  it('manual saves never scrape source URLs', async () => {
    global.fetch = jest.fn();
    const create = jest.fn().mockImplementation(async (data) => ({ id: 'manual1', ...data }));
    const res: any = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    await createManual(
      {
        body: { title: 'Manual', source_url: 'https://example.com/source', media_url: ownedImage.url },
        scope: { resolve: () => ({ createSocialGalleryPosts: create }) },
      } as any,
      res,
    );
    expect(create).toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
