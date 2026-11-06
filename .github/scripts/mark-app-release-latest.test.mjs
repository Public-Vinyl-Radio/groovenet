import assert from "node:assert/strict";
import test from "node:test";

import { markAppReleaseLatest } from "./mark-app-release-latest.mjs";

test("marks an app release tag as latest", () => {
  let call;
  markAppReleaseLatest("v0.3.18", (...args) => (call = args));
  assert.deepEqual(call, ["gh", ["release", "edit", "v0.3.18", "--latest"], { stdio: "inherit" }]);
});

test("rejects package release tags", () => {
  assert.throws(() => markAppReleaseLatest("groovenet-cli-v3.12.1"), /Expected an app release tag/);
});
