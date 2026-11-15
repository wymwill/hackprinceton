/**
 * Share cards as images, made on the device (no image service, nothing uploaded).
 * Used by Bookie Wrapped and the series recap.
 */

/** Text that's safe inside SVG markup. */
export const escapeSvg = (s: string) =>
  s.replace(/[\p{Cc}\p{Cf}]/gu, "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]!);

/** Draw an SVG at its full size and return it as a PNG. */
export async function svgToPng(svg: string, width: number, height: number): Promise<Blob> {
  const image = new Image();
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Image export failed"));
      image.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas unavailable");
    context.drawImage(image, 0, 0, width, height);
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob((file) => (file ? resolve(file) : reject(new Error("Image export failed"))), "image/png"));
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Hand a PNG to the phone's share sheet when asked and supported, otherwise download it.
 * Closing the share sheet isn't an error: it answers "cancelled".
 */
export async function sharePng(blob: Blob, filename: string, opts: { share: boolean; title: string; text: string }): Promise<"shared" | "downloaded" | "cancelled"> {
  const file = new File([blob], filename, { type: "image/png" });
  if (opts.share && navigator.share && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ title: opts.title, text: opts.text, files: [file] });
      return "shared";
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return "cancelled";
      throw e;
    }
  }
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(href);
  return "downloaded";
}
