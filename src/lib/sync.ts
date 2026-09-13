import { create } from "zustand";
import { SEED } from "@/lib/seed";
import { snapshotOf, useWarehouse } from "@/lib/store";
import { loadWarehouse, saveWarehouse } from "@/lib/warehouse.functions";
import type { WarehouseState } from "@/lib/types";

const REVISION_KEY = "cheshki_cloud_revision_v2";
const SYNCED_STATE_KEY = "cheshki_cloud_synced_state_v2";
const POLL_MS = 30_000;

export type CloudStatus = "idle" | "syncing" | "ok" | "error" | "offline" | "conflict";

type SyncStore = {
  status: CloudStatus;
  lastOk: string | null;
  error: string | null;
  conflict: boolean;
};

type RemoteSnapshot = {
  state: WarehouseState;
  updatedAt: string | null;
  revision: number;
};

export const useCloud = create<SyncStore>(() => ({
  status: "idle",
  lastOk: null,
  error: null,
  conflict: false,
}));

function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* The in-memory sync baseline still works when storage is unavailable. */
  }
}

function stateJson(state: WarehouseState): string {
  // PostgreSQL jsonb reorders object keys, including objects inside arrays.
  // Compare values canonically; retain array order and every financial field.
  return JSON.stringify(snapshotOf(state), (_key, value) =>
    value && typeof value === "object" && !Array.isArray(value)
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((key) => [key, value[key]]),
        )
      : value,
  );
}

function readSyncedJson(): string | null {
  try {
    const stored = readStorage(SYNCED_STATE_KEY);
    // Migrate the old, non-canonical checkpoint without changing user data.
    return stored === null ? null : stateJson(JSON.parse(stored));
  } catch {
    return null;
  }
}

let started = false;
let hydrated = false;
let applying = false;
let generation = 0;
// Keep this tab's own common ancestor. Another tab can update localStorage
// while this tab still has an older in-memory warehouse.
let syncedJson: string | null = null;
let baselineInitialized = false;
let unconfirmedWriteJson: string | null = null;
let pendingRemote: RemoteSnapshot | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;
let operationQueue: Promise<void> = Promise.resolve();
let queuedSync: Promise<void> | null = null;

function isActive(run: number): boolean {
  return started && run === generation;
}

function rememberSynced(state: WarehouseState, revision: number, updatedAt: string | null): void {
  syncedJson = stateJson(state);
  unconfirmedWriteJson = null;
  writeStorage(REVISION_KEY, String(revision));
  writeStorage(SYNCED_STATE_KEY, syncedJson);
  pendingRemote = null;
  const dirty = stateJson(useWarehouse.getState()) !== syncedJson;
  useCloud.setState({
    status: dirty ? "syncing" : "ok",
    lastOk: updatedAt ?? new Date().toISOString(),
    error: null,
    conflict: false,
  });
  // An edit made while a save was in flight must get its own later save.
  if (dirty) scheduleSync();
}

function markConflict(remote: RemoteSnapshot): void {
  pendingRemote = remote;
  useCloud.setState({
    status: "conflict",
    error: "Данные изменены и на этом устройстве, и в облаке. Выберите версию.",
    conflict: true,
  });
}

function reportError(error: unknown): void {
  useCloud.setState({
    status: typeof navigator !== "undefined" && !navigator.onLine ? "offline" : "error",
    error: error instanceof Error ? error.message : "Не удалось синхронизировать данные",
    conflict: pendingRemote !== null,
  });
}

function applyRemote(remote: RemoteSnapshot): void {
  applying = true;
  try {
    if (!useWarehouse.getState().importState(remote.state))
      throw new Error("Облачные данные повреждены");
    rememberSynced(snapshotOf(useWarehouse.getState()), remote.revision, remote.updatedAt);
  } finally {
    applying = false;
  }
}

async function reconcile(remote: RemoteSnapshot, run: number, attempts = 0): Promise<void> {
  // Read local state AFTER the network request; the user may have edited it.
  const local = snapshotOf(useWarehouse.getState());
  const localJson = stateJson(local);
  const remoteJson = stateJson(remote.state);
  if (remoteJson === unconfirmedWriteJson) {
    // The server committed our write but its response was lost. This remains
    // a known ancestor even if the user has already made another local edit.
    syncedJson = remoteJson;
    unconfirmedWriteJson = null;
  }
  if (localJson === remoteJson) {
    rememberSynced(local, remote.revision, remote.updatedAt);
  } else if (localJson === syncedJson || (syncedJson === null && localJson === stateJson(SEED))) {
    applyRemote(remote);
  } else if (syncedJson !== null && remoteJson === syncedJson) {
    await writeSnapshot(local, remote.revision, run, attempts);
  } else {
    // Never select a nonempty unknown snapshot by size, record count or device.
    // Genuine concurrent business edits require a decision, not lost updates.
    markConflict(remote);
  }
}

async function writeSnapshot(
  state: WarehouseState,
  baseRevision: number,
  run: number,
  attempts = 0,
  explicitChoice = false,
): Promise<void> {
  useCloud.setState({ status: "syncing", error: null });
  unconfirmedWriteJson = stateJson(state);
  const result = await saveWarehouse({ data: { state, baseRevision } });
  if (!isActive(run)) return;
  if (!result.conflict) {
    rememberSynced(state, result.revision, result.updatedAt);
    return;
  }
  if (!result.state) throw new Error("Не удалось прочитать конфликтующую версию облака");
  const remote: RemoteSnapshot = {
    state: result.state,
    updatedAt: result.updatedAt,
    revision: result.revision,
  };
  if (explicitChoice) {
    // Someone saved after the displayed conflict. Do not overwrite their work
    // using a newly fetched revision without another explicit decision.
    markConflict(remote);
  } else if (attempts < 2) {
    // A revision bump with equal content (or our save whose response was lost)
    // is not a business conflict. Reconcile against the actual server payload.
    await reconcile(remote, run, attempts + 1);
  } else {
    throw new Error("Облако обновляется. Повторим синхронизацию автоматически.");
  }
}

async function performSync(run: number): Promise<void> {
  if (!isActive(run) || !hydrated) return;
  if (navigator.onLine === false) {
    useCloud.setState({ status: "offline" });
    return;
  }
  try {
    // Quiet polling must not flash “syncing” every thirty seconds.
    if (!pendingRemote && useCloud.getState().status !== "ok")
      useCloud.setState({ status: "syncing", error: null });
    const loaded = await loadWarehouse();
    if (!isActive(run)) return;
    if (!loaded.state) {
      await writeSnapshot(snapshotOf(useWarehouse.getState()), 0, run);
    } else {
      await reconcile({ ...loaded, state: loaded.state }, run);
    }
  } catch (error) {
    if (isActive(run)) reportError(error);
  }
}

function enqueue(operation: () => Promise<void>): Promise<void> {
  const next = operationQueue.catch(() => undefined).then(operation);
  operationQueue = next;
  return next;
}

function sync(): Promise<void> {
  if (!started || !hydrated) return Promise.resolve();
  // Coalesce focus, pageshow and interval events during a slow request.
  if (queuedSync) return queuedSync;
  const run = generation;
  const task = enqueue(() => performSync(run));
  queuedSync = task;
  void task.finally(() => {
    if (queuedSync === task) queuedSync = null;
  });
  return task;
}

function scheduleSync(): void {
  if (applying || !started || !hydrated || pendingRemote) return;
  useCloud.setState({ status: navigator.onLine ? "syncing" : "offline", error: null });
  clearTimeout(timer);
  timer = setTimeout(() => void sync(), 800);
}

export function startCloudSync(): () => void {
  if (started || typeof window === "undefined") return () => undefined;
  started = true;
  hydrated = false;
  const run = ++generation;
  pendingRemote = null;
  useCloud.setState({ status: "idle", error: null, conflict: false });

  const boot = () => {
    if (!isActive(run) || hydrated) return;
    // A React remount is not a page reload. Preserve this tab's ancestor even
    // if another open tab has since written a newer localStorage checkpoint.
    if (!baselineInitialized) {
      syncedJson = readSyncedJson();
      baselineInitialized = true;
    }
    hydrated = true;
    void sync();
  };
  const persistApi = useWarehouse.persist;
  const unsubscribeHydration = persistApi.onFinishHydration(boot);
  const unsubscribeStore = useWarehouse.subscribe(() => scheduleSync());
  if (persistApi.hasHydrated()) boot();

  const refresh = () => {
    if (document.visibilityState !== "hidden") void sync();
  };
  const offline = () => useCloud.setState({ status: "offline" });
  const flush = () => {
    // Best effort before backgrounding; unsaved data stays in localStorage.
    if (document.visibilityState === "hidden") void sync();
    else refresh();
  };
  const interval = setInterval(refresh, POLL_MS);
  window.addEventListener("offline", offline);
  window.addEventListener("online", refresh);
  window.addEventListener("focus", refresh);
  window.addEventListener("pageshow", refresh);
  document.addEventListener("visibilitychange", flush);

  return () => {
    if (!isActive(run)) return;
    started = false;
    hydrated = false;
    generation++;
    queuedSync = null;
    clearTimeout(timer);
    clearInterval(interval);
    unsubscribeHydration();
    unsubscribeStore();
    window.removeEventListener("offline", offline);
    window.removeEventListener("online", refresh);
    window.removeEventListener("focus", refresh);
    window.removeEventListener("pageshow", refresh);
    document.removeEventListener("visibilitychange", flush);
  };
}

export async function saveNow(): Promise<boolean> {
  // The normal button always reconciles first; it is not “force overwrite”.
  await sync();
  return useCloud.getState().status === "ok";
}

export async function resolveCloudConflict(choice: "local" | "remote"): Promise<boolean> {
  const selected = pendingRemote;
  const run = generation;
  if (!selected) return saveNow();
  await enqueue(async () => {
    if (!isActive(run)) return;
    try {
      if (navigator.onLine === false) {
        useCloud.setState({ status: "offline" });
        return;
      }
      if (choice === "local") {
        await writeSnapshot(snapshotOf(useWarehouse.getState()), selected.revision, run, 0, true);
      } else {
        const before = stateJson(useWarehouse.getState());
        const loaded = await loadWarehouse();
        if (!isActive(run)) return;
        if (!loaded.state) throw new Error("Облачная версия недоступна");
        const remote = { ...loaded, state: loaded.state };
        if (stateJson(useWarehouse.getState()) !== before) markConflict(remote);
        else applyRemote(remote);
      }
    } catch (error) {
      if (isActive(run)) reportError(error);
    }
  });
  return useCloud.getState().status === "ok";
}

export function cloudLabel(status: CloudStatus): string {
  if (status === "ok") return "Облако сохранено";
  if (status === "syncing") return "Синхронизация…";
  if (status === "offline") return "Нет сети";
  if (status === "conflict") return "Нужно выбрать версию";
  if (status === "error") return "Ошибка облака";
  return "Облако";
}
