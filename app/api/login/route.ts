import { createClient } from "@supabase/supabase-js";
import { admin, readState } from "../../../lib/server";

export async function POST(req: Request) {
  const headers = { "Cache-Control": "no-store" };
  const invalid = () => Response.json({ error: "Incorrect username or password." }, { status: 401, headers });
  try {
    const text = await req.text();
    if (text.length > 2000) return invalid();
    const input = JSON.parse(text);
    if (typeof input.username !== "string" || typeof input.password !== "string") return invalid();
    const username = input.username.trim().toLowerCase();
    if (!username || !input.password || username.length > 254 || input.password.length > 256) return invalid();
    let email = username;
    if (!username.includes("@")) {
      const { state } = await readState();
      const matches = state.members.filter(m => m.name.trim().toLowerCase() === username ||
        m.name.trim().split(/\s+/)[0].toLowerCase() === username);
      if (matches.length !== 1) return invalid();
      const { data, error } = await admin().auth.admin.getUserById(matches[0].id);
      if (error || !data.user?.email) return invalid();
      email = data.user.email;
    }
    const auth = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await auth.auth.signInWithPassword({ email, password: input.password });
    if (error || !data.session) return invalid();
    return Response.json({ access_token: data.session.access_token, refresh_token: data.session.refresh_token }, { headers });
  } catch {
    return invalid();
  }
}
