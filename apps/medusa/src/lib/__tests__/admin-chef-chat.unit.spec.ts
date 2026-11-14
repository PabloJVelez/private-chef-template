import fs from "node:fs";
import path from "node:path";
import { chefChatMount } from "../admin-chef-chat";
const base = path.join(
  path.dirname(require.resolve("@medusajs/dashboard/package.json")),
  "src",
);
it("mounts alongside the protected outlet and under shared query/theme providers without replacing gates", () => {
  const plugin = chefChatMount();
  const route =
    base + "/components/authentication/protected-route/protected-route.tsx";
  const source = fs.readFileSync(route, "utf8");
  const transformed = plugin.transform(source, route)!.code;
  expect(transformed).toContain("<Outlet /><ChefChat");
  expect(
    transformed.slice(transformed.indexOf("export const ProtectedRoute")),
  ).toBe(
    source
      .slice(source.indexOf("export const ProtectedRoute"))
      .replace(
        "<Outlet />",
        "<Outlet /><ChefChat key={user.id} userId={user.id} client={sdk.client} scheduleTransport={scheduleTransport} />",
      ),
  );
  const providers = base + "/providers/providers.tsx";
  expect(
    plugin.transform(fs.readFileSync(providers, "utf8"), providers)!.code,
  ).toContain("<ChefChatSession>{children}</ChefChatSession>");
});
it("fails on changed/duplicated anchors and ignores local extension root", () => {
  const plugin = chefChatMount();
  const route =
    base + "/components/authentication/protected-route/protected-route.tsx";
  expect(() => plugin.transform("changed", route)).toThrow("mount changed");
  expect(() => plugin.transform("<Outlet /><Outlet />", route)).toThrow(
    "mount changed",
  );
  expect(plugin.transform("<Outlet />", "/src/admin/root.tsx")).toBeNull();
});

it('fails a production bundle if Unlock stops exposing either global mounting source', () => {
  const plugin = chefChatMount();
  plugin.buildStart();
  expect(() => plugin.generateBundle()).toThrow('mount was not loaded');
  for (const relative of ['/providers/providers.tsx', '/components/authentication/protected-route/protected-route.tsx']) {
    const file = base + relative;
    plugin.transform(fs.readFileSync(file, 'utf8'), file);
  }
  expect(() => plugin.generateBundle()).not.toThrow();
});
