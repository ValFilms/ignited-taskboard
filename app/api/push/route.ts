import { identity, readState, member, mutate, failure } from "../../../lib/server";
import { addDevice, removeDevice, pushConfigured } from "../../../lib/push-state";
import { sendPush } from "../../../lib/push-server";
export const dynamic = "force-dynamic";
export async function POST(req: Request) {
  try {
    const id = await identity(req);
    const text = await req.text();
    if (text.length > 5000) throw new Error("Request too large");
    const body = JSON.parse(text);
    const { state } = await readState(); member(state, id);
    const ok = (data: object) => Response.json(data, { headers: { "Cache-Control": "no-store" } });
    if (body.type === "status") return ok({ configured: pushConfigured(), publicKey: pushConfigured() ? process.env.WEB_PUSH_PUBLIC_KEY : null,
      enabled: !!state.pushDevices?.some(d => d.userId === id && d.endpoint === body.endpoint) });
    if (body.type === "unsubscribe") {
      await mutate(s => { member(s, id); return removeDevice(s, id, body.endpoint); }, false); return ok({ ok: true });
    }
    if (!pushConfigured()) throw new Error("Push notifications need server setup before they can be enabled");
    if (body.type === "subscribe") {
      await mutate(s => { member(s, id); return addDevice(s, id, body.subscription); }, false); return ok({ ok: true });
    }
    if (body.type === "test") {
      const saved = await mutate(s => {
        member(s, id);
        const device = s.pushDevices?.find(d => d.userId === id && d.endpoint === body.endpoint);
        if (!device) throw new Error("Enable notifications on this device first");
        if (device.lastTestAt && Date.now() - device.lastTestAt < 60000) throw new Error("Wait one minute before another test");
        device.lastTestAt = Date.now(); return s;
      }, false);
      const device = saved.pushDevices!.find(d => d.userId === id && d.endpoint === body.endpoint)!;
      try { await sendPush(device, `test:${crypto.randomUUID()}`, true); }
      catch (e) {
        if ([404, 410].includes((e as { statusCode?: number }).statusCode || 0)) {
          await mutate(s => removeDevice(s, id, device.endpoint), false);
          throw new Error("This subscription expired. Disable and re-enable push notifications.");
        }
        throw new Error("Push service could not accept the test. Try again later.");
      }
      return ok({ accepted: true });
    }
    throw new Error("Unknown push action");
  } catch (e) { return failure(e); }
}
