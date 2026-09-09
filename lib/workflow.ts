import { canReadMessage, sendMessage, type Message, type MessageInput } from "./messaging";
import type { Device, Delivery } from "./push-state";
import { parseDriveLink } from "./drive-link";
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
  kind: "edit" | "campaign" | "update" | "custom";
  createdBy?: string;
  campaignTaskId?: string;
  completedAt?: string;
  archivedAt?: string;
  archivedBy?: string;
  updatedAt?: string;
  updatedBy?: string;
  revision?: number;
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
  taskId?: string;
  messageId?: string;
  threadId?: string;
};
export type State = {
  messages?: Message[];
  pushDevices?: Device[];
  pushQueue?: Delivery[];
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
export const canManageTask = (t: Task, m: Member) => isOwner(m) || t.createdBy === m.id;
export const canAssignTask = (t: Task, m: Member) => t.kind === "custom" ||
  (t.kind === "update" ? isOwner(m) : m.role === (t.kind === "edit" ? "editor" : "campaign"));
// Only task changes invalidate an open edit form; new comments do not.
export const taskVersion = (t: Task) => JSON.stringify([t.id, t.clientId, t.kind,
  t.title, t.notes || "", t.assignee, t.dueAt, t.status, t.createdAt, t.createdBy || "",
  t.completedAt || "", t.cycle, t.archivedAt || "", t.revision || 0]);
const iso = (n: number) => new Date(n).toISOString();
const hours = (n: number) => n * 3600000;
const assert = (v: unknown, message: string) => {
  if (!v) throw new Error(message);
};
export function visibleState(s: State, m: Member): State {
  const { pushDevices: _devices, pushQueue: _queue, ...publicState } = s;
  const tasks = isOwner(m)
    ? s.tasks
    : s.tasks.filter((t) => t.assignee === m.id || t.createdBy === m.id);
  const ids = new Set(tasks.map((t) => t.clientId));
  const messages = s.messages?.filter(message => canReadMessage(s, m, message));
  const messageIds = new Set(messages?.map(message => message.id));
  return {
    ...publicState,
    ...(messages ? {messages} : {}),
    members: s.members.map(({ id, name, role }) => ({ id, name, role })),
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
    notifications: s.notifications.filter((n) => n.userId === m.id && (n.messageId ? messageIds.has(n.messageId) : (isOwner(m) || ids.has(n.clientId) || tasks.some(t => t.id === n.taskId)))),
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
  taskId?: string,
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
      ...(taskId ? { taskId } : {}),
    });
}
function owners(s: State) {
  return s.members.filter(isOwner);
}
function assign(s: State, c: Client, kind: Task["kind"], now: number, createdBy = c.owner) {
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
    createdBy,
    assignee: assignee!,
    status: "open",
    createdAt: iso(now),
    dueAt: iso(now + hours(24)),
    cycle: 0,
  };
  s.tasks.push(t);
  notice(s, t.assignee, c.id, `${c.name}: ${t.title}`, now, undefined, t.id);
  return t;
}
export function tick(s: State, now = Date.now()) {
  for (const t of s.tasks) {
    if (t.archivedAt || t.status !== "open" || !t.dueAt) continue;
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
          t.id,
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
          t.clientId === c.id && t.kind === "update" && t.status !== "done" && !t.archivedAt,
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
  message?: MessageInput;
  clientId?: string;
  taskId?: string;
  taskVersion?: string;
  value?: string;
  key?: string;
  files?: { path: string; name: string }[];
  profile?: Partial<Client>;
  member?: Member;
  task?: { title: string; assignee: string; notes?: string; dueAt?: string | null };
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
  if (a.type === "sendMessage") { sendMessage(s, m, a.message, now); return s; }
  if (a.type === "readConversation") {
    const messages = s.messages || [];
    const end = messages.findIndex(message => message.id === a.value && message.threadId === a.key && canReadMessage(s, m, message));
    if (end < 0) throw new Error("Conversation is no longer available");
    const ids = new Set(messages.slice(0, end + 1).filter(message => message.threadId === a.key && canReadMessage(s, m, message)).map(message => message.id));
    s.notifications.filter(n => n.userId === m.id && n.messageId && ids.has(n.messageId)).forEach(n => { n.read = true; });
    return s;
  }
  if (a.type === "read") {
    s.notifications
      .filter((n) => n.userId === m.id && (!a.key || n.id === a.key))
      .forEach((n) => (n.read = true));
    return s;
  }
  if (a.type === "refresh") return s;
  if (["editTask", "archiveTask", "restoreTask"].includes(a.type)) {
    const task = s.tasks.find(t => t.id === a.taskId);
    assert(task, "Task not found");
    const t = task!;
    assert(canManageTask(t, m), "Only the task assigner or owners may edit, delete or restore this task");
    assert(a.taskVersion === taskVersion(t), "This task changed while you were working. Reopen it to review the latest details and try again.");
    const client = s.clients.find(c => c.id === t.clientId);
    const previousAssignee = t.assignee;
    if (a.type === "restoreTask") {
      assert(t.archivedAt, "Task is not archived");
      assert(!t.clientId || client, "The task's client is no longer available");
      if (t.status !== "done" && client) {
        assert(client.stage !== "Closed", "This client's work is closed; the task remains in Archive");
        if (t.kind !== "custom") {
          const stage = t.kind === "edit" ? (t.status === "review" ? "In review" : "Editing") : t.kind === "campaign" ? "Campaign setup" : "Active";
          assert(client.stage === stage, "The client has moved on. This workflow task must stay in Archive");
          assert(!s.tasks.some(other => other.id !== t.id && other.clientId === t.clientId && other.kind === t.kind && !other.archivedAt && other.status !== "done"), "Another task is already active for this step. Archive it before restoring this one");
          assert(s.members.some(member => member.id === t.assignee && canAssignTask(t, member)), "The assignee's role has changed; update their team role before restoring this workflow task");
        }
      }
      delete t.archivedAt; delete t.archivedBy;
      t.cycle++;
    } else {
      assert(!t.archivedAt, "Restore this task from Archive before changing it");
      if (a.type === "archiveTask") {
        t.archivedAt = iso(now); t.archivedBy = m.id;
        // Stop old task alerts and pending deliveries, retaining their history.
        const notices = new Set(s.notifications.filter(n => n.taskId === t.id).map(n => { n.read = true; return n.id; }));
        if (s.pushQueue) s.pushQueue = s.pushQueue.filter(q => !notices.has(q.noticeId));
        // Skip this occurrence instead of instantly recreating a deleted recurring task.
        if (client?.stage === "Active" && t.kind === "update" && t.status !== "done" && (!client.nextUpdate || Date.parse(client.nextUpdate) <= now)) client.nextUpdate = iso(now + hours(84));
      } else {
        const data = a.task;
        assert(data && typeof data.title === "string" && data.title.trim() && data.title.trim().length <= 160, "Enter a task title (up to 160 characters)");
        assert(typeof data?.notes === "string" && data.notes.length <= 4000, "Task notes must be at most 4000 characters");
        assert(s.members.some(member => member.id === data?.assignee && (data.assignee === t.assignee || canAssignTask(t, member))), "Choose a team member with the matching role");
        const deadline = data?.dueAt;
        assert(deadline === null || typeof deadline === "string" && Number.isFinite(Date.parse(deadline)), "Choose a valid deadline or leave it empty");
        const dueAt = deadline ? iso(Date.parse(deadline)) : null;
        assert(dueAt === t.dueAt || dueAt === null || Date.parse(dueAt) > now, "Choose a future deadline or keep the existing one");
        assert(t.status !== "done" || data!.assignee === t.assignee, "Completed tasks keep their assignee");
        assert(t.status === "open" || dueAt === t.dueAt, "Completed tasks and tasks awaiting approval keep their deadline");
        if (t.dueAt !== dueAt || t.assignee !== data!.assignee) t.cycle++;
        t.title = data!.title.trim(); t.notes = data!.notes!.trim();
        t.assignee = data!.assignee; t.dueAt = dueAt;
      }
    }
    t.updatedAt = iso(now); t.updatedBy = m.id; t.revision = (t.revision || 0) + 1;
    const verb = a.type === "editTask" ? "updated" : a.type === "archiveTask" ? "archived" : "restored";
    for (const id of new Set([t.createdBy, t.assignee, previousAssignee])) {
      if (id && id !== m.id) notice(s, id, t.clientId, `${m.name} ${verb}: ${t.title}`, now, undefined, t.id);
    }
    s.events.push({ id: crypto.randomUUID(), clientId: t.clientId, text: `${m.name} ${verb} task: ${t.title}`, at: iso(now) });
    return s;
  }
  if (["createTask", "reassignTask", "completeTask", "reopenTask"].includes(a.type)) {
    let task = s.tasks.find(t => t.id === a.taskId);
    if (a.type === "createTask") {
      const data = a.task;
      assert(data && typeof data.title === "string" && data.title.trim() && data.title.trim().length <= 160, "Enter a task title (up to 160 characters)");
      assert(data?.notes === undefined || (typeof data.notes === "string" && data.notes.length <= 4000), "Task notes must be at most 4000 characters");
      assert(s.members.some(u => u.id === data?.assignee), "Choose a team member");
      assert(data?.dueAt === undefined || data.dueAt === null || (typeof data.dueAt === "string" && Number.isFinite(Date.parse(data.dueAt)) && Date.parse(data.dueAt) > now), "Choose a future deadline or leave it empty");
      const clientId = a.clientId || "";
      assert(typeof clientId === "string" && (!clientId || visibleState(s, m).clients.some(c => c.id === clientId && c.stage !== "Closed")), "Choose an accessible active client");
      task = { id: crypto.randomUUID(), clientId, kind: "custom", title: data!.title.trim(), assignee: data!.assignee,
        createdBy: m.id, notes: data!.notes?.trim() || "", status: "open", createdAt: iso(now),
        dueAt: data!.dueAt ? iso(Date.parse(data!.dueAt)) : null, cycle: 0 };
      s.tasks.push(task);
      notice(s, task.assignee, clientId, `${m.name} assigned you: ${task.title}`, now, undefined, task.id);
    } else {
      assert(task?.kind === "custom", "Task not found");
      assert(isOwner(m) || task!.assignee === m.id || task!.createdBy === m.id, "Only task participants may manage this task");
      assert(!task!.archivedAt, "Restore this task from Archive before changing it");
      if (a.type === "reassignTask") {
        assert(canManageTask(task!, m), "Only the task assigner or owners may reassign this task");
        assert(task!.status === "open", "Reopen the task before reassigning it");
        assert(s.members.some(u => u.id === a.value), "Choose a team member");
        if (task!.assignee === a.value) return s;
        const previous = task!.assignee;
        task!.assignee = a.value!;
        task!.cycle++;
        notice(s, task!.assignee, task!.clientId, `${m.name} assigned you: ${task!.title}`, now, undefined, task!.id);
        notice(s, previous, task!.clientId, `${m.name} reassigned: ${task!.title}`, now, undefined, task!.id);
      } else {
        const complete = a.type === "completeTask";
        assert(task!.status === (complete ? "open" : "done"), complete ? "Task is already complete" : "Task is already open");
        task!.status = complete ? "done" : "open";
        task!.completedAt = complete ? iso(now) : undefined;
        if (!complete) task!.cycle++;
        for (const id of new Set([task!.createdBy, task!.assignee])) {
          if (id && id !== m.id) notice(s, id, task!.clientId, `${m.name} ${complete ? "completed" : "reopened"}: ${task!.title}`, now, undefined, task!.id);
        }
      }
    }
    s.events.push({ id: crypto.randomUUID(), clientId: task!.clientId, text: `${m.name}: ${a.type} — ${task!.title}`, at: iso(now) });
    return s;
  }
  if (a.type === "member") {
    assert(isOwner(m), "Owners only");
    const u = a.member;
    assert(
      u && typeof u.id === "string" && u.id.trim() && typeof u.name === "string" && u.name.trim() && u.name.length <= 100 && ["manager", "editor", "campaign"].includes(u.role),
      "Invalid member",
    );
    assert(
      !s.members.some((x) => x.id === u!.id.trim() && x.role === "approver"),
      "Approver is configured by the administrator",
    );
    const i = s.members.findIndex((x) => x.id === u!.id.trim());
    const normalized = { id: u!.id.trim(), name: u!.name.trim(), role: u!.role };
    const username = normalized.name.split(/\s+/)[0].toLowerCase();
    assert(!s.members.some(x => x.id !== normalized.id && x.name.trim().split(/\s+/)[0].toLowerCase() === username), "Choose a unique first name for username sign-in");
    assert(!s.clients.some(c => c.owner === normalized.id) || isOwner(normalized), "Reassign this member's clients before changing their role");
    assert(!s.tasks.some(t => t.assignee === normalized.id && t.status !== "done" && t.kind !== "custom" && (t.kind === "update" ? !isOwner(normalized) : normalized.role !== (t.kind === "edit" ? "editor" : "campaign"))), "Reassign open tasks before changing this member's role");
    if (i >= 0) s.members[i] = normalized;
    else s.members.push(normalized);
    return s;
  }
  const c = s.clients.find((c) => c.id === a.clientId);
  assert(c, "Client not found");
  const client = c!;
  const t = s.tasks.find((t) => t.id === a.taskId && t.clientId === client.id);
  assert(!t?.archivedAt, "Restore this task from Archive before changing it");
  const own = () => assert(isOwner(m), "Owners only");
  const assigned = () =>
    assert(
      t && t.assignee === m.id,
      "Only the assigned team member may submit this task",
    );
  switch (a.type) {
    case "reassign":
      own();
      assert(t && t.kind !== "custom" && t.status !== "done", "Choose an open workflow task");
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
      if (t!.assignee === a.value) return s;
      t!.assignee = a.value!;
      t!.cycle++;
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
            !t.archivedAt &&
            t.status !== "done",
        )
        .forEach((t) => {
          if (t.assignee === client.owner) return;
          t.assignee = client.owner;
          notice(s, t.assignee, client.id, `${client.name}: assigned ${t.title}. Deadline unchanged.`, now);
        });
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
      assign(s, client, "edit", now, m.id);
      break;
    case "submit":
      assigned();
      assert(
        t?.kind === "edit" && t.status === "open" && client.stage === "Editing",
        "Editing is not open",
      );
      const submittedLink = parseDriveLink(a.value);
      assert(submittedLink, "Use a Google Drive folder or file link");
      client.driveUrl = submittedLink!.url;
      client.stage = "In review";
      t!.status = "review";
      t!.dueAt = null;
      for (const u of s.members.filter((u) => u.role === "approver"))
        notice(
          s,
          u.id,
          client.id,
          `${client.name}: ${submittedLink!.kind === "folder" ? "edited video folder" : "video"} ready for approval`,
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
      assign(s, client, "campaign", now, m.id);
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
      if (!s.tasks.some(task => task.campaignTaskId === t!.id)) {
        const candidates = s.members.filter(u => u.name.trim().split(/\s+/)[0].toLowerCase() === "yaniv");
        assert(candidates.length === 1, "Configure one team member named Yaniv before completing campaign setup.");
        const integration: Task = {
          id: crypto.randomUUID(), clientId: client.id, kind: "custom",
          campaignTaskId: t!.id, createdBy: client.owner, assignee: candidates[0].id,
          title: "Integrate Closebot with GHL and Facebook",
          notes: "Connect Closebot to this client's GHL subaccount and Facebook account. Verify both connections and the lead flow, then mark this task complete.",
          status: "open", createdAt: iso(now), dueAt: null, cycle: 0,
        };
        s.tasks.push(integration);
        notice(s, integration.assignee, client.id, `${client.name}: ${integration.title}`, now,
          `campaign-closebot:${t!.id}`, integration.id);
      }
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
        .filter((t) => t.clientId === client.id && !t.archivedAt)
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
