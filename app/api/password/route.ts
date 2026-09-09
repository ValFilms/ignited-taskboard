import { createClient } from "@supabase/supabase-js";
import { admin, readState, member } from "../../../lib/server";
import { passwordChange } from "../../../lib/password";
import { ONBOARDING_VERSION } from "../../../lib/onboarding";

export async function POST(req: Request) {
  const headers = { "Cache-Control": "no-store" };
  const fail = (error: string, status = 400) => Response.json({ error }, { status, headers });
  try {
    const token = req.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1];
    if (!token) return fail("Sign in required", 401);
    const verified = await admin().auth.getUser(token);
    const user = verified.data.user;
    if (verified.error || !user) return fail("Sign in required", 401);
    const { state } = await readState();
    try { member(state, user.id); } catch { return fail("Your account is not on this team", 403); }
    if (!user.email) return fail("Contact your workspace owner to set up password sign-in.");
    const text = await req.text();
    if (text.length > 4000) return fail("Password request is too large.");
    let values, finishOnboarding = false;
    try {
      const input = JSON.parse(text);
      values = passwordChange(input);
      if (input.finishOnboarding !== undefined && typeof input.finishOnboarding !== "boolean") throw new Error("Invalid onboarding request.");
      finishOnboarding = input.finishOnboarding === true;
    }
    catch (error) { return fail(error instanceof SyntaxError ? "Invalid password request." : (error as Error).message); }

    // Reauthenticate only the verified account, using an isolated non-admin session.
    // Never accept a target account or email from the request body.
    const auth = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
    const signedIn = await auth.auth.signInWithPassword({ email: user.email, password: values.currentPassword });
    if (signedIn.error || !signedIn.data.session || signedIn.data.user?.id !== user.id)
      return fail("Your current password was not accepted. Check it and try again.");
    const changed = await auth.auth.updateUser({ password: values.newPassword, current_password: values.currentPassword,
      ...(finishOnboarding ? {data: {ignited_onboarding_version: ONBOARDING_VERSION}} : {}) });
    if (changed.error) {
      if (changed.error.code === "weak_password") return fail("Choose a stronger password and try again.");
      if (changed.error.code === "same_password") return fail("Choose a password different from your current one.");
      return fail("Could not change your password. Please try again.");
    }
    // Keep the freshly verified session so the browser can continue after the change.
    return Response.json({ access_token: signedIn.data.session.access_token,
      refresh_token: signedIn.data.session.refresh_token,
      ...(finishOnboarding ? {onboardingCompleted: true} : {}) }, { headers });
  } catch {
    return fail("Could not change your password. Please try again.");
  }
}
