import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const source = (path) => readFile(new URL(path, root), "utf8");

test("all application routes require a resolved user", async () => {
  const layout = await source("src/routes/_app.tsx");
  assert.match(layout, /useCurrentUserState/);
  assert.match(layout, /if \(!user\) return <RedirectToSignIn/);
});

test("production login has no unauthenticated application bypass", async () => {
  const login = await source("src/routes/login.tsx");
  assert.doesNotMatch(login, /Открыть без облачной синхронизации/);
  assert.match(login, /!authEnabled/);
});

test("public client starts empty and excludes dated private migrations", async () => {
  const seed = await source("src/lib/seed.ts");
  assert.match(seed, /clients:\s*\[\]/);
  assert.match(seed, /orders:\s*\[\]/);
  assert.match(seed, /payments:\s*\[\]/);
  await assert.rejects(access(new URL("src/lib/migrations.ts", root)));
});
