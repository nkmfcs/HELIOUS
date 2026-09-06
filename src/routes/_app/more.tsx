import { createFileRoute, Link } from "@tanstack/react-router";
import { Archive, BarChart3, Cloud, HardHat, RefreshCw, Scissors, Settings2, Wallet } from "lucide-react";
import { toast } from "sonner";
import { Group } from "@/components/ui/card";
import { cloudLabel, saveNow, useCloud } from "@/lib/sync";
import { useWarehouse } from "@/lib/store";

export const Route = createFileRoute("/_app/more")({ component: MorePage });

const LINKS = [
  { to: "/boxes" as const, title: "Коробки", desc: "Где какой размер лежит", icon: Archive },
  { to: "/cash" as const, title: "Касса", desc: "Материал, работники, снятие, баланс", icon: Wallet },
  { to: "/workers" as const, title: "Работники", desc: "Швеи, крой, упаковка", icon: HardHat },
  { to: "/preorder" as const, title: "Предзаказ", desc: "Что шить и что не отдали клиентам", icon: Scissors },
  { to: "/reports" as const, title: "Отчёты", desc: "День, месяц, график, клиенты", icon: BarChart3 },
  { to: "/finance" as const, title: "Финансы", desc: "Себестоимость, долги, копия данных", icon: Settings2 },
];

function MorePage() {
  const cloud = useCloud();
  const loadOfficial = useWarehouse((s) => s.loadOfficial);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Ещё</h1>
        <p className="mt-1 text-sm text-muted">Предзаказ, отчётность и настройки.</p>
      </div>

      <Group>
        <button
          type="button"
          onClick={() => {
            loadOfficial();
            void saveNow();
            toast("Загружен актуальный склад");
          }}
          className="flex w-full items-center gap-3 px-4 py-3.5 text-left"
        >
          <span className="grid size-9 place-items-center rounded-md bg-bg">
            <RefreshCw className="size-4" />
          </span>
          <div>
            <div className="text-sm font-medium">Загрузить актуальный склад</div>
            <div className="text-xs text-muted">Если на телефоне старые цифры — нажми. Касса не сотрётся.</div>
          </div>
        </button>
        <div className="ml-4 h-px bg-border" />
        <button type="button" onClick={() => void saveNow()} className="flex w-full items-center gap-3 px-4 py-3.5 text-left">
          <span className="grid size-9 place-items-center rounded-md bg-bg">
            <Cloud className="size-4" />
          </span>
          <div>
            <div className="text-sm font-medium">{cloudLabel(cloud.status)}</div>
            <div className="text-xs text-muted">
              {cloud.error
                ? cloud.error
                : "Телефон и компьютер видят один склад. Нажми, чтобы сохранить сейчас."}
            </div>
          </div>
        </button>
      </Group>

      <Group>
        {LINKS.map((l, i) => {
          const Icon = l.icon;
          return (
            <div key={l.to}>
              {i > 0 ? <div className="ml-4 h-px bg-border" /> : null}
              <Link to={l.to} className="flex items-center gap-3 px-4 py-3.5">
                <span className="grid size-9 place-items-center rounded-md bg-bg">
                  <Icon className="size-4" />
                </span>
                <div>
                  <div className="text-sm font-medium">{l.title}</div>
                  <div className="text-xs text-muted">{l.desc}</div>
                </div>
              </Link>
            </div>
          );
        })}
      </Group>
    </div>
  );
}
