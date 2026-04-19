/**
 * Opens a printable HTML packet (DM map + ASCII + room list) in a new window.
 * Uses @media print for page breaks; user saves as PDF from the browser dialog.
 */
export function openForgePrintPacket(opts: {
  title: string;
  asciiText: string;
  dmMapDataUrl?: string | null;
  roomLines: string[];
  /** Optional HTML fragment (e.g. mausoleum table for graveyards). */
  structureTableHtml?: string | null;
}): void {
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${esc(opts.title)}</title>
<style>
  @page { margin: 12mm; }
  body { font-family: Georgia, serif; color: #111; background: #fff; }
  h1 { font-size: 18pt; }
  .page { page-break-after: always; }
  pre { font-family: ui-monospace, Menlo, monospace; font-size: 7pt; line-height: 1.05; white-space: pre; }
  img { max-width: 100%; height: auto; }
  ul { font-size: 10pt; }
  @media print {
    .no-print { display: none; }
  }
</style></head><body>
  <p class="no-print"><button onclick="window.print()">Print / Save as PDF</button></p>
  <div class="page">
    <h1>${esc(opts.title)} — DM map</h1>
    ${opts.dmMapDataUrl ? `<img src="${opts.dmMapDataUrl}" alt="DM map" />` : "<p>(Map canvas not embedded — use PNG export from Forge.)</p>"}
  </div>
  <div class="page">
    <h1>ASCII reference</h1>
    <pre>${esc(opts.asciiText)}</pre>
  </div>
  <div>
    <h1>Room notes</h1>
    <ul>${opts.roomLines.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>
    ${opts.structureTableHtml ? `<div class="structure">${opts.structureTableHtml}</div>` : ""}
  </div>
</body></html>`;
  const w = window.open("", "_blank", "noopener,noreferrer");
  if (!w) return;
  w.document.open();
  w.document.write(html);
  w.document.close();
}
