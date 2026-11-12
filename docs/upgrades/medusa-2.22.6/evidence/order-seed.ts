export default async function seed({ container }: any) {
  const url = new URL(process.env.DATABASE_URL!);
  if (url.hostname !== '127.0.0.1' || url.pathname !== '/upgrade_main') throw new Error('Disposable fixture only');
  const [region] = await container.resolve('region').listRegions();
  const order = await container.resolve('order').createOrders({
    currency_code: 'usd', region_id: region.id, email: 'fixture@example.invalid', no_notification: true,
    items: [{ title: 'Upgrade fixture ticket', product_title: 'Upgrade fixture ticket', variant_sku: 'EVENT-upgrade-fixture', quantity: 1, unit_price: 425.25 }],
  });
  console.log(JSON.stringify({ orderId: order.id }));
}
