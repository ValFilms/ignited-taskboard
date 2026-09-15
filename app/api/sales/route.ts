import { identity, readState, member, failure } from "../../../lib/server";
import { isOwner } from "../../../lib/workflow";
import { loadSales } from "../../../lib/sales-server";
import { salesRange } from "../../../lib/sales";
export const dynamic="force-dynamic";
export const maxDuration=60;
export async function POST(req:Request) {
  try {
    const id=await identity(req);
    const {state}=await readState();
    if(!isOwner(member(state,id)))throw new Error("Owners only");
    const text=await req.text();if(text.length>1000)throw new Error("Request too large");
    const body=JSON.parse(text); const {start,end}=salesRange(body?.start,body?.end);
    const data=await loadSales(start,end,{token:process.env.GHL_PRIVATE_INTEGRATION_TOKEN,locationId:process.env.GHL_LOCATION_ID});
    return Response.json(data,{headers:{"Cache-Control":"private, no-store"}});
  }catch(e){return failure(e);}
}
