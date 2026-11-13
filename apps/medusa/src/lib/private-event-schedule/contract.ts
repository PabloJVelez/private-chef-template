import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { z } from '@medusajs/framework/zod';
import type { ScheduleEditInput } from '../../modules/chef-event/schedule-edit';

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export const previewInput = z
  .object({
    eventId: z.string().min(1).max(200),
    date: date.optional(),
    time: time.optional(),
  })
  .strict()
  .refine(
    (value) => value.date !== undefined || value.time !== undefined,
    'Provide a date and/or arrival time.',
  );
export const referenceInput = z.object({ reference: z.string().min(1).max(4096) }).strict();
const command = z
  .object({
    operationId: z.uuid(),
    actorId: z.string().min(1),
    eventId: z.string().min(1),
    expectedRevision: z.string().regex(/^[a-f0-9]{32}$/),
    date,
    time,
    timezone: z.string().min(1),
    instant: z.iso.datetime(),
    expiresAt: z.number().int().positive(),
  })
  .strict();
const signature = (payload: string, secret: string) => {
  if (secret.length < 32)
    throw new Error('Schedule edit references require a configured JWT secret of at least 32 characters.');
  return createHmac('sha256', secret)
    .update('private-event-schedule-v1:' + payload)
    .digest();
};
export function signPreview(input: Omit<ScheduleEditInput, 'operationId' | 'expiresAt'>, secret: string) {
  const value = {
    ...input,
    operationId: randomUUID(),
    expiresAt: Date.now() + 5 * 60_000,
  };
  const payload = Buffer.from(JSON.stringify(value)).toString('base64url');
  return {
    value,
    reference: payload + '.' + signature(payload, secret).toString('base64url'),
  };
}
/** Expiry applies only to unused previews. Signature and actor binding always apply to recovery. */
export function verifyReference(reference: string, actorId: string, secret: string): ScheduleEditInput {
  const parts = reference.split('.');
  if (parts.length !== 2) throw new Error('Invalid schedule edit reference.');
  const actual = Buffer.from(parts[1], 'base64url'),
    expected = signature(parts[0], secret);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
    throw new Error('Invalid schedule edit reference.');
  const value = command.parse(JSON.parse(Buffer.from(parts[0], 'base64url').toString()));
  if (value.actorId !== actorId) throw new Error('Schedule edit reference belongs to another Admin user.');
  return value;
}
