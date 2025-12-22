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
   */
  parseHeader(): SerializedFileHeader {
    Logger.log('📖 Parsing SerializedFile header...');
    
    // Read metadata size (UInt32, big-endian initially)
    const metadataSize = this.buffer.readUInt32BE(this.offset);
    this.offset += 4;
    Logger.log(`  Metadata size: ${metadataSize} bytes`);

    // Read file size (UInt32 or Int64 depending on version)
    // We need to peek at the version to determine this
    // For now, read as UInt32 and adjust if needed
    const fileSizeU32 = this.buffer.readUInt32BE(this.offset);
    this.offset += 4;
    
    // Read version (UInt32, big-endian)
    const version = this.buffer.readUInt32BE(this.offset);
    this.offset += 4;
    Logger.log(`  Version: ${version}`);

    // Read data offset (UInt32 or Int64 depending on version)
    const dataOffsetU32 = this.buffer.readUInt32BE(this.offset);
    this.offset += 4;

    // For version >= 22, file size and data offset are 64-bit
    let fileSize: bigint;
    let dataOffset: bigint;

    if (version >= 22) {
      // Rewind and read as 64-bit values
      this.offset = 4; // After metadata size
      
      // File size is Int64
      fileSize = this.buffer.readBigInt64BE(this.offset);
      this.offset += 8;
      
      // Skip version again
      this.offset += 4;
      
      // Data offset is Int64
      dataOffset = this.buffer.readBigInt64BE(this.offset);
      this.offset += 8;
      
      Logger.log(`  File size (64-bit): ${fileSize} bytes`);
      Logger.log(`  Data offset (64-bit): ${dataOffset}`);
    } else {
      // For older versions, use 32-bit values
      fileSize = BigInt(fileSizeU32);
      dataOffset = BigInt(dataOffsetU32);
      
      Logger.log(`  File size (32-bit): ${fileSize} bytes`);
      Logger.log(`  Data offset (32-bit): ${dataOffset}`);
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
    Logger.log(`⚠️  Invalid version: ${header.version}`);
    return false;
  }

  if (header.metadataSize < 0 || header.metadataSize > 100000) {
    Logger.log(`⚠️  Invalid metadata size: ${header.metadataSize}`);
    return false;
  }

  if (header.fileSize < BigInt(0) || header.fileSize > BigInt(100000000)) {
    Logger.log(`⚠️  Invalid file size: ${header.fileSize}`);
    return false;
  }

  if (header.endianness !== 0 && header.endianness !== 1) {
    Logger.log(`⚠️  Invalid endianness: ${header.endianness}`);
    return false;
  }

  return true;
}

/**
 * Parse SerializedFile from CAB data
 * This is the main entry point for Phase 1
 */
export function parseSerializedFile(cabData: Buffer): { header: SerializedFileHeader; reader: SerializedFileReader } | null {
  try {
    const reader = new SerializedFileReader(cabData);
    const header = reader.parseHeader();
    
    if (!validateHeader(header)) {
      Logger.log('❌ SerializedFile header validation failed');
      return null;
    }
    
    return { header, reader };
  } catch (error) {
    Logger.log(`❌ Failed to parse SerializedFile: ${error}`);
    return null;
  }
}
