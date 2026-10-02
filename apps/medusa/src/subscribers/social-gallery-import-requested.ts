import type { SubscriberArgs, SubscriberConfig } from '@medusajs/medusa';
import { processSocialGalleryImportJob } from '../lib/social-gallery/import-worker';

type EventData = {
  jobId: string;
};

export default async function socialGalleryImportRequestedHandler({
  event: { data },
  container,
}: SubscriberArgs<EventData>) {
  if (!data.jobId) return;
  await processSocialGalleryImportJob(container, data.jobId);
}

export const config: SubscriberConfig = {
  event: 'social-gallery.import-requested',
};
