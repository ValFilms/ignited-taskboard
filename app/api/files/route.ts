import {
  admin,
  identity,
  readState,
  member,
  mutate,
  failure,
} from "../../../lib/server";
import { isOwner, visibleState, transition } from "../../../lib/workflow";
export async function POST(req: Request) {
  try {
    const id = await identity(req);
    const a = await req.json();
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
      return Response.json({ url: data.signedUrl });
    }
    if (!isOwner(m)) throw new Error("Owners only");
    if (c.stage !== "Filming")
      throw new Error("Client is not ready for filming");
    if (a.type === "sign") {
      if (!/^video\//.test(a.contentType) || a.size > 1024 * 1024 * 1024)
        throw new Error("Choose a video up to 1 GB");
      const name = String(a.name)
        .replace(/[^a-zA-Z0-9._-]/g, "_")
        .slice(-160);
      const path = `${c.id}/${crypto.randomUUID()}-${name}`;
      const { data, error } = await db.storage
        .from("raw-footage")
        .createSignedUploadUrl(path);
      if (error) throw new Error("Could not prepare upload");
      return Response.json({ ...data, name });
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
      for (const f of a.files)
        if (
          typeof f.path !== "string" ||
          !f.path.startsWith(c.id + "/") ||
          !data.some(
            (x) =>
              `${c.id}/${x.name}` === f.path && Number(x.metadata?.size) > 0,
          )
        )
          throw new Error("Upload has not completed");
      const next = await mutate((s) =>
        transition(s, member(s, id), {
          type: "raw",
          clientId: c.id,
          files: a.files,
        }),
      );
      return Response.json(visibleState(next, member(next, id)));
    }
    throw new Error("Unknown file action");
  } catch (e) {
    return failure(e);
  }
}
