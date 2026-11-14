import {seriesRequest} from "@/server/supabase";
export async function DELETE(req:Request,{params}:{params:Promise<{seriesId:string;userId:string}>}){const {seriesId,userId}=await params;return seriesRequest(req,async c=>{const {data,error}=await c.rpc("remove_series_participant",{p_series_id:seriesId,p_user_id:userId});if(error)throw error;return {removed:data};});}
