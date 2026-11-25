import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Several tests call the real `loadConfig()`. Keep them off the developer's own
// ~/.groovenet/config.json, whatever it holds.
process.env.HOME = mkdtempSync(join(tmpdir(), "groovenet-cli-test-home-"));
delete process.env.GROOVENET_CA_CERT;
