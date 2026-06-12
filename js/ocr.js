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

/* Receipt-tuned preprocessing. Receipts are tall and narrow, so scaling is
 * driven by WIDTH (the text column), not the long edge — a long-edge cap
 * shrinks receipt text to illegibility. Grayscale + percentile contrast
 * stretch is done on raw pixels (ctx.filter is silently ignored on older
 * iOS Safari). */
async function preprocess(file, targetWidth = 1400, maxEdge = 4000) {
  const bitmap = await createImageBitmap(file);
  let scale = targetWidth / bitmap.width;
  scale = Math.min(scale, maxEdge / Math.max(bitmap.width, bitmap.height), 1.5);
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();

  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const n = w * h;

  // grayscale (Rec. 601 luma) + histogram
  const gray = new Uint8Array(n);
  const hist = new Uint32Array(256);
  for (let i = 0; i < n; i++) {
    const p = i * 4;
    const g = (d[p] * 77 + d[p + 1] * 150 + d[p + 2] * 29) >> 8;
    gray[i] = g;
    hist[g]++;
  }

  // contrast stretch between the 2nd and 98th percentiles — normalises
  // dim photos and shadow gradients without destroying glyph edges the
  // way a hard global threshold would
  let lo = 0, hi = 255, acc = 0;
  const loCut = n * 0.02, hiCut = n * 0.98;
  for (let g = 0; g < 256; g++) {
    acc += hist[g];
    if (acc <= loCut) lo = g;
    if (acc <= hiCut) hi = g;
  }
  const range = Math.max(1, hi - lo);
  for (let i = 0; i < n; i++) {
    const p = i * 4;
    const v = Math.max(0, Math.min(255, Math.round(((gray[i] - lo) * 255) / range)));
    d[p] = d[p + 1] = d[p + 2] = v;
  }
  ctx.putImageData(img, 0, 0);
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
    await worker.setParameters({
      tessedit_pageseg_mode: '4',
      preserve_interword_spaces: '1',
      user_defined_dpi: '300',
    });
    const { data } = await worker.recognize(canvas);
    return data.text || '';
  } finally {
    if (worker) await worker.terminate().catch(() => {});
    // release the photo — it must never outlive recognition
    if (canvas) { canvas.width = 0; canvas.height = 0; canvas = null; }
  }
}
