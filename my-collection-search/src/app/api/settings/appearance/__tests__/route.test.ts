import { beforeEach, describe, expect, it, vi } from "vitest";

const service = vi.hoisted(() => ({
  getAppearance: vi.fn(),
  updateAppearance: vi.fn(),
}));
vi.mock("@/server/services/settingsService", () => ({ settingsService: service }));

import { GET, PUT } from "../route";

const put = (body: string) =>
  PUT(new Request("http://localhost/api/settings/appearance", { method: "PUT", body }));

const saved = {
  palette: "sleeve",
  fonts: { display: "default", body: "default", label: "default" },
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("GET /api/settings/appearance", () => {
  it("returns the shared palette and every font", async () => {
    service.getAppearance.mockResolvedValue(saved);

    const res = await GET();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(saved);
  });

  it("returns 500 when loading fails", async () => {
    service.getAppearance.mockRejectedValue(new Error("db down"));
    expect((await GET()).status).toBe(500);
  });
});

describe("PUT /api/settings/appearance", () => {
  it("still accepts the original { palette } body", async () => {
    service.updateAppearance.mockResolvedValue(saved);

    const res = await put(JSON.stringify({ palette: "sleeve" }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(saved);
    expect(service.updateAppearance).toHaveBeenCalledWith({ palette: "sleeve" });
  });

  it("passes on only the fonts it is sent", async () => {
    service.updateAppearance.mockResolvedValue(saved);

    const res = await put(JSON.stringify({ fonts: { body: "inter", display: "barlow-condensed" } }));

    expect(res.status).toBe(200);
    expect(service.updateAppearance).toHaveBeenCalledWith({
      fonts: { body: "inter", display: "barlow-condensed" },
    });
  });

  it("accepts an empty body as no change", async () => {
    service.updateAppearance.mockResolvedValue(saved);
    expect((await put(JSON.stringify({}))).status).toBe(200);
    expect(service.updateAppearance).toHaveBeenCalledWith({});
  });

  it.each([
    ["an unknown palette", { palette: "vaporwave" }, "palette must be one of: sleeve"],
    ["a non-string palette", { palette: 3 }, "palette must be one of: sleeve"],
    ["a prototype key", { palette: "constructor" }, "palette must be one of: sleeve"],
    ["an unknown font", { fonts: { body: "comic-sans" } }, "fonts.body must be one of: default, inter, system"],
    ["another role's font", { fonts: { body: "zilla-slab" } }, "fonts.body must be one of"],
    ["a non-string font", { fonts: { label: 4 } }, "fonts.label must be one of: default, jetbrains-mono, system"],
    ["an unknown role", { fonts: { heading: "inter" } }, "Body may only contain"],
    ["an unknown field", { size: "large" }, "Body may only contain"],
    ["fonts that are not an object", { fonts: "inter" }, "Body may only contain"],
  ])("rejects %s with a message that says what is allowed", async (_label, body, message) => {
    const res = await put(JSON.stringify(body));

    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain(message);
    expect(service.updateAppearance).not.toHaveBeenCalled();
  });

  it("rejects a body that is not JSON", async () => {
    expect((await put("{nope")).status).toBe(400);
    expect(service.updateAppearance).not.toHaveBeenCalled();
  });

  it("returns 500 when saving fails", async () => {
    service.updateAppearance.mockRejectedValue(new Error("db down"));
    expect((await put(JSON.stringify({ palette: "sleeve" }))).status).toBe(500);
  });
});
