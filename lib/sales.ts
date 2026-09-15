/** Sales data is a read-only projection; it never enters the delivery workspace. */
export type SalesContact = { id: string; name: string; company: string; email: string; phone: string; source: string; type: string; added: string; assignedTo: string; tags: string[]; address: string; dnd: boolean | null; fields: { name: string; value: string }[] };
export type SalesEvent = { id: string; contactId: string; calendarId: string; title: string; start: string; end: string; status: string; assignedTo: string; address: string; notes: string };
export type SalesOpportunity = { id: string; contactId: string; name: string; pipelineId: string; stageId: string; status: string; value: number | null; assignedTo: string; source: string; updated: string };
export type SalesPipeline = { id: string; name: string; stages: { id: string; name: string }[] };
export type SalesData = {
  mode: "live" | "disconnected"; fetchedAt: string; start: string; end: string;
  locationId: string; contacts: SalesContact[]; events: SalesEvent[]; opportunities: SalesOpportunity[];
  calendars: { id: string; name: string }[]; pipelines: SalesPipeline[]; users: { id: string; name: string }[];
  complete: { contacts: boolean; events: boolean; opportunities: boolean }; warnings: string[];
};
export function disconnectedSales(start: string, end: string): SalesData {
  return { mode:"disconnected",fetchedAt:"",start,end,locationId:"",contacts:[],events:[],opportunities:[],calendars:[],pipelines:[],users:[],complete:{contacts:false,events:false,opportunities:false},warnings:["This preview is not connected to GHL. No sales data is shown. Open a configured private workspace and sign in to load your actual account."] };
}
export function salesRange(start: unknown, end: unknown) {
  const valid = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0,10) === v;
  if (!valid(start) || !valid(end)) throw new Error("Choose valid start and end dates.");
  const from = Date.parse(start), until = Date.parse(end) + 86400000;
  if (until <= from || until - from > 31 * 86400000) throw new Error("Choose a date range of 1 to 31 days.");
  return { start, end, from, until };
}
export function defaultSalesRange(now = new Date()) {
  return { start: new Date(now.getTime() - 29 * 86400000).toISOString().slice(0,10), end: now.toISOString().slice(0,10) };
}
export function bookedEvent(e: SalesEvent) { return ["new", "confirmed", "showed", "noshow"].includes(e.status); }
export function bookingLabel(contactId: string, events: SalesEvent[], complete: boolean) {
  const relevant = events.filter(e => e.contactId === contactId);
  if (relevant.some(bookedEvent)) return "Booked";
  if (!complete || relevant.some(e => !["cancelled", "canceled", "invalid"].includes(e.status))) return "Unknown";
  return "Not booked";
}
export function salesSummary(data: SalesData, calendarId = "") {
  const range = salesRange(data.start, data.end);
  const events = data.events.filter(e => (!calendarId || e.calendarId === calendarId) && Date.parse(e.start) >= range.from && Date.parse(e.start) < range.until);
  const bookings = events.filter(bookedEvent);
  const newLeads = data.contacts.filter(c => c.type === "lead" && Date.parse(c.added) >= range.from && Date.parse(c.added) < range.until).length;
  const booked = data.contacts.filter(c => bookingLabel(c.id, events, data.complete.events) === "Booked").length;
  const unbooked = data.contacts.filter(c => bookingLabel(c.id, events, data.complete.events) === "Not booked").length;
  return { events, bookings: bookings.length, booked, unbooked, newLeads, cancelled: events.filter(e => ["cancelled","canceled"].includes(e.status)).length, showed: events.filter(e => e.status === "showed").length, noShow: events.filter(e => e.status === "noshow").length };
}
export function contactMatches(c: SalesContact, query: string) {
  const q = query.trim().toLowerCase();
  return [c.name,c.company,c.email,c.phone,c.source,...c.tags].some(v => v.toLowerCase().includes(q));
}
export function contactUrl(locationId: string, contactId: string) {
  return `https://app.gohighlevel.com/v2/location/${encodeURIComponent(locationId)}/contacts/detail/${encodeURIComponent(contactId)}`;
}
