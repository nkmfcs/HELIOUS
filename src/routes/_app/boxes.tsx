import { createFileRoute } from "@tanstack/react-router";
import { ColorPills } from "@/components/color-pills";
import { Group, SectionLabel } from "@/components/ui/card";
import { BOX_IDS, boxOf, sizesInBox, type BoxId } from "@/lib/boxes";
import { colorLabel, formatNum } from "@/lib/format";
import { useWarehouse } from "@/lib/store";
import { COLORS, SIZES, type Color } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useState } from "react";

export const Route = createFileRoute("/_app/boxes")({ component: BoxesPage });

function BoxesPage() {
  const stock = useWarehouse((s) => s.stock);
  const boxes = useWarehouse((s) => s.boxes);
  const setBox = useWarehouse((s) => s.setBox);
  const [color, setColor] = useState<Color>("white");

  return (
    <div className="space-y-7">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Коробки</h1>
        <p className="mt-1 text-sm text-muted">Откуда брать и куда класть. #1 — то, что не вспомнил.</p>
      </div>

      <div className="space-y-3">
        {BOX_IDS.map((box) => {
          const parts = COLORS.map((c) => {
            const sizes = sizesInBox(boxes, box, c);
            const pairs = sizes.reduce((n, s) => n + (stock[c][s] ?? 0), 0);
            return { c, sizes, pairs };
          }).filter((p) => p.sizes.length > 0);
          const total = parts.reduce((n, p) => n + p.pairs, 0);
          return (
            <Group key={box}>
              <div className="flex items-baseline justify-between px-4 pb-2 pt-4">
                <div className="text-lg font-semibold">#{box}</div>
                <div className="text-sm text-muted">{formatNum(total)} пар</div>
              </div>
              {parts.length === 0 ? (
                <p className="px-4 pb-4 text-sm text-subtle">Пусто</p>
              ) : (
                <div className="divide-y divide-border">
                  {parts.map((p) => (
                    <div key={p.c} className="px-4 py-3">
                      <div className="text-xs text-muted">{colorLabel(p.c)}</div>
                      <div className="mt-1 text-sm font-medium">{p.sizes.join(" · ")}</div>
                      <div className="mt-0.5 text-xs text-subtle">{formatNum(p.pairs)} пар</div>
                    </div>
                  ))}
                </div>
              )}
            </Group>
          );
        })}
      </div>

      <section>
        <SectionLabel>Переложить размер</SectionLabel>
        <ColorPills value={color} onChange={setColor} />
        <Group className="mt-3">
          {SIZES.map((size, i) => {
            const current = boxOf(boxes, color, size);
            return (
              <div key={size}>
                {i > 0 ? <div className="ml-4 h-px bg-border" /> : null}
                <div className="flex items-center gap-3 px-4 py-2.5">
                  <div className="w-10 text-sm font-medium">{size}</div>
                  <div className="flex flex-1 justify-end gap-1">
                    {BOX_IDS.map((box) => (
                      <button
                        key={box}
                        type="button"
                        onClick={() => setBox(color, size, box)}
                        className={cn(
                          "h-9 min-w-9 rounded-sm text-xs font-semibold",
                          current === box ? "bg-accent text-accent-fg" : "bg-bg text-muted",
                        )}
                      >
                        {box}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </Group>
      </section>
    </div>
  );
}
