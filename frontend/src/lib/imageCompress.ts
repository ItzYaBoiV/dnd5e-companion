/**
 * Resize and compress an image for token storage (keeps localStorage / DB payloads small).
 */
const MAX_EDGE = 96;
const JPEG_QUALITY = 0.82;

export async function compressImageFileToDataUrl(file: File): Promise<string> {
  const bmp = await createImageBitmap(file);
  try {
    const w = bmp.width;
    const h = bmp.height;
    const scale = Math.min(1, MAX_EDGE / Math.max(w, h));
    const tw = Math.max(1, Math.round(w * scale));
    const th = Math.max(1, Math.round(h * scale));
    const canvas = document.createElement("canvas");
    canvas.width = tw;
    canvas.height = th;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas not available");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bmp, 0, 0, tw, th);
    return canvas.toDataURL("image/jpeg", JPEG_QUALITY);
  } finally {
    bmp.close();
  }
}
