/** Accept review links, preserving Drive resource keys needed for link sharing. */
export function parseDriveLink(value: unknown): { kind: "folder" | "file"; url: string; previewUrl: string | null } | null {
  if (typeof value !== "string" || value.length > 2048) return null;
  try {
    const input = new URL(value.trim());
    if (input.protocol !== "https:" || input.hostname !== "drive.google.com" || input.username || input.password || input.port) return null;
    const folder = input.pathname.match(/^\/drive\/(?:u\/\d+\/)?folders\/([a-zA-Z0-9_-]+)\/?$/);
    const file = input.pathname.match(/^\/file\/d\/([a-zA-Z0-9_-]+)(?:\/(?:view|preview|edit))?\/?$/);
    if (!folder && !file) return null;
    const kind = folder ? "folder" : "file";
    const id = (folder || file)![1];
    const resourceKey = input.searchParams.get("resourcekey");
    const query = resourceKey ? `?${new URLSearchParams({ resourcekey: resourceKey })}` : "";
    return {
      kind,
      url: `https://drive.google.com/${folder ? `drive/folders/${id}` : `file/d/${id}/view`}${query}`,
      previewUrl: folder ? null : `https://drive.google.com/file/d/${id}/preview${query}`,
    };
  } catch { return null; }
}
