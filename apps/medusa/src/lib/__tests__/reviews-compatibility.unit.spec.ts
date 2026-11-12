/** The plugin stays disabled in app config. Verify the retained opt-in server contract. */
import { validateAndTransformQuery } from '@medusajs/framework/http';
const review = require('@lambdacurry/medusa-product-reviews/api/store/product-reviews/middlewares');
test('reviews plugin Zod schemas compose with target Medusa query schemas', () => {
  expect(review.listStoreProductReviewsQuerySchema.parse({ limit: '5', status: ['approved'] }))
    .toMatchObject({ limit: 5, status: ['approved'] });
  expect(review.upsertProductReviewsSchema.safeParse({ reviews: [] }).success).toBe(true);
  expect(require('@lambdacurry/medusa-product-reviews/workflows/create-product-reviews').createProductReviewsWorkflow).toBeDefined();
  expect(require('@lambdacurry/medusa-product-reviews/workflows/create-product-review-responses').createProductReviewResponsesWorkflow).toBeDefined();
});
test('rendered review fields pass the target query validator without widening the allowlist', async () => {
  const req: any = { query: { fields: 'id,rating,content,name,images.url,created_at,updated_at,response.content,response.created_at,response.id', limit: '5' }, allowed: [], scope: { resolve: () => undefined } };
  const next = jest.fn();
  await validateAndTransformQuery(review.listStoreProductReviewsQuerySchema, review.defaultStoreReviewsQueryConfig)(req, {} as any, next);
  expect(next).toHaveBeenCalledWith();
  expect(req.queryConfig.fields).toContain('id');
  expect(req.queryConfig.fields).toEqual(expect.arrayContaining(['images.url', 'response.content', 'response.created_at', 'response.id']));
});
