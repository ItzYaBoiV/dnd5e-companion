import { useEffect, useMemo, useRef, useState } from "react";
import type { RenderCell } from "@/lib/dungeonTileRenderer";
import { monsterTokenSpriteWithFallback, publicAssetUrl } from "@/lib/tokenSprites";

/**
 * Preloads monster SVGs used by scripted map entities (forge cells), for canvas drawing.
 */
export function useMapEntityTokenImages(grid: RenderCell[][] | null | undefined): {
  images: Map<string, HTMLImageElement>;
  version: number;
} {
  const [version, setVersion] = useState(0);
  const imagesRef = useRef(new Map<string, HTMLImageElement>());

  const urlsKey = useMemo(() => {
    const s = new Set<string>();
    for (const row of grid ?? []) {
      for (const cell of row) {
        if (cell.eType !== "monster" || !cell.extra || typeof cell.extra !== "object") continue;
        const ex = cell.extra && typeof cell.extra === "object" ? (cell.extra as { slug?: string }) : null;
        const slug = ex?.slug;
        const key = slug ?? cell.eName;
        if (key) s.add(publicAssetUrl(monsterTokenSpriteWithFallback(String(key))));
      }
    }
    return [...s].sort().join("\n");
  }, [grid]);

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
      if (!url.startsWith("data:") && !url.startsWith("blob:")) {
        img.crossOrigin = "anonymous";
      }
      img.onload = tryDone;
      img.onerror = tryDone;
      img.src = url;
      map.set(url, img);
    }

    if (needCallbacks === 0) setVersion((v) => v + 1);
  }, [urlsKey]);

  return { images: imagesRef.current, version };
}
