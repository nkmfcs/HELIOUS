import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";
import { createStore } from "zustand/vanilla";

// Execute the production sync, snapshot and warehouse actions in two isolated
// browser contexts. Only timers, browser persistence and the HTTP boundary are
// replaced; no private user snapshots or credentials are used in these tests.
const root = fileURLToPath(new URL("../", import.meta.url));
const clone = (value) => JSON.parse(JSON.stringify(value));
const checkpointKey = "cheshki_cloud_synced_state_v2";
const compiled = new Map();

function jsonb(value) {
  if (Array.isArray(value)) return value.map(jsonb);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .reverse()
        .map((key) => [key, jsonb(value[key])]),
    );
  return value;
}

function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function settle() {
  await new Promise(setImmediate);
}

function makeServer(state = null) {
  return {
    state: state && clone(state),
    revision: state ? 1 : 0,
    reads: 0,
    writes: 0,
    beforeLoad: null,
    beforeSave: null,
    afterSave: null,
    async loadWarehouse() {
      this.reads++;
      if (this.beforeLoad) await this.beforeLoad();
      return {
        state: this.state && jsonb(clone(this.state)),
        revision: this.revision,
        updatedAt: "2026-09-13T20:00:00Z",
      };
    },
    async saveWarehouse({ data }) {
      this.writes++;
      if (this.beforeSave) await this.beforeSave(data);
      if (this.state && data.baseRevision !== this.revision)
        return { ...(await this.loadWarehouse()), conflict: true, ok: false };
      this.state = clone(data.state);
      this.revision++;
      if (this.afterSave) await this.afterSave();
      return {
        revision: this.revision,
        updatedAt: "2026-09-13T20:01:00Z",
        conflict: false,
        ok: true,
      };
    },
  };
}

function browser(server, { initial, baseline, storage = new Map(), hydrated = true } = {}) {
  if (baseline) storage.set(checkpointKey, JSON.stringify(baseline));
  const events = () => {
    const listeners = new Map();
    return {
      addEventListener(name, fn) {
        if (!listeners.has(name)) listeners.set(name, new Set());
        listeners.get(name).add(fn);
      },
      removeEventListener(name, fn) {
        listeners.get(name)?.delete(fn);
      },
      emit(name) {
        for (const fn of listeners.get(name) ?? []) fn();
      },
    };
  };
  const window = events();
  const document = Object.assign(events(), { visibilityState: "visible" });
  const navigator = { onLine: true };
  let now = 0;
  let nextId = 0;
  const timers = new Map();
  const schedule = (fn, delay, repeat) => {
    const id = ++nextId;
    timers.set(id, { fn, due: now + delay, repeat });
    return id;
  };
  const hydrationListeners = new Set();
  const create = (initializer) => {
    if (!initializer) return create;
    const api = createStore(initializer);
    api.persist = {
      hasHydrated: () => hydrated,
      onFinishHydration(fn) {
        hydrationListeners.add(fn);
        return () => hydrationListeners.delete(fn);
      },
    };
    return api;
  };
  const context = vm.createContext({
    console,
    window,
    document,
    navigator,
    localStorage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
    },
    setTimeout: (fn, ms) => schedule(fn, ms, 0),
    clearTimeout: (id) => timers.delete(id),
    setInterval: (fn, ms) => schedule(fn, ms, ms),
    clearInterval: (id) => timers.delete(id),
  });
  const modules = new Map();
  function load(filename) {
    if (modules.has(filename)) return modules.get(filename).exports;
    const module = { exports: {} };
    modules.set(filename, module);
    if (!compiled.has(filename))
      compiled.set(
        filename,
        ts.transpileModule(readFileSync(filename, "utf8"), {
          compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
        }).outputText,
      );
    const require = (specifier) => {
      if (specifier === "zustand") return { create };
      if (specifier === "zustand/middleware") return { persist: (initializer) => initializer };
      if (specifier === "@/lib/warehouse.functions")
        return {
          loadWarehouse: () => server.loadWarehouse(),
          saveWarehouse: (args) => server.saveWarehouse(args),
        };
      let resolved = specifier.startsWith("@/")
        ? path.join(root, "src", specifier.slice(2))
        : path.resolve(path.dirname(filename), specifier);
      if (!resolved.endsWith(".ts")) resolved += ".ts";
      return load(resolved);
    };
    const execute = vm.runInContext(
      `(function(require, module, exports) {${compiled.get(filename)}\n})`,
      context,
      { filename },
    );
    execute(require, module, module.exports);
    return module.exports;
  }
  const { useWarehouse, snapshotOf } = load(path.join(root, "src/lib/store.ts"));
  const seed = clone(load(path.join(root, "src/lib/seed.ts")).SEED);
  if (initial) assert.equal(useWarehouse.getState().importState(clone(initial)), true);
  const sync = load(path.join(root, "src/lib/sync.ts"));
  return {
    sync,
    seed,
    window,
    document,
    navigator,
    storage,
    state: () => clone(snapshotOf(useWarehouse.getState())),
    status: () => sync.useCloud.getState().status,
    actions: () => useWarehouse.getState(),
    edit(fn) {
      const next = clone(snapshotOf(useWarehouse.getState()));
      fn(next);
      useWarehouse.getState().importState(next);
    },
    hydrate() {
      hydrated = true;
      for (const fn of hydrationListeners) fn();
    },
    async advance(ms) {
      const target = now + ms;
      while (true) {
        const next = [...timers]
          .filter(([, value]) => value.due <= target)
          .sort((a, b) => a[1].due - b[1].due)[0];
        if (!next) break;
        const [id, task] = next;
        now = task.due;
        if (task.repeat) task.due += task.repeat;
        else timers.delete(id);
        task.fn();
        await settle();
      }
      now = target;
      await settle();
    },
  };
}

function fixture() {
  const device = browser(makeServer());
  const data = device.seed;
  data.stock.white[18] = 50;
  data.stock.black[18] = 30;
  data.clients.push({
    id: "client-test",
    name: "Test",
    shop: "",
    phone: "",
    note: "",
    createdAt: "2026-09-13T10:00:00Z",
  });
  return data;
}

async function start(device) {
  const stop = device.sync.startCloudSync();
  await settle();
  return stop;
}

test("jsonb key reordering and old checkpoints do not create false conflicts", async () => {
  const data = fixture();
  const server = makeServer(data);
  const device = browser(server, { initial: jsonb(data), baseline: data });
  await start(device);
  assert.equal(device.status(), "ok");
  device.edit((s) => {
    s.stock.white[18] -= 5;
  });
  await device.advance(800);
  assert.equal(device.status(), "ok");
  assert.equal(server.state.stock.white[18], 45);
  assert.equal(server.writes, 1);
});

test("a new empty device automatically downloads the cloud without choosing a version", async () => {
  const server = makeServer(fixture());
  const phone = browser(server);
  await start(phone);
  assert.deepEqual(phone.state(), server.state);
  assert.equal(phone.status(), "ok");
  assert.equal(server.writes, 0);
});

test("unknown nonempty local data is preserved until an explicit choice", async () => {
  const remote = fixture();
  const local = clone(remote);
  local.stock.white[18] = 25;
  const server = makeServer(remote);
  const phone = browser(server, { initial: local });
  await start(phone);
  assert.equal(phone.status(), "conflict");
  assert.deepEqual(phone.state(), local);
  assert.equal(await phone.sync.saveNow(), false);
  assert.equal(server.writes, 0);
});

test("two open devices exchange sequential changes through polling without extra writes", async () => {
  const data = fixture();
  const server = makeServer(data);
  const pc = browser(server, { initial: data, baseline: data });
  const phone = browser(server, { initial: data, baseline: data });
  await start(pc);
  await start(phone);
  pc.edit((s) => {
    s.stock.white[18] -= 5;
  });
  await pc.advance(800);
  await phone.advance(5_000);
  assert.deepEqual(phone.state(), pc.state());
  phone.actions().setCosts({ sewing: 4500 });
  await phone.advance(800);
  await pc.advance(5_000);
  assert.deepEqual(phone.state(), pc.state());
  assert.equal(pc.status(), "ok");
  assert.equal(phone.status(), "ok");
  assert.equal(server.writes, 2);
  await phone.advance(20_000);
  assert.equal(server.writes, 2);
});

test("focus, foreground, pageshow and reconnect fetch changes immediately", async () => {
  const data = fixture();
  const server = makeServer(data);
  const phone = browser(server, { initial: data, baseline: data });
  await start(phone);
  for (const event of ["focus", "pageshow", "online", "visibilitychange"]) {
    server.state.stock.white[18] -= 5;
    server.revision++;
    if (event === "visibilitychange") phone.document.emit(event);
    else phone.window.emit(event);
    await settle();
    assert.deepEqual(phone.state(), server.state, event);
  }
  assert.equal(server.writes, 0);
});

test("offline edits survive and save automatically after reconnect", async () => {
  const data = fixture();
  const server = makeServer(data);
  const pc = browser(server, { initial: data, baseline: data });
  await start(pc);
  pc.navigator.onLine = false;
  pc.window.emit("offline");
  pc.edit((s) => {
    s.stock.white[18] = 35;
  });
  await pc.advance(10_000);
  assert.equal(pc.status(), "offline");
  assert.equal(server.writes, 0);
  pc.navigator.onLine = true;
  pc.window.emit("online");
  await settle();
  assert.equal(server.state.stock.white[18], 35);
  assert.equal(pc.status(), "ok");
});

test("concurrent edits remain intact and the normal sync button never overwrites them", async () => {
  const data = fixture();
  const server = makeServer(data);
  const pc = browser(server, { initial: data, baseline: data });
  const phone = browser(server, { initial: data, baseline: data });
  await start(pc);
  await start(phone);
  pc.edit((s) => {
    s.stock.white[18] = 45;
  });
  phone.edit((s) => {
    s.stock.white[18] = 40;
  });
  await pc.advance(800);
  await phone.advance(800);
  assert.equal(phone.status(), "conflict");
  assert.equal(await phone.sync.saveNow(), false);
  await phone.advance(10_000);
  assert.equal(server.state.stock.white[18], 45);
  assert.equal(phone.state().stock.white[18], 40);
  assert.equal(await phone.sync.resolveCloudConflict("remote"), true);
  assert.equal(phone.state().stock.white[18], 45);
});

test("a second edit during a slow save is saved next and never marked fully synced early", async () => {
  const data = fixture();
  const server = makeServer(data);
  const pc = browser(server, { initial: data, baseline: data });
  await start(pc);
  const gate = deferred();
  server.beforeSave = async () => {
    await gate.promise;
  };
  pc.edit((s) => {
    s.stock.white[18] = 45;
  });
  await pc.advance(800);
  pc.edit((s) => {
    s.stock.black[18] = 20;
  });
  await pc.advance(800);
  gate.resolve();
  await settle();
  assert.equal(pc.status(), "syncing");
  await pc.advance(800);
  assert.deepEqual(server.state, pc.state());
  assert.equal(pc.status(), "ok");
  assert.equal(server.writes, 2);
});

test("an edit during a delayed download is never replaced by the incoming snapshot", async () => {
  const data = fixture();
  const server = makeServer(data);
  const phone = browser(server, { initial: data, baseline: data });
  await start(phone);
  server.state.stock.white[18] = 45;
  server.revision++;
  const gate = deferred();
  server.beforeLoad = () => gate.promise;
  phone.window.emit("focus");
  await settle();
  phone.edit((s) => {
    s.stock.white[18] = 40;
  });
  gate.resolve();
  await settle();
  assert.equal(phone.status(), "conflict");
  assert.equal(phone.state().stock.white[18], 40);
  assert.equal(server.state.stock.white[18], 45);
});

test("a lost save response recovers without duplicates or manual conflict resolution", async () => {
  const data = fixture();
  const server = makeServer(data);
  const pc = browser(server, { initial: data, baseline: data });
  await start(pc);
  server.afterSave = () => {
    server.afterSave = null;
    throw new Error("Lost response");
  };
  pc.edit((s) => {
    s.stock.white[18] = 45;
  });
  await pc.advance(800);
  assert.equal(pc.status(), "error");
  await pc.advance(5_000);
  assert.equal(pc.status(), "ok");
  assert.deepEqual(pc.state(), server.state);
  assert.equal(server.writes, 1);
});

test("equal-content revision changes between GET and POST do not create a conflict", async () => {
  const data = fixture();
  const server = makeServer(data);
  const pc = browser(server, { initial: data, baseline: data });
  await start(pc);
  server.beforeSave = () => {
    server.beforeSave = null;
    server.revision++;
  };
  pc.edit((s) => {
    s.stock.white[18] = 45;
  });
  await pc.advance(800);
  assert.equal(pc.status(), "ok");
  assert.equal(server.state.stock.white[18], 45);
});

test("a true concurrent write between GET and POST is protected by server revision", async () => {
  const data = fixture();
  const server = makeServer(data);
  const pc = browser(server, { initial: data, baseline: data });
  await start(pc);
  server.beforeSave = () => {
    server.beforeSave = null;
    server.state.stock.white[18] = 40;
    server.revision++;
  };
  pc.edit((s) => {
    s.stock.white[18] = 45;
  });
  await pc.advance(800);
  assert.equal(pc.status(), "conflict");
  assert.equal(server.state.stock.white[18], 40);
  assert.equal(pc.state().stock.white[18], 45);
});

test("tabs sharing localStorage retain separate in-memory sync baselines", async () => {
  const data = fixture();
  const storage = new Map();
  const server = makeServer(data);
  const tab1 = browser(server, { initial: data, baseline: data, storage });
  const tab2 = browser(server, { initial: data, baseline: data, storage });
  await start(tab1);
  await start(tab2);
  tab1.edit((s) => {
    s.stock.white[18] = 45;
  });
  await tab1.advance(800);
  await tab2.advance(5_000);
  assert.equal(tab2.state().stock.white[18], 45);
  assert.equal(server.state.stock.white[18], 45);
  assert.equal(server.writes, 1);
});

test("hydration completes before syncing and unmount removes all triggers", async () => {
  const data = fixture();
  const server = makeServer(data);
  const pc = browser(server, { initial: data, baseline: data, hydrated: false });
  const stop = await start(pc);
  await pc.advance(5_000);
  assert.equal(server.reads, 0);
  pc.hydrate();
  await settle();
  assert.equal(pc.status(), "ok");
  stop();
  const reads = server.reads;
  pc.window.emit("focus");
  pc.window.emit("online");
  pc.document.emit("visibilitychange");
  await pc.advance(20_000);
  assert.equal(server.reads, reads);
});

test("a response from an unmounted sync run cannot apply state after restart", async () => {
  const data = fixture();
  const server = makeServer(data);
  const pc = browser(server, { initial: data, baseline: data });
  const gate = deferred();
  server.beforeLoad = () => gate.promise;
  const stop = pc.sync.startCloudSync();
  await settle();
  stop();
  pc.sync.startCloudSync();
  gate.resolve();
  await settle();
  assert.equal(pc.status(), "ok");
  assert.equal(server.writes, 0);
});

test("explicit local choice cannot overwrite a newer version than the one offered", async () => {
  const data = fixture();
  const local = clone(data);
  local.stock.white[18] = 20;
  const server = makeServer(data);
  const pc = browser(server, { initial: local });
  await start(pc);
  server.state.stock.white[18] = 30;
  server.revision++;
  assert.equal(await pc.sync.resolveCloudConflict("local"), false);
  assert.equal(server.state.stock.white[18], 30);
  assert.equal(pc.state().stock.white[18], 20);
  assert.equal(await pc.sync.resolveCloudConflict("local"), true);
  assert.equal(server.state.stock.white[18], 20);
});

test("a lost response followed by another local edit recovers using the attempted write", async () => {
  const data = fixture();
  const server = makeServer(data);
  const pc = browser(server, { initial: data, baseline: data });
  await start(pc);
  server.afterSave = () => {
    server.afterSave = null;
    throw new Error("Lost response");
  };
  pc.edit((s) => {
    s.stock.white[18] = 45;
  });
  await pc.advance(800);
  pc.edit((s) => {
    s.stock.black[18] = 20;
  });
  await pc.advance(800);
  assert.equal(pc.status(), "ok");
  assert.deepEqual(server.state, pc.state());
  assert.equal(server.writes, 2);
});

test("remounting a stale tab cannot turn another tab's checkpoint into an overwrite", async () => {
  const data = fixture();
  const storage = new Map();
  const server = makeServer(data);
  const tab1 = browser(server, { initial: data, baseline: data, storage });
  const tab2 = browser(server, { initial: data, baseline: data, storage });
  await start(tab1);
  const stop = await start(tab2);
  tab1.edit((s) => {
    s.stock.white[18] = 45;
  });
  await tab1.advance(800);
  stop();
  await start(tab2);
  assert.equal(tab2.state().stock.white[18], 45);
  assert.equal(server.state.stock.white[18], 45);
  assert.equal(server.writes, 1);
});

test("overlapping refresh signals during a slow network request are coalesced", async () => {
  const data = fixture();
  const server = makeServer(data);
  const pc = browser(server, { initial: data, baseline: data });
  await start(pc);
  const gate = deferred();
  server.beforeLoad = () => gate.promise;
  const reads = server.reads;
  pc.window.emit("focus");
  pc.window.emit("pageshow");
  pc.document.emit("visibilitychange");
  await pc.advance(15_000);
  assert.equal(server.reads, reads + 1);
  gate.resolve();
  await settle();
  assert.equal(pc.status(), "ok");
});

test("an initial network failure retries automatically and preserves local edits", async () => {
  const data = fixture();
  const server = makeServer(data);
  const pc = browser(server, { initial: data, baseline: data });
  server.beforeLoad = () => {
    server.beforeLoad = null;
    throw new Error("Temporary network failure");
  };
  await start(pc);
  assert.equal(pc.status(), "error");
  pc.edit((s) => {
    s.stock.white[18] = 45;
  });
  await pc.advance(5_000);
  assert.equal(pc.status(), "ok");
  assert.equal(server.state.stock.white[18], 45);
});
