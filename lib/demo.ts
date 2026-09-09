import { State, Client, checklist, Stage } from "./workflow";
export function demoState(): State {
  const now = Date.now();
  const members = [
    { id: "owner", name: "Val", role: "approver" as const },
    { id: "yaniv", name: "Yaniv", role: "manager" as const },
    { id: "john", name: "John", role: "editor" as const },
    { id: "carl", name: "Karl", role: "campaign" as const },
  ];
  const examples: [string, string, Stage][] = [
    ["Summit Auto Detail", "Austin, TX", "In review"],
    ["Coastal Shine", "Tampa, FL", "Editing"],
    ["Precision Mobile", "Charlotte, NC", "Campaign setup"],
    ["Apex Detailing", "Phoenix, AZ", "Ready to launch"],
    ["Northside Auto Spa", "Raleigh, NC", "Trial"],
    ["Luxe Mobile Detail", "Orlando, FL", "Onboarding"],
    ["Fresh Finish", "Atlanta, GA", "Filming"],
    ["Pristine Auto Care", "Denver, CO", "Active"],
  ];
  const clients: Client[] = examples.map(([name, location, stage], i) => ({
    id: `demo-${i}`,
    sourceId: `sample-${i}`,
    name,
    person: "Sample client",
    email: "sample@example.com",
    location,
    owner: i % 2 ? "yaniv" : "owner",
    stage,
    createdAt: new Date(now - 86400000 * 4).toISOString(),
    onboarding: Object.fromEntries(
      checklist.map((k, j) => [k, i !== 5 || j < 2]),
    ),
    offer: "Premium mobile detailing",
    phone: "",
    closebot: "",
    rawFiles: [],
    launchCall: false,
    paymentConfirmed: false,
    ...(stage === "Trial"
      ? {
          launchedAt: new Date(now - 86400000 * 11).toISOString(),
          trialEnd: new Date(now + 86400000 * 3).toISOString(),
        }
      : {}),
    ...(stage === "Active"
      ? { nextUpdate: new Date(now + 86400000).toISOString() }
      : {}),
  }));
  return {
    members,
    clients,
    tasks: [
      {
        id: "edit-0",
        clientId: "demo-0",
        title: "Edit location shout-outs",
        kind: "edit",
        assignee: "john",
        status: "review",
        createdAt: new Date(now - 36000000).toISOString(),
        dueAt: null,
        cycle: 0,
      },
      {
        id: "edit-1",
        clientId: "demo-1",
        title: "Edit location shout-outs",
        kind: "edit",
        assignee: "john",
        status: "open",
        createdAt: new Date(now - 72000000).toISOString(),
        dueAt: new Date(now + 14400000).toISOString(),
        cycle: 0,
      },
      {
        id: "campaign-2",
        clientId: "demo-2",
        title: "Set up ad campaign",
        kind: "campaign",
        assignee: "carl",
        status: "open",
        createdAt: new Date(now - 3600000).toISOString(),
        dueAt: new Date(now + 82800000).toISOString(),
        cycle: 0,
      },
    ],
    notifications: [
      {
        id: "notice-0",
        userId: "owner",
        clientId: "demo-0",
        text: "Summit Auto Detail: video ready for approval",
        createdAt: new Date(now - 3600000).toISOString(),
        read: false,
      },
    ],
    events: [],
  };
}
