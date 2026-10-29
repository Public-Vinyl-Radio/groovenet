import { useEffect, useState } from "react";
import { useStdout } from "ink";

export interface TerminalSize {
  columns: number;
  rows: number;
}

// Ink's own fallback when a stream reports no size (piped, some CI runners).
const FALLBACK: TerminalSize = { columns: 80, rows: 24 };

function read(stdout: NodeJS.WriteStream): TerminalSize {
  return { columns: stdout.columns || FALLBACK.columns, rows: stdout.rows || FALLBACK.rows };
}

/** `stdout`'s size, updated on every `resize`. */
export function useTerminalSize(): TerminalSize {
  // Ink types it as a plain writable; it is the terminal's stdout, which has a size.
  const stdout = useStdout().stdout as NodeJS.WriteStream;
  const [size, setSize] = useState(() => read(stdout));
  useEffect(() => {
    const onResize = () => setSize(read(stdout));
    stdout.on("resize", onResize);
    return () => {
      stdout.off("resize", onResize);
    };
  }, [stdout]);
  return size;
}
