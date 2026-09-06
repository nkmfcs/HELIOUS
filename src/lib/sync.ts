import { create } from "zustand";
import { snapshotOf, useWarehouse } from "@/lib/store";
import { loadWarehouse, saveWarehouse } from "@/lib/warehouse.functions";
import type { WarehouseState } from "@/lib/types";

const REV_KEY = "cheshki_cloud_rev";

export type CloudStatus = "idle" | "syncing" | "ok" | "error" | "offline";

type SyncStore = {
  status: CloudStatus;
  lastOk: string | null;
  error: string | null;
};

export const useCloud = create<SyncStore>(() => ({
  status: "idle",
  lastOk: null,
  error: null,
}));

function getRev() {
  try {
    return localStorage.getItem(REV_KEY) ?? "";
  } catch {
    return "";
  }
}

function setRev(value: string) {
  try {
    localStorage.setItem(REV_KEY, value);
  } catch {
    /* ignore */
  }
}

function newer(a: string | null | undefined, b: string | null | undefined) {
  if (!a) return false;
  if (!b) return true;
  return new Date(a).getTime() > new Date(b).getTime();
}

function richness(s: WarehouseState | null | undefined): number {
  if (!s?.orders) return 0;
  return (
    s.orders.length * 100 +
    (s.incoming?.length ?? 0) * 20 +
    (s.payments?.length ?? 0) * 10 +
    (s.cash?.length ?? 0) * 5 +
    (s.clients?.length ?? 0) * 8
  );
}

let started = false;
let applying = false;
let pulledOnce = false;
let lastPushed = "";
let timer: ReturnType<typeof setTimeout> | undefined;

async function pull() {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    useCloud.setState({ status: "offline" });
    return;
  }
  try {
    useCloud.setState({ status: "syncing" });
    const remote = await loadWarehouse();
    const local = snapshotOf(useWarehouse.getState());
    if (!remote.state) {
      await push(true);
      return;
    }
    const localR = richness(local);
    const remoteR = richness(remote.state);
    if (localR > remoteR) {
      await push(true);
      return;
    }
    if (remoteR > localR || newer(remote.updatedAt, getRev())) {
      applying = true;
      useWarehouse.getState().importState(remote.state);
      lastPushed = JSON.stringify(snapshotOf(useWarehouse.getState()));
      if (remote.updatedAt) setRev(remote.updatedAt);
      applying = false;
    }
    useCloud.setState({ status: "ok", lastOk: new Date().toISOString(), error: null });
  } catch (err) {
    useCloud.setState({
      status: typeof navigator !== "undefined" && !navigator.onLine ? "offline" : "error",
      error: err instanceof Error ? err.message : "Не сохранилось",
    });
  }
}

async function push(force = false) {
  if (applying) return;
  if (!pulledOnce && !force) return;
  const state = snapshotOf(useWarehouse.getState());
  const json = JSON.stringify(state);
  if (!force && json === lastPushed) return;
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    useCloud.setState({ status: "offline" });
    return;
  }
  try {
    const updatedAt = new Date().toISOString();
    const res = await saveWarehouse({ data: { state, updatedAt } });
    lastPushed = json;
    setRev(res.updatedAt);
    useCloud.setState({ status: "ok", lastOk: new Date().toISOString(), error: null });
  } catch (err) {
    useCloud.setState({
      status: typeof navigator !== "undefined" && !navigator.onLine ? "offline" : "error",
      error: err instanceof Error ? err.message : "Не сохранилось",
    });
  }
}

function schedulePush() {
  if (applying || !pulledOnce) return;
  clearTimeout(timer);
  timer = setTimeout(() => {
    void push();
  }, 800);
}

export function startCloudSync() {
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
}

export function saveNow() {
  void push(true);
}

export function cloudLabel(status: CloudStatus): string {
  if (status === "ok") return "Облако ок";
  if (status === "syncing") return "Синхрон…";
  if (status === "offline") return "Нет сети";
  if (status === "error") return "Облако ошибка";
  return "Облако";
}
