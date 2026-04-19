import { useEffect, useMemo, useRef, useState } from "react";
import type { BattleToken } from "@/lib/playerMapBroadcast";

/**
 * Preloads token portrait/sprite URLs for canvas drawing; bumps `version` when loading finishes.
 */
export function useBattleTokenImages(tokens: BattleToken[] | null | undefined): {
  images: Map<string, HTMLImageElement>;
  version: number;
} {
  const [version, setVersion] = useState(0);
  const imagesRef = useRef(new Map<string, HTMLImageElement>());

  const urlsKey = useMemo(() => {
    const s = new Set<string>();
    for (const t of tokens ?? []) {
      if (t.portraitUrl) s.add(t.portraitUrl);
      if (t.spriteUrl) s.add(t.spriteUrl);
    }
    return [...s].sort().join("\n");
  }, [tokens]);

  useEffect(() => {
    const wanted = new Set(urlsKey ? urlsKey.split("\n").filter(Boolean) : []);
    const map = imagesRef.current;
    for (const k of [...map.keys()]) {
      if (!wanted.has(k)) map.delete(k);
    }
    if (wanted.size === 0) {
      setVersion((v) => v + 1);
      return;
    }

    let needCallbacks = 0;
    let finished = 0;
    const tryDone = () => {
      finished++;
      if (finished >= needCallbacks) setVersion((v) => v + 1);
    };

    for (const url of wanted) {
      const existing = map.get(url);
      if (existing && existing.complete && existing.naturalWidth > 0) continue;

      needCallbacks++;
      const img = new Image();
      img.decoding = "async";
      img.onload = tryDone;
      img.onerror = tryDone;
      img.src = url;
      map.set(url, img);
    }

    if (needCallbacks === 0) setVersion((v) => v + 1);
  }, [urlsKey]);

  return { images: imagesRef.current, version };
}
