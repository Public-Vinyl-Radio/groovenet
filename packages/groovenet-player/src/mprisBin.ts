#!/usr/bin/env node
import { defaultPlayerPaths } from "./paths.js";
import { startMpris } from "./mpris.js";

try {
  const close = await startMpris(defaultPlayerPaths().socketPath, {
    onError: (error) => {
      console.error("Groovenet MPRIS:", error);
      process.exitCode = 1;
    },
  });
  if (close) {
    const stop = () => {
      void close().finally(() => {
        process.off("SIGINT", stop);
        process.off("SIGTERM", stop);
      });
    };
    process.on("SIGINT", stop);
    process.on("SIGTERM", stop);
  } else {
    console.error("Groovenet MPRIS disabled: requires Linux and DBUS_SESSION_BUS_ADDRESS.");
  }
} catch (error) {
  console.error(
    "Could not start Groovenet MPRIS (install the optional dbus-next dependency and start the player daemon):",
    error,
  );
  process.exitCode = 1;
}
