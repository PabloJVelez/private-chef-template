import { execFileSync } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
it("installed Medusa 2.22.6 generator preserves detail handles and existing labels/permissions", async () => {
  const code = execFileSync(
    process.execPath,
    [
      "-e",
      `
 (async () => {
  const plugin = require('@medusajs/admin-vite-plugin').default({sources: [require('node:path').resolve('src/admin')]});
  process.stdout.write((await plugin.load(plugin.resolveId('virtual:medusa/routes'))).code);
 })().catch(e => { console.error(e); process.exitCode=1; });
 `,
    ],
    { encoding: "utf8" },
  );
  expect(code).toContain("/chef-events/:id");
  expect(code).toContain("/menus/:id");
  expect(code).toMatch(
    /permissions: HandleConfig\d+\.permissions, \.\.\.handle\d+/,
  );
  for (const surface of ["chef-events", "menus"]) {
    const source = fs.readFileSync(
      path.resolve(`src/admin/routes/${surface}/[id]/page.tsx`),
      "utf8",
    );
    expect(source).toContain("sousChef:");
    expect(source).toContain("breadcrumb:");
  }
});
