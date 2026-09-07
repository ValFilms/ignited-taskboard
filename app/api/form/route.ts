import { timingSafeEqual } from "node:crypto";
import { mutate, failure } from "../../../lib/server";
import { importClient } from "../../../lib/workflow";
export async function POST(req: Request) {
  try {
    const key = process.env.FORM_WEBHOOK_SECRET;
    const supplied =
      req.headers.get("authorization")?.replace(/^Bearer /, "") || "";
    if (
      !key ||
      supplied.length !== key.length ||
      !timingSafeEqual(Buffer.from(key), Buffer.from(supplied))
    )
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    const text = await req.text();
    if (text.length > 16000) throw new Error("Submission too large");
    const p = JSON.parse(text);
    for (const k of ["sourceId", "name", "person", "email", "location"])
      if (typeof p[k] !== "string" || p[k].length > 500)
        throw new Error(`Invalid ${k}`);
    for (const k of ["phone", "offer"])
      if (p[k] !== undefined && (typeof p[k] !== "string" || p[k].length > 500))
        throw new Error(`Invalid ${k}`);
    await mutate((s) =>
      importClient(s, { ...p, historical: p.historical === true }),
    );
    return Response.json({ ok: true });
  } catch (e) {
    return failure(e);
  }
}
