import { admin, member, readState, failure } from "../../../lib/server";
import { onboardingComplete } from "../../../lib/onboarding";

// Status only. Completion is saved atomically by the password-change endpoint.
export async function POST(req: Request) {
  try {
    const token = req.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1];
    if (!token) throw new Error("Sign in required");
    const {data, error} = await admin().auth.getUser(token);
    if (error || !data.user) throw new Error("Sign in required");
    member((await readState()).state, data.user.id);
    return Response.json({completed: onboardingComplete(data.user.user_metadata)}, {headers: {"Cache-Control": "no-store"}});
  } catch (error) { return failure(error); }
}
