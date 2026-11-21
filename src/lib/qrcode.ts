// Gerador de QR Code (modo byte / UTF-8, versões 1–40, correção L/M/Q/H).
// Implementação própria baseada na especificação ISO/IEC 18004, sem
// dependências externas.

export type QrEcc = 'L' | 'M' | 'Q' | 'H';

export interface QrCode {
  version: number;
  size: number;
  /** modules[y][x] = true para módulo escuro */
  modules: boolean[][];
}

const ECC_ORDINAL: Record<QrEcc, number> = { L: 0, M: 1, Q: 2, H: 3 };
const ECC_FORMAT_BITS: Record<QrEcc, number> = { L: 1, M: 0, Q: 3, H: 2 };

// prettier-ignore
const ECC_CODEWORDS_PER_BLOCK: number[][] = [
  [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
  [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
];

// prettier-ignore
const NUM_ERROR_CORRECTION_BLOCKS: number[][] = [
  [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
  [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
  [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
  [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81],
];

function getBit(value: number, index: number): boolean {
  return ((value >>> index) & 1) !== 0;
}

function numRawDataModules(version: number): number {
  let result = (16 * version + 128) * version + 64;
  if (version >= 2) {
    const numAlign = Math.floor(version / 7) + 2;
    result -= (25 * numAlign - 10) * numAlign - 55;
    if (version >= 7) result -= 36;
  }
  return result;
}

function numDataCodewords(version: number, ecc: QrEcc): number {
  const e = ECC_ORDINAL[ecc];
  return Math.floor(numRawDataModules(version) / 8) - ECC_CODEWORDS_PER_BLOCK[e][version] * NUM_ERROR_CORRECTION_BLOCKS[e][version];
}

// ---------------------------------------------------------------------
// Reed–Solomon sobre GF(2^8) com polinômio 0x11D
// ---------------------------------------------------------------------
function gfMultiply(x: number, y: number): number {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z & 0xff;
}

function rsDivisor(degree: number): number[] {
  const result = new Array<number>(degree).fill(0);
  result[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < result.length; j++) {
      result[j] = gfMultiply(result[j], root);
      if (j + 1 < result.length) result[j] ^= result[j + 1];
    }
    root = gfMultiply(root, 0x02);
  }
  return result;
}

function rsRemainder(data: number[], divisor: number[]): number[] {
  const result = new Array<number>(divisor.length).fill(0);
  for (const b of data) {
    const factor = b ^ (result.shift() as number);
    result.push(0);
    divisor.forEach((coef, i) => {
      result[i] ^= gfMultiply(coef, factor);
    });
  }
  return result;
}

// ---------------------------------------------------------------------
// Montagem da matriz
// ---------------------------------------------------------------------
class Builder {
  readonly size: number;
  readonly modules: boolean[][];
  readonly isFunction: boolean[][];
  readonly version: number;
  readonly ecc: QrEcc;

  constructor(version: number, ecc: QrEcc) {
    this.version = version;
    this.ecc = ecc;
    this.size = version * 4 + 17;
    this.modules = Array.from({ length: this.size }, () => new Array<boolean>(this.size).fill(false));
    this.isFunction = Array.from({ length: this.size }, () => new Array<boolean>(this.size).fill(false));
  }

  private setFunction(x: number, y: number, dark: boolean) {
    this.modules[y][x] = dark;
    this.isFunction[y][x] = true;
  }

  drawFunctionPatterns() {
    for (let i = 0; i < this.size; i++) {
      this.setFunction(6, i, i % 2 === 0);
      this.setFunction(i, 6, i % 2 === 0);
    }
    this.drawFinder(3, 3);
    this.drawFinder(this.size - 4, 3);
    this.drawFinder(3, this.size - 4);

    const positions = this.alignmentPositions();
    const n = positions.length;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if ((i === 0 && j === 0) || (i === 0 && j === n - 1) || (i === n - 1 && j === 0)) continue;
        this.drawAlignment(positions[i], positions[j]);
      }
    }
    this.drawFormatBits(0);
    this.drawVersion();
  }

  private drawFinder(x: number, y: number) {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const dist = Math.max(Math.abs(dx), Math.abs(dy));
        const xx = x + dx;
        const yy = y + dy;
        if (xx >= 0 && xx < this.size && yy >= 0 && yy < this.size) this.setFunction(xx, yy, dist !== 2 && dist !== 4);
      }
    }
  }

  private drawAlignment(x: number, y: number) {
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) this.setFunction(x + dx, y + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }
  }

  private alignmentPositions(): number[] {
    if (this.version === 1) return [];
    const numAlign = Math.floor(this.version / 7) + 2;
    const step = this.version === 32 ? 26 : Math.ceil((this.version * 4 + 4) / (numAlign * 2 - 2)) * 2;
    const result = [6];
    for (let pos = this.size - 7; result.length < numAlign; pos -= step) result.splice(1, 0, pos);
    return result;
  }

  drawFormatBits(mask: number) {
    const data = (ECC_FORMAT_BITS[this.ecc] << 3) | mask;
    let rem = data;
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    const bits = ((data << 10) | rem) ^ 0x5412;

    for (let i = 0; i <= 5; i++) this.setFunction(8, i, getBit(bits, i));
    this.setFunction(8, 7, getBit(bits, 6));
    this.setFunction(8, 8, getBit(bits, 7));
    this.setFunction(7, 8, getBit(bits, 8));
    for (let i = 9; i < 15; i++) this.setFunction(14 - i, 8, getBit(bits, i));

    for (let i = 0; i < 8; i++) this.setFunction(this.size - 1 - i, 8, getBit(bits, i));
    for (let i = 8; i < 15; i++) this.setFunction(8, this.size - 15 + i, getBit(bits, i));
    this.setFunction(8, this.size - 8, true);
  }

  private drawVersion() {
    if (this.version < 7) return;
    let rem = this.version;
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    const bits = (this.version << 12) | rem;
    for (let i = 0; i < 18; i++) {
      const bit = getBit(bits, i);
      const a = this.size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      this.setFunction(a, b, bit);
      this.setFunction(b, a, bit);
    }
  }

  drawCodewords(data: number[]) {
    let i = 0;
    for (let right = this.size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let vert = 0; vert < this.size; vert++) {
        for (let j = 0; j < 2; j++) {
          const x = right - j;
          const upward = ((right + 1) & 2) === 0;
          const y = upward ? this.size - 1 - vert : vert;
          if (!this.isFunction[y][x] && i < data.length * 8) {
            this.modules[y][x] = getBit(data[i >>> 3], 7 - (i & 7));
            i++;
          }
        }
      }
    }
  }

  applyMask(mask: number) {
    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) {
        let invert: boolean;
        switch (mask) {
          case 0: invert = (x + y) % 2 === 0; break;
          case 1: invert = y % 2 === 0; break;
          case 2: invert = x % 3 === 0; break;
          case 3: invert = (x + y) % 3 === 0; break;
          case 4: invert = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0; break;
          case 5: invert = ((x * y) % 2) + ((x * y) % 3) === 0; break;
          case 6: invert = (((x * y) % 2) + ((x * y) % 3)) % 2 === 0; break;
          default: invert = (((x + y) % 2) + ((x * y) % 3)) % 2 === 0; break;
        }
        if (!this.isFunction[y][x] && invert) this.modules[y][x] = !this.modules[y][x];
      }
    }
  }

  /** Penalidades N1–N4 da norma: escolhe a máscara mais fácil de ler. */
  penalty(): number {
    const size = this.size;
    const m = this.modules;
    let result = 0;

    // N1: sequências de 5+ módulos iguais em linha ou coluna
    for (let a = 0; a < size; a++) {
      let runRow = 1;
      let runCol = 1;
      for (let b = 1; b < size; b++) {
        if (m[a][b] === m[a][b - 1]) runRow++;
        else {
          if (runRow >= 5) result += runRow - 2;
          runRow = 1;
        }
        if (m[b][a] === m[b - 1][a]) runCol++;
        else {
          if (runCol >= 5) result += runCol - 2;
          runCol = 1;
        }
      }
      if (runRow >= 5) result += runRow - 2;
      if (runCol >= 5) result += runCol - 2;
    }

    // N2: blocos 2x2 da mesma cor
    for (let y = 0; y < size - 1; y++) {
      for (let x = 0; x < size - 1; x++) {
        const c = m[y][x];
        if (c === m[y][x + 1] && c === m[y + 1][x] && c === m[y + 1][x + 1]) result += 3;
      }
    }

    // N3: padrões parecidos com os localizadores (1:1:3:1:1 com 4 claros)
    const p1 = [true, false, true, true, true, false, true, false, false, false, false];
    const p2 = [false, false, false, false, true, false, true, true, true, false, true];
    const matches = (get: (k: number) => boolean, pattern: boolean[]) => pattern.every((v, k) => get(k) === v);
    for (let a = 0; a < size; a++) {
      for (let b = 0; b <= size - 11; b++) {
        if (matches((k) => m[a][b + k], p1) || matches((k) => m[a][b + k], p2)) result += 40;
        if (matches((k) => m[b + k][a], p1) || matches((k) => m[b + k][a], p2)) result += 40;
      }
    }

    // N4: equilíbrio entre módulos escuros e claros
    let dark = 0;
    for (const row of m) for (const v of row) if (v) dark++;
    const total = size * size;
    const k = Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1;
    result += Math.max(0, k) * 10;

    return result;
  }
}

function utf8Bytes(text: string): number[] {
  return Array.from(new TextEncoder().encode(text));
}

/** Gera o QR Code de um texto (modo byte). Escolhe a menor versão possível. */
export function encodeQr(text: string, ecc: QrEcc = 'M'): QrCode {
  const bytes = utf8Bytes(text);

  let version = 1;
  for (; version <= 40; version++) {
    const countBits = version <= 9 ? 8 : 16;
    const needed = 4 + countBits + bytes.length * 8;
    if (needed <= numDataCodewords(version, ecc) * 8) break;
  }
  if (version > 40) throw new Error('Texto longo demais para um QR Code.');

  // fluxo de bits: modo byte (0100), contagem, dados
  const bits: number[] = [];
  const push = (value: number, length: number) => {
    for (let i = length - 1; i >= 0; i--) bits.push((value >>> i) & 1);
  };
  push(0b0100, 4);
  push(bytes.length, version <= 9 ? 8 : 16);
  for (const b of bytes) push(b, 8);

  const capacityBits = numDataCodewords(version, ecc) * 8;
  push(0, Math.min(4, capacityBits - bits.length));
  push(0, (8 - (bits.length % 8)) % 8);
  for (let pad = 0xec; bits.length < capacityBits; pad ^= 0xec ^ 0x11) push(pad, 8);

  const data: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j++) byte = (byte << 1) | bits[i + j];
    data.push(byte);
  }

  // blocos com correção de erros, intercalados
  const e = ECC_ORDINAL[ecc];
  const numBlocks = NUM_ERROR_CORRECTION_BLOCKS[e][version];
  const blockEccLen = ECC_CODEWORDS_PER_BLOCK[e][version];
  const rawCodewords = Math.floor(numRawDataModules(version) / 8);
  const numShortBlocks = numBlocks - (rawCodewords % numBlocks);
  const shortBlockLen = Math.floor(rawCodewords / numBlocks);
  const divisor = rsDivisor(blockEccLen);

  const blocks: number[][] = [];
  for (let i = 0, k = 0; i < numBlocks; i++) {
    const dat = data.slice(k, k + shortBlockLen - blockEccLen + (i < numShortBlocks ? 0 : 1));
    k += dat.length;
    const ecBytes = rsRemainder(dat, divisor);
    if (i < numShortBlocks) dat.push(0);
    blocks.push(dat.concat(ecBytes));
  }

  const codewords: number[] = [];
  for (let i = 0; i < blocks[0].length; i++) {
    blocks.forEach((block, j) => {
      if (i !== shortBlockLen - blockEccLen || j >= numShortBlocks) codewords.push(block[i]);
    });
  }

  const builder = new Builder(version, ecc);
  builder.drawFunctionPatterns();
  builder.drawCodewords(codewords);

  let bestMask = 0;
  let bestPenalty = Infinity;
  for (let mask = 0; mask < 8; mask++) {
    builder.applyMask(mask);
    builder.drawFormatBits(mask);
    const p = builder.penalty();
    if (p < bestPenalty) {
      bestPenalty = p;
      bestMask = mask;
    }
    builder.applyMask(mask); // desfaz
  }
  builder.applyMask(bestMask);
  builder.drawFormatBits(bestMask);

  return { version, size: builder.size, modules: builder.modules };
}

// ---------------------------------------------------------------------
// Saídas
// ---------------------------------------------------------------------

/** Margem obrigatória (zona de silêncio) em módulos. */
export const QR_MARGIN = 4;

/** Caminho SVG com os módulos escuros, em coordenadas de módulos (com margem). */
export function qrPath(qr: QrCode, hole?: { from: number; to: number }): string {
  const parts: string[] = [];
  for (let y = 0; y < qr.size; y++) {
    let x = 0;
    while (x < qr.size) {
      if (!qr.modules[y][x] || inHole(x, y, hole)) {
        x++;
        continue;
      }
      let end = x;
      while (end < qr.size && qr.modules[y][end] && !inHole(end, y, hole)) end++;
      parts.push(`M${x + QR_MARGIN} ${y + QR_MARGIN}h${end - x}v1h${x - end}z`);
      x = end;
    }
  }
  return parts.join('');
}

function inHole(x: number, y: number, hole?: { from: number; to: number }): boolean {
  return Boolean(hole && x >= hole.from && x < hole.to && y >= hole.from && y < hole.to);
}

/** Área central reservada para o logotipo (em módulos), ~22% da largura. */
export function logoHole(qr: QrCode): { from: number; to: number } {
  let span = Math.round(qr.size * 0.22);
  if ((qr.size - span) % 2 !== 0) span++;
  const from = (qr.size - span) / 2;
  return { from, to: from + span };
}

interface SvgOptions {
  color: string;
  background?: string;
  logoHref?: string | null;
}

export function qrToSvg(qr: QrCode, { color, background = '#ffffff', logoHref }: SvgOptions): string {
  const total = qr.size + QR_MARGIN * 2;
  const hole = logoHref ? logoHole(qr) : undefined;
  let logo = '';
  if (hole && logoHref) {
    const pad = 0.6;
    const at = hole.from + QR_MARGIN;
    const span = hole.to - hole.from;
    logo =
      `<rect x="${at}" y="${at}" width="${span}" height="${span}" rx="${span * 0.18}" fill="${background}"/>` +
      `<image href="${escapeXml(logoHref)}" x="${at + pad}" y="${at + pad}" width="${span - pad * 2}" height="${span - pad * 2}" preserveAspectRatio="xMidYMid meet"/>`;
  }
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" shape-rendering="crispEdges">` +
    `<rect width="${total}" height="${total}" fill="${background}"/>` +
    `<path d="${qrPath(qr, hole)}" fill="${color}"/>` +
    logo +
    `</svg>`
  );
}

function escapeXml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

/** Desenha o QR (com margem) em um canvas, no quadrado x,y,size. */
export function drawQr(
  ctx: CanvasRenderingContext2D,
  qr: QrCode,
  x: number,
  y: number,
  size: number,
  color: string,
  logo?: HTMLImageElement | null,
  background = '#ffffff',
) {
  const total = qr.size + QR_MARGIN * 2;
  const cell = size / total;
  const hole = logo ? logoHole(qr) : undefined;
  ctx.fillStyle = background;
  ctx.fillRect(x, y, size, size);
  ctx.fillStyle = color;
  for (let row = 0; row < qr.size; row++) {
    for (let col = 0; col < qr.size; col++) {
      if (!qr.modules[row][col] || inHole(col, row, hole)) continue;
      // arredonda as bordas para não deixar frestas entre módulos
      const left = Math.floor(x + (col + QR_MARGIN) * cell);
      const top = Math.floor(y + (row + QR_MARGIN) * cell);
      const right = Math.ceil(x + (col + QR_MARGIN + 1) * cell);
      const bottom = Math.ceil(y + (row + QR_MARGIN + 1) * cell);
      ctx.fillRect(left, top, right - left, bottom - top);
    }
  }
  if (hole && logo) {
    const at = (hole.from + QR_MARGIN) * cell;
    const span = (hole.to - hole.from) * cell;
    ctx.fillStyle = background;
    roundRect(ctx, x + at, y + at, span, span, span * 0.18);
    ctx.fill();
    const pad = cell * 0.6;
    const box = span - pad * 2;
    const ratio = Math.min(box / logo.naturalWidth, box / logo.naturalHeight);
    const w = logo.naturalWidth * ratio;
    const h = logo.naturalHeight * ratio;
    ctx.drawImage(logo, x + at + pad + (box - w) / 2, y + at + pad + (box - h) / 2, w, h);
  }
}

export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}
