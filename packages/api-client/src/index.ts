export type ApiClientOptions={baseUrl:string;fetcher?:typeof fetch};
export type ApiError={error:string;code?:string};

export class ApiClient{
 private readonly baseUrl:string;private readonly fetcher:typeof fetch;
 constructor(options:ApiClientOptions){this.baseUrl=options.baseUrl.replace(/\/$/,"");this.fetcher=options.fetcher??fetch;}
 private async request<T>(path:string,init:RequestInit={}):Promise<T>{
  const response=await this.fetcher(this.baseUrl+path,{...init,headers:{"content-type":"application/json",...(init.headers??{})}});
  const text=await response.text();let body:unknown=null;try{body=text?JSON.parse(text):null}catch{body={error:text};}
  if(!response.ok){const e=body as ApiError;throw new Error(e?.code??e?.error??`HTTP_${response.status}`);}
  return body as T;
 }
 getBalances(spaceId:string){return this.request<Array<{userId:string;balanceMinor:string;direction:"CREDIT"|"DEBT"|"SETTLED"}>>(`/spaces/${encodeURIComponent(spaceId)}/balances`);}
 createExpense(input:Record<string,unknown>){return this.request<{expenseId:string;version:number}>("/expenses",{method:"POST",body:JSON.stringify(input)});}
 createSettlement(input:Record<string,unknown>){return this.request<{settlementId:string;amountMinor:string;currency:string;status:string}>("/settlements",{method:"POST",body:JSON.stringify(input)});}
 confirmSettlement(settlementId:string,input:Record<string,unknown>){return this.request<{settlementId:string;status:string}>(`/settlements/${encodeURIComponent(settlementId)}/confirm`,{method:"POST",body:JSON.stringify(input)});}
}
