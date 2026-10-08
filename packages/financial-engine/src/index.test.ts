import {describe,expect,it} from "vitest";
import {calculateBalances,simplifyDebts,splitEqually,validateBalancedExpense} from "./index";
describe("financial engine",()=>{
it("splits remainder deterministically",()=>expect(splitEqually(100n,["b","a","c"])).toEqual(new Map([["a",34n],["b",33n],["c",33n]])));
it("calculates balances",()=>expect(calculateBalances([{userId:"A",amountMinor:100n}],[{userId:"A",amountMinor:25n},{userId:"B",amountMinor:75n}])).toEqual(new Map([["A",75n],["B",-75n]])));
it("rejects unbalanced expenses",()=>expect(()=>validateBalancedExpense(100n,[90n],[100n])).toThrow());
it("simplifies debts",()=>expect(simplifyDebts(new Map([["A",100n],["B",-60n],["C",-40n]]))).toEqual([{from:"B",to:"A",amountMinor:60n},{from:"C",to:"A",amountMinor:40n}]));
});
