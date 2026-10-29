import test from "node:test";
import assert from "node:assert/strict";
import { initSentry } from "../build/observability.js";

test("Sentry init is a no-op without a DSN", () => {
  const previous = process.env.SENTRY_DSN;
  delete process.env.SENTRY_DSN;
  const sdk = {
    init() {
      assert.fail("must not initialize");
    },
    setTag() {
      assert.fail("must not tag");
    },
  };
  try {
    assert.equal(initSentry(sdk), false);
  } finally {
    if (previous !== undefined) process.env.SENTRY_DSN = previous;
  }
});

test("Sentry init tags service and release without tracing or PII", () => {
  const previous = {
    dsn: process.env.SENTRY_DSN,
    release: process.env.SENTRY_RELEASE,
    service: process.env.SENTRY_SERVICE,
  };
  process.env.SENTRY_DSN = "https://public@example.invalid/1";
  process.env.SENTRY_RELEASE = "0.3.2";
  process.env.SENTRY_SERVICE = "mcp-server";
  let options;
  const tags = [];
  try {
    assert.equal(
      initSentry({
        init: (value) => {
          options = value;
        },
        setTag: (...args) => {
          tags.push(args);
        },
      }),
      true,
    );
  } finally {
    for (const [key, value] of Object.entries({
      SENTRY_DSN: previous.dsn,
      SENTRY_RELEASE: previous.release,
      SENTRY_SERVICE: previous.service,
    })) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
  assert.equal(options.release, "0.3.2");
  assert.equal(options.defaultIntegrations, false);
  assert.deepEqual(options.integrations, []);
  assert.equal(options.maxBreadcrumbs, 0);
  const event = {
    request: { data: "private" },
    user: { id: "private" },
    extra: { token: "secret" },
    breadcrumbs: [],
    exception: {
      values: [
        {
          value: "secret",
          stacktrace: {
            frames: [{ filename: "/app/src/index.ts", abs_path: "/app/src/index.ts" }],
          },
        },
      ],
    },
  };
  const scrubbed = options.beforeSend(event);
  assert.equal("request" in scrubbed, false);
  assert.equal("user" in scrubbed, false);
  assert.equal("extra" in scrubbed, false);
  assert.equal("breadcrumbs" in scrubbed, false);
  assert.equal(scrubbed.exception.values[0].value, "Exception details redacted");
  assert.equal(scrubbed.exception.values[0].stacktrace.frames[0].filename, "index.ts");
  assert.equal(scrubbed.exception.values[0].stacktrace.frames[0].abs_path, "index.ts");
  assert.equal("tracesSampleRate" in options, false);
  assert.deepEqual(tags, [
    ["service", "mcp-server"],
    ["release", "0.3.2"],
  ]);
});
