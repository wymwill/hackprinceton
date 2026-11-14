import {seriesRequest} from "@/server/supabase";
export async function POST(req:Request,{params}:{params:Promise<{seriesId:string;betId:string}>}){const {seriesId,betId}=await params;return seriesRequest(req,async c=>{const {data,error}=await c.rpc("lock_series_bet",{p_series_id:seriesId,p_bet_id:betId});if(error)throw error;return data;});}
