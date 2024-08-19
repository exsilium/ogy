import fs from 'fs';
import path from 'path';
import * as lz4 from 'lz4';
import { Logger } from './logger.js';

class BinaryReader {
  private buffer: Buffer;
  private position: number = 0;

  constructor(buffer: Buffer) {
    this.buffer = buffer;
  }

  readAsciiNullTerminatedString(maxLength: number): string {
    let str = '';
    for (let i = 0; i < maxLength; i++) {
      const char = this.buffer[this.position++];
      if (char === 0) break;
      str += String.fromCharCode(char);
    }
    return str;
  }

  readBigEndianUInt32(): number {
    const value = this.buffer.readUInt32BE(this.position);
    this.position += 4;
    return value;
  }

  readBigEndianUInt64(): bigint {
    const value = this.buffer.readBigUInt64BE(this.position);
    this.position += 8;
    return value;
  }

  readBigEndianUInt16(): number {
    const value = this.buffer.readUInt16BE(this.position);
    this.position += 2;
    return value;
  }

  readBytes(size: number): Buffer {
    const bytes = this.buffer.slice(this.position, this.position + size);
    this.position += size;
    return bytes;
  }

  alignToBoundary(boundary: number): void {
    const misalignment = this.position % boundary;
    if (misalignment !== 0) {
      this.position += (boundary - misalignment);
    }
  }

  getPosition(): number {
    return this.position;
  }
}

interface HeaderInfo {
  compressedSize: number;
  decompSize: number;
}

interface BlockInfo {
  uncompressedSize: number;
  compressedSize: number;
  flags: number;
}

interface DirectoryInfo {
  offset: bigint;
  size: bigint;
  flags: number;
  path: string;
}

class AssetBundle {
  private filePath: string;
  private blocks: BlockInfo[] = [];
  private directories: DirectoryInfo[] = [];

  constructor(filePath: string) {
    this.filePath = filePath;
  }

  private readHeader(reader: BinaryReader): HeaderInfo {
    const sigString = reader.readAsciiNullTerminatedString(13);
    if (sigString !== 'UnityFS') {
      throw new Error('Not a valid UnityFS file.');
    }

    const fileVer = reader.readBigEndianUInt32();
    const playerVer = reader.readAsciiNullTerminatedString(20);
    const feVersion = reader.readAsciiNullTerminatedString(20);
    const totalFileSize = reader.readBigEndianUInt64();
    const compressedSize = reader.readBigEndianUInt32();
    const decompSize = reader.readBigEndianUInt32();
    const flags = reader.readBigEndianUInt32();

    Logger.log('UnityFS Header Information:');
    Logger.log(`Signature: ${sigString}`);
    Logger.log(`File Version: ${fileVer}`);
    Logger.log(`Player Version: ${playerVer}`);
    Logger.log(`Engine Version: ${feVersion}`);
    Logger.log(`Total File Size: ${totalFileSize}`);
    Logger.log(`Compressed Size: ${compressedSize}`);
    Logger.log(`Decompressed Size: ${decompSize}`);
    Logger.log(`Flags: ${flags}`);

    this.analyzeFlags(flags);

    // Align the position to 16 bytes
    reader.alignToBoundary(16);
    Logger.log(`Position aligned to 16-byte boundary: ${reader.getPosition()}`);

    return { compressedSize, decompSize };
  }

  private analyzeFlags(flags: number): void {
    const compressionMode = flags & 0x3F;
    const hasDirectoryInfo = (flags & 0x40) !== 0;
    const isBlockAndDirectoryListAtEnd = (flags & 0x80) !== 0;
    const hasOldWebPluginCompatibility = (flags & 0x100) !== 0;
    const blockInfoNeedPaddingAtStart = (flags & 0x200) !== 0;
    const usesAssetBundleEncryption = (flags & 0x400) !== 0;

    let compressionModeStr = '';
    switch (compressionMode) {
      case 0:
        compressionModeStr = 'No compression';
        break;
      case 1:
        compressionModeStr = 'LZMA';
        break;
      case 2:
      case 3:
        compressionModeStr = 'LZ4/LZ4HC';
        break;
      default:
        compressionModeStr = 'Unknown compression mode';
    }

    Logger.log('\nFlags Analysis:');
    Logger.log(`  Compression Mode: ${compressionModeStr} (${compressionMode})`);
    Logger.log(`  Has Directory Info: ${hasDirectoryInfo}`);
    Logger.log(`  Block and Directory List at End: ${isBlockAndDirectoryListAtEnd}`);
    Logger.log(`  Has Old Web Plugin Compatibility: ${hasOldWebPluginCompatibility}`);
    Logger.log(`  Block Info needs Padding at Start: ${blockInfoNeedPaddingAtStart}`);
    Logger.log(`  Uses Asset Bundle Encryption: ${usesAssetBundleEncryption}`);
  }

  private decompressData(reader: BinaryReader, compressedSize: number, decompSize: number): Buffer {
    const rawBlockData = reader.readBytes(compressedSize);

    // Allocate buffer
    const decompressedBlockData = Buffer.alloc(decompSize);

    // Decompress the raw block data
    const actualDecompressedSize = lz4.decodeBlock(rawBlockData, decompressedBlockData);

    // Verify that the decompressed size matches the expected size
    if (actualDecompressedSize !== decompSize) {
      throw new Error(`Decompressed data size (${actualDecompressedSize}) does not match expected size (${decompSize})`);
    }

    Logger.log(`Decompressed data size matches the expected size (${decompSize})`);
    return decompressedBlockData;
  }

  private extractBlocks(blockReader: BinaryReader, blockSize: number): void {
    Logger.log(`Extracting ${blockSize} blocks:`);
    for (let i = 0; i < blockSize; i++) {
      const uncompressedSize = blockReader.readBigEndianUInt32();
      const compressedSize = blockReader.readBigEndianUInt32();
      const flags = blockReader.readBigEndianUInt16();

      this.blocks.push({
        uncompressedSize,
        compressedSize,
        flags,
      });

      Logger.log(`Block ${i + 1}:`);
      Logger.log(`  Uncompressed Size: ${uncompressedSize}`);
      Logger.log(`  Compressed Size: ${compressedSize}`);
      Logger.log(`  Flags: ${flags}`);
    }
  }

  private extractDirectories(blockReader: BinaryReader): void {
    // Read directoryInfoSize directly from the blockReader
    const directoryInfoSize = blockReader.readBigEndianUInt32();
    Logger.log(`\nDirectory Info Size: ${directoryInfoSize}`);

    // Loop through each directory entry
    for (let i = 0; i < directoryInfoSize; i++) {
      const offset = blockReader.readBigEndianUInt64();
      const size = blockReader.readBigEndianUInt64();
      const flags = blockReader.readBigEndianUInt32();
      const path = blockReader.readAsciiNullTerminatedString(256);

      this.directories.push({
        offset,
        size,
        flags,
        path,
      });

      Logger.log(`Directory ${i + 1}:`);
      Logger.log(`  Offset: ${offset}`);
      Logger.log(`  Size: ${size}`);
      Logger.log(`  Flags: ${flags}`);
      Logger.log(`  Path: ${path}`);
    }
  }

  private writeDecompressedBlockToDisk(outputDirectory: string, directoryInfo: DirectoryInfo, decompressedData: Buffer): string {
    const outputPath = path.join(outputDirectory, directoryInfo.path);

    // Ensure the directory exists
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });

    // Write the decompressed data to the output file
    fs.writeFileSync(outputPath, decompressedData);
    Logger.log(`Written to ${outputPath}`);
    return directoryInfo.path;
  }

  private processAndWriteBlocks(reader: BinaryReader, outputDirectory: string): string[] {
    let filesWritten: string[] = [];
    let uncompressedData: Buffer = Buffer.alloc(0);
    this.directories.forEach((directory, dirIndex) => {
      uncompressedData = Buffer.alloc(0);

      Logger.log(`Dir ${dirIndex} Position: ${reader.getPosition()}`);
      // Align the position to 16 bytes
      reader.alignToBoundary(16);
      Logger.log(`Dir ${dirIndex} Position aligned to 16-byte boundary: ${reader.getPosition()}`);

      this.blocks.forEach((block, blockIndex) => {
        if(block.compressedSize != block.uncompressedSize) {
          // Read the compressed data and add it to the buffer
          const compressedData = reader.readBytes(block.compressedSize);

          // Decompress the data
          const decompressedData = Buffer.alloc(block.uncompressedSize);

          // Decompress the data
          const decompressedSize = lz4.decodeBlock(compressedData, decompressedData);

          // Check if decompressed size matches the expected uncompressed size
          if (decompressedSize !== block.uncompressedSize) {
            throw new Error(
              `Decompressed size (${decompressedSize}) does not match expected uncompressed size (${block.uncompressedSize}) for Block: ${blockIndex}`
            );
          }
          else {
            Logger.log(`Block ${blockIndex}: Successfully decompressed (${decompressedSize})`);
            uncompressedData = Buffer.concat([uncompressedData, decompressedData]);
          }
        }
        else {
          Logger.log(`Block ${blockIndex}: No compression`);
          uncompressedData = Buffer.concat([uncompressedData, reader.readBytes(block.uncompressedSize)]);
        }
      });

      Logger.log(`Uncompressed size: ${uncompressedData.length}`);

      if(BigInt(uncompressedData.length) === directory.size) {
        Logger.log(`Sizes match, writing output: ${directory.path}`);

        // Write the decompressed data to disk using the corresponding directory info
        filesWritten.push(this.writeDecompressedBlockToDisk(outputDirectory, directory, uncompressedData));
      }

    });
    return filesWritten;
  }

  extractAssetBundle(outputDirectory: string): string[] {
    const buffer = fs.readFileSync(this.filePath);
    const reader = new BinaryReader(buffer);
    let filesWritten: string[] = [];

    try {
      // Read and process the header, returning the compressed and decompressed sizes
      const { compressedSize, decompSize } = this.readHeader(reader);

      // Extract and decompress block data
      const decompressedData = this.decompressData(reader, compressedSize, decompSize);

      // Use a new BinaryReader to read from the decompressed data
      const blockReader = new BinaryReader(decompressedData);

      // Skip reading first unknown 16 bytes (GUID?)
      blockReader.readBytes(16);

      // Now read the block count from the decompressed data
      const blockSize = blockReader.readBigEndianUInt32();
      Logger.log(`\nBlock Size: ${blockSize}`);

      // Extract block information
      this.extractBlocks(blockReader, blockSize);

      // Extract directory information
      this.extractDirectories(blockReader);

      // Process each block and write the decompressed data to disk
      filesWritten = this.processAndWriteBlocks(reader, outputDirectory);

    } catch (error) {
      if (error instanceof Error) {
        console.error('Error extracting AssetBundle:', error.message);
      } else {
        console.error('An unknown error occurred while extracting AssetBundle.');
      }
    }
    return filesWritten;
  }
}

export { AssetBundle };