import test from "node:test";
import assert from "node:assert/strict";
import { replayProduction,balanceItems,remainingPlanItems } from "../src/lib/production-moves.ts";
const item=(size,qty,color="white")=>({size,qty,color});
const move=(id,kind,items,workerId,extra={})=>({id,kind,items,workerId,date:"2026-11-15",note:"",at:"2026-11-15T12:00:00Z",...extra});
test("Sapura partial acceptance leaves exactly 230 by size",()=>{
  const rows=[20,21,22,23,25,27].map(s=>item(s,50));
  const {balances,error}=replayProduction([move("1","cut-in",rows,"cutter"),move("2","cut-out",rows,"sapura"),move("3","sewn-in",[item(21,35),item(22,35)],"sapura")]);
  assert.equal(error,null);
  assert.deepEqual(balanceItems(balances,"sewing:sapura"),[item(20,50),item(21,15),item(22,15),item(23,50),item(25,50),item(27,50)]);
  assert.deepEqual(balanceItems(balances,"sewn"),[item(21,35),item(22,35)]);
});
test("rejects excess and wrong sizes, and keeps packaging separate from warehouse",()=>{
  const initial=[move("1","cut-in",[item(21,50)],"cutter"),move("2","cut-out",[item(21,50)],"s")];
  assert.ok(replayProduction([...initial,move("3","sewn-in",[item(21,51)],"s")]).error);
  assert.ok(replayProduction([...initial,move("3","sewn-in",[item(22,1)],"s")]).error);
  const packed=[...initial,move("3","sewn-in",[item(21,25)],"s"),move("4","pack-out",[item(21,25)],"p"),move("5","packed-in",[item(21,25)],"p")];
  assert.deepEqual(balanceItems(replayProduction(packed).balances,"packed"),[item(21,25)]);
  assert.deepEqual(balanceItems(replayProduction([...packed,move("6","warehouse-in",[item(21,20)])]).balances,"packed"),[item(21,5)]);
});
test("linked cut receipt reduces remaining plan without adding ready stock",()=>{
  const batch={id:"plan",stage:"cutting",items:[item(21,50)]};
  assert.deepEqual(remainingPlanItems(batch,[move("1","cut-in",[item(21,35)],"cutter",{planId:"plan"})]),[item(21,15)]);
});
