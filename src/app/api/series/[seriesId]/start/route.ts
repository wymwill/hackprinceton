import {seriesRequest} from "@/server/supabase";
export async function POST(req:Request,{params}:{params:Promise<{seriesId:string}>}){const {seriesId}=await params;return seriesRequest(req,async client=>{const {data,error}=await client.rpc("start_bet_series",{p_series_id:seriesId});if(error)throw error;return data;});}
