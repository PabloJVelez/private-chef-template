import type { MedusaContainer } from '@medusajs/framework/types';
import { galleryDatabase, recoverImports } from '../lib/social-gallery/job-store';
import { processSocialGalleryImportJob } from '../lib/social-gallery/import-worker';

export default async function reconcileSocialGalleryImports(container: MedusaContainer) {
  for (const job of await recoverImports(galleryDatabase(container))) {
    await processSocialGalleryImportJob(container, job.id);
  }
}
export const config = { name: 'reconcile-social-gallery-imports', schedule: '* * * * *' };
