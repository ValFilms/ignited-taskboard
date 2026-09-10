"use client";
import { useEffect, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import {
  ArrowUpRight,
  Archive,
  Bell,
  MessageCircle,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Flame,
  LayoutDashboard,
  ListTodo,
  Search,
  Settings,
  Users,
  X,
  Upload,
  Play,
  LogOut,
  Plus,
  ArrowLeft,
  Pause,
  Link as LinkIcon,
} from "lucide-react";
import {
  Action,
  Client,
  Member,
  State,
  Task,
  checklist,
  canManageTask,
  isOwner,
  stages,
  transition,
  visibleState,
} from "../lib/workflow";
import { demoState } from "../lib/demo";
import NotificationToasts from "./notification-toasts";
import { authenticatedRequest } from "../lib/auth-request";
import ThemeToggle from "./theme-toggle";
import ProfileMenu from "./profile-menu";
import TeamTask from "./team-task";
import PipelineControls from "./pipeline-controls";
import TeamChat, { TaskDiscussion } from "./team-chat";
import PushSettings from "./push-settings";
import PasswordSettings from "./password-settings";
import GuidedCoach from "./guided-coach";
import { practiceId, practiceState, practiceAction, tourSteps, actionMilestones } from "../lib/guided-tour";
import { parseDriveLink } from "../lib/drive-link";
import { tasksForView } from "../lib/task-views";
const serverConfigured =
  !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
  !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const workspaceAuth = serverConfigured
  ? createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    )
  : null;
type View =
  "board" | "work" | "approvals" | "notifications" | "settings" | "sales" | "chat";
function date(value?: string | null) {
  return value
    ? new Date(value).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : "Paused for approval";
}
function due(t?: Task) {
  if (!t) return "Next step ready";
  if (t.archivedAt) return "Archived";
  if (t.status === "review") return "Clock paused";
  if (t.status === "done") return "Complete";
  if (!t.dueAt) return "No deadline";
  const h = Math.ceil((Date.parse(t.dueAt) - Date.now()) / 3600000);
  return h < 0
    ? `${Math.abs(h)}h overdue`
    : h === 0
      ? "Due now"
      : `Due in ${h}h`;
}
function initials(name: string) {
  return name
    .split(" ")
    .map((x) => x[0])
    .slice(0, 2)
    .join("");
}
export default function Workspace({practiceMember,onPracticeFinish,onPracticeExit}:{practiceMember?:Member;onPracticeFinish?:()=>void;onPracticeExit?:()=>void}={}) {
  const configured=serverConfigured&&!practiceMember, auth=practiceMember?null:workspaceAuth;
  const [tourIndex,setTourIndex]=useState(0), [tourEvents,setTourEvents]=useState<string[]>([]), [profileOpen,setProfileOpen]=useState(false);
  const [chatThread, setChatThread] = useState("");
  const [commentTaskId, setCommentTaskId] = useState<string | null>(null);
  const [taskDialog, setTaskDialog] = useState<{ id?: string; clientId?: string } | null>(null);
  const [taskFilter, setTaskFilter] = useState("mine");
  const [archiveQuery, setArchiveQuery] = useState("");
  const [stageFilter, setStageFilter] = useState("all");
  const [activeClientsOpen, setActiveClientsOpen] = useState(false);
  const activeGroupRef = useRef<HTMLButtonElement>(null);
  const activeListHeadingRef = useRef<HTMLHeadingElement>(null);
  const returnToActiveGroup = useRef(false);
  const changes = useRef(0);
  const currentUser = useRef("");
  const [all, setAll] = useState<State | null>(null),
    [token, setToken] = useState(""),
    [userId, setUserId] = useState(practiceMember?practiceId(practiceMember.role):"owner"),
    [view, setView] = useState<View>(practiceMember?"settings":"board"),
    [selected, setSelected] = useState<string | null>(null),
    [query, setQuery] = useState(""),
    [ownerFilter, setOwnerFilter] = useState("all"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [value, setValue] = useState(""),
    [uploadFiles, setUploadFiles] = useState<File[]>([]),
    [memberId, setMemberId] = useState(""),
    [memberName, setMemberName] = useState(""),
    [memberRole, setMemberRole] = useState<Member["role"]>("editor");
  useEffect(() => { setActiveClientsOpen(false); }, [view, userId]);
  useEffect(() => {
    if (activeClientsOpen) {
      activeListHeadingRef.current?.focus();
      activeListHeadingRef.current?.scrollIntoView({ block: "start" });
    } else if (returnToActiveGroup.current) {
      activeGroupRef.current?.focus();
      returnToActiveGroup.current = false;
    }
  }, [activeClientsOpen]);
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("inbox") === "1") setView("notifications");
    if (!auth) {
      setAll(practiceMember?practiceState(practiceMember):demoState());
      return;
    }
    const {
      data: { subscription },
    } = auth.auth.onAuthStateChange((_event, session) => {
      if (currentUser.current !== (session?.user.id || "")) {
        currentUser.current = session?.user.id || "";
        changes.current++;
        setAll(null);
        setSelected(null);
        setTaskDialog(null);
        setView(new URLSearchParams(window.location.search).get("inbox") === "1" ? "notifications" : "board");
        setError("");
      }
      setToken(session?.access_token || "");
      setUserId(session?.user.id || "");
      if (!session) setAll(null);
    });
    return () => subscription.unsubscribe();
  }, []);
  useEffect(() => {
    if (!token) return;
    let active = true;
    let loading = false;
    const load = async () => {
      if (loading || document.visibilityState === "hidden") return;
      loading = true;
      const revision = changes.current;
      try {
        const j = await api("/api/workspace", { type: "refresh" });
        if (active && revision === changes.current) {
          setAll(j);
          setError("");
        }
      } catch (e) {
        if (active && revision === changes.current) setError((e as Error).message);
      } finally { loading = false; }
    };
    void load();
    const timer = setInterval(load, view === "chat" || taskDialog || commentTaskId || selected ? 5000 : 15000);
    document.addEventListener("visibilitychange", load);
    return () => {
      active = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", load);
    };
  }, [token, view, taskDialog, commentTaskId, selected]);
  useEffect(() => { setChatThread(""); setCommentTaskId(null); }, [userId]);
  const me = all?.members.find((x) => x.id === userId);
  const s = all && me ? visibleState(all, me) : null;
  const owner = me ? isOwner(me) : false;
  useEffect(() => {
    if (me && !isOwner(me) && ["board", "approvals", "sales"].includes(view)) setView("work");
  }, [me, view]);
  useEffect(() => {
    if (!all || !me || practiceMember) return;
    const context = (
      document as unknown as {
        modelContext?: {
          registerTool: (
            tool: unknown,
            options: { signal: AbortSignal },
          ) => void;
        };
      }
    ).modelContext;
    if (!context) return;
    const lifecycle = new AbortController();
    try {
      context.registerTool(
        {
          name: "open_client_details",
          description:
            "Open a client visible to the signed-in team member. Does not modify records.",
          inputSchema: {
            type: "object",
            properties: { clientId: { type: "string" } },
            required: ["clientId"],
            additionalProperties: false,
          },
          annotations: { readOnlyHint: true },
          execute: (input: { clientId: string }) => {
            const c = visibleState(all, me).clients.find(
              (c) => c.id === input.clientId,
            );
            if (!c) throw new Error("Client not found");
            setSelected(c.id);
            return { id: c.id, name: c.name, stage: c.stage };
          },
        },
        { signal: lifecycle.signal },
      );
    } catch {
      /* Optional browser API. */
    }
    return () => lifecycle.abort();
  }, [all, me, practiceMember]);
  useEffect(() => {
    if (!selected) return;
    const previous = document.activeElement as HTMLElement | null;
    const dialog = document.querySelector<HTMLElement>(practiceMember?'[data-practice-workspace] [role="dialog"]':'[role="dialog"]');
    const focusable = () =>
      Array.from(
        dialog?.querySelectorAll<HTMLElement>(
          "button:not([disabled]),a[href],input,textarea,select",
        ) || [],
      );
    focusable()[0]?.focus();
    const oldOverflow = document.body.style.overflow;
    if(!practiceMember)document.body.style.overflow = "hidden";
    const key = (e: KeyboardEvent) => {
      if (document.querySelector("dialog[open]")) return;
      if (e.key === "Escape") setSelected(null);
      if (e.key === "Tab") {
        const els = focusable(),
          first = els[0],
          last = els.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      if(!practiceMember)document.body.style.overflow = oldOverflow;
      previous?.focus();
    };
  }, [selected]);
  function expireSession() {
    changes.current++;
    currentUser.current = "";
    setToken("");
    setAll(null);
    setSelected(null);
    setError("Your session expired. Please sign in again.");
    void auth!.auth.signOut({ scope: "local" });
  }
  async function signOut() {
    try {
      const registration = "serviceWorker" in navigator ? await navigator.serviceWorker.getRegistration() : null;
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) { await api("/api/push", { type: "unsubscribe", endpoint: subscription.endpoint }); await subscription.unsubscribe(); }
    } catch { /* Push payloads contain no private task details; sign-out must still work. */ }
    changes.current++;
    currentUser.current = "";
    setAll(null);
    setToken("");
    setSelected(null);
    setTaskDialog(null);
    setError("");
    setPassword("");
    await auth!.auth.signOut({ scope: "local" });
  }
  async function api(path: string, body: unknown) {
    if(practiceMember) throw new Error("Practice does not connect to live accounts, files or notifications.");
    return authenticatedRequest(path, body, token, async () => {
      const { data, error } = await auth!.auth.refreshSession();
      return error ? null : data.session?.access_token || null;
    }, expireSession);
  }
  async function act(a: Action) {
    if (!all || !me) return false;
    setBusy(true);
    const actor = currentUser.current;
    changes.current++;
    setError("");
    try {
      const next = configured ? await api("/api/workspace", a) : practiceMember ? practiceAction(all,me,a) : transition(all, me, a);
      if (actor === currentUser.current) { changes.current++; setAll(next); }
      if(practiceMember)setTourEvents(old=>[...old,...actionMilestones(a,me)]);
      setValue("");
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    if(practiceMember)return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/login", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: email, password }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Sign in failed.");
      const session = await auth!.auth.setSession(result);
      if (session.error) throw session.error;
      setPassword("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign in failed.");
    } finally { setBusy(false); }
  }
  async function upload(c: Client) {
    setBusy(true);
    const actor = currentUser.current;
    changes.current++;
    setError("");
    try {
      if (!configured)
        throw new Error(
          "Raw uploads require the private workspace connection. Sample data stays in this browser session.",
        );
      const files = [];
      for (const file of uploadFiles) {
        const signed = await api("/api/files", {
          type: "sign",
          clientId: c.id,
          name: file.name,
          contentType: file.type,
          size: file.size,
        });
        const { error } = await auth!.storage
          .from("raw-footage")
          .uploadToSignedUrl(signed.path, signed.token, file, {
            contentType: file.type,
          });
        if (error) throw error;
        files.push({ path: signed.path, name: file.name });
      }
      const next = await api("/api/files", { type: "complete", clientId: c.id, files });
      if (actor === currentUser.current) { changes.current++; setAll(next); }
      setUploadFiles([]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function download(c: Client, path: string) {
    try {
      const { url } = await api("/api/files", {
        type: "download",
        clientId: c.id,
        path,
      });
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function enterTourStep(index:number){
    const id=tourSteps(practiceMember!.role)[index].id;
    setTourIndex(index);setError("");setValue("");setCommentTaskId(null);
    if(!['assign','comment','complete','integration'].includes(id))setTaskDialog(null);
    if(!['onboard','upload','submit','campaign','revise','approve','launch'].includes(id))setSelected(null);
    if(['received','new','sent','edit','campaign-open','integration-open'].includes(id)){setView('work');setTaskFilter('mine');}
    if(['comment','complete'].includes(id))setTaskDialog({id:'tour-received'});
    if(id==='assign')setTaskDialog({});
    if(id==='client')setView('board');
    if(['onboard','upload'].includes(id))setSelected('demo-5');
    if(id==='submit')setSelected('demo-1');
    if(id==='campaign')setSelected('demo-2');
    if(id==='review')setView('approvals');
    if(id==='revise')setSelected('demo-0');
    if(id==='approve'){
      // Simulate only the other person's resubmission in this isolated exercise.
      setAll(old=>{if(!old)return old;const task=old.tasks.find(t=>t.id==='edit-0');if(task?.status!=='open')return old;
        return practiceAction(old,old.members.find(m=>m.id==='john')!,{type:'submit',clientId:'demo-0',taskId:'edit-0',value:'https://drive.google.com/drive/folders/practice-edits'});});
      setSelected('demo-0');
    }
    if(id==='launch')setSelected('demo-3');
    if(id==='integration')setTaskDialog({id:'tour-closebot'});
    if(['team-open','direct-open'].includes(id)){setView('chat');setChatThread('');}
    if(id==='team-send'){setView('chat');setChatThread('team');}
    if(id==='inbox'){setChatThread('');setView('work');}
    if(id==='read')setView('notifications');
    if(id==='push')setView('settings');
  }
  if (!s || !me)
    return (
      <main className="login">
        <div className="login-art">
          <div className="brand">
            <span className="brand-icon">
              <Flame />
            </span>
            IGNITED<span className="brand-sub">CONTENT CO.</span>
          </div>
          <div>
            <p className="eyebrow">THE TEAM WORKSPACE</p>
            <h1>
              Great work.
              <br />
              <em>Clear next steps.</em>
            </h1>
            <p>From the first shoot to the next client milestone.</p>
          </div>
          <span>IGNITED CONTENT CO. / INTERNAL</span>
        </div>
        <form onSubmit={signIn}>
          <div className="login-appearance"><ThemeToggle /></div>
          <p className="eyebrow">WELCOME BACK</p>
          <h2>Let’s move things forward.</h2>
          <p className="muted">Sign in with your team account.</p>
          <label>
            Username
            <input
              type="text"
              autoCapitalize="none"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
            />
          </label>
          <label>
            Password
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </label>
          <button className="primary" disabled={busy || !!token}>
            {busy ? "Signing in…" : token ? (error ? "Workspace access needed" : "Loading workspace…") : "Sign in"}
            <ArrowUpRight size={18} />
          </button>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          {token && <button type="button" className="secondary" onClick={() => void signOut()}>Sign out</button>}
          <small>
            Access is limited to configured team members. Contact your workspace
            owner if you need an account.
          </small>
        </form>
      </main>
    );
  const clients = s.clients.filter(
    (c) =>
      (ownerFilter === "all" || c.owner === ownerFilter) &&
      (stageFilter === "all" || c.stage === stageFilter || stageFilter === "production" && ["Filming", "Editing", "In review", "Campaign setup"].includes(c.stage)) &&
      `${c.name} ${c.location}`.toLowerCase().includes(query.toLowerCase()),
  );
  const activeClients = clients.filter(c => c.stage === "Active").sort((a, b) => a.name.localeCompare(b.name));
  const totalActiveClients = s.clients.filter(c => c.stage === "Active").length;
  const current = s.clients.find((c) => c.id === selected);
  const reviewLink = parseDriveLink(current?.driveUrl);
  const approvals = s.clients.filter((c) => c.stage === "In review" && s.tasks.some(t => t.clientId === c.id && t.status === "review" && !t.archivedAt));
  const openTasks = s.tasks.filter((t) => t.status !== "done" && !t.archivedAt);
  const mine = openTasks.filter((t) => t.assignee === me.id);
  const overdue = openTasks.filter(
    (t) => t.dueAt && Date.parse(t.dueAt) < Date.now(),
  );
  const archivedTasks = tasksForView(s.tasks, me.id, "archive");
  const workTasks = tasksForView(s.tasks, me.id, taskFilter).filter(t => taskFilter !== "archive" ||
    `${t.title} ${t.notes || ""} ${s.clients.find(c => c.id === t.clientId)?.name || ""} ${s.members.find(m => m.id === t.assignee)?.name || ""}`.toLowerCase().includes(archiveQuery.trim().toLowerCase()));
  const openNotice = (n: State["notifications"][number]) => {
    const task = s.tasks.find(t => t.id === n.taskId);
    if (task?.archivedAt) { setTaskFilter("archive"); setView("work"); setSelected(null); setTaskDialog({id: task.id}); }
    else if (n.messageId && task) setCommentTaskId(task.id);
    else if (n.messageId && n.threadId) { setSelected(null); setChatThread(n.threadId); setView("chat"); }
    else if (task?.kind === "custom") setTaskDialog({ id: task.id });
    else if (n.clientId) setSelected(n.clientId);
    else setView("work");
    void act({ type: "read", key: n.id });
  };
  const title = {
    board: "Client progress",
    work: "My work",
    approvals: "Ad approvals",
    notifications: "Inbox",
    chat: "Team chat",
    settings: "Workspace settings",
    sales: "Sales pipeline",
  }[view];
  const nav = (
    v: View,
    label: string,
    icon: React.ReactNode,
    count?: number,
  ) => (
    <button
      data-tour={`nav-${v}`}
      className={`nav ${view === v ? "active" : ""}`}
      aria-label={label}
      aria-current={view === v ? "page" : undefined}
      onClick={() => {
        setView(v);
        setActiveClientsOpen(false);
        setSelected(null);
        setError("");
      }}
    >
      {icon}
      <span>{label}</span>
      {!!count && <b>{count}</b>}
    </button>
  );
  const clientCard = (c: Client, index: number) => {
    const task = openTasks.find(t => t.clientId === c.id);
    return (
      <button
        className="client-card"
        key={c.id}
        data-tour-client={c.id}
        onClick={() => {
          setSelected(c.id);
          setValue("");
        }}
      >
        <div className="card-top">
          <span
            className={`client-mark mark-${index % 4}`}
          >
            {initials(c.name)}
          </span>
          <ArrowUpRight size={16} />
        </div>
        <h3>{c.name}</h3>
        <p>{c.location}</p>
        <span
          className={`card-status ${c.stage === "In review" ? "review" : ""}`}
        >
          {c.stage === "Trial"
            ? `Trial ends ${new Date(c.trialEnd!).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`
            : c.stage === "Onboarding"
              ? `${Object.values(c.onboarding).filter(Boolean).length} / 4 complete`
              : due(task)}
        </span>
        <div className="card-footer">
          <span>
            <span className="avatar tiny">
              {initials(
                s.members.find((m) => m.id === c.owner)
                  ?.name || "Owner",
              )}
            </span>
            {
              s.members.find((m) => m.id === c.owner)
                ?.name
            }
          </span>
          {task ? (
            <Clock3 size={15} />
          ) : (
            <ChevronRight size={15} />
          )}
        </div>
      </button>
    );
  };
  const taskCard = (t: Task) => (
    <button
      key={t.id}
      data-tour-task={t.id}
      className="task-row"
      onClick={() => {
        if (t.kind === "custom" || t.archivedAt || t.status === "done") setTaskDialog({ id: t.id });
        else setSelected(t.clientId);
        setValue("");
      }}
    >
      <span className={`task-symbol ${t.status === "review" ? "purple" : ""}`}>
        {t.archivedAt ? <Archive size={18} /> : t.status === "review" ? (
          <Pause size={18} />
        ) : (
          <CheckCircle2 size={18} />
        )}
      </span>
      <span>
        <strong>{t.title}</strong>
        <small>{s.clients.find((c) => c.id === t.clientId)?.name || "General team task"} · {s.members.find(m => m.id === t.assignee)?.name}</small>
      </span>
      <span className="task-date">
        {due(t)}
        <small>{t.archivedAt ? date(t.archivedAt) : t.dueAt ? date(t.dueAt) : t.status === "review" ? "Paused for approval" : ""}</small>
      </span>
      <ChevronRight size={18} />
    </button>
  );
  const action = (
    type: string,
    label: string,
    extra: Partial<Action> = {},
    secondary = false,
  ) => (
    <button
      data-tour={type}
      disabled={busy}
      className={secondary ? "secondary" : "primary"}
      onClick={() => void act({ type, clientId: current!.id, ...extra })}
    >
      {label}
      {!secondary && <ArrowUpRight size={17} />}
    </button>
  );
  return (
    <div className={`shell ${practiceMember?'practice-workspace':''}`} data-practice-workspace={practiceMember?'true':undefined}>
      {practiceMember&&<><div data-guide-home /><GuidedCoach steps={tourSteps(practiceMember.role)} index={tourIndex} snapshot={{view,selected,taskId:taskDialog?.id,creating:!!taskDialog&&!taskDialog.id,filter:taskFilter,chat:chatThread,events:tourEvents,profileOpen}} onStep={enterTourStep} onFinish={onPracticeFinish!} onExit={onPracticeExit!}/></>}
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-icon">
            <Flame />
          </span>
          <span>
            IGNITED<small>CONTENT CO.</small>
          </span>
        </div>
        <button className="workspace-name" onClick={() => setView("settings")}>
          <span className="workspace-avatar">IC</span>
          <div>
            Agency workspace<small>Internal team</small>
          </div>
          <ChevronRight size={16} />
        </button>
        <p className="nav-label">WORKSPACE</p>
        {owner &&
          nav("board", "Client progress", <LayoutDashboard size={19} />)}
        {nav("work", "My work", <ListTodo size={19} />, mine.length)}
        {owner &&
          nav(
            "approvals",
            "Approvals",
            <CheckCircle2 size={19} />,
            approvals.length,
          )}
        {nav(
          "notifications",
          "Inbox",
          <Bell size={19} />,
          s.notifications.filter((n) => !n.read).length,
        )}
        {owner && (
          <>
            <div className="nav-rule" />
            {nav("sales", "Sales", <Users size={19} />)}
          </>
        )}
        {nav("chat", "Chat", <MessageCircle size={19} />, s.notifications.filter(n => n.messageId && !n.taskId && !n.read).length)}
        {nav("settings", "Settings", <Settings size={19} />)}
        <div className="sidebar-bottom">
          <div className="status-dot" />{" "}
          {configured ? "Private workspace" : "Sample workspace"}
          <button className="profile" onClick={() => setView("settings")}>
            <span className="avatar">{initials(me.name)}</span>
            <span>
              {me.name}
              <small>
                {me.role === "approver"
                  ? "Owner · ad approver"
                  : me.role === "manager"
                    ? "Owner"
                    : me.role}
              </small>
            </span>
            <Settings size={17} />
          </button>
        </div>
      </aside>
      <div className="main">
        <header className="topbar">
          <span>
            Workspace <ChevronRight size={14} /> <strong>{title}</strong>
          </span>
          <div>
            <span className="today">
              {new Date().toLocaleDateString(undefined, {
                weekday: "short",
                month: "short",
                day: "numeric",
              })}
            </span>
            <ThemeToggle />
            <button data-tour="create-task" className="icon-button" aria-label="Create task" title="Create task" onClick={() => { setError(""); setTaskDialog({}); }}><Plus size={20} /></button>
            <button
              className="icon-button notification-bell"
              aria-label={`Open notifications, ${s.notifications.filter(n => !n.read).length} unread`}
              onClick={() => setView("notifications")}
            >
              <Bell size={19} />
              {s.notifications.some(n => !n.read) && <span className="notification-count">{Math.min(s.notifications.filter(n => !n.read).length, 99)}</span>}
            </button>
            <ProfileMenu onOpenChange={practiceMember?setProfileOpen:undefined} me={me} navigate={v => { setView(v); setSelected(null); setError(""); }} signOut={configured ? () => void signOut() : undefined} />
          </div>
        </header>
        {!configured && !practiceMember && (
          <div className="demo-banner">
            <span>
              <b>DEMO WORKSPACE</b> Fictional clients · changes last for this
              session · no messages sent
            </span>
            <label>
              Preview as{" "}
              <select
                value={userId}
                onChange={(e) => {
                  setUserId(e.target.value);
                  setTaskDialog(null);
                  setTaskFilter("mine");
                  setSelected(null);
                  setView(
                    e.target.value === "john" || e.target.value === "carl"
                      ? "work"
                      : "board",
                  );
                }}
              >
                {all!.members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}
        <main className={`content ${view === "chat" ? "messenger-content" : ""}`}>
          <div className="page-heading">
            <div>
              <p className="eyebrow">IGNITED CONTENT CO.</p>
              <h1>
                {title}
                <span className="heading-dot">.</span>
              </h1>
              <p className="muted">
                {view === "board"
                  ? "Every client. One clear next step."
                  : view === "work"
                    ? "Your assignments, with the context to get them done."
                    : view === "approvals"
                      ? "Review the edit. Keep production moving."
                      : view === "notifications"
                        ? "The updates that need your attention."
                        : view === "chat"
                          ? "Conversations that keep the team moving."
                        : view === "sales"
                          ? "Acquisition stays separate from client delivery."
                          : "People, access and workspace connections."}
              </p>
            </div>
            {view === "board" && (
              <span className="live-pill">
                <span className="status-dot" />
                {s.clients.filter((c) => c.stage !== "Closed").length} clients
                in motion
              </span>
            )}
          </div>
          {error && (
            <div className="error" role="alert">
              {error}
              <button aria-label="Dismiss error" onClick={() => setError("")}>
                <X size={16} />
              </button>
            </div>
          )}
          {view === "board" && owner && !activeClientsOpen && (
            <>
              <div className="stats">
                <button className="stat-card" onClick={() => { setStageFilter("production"); document.getElementById("delivery-board")?.scrollIntoView({ behavior: "smooth" }); }}>
                  <span>In production</span>
                  <strong>
                    {
                      s.clients.filter((c) =>
                        [
                          "Filming",
                          "Editing",
                          "In review",
                          "Campaign setup",
                        ].includes(c.stage),
                      ).length
                    }
                    <small>clients moving forward</small>
                  </strong>
                  <span className="stat-icon">
                    <Play size={19} />
                  </span>
                </button>
                <button className="stat-card" onClick={() => setView("approvals")}>
                  <span>Awaiting approval</span>
                  <strong>
                    {approvals.length}
                    <small>ready for your eyes</small>
                  </strong>
                  <span className="stat-icon purple">
                    <CheckCircle2 size={19} />
                  </span>
                </button>
                <button className="stat-card" onClick={() => { setStageFilter("Trial"); document.getElementById("delivery-board")?.scrollIntoView({ behavior: "smooth" }); }}>
                  <span>Live trials</span>
                  <strong>
                    {s.clients.filter((c) => c.stage === "Trial").length}
                    <small>building momentum</small>
                  </strong>
                  <span className="stat-icon green">
                    <Flame size={19} />
                  </span>
                </button>
                <button className="stat-card" onClick={() => { setTaskFilter("overdue"); setView("work"); }}>
                  <span>Overdue tasks</span>
                  <strong>
                    {overdue.length.toString().padStart(2, "0")}
                    <small>
                      {overdue.length ? "need attention" : "all clear for now"}
                    </small>
                  </strong>
                  <span className="stat-icon">
                    <Clock3 size={19} />
                  </span>
                </button>
              </div>
              <div className="board-toolbar" id="delivery-board">
                <div className="tab-active">
                  Delivery board <span>{clients.length}</span>
                </div>
                <div className="filters">
                  <select aria-label="Filter by stage" value={stageFilter} onChange={e => setStageFilter(e.target.value)}>
                    <option value="all">All stages</option><option value="production">In production</option>
                    {stages.map(stage => <option key={stage}>{stage}</option>)}
                  </select>
                  <label className="search">
                    <Search size={16} />
                    <input
                      placeholder="Search clients"
                      aria-label="Search clients"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                  </label>
                  <select
                    aria-label="Filter by owner"
                    value={ownerFilter}
                    onChange={(e) => setOwnerFilter(e.target.value)}
                  >
                    <option value="all">All owners</option>
                    {s.members.filter(isOwner).map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="board">
                {stages
                  .filter(
                    (stage) =>
                      (stageFilter === "all" || stageFilter === stage || stageFilter === "production" && ["Filming", "Editing", "In review", "Campaign setup"].includes(stage)) &&
                      (stage !== "Closed" || stageFilter === "Closed" || clients.some((c) => c.stage === "Closed")),
                  )
                  .map((stage, index) => (
                    <section className="column" key={stage}>
                      <div className="column-heading">
                        <span className={`stage-dot stage-${index}`} />
                        <h2>{stage}</h2>
                        <span>
                          {clients.filter((c) => c.stage === stage).length}
                        </span>
                      </div>
                      <div className="column-cards">
                        {stage === "Active" ? (
                          <button
                            ref={activeGroupRef}
                            className="client-card active-client-group"
                            aria-label={`View active clients (${activeClients.length})`}
                            onClick={() => { setError(""); setActiveClientsOpen(true); }}
                          >
                            <div className="card-top">
                              <span className="client-mark"><Users size={20} /></span>
                              <ArrowUpRight size={16} />
                            </div>
                            <h3>Active clients</h3>
                            <strong className="active-client-count">{activeClients.length}</strong>
                            <p>{query || ownerFilter !== "all" ? "clients match your filters" : "ongoing clients, together in one place"}</p>
                            <div className="card-footer"><span>View clients</span><ChevronRight size={16} /></div>
                          </button>
                        ) : clients.filter(c => c.stage === stage).map(c => clientCard(c, index))}
                        {stage !== "Active" && !clients.some((c) => c.stage === stage) && (
                          <p className="empty-column">Nothing here yet</p>
                        )}
                      </div>
                    </section>
                  ))}
              </div>
              <p className="board-note">
                Clients enter from your onboarding form. Open a card to complete
                the next step.
              </p>
            </>
          )}
          {view === "board" && owner && activeClientsOpen && (
            <section className="active-clients-view" aria-labelledby="active-clients-title">
              <button className="secondary" onClick={() => {
                returnToActiveGroup.current = true;
                setActiveClientsOpen(false);
              }}><ArrowLeft size={18} />Back to board</button>
              <div className="active-clients-heading">
                <div>
                  <h2 id="active-clients-title" ref={activeListHeadingRef} tabIndex={-1}>Active clients</h2>
                  <p className="muted">Open a client to see their details, tasks and progress updates.</p>
                </div>
                <span className="badge" role="status">{activeClients.length} of {totalActiveClients} clients</span>
              </div>
              <div className="filters active-client-filters">
                <label className="search">
                  <Search size={16} />
                  <input aria-label="Search active clients" placeholder="Search name or location" value={query} onChange={e => setQuery(e.target.value)} />
                </label>
                <select aria-label="Filter active clients by owner" value={ownerFilter} onChange={e => setOwnerFilter(e.target.value)}>
                  <option value="all">All owners</option>
                  {s.members.filter(isOwner).map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
                {(query || ownerFilter !== "all") && <button className="secondary" onClick={() => { setQuery(""); setOwnerFilter("all"); }}>Clear filters</button>}
              </div>
              {activeClients.length ? (
                <div className="active-client-list">{activeClients.map(c => clientCard(c, stages.indexOf("Active")))}</div>
              ) : (
                <div className="panel active-clients-empty">
                  <Users size={28} />
                  <h3>{totalActiveClients ? "No matching active clients" : "No active clients yet"}</h3>
                  <p>{totalActiveClients ? "Try another name, location or owner." : "Clients appear here automatically when they move to Active."}</p>
                </div>
              )}
            </section>
          )}
          {view === "work" && (
            <div className="panel">
              <div className="panel-heading">
                <h2>{taskFilter === "archive" ? "Task archive" : "Team tasks"}</h2>
                <button className="primary" onClick={() => { setError(""); setTaskDialog({}); }}><Plus size={18} />New task</button>
              </div>
              <div className="task-filters" aria-label="Task filters">
                {[["mine", "Assigned to me"], ["sent", "Assigned by me"], ...(owner ? [["all", "All open"], ["overdue", "Overdue"]] : []), ["completed", "Completed"], ["archive", `Archive (${archivedTasks.length})`]].map(([id, label]) =>
                  <button data-tour={`filter-${id}`} key={id} aria-pressed={taskFilter === id} onClick={() => setTaskFilter(id)}>{label}</button>)}
              </div>
              {taskFilter === "archive" && <div className="archive-heading"><p>Deleted tasks are saved here with their details and comments. Task assigners and workspace owners can restore them.</p><label className="archive-search"><Search size={18}/><input aria-label="Search archived tasks" placeholder="Search archived tasks" value={archiveQuery} onChange={e => setArchiveQuery(e.target.value)}/></label></div>}
              {workTasks.map(taskCard)}
              {!workTasks.length && (
                <div className="empty">
                  <CheckCircle2 />
                  <h3>{taskFilter === "archive" ? archiveQuery ? "No archived tasks match your search." : "Your archive is empty." : "No tasks in this view."}</h3>
                  <p>{taskFilter === "archive" ? "Deleted tasks will appear here so they can be restored." : "Create a task for yourself or any teammate."}</p>
                </div>
              )}
            </div>
          )}
          {view === "approvals" && owner && (
            <div className="panel">
              <div className="panel-heading">
                <h2>Ready for review</h2>
                <span>Editing clocks are paused</span>
              </div>
              {s.tasks.filter((t) => t.status === "review" && !t.archivedAt).map(taskCard)}
              {!approvals.length && (
                <div className="empty">
                  <CheckCircle2 />
                  <h3>No edits waiting.</h3>
                  <p>Submitted edits will appear here.</p>
                </div>
              )}
            </div>
          )}
          {view === "chat" && <TeamChat key={userId} state={s} me={me} act={act} error={error} selected={chatThread} onSelect={setChatThread} />}
          {view === "notifications" && (
            <div className="panel">
              <div className="panel-heading">
                <h2>Your notifications</h2>
                <button
                  data-tour="read"
                  className="text-button"
                  onClick={() => void act({ type: "read" })}
                >
                  Mark all read
                </button>
              </div>
              {s.notifications
                .slice()
                .reverse()
                .map((n) => (
                  <button
                    className="notice"
                    key={n.id}
                    onClick={() => openNotice(n)}
                  >
                    <span className={n.read ? "read-dot" : "unread-dot"} />
                    <span>
                      {n.text}
                      <small>{date(n.createdAt)}</small>
                    </span>
                    <ChevronRight size={18} />
                  </button>
                ))}
              {!s.notifications.length && (
                <div className="empty">
                  <Bell />
                  <h3>Your inbox is clear.</h3>
                </div>
              )}
            </div>
          )}
          {view === "sales" && owner && (
            <div className="panel connection">
              <Users size={32} />
              <h2>Sales stays in GHL.</h2>
              <p>
                Lead follow-up and appointment booking continue in your existing
                sales pipeline. Signed clients enter delivery through the Google
                onboarding form.
              </p>
              <span className="badge">GHL sync not connected</span>
              <p className="muted">
                No sales records have been imported. Delivery works
                independently.
              </p>
            </div>
          )}
          {view === "settings" && (
            <div className="settings-grid">
              <section className="panel">
                <div className="panel-heading">
                  <h2>Your workspace</h2>
                </div>
                <div className="settings-body">
                  <h3>{me.name}</h3>
                  <p className="muted">
                    {me.role === "approver"
                      ? "Only you can approve ads."
                      : isOwner(me)
                        ? "Full client board and task management."
                        : "You see your assigned tasks and relevant client files."}
                  </p>
                  <label>
                    Display timezone
                    <input
                      disabled
                      value={Intl.DateTimeFormat().resolvedOptions().timeZone}
                    />
                  </label>
                  <p className="muted">
                    Dates use your device’s local timezone. Deadlines run
                    through nights and weekends.
                  </p>
                  {configured && (
                    <button
                      className="secondary"
                      onClick={() => void signOut()}
                    >
                      <LogOut size={16} />
                      Sign out
                    </button>
                  )}
                  <div className="appearance-setting"><span>Appearance</span><ThemeToggle /></div>
                </div>
              </section>
              {!practiceMember&&<PasswordSettings key={me.id} configured={configured} save={async values => {
                const session = await api("/api/password", values);
                try {
                  const result = await auth!.auth.setSession(session);
                  if (result.error) throw result.error;
                  return "Password updated. Use your new password the next time you sign in.";
                } catch {
                  return "Your password was updated. Sign out and sign in with your new password to refresh this session.";
                }
              }} />}
              <PushSettings key={userId} member={me} configured={configured} api={api} />
              <section className="panel">
                <div className="panel-heading">
                  <h2>Connections</h2>
                </div>
                <div className="settings-body">
                  <div className="connection-row">
                    <span>Private database & raw footage</span>
                    <b>{configured ? "Connected" : "Setup required"}</b>
                  </div>
                  <div className="connection-row">
                    <span>Google Form intake</span>
                    <b>{configured && s.clients.some(c => c.sourceId && !c.sourceId.startsWith("sample-")) ? "Intake records received" : "Awaiting intake"}</b>
                  </div>
                  <div className="connection-row">
                    <span>Google Drive edits</span>
                    <b>Folder & file links</b>
                  </div>
                  <div className="connection-row">
                    <span>Notifications</span>
                    <b>In-app</b>
                  </div>
                  <p className="muted">
                    New notifications appear as pop-ups while the taskboard is open.
                    The inbox and deadline checks refresh every 15 seconds.
                    Dismiss a pop-up to keep it unread, or open it to view the client.
                    Enable push above for device alerts. Deadline alerts while everyone is away require the server reminder schedule.
                  </p>
                </div>
              </section>
              {owner && (
                <section className="panel wide">
                  <div className="panel-heading">
                    <h2>Team & ownership</h2>
                    <span>Manual assignments</span>
                  </div>
                  <div className="settings-body">
                    {s.members.map((m) => (
                      <div className="member-row" key={m.id}>
                        <span className="avatar">{initials(m.name)}</span>
                        <strong>{m.name}</strong>
                        <span>{m.role}</span>
                      </div>
                    ))}
                    <p className="muted">
                      New clients are assigned to the primary owner. Reassign
                      any client to Yaniv from its detail panel. Active clients
                      receive a progress-update task every 3½ days.
                    </p>
                    <form
                      className="member-form"
                      onSubmit={(e) => {
                        e.preventDefault();
                        void act({
                          type: "member",
                          member: {
                            id: memberId,
                            name: memberName,
                            role: memberRole,
                          },
                        });
                      }}
                    >
                      <label>
                        Existing Auth user UUID
                        <input
                          required
                          value={memberId}
                          onChange={(e) => setMemberId(e.target.value)}
                          placeholder="User ID from Supabase"
                        />
                      </label>
                      <label>
                        Name
                        <input
                          required
                          value={memberName}
                          onChange={(e) => setMemberName(e.target.value)}
                        />
                      </label>
                      <label>
                        Role
                        <select
                          value={memberRole}
                          onChange={(e) =>
                            setMemberRole(e.target.value as Member["role"])
                          }
                        >
                          <option value="editor">Editor</option>
                          <option value="campaign">Campaign specialist</option>
                          <option value="manager">Owner / manager</option>
                        </select>
                      </label>
                      <button className="secondary" disabled={busy}>
                        <Plus size={16} />
                        Save member
                      </button>
                    </form>
                    <small>
                      This grants access to an existing account. It does not
                      send an invitation.
                    </small>
                  </div>
                </section>
              )}
            </div>
          )}
        </main>
      </div>
      {current && (
        <div className="drawer-backdrop" onClick={() => setSelected(null)}>
          <section
            className="drawer"
            role="dialog"
            aria-modal="true"
            aria-label={current.name}
            onClick={(e) => e.stopPropagation()}
          >
            <div data-guide-host />
            <div className="drawer-top">
              <span>CLIENT DETAILS</span>
              <button
                className="icon-button"
                aria-label="Close client details"
                onClick={() => setSelected(null)}
              >
                <X />
              </button>
            </div>
            <div className="drawer-heading">
              <span className="client-mark">{initials(current.name)}</span>
              <h2>{current.name}</h2>
              <p>{current.location}</p>
              <span className="badge">{current.stage}</span>
            </div>
            <div className="drawer-body">
              <button className="secondary" onClick={() => { setError(""); setTaskDialog({ clientId: current.id }); }} disabled={current.stage === "Closed"}><Plus size={18} />Assign a task</button>
              {error && (
                <p className="error" role="alert">
                  {error}
                </p>
              )}
              <div className="detail-grid">
                <div>
                  <small>CLIENT OWNER</small>
                  {owner ? (
                    <select
                      aria-label="Client owner"
                      value={current.owner}
                      onChange={(e) =>
                        void act({
                          type: "owner",
                          clientId: current.id,
                          value: e.target.value,
                        })
                      }
                    >
                      {s.members.filter(isOwner).map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <p>Managed by agency owners</p>
                  )}
                </div>
                <div>
                  <small>CONTACT</small>
                  <p>{current.person || "Contact name missing"}</p>
                  {owner && current.email && (
                    <a href={`mailto:${current.email}`}>{current.email}</a>
                  )}
                  {owner && (!current.person.trim() || !current.email.trim()) && (
                    <p role="status">Contact details incomplete. Add the name and email below.</p>
                  )}
                </div>
              </div>
              {me.role === "approver" && <PipelineControls key={current.id} state={s} client={current} act={act} />}
              {current.stage === "Onboarding" && owner && (
                <section className="detail-section">
                  <h3>Finish onboarding</h3>
                  <p className="muted">
                    The form has been received. Confirm these separately.
                  </p>
                  {checklist.map((k) => (
                    <button
                      className="check-row"
                      key={k}
                      onClick={() =>
                        void act({
                          type: "check",
                          clientId: current.id,
                          key: k,
                        })
                      }
                    >
                      <span
                        className={`checkbox ${current.onboarding[k] ? "checked" : ""}`}
                      >
                        {current.onboarding[k] && <Check size={15} />}
                      </span>
                      {k}
                    </button>
                  ))}
                  {action("onboard", "Complete onboarding")}
                </section>
              )}
              {current.stage === "Filming" && owner && (
                <section className="detail-section">
                  <h3>Upload raw footage</h3>
                  <p className="muted">
                    John’s 24-hour editing deadline starts after your upload
                    completes.
                  </p>
                  <label className="upload-box">
                    <Upload />
                    <strong>Choose location shout-out videos</strong>
                    <span>Up to 50 MB per file · max 20 files</span>
                    <input
                      type="file"
                      accept="video/*"
                      multiple
                      onChange={(e) =>
                        setUploadFiles(Array.from(e.target.files || []))
                      }
                    />
                  </label>
                  {uploadFiles.map((f) => (
                    <p key={f.name}>{f.name}</p>
                  ))}
                  <button
                    className="primary"
                    disabled={busy || !uploadFiles.length}
                    onClick={() => void upload(current)}
                  >
                    {busy ? "Uploading…" : "Upload & assign editing"}
                    <ArrowUpRight size={16} />
                  </button>
                </section>
              )}
              {current.rawFiles.length > 0 && (
                <section className="detail-section">
                  <h3>Raw footage</h3>
                  {current.rawFiles.map((f) => (
                    <button
                      className="file-link"
                      key={f.path}
                      onClick={() => void download(current, f.path)}
                    >
                      <Play size={16} />
                      {f.name}
                      <ArrowUpRight size={16} />
                    </button>
                  ))}
                </section>
              )}
              {reviewLink && current.stage !== "In review" && <section className="detail-section">
                <h3>Latest submitted edits</h3>
                <a className="file-link" target="_blank" rel="noreferrer" href={reviewLink.url}>
                  {reviewLink.kind === "folder" ? "Open folder in Google Drive" : "Open video in Google Drive"}
                  <ArrowUpRight size={16} />
                </a>
              </section>}
              {s.tasks
                .filter((t) => t.clientId === current.id && t.status !== "done" && t.kind !== "custom" && !t.archivedAt)
                .map((t) => (
                  <section className="detail-section" key={t.id}>
                    <div className="section-title">
                      <h3>{t.title}</h3>
                      <span className="badge">{due(t)}</span>
                    </div>
                    {canManageTask(t, me) && <button className="secondary" onClick={() => {setError(""); setTaskDialog({id: t.id});}}>Edit or delete task</button>}
                    <p className="muted">
                      {s.members.find((m) => m.id === t.assignee)?.name ||
                        "Assigned team member"}{" "}
                      · {date(t.dueAt)}
                    </p>
                    {owner && (
                      <label>
                        Assigned to
                        <select
                          aria-label="Task assignee"
                          value={t.assignee}
                          onChange={(e) =>
                            void act({
                              type: "reassign",
                              clientId: current.id,
                              taskId: t.id,
                              value: e.target.value,
                            })
                          }
                        >
                          {s.members
                            .filter((m) =>
                              t.kind === "update"
                                ? isOwner(m)
                                : m.role ===
                                  (t.kind === "edit" ? "editor" : "campaign"),
                            )
                            .map((m) => (
                              <option key={m.id} value={m.id}>
                                {m.name}
                              </option>
                            ))}
                        </select>
                      </label>
                    )}
                    {t.notes && (
                      <div className="revision-note">
                        <strong>Revision notes</strong>
                        <p>{t.notes}</p>
                      </div>
                    )}
                    {t.kind === "edit" &&
                      t.status === "open" &&
                      t.assignee === me.id && (
                        <>
                          <label>
                            Edited videos · Google Drive folder link
                            <input
                              type="url"
                              value={value}
                              onChange={(e) => setValue(e.target.value)}
                              placeholder="https://drive.google.com/drive/folders/…"
                              maxLength={2048}
                            />
                          </label>
                          <p className="muted">Paste the folder containing the edits and share it with the reviewer. Individual video links also work.</p>
                          {action("submit", "Submit for approval", {
                            taskId: t.id,
                            value,
                          })}
                        </>
                      )}
                    {t.kind === "edit" && t.status === "review" && (
                      <>
                        {reviewLink ? (
                          <>
                            {reviewLink.previewUrl && <iframe
                              className="video-preview"
                              title="Edited video preview"
                              src={reviewLink.previewUrl}
                              allow="fullscreen"
                            />}
                            <a
                              className="file-link"
                              target="_blank"
                              rel="noreferrer"
                              href={reviewLink.url}
                            >
                              {reviewLink.kind === "folder" ? "Open folder in Google Drive" : "Open video in Google Drive"}
                              <ArrowUpRight size={16} />
                            </a>
                            <p className="muted">
                              {reviewLink.kind === "folder" ? "Review the videos in the folder, then return here to approve or request revisions." : "If the preview asks for access, open Drive and request permission from the editor."}
                            </p>
                          </>
                        ) : (
                          <p className="muted">
                            {current.driveUrl ? "This saved Drive link cannot be opened. Request a new folder or file link from the editor." : "Sample review — no actual videos attached."}
                          </p>
                        )}
                        {me.role === "approver" && (
                          <>
                            <div className="action-stack">
                              {action(
                                "approve",
                                "Approve & assign campaign setup",
                                { taskId: t.id },
                              )}
                            </div>
                            <label>
                              Revision instructions
                              <textarea
                                value={value}
                                onChange={(e) => setValue(e.target.value)}
                                placeholder="What needs to change?"
                              />
                            </label>
                            {action(
                              "revise",
                              "Request revisions · 6 hours",
                              { taskId: t.id, value },
                              true,
                            )}
                          </>
                        )}
                      </>
                    )}
                    {t.kind === "campaign" && t.assignee === me.id && <>
                      <p className="muted">Completing setup assigns Yaniv a task to integrate Closebot with GHL and Facebook.</p>
                      {action("campaign", "Mark campaign setup complete", { taskId: t.id })}
                    </>}
                    {t.kind === "update" && t.assignee === me.id && (
                      <>
                        <label>
                          Update summary
                          <textarea
                            value={value}
                            onChange={(e) => setValue(e.target.value)}
                          />
                        </label>
                        {action("update", "Record completed update", {
                          taskId: t.id,
                          value,
                        })}
                      </>
                    )}
                  </section>
                ))}
              {s.tasks.some(t => t.clientId === current.id && t.kind === "custom" && !t.archivedAt) && <section className="detail-section"><h3>Team tasks</h3>{s.tasks.filter(t => t.clientId === current.id && t.kind === "custom" && !t.archivedAt).map(taskCard)}</section>}
              {s.tasks.some(t => t.clientId === current.id && t.archivedAt) && <section className="detail-section"><h3>Archived tasks</h3><p className="muted">Archived work and comments stay saved. Restore only when it still matches the current stage and no replacement task is active.</p>{s.tasks.filter(t => t.clientId === current.id && t.archivedAt).map(taskCard)}</section>}
              {current.stage === "Ready to launch" && owner && (
                <section className="detail-section">
                  <h3>Launch checklist</h3>
                  <p className="muted">
                    Complete payment setup through your existing external
                    payment link. Never enter card details here.
                  </p>
                  {(["launchCall", "paymentConfirmed"] as const).map((k, i) => (
                    <button
                      key={k}
                      className="check-row"
                      onClick={() =>
                        void act({
                          type: "launchCheck",
                          clientId: current.id,
                          key: k,
                        })
                      }
                    >
                      <span
                        className={`checkbox ${current[k] ? "checked" : ""}`}
                      >
                        {current[k] && <Check size={15} />}
                      </span>
                      {i === 0
                        ? "Client launch call completed"
                        : "External card / payment setup confirmed"}
                    </button>
                  ))}
                  {action("launch", "Record ads launched · start trial")}
                </section>
              )}
              {current.stage === "Trial" && (
                <section className="detail-section trial">
                  <Flame />
                  <h3>The 14-day trial is live.</h3>
                  <p>Launched {date(current.launchedAt)}</p>
                  <p>Trial ends {date(current.trialEnd)}</p>
                  <small>
                    Review reminder:{" "}
                    {date(
                      new Date(
                        Date.parse(current.trialEnd!) - 72 * 3600000,
                      ).toISOString(),
                    )}
                  </small>
                  {owner && (
                    <div className="action-stack">
                      {action("continue", "Continue at $530 / month")}
                      {action("close", "Close client", {}, true)}
                      <small>
                        Records your decision only. No charge is made.
                      </small>
                    </div>
                  )}
                </section>
              )}
              {current.stage === "Active" && (
                <section className="detail-section">
                  <h3>Ongoing client care</h3>
                  <p>
                    Progress updates twice weekly, assigned to the client owner.
                  </p>
                  <p className="muted">
                    Next task opens {date(current.nextUpdate)}
                  </p>
                  {owner && action("close", "Close client", {}, true)}
                </section>
              )}
              <section className="detail-section">
                <h3>Task comments</h3>
                <p className="muted">Discuss any task, including completed work.</p>
                <div className="task-discussion-links">{s.tasks.filter(t => t.clientId === current.id && !t.archivedAt).map(t => <button key={t.id} className="secondary" onClick={() => setCommentTaskId(t.id)}>{t.title}{t.status === "done" ? " · Completed" : ""} · {(s.messages || []).filter(m => m.target.kind === "task" && m.target.taskId === t.id).length} comments</button>)}</div>
              </section>
              <section className="detail-section">
                <h3>Business context</h3>
                <p>{current.offer || "No offer recorded yet."}</p>
                {owner && (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const f = new FormData(e.currentTarget);
                      void act({
                        type: "profile",
                        clientId: current.id,
                        profile: {
                          person: String(f.get("person")),
                          email: String(f.get("email")),
                          location: String(f.get("location")),
                          offer: String(f.get("offer")),
                          phone: String(f.get("phone")),
                          closebot: String(f.get("closebot")),
                        },
                      });
                    }}
                    key={current.id}
                  >
                    <label>
                      Offer
                      <input name="offer" defaultValue={current.offer} />
                    </label>
                    <label>
                      Contact name
                      <input name="person" defaultValue={current.person} />
                    </label>
                    <label>
                      Contact email
                      <input name="email" type="email" defaultValue={current.email} />
                    </label>
                    <label>
                      General location
                      <input name="location" defaultValue={current.location} />
                    </label>
                    <label>
                      Business phone
                      <input name="phone" defaultValue={current.phone} />
                    </label>
                    <label>
                      Closebot context
                      <textarea
                        name="closebot"
                        defaultValue={current.closebot}
                      />
                    </label>
                    <button className="secondary" disabled={busy}>
                      Save business details
                    </button>
                  </form>
                )}
              </section>
              {owner && s.events.some((e) => e.clientId === current.id) && (
                <section className="detail-section">
                  <h3>Activity</h3>
                  {s.events
                    .filter((e) => e.clientId === current.id)
                    .slice(-10)
                    .reverse()
                    .map((e) => (
                      <p className="activity" key={e.id}>
                        {e.text}
                        <small>{date(e.at)}</small>
                      </p>
                    ))}
                </section>
              )}
            </div>
          </section>
        </div>
      )}
      {taskDialog && <TeamTask key={taskDialog.id || "new"} state={s} me={me} taskId={taskDialog.id} task={s.tasks.find(t => t.id === taskDialog.id)} clientId={taskDialog.clientId} act={act} error={error} onClose={() => setTaskDialog(null)} onOpenClient={id => {setTaskDialog(null); setSelected(id);}} />}
      {commentTaskId && <TaskDiscussion key={`${userId}:${commentTaskId}`} state={s} me={me} taskId={commentTaskId} act={act} error={error} onClose={() => setCommentTaskId(null)} />}
      {!practiceMember&&<NotificationToasts key={userId} notices={s.notifications} onOpen={openNotice} />}
    </div>
  );
}
