import type { ExecArgs } from "@medusajs/framework/types";
import { DateTime } from "luxon";
import type ChefEventModuleService from "../../src/modules/chef-event/service";
import type SchedulingModuleService from "../../src/modules/scheduling/service";
import type AvailabilityModuleService from "../../src/modules/availability/service";

/** Synthetic browser fixture only. No customer or external-provider writes. */
export default async function seed({ container }: ExecArgs) {
  const url = new URL(process.env.DATABASE_URL || "");
  if (
    !["127.0.0.1", "localhost"].includes(url.hostname) ||
    url.pathname !== "/bts11_admin"
  )
    throw new Error("BTS-11 disposable fixture required");
  const zone = "America/Chicago";
  const today = DateTime.now().setZone(zone).startOf("day");
  const chef = container.resolve<ChefEventModuleService>(
    "chefEventModuleService",
  );
  const scheduling = container.resolve<SchedulingModuleService>("scheduling");
  await container
    .resolve<AvailabilityModuleService>("availability")
    .saveSchedule({
      timezone: zone,
      weekly: {},
      overrides: {},
      google_mode: "internal_only",
    });
  for (const [id, name, start, confirmed] of [
    ["bts11_pending", "Pending", today.plus({ hours: 15 }), false],
    ["bts11_confirmed", "Confirmed", today.plus({ hours: 18 }), true],
    [
      "bts11_weekend",
      "Weekend",
      today.startOf("week").plus({ days: 5, hours: 18 }),
      false,
    ],
  ] as const) {
    await chef.createChefEvents({
      id,
      requestedDate: start.toJSDate(),
      requestedTime: start.toFormat("HH:mm"),
      partySize: 4,
      eventType: "plated_dinner",
      templateProductId: "fixture-menu",
      locationType: "customer_location",
      locationAddress: "Synthetic address",
      firstName: "BTS11",
      lastName: name,
      email: "fixture@example.invalid",
      phone: "0000000000",
      notes: "Synthetic fixture",
      specialRequirements: "",
      totalPrice: 400,
      depositPaid: false,
      estimatedDuration: 60,
      timeZone: zone,
    });
    if (confirmed) {
      const attempt = await chef.bindAcceptance({
        eventId: id,
        actorId: "fixture",
        body: {},
      });
      const event = await chef.retrieveChefEvent(id);
      await chef.claimAcceptance({
        id,
        token: attempt.id,
        updatedAt: event.updated_at,
        start: start.toISO()!,
        end: start.plus({ hours: 1 }).toISO()!,
        snapshot: { duration_minutes: 60, timezone: zone },
      });
      await chef.finalizeAcceptance({
        id,
        token: attempt.id,
        productId: "fixture-product",
      });
    }
    if (name !== "Weekend") {
      await scheduling.acquire({
        id,
        ownerId: id,
        attemptId: "fixture",
        start: start.minus({ minutes: 30 }).toISO()!,
        end: start.plus({ minutes: 90 }).toISO()!,
      });
      if (confirmed)
        await scheduling.confirm({ id, ownerId: id, attemptId: "fixture" });
    }
  }
}
