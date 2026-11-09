import { model } from '@medusajs/framework/utils';

export const Reservation = model.define('scheduling_reservation', {
  id: model.id().primaryKey(),
  owner_id: model.text(),
  attempt_id: model.text(),
  starts_at: model.dateTime(),
  ends_at: model.dateTime(),
  state: model.enum(['held', 'confirmed', 'released']).default('held'),
});
