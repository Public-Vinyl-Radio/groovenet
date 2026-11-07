import { expect, it } from "vitest";
import { artistReviewBodySchema, artistReviewContracts } from "./artistReview";
it("requires unambiguous identities, valid roles/order, and positive IDs", () => {
  const credit = { name: "A", role: "primary", position: 0, credited_as: "A" };
  const parse = (credits: unknown[]) =>
    artistReviewBodySchema.safeParse({ decision: { action: "split", artist_id: 1, credits } })
      .success;
  expect(parse([credit, { ...credit, name: "B", role: "featured", position: 1 }])).toBe(true);
  for (const invalid of [
    { ...credit, artist_id: 2 },
    { ...credit, role: "bad" },
    { ...credit, position: -1 },
    { ...credit, name: " " },
    {},
  ])
    expect(parse([credit, invalid])).toBe(false);
});
it("documents GET and POST runtime schemas and JSON responses", () => {
  expect(artistReviewContracts.map((c) => c.method)).toEqual(["get", "post"]);
  for (const contract of artistReviewContracts) {
    expect(contract.path).toBe("/api/artists/review");
    expect(contract.openapi.responses["200"]).toHaveProperty("content.application/json.schema");
  }
});
