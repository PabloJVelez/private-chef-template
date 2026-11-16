import { z } from "@medusajs/framework/zod";
const id = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[a-zA-Z0-9_-]+$/);
// Closed domain descriptors; never page DTOs, unsaved input, DOM or model context.
export const pageHintSchema = z.discriminatedUnion("surface", [
  z
    .object({
      version: z.literal(1),
      surface: z.literal("generic"),
      view: z.literal("unknown"),
    })
    .strict(),
  z
    .object({
      version: z.literal(1),
      surface: z.literal("chef-events"),
      view: z.literal("detail"),
      resource: z.object({ kind: z.literal("private-event"), id }).strict(),
    })
    .strict(),
  z
    .object({
      version: z.literal(1),
      surface: z.literal("menus"),
      view: z.literal("detail"),
      resource: z.object({ kind: z.literal("menu"), id }).strict(),
    })
    .strict(),
]);
export type PageHint = z.infer<typeof pageHintSchema>;
export type SousChefRouteDescriptor =
  | {
      surface: "chef-events";
      view: "detail";
      resource: { kind: "private-event"; idParam: "id" };
    }
  | {
      surface: "menus";
      view: "detail";
      resource: { kind: "menu"; idParam: "id" };
    }
  | null;
export type VerifiedEventTarget = {
  id: string;
  title: string;
  status: string;
  revision: string;
  date: string;
  time: string;
  timezone: string;
  instant: string;
};
