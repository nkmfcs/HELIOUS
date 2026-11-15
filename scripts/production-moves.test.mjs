import test from "node:test";
import assert from "node:assert/strict";
import { replayProduction,balanceItems,remainingPlanItems,reconcileProductionPayable } from "../src/lib/production-moves.ts";
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

test("acceptance accrues once; editing preserves paid amount and historical rate",()=>{
  const receipt={...move("r","sewn-in",[item(21,35),item(22,35)],"sapura"),rate:2000};
  const state={workers:[{id:"sapura",name:"Сапура"}],payables:[]};
  const result=reconcileProductionPayable(state,receipt);
  assert.equal(result.error,null);
  assert.equal(result.payables[0].amount,140000);
  assert.equal(result.payables[0].pairs,70);
  const paid={...state,payables:[{...result.payables[0],paidSum:100000}]};
  const edited=reconcileProductionPayable(paid,{...receipt,items:[item(21,60)]});
  assert.equal(edited.error,null);
  assert.equal(edited.payables.length,1);
  assert.equal(edited.payables[0].amount,120000);
  assert.equal(edited.payables[0].paidSum,100000);
  assert.ok(reconcileProductionPayable(paid,{...receipt,items:[item(21,40)]}).error);
});
test("opening balances and issue operations never accrue payroll",()=>{
  const state={workers:[],payables:[]};
  assert.deepEqual(reconcileProductionPayable(state,move("1","opening",[item(21,20)],undefined,{openingTo:"cut"})),{payables:[],error:null});
  assert.deepEqual(reconcileProductionPayable(state,move("2","cut-out",[item(21,20)],"s")),{payables:[],error:null});
});
test("invalid historical correction is rejected when already issued",()=>{
  const a=[move("1","cut-in",[item(21,50)],"cutter"),move("2","cut-out",[item(21,50)],"s")];
  assert.ok(replayProduction([{...a[0],items:[item(21,49)]},a[1]]).error);
});
