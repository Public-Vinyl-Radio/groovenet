/**
 * Builds the placeholder examples attached to OpenAPI responses that have no
 * hand-written one.
 *
 * Shared by routes.ts and openapi.ts — it used to be copy-pasted into both,
 * so an improvement to one silently missed the other.
 *
 * The goal is a body that reads like a plausible response. Anything the schema
 * actually states — an example, a const, a default, an enum, a format — beats a
 * generic placeholder, so those are consulted first.
 */

const FORMAT_EXAMPLES: Record<string, string> = {
  "date-time": "2026-02-17T12:00:00.000Z",
  date: "2026-02-17",
  time: "12:00:00",
  duration: "PT3M45S",
  uuid: "6f1c2f80-9a3e-4d7b-8c11-2f5a9b0d4e63",
  uri: "https://example.com/resource",
  url: "https://example.com/resource",
  hostname: "example.com",
  email: "dj@example.com",
  ipv4: "192.0.2.1",
  byte: "ZXhhbXBsZQ==",
  binary: "<binary>",
  password: "hunter2",
};

function stringExample(s: Record<string, unknown>): string {
  const format = typeof s.format === "string" ? s.format : undefined;
  if (format && FORMAT_EXAMPLES[format]) return FORMAT_EXAMPLES[format];
  return "string";
}

export function exampleFromSchema(schema: unknown): unknown {
  if (!schema || typeof schema !== "object") return "example";
  const s = schema as Record<string, unknown>;

  // Anything the schema states outright wins over a generated placeholder.
  if (s.example !== undefined) return s.example;
  if (s.const !== undefined) return s.const;
  if (s.default !== undefined) return s.default;
  if (Array.isArray(s.enum) && s.enum.length > 0) return s.enum[0];

  if (Array.isArray(s.oneOf) && s.oneOf.length > 0) {
    return exampleFromSchema(s.oneOf[0]);
  }
  if (Array.isArray(s.anyOf) && s.anyOf.length > 0) {
    return exampleFromSchema(s.anyOf[0]);
  }
  if (Array.isArray(s.allOf) && s.allOf.length > 0) {
    // Merge the branches so the example carries every constrained property.
    const merged = s.allOf.reduce<Record<string, unknown>>((acc, branch) => {
      if (!branch || typeof branch !== "object") return acc;
      const b = branch as Record<string, unknown>;
      return {
        ...acc,
        ...b,
        properties: {
          ...(acc.properties as Record<string, unknown> | undefined),
          ...(b.properties as Record<string, unknown> | undefined),
        },
      };
    }, {});
    return exampleFromSchema(merged);
  }

  const type = s.type;
  if (type === "string") return stringExample(s);
  if (type === "integer") return 1;
  if (type === "number") return 1.23;
  if (type === "boolean") return true;
  if (type === "null") return null;
  if (Array.isArray(type) && type.length > 0) {
    const first = type.find((t) => t !== "null") ?? type[0];
    return exampleFromSchema({ ...s, type: first });
  }
  if (type === "array") {
    return [exampleFromSchema(s.items)];
  }
  if (type === "object") {
    const properties =
      s.properties && typeof s.properties === "object"
        ? (s.properties as Record<string, unknown>)
        : undefined;
    if (properties && Object.keys(properties).length > 0) {
      const obj: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(properties)) {
        obj[key] = exampleFromSchema(value);
      }
      return obj;
    }
    // A free-form object. An invented "exampleKey" reads like a real field
    // callers must send, so show an empty object instead — the schema's
    // additionalProperties already says any key is allowed.
    return {};
  }

  return "example";
}
