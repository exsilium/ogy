import { Logger } from './logger.js';

/**
 * SerializedFile Header Structure
 * Based on Unity's SerializedFile format
 * Reference: UnityPy SerializedFile implementation
 */

export interface SerializedFileHeader {
  metadataSize: number;
  fileSize: bigint;
  version: number;
  dataOffset: bigint;
  endianness: number; // 0 = big-endian, 1 = little-endian
  reserved: Buffer; // Reserved bytes (3 bytes)
}

export class SerializedFileReader {
  private buffer: Buffer;
  private offset: number;
  private littleEndian: boolean;

  constructor(buffer: Buffer) {
    this.buffer = buffer;
    this.offset = 0;
    this.littleEndian = false;
  }

  /**
   * Parse the SerializedFile header
   * Unity versions >= 22 have different header structures
   * 
   * Header structure (all versions start with):
   * - Metadata size (4 bytes, UInt32)
   * 
   * Then for version < 22:
   * - File size (4 bytes, UInt32)
   * - Version (4 bytes, UInt32) 
   * - Data offset (4 bytes, UInt32)
   * 
   * For version >= 22:
   * - File size (8 bytes, Int64)
   * - Version (4 bytes, UInt32)
   * - Data offset (8 bytes, Int64)
   * 
   * We determine version by trying both formats and seeing which one
   * gives a reasonable version number (1-100)
   */
  parseHeader(): SerializedFileHeader {
    Logger.log('📖 Parsing SerializedFile header...');
    
    // Read metadata size (UInt32, big-endian initially)
    const metadataSize = this.buffer.readUInt32BE(this.offset);
    this.offset += 4;
    Logger.log(`  Metadata size: ${metadataSize} bytes`);

    // Try reading as 32-bit format first (version < 22)
    const fileSizeU32 = this.buffer.readUInt32BE(this.offset);
    const versionU32 = this.buffer.readUInt32BE(this.offset + 4);
    
    let fileSize: bigint;
    let version: number;
    let dataOffset: bigint;

    // Check if version looks reasonable (1-100)
    // If it does AND it's < 22, this is a 32-bit header
    if (versionU32 >= 1 && versionU32 < 22) {
      // Version < 22: Use 32-bit format
      fileSize = BigInt(fileSizeU32);
      this.offset += 4;
      
      version = versionU32;
      this.offset += 4;
      Logger.log(`  Version: ${version} (32-bit format)`);
      
      const dataOffsetU32 = this.buffer.readUInt32BE(this.offset);
      this.offset += 4;
      dataOffset = BigInt(dataOffsetU32);
      
      Logger.log(`  File size (32-bit): ${fileSize} bytes`);
      Logger.log(`  Data offset (32-bit): ${dataOffset}`);
    } else {
      // Version >= 22: Use 64-bit format
      // File size is Int64 (8 bytes)
      fileSize = this.buffer.readBigInt64BE(this.offset);
      this.offset += 8;
      
      // Version is UInt32 (4 bytes)
      version = this.buffer.readUInt32BE(this.offset);
      this.offset += 4;
      Logger.log(`  Version: ${version} (64-bit format)`);
      
      // Data offset is Int64 (8 bytes)
      dataOffset = this.buffer.readBigInt64BE(this.offset);
      this.offset += 8;
      
      Logger.log(`  File size (64-bit): ${fileSize} bytes`);
      Logger.log(`  Data offset (64-bit): ${dataOffset}`);
    }

    // Read endianness (UInt8)
    const endianness = this.buffer.readUInt8(this.offset);
    this.offset += 1;
    
    this.littleEndian = endianness === 1;
    Logger.log(`  Endianness: ${this.littleEndian ? 'little-endian' : 'big-endian'} (${endianness})`);

    // Read reserved bytes (3 bytes)
    const reserved = this.buffer.slice(this.offset, this.offset + 3);
    this.offset += 3;
    Logger.log(`  Reserved: ${reserved.toString('hex')}`);

    const header: SerializedFileHeader = {
      metadataSize,
      fileSize,
      version,
      dataOffset,
      endianness,
      reserved
    };

    Logger.log(`✅ SerializedFile header parsed successfully`);
    Logger.log(`  Current offset: 0x${this.offset.toString(16)} (${this.offset})`);

    return header;
  }

  /**
   * Get the current read offset
   */
  getOffset(): number {
    return this.offset;
  }

  /**
   * Set the read offset
   */
  setOffset(offset: number): void {
    this.offset = offset;
  }

  /**
   * Check if using little-endian byte order
   */
  isLittleEndian(): boolean {
    return this.littleEndian;
  }

  /**
   * Get the underlying buffer
   */
  getBuffer(): Buffer {
    return this.buffer;
  }

  /**
   * Read a 32-bit unsigned integer with current endianness
   */
  readUInt32(): number {
    const value = this.littleEndian
      ? this.buffer.readUInt32LE(this.offset)
      : this.buffer.readUInt32BE(this.offset);
    this.offset += 4;
    return value;
  }

  /**
   * Read a 32-bit signed integer with current endianness
   */
  readInt32(): number {
    const value = this.littleEndian
      ? this.buffer.readInt32LE(this.offset)
      : this.buffer.readInt32BE(this.offset);
    this.offset += 4;
    return value;
  }

  /**
   * Read a 64-bit unsigned integer with current endianness
   */
  readUInt64(): bigint {
    const value = this.littleEndian
      ? this.buffer.readBigUInt64LE(this.offset)
      : this.buffer.readBigUInt64BE(this.offset);
    this.offset += 8;
    return value;
  }

  /**
   * Read a 64-bit signed integer with current endianness
   */
  readInt64(): bigint {
    const value = this.littleEndian
      ? this.buffer.readBigInt64LE(this.offset)
      : this.buffer.readBigInt64BE(this.offset);
    this.offset += 8;
    return value;
  }

  /**
   * Read a byte
   */
  readUInt8(): number {
    const value = this.buffer.readUInt8(this.offset);
    this.offset += 1;
    return value;
  }

  /**
   * Read a null-terminated string
   */
  readStringToNull(): string {
    const start = this.offset;
    let end = start;
    while (this.buffer[end] !== 0 && end < this.buffer.length) {
      end++;
    }
    this.offset = end + 1; // Skip the null terminator
    return this.buffer.toString('utf8', start, end);
  }

  /**
   * Read bytes
   */
  readBytes(length: number): Buffer {
    const value = this.buffer.slice(this.offset, this.offset + length);
    this.offset += length;
    return value;
  }

  /**
   * Align to 4-byte boundary
   */
  align(): void {
    this.offset = (this.offset + 3) & ~3;
  }
}

/**
 * Validate SerializedFile header
 */
export function validateHeader(header: SerializedFileHeader): boolean {
  // Basic sanity checks
  if (header.version < 1 || header.version > 100) {
    Logger.error(`⚠️  Invalid version: ${header.version} (must be 1-100)`);
    return false;
  }

  if (header.metadataSize < 0 || header.metadataSize > 100000) {
    Logger.error(`⚠️  Invalid metadata size: ${header.metadataSize} (must be 0-100000)`);
    return false;
  }

  if (header.fileSize < BigInt(0) || header.fileSize > BigInt(100000000)) {
    Logger.error(`⚠️  Invalid file size: ${header.fileSize} (must be 0-100000000)`);
    return false;
  }

  if (header.endianness !== 0 && header.endianness !== 1) {
    Logger.error(`⚠️  Invalid endianness: ${header.endianness} (must be 0 or 1)`);
    return false;
  }

  Logger.log(`✅ Header validation passed`);
  return true;
}

/**
 * Parse SerializedFile from CAB data
 * This is the main entry point for Phase 1
 */
export function parseSerializedFile(cabData: Buffer): { header: SerializedFileHeader; reader: SerializedFileReader } | null {
  try {
    Logger.log(`🔍 Parsing SerializedFile from CAB data (${cabData.length} bytes)`);
    
    if (!cabData || cabData.length === 0) {
      Logger.error('❌ CAB data is empty or null');
      return null;
    }
    
    if (cabData.length < 28) {
      Logger.error(`❌ CAB data too small (${cabData.length} bytes, minimum 28 bytes required for header)`);
      return null;
    }
    
    const reader = new SerializedFileReader(cabData);
    const header = reader.parseHeader();
    
    if (!validateHeader(header)) {
      Logger.error('❌ SerializedFile header validation failed');
      Logger.error(`  Version: ${header.version}`);
      Logger.error(`  Metadata size: ${header.metadataSize}`);
      Logger.error(`  File size: ${header.fileSize}`);
      Logger.error(`  Data offset: ${header.dataOffset}`);
      Logger.error(`  Endianness: ${header.endianness}`);
      return null;
    }
    
    return { header, reader };
  } catch (error) {
    Logger.error(`❌ Failed to parse SerializedFile: ${error}`);
    if (error instanceof Error) {
      Logger.error(`  Stack: ${error.stack}`);
    }
    return null;
  }
}
