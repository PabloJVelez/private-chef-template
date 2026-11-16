import path from "node:path";

/** Unlock exposes dashboard source to Vite in dev AND production. Keep upstream
 * auth/RBAC/navigation intact; fail the build if either integration anchor moves.
 */
export function chefChatMount() {
  const mounted = new Set<string>();
  const component = JSON.stringify(
    path.resolve(__dirname, "../admin/components/chef-chat/chef-chat.tsx"),
  );
  return {
    name: "medusa-chef-schedule-chat",
    enforce: "pre" as const,
    buildStart() { mounted.clear(); },
    generateBundle() {
      if (mounted.size !== 2) throw new Error('Medusa Chef Chat mount was not loaded; recheck Unlock dashboard source integration.');
    },
    transform(code: string, id: string) {
      const file = id.split("?")[0].replace(/\\/g, "/");
      let anchor: string, replacement: string, imports: string;
      if (file.endsWith("/@medusajs/dashboard/src/providers/providers.tsx")) {
        anchor = "<I18nProvider>{children}</I18nProvider>";
        replacement =
          "<I18nProvider><ChefChatSession>{children}</ChefChatSession></I18nProvider>";
        imports = `import { ChefChatSession } from ${component}\n`;
      } else if (
        file.endsWith(
          "/@medusajs/dashboard/src/components/authentication/protected-route/protected-route.tsx",
        )
      ) {
        anchor = "<Outlet />";
        replacement =
          "<Outlet /><ChefChat key={user.id} userId={user.id} client={sdk.client} />";
        imports = `import { ChefChat } from ${component}\nimport { sdk } from "../../../lib/client"\n`;
      } else return null;
      if (code.split(anchor).length !== 2)
        throw new Error(
          "Medusa Chef Chat mount changed; recheck dashboard integration.",
        );
      mounted.add(file);
      return { code: imports + code.replace(anchor, replacement), map: null };
    },
  };
}
