import { ContainerRegistrationKeys, Modules } from '@medusajs/framework/utils';
import { processSocialGalleryImportJob } from '../../src/lib/social-gallery/import-worker';
import { SOCIAL_GALLERY_MODULE } from '../../src/modules/social-gallery';

jest.mock('../../src/modules/social-gallery', () => ({ SOCIAL_GALLERY_MODULE: 'social' }));
jest.mock('../../src/lib/social-gallery/media-storage', () => ({
  ...jest.requireActual('../../src/lib/social-gallery/media-storage'),
  persistMedia: jest.fn(async () => [{ type: 'image', url: 'https://media.example.com/owned.jpg', file_id: 'file1' }]),
}));

import {
  claimImport,
  recoverImports,
  updateOwnedJob,
  type GalleryDatabase,
} from '../../src/lib/social-gallery/job-store';
import { Migration20261001232000 } from '../../src/modules/social-gallery/migrations/Migration20261001232000';
import { Migration20261002030000 } from '../../src/modules/social-gallery/migrations/Migration20261002030000';
import { Migration20261002043000 } from '../../src/modules/social-gallery/migrations/Migration20261002043000';
import { Migration20261013010000 } from '../../src/modules/social-gallery/migrations/Migration20261013010000';

const connection = process.env.SOCIAL_GALLERY_TEST_DATABASE_URL;
const describeDatabase = connection ? describe : describe.skip;

describeDatabase('Social Gallery claims and recovery on disposable PostgreSQL', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
    delete process.env.APIFY_API_TOKEN;
  });
  let db: GalleryDatabase;
  let knex: any;
  beforeAll(async () => {
    const url = new URL(connection!);
    if (url.hostname !== '127.0.0.1' || url.pathname !== '/social_gallery_test')
      throw new Error('Only the dedicated loopback social_gallery_test database is allowed.');
    knex = require('knex')({ client: 'pg', connection, pool: { min: 0, max: 5 } });
    db = knex;
    for (const Migration of [
      Migration20261001232000,
      Migration20261002030000,
      Migration20261002043000,
      Migration20261013010000,
    ]) {
      const queries: string[] = [];
      await Migration.prototype.up.call({ addSql: (query: string) => queries.push(query) } as any);
      for (const query of queries) await db.raw(query);
    }
  });
  afterAll(async () => {
    await knex?.destroy();
  });
  beforeEach(async () => {
    await db.raw('truncate social_import_job');
  });
  async function insert(id: string, source = id) {
    await db.raw('insert into social_import_job (id, source_url) values (?, ?)', [
      id,
      `https://www.instagram.com/${source}/`,
    ]);
  }
  it('allows exactly one of two simultaneous claims', async () => {
    await insert('job1');
    const results = await Promise.all([claimImport(db, 'job1'), claimImport(db, 'job1')]);
    expect(results.filter(Boolean)).toHaveLength(1);
    const state = (await db.raw('select * from social_import_job where id = ?', ['job1'])).rows[0];
    expect(state.attempt_count).toBe(1);
    expect(state.status).toBe('running');
  });
  it('serializes different source jobs to bound memory/storage pressure', async () => {
    await insert('job1');
    await insert('job2');
    const results = await Promise.all([claimImport(db, 'job1'), claimImport(db, 'job2')]);
    expect(results.filter(Boolean)).toHaveLength(1);
  });
  it('does not run a completed job twice', async () => {
    await insert('job1');
    const job = (await claimImport(db, 'job1'))!;
    await updateOwnedJob(db, job, { status: 'completed' });
    expect(await claimImport(db, 'job1')).toBeNull();
  });
  it('recovers a stale saved run without creating another run', async () => {
    await insert('job1');
    await db.raw(
      "update social_import_job set status = 'running', attempt_count = 1, provider_run_id = 'run123', lease_token = 'old', lease_expires_at = now() - interval '1 minute'",
    );
    expect(await recoverImports(db)).toEqual([{ id: 'job1' }]);
    const job = (await claimImport(db, 'job1'))!;
    expect(job.provider_run_id).toBe('run123');
    expect(job.lease_token).not.toBe('old');
  });
  it('never automatically repeats an ambiguous paid start', async () => {
    await insert('job1');
    await db.raw(
      "update social_import_job set status = 'running', provider_starting = true, lease_expires_at = now() - interval '1 minute'",
    );
    expect(await recoverImports(db)).toEqual([]);
    const job = (await db.raw('select * from social_import_job')).rows[0];
    expect(job.status).toBe('failed');
    expect(job.failure_code).toBe('provider_start_uncertain');
    expect(await claimImport(db, 'job1')).toBeNull();
  });
  it('rejects updates from an expired worker after another worker claims the job', async () => {
    await insert('job1');
    const old = (await claimImport(db, 'job1'))!;
    await db.raw("update social_import_job set lease_expires_at = now() - interval '1 minute'");
    await recoverImports(db);
    await claimImport(db, 'job1');
    await expect(updateOwnedJob(db, old, { status: 'completed' })).rejects.toThrow('lease');
  });
  it('caps automatic attempts and respects backoff', async () => {
    await insert('job1');
    await db.raw("update social_import_job set next_attempt_at = now() + interval '1 minute'");
    expect(await claimImport(db, 'job1')).toBeNull();
    await db.raw(
      "update social_import_job set status = 'running', attempt_count = 3, lease_expires_at = now() - interval '1 minute'",
    );
    expect(await recoverImports(db)).toEqual([]);
    expect((await db.raw('select status from social_import_job')).rows[0].status).toBe('failed');
  });
  it('enforces a single active job per canonical source at database level', async () => {
    await insert('job1', 'chef');
    await expect(insert('job2', 'chef')).rejects.toMatchObject({ code: '23505' });
  });
  function fixtureContainer() {
    const posts: any[] = [];
    const svc = {
      listSocialGalleryPosts: jest.fn(async () => posts),
      createSocialGalleryPosts: jest.fn(async (data) => {
        const post = { id: 'post1', ...data };
        posts.push(post);
        return post;
      }),
    };
    const dependencies: Record<string, unknown> = {
      [ContainerRegistrationKeys.PG_CONNECTION]: db,
      [ContainerRegistrationKeys.LOGGER]: { warn: jest.fn() },
      [SOCIAL_GALLERY_MODULE]: svc,
      [Modules.FILE]: { deleteFiles: jest.fn().mockResolvedValue(undefined) },
    };
    return { svc, container: { resolve: (name: string) => dependencies[name] } as any };
  }
  function successfulProvider() {
    process.env.APIFY_API_TOKEN = 'fixture-token';
    global.fetch = jest.fn(async (input, init) => {
      const url = String(input);
      if (init?.method === 'POST') return new Response(JSON.stringify({ data: { id: 'run123', status: 'READY' } }));
      if (url.includes('/actor-runs/'))
        return new Response(
          JSON.stringify({ data: { id: 'run123', status: 'SUCCEEDED', defaultDatasetId: 'data123' } }),
        );
      return new Response(
        JSON.stringify([
          {
            id: '123',
            shortCode: 'abc123',
            type: 'Image',
            displayUrl: 'https://scontent.cdninstagram.com/a.jpg',
            caption: 'Dinner',
            ownerUsername: 'chef',
          },
        ]),
      );
    });
  }
  it('runs the complete worker with real job persistence and ignores redelivery', async () => {
    await insert('job1', 'chef');
    successfulProvider();
    const { container, svc } = fixtureContainer();
    await processSocialGalleryImportJob(container, 'job1');
    const job = (await db.raw('select * from social_import_job')).rows[0];
    expect(job).toMatchObject({
      status: 'completed',
      provider_run_id: 'run123',
      provider_starting: false,
      imported_count: 1,
    });
    expect(svc.createSocialGalleryPosts.mock.calls[0][0]).toMatchObject({
      is_active: false,
      import_status: 'draft',
      media_url: 'https://media.example.com/owned.jpg',
    });
    const calls = (global.fetch as jest.Mock).mock.calls.length;
    await processSocialGalleryImportJob(container, 'job1');
    expect(global.fetch).toHaveBeenCalledTimes(calls);
    expect(svc.createSocialGalleryPosts).toHaveBeenCalledTimes(1);
  });
  it('resumes an existing provider run without another paid POST', async () => {
    await insert('job1', 'chef');
    await db.raw("update social_import_job set provider_run_id = 'run123'");
    successfulProvider();
    await processSocialGalleryImportJob(fixtureContainer().container, 'job1');
    expect((global.fetch as jest.Mock).mock.calls.every(([, init]) => init.method !== 'POST')).toBe(true);
    expect((await db.raw('select status from social_import_job')).rows[0].status).toBe('completed');
  });
  it('persists an ambiguous run start as terminal instead of billing again', async () => {
    await insert('job1', 'chef');
    process.env.APIFY_API_TOKEN = 'fixture-token';
    global.fetch = jest.fn().mockRejectedValue(new Error('lost response'));
    await processSocialGalleryImportJob(fixtureContainer().container, 'job1');
    expect((await db.raw('select status, failure_code from social_import_job')).rows[0]).toMatchObject({
      status: 'failed',
      failure_code: 'provider_start_uncertain',
    });
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(await recoverImports(db)).toEqual([]);
  });
});
