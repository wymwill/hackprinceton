import {seriesRequest} from "@/server/supabase";
export async function POST(req:Request,{params}:{params:Promise<{seriesId:string}>}){const {seriesId}=await params;return seriesRequest(req,async c=>{const {data,error}=await c.rpc("complete_bet_series",{p_series_id:seriesId});if(error)throw error;return data;});}
