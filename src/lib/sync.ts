import { create } from "zustand";
import { snapshotOf, useWarehouse } from "@/lib/store";
import { loadWarehouse, saveWarehouse } from "@/lib/warehouse.functions";
import type { WarehouseState } from "@/lib/types";

const REVISION_KEY = "cheshki_cloud_revision_v2";
const SYNCED_STATE_KEY = "cheshki_cloud_synced_state_v2";

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
    /* storage unavailable */
  }
}

function stateJson(state: WarehouseState): string {
  return JSON.stringify(snapshotOf(state));
}

let started = false;
let applying = false;
let pulledOnce = false;
let lastPushed = "";
let baseRevision = Number(readStorage(REVISION_KEY)) || 0;
let pendingRemote: RemoteSnapshot | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;
let operationQueue: Promise<void> = Promise.resolve();

function rememberSynced(state: WarehouseState, revision: number, updatedAt: string | null): void {
  const json = stateJson(state);
  baseRevision = revision;
  lastPushed = json;
  writeStorage(REVISION_KEY, String(revision));
  writeStorage(SYNCED_STATE_KEY, json);
  pendingRemote = null;
  useCloud.setState({
    status: "ok",
    lastOk: updatedAt ?? new Date().toISOString(),
    error: null,
    conflict: false,
  });
}

function markConflict(remote: RemoteSnapshot): void {
  pendingRemote = remote;
  useCloud.setState({
    status: "conflict",
    error: "Телефон и облако изменялись отдельно. Выберите, какую версию сохранить.",
    conflict: true,
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

async function performPull(): Promise<void> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    useCloud.setState({ status: "offline" });
    return;
  }
  try {
    useCloud.setState({ status: "syncing", error: null });
    const loaded = await loadWarehouse();
    const local = snapshotOf(useWarehouse.getState());
    if (!loaded.state) {
      baseRevision = 0;
      await performPush(true);
      return;
    }

    const remote: RemoteSnapshot = {
      state: loaded.state,
      updatedAt: loaded.updatedAt,
      revision: loaded.revision,
    };
    const localJson = stateJson(local);
    const remoteJson = stateJson(remote.state);
    if (localJson === remoteJson) {
      rememberSynced(local, remote.revision, remote.updatedAt);
      return;
    }

    const syncedJson = readStorage(SYNCED_STATE_KEY);
    if (syncedJson === null) {
      // The previous sync selected snapshots by record count. Without a known
      // common ancestor, choosing automatically could erase phone data.
      markConflict(remote);
      return;
    }

    const localChanged = localJson !== syncedJson;
    const remoteChanged = remoteJson !== syncedJson;
    if (localChanged && remoteChanged) {
      markConflict(remote);
      return;
    }
    if (localChanged) {
      baseRevision = remote.revision;
      await performPush(true);
      return;
    }

    applyRemote(remote);
  } catch (error) {
    useCloud.setState({
      status: typeof navigator !== "undefined" && !navigator.onLine ? "offline" : "error",
      error: error instanceof Error ? error.message : "Не сохранилось",
      conflict: false,
    });
  }
}

async function performPush(force = false): Promise<void> {
  if (applying) return;
  if (!pulledOnce && !force) return;
  if (pendingRemote && !force) return;
  const state = snapshotOf(useWarehouse.getState());
  const json = stateJson(state);
  if (!force && json === lastPushed) return;
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    useCloud.setState({ status: "offline" });
    return;
  }
  try {
    useCloud.setState({ status: "syncing", error: null });
    const result = await saveWarehouse({ data: { state, baseRevision } });
    if (result.conflict) {
      if (result.state) {
        markConflict({
          state: result.state,
          updatedAt: result.updatedAt,
          revision: result.revision,
        });
      } else {
        useCloud.setState({ status: "error", error: "Конфликт облачных данных", conflict: false });
      }
      return;
    }
    rememberSynced(state, result.revision, result.updatedAt);
  } catch (error) {
    useCloud.setState({
      status: typeof navigator !== "undefined" && !navigator.onLine ? "offline" : "error",
      error: error instanceof Error ? error.message : "Не сохранилось",
      conflict: false,
    });
  }
}

/**
 * Keep cloud reads and writes strictly ordered. Without this queue, a slow
 * first save and a second edit could send the same base revision twice and
 * manufacture a conflict even though both changes came from this one phone.
 */
function enqueue(operation: () => Promise<void>): Promise<void> {
  const next = operationQueue.catch(() => undefined).then(operation);
  operationQueue = next;
  return next;
}

function pull(): Promise<void> {
  return enqueue(performPull);
}

function push(force = false): Promise<void> {
  return enqueue(() => performPush(force));
}

function schedulePush(): void {
  if (applying || !pulledOnce || pendingRemote) return;
  clearTimeout(timer);
  timer = setTimeout(() => {
    void push();
  }, 800);
}

export function startCloudSync(): void {
  if (started || typeof window === "undefined") return;
  started = true;

  const persistApi = useWarehouse.persist;
  const boot = async () => {
    await pull();
    pulledOnce = true;
  };
  if (persistApi.hasHydrated()) void boot();
  else persistApi.onFinishHydration(() => void boot());

  useWarehouse.subscribe(() => schedulePush());
  window.addEventListener("offline", () => useCloud.setState({ status: "offline" }));
  window.addEventListener("online", () => {
    void pull();
  });
}

export async function saveNow(): Promise<boolean> {
  await push(true);
  return useCloud.getState().status === "ok";
}

export async function resolveCloudConflict(choice: "local" | "remote"): Promise<boolean> {
  try {
    const remote = pendingRemote;
    if (!remote) {
      await pull();
      return useCloud.getState().status === "ok";
    }
    if (choice === "remote") {
      applyRemote(remote);
      return true;
    }

    pendingRemote = null;
    baseRevision = remote.revision;
    await push(true);
    return useCloud.getState().status === "ok";
  } catch (error) {
    useCloud.setState({
      status: "error",
      error: error instanceof Error ? error.message : "Не удалось выбрать версию",
      conflict: false,
    });
    return false;
  }
}

export function cloudLabel(status: CloudStatus): string {
  if (status === "ok") return "Облако сохранено";
  if (status === "syncing") return "Синхронизация…";
  if (status === "offline") return "Нет сети";
  if (status === "conflict") return "Нужно выбрать версию";
  if (status === "error") return "Ошибка облака";
  return "Облако";
}
