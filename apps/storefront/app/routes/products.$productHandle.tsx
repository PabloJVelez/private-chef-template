import { ProductReviewSection } from '@app/components/reviews/ProductReviewSection';
import ProductList from '@app/components/sections/ProductList';
import { ProductTemplate } from '@app/templates/ProductTemplate';
import { EventProductDetails } from '@app/components/product/EventProductDetails';
import { getMergedProductMeta, isEventProduct } from '@libs/util/products';
import { fetchProductReviewStats, fetchProductReviews } from '@libs/util/server/data/product-reviews.server';
import { fetchProducts } from '@libs/util/server/products.server';
import { fetchChefEventForProduct, fetchMenuForProduct } from '@libs/util/server/data/event-products.server';
import { withPaginationParams } from '@libs/util/withPaginationParams';
import { type LoaderFunctionArgs, type MetaFunction, redirect } from 'react-router';
import { useLoaderData } from 'react-router';

//The commented code is for the product reviews, which are not used in the new product detail page for now but can/wil be used in the future

export const loader = async (args: LoaderFunctionArgs) => {
  const { limit: reviewsLimit, offset: reviewsOffset } = withPaginationParams({
    request: args.request,
    defaultPageSize: 5,
  });

  const { products } = await fetchProducts(args.request, {
    handle: args.params.productHandle,
    fields: '*categories,variants.*,variants.sku,variants.options,variants.inventory_quantity,variants.manage_inventory',
  });

  if (!products.length) throw redirect('/404');

  const product = products[0];

  // const [productReviews, productReviewStats] = await Promise.all([
  //   fetchProductReviews({
  //     product_id: product.id,
  //     fields:
  //       'id,rating,content,name,images.url,created_at,updated_at,response.content,response.created_at,response.id',
  //     order: 'created_at',
  //     status: ['approved'],
  //     // can use status: (pending, approved, flagged)[] to get reviews by status // default is approved
  //     offset: reviewsOffset,
  //     limit: reviewsLimit,
  //   }),
  //   fetchProductReviewStats({
  //     product_id: product.id,
  //     offset: 0,
  //     limit: 1,
  //   }),
  // ]);

  // Check if this is an event product and fetch additional data
  let chefEvent = null;
  let menu = null;
  
  const isEvent = isEventProduct(product);
  
  if (isEvent) {
    [chefEvent, menu] = await Promise.all([
      fetchChefEventForProduct(product),
      fetchMenuForProduct(product),
    ]);
  }

  // return { product, productReviews, productReviewStats, chefEvent, menu };
  return { product, chefEvent, menu };
};

export type ProductPageLoaderData = typeof loader;

export const meta: MetaFunction<ProductPageLoaderData> = getMergedProductMeta;

export default function ProductDetailRoute() {
  //const { product, productReviews, productReviewStats, chefEvent, menu } = useLoaderData<ProductPageLoaderData>();
  const { product, chefEvent, menu } = useLoaderData<ProductPageLoaderData>();

  console.log('ProductDetailRoute Debug:', {
    productId: product.id,
    productTitle: product.title,
    variants: product.variants?.map(v => ({
      id: v.id,
      sku: v.sku,
      options: v.options,
      inventory_quantity: v.inventory_quantity
    })),
    isEvent: isEventProduct(product)
  });

  // Check if this is an event product
  if (isEventProduct(product)) {
    console.log('Rendering EventProductDetails');
    return (
      <>
        <EventProductDetails
          product={product}
          chefEvent={chefEvent}
          menu={menu}
        />
        {/* <ProductList className="!pb-[100px] xl:px-9" heading="You may also like" /> */}
        {/* <ProductReviewSection /> */}
      </>
    );
  }

  console.log('Rendering regular ProductTemplate');
  // Regular product template
  return (
    <>
      {/* <ProductTemplate
        product={product}
        reviewsCount={productReviews.count}
        reviewStats={productReviewStats.product_review_stats[0]}
      /> */}
      <ProductTemplate
        product={product}
        reviewsCount={0}
        reviewStats={undefined}
      />
      <ProductList className="!pb-[100px] xl:px-9" heading="You may also like" />
      {/* <ProductReviewSection /> */}
    </>
  );
}
