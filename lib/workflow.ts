export type Role = "approver" | "manager" | "editor" | "campaign";
export type Stage =
  | "Onboarding"
  | "Filming"
  | "Editing"
  | "In review"
  | "Campaign setup"
  | "Ready to launch"
  | "Trial"
  | "Active"
  | "Closed";
export type Member = { id: string; name: string; role: Role };
export type Task = {
  id: string;
  clientId: string;
  title: string;
  kind: "edit" | "campaign" | "update";
  assignee: string;
  status: "open" | "review" | "done";
  createdAt: string;
  dueAt: string | null;
  cycle: number;
  notes?: string;
};
export type Client = {
  id: string;
  sourceId: string;
  name: string;
  person: string;
  email: string;
  location: string;
  owner: string;
  stage: Stage;
  createdAt: string;
  onboarding: Record<string, boolean>;
  offer: string;
  phone: string;
  closebot: string;
  driveUrl?: string;
  rawFiles: { path: string; name: string }[];
  launchCall: boolean;
  paymentConfirmed: boolean;
  launchedAt?: string;
  trialEnd?: string;
  nextUpdate?: string;
};
export type Notice = {
  id: string;
  userId: string;
  clientId: string;
  text: string;
  createdAt: string;
  read: boolean;
};
export type State = {
  members: Member[];
  clients: Client[];
  tasks: Task[];
  notifications: Notice[];
  events: { id: string; clientId: string; text: string; at: string }[];
};
export const stages: Stage[] = [
  "Onboarding",
  "Filming",
  "Editing",
  "In review",
  "Campaign setup",
  "Ready to launch",
  "Trial",
  "Active",
  "Closed",
];
export const checklist = [
  "Ad account access",
  "GHL access / subaccount",
  "GHL training",
  "Business intake",
];
export const isOwner = (m: Member) =>
  m.role === "approver" || m.role === "manager";
const iso = (n: number) => new Date(n).toISOString();
const hours = (n: number) => n * 3600000;
const assert = (v: unknown, message: string) => {
  if (!v) throw new Error(message);
};
export function visibleState(s: State, m: Member): State {
  const tasks = isOwner(m)
    ? s.tasks
    : s.tasks.filter((t) => t.assignee === m.id);
  const ids = new Set(tasks.map((t) => t.clientId));
  return {
    ...s,
    members: isOwner(m) ? s.members : s.members.filter((u) => u.id === m.id),
    tasks,
    clients: s.clients
      .filter((c) => isOwner(m) || ids.has(c.id))
      .map((c) =>
        isOwner(m)
          ? c
          : {
              ...c,
              email: "",
              phone: "",
              closebot: "",
              onboarding: {},
              paymentConfirmed: false,
            },
      ),
    notifications: s.notifications.filter((n) => n.userId === m.id),
    events: isOwner(m) ? s.events : [],
  };
}
function notice(
  s: State,
  userId: string,
  clientId: string,
  text: string,
  now: number,
  key?: string,
) {
  const id = key || crypto.randomUUID();
  if (!s.notifications.some((n) => n.id === id))
    s.notifications.push({
      id,
      userId,
      clientId,
      text,
      createdAt: iso(now),
      read: false,
    });
}
function owners(s: State) {
  return s.members.filter(isOwner);
}
function assign(s: State, c: Client, kind: Task["kind"], now: number) {
  const role = kind === "edit" ? "editor" : "campaign";
  const assignee =
    kind === "update" ? c.owner : s.members.find((m) => m.role === role)?.id;
  assert(assignee, `Configure a ${role} team member first.`);
  const t: Task = {
    id: crypto.randomUUID(),
    clientId: c.id,
    title:
      kind === "edit"
        ? "Edit location shout-outs"
        : kind === "campaign"
          ? "Set up ad campaign"
          : "Send client progress update",
    kind,
    assignee: assignee!,
    status: "open",
    createdAt: iso(now),
    dueAt: iso(now + hours(24)),
    cycle: 0,
  };
  s.tasks.push(t);
  notice(s, t.assignee, c.id, `${c.name}: ${t.title}`, now);
  return t;
}
export function tick(s: State, now = Date.now()) {
  for (const t of s.tasks) {
    if (t.status !== "open" || !t.dueAt) continue;
    const due = Date.parse(t.dueAt),
      created = Date.parse(t.createdAt);
    const phase =
      now >= due
        ? "overdue"
        : now >= due - hours(6) && due - created > hours(6)
          ? "soon"
          : null;
    if (phase)
      for (const id of new Set([
        t.assignee,
        ...s.members.filter((m) => m.role === "approver").map((m) => m.id),
      ]))
        notice(
          s,
          id,
          t.clientId,
          `${t.title}: ${phase === "overdue" ? "overdue" : "due within 6 hours"}`,
          now,
          `${t.id}:${t.cycle}:${phase}:${id}`,
        );
  }
  for (const c of s.clients) {
    if (
      c.stage === "Trial" &&
      c.trialEnd &&
      now >= Date.parse(c.trialEnd) - hours(72)
    )
      for (const m of owners(s))
        notice(
          s,
          m.id,
          c.id,
          `${c.name}: trial review / conversion due ${new Date(c.trialEnd).toLocaleDateString("en-US", { timeZone: "America/New_York" })}`,
          now,
          `${c.id}:trial:${m.id}`,
        );
    if (
      c.stage === "Active" &&
      c.nextUpdate &&
      now >= Date.parse(c.nextUpdate) &&
      !s.tasks.some(
        (t) =>
          t.clientId === c.id && t.kind === "update" && t.status !== "done",
      )
    ) {
      assign(s, c, "update", now);
      c.nextUpdate = iso(now + hours(84));
    }
  }
  return s;
}
export type Action = {
  type: string;
  clientId?: string;
  taskId?: string;
  value?: string;
  key?: string;
  files?: { path: string; name: string }[];
  profile?: Partial<Client>;
  member?: Member;
};
export function transition(
  input: State,
  m: Member,
  a: Action,
  now = Date.now(),
): State {
  const s = structuredClone(input);
  assert(
    s.members.some((u) => u.id === m.id && u.role === m.role),
    "Unauthorized",
  );
  if (a.type === "read") {
    s.notifications
      .filter((n) => n.userId === m.id)
      .forEach((n) => (n.read = true));
    return s;
  }
  if (a.type === "member") {
    assert(isOwner(m), "Owners only");
    const u = a.member;
    assert(
      u && u.id && u.name && ["manager", "editor", "campaign"].includes(u.role),
      "Invalid member",
    );
    assert(
      !s.members.some((x) => x.id === u!.id && x.role === "approver"),
      "Approver is configured by the administrator",
    );
    const i = s.members.findIndex((x) => x.id === u!.id);
    if (i >= 0) s.members[i] = u!;
    else s.members.push(u!);
    return s;
  }
  const c = s.clients.find((c) => c.id === a.clientId);
  assert(c, "Client not found");
  const client = c!;
  const t = s.tasks.find((t) => t.id === a.taskId && t.clientId === client.id);
  const own = () => assert(isOwner(m), "Owners only");
  const assigned = () =>
    assert(
      t && t.assignee === m.id,
      "Only the assigned team member may submit this task",
    );
  switch (a.type) {
    case "reassign":
      own();
      assert(t && t.status !== "done", "Choose an open task");
      assert(
        s.members.some(
          (u) =>
            u.id === a.value &&
            (t!.kind === "update"
              ? isOwner(u)
              : u.role === (t!.kind === "edit" ? "editor" : "campaign")),
        ),
        "Choose a team member with the matching role",
      );
      t!.assignee = a.value!;
      notice(
        s,
        t!.assignee,
        client.id,
        `${client.name}: assigned ${t!.title}. Deadline unchanged.`,
        now,
      );
      break;
    case "profile":
      own();
      for (const k of ["offer", "phone", "closebot", "person", "email", "location"] as const)
        if (typeof a.profile?.[k] === "string") client[k] = a.profile[k]!;
      break;
    case "owner":
      own();
      assert(
        s.members.some((u) => u.id === a.value && isOwner(u)),
        "Choose an owner",
      );
      client.owner = a.value!;
      s.tasks
        .filter(
          (t) =>
            t.clientId === client.id &&
            t.kind === "update" &&
            t.status !== "done",
        )
        .forEach((t) => (t.assignee = client.owner));
      break;
    case "check":
      own();
      assert(
        client.stage === "Onboarding" && checklist.includes(a.key!),
        "Invalid checklist item",
      );
      client.onboarding[a.key!] = !client.onboarding[a.key!];
      break;
    case "onboard":
      own();
      assert(
        client.stage === "Onboarding" &&
          checklist.every((k) => client.onboarding[k]),
        "Complete all onboarding items first",
      );
      client.stage = "Filming";
      for (const u of owners(s))
        notice(
          s,
          u.id,
          client.id,
          `${client.name}: onboarding complete. Ready to film.`,
          now,
        );
      break;
    case "raw":
      own();
      assert(client.stage === "Filming", "Client must be ready for filming");
      assert(a.files?.length, "Upload footage first");
      client.rawFiles = a.files!;
      client.stage = "Editing";
      assign(s, client, "edit", now);
      break;
    case "submit":
      assigned();
      assert(
        t?.kind === "edit" && t.status === "open" && client.stage === "Editing",
        "Editing is not open",
      );
      assert(
        /^https:\/\/drive\.google\.com\/file\/d\/[a-zA-Z0-9_-]+(?:\/|$)/.test(
          a.value || "",
        ),
        "Use a Google Drive file link",
      );
      client.driveUrl = a.value;
      client.stage = "In review";
      t!.status = "review";
      t!.dueAt = null;
      for (const u of s.members.filter((u) => u.role === "approver"))
        notice(
          s,
          u.id,
          client.id,
          `${client.name}: video ready for approval`,
          now,
        );
      break;
    case "revise":
      assert(m.role === "approver", "Only the ad approver may review");
      assert(
        client.stage === "In review" &&
          t?.kind === "edit" &&
          t.status === "review",
        "No edit awaiting review",
      );
      assert(a.value?.trim(), "Add revision instructions");
      client.stage = "Editing";
      t!.status = "open";
      t!.notes = a.value;
      t!.createdAt = iso(now);
      t!.dueAt = iso(now + hours(6));
      t!.cycle++;
      notice(
        s,
        t!.assignee,
        client.id,
        `${client.name}: revisions requested. Due in 6 hours.`,
        now,
      );
      break;
    case "approve":
      assert(m.role === "approver", "Only the ad approver may approve");
      assert(
        client.stage === "In review" &&
          t?.kind === "edit" &&
          t.status === "review",
        "No edit awaiting review",
      );
      t!.status = "done";
      client.stage = "Campaign setup";
      assign(s, client, "campaign", now);
      break;
    case "campaign":
      assigned();
      assert(
        client.stage === "Campaign setup" &&
          t?.kind === "campaign" &&
          t.status === "open",
        "Campaign setup is not open",
      );
      t!.status = "done";
      t!.dueAt = null;
      client.stage = "Ready to launch";
      for (const u of owners(s))
        notice(
          s,
          u.id,
          client.id,
          `${client.name}: campaign ready. Complete the launch call.`,
          now,
        );
      break;
    case "launchCheck":
      own();
      assert(
        client.stage === "Ready to launch" &&
          ["launchCall", "paymentConfirmed"].includes(a.key!),
        "Invalid launch check",
      );
      if (a.key === "launchCall") client.launchCall = !client.launchCall;
      else client.paymentConfirmed = !client.paymentConfirmed;
      break;
    case "launch":
      own();
      assert(
        client.stage === "Ready to launch" &&
          client.launchCall &&
          client.paymentConfirmed,
        "Confirm launch call and external payment setup first",
      );
      client.stage = "Trial";
      client.launchedAt = iso(now);
      client.trialEnd = iso(now + hours(24 * 14));
      break;
    case "continue":
      own();
      assert(client.stage === "Trial", "Client is not in trial");
      client.stage = "Active";
      client.nextUpdate = iso(now + hours(60));
      break;
    case "close":
      own();
      assert(
        ["Trial", "Active"].includes(client.stage),
        "Only a trial or active client can be closed",
      );
      client.stage = "Closed";
      s.tasks
        .filter((t) => t.clientId === client.id)
        .forEach((t) => {
          t.status = "done";
          t.dueAt = null;
        });
      break;
    case "update":
      assigned();
      assert(t?.kind === "update" && t.status === "open", "Update is not open");
      assert(a.value?.trim(), "Record a short update summary");
      t!.status = "done";
      t!.dueAt = null;
      t!.notes = a.value;
      break;
    default:
      throw new Error("Unknown action");
  }
  s.events.push({
    id: crypto.randomUUID(),
    clientId: client.id,
    text: `${m.name}: ${a.type}${a.type === "revise" ? ` — ${a.value}` : ""}`,
    at: iso(now),
  });
  return s;
}
export function importClient(
  s: State,
  p: {
    sourceId: string;
    name: string;
    person: string;
    email: string;
    location: string;
    phone?: string;
    offer?: string;
    historical?: boolean;
  },
  now = Date.now(),
) {
  assert(
    p.sourceId.trim() && p.name.trim(),
    "Submission ID and business name are required",
  );
  const existing = s.clients.find((c) => c.sourceId === p.sourceId);
  if (existing) {
    // Refresh source fields without resetting work or erasing manually completed contacts.
    existing.name = p.name;
    existing.location = p.location;
    if (p.phone !== undefined) existing.phone = p.phone;
    if (p.offer !== undefined) existing.offer = p.offer;
    if (p.person.trim()) existing.person = p.person;
    if (p.email.trim()) existing.email = p.email;
    return s;
  }
  assert(
    !s.clients.some(
      (c) =>
        ((Boolean(p.email.trim()) && c.email.toLowerCase() === p.email.toLowerCase()) ||
          (Boolean(p.phone?.trim()) && c.phone === p.phone)) &&
        c.name.toLowerCase() === p.name.toLowerCase(),
    ),
    "Potential duplicate: review the existing business before importing",
  );
  const owner = s.members.find((m) => m.role === "approver");
  assert(owner, "Configure the approver first");
  const c: Client = {
    id: crypto.randomUUID(),
    sourceId: p.sourceId,
    name: p.name,
    person: p.person,
    email: p.email,
    location: p.location,
    owner: owner!.id,
    stage: "Onboarding",
    createdAt: iso(now),
    onboarding: Object.fromEntries(checklist.map((k) => [k, false])),
    offer: p.offer || "",
    phone: p.phone || "",
    closebot: "",
    rawFiles: [],
    launchCall: false,
    paymentConfirmed: false,
  };
  s.clients.push(c);
  if (!p.historical)
    for (const m of owners(s))
      notice(
        s,
        m.id,
        c.id,
        `${c.name}: form received. Complete onboarding.`,
        now,
      );
  return s;
}
