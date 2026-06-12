/* Tesseract.js wrapper. Everything is vendored under ./vendor/tesseract/
 * (same-origin worker requirement + offline caching via the service worker).
 * The worker is created lazily on first use and terminated after each
 * recognition to free ~100 MB of wasm memory.
 *
 * Privacy rule: the receipt photo is NEVER persisted. It only ever lives in
 * an in-memory canvas, which is released right after recognition. */

const VENDOR = new URL('../vendor/tesseract/', import.meta.url).href;

let tesseractLoaded = false;

async function loadTesseract() {
  if (tesseractLoaded) return;
  await new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = VENDOR + 'tesseract.min.js';
    s.onload = resolve;
    s.onerror = () => reject(new Error('Failed to load OCR engine'));
    document.head.appendChild(s);
  });
  tesseractLoaded = true;
}

/* Downscale + grayscale on a canvas: faster OCR, usually more accurate
 * for phone photos of receipts. */
async function preprocess(file, maxEdge = 1600) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.filter = 'grayscale(1) contrast(1.2)';
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  return canvas;
}

/* recognize(file, onProgress) → raw OCR text. onProgress gets 0..1. */
export async function recognizeReceipt(file, onProgress = () => {}) {
  await loadTesseract();
  let canvas = await preprocess(file);
  let worker = null;
  try {
    worker = await Tesseract.createWorker('eng+deu', 1, {
      workerPath: VENDOR + 'worker.min.js',
      corePath: VENDOR + 'core/',
      langPath: VENDOR + 'lang/',
      gzip: true,
      logger: (m) => {
        if (m.status === 'recognizing text') onProgress(0.3 + 0.7 * m.progress);
        else onProgress(Math.min(0.3, 0.1 + (m.progress || 0) * 0.2));
      },
    });
    // PSM 4: single column of variable-size text — receipt-shaped
    await worker.setParameters({ tessedit_pageseg_mode: '4' });
    const { data } = await worker.recognize(canvas);
    return data.text || '';
  } finally {
    if (worker) await worker.terminate().catch(() => {});
    // release the photo — it must never outlive recognition
    if (canvas) { canvas.width = 0; canvas.height = 0; canvas = null; }
  }
}
