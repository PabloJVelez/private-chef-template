import type {
  MedusaContainer,
  IStoreModuleService,
} from "@medusajs/framework/types";
import { Modules, MedusaError } from "@medusajs/framework/utils";

/** These events have no store ownership column. Never guess among stores. */
export async function requireSingleStore(container: MedusaContainer) {
  const stores = await container
    .resolve<IStoreModuleService>(Modules.STORE)
    .listStores({}, { select: ["id"], take: 2 });
  if (stores.length !== 1)
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "Sous Chef requires a dedicated single-store instance.",
    );
}

export function authorizedSiteAdmin(
  auth: { actor_id?: string; actor_type?: string } | undefined,
  env: NodeJS.ProcessEnv = process.env,
) {
  // Dedicated one-store instance only. Authentication is established by Medusa,
  // and callers also verify the current account and unambiguous store below.
  return (
    env.CHEF_AI_SCOPE === "single_site" &&
    auth?.actor_type === "user" &&
    !!auth.actor_id
  );
}

/** Process-local cost caps, no prompts/results. Multi-worker installs need edge-wide limits too. */
export function createChatLimiter() {
  const users = new Map<
    string,
    { minute: number; count: number; day: number; daily: number; busy: boolean }
  >();
  let globalDay = -1,
    globalCount = 0;
  return (id: string, now = Date.now()): (() => void) | null => {
    const minute = Math.floor(now / 60000),
      day = Math.floor(now / 86400000);
    if (day !== globalDay) {
      users.clear();
      globalDay = day;
      globalCount = 0;
    }
    let user = users.get(id);
    if (!user) {
      if (users.size >= 20) return null;
      user = { minute, count: 0, day, daily: 0, busy: false };
      users.set(id, user);
    }
    if (user.minute !== minute) {
      user.minute = minute;
      user.count = 0;
    }
    if (user.busy || user.count >= 5 || user.daily >= 50 || globalCount >= 200)
      return null;
    user.busy = true;
    user.count++;
    user.daily++;
    globalCount++;
    return () => {
      user!.busy = false;
    };
  };
}
