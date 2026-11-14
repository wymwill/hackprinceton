import "server-only";
import { createClient } from "@supabase/supabase-js";
import { BetError } from "./bets";

const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
const key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
export function supabaseForRequest(req:Request){
 if(!url||!key) throw new BetError(503,"supabase_not_configured","Set Supabase URL and anon key in the deployment environment.");
 const token=req.headers.get("authorization")?.replace(/^Bearer\s+/i,"");
 if(!token) throw new BetError(401,"unauthorized","Sign in with Supabase and send Authorization: Bearer <access_token>.");
 const client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false},global:{headers:{Authorization:`Bearer ${token}`}}});
 return {client,token};
}
export async function authenticatedSupabase(req:Request){
 const {client,token}=supabaseForRequest(req);
 const {data,error}=await client.auth.getUser(token);
 if(error||!data.user) throw new BetError(401,"unauthorized","Supabase session is invalid or expired.");
 return {client,user:data.user};
}
export async function seriesRequest(req:Request,action:(client:ReturnType<typeof supabaseForRequest>["client"],userId:string)=>Promise<unknown>,status=200){
 try { const {client,user}=await authenticatedSupabase(req); const result=await action(client,user.id); return Response.json({result},{status}); }
 catch(error){
   if(error instanceof BetError) return Response.json({error:{code:error.code,message:error.message}},{status:error.status});
   const msg=error instanceof Error?error.message:"Request failed";
   const details=error&&typeof error==="object"?["details","hint","code"].map(key=>String((error as Record<string,unknown>)[key]??"")).join(" "):"";
   const searchable=`${msg} ${details}`;
   const code=/one_person|only one person/i.test(searchable)?"one_person":/too_few_participants/i.test(searchable)?"too_few_participants":/planned_questions_required/i.test(searchable)?"planned_questions_required":"series_request_failed";
   const message=code==="one_person"?"Can't start with only one person.":code==="too_few_participants"?"This series needs at least twice as many participants as bottom losers.":code==="planned_questions_required"?"Add every planned bet before starting the series.":msg;
   const status=/not_host/i.test(searchable)?403:/one_person|only one person|not_lobby|too_few|planned_questions_required|questions_locked/i.test(searchable)?409:/not_found/i.test(searchable)?404:/unauthorized/i.test(searchable)?401:400;
   return Response.json({error:{code,message}},{status});
 }
}
