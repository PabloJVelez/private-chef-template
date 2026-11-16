export function authorizedSiteAdmin(
  auth: { actor_id?: string; actor_type?: string } | undefined,
  env: NodeJS.ProcessEnv = process.env,
) {
  // Existing workspace reads are site-wide, with no chef ownership column.
  // Explicit operator attestation + user IDs are required; never infer tenancy.
  const ids = (env.CHEF_AI_ADMIN_USER_IDS || "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  return (
    env.CHEF_AI_SCOPE === "single_site" &&
    ids.length > 0 &&
    ids.length <= 20 &&
    auth?.actor_type === "user" &&
    !!auth.actor_id &&
    ids.includes(auth.actor_id)
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
