import { describe, expect, it } from "vitest";
import type { ServiceHealth } from "@/services/internalApi/system";
import { checklistSteps } from "./firstImportSteps";

const svc = (service: string, status: ServiceHealth["status"]): ServiceHealth => ({
  service,
  status,
  latencyMs: 1,
});
const ids = (services?: ServiceHealth[]) => checklistSteps(services).map((s) => s.id);
const step = (services: ServiceHealth[] | undefined, id: string) =>
  checklistSteps(services).find((s) => s.id === id)!;

describe("checklistSteps", () => {
  it("shows every step with its requirement when nothing is known", () => {
    expect(ids(undefined)).toEqual(["analyse", "apple-music", "youtube", "ai", "playlist"]);
    expect(step(undefined, "analyse").needs).toContain("downloads profile");
    expect(step(undefined, "playlist").needs).toContain("optimize profile");
    expect(step(undefined, "ai").needs).toBe("OPENAI_API_KEY");
  });

  it("drops a requirement that is detectably met", () => {
    const services = [svc("essentia", "up"), svc("ga-service", "up"), svc("embeddings", "up")];
    expect(step(services, "analyse").needs).toBeUndefined();
    expect(step(services, "playlist").needs).toBeUndefined();
  });

  it("hides the AI step once embeddings work, as there is nothing left to set up", () => {
    expect(ids([svc("embeddings", "up")])).not.toContain("ai");
    expect(ids([svc("embeddings", "down")])).toContain("ai");
    expect(ids([svc("embeddings", "unknown")])).toContain("ai");
  });

  it("keeps the requirement while a service is down or unknown", () => {
    const services = [svc("essentia", "down"), svc("ga-service", "unknown")];
    expect(step(services, "analyse").needs).toContain("downloads profile");
    expect(step(services, "playlist").needs).toContain("optimize profile");
  });

  it("always names the requirement of what the app can't probe cheaply", () => {
    const everythingUp = [svc("essentia", "up"), svc("ga-service", "up"), svc("embeddings", "up")];
    expect(step(everythingUp, "apple-music").needs).toContain("APPLE_MUSIC_TEAM_ID");
    expect(step(everythingUp, "youtube").needs).toBe("YOUTUBE_API_KEY");
  });
});
