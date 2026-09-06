import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, Stat } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { colorLabel, formatNum } from "@/lib/format";
import { BoxBadge } from "@/components/box-badge";
import { boxOf } from "@/lib/boxes";
import { useWarehouse } from "@/lib/store";
import { lowStock } from "@/lib/stats";
import { COLORS, PACK } from "@/lib/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/preorder")({ component: PreorderPage });

function PreorderPage() {
  const state = useWarehouse();
  const setLowThreshold = useWarehouse((s) => s.setLowThreshold);
  const rows = lowStock(state);
  const need = rows.reduce((s, r) => s + r.need, 0);
  const clientMissing = state.orders
    .filter((o) => o.status === "shipped" && o.missing.length > 0)
    .flatMap((o) => {
      const client = state.clients.find((c) => c.id === o.clientId);
      return o.missing.map((m) => ({ ...m, client: client ? `${client.name} ${client.shop}`.trim() : "Клиент", date: o.date }));
    });

  function copyList() {
    if (!rows.length) {
      toast("Нет низких остатков");
      return;
    }
    let text = `ПРЕДЗАКАЗ (остаток < ${state.lowThreshold})\n================\n`;
    for (const c of COLORS) {
      const part = rows.filter((r) => r.color === c);
      text += `\n${colorLabel(c).toUpperCase()}:\n`;
      if (!part.length) text += "  всё в норме\n";
      else text += part.map((r) => `  р.${r.size}: ${r.pairs} (нужно +${r.need})`).join("\n") + "\n";
    }
    text += `\nДошить: ${need} пар`;
    if (clientMissing.length) {
      text += "\n\nНЕ СОБРАЛИ КЛИЕНТАМ:\n";
      text += clientMissing.map((m) => `  ${m.client}: ${colorLabel(m.color)} р.${m.size} × ${m.qty}`).join("\n");
    }
    void navigator.clipboard.writeText(text).then(
      () => toast("Список скопирован"),
      () => toast("Не удалось скопировать"),
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Предзаказ</h1>
        <p className="mt-1 text-sm text-muted">Что шить на склад и что обещали клиентам, но не отдали.</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Stat label="Позиций ниже порога" value={String(rows.length)} />
        <Stat label="Нужно дошить" value={formatNum(need)} tone="warn" />
      </div>

      <Card className="flex items-end gap-3 p-4">
        <div className="flex-1">
          <Label>Порог (пар)</Label>
          <Input
            type="number"
            value={state.lowThreshold}
            onChange={(e) => setLowThreshold(Number(e.target.value) || 0)}
          />
        </div>
        <Button variant="secondary" onClick={copyList}>
          Скопировать список
        </Button>
      </Card>

      {COLORS.map((c) => {
        const part = rows.filter((r) => r.color === c);
        return (
          <Card key={c} className="overflow-hidden">
            <div className="border-b border-border px-4 py-3 text-sm font-medium">{colorLabel(c)}</div>
            {part.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-muted">Всё ≥ {state.lowThreshold}</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs uppercase tracking-wide text-subtle">
                    <th className="px-4 py-2 text-left font-medium">Размер</th>
                    <th className="px-2 py-2 text-center font-medium">Кор.</th>
                    <th className="px-2 py-2 text-center font-medium">Остаток</th>
                    <th className="px-2 py-2 text-center font-medium">Уп</th>
                    <th className="px-4 py-2 text-right font-medium">Нужно +</th>
                  </tr>
                </thead>
                <tbody>
                  {part.map((r) => (
                    <tr
                      key={r.size}
                      className={cn("border-t border-border/70", r.pairs === 0 ? "bg-danger-bg/40" : "bg-warn-bg/20")}
                    >
                      <td className="px-4 py-2">{r.size}</td>
                      <td className="px-2 py-2 text-center">
                        <BoxBadge box={boxOf(state.boxes, r.color, r.size)} />
                      </td>
                      <td className={cn("px-2 py-2 text-center font-mono", r.pairs === 0 ? "text-danger" : "text-warn")}>
                        {r.pairs}
                      </td>
                      <td className="px-2 py-2 text-center text-muted">{Math.floor(r.pairs / PACK)}</td>
                      <td className="px-4 py-2 text-right font-mono text-danger">+{r.need}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        );
      })}

      <section>
        <h2 className="mb-3 text-sm font-medium">Не отдали клиентам</h2>
        {clientMissing.length === 0 ? (
          <p className="text-sm text-muted">Долгов по размерам нет</p>
        ) : (
          <Card className="divide-y divide-border">
            {clientMissing.map((m, i) => (
              <div key={i} className="flex justify-between px-4 py-3 text-sm">
                <span>
                  {m.client}
                  <span className="text-muted">
                    {" "}
                    · {colorLabel(m.color)} р.{m.size} <BoxBadge box={boxOf(state.boxes, m.color, m.size)} />
                  </span>
                </span>
                <span className="text-warn">{m.qty} пар</span>
              </div>
            ))}
          </Card>
        )}
      </section>
    </div>
  );
}
