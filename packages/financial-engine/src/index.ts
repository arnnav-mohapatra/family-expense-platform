export type BalanceMap=ReadonlyMap<string,bigint>;
export type Transaction={from:string;to:string;amountMinor:bigint};

export function validateBalancedExpense(totalMinor:bigint,payerAmounts:bigint[],splitAmounts:bigint[]):void{
 if(totalMinor<=0n)throw new Error("Expense total must be positive");
 if(payerAmounts.some(a=>a<0n)||splitAmounts.some(a=>a<0n))throw new Error("Amounts cannot be negative");
 if(payerAmounts.reduce((s,a)=>s+a,0n)!==totalMinor)throw new Error("Payer amounts must equal expense total");
 if(splitAmounts.reduce((s,a)=>s+a,0n)!==totalMinor)throw new Error("Split amounts must equal expense total");
}
export function splitEqually(totalMinor:bigint,memberIds:readonly string[]):Map<string,bigint>{
 if(totalMinor<0n)throw new Error("Total cannot be negative");
 if(!memberIds.length)throw new Error("At least one member is required");
 const ids=[...new Set(memberIds)].sort((a,b)=>a.localeCompare(b));
 if(ids.length!==memberIds.length)throw new Error("Duplicate members are not allowed");
 const base=totalMinor/BigInt(ids.length);let remainder=totalMinor%BigInt(ids.length);const result=new Map<string,bigint>();
 for(const id of ids){result.set(id,base+(remainder>0n?1n:0n));if(remainder>0n)remainder--;}
 return result;
}
export function calculateBalances(payers:readonly {userId:string;amountMinor:bigint}[],splits:readonly {userId:string;amountMinor:bigint}[]):Map<string,bigint>{
 const balances=new Map<string,bigint>();
 for(const p of payers)balances.set(p.userId,(balances.get(p.userId)??0n)+p.amountMinor);
 for(const s of splits)balances.set(s.userId,(balances.get(s.userId)??0n)-s.amountMinor);
 return balances;
}
export function simplifyDebts(balances:BalanceMap):Transaction[]{
 const debtors=[...balances].filter(([,a])=>a<0n).map(([id,a])=>({id,amount:-a})).sort((a,b)=>a.id.localeCompare(b.id));
 const creditors=[...balances].filter(([,a])=>a>0n).map(([id,a])=>({id,amount:a})).sort((a,b)=>a.id.localeCompare(b.id));
 const result:Transaction[]=[];let d=0,c=0;
 while(d<debtors.length&&c<creditors.length){const x=debtors[d]!,y=creditors[c]!,amount=x.amount<y.amount?x.amount:y.amount;if(amount>0n)result.push({from:x.id,to:y.id,amountMinor:amount});x.amount-=amount;y.amount-=amount;if(x.amount===0n)d++;if(y.amount===0n)c++;}
 return result;
}
export type SplitAllocation={userId:string;amountMinor:bigint};
export function splitByPercent(totalMinor:bigint,allocations:{userId:string;percentage:number}[]):SplitAllocation[]{
 if(totalMinor<=0n||!allocations.length)throw new Error("INVALID_SPLIT");
 const scale=10000n;const normalized=allocations.map(a=>({...a,basis:BigInt(Math.round(a.percentage*100))}));
 if(normalized.some(a=>a.basis<0n)||normalized.reduce((s,a)=>s+a.basis,0n)!==scale)throw new Error("PERCENTAGES_MUST_TOTAL_100");
 const rows=normalized.map(a=>({...a,amount:totalMinor*a.basis/scale}));
 let remaining=totalMinor-rows.reduce((s,r)=>s+r.amount,0n);rows.sort((a,b)=>a.userId.localeCompare(b.userId));
 for(let i=0;remaining>0n;i++,remaining--)rows[i%rows.length].amount++;
 return rows.map(r=>({userId:r.userId,amountMinor:r.amount}));
}
export function splitByShares(totalMinor:bigint,allocations:{userId:string;shares:bigint}[]):SplitAllocation[]{
 if(totalMinor<=0n||!allocations.length)throw new Error("INVALID_SPLIT");
 if(allocations.some(a=>a.shares<=0n))throw new Error("SHARES_INVALID");
 const totalShares=allocations.reduce((s,a)=>s+a.shares,0n);
 const rows=allocations.map(a=>({userId:a.userId,amount:totalMinor*a.shares/totalShares,remainder:(totalMinor*a.shares)%totalShares})).sort((a,b)=>a.userId.localeCompare(b.userId));
 let remaining=totalMinor-rows.reduce((s,r)=>s+r.amount,0n);
 while(remaining>0n){rows.sort((a,b)=>b.remainder===a.remainder?a.userId.localeCompare(b.userId):b.remainder>a.remainder?-1:1);rows[0].amount++;rows[0].remainder=0n;remaining--;}
 return rows.map(r=>({userId:r.userId,amountMinor:r.amount}));
}
export function splitByExact(totalMinor:bigint,allocations:SplitAllocation[]):SplitAllocation[]{
 if(totalMinor<=0n||!allocations.length)throw new Error("INVALID_SPLIT");
 if(allocations.some(a=>a.amountMinor<0n))throw new Error("EXACT_AMOUNT_INVALID");
 if(allocations.reduce((s,a)=>s+a.amountMinor,0n)!==totalMinor)throw new Error("EXACT_SPLITS_MUST_BALANCE");
 return [...allocations].sort((a,b)=>a.userId.localeCompare(b.userId));
}
export function calculateSplit(totalMinor:bigint,mode:"EQUAL"|"EXACT"|"PERCENTAGE"|"SHARES",inputs:{userId:string;value:bigint}[]):Map<string,bigint>{
 if(mode==="EQUAL")return splitEqually(totalMinor,inputs.map(x=>x.userId));
 if(mode==="EXACT")return new Map(splitByExact(totalMinor,inputs.map(x=>({userId:x.userId,amountMinor:x.value}))).map(x=>[x.userId,x.amountMinor]));
 if(mode==="PERCENTAGE")return new Map(splitByPercent(totalMinor,inputs.map(x=>({userId:x.userId,percentage:Number(x.value)/100}))).map(x=>[x.userId,x.amountMinor]));
 return new Map(splitByShares(totalMinor,inputs.map(x=>({userId:x.userId,shares:x.value}))).map(x=>[x.userId,x.amountMinor]));
}
