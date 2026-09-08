import {
  admin,
  identity,
  readState,
  member,
  mutate,
  failure,
} from "../../../lib/server";
import { isOwner, visibleState, transition } from "../../../lib/workflow";
const videoTypes = new Set(["video/mp4", "video/quicktime", "video/webm", "video/x-m4v"]);
const maxSize = 50 * 1024 * 1024;
const headers = { "Cache-Control": "no-store" };
export async function POST(req: Request) {
  try {
    const id = await identity(req);
    const body = await req.text();
    if (body.length > 32000) throw new Error("Request too large");
    const a = JSON.parse(body);
    const { state } = await readState();
    const m = member(state, id);
    const c = visibleState(state, m).clients.find((c) => c.id === a.clientId);
    if (!c) throw new Error("Client not found");
    const db = admin();
    if (a.type === "download") {
      const file = c.rawFiles.find((f) => f.path === a.path);
      if (!file) throw new Error("File not found");
      const { data, error } = await db.storage
        .from("raw-footage")
        .createSignedUrl(file.path, 300);
      if (error) throw new Error("Could not open file");
      return Response.json({ url: data.signedUrl }, { headers });
    }
    if (!isOwner(m)) throw new Error("Owners only");
    if (c.stage !== "Filming")
      throw new Error("Client is not ready for filming");
    if (a.type === "sign") {
      if (!videoTypes.has(a.contentType) || !Number.isSafeInteger(a.size) || a.size <= 0 || a.size > maxSize)
        throw new Error("Choose an MP4, MOV, WebM or M4V video between 1 byte and 50 MB");
      if (typeof a.name !== "string" || !a.name.trim() || a.name.length > 255)
        throw new Error("Choose a file with a valid name");
      const name = a.name
        .replace(/[^a-zA-Z0-9._-]/g, "_")
        .slice(-160);
      const path = `${c.id}/${crypto.randomUUID()}-${name}`;
      const { data, error } = await db.storage
        .from("raw-footage")
        .createSignedUploadUrl(path);
      if (error) throw new Error("Could not prepare upload");
      return Response.json({ ...data, name }, { headers });
    }
    if (a.type === "complete") {
      if (
        !Array.isArray(a.files) ||
        a.files.length === 0 ||
        a.files.length > 20
      )
        throw new Error("Choose 1–20 files");
      const { data, error } = await db.storage
        .from("raw-footage")
        .list(c.id, { limit: 1000 });
      if (error) throw new Error("Could not verify uploads");
      const paths = new Set<string>();
      for (const f of a.files) {
        if (
          !f ||
          typeof f.path !== "string" ||
          typeof f.name !== "string" || !f.name.trim() || f.name.length > 255 ||
          paths.has(f.path) ||
          !f.path.startsWith(c.id + "/") ||
          !data.some(
            (x) =>
              `${c.id}/${x.name}` === f.path && Number(x.metadata?.size) > 0 &&
              Number(x.metadata?.size) <= maxSize && videoTypes.has(x.metadata?.mimetype || ""),
          )
        )
          throw new Error("Upload has not completed");
        paths.add(f.path);
      }
      const next = await mutate((s) =>
        transition(s, member(s, id), {
          type: "raw",
          clientId: c.id,
          files: a.files.map((f: {path: string; name: string}) => ({path: f.path, name: f.name})),
        }),
      );
      return Response.json(visibleState(next, member(next, id)), { headers });
    }
    throw new Error("Unknown file action");
  } catch (e) {
    return failure(e);
  }
}
