import { beforeEach, describe, expect, it, vi } from "vitest";

const fs = vi.hoisted(() => ({ readFileSync: vi.fn() }));
vi.mock("node:fs", () => fs);

import { parseTrackRefs, readTracksSource } from "./playlistTrackRefs.js";

describe("parseTrackRefs", () => {
  it("parses refs in order, applying the default friend to bare ids", () => {
    expect(parseTrackRefs("1-A1\n2-B2,7\n 3-C1 , 8 \n", 4)).toEqual([
      { track_id: "1-A1", friend_id: 4 },
      { track_id: "2-B2", friend_id: 7 },
      { track_id: "3-C1", friend_id: 8 },
    ]);
  });

  it("skips comments and blank lines, and handles CRLF", () => {
    expect(parseTrackRefs("# header\r\n\r\n   \r\n1-A1\r\n  # indented\r\n", 1)).toEqual([
      { track_id: "1-A1", friend_id: 1 },
    ]);
  });

  it("does not need a default friend when every line names one", () => {
    expect(parseTrackRefs("1-A1,2", undefined)).toEqual([{ track_id: "1-A1", friend_id: 2 }]);
  });

  it("reports a missing default friend per bare line", () => {
    expect(() => parseTrackRefs("1-A1,2\n2-B1\n3-C1", undefined)).toThrow(
      "line 2: no friend_id and no default_friend_id configured\nline 3: no friend_id",
    );
    expect(() => parseTrackRefs("1-A1", 0)).toThrow("no default_friend_id");
  });

  it("reports every bad line with its line number", () => {
    let message = "";
    try {
      parseTrackRefs("1-A1\n,5\n# c\n2-B1,abc\n3-C1,0\n4-D1,1,2\n5-E1,1.5\n", 1);
    } catch (err) {
      message = (err as Error).message;
    }
    expect(message).toContain("line 2: missing track_id");
    expect(message).toContain('line 4: friend_id must be a positive integer, got "abc"');
    expect(message).toContain('line 5: friend_id must be a positive integer, got "0"');
    expect(message).toContain(
      'line 6: expected "track_id" or "track_id,friend_id", got "4-D1,1,2"',
    );
    expect(message).toContain('line 7: friend_id must be a positive integer, got "1.5"');
    expect(message).not.toContain("line 1:");
  });

  it("rejects a file with no refs", () => {
    expect(() => parseTrackRefs("# only a comment\n\n", 1)).toThrow("no track refs");
  });
});

describe("readTracksSource", () => {
  beforeEach(() => fs.readFileSync.mockReset());

  it("reads a path", () => {
    fs.readFileSync.mockReturnValue("1-A1");
    expect(readTracksSource("refs.txt")).toBe("1-A1");
    expect(fs.readFileSync).toHaveBeenCalledWith("refs.txt", "utf8");
  });

  it("reads stdin for -", () => {
    fs.readFileSync.mockReturnValue("2-B1");
    expect(readTracksSource("-")).toBe("2-B1");
    expect(fs.readFileSync).toHaveBeenCalledWith(0, "utf8");
  });
});
