import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { COLORS, SIZES, type Color, type ProductionMove, type ProductionMoveInput, type ProductionMoveKind } from "@/lib/types";
import { colorLabel, formatNum, todayISO } from "@/lib/format";
import { useWarehouse } from "@/lib/store";
import { MOVE_LABELS, balanceItems, moveRoute, productionToken, remainingPlanItems, replayProduction, workerLocation } from "@/lib/production-moves";
import { itemKey } from "@/lib/production";

const total = (items: {qty:number}[]) => items.reduce((s,i)=>s+i.qty,0);
const initial = (): ProductionMoveInput => ({kind:"cut-in",items:[],date:todayISO(),note:""});
export function ProductionWorkerBalance({workerId}:{workerId:string}) {
  const moves = useWarehouse(s=>s.productionMoves);
  const {balances,error} = replayProduction(moves ?? []);
  const items = [...balanceItems(balances,workerLocation("sewing",workerId)),...balanceItems(balances,workerLocation("packaging",workerId))];
  return <Card className="space-y-2 p-4"><div className="flex justify-between"><h2 className="font-medium">На руках</h2><b>{formatNum(total(items))} пар</b></div>{error?<p className="text-danger">{error}</p>:items.length?<div className="flex flex-wrap gap-2">{items.map((item,i)=><span key={i} className="rounded-md bg-elevated px-2 py-1 text-sm">{colorLabel(item.color)} · р.{item.size} × {item.qty}</span>)}</div>:<p className="text-sm text-muted">Нет учтённых остатков</p>}<p className="text-xs text-muted">Выдача и приёмка — в разделе «Предзаказ».</p></Card>;
}
export function ProductionMovements() {
  const state = useWarehouse();
  const moves = state.productionMoves ?? [];
  const {balances,error} = replayProduction(moves);
  const [draft,setDraft] = useState<ProductionMoveInput>(initial);
  const [editing,setEditing] = useState<string>();
  const [color,setColor] = useState<Color>("white");
  const [pending,setPending] = useState<{input:ProductionMoveInput;token:string;id?:string}>();
  const [open,setOpen] = useState(false);
  const role = draft.kind==="cut-in"?"cutting":["cut-out","sewn-in"].includes(draft.kind)?"sewing":["pack-out","packed-in"].includes(draft.kind)?"packaging":null;
  const workerName = (id?:string) => state.workers.find(w=>w.id===id)?.name ?? "Не выбран";
  const locationName = (key:string) => key==="cut"?"Склад кроя":key==="sewn"?"После пошива":key==="packed"?"Упаковано · ждёт приёмки":key==="finished"?"Основной склад":key==="outside"?"Получение извне":workerName(key.split(":").slice(1).join(":"));
  const route = moveRoute(draft);
  const source = route?.[0];
  const planOptions = state.productionBatches.filter(b=>b.stage==="cutting"&&(remainingPlanItems(b,moves).length>0 || b.id===draft.planId));
  const available = source && source!=="outside" ? balanceItems(balances,source) : [];
  const locations = ["cut","sewn","packed",...state.workers.flatMap(w=>w.role==="sewing"||w.role==="packaging"?[workerLocation(w.role,w.id)]:[])];
  function qty(c:Color,size:number,value:number) {
    if (!Number.isSafeInteger(value)||value<0) return;
    setDraft(d=>({...d,items:[...d.items.filter(i=>i.color!==c||i.size!==size),...(value?[{color:c,size,qty:value}]:[])]}));
  }
  function edit(move:ProductionMove) {
    setDraft({kind:move.kind,items:move.items.map(i=>({...i})),workerId:move.workerId,planId:move.planId,openingTo:move.openingTo,date:move.date,note:move.note});
    setEditing(move.id);setOpen(true);setPending(undefined);
  }
  function save() {
    if (!pending) return;
    const err=state.confirmProductionMove(pending.input,pending.token,pending.id);
    if(err){toast.error(err);setPending(undefined);return;}
    toast.success("Операция подтверждена");
    setDraft(initial());setEditing(undefined);setPending(undefined);setOpen(false);
  }
  return <section className="space-y-3">
    <div className="flex items-center justify-between gap-2"><h2 className="text-xl font-semibold">Движение производства</h2><Button onClick={()=>{setDraft(initial());setEditing(undefined);setOpen(true)}}>+ Операция</Button></div>
    {error?<p className="text-danger">{error}</p>:null}
    <div className="grid grid-cols-2 gap-2">
      {locations.map(loc=>{const items=balanceItems(balances,loc);return <Card key={loc} className="p-3"><div className="text-xs text-muted">{locationName(loc)}</div><div className="text-lg font-semibold">{formatNum(total(items))} пар</div>{items.length>0&&<details className="mt-1"><summary className="text-xs text-muted">Цвета и размеры</summary><div className="mt-1 space-y-1">{items.map(i=><div key={itemKey(i)} className="text-xs">{colorLabel(i.color)} · {i.size} × {i.qty}</div>)}</div></details>}</Card>})}
      <Card className="p-3"><div className="text-xs text-muted">Основной склад</div><div className="text-lg font-semibold">{formatNum(COLORS.reduce((n,c)=>n+Object.values(state.stock[c]).reduce((a,b)=>a+b,0),0))} пар</div><p className="text-xs text-muted">Только после подтверждения</p></Card>
    </div>
    {open?<Card className="space-y-3 p-4">
      <h3 className="font-medium">{editing?"Исправить операцию":"Новая операция"}</h3>
      <select aria-label="Операция" value={draft.kind} onChange={e=>setDraft({...initial(),kind:e.target.value as ProductionMoveKind})} className="w-full rounded-md border border-border bg-surface p-2">{Object.entries(MOVE_LABELS).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select>
      {role?<select aria-label="Работник" value={draft.workerId??""} onChange={e=>setDraft(d=>({...d,workerId:e.target.value||undefined}))} className="w-full rounded-md border border-border bg-surface p-2"><option value="">Выбрать работника</option>{state.workers.filter(w=>w.role===role).map(w=><option key={w.id} value={w.id}>{w.name}</option>)}</select>:null}
      {draft.kind==="opening"?<select aria-label="Место начального остатка" value={draft.openingTo??""} onChange={e=>setDraft(d=>({...d,openingTo:e.target.value}))} className="w-full rounded-md border border-border bg-surface p-2"><option value="">Выбрать место</option>{locations.map(l=><option key={l} value={l}>{locationName(l)}</option>)}</select>:null}
      {draft.kind==="cut-in"?<><select aria-label="Предзаказ" value={draft.planId??""} onChange={e=>setDraft(d=>({...d,planId:e.target.value||undefined}))} className="w-full rounded-md border border-border bg-surface p-2"><option value="">Без предзаказа (ручная приёмка)</option>{planOptions.map(b=><option key={b.id} value={b.id}>{b.note||b.id} · {total(remainingPlanItems(b,moves))} пар осталось</option>)}</select>{draft.planId?<Button variant="secondary" onClick={()=>{const b=planOptions.find(b=>b.id===draft.planId);if(b)setDraft(d=>({...d,items:remainingPlanItems(b,moves)}))}}>Заполнить по предзаказу</Button>:null}</>:null}
      {route?<p className="text-sm text-muted">{locationName(route[0])} → {locationName(route[1])}</p>:null}
      {source&&source!=="outside"?<Button variant="secondary" onClick={()=>setDraft(d=>({...d,items:available.map(i=>({...i}))}))}>Заполнить весь остаток ({total(available)})</Button>:null}
      <div className="grid grid-cols-4 gap-1">{COLORS.map(c=><Button key={c} size="sm" variant={color===c?"primary":"secondary"} className="min-w-0 px-1 text-xs" onClick={()=>setColor(c)}>{colorLabel(c)==="Серые"?"Серебро":colorLabel(c)}</Button>)}</div>
      <div className="divide-y divide-border">{SIZES.map(size=>{const n=draft.items.find(i=>i.color===color&&i.size===size)?.qty??0;const have=available.find(i=>i.color===color&&i.size===size)?.qty??0;return <div key={size} className="flex flex-wrap items-center gap-1.5 py-2"><div className="min-w-12 flex-1 text-sm font-medium">р.{size}{source&&source!=="outside"?<div className="text-xs text-muted">Есть {have}</div>:null}</div><Input aria-label={colorLabel(color)+" размер "+size} type="number" inputMode="numeric" min={0} step={1} value={n||""} placeholder="0" className="h-9 w-16 text-center" onChange={e=>qty(color,size,Number(e.target.value))}/>{[-5,5,10,50].map(v=><Button type="button" key={v} variant="secondary" size="sm" className="px-2" onClick={()=>qty(color,size,Math.max(0,n+v))}>{v>0?"+":""}{v}</Button>)}</div>})}</div>
      <Input aria-label="Дата" type="date" value={draft.date} onChange={e=>setDraft(d=>({...d,date:e.target.value}))}/>
      <Input aria-label="Комментарий" placeholder="Комментарий" value={draft.note} onChange={e=>setDraft(d=>({...d,note:e.target.value}))}/>
      <div className="flex flex-wrap gap-2"><Button variant="secondary" onClick={()=>{setOpen(false);setEditing(undefined)}}>Отмена</Button><Button disabled={!route||!draft.items.length} onClick={()=>setPending({input:{...draft,items:draft.items.map(i=>({...i}))},token:productionToken(state),id:editing})}>Проверить · {total(draft.items)} пар</Button></div>
    </Card>:null}
    {pending?<div role="dialog" aria-modal="true" className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 p-4"><Card className="max-h-[85dvh] w-full max-w-lg space-y-3 overflow-y-auto p-4"><h3 className="text-lg font-semibold">Вы уверены?</h3><p>{MOVE_LABELS[pending.input.kind]}{pending.input.workerId?" · "+workerName(pending.input.workerId):""} · {total(pending.input.items)} пар</p><div className="divide-y divide-border">{pending.input.items.map(i=><div key={itemKey(i)} className="flex justify-between py-2 text-sm"><span>{colorLabel(i.color)} · размер {i.size}</span><b>{i.qty}</b></div>)}</div>{pending.input.kind==="warehouse-in"?<p className="text-warn text-sm">Только после подтверждения изменится основной склад.</p>:<p className="text-xs text-muted">Основной склад не изменится.</p>}<div className="flex gap-2"><Button variant="secondary" className="flex-1" onClick={()=>setPending(undefined)}>Исправить</Button><Button className="flex-1" onClick={save}>Подтвердить</Button></div></Card></div>:null}
    <Card className="divide-y divide-border"><div className="p-3 font-medium">Журнал перемещений</div>{moves.length===0?<p className="p-3 text-sm text-muted">Нет операций. Внесите фактические начальные остатки.</p>:moves.slice().reverse().map(m=><div key={m.id} className="space-y-1 p-3"><div className="flex justify-between gap-2"><div><b className="text-sm">{MOVE_LABELS[m.kind]} · {total(m.items)} пар</b><p className="text-xs text-muted">{m.date}{m.workerId?" · "+workerName(m.workerId):""}</p></div><Button size="sm" variant="secondary" onClick={()=>edit(m)}>Изменить</Button></div><p className="text-xs text-muted">{m.items.map(i=>colorLabel(i.color)+" "+i.size+"×"+i.qty).join(" · ")}</p>{m.audit?.length?<details className="text-xs text-muted"><summary>История исправлений ({m.audit.length})</summary>{m.audit.map((a,i)=><p key={i}>{a.at.slice(0,16).replace("T"," ")} · было: {a.before.items.map(i=>colorLabel(i.color)+" "+i.size+"×"+i.qty).join(" · ")}</p>)}</details>:null}</div>)}</Card>
  </section>;
}
