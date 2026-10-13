import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { SOCIAL_GALLERY_MODULE } from "../../../modules/social-gallery";
import type SocialGalleryModuleService from "../../../modules/social-gallery/service";
import {
  categorySchema,
  listQuery,
  publicPost,
} from "../../../lib/social-gallery/contracts";

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const query = listQuery.safeParse(req.query);
  if (!query.success)
    return res.status(400).json({ message: "Invalid pagination." });
  const category =
    req.query.category === undefined
      ? undefined
      : categorySchema.safeParse(req.query.category);
  if (category && !category.success)
    return res.status(400).json({ message: "Invalid category." });
  const svc = req.scope.resolve<SocialGalleryModuleService>(
    SOCIAL_GALLERY_MODULE,
  );
  const [posts, count] = await svc.listAndCountSocialGalleryPosts(
    {
      is_active: true,
      import_status: "published",
      ...(category?.success ? { category: category.data } : {}),
    },
    {
      order: {
        is_featured: "DESC",
        sort_order: "ASC",
        posted_at: "DESC",
        id: "ASC",
      },
      take: query.data.limit,
      skip: query.data.offset,
    },
  );
  // Availability is global, not limited to the selected category or page.
  const categories = (
    await Promise.all(
      categorySchema.options.map(async (value) => {
        const [, total] = await svc.listAndCountSocialGalleryPosts(
          { is_active: true, import_status: "published", category: value },
          { take: 1, select: ["id"] },
        );
        return total > 0 ? value : null;
      }),
    )
  ).filter((value) => value !== null);
  return res.json({
    social_gallery_posts: posts.map(publicPost),
    count,
    categories,
    ...query.data,
  });
}
