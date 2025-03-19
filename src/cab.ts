import * as fs from 'fs';
import { Buffer } from 'buffer';
import path from "path";
import { Logger } from './logger.js';

class EndianBinaryReader {
  private buffer: Buffer;
  private offset: number;
  private littleEndian: boolean;

  constructor(buffer: Buffer, littleEndian = false) { // Assume big-endian by default
    this.buffer = buffer;
    this.offset = 0;
    this.littleEndian = littleEndian;
  }

  switchToLittle(): void {
    this.littleEndian = true;
  }

  readInt16(): number {
    const value = this.littleEndian
      ? this.buffer.readInt16LE(this.offset)
      : this.buffer.readInt16BE(this.offset);
    this.offset += 2;
    return value;
  }

  readInt32(): number {
    const value = this.littleEndian
      ? this.buffer.readInt32LE(this.offset)
      : this.buffer.readInt32BE(this.offset);
    this.offset += 4;
    return value;
  }

  readUInt32(): number {
    const value = this.littleEndian
      ? this.buffer.readUInt32LE(this.offset)
      : this.buffer.readUInt32BE(this.offset);
    this.offset += 4;
    return value;
  }

  readInt64(): bigint {
    const value = this.littleEndian
      ? this.buffer.readBigInt64LE(this.offset)
      : this.buffer.readBigInt64BE(this.offset);
    this.offset += 8;
    return value;
  }

  readUInt64(): bigint {
    const value = this.littleEndian
      ? this.buffer.readBigUInt64LE(this.offset)
      : this.buffer.readBigUInt64BE(this.offset);
    this.offset += 8;
    return value;
  }

  readBoolean(): boolean {
    const value = this.buffer.readUInt8(this.offset) !== 0;
    this.offset += 1;
    return value;
  }

  readStringToNull(): string {
    const start = this.offset;
    let end = start;
    while (this.buffer[end] !== 0) end++;
    this.offset = end + 1;
    return this.buffer.toString('utf8', start, end);
  }

  readBytes(length: number): Buffer {
    const value = this.buffer.slice(this.offset, this.offset + length);
    this.offset += length;
    return value;
  }

  alignStream(): void {
    this.offset = (this.offset + 3) & ~3;
  }

  getPosition(): number {
    return this.offset;
  }

  setPosition(position: number): number {
    this.offset = position;
    return this.offset;
  }
}

class SerializedFileHeader {
  version: number;
  swapEndianess: boolean;
  metadataSize: number;
  fileSize: bigint;
  dataOffset: bigint;
  unknown22: bigint;

  unityVersion: string;

  constructor(reader: EndianBinaryReader) {
    reader.readUInt32(); // Skip placeholder 1
    reader.readUInt32(); // Skip placeholder 2

    this.version = reader.readInt32(); // File format version

    reader.readUInt32(); // Skip placeholder 3

    this.swapEndianess = reader.readBoolean(); // Read endianess swap flag
    reader.alignStream(); // Align the stream

    this.metadataSize = reader.readUInt32(); // Metadata size
    this.fileSize = reader.readInt64(); // File size
    this.dataOffset = reader.readInt64(); // Data offset
    this.unknown22 = reader.readInt64(); // Unknown field

    this.unityVersion = reader.readStringToNull(); // Unity Version

    this.logHeader();
    Logger.log("Header end position: " + reader.getPosition());
  }

  private logHeader() {
    Logger.log('Parsed SerializedFileHeader:');
    Logger.log(`  Version: ${this.version}`);
    Logger.log(`  Swap Endianess: ${this.swapEndianess}`);
    Logger.log(`  Metadata Size: ${this.metadataSize}`);
    Logger.log(`  File Size: ${this.fileSize}`);
    Logger.log(`  Data Offset: ${this.dataOffset}`);
    Logger.log(`  Unknown22: ${this.unknown22}`);

    Logger.log(`  Unity Version: ${this.unityVersion}`);
  }
}

class SerializedFile {
  reader: EndianBinaryReader;
  header: SerializedFileHeader;

  targetPlatform: number;
  typeTreeEnabled: boolean;
  typeCount: number;

  fileType: number;
  fileName: string;
  fileSize: number;

  constructor(reader: EndianBinaryReader) {
    this.reader = reader;
    this.header = new SerializedFileHeader(reader);

    this.reader.switchToLittle(); // From BIG to small

    this.targetPlatform = this.reader.readInt32();
    this.typeTreeEnabled = this.reader.readBoolean();
    this.typeCount = this.reader.readInt32();

    Logger.log(`Target Platform: ${this.targetPlatform}`);
    Logger.log(`Type Tree Enabled: ${this.typeTreeEnabled}`);
    Logger.log(`Type Count: ${this.typeCount}`);
    Logger.log();

    // First type reading
    //reader.readInt32(); // Type
    //reader.readBoolean(); // Is stripped?
    //reader.readInt16(); // script type

    // Skip the metadata block
    reader.setPosition(Number(this.header.dataOffset));

    this.fileType = reader.readInt32();
    this.fileName = reader.readStringToNull();
    reader.alignStream();
    this.fileSize = reader.readUInt32();

    // CARD_Name || Card_Indx || Card_Part AssetBundle, we skip ahead 180 bytes and re-read
    if(this.fileName === "7c/7cc714c8" || this.fileName === "58/5888bcdc" || this.fileName === "5a/5a8c44f4" ||
      // Test files Card_Indx and Card_Part
      this.fileName === "e9/e9aa18bf" || this.fileName === "eb/ebaee097"
      ) {
      reader.readBytes(180);
      this.fileType = reader.readInt32();
      this.fileName = reader.readStringToNull();
      reader.alignStream();
      this.fileSize = reader.readUInt32();
    }

    Logger.log(`File type: ${this.fileType}`);
    Logger.log(`File name: ${this.fileName}`);
    Logger.log(`File size: ${this.fileSize}`);
  }

  extractAssets(outputDir: string): string {
    // Extract and save assets here based on file content.
    Logger.log("Extracting assets to:", outputDir);

    const bytesToWrite = this.reader.readBytes(this.fileSize);

    fs.writeFileSync(path.join(outputDir, this.fileName + ".bin"), bytesToWrite);
    Logger.log("Position: " + this.reader.getPosition());
    return this.fileName;
  }
}

export class CABExtractor {
  static extract(filePath: string, outputDir: string): Promise<string> {
    return new Promise((resolve, reject) => {
      fs.readFile(filePath, (err, data) => {
        if (err) {
          return reject(err);
        }
        try {
          // Main reader for the CAB file
          const reader = new EndianBinaryReader(data);
          // A serialized file stored within the CAB file
          const serializedFile = new SerializedFile(reader);
          const extractedFile = serializedFile.extractAssets(outputDir);
          resolve(extractedFile);
        } catch (err) {
          reject(err);
        }
      });
    });
  }
}
