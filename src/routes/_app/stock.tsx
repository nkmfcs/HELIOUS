import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { BoxBadge } from "@/components/box-badge";
import { ColorPills } from "@/components/color-pills";
import { boxOf, groupItemsByBox } from "@/lib/boxes";
import { QtyStepper } from "@/components/qty-stepper";
import { Button } from "@/components/ui/button";
import { Card, Stat } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { colorLabel, formatDate, formatNum, stockTotal, emptySizeMap } from "@/lib/format";
import { useWarehouse } from "@/lib/store";
import { PACK, SIZES, type Color } from "@/lib/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/stock")({ component: StockPage });

function StockPage() {
  const stock = useWarehouse((s) => s.stock);
  const threshold = useWarehouse((s) => s.lowThreshold);
  const changeStock = useWarehouse((s) => s.changeStock);
  const addIncoming = useWarehouse((s) => s.addIncoming);
  const incoming = useWarehouse((s) => s.incoming);
  const boxes = useWarehouse((s) => s.boxes);
  const [color, setColor] = useState<Color>("white");
  const [incomingOpen, setIncomingOpen] = useState(false);
  const [inc, setInc] = useState(emptySizeMap());
  const [note, setNote] = useState("");

  const data = stock[color];
  const total = stockTotal(data);
  const incTotal = Object.values(inc).reduce((a, b) => a + b, 0);
  const incItems = SIZES.filter((s) => (inc[s] ?? 0) > 0).map((size) => ({
    color,
    size,
    qty: inc[size] ?? 0,
  }));
  const incByBox = groupItemsByBox(boxes, incItems);

  const rows = useMemo(
    () =>
      SIZES.map((size) => {
        const pairs = data[size] ?? 0;
        return { size, pairs, packs: Math.floor(pairs / PACK) };
      }),
    [data],
  );

  function confirmIncoming() {
    if (incTotal === 0) {
      toast("Ничего не выбрано");
      return;
    }
    addIncoming(color, inc, note);
    setInc(emptySizeMap());
    setNote("");
    setIncomingOpen(false);
    toast(`+${incTotal} пар (${colorLabel(color)})`);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Склад</h1>
          <p className="mt-1 text-sm text-muted">Учёт по 5 пар</p>
        </div>
        <Button variant="secondary" onClick={() => setIncomingOpen((v) => !v)}>
          Приход
        </Button>
      </div>

      <ColorPills value={color} onChange={setColor} />

      <div className="grid grid-cols-2 gap-3">
        <Stat label="Пар" value={formatNum(total)} />
        <Stat label="Упаковок" value={formatNum(Math.floor(total / PACK))} />
      </div>

      {incomingOpen ? (
        <Card className="space-y-4 p-4">
          <div>
            <h2 className="text-sm font-medium">Приход · {colorLabel(color)}</h2>
            <p className="text-xs text-muted">Нажмите +5 по размерам, затем подтвердите.</p>
          </div>
          <div className="space-y-1">
            {SIZES.map((size) => (
              <div key={size} className="flex items-center justify-between py-1">
                <span className="flex items-center gap-2 text-sm">
                  <span className="w-10">р.{size}</span>
                  <BoxBadge box={boxOf(boxes, color, size)} />
                </span>
                <QtyStepper
                  compact
                  value={inc[size] ?? 0}
                  onChange={(v) => setInc((prev) => ({ ...prev, [size]: v }))}
                />
              </div>
            ))}
          </div>
          <div>
            <Label htmlFor="inc-note">Заметка</Label>
            <Input id="inc-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Партия, поставщик…" />
          </div>
          {incByBox.length > 0 ? (
            <div className="rounded-md bg-bg px-3 py-2 text-sm">
              <div className="mb-1 text-xs text-muted">Куда класть</div>
              {incByBox.map((g) => (
                <div key={g.box}>
                  #{g.box}: {g.items.map((i) => `${i.size}×${i.qty}`).join(" · ")}
                </div>
              ))}
            </div>
          ) : null}
          <Button className="w-full" onClick={confirmIncoming}>
            Добавить {incTotal > 0 ? `${incTotal} пар` : ""}
          </Button>
        </Card>
      ) : null}

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-xs uppercase tracking-wide text-subtle">
              <th className="px-4 py-3 text-left font-medium">Размер</th>
              <th className="px-2 py-3 text-center font-medium">Кор.</th>
              <th className="px-2 py-3 text-center font-medium">Пар</th>
              <th className="px-2 py-3 text-center font-medium">Уп</th>
              <th className="px-3 py-3 text-right font-medium">±5</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.size}
                className={cn(
                  "border-t border-border/70",
                  r.pairs === 0 ? "bg-danger-bg/40" : r.pairs < threshold ? "bg-warn-bg/30" : "",
                )}
              >
                <td className="px-4 py-2 font-medium">{r.size}</td>
                <td className="px-2 py-2 text-center">
                  <BoxBadge box={boxOf(boxes, color, r.size)} />
                </td>
                <td
                  className={cn(
                    "px-2 py-2 text-center font-mono tabular",
                    r.pairs === 0 ? "font-medium text-danger" : r.pairs < 10 ? "text-warn" : "",
                  )}
                >
                  {r.pairs}
                </td>
                <td className="px-2 py-2 text-center text-muted">{r.packs}</td>
                <td className="px-2 py-1.5 text-right">
                  <QtyStepper compact value={r.pairs} onChange={(v) => changeStock(color, r.size, v - r.pairs)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {incoming.length > 0 ? (
        <section>
          <h2 className="mb-3 text-sm font-medium">Последний приход</h2>
          <Card className="divide-y divide-border">
            {[...incoming]
              .slice(-6)
              .reverse()
              .map((row) => (
                <div key={row.id} className="flex items-start justify-between gap-3 px-4 py-3 text-sm">
                  <div>
                    <div className="font-medium">
                      {colorLabel(row.color)} · {row.totalPairs} пар
                    </div>
                    <div className="text-xs text-muted">
                      {formatDate(row.date)}
                      {row.note ? ` · ${row.note}` : ""}
                    </div>
                  </div>
                  <div className="max-w-[50%] text-right text-xs text-subtle">
                    {row.items
                      .slice(0, 4)
                      .map((i) => `${i.size}×${i.qty}`)
                      .join(" · ")}
                    {row.items.length > 4 ? "…" : ""}
                  </div>
                </div>
              ))}
          </Card>
        </section>
      ) : null}
    </div>
  );
}
