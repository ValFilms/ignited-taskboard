import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { runInNewContext } from "node:vm";
import { demoState } from "../lib/demo";
import { importClient } from "../lib/workflow";

function mappedRow(extraHeaders: string[], extraValues: string[]) {
  const headers = ["Timestamp", "Business name", "Business phone number", ...extraHeaders];
  const row = [new Date("2026-09-09T12:00:00Z"), "Example Detailing", "555-0100", ...extraValues];
  const context: any = { Date,
    Utilities: { DigestAlgorithm: { SHA_256: "sha256" }, Charset: { UTF_8: "utf8" },
      computeDigest: (_: string, value: string) => [...createHash("sha256").update(value).digest()] },
    SpreadsheetApp: { openById: () => ({ getSheetById: () => ({ getDataRange: () => ({
      getValues: () => [headers, row], getDisplayValues: () => [headers, row.map(String)],
    }) }) }) },
  };
  runInNewContext(readFileSync("integrations/google-intake.gs", "utf8"), context);
  return context.intakeRows()[0];
}

for (const heading of ["Business owner name", "Business Owner Name", "  BUSINESS   owner\u00a0name  "]) {
  test(`intake maps ${JSON.stringify(heading)} to the contact name before the legacy field`, () => {
    const row = mappedRow(["Person name", heading], ["Legacy contact", "  Jamie Owner  "]);
    assert.equal(row.person, "Jamie Owner");
    assert.equal(row.name, "Example Detailing");
    const reordered = mappedRow([heading, "Person name"], ["Jamie Owner", "Legacy contact"]);
    assert.equal(reordered.person, row.person); assert.equal(reordered.sourceId, row.sourceId);
  });
}

test("older responses fall back to Person name or an empty name without changing their source ID", () => {
  const legacy = mappedRow(["Person name"], ["Legacy contact"]);
  const blankOwner = mappedRow(["Business owner name", "Person name"], ["  ", "Legacy contact"]);
  const missing = mappedRow([], []), blank = mappedRow(["Business owner name"], [""]);
  assert.equal(legacy.person, "Legacy contact"); assert.equal(blankOwner.person, legacy.person);
  assert.equal(missing.person, ""); assert.equal(blank.person, "");
  for (const row of [blankOwner, missing, blank]) assert.equal(row.sourceId, legacy.sourceId);
});

test("the mapped business owner reaches onboarding without changing agency ownership or resetting existing work", () => {
  const state = demoState(); state.clients = []; state.tasks = []; state.notifications = [];
  const row = mappedRow(["Business Owner Name"], ["Jamie Owner"]);
  importClient(state, row);
  const client = state.clients[0], id = client.id;
  assert.equal(client.person, "Jamie Owner"); assert.equal(client.name, "Example Detailing");
  assert.equal(client.owner, "owner"); assert.equal(client.stage, "Onboarding");
  assert(Object.values(client.onboarding).every(value => value === false));
  assert.equal(state.notifications.length, 2);
  importClient(state, row);
  assert.equal(state.clients.length, 1); assert.equal(state.clients[0].id, id);
  assert.equal(state.notifications.length, 2);
  client.person = "Manually confirmed contact"; client.stage = "In review";
  state.tasks.push({...demoState().tasks[0], clientId: id});
  const tasks = structuredClone(state.tasks), events = structuredClone(state.events);
  importClient(state, mappedRow(["Business owner name"], ["  "]));
  assert.equal(client.person, "Manually confirmed contact"); assert.equal(client.stage, "In review");
  assert.deepEqual(state.tasks, tasks); assert.deepEqual(state.events, events);
  assert.equal(state.notifications.length, 2);
});

test("sync retries failures, skips unchanged rows, preserves IDs through edits and installs triggers once", () => {
  const properties = new Map<string, string>([["FORM_WEBHOOK_SECRET", "test-only"]]);
  const props = { getProperty: (k: string) => properties.get(k),
    setProperty: (k: string, v: string) => properties.set(k, v), deleteProperty: (k: string) => properties.delete(k) };
  const headers = ["Timestamp", "Business name", "Business phone number", "Location Shout Out "];
  let rows = [[new Date("2026-01-01T12:00:00Z"), "Business", "555", "City"]];
  const triggers: string[] = [], requests: any[] = [];
  let fail = true;
  const context: any = { Date, PropertiesService: { getScriptProperties: () => props },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
    Utilities: { DigestAlgorithm: { SHA_256: "sha256" }, Charset: { UTF_8: "utf8" },
      computeDigest: (_: string, s: string) => [...createHash("sha256").update(s).digest()] },
    SpreadsheetApp: { openById: () => ({ getSheetById: () => ({ getDataRange: () => ({
      getValues: () => [headers, ...rows], getDisplayValues: () => [headers, ...rows.map(r => r.map(String))]
    }) }) }) },
    ScriptApp: { getProjectTriggers: () => triggers.map(h => ({ getHandlerFunction: () => h })),
      newTrigger: (h: string) => { const builder: any = { timeBased: () => builder,
        everyMinutes: (n: number) => { assert.equal(n, 5); return builder; },
        forSpreadsheet: () => builder, onFormSubmit: () => builder, create: () => triggers.push(h) }; return builder; } },
    UrlFetchApp: { fetch: (_: string, options: any) => {
      requests.push(JSON.parse(options.payload)); return { getResponseCode: () => fail ? 503 : 200 };
    } }
  };
  runInNewContext(readFileSync("integrations/google-intake.gs", "utf8"), context);
  assert.throws(() => context.installSync(), /Pending intake retries/);
  assert.equal(requests[0].historical, true);
  fail = false;
  context.installSync();
  assert.equal(triggers.length, 2);
  assert.equal(requests.length, 2);
  context.syncIntake();
  assert.equal(requests.length, 2);
  rows[0][1] = "Renamed";
  rows[0][2] = "556";
  context.syncIntake();
  assert.equal(requests[2].sourceId, requests[0].sourceId);
  rows.unshift([new Date("2026-02-01T12:00:00Z"), "Second", "557", "City"]);
  context.onIntakeSubmit();
  assert.equal(requests.length, 4);
  assert.equal(requests[3].historical, false);
  headers.push("Business Owner Name");
  rows[0].push("  Jamie Owner  "); rows[1].push("");
  context.syncIntake();
  assert.equal(requests.length, 5); assert.equal(requests[4].person, "Jamie Owner");
  assert.equal(requests[4].sourceId, requests[3].sourceId);
  assert.equal(requests[4].historical, false);
  context.syncIntake(); assert.equal(requests.length, 5);
  rows[0][4] = "Jamie Updated";
  context.syncIntake(); assert.equal(requests.length, 6);
  assert.equal(requests[5].person, "Jamie Updated"); assert.equal(requests[5].sourceId, requests[3].sourceId);
  rows.push([...rows[0]]);
  assert.throws(() => context.syncIntake(), /Duplicate timestamp/);
  assert.equal(requests.length, 6);
});
