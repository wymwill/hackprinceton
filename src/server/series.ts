import { BetError } from "./bets";
import { newId, type Db, type Series } from "./store";

function fail(code:string,message:string,status=400):never{throw new BetError(status,code,message)}
const safePositive = (v:unknown):v is number => Number.isSafeInteger(v) && (v as number)>0;
export function createSeries(db:Db,userId:string,input:Record<string,unknown>){
  if(!db.users.some(u=>u.id===userId)) fail("unknown_user","Unknown demo user.",400);
  if(typeof input.title!=="string"||!input.title.trim()||input.title.trim().length>100) fail("invalid_title","Title must be 1–100 characters.");
  if(input.description!==undefined&&typeof input.description!=="string") fail("invalid_description","Description must be text.");
  if(!safePositive(input.plannedBetCount)||!safePositive(input.initialBankroll)||!safePositive(input.loserCount)) fail("invalid_series","Counts and bankroll must be positive safe integers.");
  if(input.stakeMode!=="SHARED_FAVOR_POOL") fail("invalid_stake_mode","Unsupported stake mode.");
  const now=new Date().toISOString();
  const series:Series={id:newId("s"),title:(input.title as string).trim(),description:typeof input.description==="string"?input.description:"",hostUserId:userId,status:"LOBBY",plannedBetCount:input.plannedBetCount as number,initialBankroll:input.initialBankroll as number,loserCount:input.loserCount as number,stakeMode:"SHARED_FAVOR_POOL",createdAt:now};
  db.series.push(series); db.seriesParticipants.push({seriesId:series.id,userId,joinedAt:now,balance:0}); return series;
}
export function seriesView(db:Db,id:string,userId:string){
 const s=db.series.find(x=>x.id===id); if(!s) fail("series_not_found","Series not found.",404);
 const members=db.seriesParticipants.filter(p=>p.seriesId===id); if(!members.some(p=>p.userId===userId)) fail("not_member","Join this series to view it.",403);
 return {...s,participants:members.map(p=>({userId:p.userId,name:db.users.find(u=>u.id===p.userId)?.name??p.userId,joinedAt:p.joinedAt,balance:s.status==="LOBBY"?null:p.balance}))};
}
export function joinSeries(db:Db,id:string,userId:string){
 const s=db.series.find(x=>x.id===id); if(!s) fail("series_not_found","Series not found.",404);
 if(s.status!=="LOBBY") fail("series_not_lobby","Series is not accepting members.",409);
 if(!db.users.some(u=>u.id===userId)) fail("unknown_user","Unknown demo user.");
 let p=db.seriesParticipants.find(x=>x.seriesId===id&&x.userId===userId); if(!p){p={seriesId:id,userId,joinedAt:new Date().toISOString(),balance:0};db.seriesParticipants.push(p);} return p;
}
export function startSeries(db:Db,id:string,userId:string){
 const s=db.series.find(x=>x.id===id); if(!s) fail("series_not_found","Series not found.",404);
 if(s.hostUserId!==userId) fail("not_host","Only the host can start this series.",403);
 if(s.status==="ACTIVE") return s;
 if(s.status!=="LOBBY") fail("series_not_lobby","Series cannot be started.",409);
 const members=db.seriesParticipants.filter(p=>p.seriesId===id); if(members.length<Math.max(2,2*s.loserCount)) fail("too_few_participants","Need at least twice as many participants as losers.",400);
 for(const p of members)p.balance=s.initialBankroll;
 s.status="ACTIVE";s.startedAt=new Date().toISOString(); return s;
}
