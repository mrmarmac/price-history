/* Generates the PWA icons (price-tag glyph on dark rounded background)
 * as PNGs without any image library — raw RGBA pixels + zlib + PNG chunks.
 * Run: node tools/make-icons.js */

import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

const BG = [26, 29, 41, 255];      // #1a1d29
const TAG = [79, 142, 247, 255];   // #4f8ef7
const HOLE = [26, 29, 41, 255];

function crc32(buf) {
  let c, table = crc32.table;
  if (!table) {
    table = crc32.table = [];
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (const b of buf) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function png(width, height, pixels) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // filter none
    pixels.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* Draw: rounded-rect bg + rotated price-tag with a hole. */
function drawIcon(size, { maskable = false } = {}) {
  const px = Buffer.alloc(size * size * 4);
  const cornerR = maskable ? 0 : size * 0.18;
  const cx = size / 2, cy = size / 2;
  const ang = -Math.PI / 4;
  const cos = Math.cos(ang), sin = Math.sin(ang);
  const tagW = size * 0.46, tagH = size * 0.34, tipL = size * 0.14;
  const holeR = size * 0.045;
  const holeCX = -tagW / 2 + size * 0.07;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      // rounded-rect background
      let inBg = true;
      if (!maskable) {
        const dx = Math.max(cornerR - x, x - (size - 1 - cornerR), 0);
        const dy = Math.max(cornerR - y, y - (size - 1 - cornerR), 0);
        inBg = dx * dx + dy * dy <= cornerR * cornerR;
      }
      if (!inBg) { px.set([0, 0, 0, 0], i); continue; }

      // rotate into tag space
      const rx = (x - cx) * cos + (y - cy) * sin;
      const ry = -(x - cx) * sin + (y - cy) * cos;

      let color = BG;
      const inBody = Math.abs(ry) <= tagH / 2 && rx >= -tagW / 2 && rx <= tagW / 2;
      const inTip = rx > tagW / 2 && rx <= tagW / 2 + tipL &&
        Math.abs(ry) <= (tagH / 2) * (1 - (rx - tagW / 2) / tipL);
      if (inBody || inTip) {
        const hx = rx - holeCX, hy = ry;
        color = (hx * hx + hy * hy <= holeR * holeR) ? HOLE : TAG;
      }
      px.set(color, i);
    }
  }
  return png(size, size, px);
}

mkdirSync('icons', { recursive: true });
writeFileSync('icons/icon-192.png', drawIcon(192));
writeFileSync('icons/icon-512.png', drawIcon(512));
writeFileSync('icons/icon-512-maskable.png', drawIcon(512, { maskable: true }));
writeFileSync('icons/apple-touch-icon.png', drawIcon(180, { maskable: true }));
console.log('icons written');
