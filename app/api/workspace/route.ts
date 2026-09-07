import {
  identity,
  readState,
  mutate,
  member,
  failure,
} from "../../../lib/server";
import { tick, transition, visibleState, Action } from "../../../lib/workflow";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  try {
    const id = await identity(req);
    const { state } = await readState();
    return Response.json(visibleState(state, member(state, id)), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(req: Request) {
  try {
    const id = await identity(req);
    const body = await req.text();
    if (body.length > 32000) throw new Error("Request too large");
    const a = JSON.parse(body) as Action;
    if (a.type === "raw") throw new Error("Use the verified upload endpoint");
    const state = await mutate((s) => tick(transition(s, member(s, id), a)));
    return Response.json(visibleState(state, member(state, id)), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    return failure(e);
  }
}
