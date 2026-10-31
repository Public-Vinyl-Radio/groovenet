import { apiContractRoutes } from "@/api-contract/routes";
import {
  albumJsonSchemas,
  friendJsonSchemas,
  genreJsonSchemas,
  liveSetJsonSchemas,
  playlistJsonSchemas,
  recordCareJsonSchemas,
  spinJsonSchemas,
  playerJsonSchemas,
  trackJsonSchemas,
} from "@groovenet/contracts";
import fs from "node:fs";
import path from "node:path";
import { exampleFromSchema } from "./exampleFromSchema";

type OpenApiDocument = {
  openapi: string;
  info: {
    title: string;
    version: string;
    description: string;
  };
  servers: Array<{ url: string }>;
  paths: Record<string, Record<string, unknown>>;
  components: {
    securitySchemes: Record<string, unknown>;
    schemas: Record<string, unknown>;
  };
};

let cachedOpenApiDocument: OpenApiDocument | null = null;
let cachedMobileOpenApiDocument: OpenApiDocument | null = null;

const MOBILE_OPENAPI_PATHS = new Set([
  "/api/playlists",
  "/api/playlists/{id}/tracks",
  "/api/playlists/genetic",
  "/api/albums/{releaseId}/playable-structure",
  "/api/albums/{releaseId}/download",
  "/api/spins",
  "/api/spins/top-tracks",
  "/api/spins/recap",
  "/api/spins/{id}",
  "/api/discogs/verify-manifests",
]);

const COMPONENT_REF = /^#\/components\/schemas\/(.+)$/;

/**
 * Inlines `#/components/schemas/*` references so `exampleFromSchema`, which
 * knows nothing of `$ref`, sees the shared component's properties. A component
 * that refers to itself (`GenreTreeNode.children`) stops at an empty object.
 */
export function inlineComponentRefs(
  schema: unknown,
  components: Record<string, unknown>,
  resolving: ReadonlySet<string> = new Set(),
): unknown {
  if (Array.isArray(schema)) {
    return schema.map((item) => inlineComponentRefs(item, components, resolving));
  }
  if (!schema || typeof schema !== "object") return schema;
  const s = schema as Record<string, unknown>;
  const name = typeof s.$ref === "string" ? COMPONENT_REF.exec(s.$ref)?.[1] : undefined;
  if (name !== undefined) {
    if (resolving.has(name) || !(name in components)) return { type: "object" };
    return inlineComponentRefs(components[name], components, new Set([...resolving, name]));
  }
  return Object.fromEntries(
    Object.entries(s).map(([key, value]) => [
      key,
      inlineComponentRefs(value, components, resolving),
    ]),
  );
}

function addExamplesToOpenApiDocument(
  paths: Record<string, Record<string, unknown>>,
  components: Record<string, unknown>,
): void {
  for (const pathItem of Object.values(paths)) {
    for (const operation of Object.values(pathItem)) {
      if (!operation || typeof operation !== "object") continue;
      const op = operation as Record<string, unknown>;
      const responses =
        op.responses && typeof op.responses === "object"
          ? (op.responses as Record<string, unknown>)
          : undefined;
      if (!responses) continue;

      for (const response of Object.values(responses)) {
        if (!response || typeof response !== "object") continue;
        const res = response as Record<string, unknown>;
        const content =
          res.content && typeof res.content === "object"
            ? (res.content as Record<string, unknown>)
            : undefined;
        if (!content) continue;
        const appJson = content["application/json"];
        if (!appJson || typeof appJson !== "object") continue;
        const media = appJson as Record<string, unknown>;
        if (media.example !== undefined || media.examples !== undefined) continue;
        if (!media.schema) continue;
        media.example = exampleFromSchema(inlineComponentRefs(media.schema, components));
      }
    }
  }
}

function toOpenApiPath(filePath: string): string {
  const normalized = filePath.replace(/\\/g, "/");
  const withoutPrefix = normalized.replace(/^src\/app\/api/, "");
  const withoutRoute = withoutPrefix.replace(/\/route\.(ts|js)$/, "");
  const withParams = withoutRoute.replace(/\[([^\]]+)\]/g, "{$1}");
  return `/api${withParams}`;
}

function walkApiRouteFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const result: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      result.push(...walkApiRouteFiles(fullPath));
      continue;
    }
    if (entry.isFile() && /^route\.(ts|js)$/.test(entry.name)) {
      result.push(fullPath);
    }
  }
  return result;
}

function inferMethodsFromSource(source: string): string[] {
  const methods: string[] = [];
  for (const method of ["GET", "POST", "PATCH", "PUT", "DELETE"]) {
    if (new RegExp(`export\\s+async\\s+function\\s+${method}\\s*\\(`).test(source)) {
      methods.push(method.toLowerCase());
    }
  }
  return methods;
}

function addDiscoveredRoutes(paths: Record<string, Record<string, unknown>>): void {
  const apiRoot = path.join(process.cwd(), "src", "app", "api");
  const files = walkApiRouteFiles(apiRoot);
  for (const file of files) {
    const relative = path.relative(process.cwd(), file).replace(/\\/g, "/");
    const routePath = toOpenApiPath(relative);
    const source = fs.readFileSync(file, "utf8");
    const methods = inferMethodsFromSource(source);
    if (!paths[routePath]) {
      paths[routePath] = {};
    }
    for (const method of methods) {
      if (paths[routePath][method]) {
        continue;
      }
      paths[routePath][method] = {
        operationId: `${method}${routePath.replace(/[\/{}-]+/g, "_")}`,
        summary: `Auto-discovered ${method.toUpperCase()} ${routePath}`,
        tags: ["AutoDiscovered"],
        responses: {
          "200": {
            description: "Successful response",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  additionalProperties: true,
                },
              },
            },
          },
          "500": {
            description: "Server error",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    error: { type: "string" },
                  },
                  required: ["error"],
                  additionalProperties: true,
                },
              },
            },
          },
        },
      };
    }
  }
}

function buildOpenApiDocumentInternal(): OpenApiDocument {
  const paths: Record<string, Record<string, unknown>> = {};

  for (const route of apiContractRoutes) {
    if (!paths[route.path]) {
      paths[route.path] = {};
    }

    paths[route.path][route.method] = {
      operationId: route.operationId,
      summary: route.summary,
      tags: route.tags,
      parameters: route.openapi.parameters,
      requestBody: route.openapi.requestBody,
      responses: route.openapi.responses,
      security: route.openapi.security,
    };
  }
  addDiscoveredRoutes(paths);
  const schemas = {
    ...liveSetJsonSchemas,
    ...playlistJsonSchemas,
    ...trackJsonSchemas,
    ...albumJsonSchemas,
    ...friendJsonSchemas,
    ...genreJsonSchemas,
    ...recordCareJsonSchemas,
    ...spinJsonSchemas,
    ...playerJsonSchemas,
  };
  addExamplesToOpenApiDocument(paths, schemas);

  return {
    openapi: "3.1.0",
    info: {
      title: "GrooveNet API",
      version: "1.0.0",
      description:
        "OpenAPI for validated API handlers. Generated from src/api-contract definitions.",
    },
    servers: [{ url: "/" }],
    paths,
    components: {
      securitySchemes: {
        PlayerWebSession: {
          type: "apiKey",
          in: "cookie",
          name: "__Secure-gn-player",
          description:
            "Short-lived player-only browser session. Mutations require the configured same-origin Origin header; administration still requires bearer authorization.",
        },
        BearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
          description:
            "Player endpoints require the household player bearer credential or an authorized player-only browser session where documented.",
        },
      },
      schemas,
    },
  };
}

export function getOpenApiDocument(): OpenApiDocument {
  if (!cachedOpenApiDocument) {
    cachedOpenApiDocument = buildOpenApiDocumentInternal();
  }
  return cachedOpenApiDocument;
}

function buildMobileOpenApiDocumentInternal(): OpenApiDocument {
  const fullDoc = getOpenApiDocument();
  const mobilePaths = Object.fromEntries(
    Object.entries(fullDoc.paths).filter(([path]) => MOBILE_OPENAPI_PATHS.has(path)),
  );

  return {
    ...fullDoc,
    info: {
      ...fullDoc.info,
      title: "GrooveNet Mobile API",
      description:
        "Mobile-focused subset of the GrooveNet API for playlist generation and downloadable playlist workflows.",
    },
    paths: mobilePaths,
  };
}

export function getMobileOpenApiDocument(): OpenApiDocument {
  if (!cachedMobileOpenApiDocument) {
    cachedMobileOpenApiDocument = buildMobileOpenApiDocumentInternal();
  }
  return cachedMobileOpenApiDocument;
}

export function invalidateOpenApiCache(): void {
  cachedOpenApiDocument = null;
  cachedMobileOpenApiDocument = null;
}
