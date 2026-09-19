import { apiContractRoutes } from "@/api-contract/routes";
import fs from "node:fs";
import path from "node:path";

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
  "/api/spins/{id}",
  "/api/discogs/verify-manifests",
]);

function exampleFromSchema(schema: unknown): unknown {
  if (!schema || typeof schema !== "object") return "example";
  const s = schema as Record<string, unknown>;

  if (s.example !== undefined) return s.example;

  if (Array.isArray(s.oneOf) && s.oneOf.length > 0) {
    return exampleFromSchema(s.oneOf[0]);
  }

  const type = s.type;
  if (type === "string") return "string";
  if (type === "integer") return 1;
  if (type === "number") return 1.23;
  if (type === "boolean") return true;
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
    if (s.additionalProperties) {
      const additional =
        s.additionalProperties === true ? { type: "string" } : s.additionalProperties;
      return { exampleKey: exampleFromSchema(additional) };
    }
    return {};
  }

  return "example";
}

function addExamplesToOpenApiDocument(paths: Record<string, Record<string, unknown>>): void {
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
        media.example = exampleFromSchema(media.schema);
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
  addExamplesToOpenApiDocument(paths);

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
        BearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
          description:
            "Defined for endpoints that use bearer auth. No current documented endpoint requires it.",
        },
      },
      schemas: {},
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
    Object.entries(fullDoc.paths).filter(([path]) => MOBILE_OPENAPI_PATHS.has(path))
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
