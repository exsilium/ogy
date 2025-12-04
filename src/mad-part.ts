import { diff_match_patch as DiffMatchPatch, DIFF_DELETE, DIFF_EQUAL, DIFF_INSERT } from 'diff-match-patch';
import * as fs from 'fs';

export type PartEntry = {
  start: number;
  end: number;
};

export type PidxEntry = {
  firstEffectIndex: number;
  effectCount: number;
  pendulumEffectCount: number;
};

function parseDescPointers(cardIndx: Buffer): number[] {
  const pointers: number[] = [];

  for (let offset = 4; offset < cardIndx.length; offset += 8) {
    pointers.push(cardIndx.readUInt32LE(offset));
  }

  return pointers;
}

function sliceByPointers(data: Buffer, pointers: number[]): Buffer[] {
  const slices: Buffer[] = [];
  const normalizedPointers = pointers.slice();

  if (normalizedPointers.length === 0 || normalizedPointers[0] !== 0) {
    normalizedPointers.unshift(0);
  }

  if (normalizedPointers[normalizedPointers.length - 1] !== data.length) {
    normalizedPointers.push(data.length);
  }

  for (let i = 0; i < normalizedPointers.length - 1; i++) {
    const start = normalizedPointers[i];
    const end = normalizedPointers[i + 1];

    if (start >= end || start >= data.length) {
      slices.push(Buffer.alloc(0));
      continue;
    }

    const safeEnd = Math.min(end, data.length);
    slices.push(data.subarray(start, safeEnd));
  }

  return slices;
}

function parsePartEntries(buffer: Buffer): PartEntry[] {
  const entries: PartEntry[] = [];

  for (let offset = 0; offset + 3 < buffer.length; offset += 4) {
    entries.push({
      start: buffer.readUInt16LE(offset),
      end: buffer.readUInt16LE(offset + 2),
    });
  }

  return entries;
}

function parsePidxEntries(buffer: Buffer): PidxEntry[] {
  const entries: PidxEntry[] = [];
  if (buffer.length < 4) {
    return entries;
  }

  const view = buffer.subarray(4); // skip header

  for (let offset = 0; offset + 3 < view.length; offset += 4) {
    const firstEffectIndex = view.readUInt16LE(offset);
    const effectFlags = view.readUInt8(offset + 2);
    const counts = view.readUInt8(offset + 3);

    const effectCount = Math.floor(counts / 16);
    const pendulumEffectCount = counts % 16;

    entries.push({
      firstEffectIndex,
      effectCount,
      pendulumEffectCount,
    });
  }

  return entries;
}

function buildOffsetMap(original: Buffer, updated: Buffer): number[] {
  if (original.length === 0) {
    return [0];
  }

  const dmp = new DiffMatchPatch();
  const originalStr = original.toString('latin1');
  const updatedStr = updated.toString('latin1');

  const diffs = dmp.diff_main(originalStr, updatedStr);

  const map: number[] = new Array(originalStr.length + 1);
  let oldPos = 0;
  let newPos = 0;

  for (const [op, text] of diffs) {
    const len = text.length;

    if (op === DIFF_EQUAL) {
      for (let i = 0; i < len; i++) {
        map[oldPos + i] = newPos + i;
      }
      oldPos += len;
      newPos += len;
    } else if (op === DIFF_DELETE) {
      for (let i = 0; i < len; i++) {
        map[oldPos + i] = newPos;
      }
      oldPos += len;
    } else if (op === DIFF_INSERT) {
      newPos += len;
    }
  }

  map[originalStr.length] = newPos;

  let lastValue = 0;
  for (let i = 0; i < map.length; i++) {
    if (typeof map[i] !== 'number') {
      map[i] = lastValue;
    }
    lastValue = map[i];
  }

  return map;
}

function clampOffset(value: number, upperBound: number): number {
  if (value < 0) return 0;
  if (value > upperBound) return upperBound;
  return value;
}

function mapIndex(map: number[], index: number, newLength: number): number {
  if (index < 0) {
    return 0;
  }

  if (index >= map.length) {
    return newLength;
  }

  const mapped = map[index];
  if (typeof mapped !== 'number') {
    return newLength;
  }

  return clampOffset(mapped, newLength);
}

function toBuffer(entries: PartEntry[]): Buffer {
  const buffer = Buffer.alloc(entries.length * 4);
  let offset = 0;

  for (const entry of entries) {
    buffer.writeUInt16LE(entry.start, offset);
    buffer.writeUInt16LE(entry.end, offset + 2);
    offset += 4;
  }

  return buffer;
}

export function rebuildCardPartAsset(
  originalCardIndx: Buffer,
  originalDesc: Buffer,
  newCardIndx: Buffer,
  newDesc: Buffer,
  originalCardPart: Buffer,
  cardPidx: Buffer
): Buffer {
  const originalPointers = parseDescPointers(originalCardIndx);
  const newPointers = parseDescPointers(newCardIndx);

  const originalSlices = sliceByPointers(originalDesc, originalPointers);
  const newSlices = sliceByPointers(newDesc, newPointers);

  const partEntries = parsePartEntries(originalCardPart);
  const pidxEntries = parsePidxEntries(cardPidx);

  const updatedPartEntries: PartEntry[] = partEntries.map(entry => ({ ...entry }));

  const totalEntries = partEntries.length;

  for (let cardIndex = 0; cardIndex < pidxEntries.length; cardIndex++) {
    const pidx = pidxEntries[cardIndex];
    const totalEffects = pidx.effectCount + pidx.pendulumEffectCount;

    if (totalEffects === 0) {
      continue;
    }

    const originalSlice = originalSlices[cardIndex] ?? Buffer.alloc(0);
    const newSlice = newSlices[cardIndex] ?? Buffer.alloc(0);

    const map = buildOffsetMap(originalSlice, newSlice);
    const newLength = newSlice.length;

    for (let localEffectIndex = 0; localEffectIndex < totalEffects; localEffectIndex++) {
      const globalEffectIndex = pidx.firstEffectIndex + localEffectIndex;

      if (globalEffectIndex < 0 || globalEffectIndex >= totalEntries) {
        continue;
      }

      const entry = partEntries[globalEffectIndex];

      if (entry.start === 0 && entry.end === 0) {
        updatedPartEntries[globalEffectIndex] = { start: 0, end: 0 };
        continue;
      }

      const mappedStart = mapIndex(map, entry.start, newLength);
      const mappedEnd = mapIndex(map, entry.end, newLength);

      if (mappedStart > mappedEnd) {
        throw new Error(`Mapped offsets invalid for card ${cardIndex} at effect index ${globalEffectIndex}`);
      }

      if (mappedEnd > 0xffff) {
        throw new Error(`Mapped offset exceeds 16-bit boundary for card ${cardIndex}`);
      }

      updatedPartEntries[globalEffectIndex] = {
        start: mappedStart,
        end: mappedEnd,
      };
    }
  }

  return toBuffer(updatedPartEntries);
}

export function ensureCardPidxAvailable(targetDir: string, destinationName: string, projectRelativeSource: string): string {
  const destinationPath = `${targetDir}/${destinationName}`;

  if (!fs.existsSync(destinationPath)) {
    if (!fs.existsSync(projectRelativeSource)) {
      throw new Error(`Card_Pidx source not found at ${projectRelativeSource}`);
    }

    fs.copyFileSync(projectRelativeSource, destinationPath);
  }

  return destinationPath;
}
