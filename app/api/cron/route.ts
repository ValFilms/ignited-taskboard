import { mutate, failure } from "../../../lib/server";
import { tick } from "../../../lib/workflow";
export async function GET(req: Request) {
  if (
    !process.env.CRON_SECRET ||
    req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`
  )
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    await mutate((s) => tick(s));
    return Response.json({ ok: true });
  } catch (e) {
    return failure(e);
  }
}
