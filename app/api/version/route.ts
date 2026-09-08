import release from "../../../release.json";

export const dynamic = "force-dynamic";

export function GET() {
  return Response.json(
    {
      version: release.version,
      environment: process.env.VERCEL_ENV || "development",
      commit: process.env.VERCEL_GIT_COMMIT_SHA || null,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
