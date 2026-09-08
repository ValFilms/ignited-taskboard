/** Retry an expired access token once; never retry validation errors or mutations that succeeded. */
export async function authenticatedRequest(
  path: string,
  body: unknown,
  token: string,
  refresh: () => Promise<string | null>,
  expire: () => void,
) {
  const send = (accessToken: string) => fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify(body),
  });
  let response = await send(token);
  if (response.status === 401) {
    const renewed = await refresh();
    if (renewed) response = await send(renewed);
    if (response.status === 401) {
      expire();
      throw new Error("Your session expired. Please sign in again.");
    }
  }
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Request failed");
  return result;
}
