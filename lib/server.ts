import { createClient } from "@supabase/supabase-js";
import { Member, State } from "./workflow";
export function admin() {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.SUPABASE_SERVICE_ROLE_KEY
  )
    throw new Error("Private workspace is not configured");
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
export async function identity(req: Request) {
  const token = req.headers.get("authorization")?.replace(/^Bearer /, "");
  if (!token) throw new Error("Sign in required");
  const db = admin();
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) throw new Error("Sign in required");
  return data.user.id;
}
export async function readState() {
  const db = admin();
  const { data, error } = await db
    .from("workspace")
    .select("data,version")
    .eq("id", 1)
    .single();
  if (error || !data) throw new Error("Workspace database is not initialized");
  return { state: data.data as State, version: data.version as number };
}
export async function mutate(fn: (s: State) => State) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const { state, version } = await readState();
    const next = fn(state);
    const { data, error } = await admin()
      .from("workspace")
      .update({ data: next, version: version + 1 })
      .eq("id", 1)
      .eq("version", version)
      .select("version");
    if (error) throw new Error("Could not save changes");
    if (data?.length) return next;
  }
  throw new Error("Workspace changed. Please retry.");
}
export function member(s: State, id: string): Member {
  const m = s.members.find((x) => x.id === id);
  if (!m) throw new Error("Your account is not on this team");
  return m;
}
export function failure(e: unknown) {
  const message = e instanceof Error ? e.message : "Request failed";
  return Response.json(
    { error: message },
    {
      status: /Sign in/.test(message)
        ? 401
        : /Unauthorized|Only|Owners|not on this team/.test(message)
          ? 403
          : 400,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
