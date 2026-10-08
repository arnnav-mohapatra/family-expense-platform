export type VectorClock = Readonly<Record<string, number>>;
export type SyncEvent<T=unknown> = { eventId:string; deviceId:string; sequence:number; entityId:string; entityType:string; occurredAt:string; vectorClock:VectorClock; payload:T };

export function incrementClock(clock:VectorClock, deviceId:string): VectorClock {
  return {...clock,[deviceId]:(clock[deviceId]??0)+1};
}
export function mergeClocks(a:VectorClock,b:VectorClock):VectorClock {
  const keys=new Set([...Object.keys(a),...Object.keys(b)]);
  return Object.fromEntries([...keys].sort().map(k=>[k,Math.max(a[k]??0,b[k]??0)]));
}
export function compareClocks(a:VectorClock,b:VectorClock):"BEFORE"|"AFTER"|"CONCURRENT"|"EQUAL" {
  let less=false,greater=false;
  for(const k of new Set([...Object.keys(a),...Object.keys(b)])){ const av=a[k]??0,bv=b[k]??0; less ||= av<bv; greater ||= av>bv; }
  return less&&greater?"CONCURRENT":less?"BEFORE":greater?"AFTER":"EQUAL";
}
export function deterministicEventOrder<T>(events: SyncEvent<T>[]) {
  return [...events].sort((a,b)=>a.occurredAt.localeCompare(b.occurredAt)||a.deviceId.localeCompare(b.deviceId)||a.sequence-b.sequence||a.eventId.localeCompare(b.eventId));
}
export interface SyncStore { appendOutbox(event:SyncEvent):Promise<void>; listOutbox(limit:number):Promise<SyncEvent[]>; acknowledge(eventIds:string[]):Promise<void>; }
export interface SyncTransport { push(events:SyncEvent[]):Promise<{accepted:string[];rejected:{eventId:string;reason:string}[]}>; pull(cursor?:string):Promise<{events:SyncEvent[];nextCursor?:string}>; }
