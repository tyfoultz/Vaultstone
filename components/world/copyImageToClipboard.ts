/**
 * Copy an image to the system clipboard as PNG. Web-only — both callers
 * (the lore canvas and the Tiptap image node view) are `.web.tsx`.
 *
 * The subtlety is user activation. `navigator.clipboard.write` requires
 * it, and activation does NOT survive an `await` — fetching the image and
 * transcoding it to PNG first is exactly long enough for Chrome to reject
 * the write with NotAllowedError, which is why Ctrl+C over an image did
 * nothing at all. Passing a *Promise* as the ClipboardItem value keeps the
 * `write()` call itself inside the activation and lets the browser wait on
 * the blob. (Safari requires this shape too.)
 *
 * Callers must therefore invoke this synchronously from the user's own
 * event handler — not after their own `await`.
 *
 * PNG because it's the only bitmap type the async clipboard API is
 * required to support, so a JPEG or WebP has to be re-encoded; that's the
 * canvas round-trip below. Fetching the bytes rather than drawing the live
 * `<img>` also keeps the canvas untainted, which matters for the signed
 * Supabase Storage URLs these images use.
 *
 * Resolves false rather than throwing — every failure here (no clipboard
 * API, CORS, denied permission) is something the caller wants to surface
 * as "couldn't copy", not as an exception.
 */
export async function copyImageToClipboard(src: string): Promise<boolean> {
  if (typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) return false;

  const png = (async () => {
    const res = await fetch(src);
    const blob = await res.blob();
    if (blob.type === 'image/png') return blob;
    const bitmap = await createImageBitmap(blob);
    const cvs = document.createElement('canvas');
    cvs.width = bitmap.width;
    cvs.height = bitmap.height;
    cvs.getContext('2d')!.drawImage(bitmap, 0, 0);
    const out = await new Promise<Blob | null>((r) => cvs.toBlob(r, 'image/png'));
    if (!out) throw new Error('could not encode PNG');
    return out;
  })();

  try {
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]);
    return true;
  } catch {
    // Engines that reject a Promise-valued ClipboardItem (Firefox) get a
    // second pass with the resolved blob.
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': await png })]);
      return true;
    } catch {
      return false;
    }
  }
}
