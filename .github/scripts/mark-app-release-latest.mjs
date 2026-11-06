import { execFileSync } from "node:child_process";

export function markAppReleaseLatest(tag, run = execFileSync) {
  if (!/^v\d+\.\d+\.\d+$/.test(tag ?? "")) {
    throw new Error(`Expected an app release tag (vX.Y.Z), received: ${tag ?? "<empty>"}`);
  }

  run("gh", ["release", "edit", tag, "--latest"], { stdio: "inherit" });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  markAppReleaseLatest(process.env.RELEASE_TAG);
}
