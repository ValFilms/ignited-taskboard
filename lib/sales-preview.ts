/** A real-data Sales preview must not mutate the shared production workspace. */
export function salesReadOnlyPreview(env: NodeJS.ProcessEnv = process.env) {
  return env.VERCEL_ENV === "preview" && !!env.GHL_PRIVATE_INTEGRATION_TOKEN;
}
export function salesPreviewAllows(path:string, method:string) {
  return (path === "/api/sales" || path === "/api/login") && method === "POST"
    || path === "/api/workspace" && (method === "GET" || method === "POST")
    || path === "/api/version" && method === "GET";
}
