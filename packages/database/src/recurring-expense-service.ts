import type { PrismaClient } from "@prisma/client";
import { assertCurrency, assertPositiveMinorUnits } from "@family-expense/domain";
import { claimIdempotencyKey, completeIdempotencyKey, hashRequest } from "./idempotency";
import { createExpense } from "./expense-service";

type SplitConfig = { userId:string; groupAmountMinor:string }[];
export type CreateRecurringExpenseInput = {spaceId:string;actorUserId:string;description:string;amountMinor:bigint;currency:string;frequency:"DAILY"|"WEEKLY"|"MONTHLY"|"YEARLY";interval:number;payerId:string;splitConfig:SplitConfig;nextOccurrence:Date;idempotencyKey:string};

function advance(date:Date,frequency:CreateRecurringExpenseInput["frequency"],interval:number){
  const d=new Date(date);
  if(frequency==="DAILY")d.setUTCDate(d.getUTCDate()+interval);
  else if(frequency==="WEEKLY")d.setUTCDate(d.getUTCDate()+interval*7);
  else if(frequency==="MONTHLY")d.setUTCMonth(d.getUTCMonth()+interval);
  else d.setUTCFullYear(d.getUTCFullYear()+interval);
  return d;
}
async function lockSpace(tx:PrismaClient,spaceId:string){await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${spaceId}))`;}

export async function createRecurringExpense(db:PrismaClient,input:CreateRecurringExpenseInput){
  assertCurrency(input.currency); assertPositiveMinorUnits(input.amountMinor);
  if(input.interval<1)throw new Error("RECURRENCE_INTERVAL_INVALID");
  if(!input.description.trim())throw new Error("DESCRIPTION_REQUIRED");
  if(!input.splitConfig.length)throw new Error("RECURRING_SPLITS_REQUIRED");
  const requestHash=hashRequest(input);
  return db.$transaction(async tx=>{
    await lockSpace(tx as unknown as PrismaClient,input.spaceId);
    const idem=await claimIdempotencyKey(tx,"create-recurring-expense",input.idempotencyKey,requestHash);
    if(idem.replay)return {replay:true,response:idem.response,statusCode:idem.statusCode??201};
    const space=await tx.space.findUnique({where:{id:input.spaceId}});
    if(!space||space.status!=="ACTIVE")throw new Error("SPACE_NOT_ACTIVE");
    const currency=assertCurrency(input.currency);
    if(currency!==space.defaultCurrency)throw new Error("CURRENCY_MUST_MATCH_SPACE");
    const required=new Set([input.actorUserId,input.payerId,...input.splitConfig.map(s=>s.userId)]);
    const members=await tx.spaceMember.findMany({where:{spaceId:input.spaceId,userId:{in:[...required]},status:"ACTIVE"},select:{userId:true}});
    if(members.length!==required.size)throw new Error("ALL_PARTICIPANTS_MUST_BE_ACTIVE_MEMBERS");
    if(input.splitConfig.some(s=>BigInt(s.groupAmountMinor)<0n))throw new Error("RECURRING_SPLIT_INVALID");
    if(input.splitConfig.reduce((s,x)=>s+BigInt(x.groupAmountMinor),0n)!==input.amountMinor)throw new Error("RECURRING_SPLITS_MUST_BALANCE");
    const recurring=await tx.recurringExpense.create({data:{spaceId:input.spaceId,createdById:input.actorUserId,description:input.description.trim(),amountMinor:input.amountMinor,currency,recurrenceRule:`${input.frequency}/${input.interval}`,frequency:input.frequency,interval:input.interval,payerId:input.payerId,splitConfig:input.splitConfig,nextOccurrence:input.nextOccurrence}});
    const response={recurringExpenseId:recurring.id,nextOccurrence:recurring.nextOccurrence.toISOString(),active:recurring.active};
    await completeIdempotencyKey(tx,"create-recurring-expense",input.idempotencyKey,response,201);
    return {replay:false,response,statusCode:201};
  },{isolationLevel:"Serializable",maxWait:5000,timeout:10000});
}

export async function materializeDueRecurringExpenses(db:PrismaClient,now=new Date()){
  const due=await db.recurringExpense.findMany({where:{active:true,nextOccurrence:{lte:now}},orderBy:{nextOccurrence:"asc"}});
  const created:string[]=[];
  for(const template of due){
    const result=await db.$transaction(async tx=>{
      await lockSpace(tx as unknown as PrismaClient,template.spaceId);
      const current=await tx.recurringExpense.findUnique({where:{id:template.id}});
      if(!current||!current.active||current.nextOccurrence>now)return null;
      const occurrenceAt=current.nextOccurrence;
      await tx.recurringExpense.update({where:{id:current.id},data:{nextOccurrence:advance(occurrenceAt,current.frequency,current.interval)}});
      return {spaceId:current.spaceId,actorUserId:current.createdById,description:current.description,amountMinor:current.amountMinor,currency:current.currency,payerId:current.payerId,splitConfig:current.splitConfig,occurrenceAt};
    },{isolationLevel:"Serializable",maxWait:5000,timeout:10000});
    if(!result)continue;
    const config=result.splitConfig as unknown as SplitConfig;
    const occurrenceKey=`recurring:${template.id}:${result.occurrenceAt.toISOString()}`;
    const splits=config.map(s=>({userId:s.userId,amountMinor:BigInt(s.groupAmountMinor),groupAmountMinor:BigInt(s.groupAmountMinor),splitType:"EXACT" as const}));
    const expense=await createExpense(db,{spaceId:result.spaceId,actorUserId:result.actorUserId,description:result.description,expenseDate:result.occurrenceAt,currency:result.currency,amountMinor:result.amountMinor,groupAmountMinor:result.amountMinor,groupCurrency:result.currency,payers:[{userId:result.payerId,amountMinor:result.amountMinor,groupAmountMinor:result.amountMinor}],splits,idempotencyKey:occurrenceKey});
    if(!expense.replay)created.push(expense.response.expenseId);
  }
  return created;
}
