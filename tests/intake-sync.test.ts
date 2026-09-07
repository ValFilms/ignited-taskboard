import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { runInNewContext } from "node:vm";

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
  rows.push([...rows[0]]);
  assert.throws(() => context.syncIntake(), /Duplicate timestamp/);
  assert.equal(requests.length, 4);
});
