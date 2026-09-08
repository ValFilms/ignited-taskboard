import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDriveLink } from "../lib/drive-link";
import { demoState } from "../lib/demo";
import { transition, tick } from "../lib/workflow";

test("Drive folder links normalize account paths and preserve sharing resource keys without embedding", () => {
  for (const path of ["drive/folders/folder_123-abc", "drive/u/0/folders/folder_123-abc/", "drive/u/2/folders/folder_123-abc"]) {
    assert.deepEqual(parseDriveLink(` https://drive.google.com/${path}?usp=sharing&resourcekey=0-key_ABC `), {
      kind: "folder", url: "https://drive.google.com/drive/folders/folder_123-abc?resourcekey=0-key_ABC", previewUrl: null,
    });
  }
});

test("Existing file links retain a valid direct link and preview including their resource key", () => {
  for (const suffix of ["", "/", "/view", "/preview", "/edit"]) {
    assert.deepEqual(parseDriveLink(`https://drive.google.com/file/d/video-123${suffix}?usp=sharing&resourcekey=0-key`), {
      kind: "file", url: "https://drive.google.com/file/d/video-123/view?resourcekey=0-key",
      previewUrl: "https://drive.google.com/file/d/video-123/preview?resourcekey=0-key",
    });
  }
});

test("Drive parser rejects foreign hosts, credentials, malformed paths and non-review URLs", () => {
  for (const value of [undefined, null, {}, "", "not a URL", "javascript:alert(1)", "https://drive.google.com.evil.test/drive/folders/x",
    "http://drive.google.com/drive/folders/x", "https://drive.google.com:8443/drive/folders/x", "https://user:secret@drive.google.com/file/d/x/view",
    "https://drive.google.com/drive/folders/", "https://drive.google.com/drive/my-drive", "https://drive.google.com/file/d/x/unexpected/path",
    "https://drive.google.com/drive/folders/a%2Fb", "https://drive.google.com/drive/folders/x/child", "x".repeat(2049)]) {
    assert.equal(parseDriveLink(value), null, String(value));
  }
});

test("Folder submission, revisions and resubmission preserve the approval lifecycle", () => {
  const now = Date.now(); let s = demoState();
  const submit = { type: "submit", clientId: "demo-1", taskId: "edit-1", value: "https://drive.google.com/drive/u/0/folders/edits?usp=sharing&resourcekey=0-key" };
  assert.throws(() => transition(s, s.members[3], submit, now), /assigned/);
  s = transition(s, s.members[2], submit, now);
  assert.equal(s.clients[1].driveUrl, "https://drive.google.com/drive/folders/edits?resourcekey=0-key");
  assert.equal(s.clients[1].stage, "In review");
  assert.equal(s.tasks[1].status, "review"); assert.equal(s.tasks[1].dueAt, null);
  assert(s.notifications.some(n => n.userId === "owner" && n.clientId === "demo-1" && n.text.includes("folder ready for approval")));
  assert.throws(() => transition(s, s.members[2], submit, now + 1), /not open/);
  const count = s.notifications.filter(n => n.clientId === "demo-1").length;
  tick(s, now + 86400000);
  assert.equal(s.notifications.filter(n => n.clientId === "demo-1").length, count);
  s = transition(s, s.members[0], { type: "revise", clientId: "demo-1", taskId: "edit-1", value: "Replace opening clip" }, now + 1000);
  assert.equal(Date.parse(s.tasks[1].dueAt!), now + 1000 + 6 * 3600000);
  s = transition(s, s.members[2], submit, now + 2000);
  assert.equal(s.tasks[1].dueAt, null);
  s = transition(s, s.members[0], { type: "approve", clientId: "demo-1", taskId: "edit-1" }, now + 3000);
  assert.equal(s.clients[1].stage, "Campaign setup");
  assert(s.tasks.some(t => t.clientId === "demo-1" && t.kind === "campaign" && t.assignee === "carl"));
});
