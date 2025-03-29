import fs from 'fs';
import path from 'path';
import * as lz4 from '@scanreco/node-lz4';
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
  private fileVersion: number = 0;
  private playerVersion: string = '';
  private engineVersion: string = '';
  private guid: string = '';

  constructor(filePath: string) {
    this.filePath = filePath;
  }

  private readHeader(reader: BinaryReader): HeaderInfo {
    const sigString = reader.readAsciiNullTerminatedString(13);
    if (sigString !== 'UnityFS') {
      throw new Error('Not a valid UnityFS file.');
    }

    this.fileVersion = reader.readBigEndianUInt32();
    this.playerVersion = reader.readAsciiNullTerminatedString(20);
    this.engineVersion = reader.readAsciiNullTerminatedString(20);
    const totalFileSize = reader.readBigEndianUInt64();
    const compressedSize = reader.readBigEndianUInt32();
    const decompSize = reader.readBigEndianUInt32();
    const flags = reader.readBigEndianUInt32();

    Logger.log('UnityFS Header Information:');
    Logger.log(`Signature: ${sigString}`);
    Logger.log(`File Version: ${this.fileVersion}`);
    Logger.log(`Player Version: ${this.playerVersion}`);
    Logger.log(`Engine Version: ${this.engineVersion}`);
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

  private async decompressData(reader: BinaryReader, compressedSize: number, decompSize: number): Promise<Buffer> {
    Logger.log("\nDecompression Details:");
    Logger.log(`  Reading ${compressedSize} bytes of compressed data`);
    Logger.log(`  Reading starting from position ${reader.getPosition()}`);
    const rawBlockData = reader.readBytes(compressedSize);
    Logger.log(`  Raw block data (hex): ${rawBlockData.toString("hex")}`);

    // Allocate buffer
    const decompressedBlockData = Buffer.alloc(decompSize);
    Logger.log(`  Allocated buffer of size ${decompSize}`);

    // Decompress the raw block data
    const actualDecompressedSize = lz4.decodeBlock(rawBlockData, decompressedBlockData);
    Logger.log(`  Actual decompressed size: ${actualDecompressedSize}`);
    Logger.log(`  Decompressed data (hex): ${decompressedBlockData.toString("hex")}`);

    // Verify that the decompressed size matches the expected size
    if (actualDecompressedSize !== decompSize) {
      throw new Error(`Decompressed data size (${actualDecompressedSize}) does not match expected size (${decompSize})`);
    }

    Logger.log(`Decompressed data size matches the expected size (${decompSize})`);
    return decompressedBlockData;
  }

  private extractBlocks(blockReader: BinaryReader, blockSize: number): void {
    Logger.log(`\nExtracting ${blockSize} blocks:`);
    for (let i = 0; i < blockSize; i++) {
      Logger.log(`\nBlock ${i + 1}:`);
      Logger.log(`  Current position: ${blockReader.getPosition()}`);

      const uncompressedSize = blockReader.readBigEndianUInt32();
      Logger.log(`  Uncompressed Size: ${uncompressedSize} (0x${uncompressedSize.toString(16)})`);

      const compressedSize = blockReader.readBigEndianUInt32();
      Logger.log(`  Compressed Size: ${compressedSize} (0x${compressedSize.toString(16)})`);

      const flags = blockReader.readBigEndianUInt16();
      Logger.log(`  Flags: ${flags} (0x${flags.toString(16)})`);

      this.blocks.push({
        uncompressedSize,
        compressedSize,
        flags,
      });
    }
  }

  private extractDirectories(blockReader: BinaryReader): void {
    Logger.log("\nExtracting Directories:");
    Logger.log(`  Current position: ${blockReader.getPosition()}`);

    // Read directoryInfoSize directly from the blockReader
    const directoryInfoSize = blockReader.readBigEndianUInt32();
    Logger.log(`  Directory Info Size: ${directoryInfoSize}`);

    // Loop through each directory entry
    for (let i = 0; i < directoryInfoSize; i++) {
      Logger.log(`\nDirectory ${i + 1}:`);
      Logger.log(`  Current position: ${blockReader.getPosition()}`);

      const offset = blockReader.readBigEndianUInt64();
      Logger.log(`  Offset: ${offset}`);

      const size = blockReader.readBigEndianUInt64();
      Logger.log(`  Size: ${size}`);

      const flags = blockReader.readBigEndianUInt32();
      Logger.log(`  Flags: ${flags}`);

      const path = blockReader.readAsciiNullTerminatedString(256);
      Logger.log(`  Path: ${path}`);

      this.directories.push({
        offset,
        size,
        flags,
        path,
      });
    }
  }

  private writeDecompressedBlockToDisk(outputDirectory: string, directoryInfo: DirectoryInfo, decompressedData: Buffer, block: BlockInfo): string {
    const outputPath = path.join(outputDirectory, directoryInfo.path);

    // Ensure the directory exists
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });

    // Write the decompressed data to the output file
    fs.writeFileSync(outputPath, decompressedData);
    Logger.log(`Written to ${outputPath}`);

    // Only write metadata for CAB files (or optionally all files)
    if (directoryInfo.path.startsWith("CAB-")) {
      this.writeMetadataFile(
        outputPath,
        directoryInfo,
        block,
        {
          fileVersion: this.fileVersion,
          playerVersion: this.playerVersion,
          engineVersion: this.engineVersion,
        }
      );
      Logger.log(`Metadata written to ${outputPath}.meta.json`);
    }

    return directoryInfo.path;
  }

  private writeMetadataFile(outputPath: string, directoryInfo: DirectoryInfo, block: BlockInfo, unityfsInfo: { fileVersion: number; playerVersion: string; engineVersion: string; }): void {
    const meta = {
      assetBundle: path.basename(this.filePath),
      fileVersion: unityfsInfo.fileVersion,
      playerVersion: unityfsInfo.playerVersion,
      engineVersion: unityfsInfo.engineVersion,
      guid: this.guid,
      blockInfo: {
        count: this.blocks.length,
        entries: this.blocks.map(b => ({
          uncompressedSize: b.uncompressedSize,
          compressedSize: b.compressedSize,
          flags: b.flags,
          compressed: b.compressedSize !== b.uncompressedSize,
          compression: (b.flags & 0x3F) === 2 ? "lz4" : ((b.flags & 0x3F) === 1 ? "lzma" : "none")
        }))
      },
      directoryInfo: {
        size: this.directories.length,
        entries: this.directories.map(d => ({
          offset: d.offset.toString(),
          size: d.size.toString(),
          flags: d.flags,
          path: d.path
        }))
      }
    };

    const metaPath = outputPath + ".meta.json";
    fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
  }

  private async processAndWriteBlocks(reader: BinaryReader, outputDirectory: string): Promise<string[]> {
    let filesWritten: string[] = [];

    this.directories.forEach((directory, dirIndex) => {
      let uncompressedData: Buffer = Buffer.alloc(0);

      Logger.log(`Dir ${dirIndex} Position: ${reader.getPosition()}`);
      reader.alignToBoundary(16);
      Logger.log(`Dir ${dirIndex} Position aligned to 16-byte boundary: ${reader.getPosition()}`);

      // Decompress all blocks into one buffer
      this.blocks.forEach((block, blockIndex) => {
        if (block.compressedSize !== block.uncompressedSize) {
          Logger.log(`Reading ${block.compressedSize} bytes from position ${reader.getPosition()} for decompression`);
          const compressedData = reader.readBytes(block.compressedSize);
          const decompressedData = Buffer.alloc(block.uncompressedSize);
          const decompressedSize = lz4.decodeBlock(compressedData, decompressedData);

          if (decompressedSize !== block.uncompressedSize) {
            throw new Error(
              `Block decompression size (${decompressedSize}) does not match expected uncompressed size (${block.uncompressedSize}) for Block: ${blockIndex}`
            );
          }

          Logger.log(`Block ${blockIndex}: Successfully decompressed (${decompressedSize})`);
          uncompressedData = Buffer.concat([uncompressedData, decompressedData]);
        } else {
          Logger.log(`Block ${blockIndex}: No compression`);
          uncompressedData = Buffer.concat([uncompressedData, reader.readBytes(block.uncompressedSize)]);
        }
      });

      Logger.log(`Uncompressed size: ${uncompressedData.length}`);

      if (BigInt(uncompressedData.length) === directory.size) {
        Logger.log(`Sizes match, writing output: ${directory.path}`);

        // For simplicity, assume first block represents the CAB (in most single-CAB bundles it's true)
        const primaryBlock = this.blocks[0];

        // Write the decompressed data to disk using the corresponding directory info
        filesWritten.push(
          this.writeDecompressedBlockToDisk(outputDirectory, directory, uncompressedData, primaryBlock)
        );
      } else {
        console.error(`⚠️ Directory ${directory.path} skipped due to size mismatch`);
      }
    });

    return filesWritten;
  }

  async extractAssetBundle(outputDirectory: string): Promise<string[]> {
    const buffer = fs.readFileSync(this.filePath);
    const reader = new BinaryReader(buffer);
    let filesWritten: string[] = [];

    Logger.log("🛠 Starting extraction!")

    try {
      // Read and process the header, returning the compressed and decompressed sizes
      const { compressedSize, decompSize } = this.readHeader(reader);

      // Extract and decompress block data
      const decompressedData = await this.decompressData(reader, compressedSize, decompSize);

      // Use a new BinaryReader to read from the decompressed data
      const blockReader = new BinaryReader(decompressedData);

      // Read and store the GUID
      const guidBytes = blockReader.readBytes(16);
      this.guid = guidBytes.toString('hex');
      Logger.log(`GUID: ${this.guid}`);

      // Now read the block count from the decompressed data
      const blockSize = blockReader.readBigEndianUInt32();
      Logger.log(`\nBlock Size: ${blockSize}`);

      // Extract block information
      this.extractBlocks(blockReader, blockSize);

      // Extract directory information
      this.extractDirectories(blockReader);

      // Process each block and write the decompressed data to disk
      filesWritten = await this.processAndWriteBlocks(reader, outputDirectory);

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
