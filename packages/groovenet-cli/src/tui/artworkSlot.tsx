import React, {
  createContext,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { Box, Text, measureElement, useStdout, type DOMElement } from "ink";
import type { GroovenetClient } from "@groovenet/client";
import { ArtSlot } from "./primitives.js";
import {
  ArtworkCache,
  deleteImage,
  detectArtwork,
  imageId,
  placeholderRows,
  transmit,
  type ArtworkSupport,
} from "./artwork.js";
import { artSlotReporter } from "./artSlots.js";

export interface ArtworkRuntime extends ArtworkSupport {
  cache: ArtworkCache;
  /** Raw graphics commands must bypass Ink's text log writer. */
  write: (sequence: string) => void;
}
export const ArtworkContext = createContext<ArtworkRuntime | null>(null);

export function ArtworkProvider({ api, children }: { api: GroovenetClient; children: ReactNode }) {
  const { stdout } = useStdout();
  const cache = useMemo(() => new ArtworkCache(api), [api]);
  const [support, setSupport] = useState<ArtworkSupport>({ mode: "off", tmux: false });
  useEffect(() => {
    if (!(stdout as NodeJS.WriteStream).isTTY) return;
    let active = true;
    void detectArtwork({ tty: true }).then((value) => {
      if (active) setSupport(value);
    });
    return () => {
      active = false;
    };
  }, [stdout]);
  const runtime = useMemo(
    () => ({
      ...support,
      cache,
      write: (sequence: string) => {
        stdout.write(sequence);
      },
    }),
    [support, cache, stdout],
  );
  return <ArtworkContext.Provider value={runtime}>{children}</ArtworkContext.Provider>;
}

/** Reports the slot's cell rectangle when `GROOVENET_TUI_ART_SLOTS` is set; see `artSlots.ts`. */
function useArtSlotReport(ref: RefObject<DOMElement | null>, sources: string) {
  const id = useId();
  // Ink types it as a plain writable; it is the terminal's stdout, which has a size.
  const stdout = useStdout().stdout as NodeJS.WriteStream;
  const reporter = artSlotReporter();
  // Every render: the slot moves with the layout around it, not only its own props.
  useEffect(() => {
    if (!reporter || !ref.current) return;
    const { x, y, width, height } = measureElement(ref.current);
    reporter.set(
      id,
      { x, y, width, height, sources: JSON.parse(sources) as string[] },
      { columns: stdout.columns, rows: stdout.rows },
    );
  });
  useEffect(() => (reporter ? () => reporter.delete(id) : undefined), [reporter, id]);
}

export function ArtworkSlot({
  source,
  fallbacks = [],
  width,
  height,
}: {
  source?: string | null;
  fallbacks?: readonly string[];
  width: number;
  height: number;
}) {
  const runtime = useContext(ArtworkContext);
  const [loaded, setLoaded] = useState<{ key: string; rows: string[] } | null>(null);
  const sources = JSON.stringify([
    ...new Set([source, ...fallbacks].filter((url): url is string => !!url)),
  ]);
  const key = JSON.stringify([sources, width, height, runtime?.mode]);
  const ref = useRef<DOMElement>(null);
  useArtSlotReport(ref, sources);
  useEffect(() => {
    setLoaded(null);
    if (sources === "[]" || !runtime || runtime.mode === "off") return;
    let active = true;
    let id: number | undefined;
    const load = async () => {
      let image;
      for (const url of JSON.parse(sources) as string[]) {
        if (!active) return;
        try {
          image = await runtime.cache.get(url, width, height, runtime.mode);
          break;
        } catch {
          /* A stale cover URL should not hide the next available cover. */
        }
      }
      if (!active || !image) return;
      if (runtime.mode === "kitty") {
        const nextId = imageId();
        runtime.write(transmit(image.png, nextId, width, height, runtime.tmux));
        id = nextId;
        setLoaded({ key, rows: placeholderRows(nextId, width, height) });
      } else setLoaded({ key, rows: image.rows });
    };
    void load().catch(() => {
      setLoaded(null);
    });
    return () => {
      active = false;
      if (id !== undefined) runtime.write(deleteImage(id, runtime.tmux));
    };
  }, [sources, width, height, key, runtime]);
  if (!loaded || loaded.key !== key) return <ArtSlot ref={ref} width={width} height={height} />;
  // Image colours encode pixels/IDs, so deliberately bypass text theme roles.
  return (
    <Box ref={ref} flexDirection="column" width={width} height={height} flexShrink={0}>
      {loaded.rows.map((row, index) => (
        <Text key={index}>{row}</Text>
      ))}
    </Box>
  );
}
