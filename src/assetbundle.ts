import fs from 'fs';
import fsPromises from 'fs/promises';
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

  setPosition(position: number): void {
    this.position = position;
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

interface CABMeta {
  assetBundle: string;
  fileVersion: number;
  playerVersion: string;
  engineVersion: string;
  guid: string;
  blockInfo: {
    count: number;
    entries: Array<{
      uncompressedSize: number;
      compressedSize: number;
      flags: number;
      compressed: boolean;
      compression: string;
    }>;
  };
  directoryInfo: {
    size: number;
    entries: Array<{
      offset: string;
      size: string;
      flags: number;
      path: string;
    }>;
  };
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

  private writeMetadataFile(outputPath: string, directoryInfo: DirectoryInfo, block: BlockInfo, unityfsInfo: {
    fileVersion: number;
    playerVersion: string;
    engineVersion: string;
  }): void {
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

  async scanForTextAssets(targetSuffixes: string[]): Promise<Array<{assetPath: string, bundlePath: string, cabPath: string}>> {
    const results: Array<{assetPath: string, bundlePath: string, cabPath: string}> = [];
    
    try {
      const buffer = fs.readFileSync(this.filePath);
      const reader = new BinaryReader(buffer);
      
      // Read and process the header
      const { compressedSize, decompSize } = this.readHeader(reader);
      
      // Extract and decompress block data
      const decompressedData = await this.decompressData(reader, compressedSize, decompSize);
      
      // Use a new BinaryReader to read from the decompressed data
      const blockReader = new BinaryReader(decompressedData);
      
      // Read GUID
      const guidBytes = blockReader.readBytes(16);
      this.guid = guidBytes.toString('hex');
      
      // Read block count
      const blockSize = blockReader.readBigEndianUInt32();
      
      // Extract block information
      this.extractBlocks(blockReader, blockSize);
      
      // Extract directory information
      this.extractDirectories(blockReader);
      
      // Process each block to extract CAB data and scan it
      reader.alignToBoundary(16);
      
      for (const directory of this.directories) {
        let uncompressedData: Buffer = Buffer.alloc(0);
        
        // Decompress all blocks into one buffer
        for (const block of this.blocks) {
          if (block.compressedSize !== block.uncompressedSize) {
            const compressedData = reader.readBytes(block.compressedSize);
            const decompressedData = Buffer.alloc(block.uncompressedSize);
            const decompressedSize = lz4.decodeBlock(compressedData, decompressedData);
            
            if (decompressedSize !== block.uncompressedSize) {
              throw new Error(`Block decompression size mismatch`);
            }
            
            uncompressedData = Buffer.concat([uncompressedData, decompressedData]);
          } else {
            uncompressedData = Buffer.concat([uncompressedData, reader.readBytes(block.uncompressedSize)]);
          }
        }
        
        // Now scan the CAB data for TextAssets with matching container paths
        const { CABExtractor } = await import('./cab.js');
        const matches = CABExtractor.scanForTextAssets(uncompressedData, targetSuffixes);
        
        if (matches && matches.length > 0) {
          for (const match of matches) {
            results.push({
              assetPath: match,
              bundlePath: this.filePath,
              cabPath: directory.path
            });
          }
        }
      }
    } catch (error) {
      // Silently fail - this might not be a valid bundle or doesn't contain what we're looking for
    }
    
    return results;
  }

  async rebuildAssetBundle(updatedCABPath: string, outputBundlePath: string): Promise<void> {
    const bundleDir = path.dirname(updatedCABPath);
    const metaPath = `${updatedCABPath}.meta.json`;
    const meta: CABMeta = JSON.parse(await fsPromises.readFile(metaPath, "utf-8"));

    // Read the updated CAB data from disk
    const cabData = await fsPromises.readFile(updatedCABPath);
    Logger.log("Original CAB file size:", cabData.length);
    Logger.log("First 16 bytes of original CAB (hex):", cabData.slice(0, 16).toString("hex"));

    //
    // ─────────────────────────────────────────────────────────────────────
    // STEP 1: Build the new block data by iterating all blocks in meta
    // ─────────────────────────────────────────────────────────────────────
    //

    let offsetInCAB = 0;
    const blockBuffers: Buffer[] = [];     // Each block's final (compressed or uncompressed) data
    const blockInfoEntries: Buffer[] = []; // Each block's 10-byte info record

    // Go through each block from meta
    for (let i = 0; i < meta.blockInfo.entries.length; i++) {
      const b = meta.blockInfo.entries[i];
      const uncompressedSize = b.uncompressedSize;
      const flags = b.flags;

      // Slice the updatedCAB data for this block's uncompressed payload
      const chunk = cabData.slice(offsetInCAB, offsetInCAB + uncompressedSize);
      offsetInCAB += uncompressedSize;

      Logger.log(`\nBlock ${i + 1} from meta:`);
      Logger.log(`  Uncompressed Size (meta): ${uncompressedSize}`);
      Logger.log(`  Flags (meta): 0x${flags.toString(16)} (${flags})`);

      // Check if we need LZ4 compression
      // The "compression mode" is stored in `flags & 0x3F` for Unity blocks.
      // For example, 2 or 3 => LZ4. 0 => uncompressed. 1 => LZMA, etc.
      const blockCompressionMode = flags & 0x3F;
      const needsLZ4 = (blockCompressionMode === 2 || blockCompressionMode === 3);

      let finalChunk: Buffer;
      let compressedSize: number;

      if (needsLZ4) {
        // Compress the chunk with LZ4
        const maxCompressedLen = lz4.encodeBound(uncompressedSize);
        const temp = Buffer.allocUnsafe(maxCompressedLen);
        const encodedSize = lz4.encodeBlock(chunk, temp);
        finalChunk = temp.slice(0, encodedSize);
        compressedSize = encodedSize;

        // Debug logging
        Logger.log(`  Compressing block with LZ4.`);
        Logger.log(`  Original uncompressed block size: ${uncompressedSize}`);
        Logger.log(`  Compressed block size: ${compressedSize}`);
        Logger.log(`  Compression ratio: ${((compressedSize / uncompressedSize) * 100).toFixed(2)}%`);

        // Verify by decompressing
        const testDecompressed = Buffer.alloc(uncompressedSize);
        const decompressedSize = lz4.decodeBlock(finalChunk, testDecompressed);
        Logger.log(`  Test decompression size: ${decompressedSize}`);
        if (decompressedSize !== uncompressedSize) {
          throw new Error(`Block ${i + 1} test decompression mismatch!`);
        }
      } else {
        // No compression
        finalChunk = chunk;
        compressedSize = uncompressedSize;
        Logger.log(`  This block is uncompressed (flags = 0)`);
      }

      // Build the 10-byte block info: [uncompressedSize (4), compressedSize (4), flags (2)]
      const info = Buffer.alloc(10);
      info.writeUInt32BE(uncompressedSize, 0);
      info.writeUInt32BE(compressedSize, 4);
      info.writeUInt16BE(flags, 8);

      blockBuffers.push(finalChunk);
      blockInfoEntries.push(info);
    }

    // Concatenate all block-info records
    const allBlockInfo = Buffer.concat(blockInfoEntries);

    //
    // ─────────────────────────────────────────────────────────────────────
    // STEP 2: Build the directory info area (same logic as your existing code)
    // ─────────────────────────────────────────────────────────────────────
    //

    const dirCount = Buffer.alloc(4);
    dirCount.writeUInt32BE(meta.directoryInfo.size); // number of directory entries
    Logger.log("\nDirectory count buffer (hex):", dirCount.toString("hex"));

    // For simplicity, we’ll just handle the first directory entry.
    // If you have more, you can loop similarly.
    const d = meta.directoryInfo.entries[0];

    const dirOffsetBuffer = Buffer.alloc(8);
    dirOffsetBuffer.writeBigUInt64BE(BigInt(d.offset));
    Logger.log("Offset buffer (hex):", dirOffsetBuffer.toString("hex"));

    // If the original asset had multiple blocks, the "size" field is usually the total uncompressed length
    // of all blocks. For a single-file CAB, it can be sum of block uncompressed sizes:
    let totalUncompressed = 0;
    for (let i = 0; i < meta.blockInfo.entries.length; i++) {
      totalUncompressed += meta.blockInfo.entries[i].uncompressedSize;
    }

    const dirSizeBuffer = Buffer.alloc(8);
    dirSizeBuffer.writeBigUInt64BE(BigInt(totalUncompressed));
    Logger.log("Size buffer (hex):", dirSizeBuffer.toString("hex"));

    const dirFlagsBuffer = Buffer.alloc(4);
    dirFlagsBuffer.writeUInt32BE(d.flags);
    Logger.log("Flags buffer (hex):", dirFlagsBuffer.toString("hex"));

    const pathBuffer = Buffer.concat([
      Buffer.from(d.path, "utf-8"),
      Buffer.from([0]) // Null terminator
    ]);
    Logger.log("Path buffer (hex):", pathBuffer.toString("hex"));

    const directoryInfo = Buffer.concat([
      dirCount,
      dirOffsetBuffer,
      dirSizeBuffer,
      dirFlagsBuffer,
      pathBuffer
    ]);

    //
    // ─────────────────────────────────────────────────────────────────────
    // STEP 3: Build "GUID + block count + block info + directory info"
    // ─────────────────────────────────────────────────────────────────────
    //

    const guid = Buffer.from(meta.guid, 'hex');
    const blockCount = Buffer.alloc(4);
    blockCount.writeUInt32BE(meta.blockInfo.count);

    // Combine them all into uncompressed block info data
    const uncompressedBlockInfoData = Buffer.concat([
      guid,              // 16 bytes
      blockCount,        // 4 bytes
      allBlockInfo,      // all block info records (10 bytes each)
      directoryInfo      // directory data
    ]);

    // Debug logs
    Logger.log("\nConstructing uncompressed block info data:");
    Logger.log(`  GUID length: ${guid.length}`);
    Logger.log(`  blockCount length: ${blockCount.length}`);
    Logger.log(`  allBlockInfo length: ${allBlockInfo.length}`);
    Logger.log(`  directoryInfo length: ${directoryInfo.length}`);
    Logger.log("Full block info size (before compression):", uncompressedBlockInfoData.length);
    Logger.log("FullBlockInfo (hex):", uncompressedBlockInfoData.toString("hex"));

    // Now compress the block info as LZ4 (because your top-level flags mention LZ4)
    const compressedBlockInfoBuf = Buffer.alloc(lz4.encodeBound(uncompressedBlockInfoData.length));
    const compressedBlockInfoSize = lz4.encodeBlock(uncompressedBlockInfoData, compressedBlockInfoBuf);
    const finalBlockInfo = compressedBlockInfoBuf.slice(0, compressedBlockInfoSize);

    Logger.log("Compressed block info size:", finalBlockInfo.length);
    Logger.log("CompressedBlockInfo (hex):", finalBlockInfo.toString("hex"));

    // Test decompress
    const testUncompressed = Buffer.alloc(uncompressedBlockInfoData.length);
    const testSizeUncompressed = lz4.decodeBlock(finalBlockInfo, testUncompressed);
    Logger.log("Test uncompressed size:", testSizeUncompressed);
    if (testSizeUncompressed !== uncompressedBlockInfoData.length) {
      throw new Error("Block info test decompression mismatch!");
    }

    //
    // ─────────────────────────────────────────────────────────────────────
    // STEP 4: Build the UnityFS header
    // ─────────────────────────────────────────────────────────────────────
    //

    // You already have this logic, we just replicate it with the new finalBlockInfo
    const signature = Buffer.from("UnityFS\0", "utf-8");
    const playerVersion = Buffer.from(`${meta.playerVersion}\0`, "utf-8");
    const engineVersion = Buffer.from(`${meta.engineVersion}\0`, "utf-8");

    // In your logs: 579 => 0x243 => 0x200 (padding) + 0x40 (dir) + 3 (LZ4)
    // We'll replicate that. Or do a direct build:
    const blockInfoFlags = 0x200 | 0x40 | 3; // LZ4 + Dir + blockInfoNeedsPadding

    const versionStrings = Buffer.concat([playerVersion, engineVersion]);
    const headerLength = signature.length + 4 + versionStrings.length + 8 + 4 + 4 + 4;
    const header = Buffer.alloc(headerLength);

    let offset = 0;
    signature.copy(header, offset);
    offset += signature.length;

    header.writeUInt32BE(meta.fileVersion, offset);
    Logger.log("fileVersion written bytes (BE):", header.slice(offset, offset + 4).toString("hex"));
    offset += 4;

    versionStrings.copy(header, offset);
    offset += versionStrings.length;

    const fileSizeOffset = offset;
    // We must place the blocks after finalBlockInfo, so let's compute total file size.

    // Sum of all compressed blocks:
    let blocksTotalCompressedSize = 0;
    for (const bb of blockBuffers) {
      blocksTotalCompressedSize += bb.length;
    }

    // 1) header + alignment to 16
    const afterHeaderUnaligned = headerLength;
    const afterHeaderAligned = (afterHeaderUnaligned + 15) & ~15;
    // 2) finalBlockInfo + alignment
    const afterBlockInfo = afterHeaderAligned + finalBlockInfo.length;
    const afterBlockInfoAligned = (afterBlockInfo + 15) & ~15;
    // 3) blocks
    const blocksStart = afterBlockInfoAligned;
    const totalSize = blocksStart + blocksTotalCompressedSize;

    // Write size info
    header.writeBigUInt64BE(BigInt(totalSize), fileSizeOffset);                // totalFileSize
    header.writeUInt32BE(finalBlockInfo.length, fileSizeOffset + 8);           // compressedSize
    header.writeUInt32BE(uncompressedBlockInfoData.length, fileSizeOffset + 12); // decompSize
    header.writeUInt32BE(blockInfoFlags, fileSizeOffset + 16);                 // flags

    //
    // ─────────────────────────────────────────────────────────────────────
    // STEP 5: Concatenate everything with correct alignment
    // ─────────────────────────────────────────────────────────────────────
    //

    // Align from header to block info
    const headerPaddingSize = afterHeaderAligned - headerLength;
    const headerPadding = Buffer.alloc(headerPaddingSize);

    // Align from block info to block data
    const blockInfoPaddingSize = afterBlockInfoAligned - afterBlockInfo;
    const blockInfoPadding = Buffer.alloc(blockInfoPaddingSize);

    Logger.log("\nAlignment and final assembly:");
    Logger.log("Header length:", header.length);
    Logger.log("Header padding size:", headerPaddingSize);
    Logger.log("FinalBlockInfo length:", finalBlockInfo.length);
    Logger.log("BlockInfo padding size:", blockInfoPaddingSize);
    Logger.log("Number of block data buffers:", blockBuffers.length);
    Logger.log("Sum of compressed block data lengths:", blocksTotalCompressedSize);
    Logger.log("Total AssetBundle size:", totalSize);

    const finalBundle = Buffer.concat([
      header,
      headerPadding,
      finalBlockInfo,
      blockInfoPadding,
      ...blockBuffers  // all the block data
    ]);

    // Final debug
    const actualCabStart = afterBlockInfoAligned; // blocksStart
    Logger.log("\nCAB File(s) Information:");
    Logger.log("Actual first block start in final bundle:", actualCabStart);
    Logger.log("Is that 16-byte aligned?", actualCabStart % 16 === 0);
    Logger.log("First 16 bytes of first block in final bundle (hex):",
      finalBundle.slice(actualCabStart, actualCabStart + 16).toString("hex"));
    Logger.log("Final bundle size:", finalBundle.length);

    // Write to disk
    await fsPromises.writeFile(outputBundlePath, finalBundle);
    Logger.log("Wrote rebuilt multi-block AssetBundle to:", outputBundlePath);
  }

  /**
   * Update an AssetBundle in-place using the UnityPy.load() approach.
   * This method loads the original bundle, extracts the CAB internally,
   * updates it with new asset data, and rebuilds the bundle.
   * 
   * @param originalAssetPath Path to the original encrypted asset (e.g., CARD_Name.bin)
   * @param newAssetPath Path to the new encrypted asset to replace with
   * @param outputBundlePath Path where the updated AssetBundle will be written
   */
  async updateAssetBundle(originalAssetPath: string, newAssetPath: string, outputBundlePath: string): Promise<void> {
    Logger.log("\n🔄 Starting in-place AssetBundle update (UnityPy.load() approach)");
    Logger.log(`  Original bundle: ${this.filePath}`);
    Logger.log(`  Original asset: ${originalAssetPath}`);
    Logger.log(`  New asset: ${newAssetPath}`);
    Logger.log(`  Output bundle: ${outputBundlePath}`);

    // Read the original and new asset data
    const originalAssetData = await fsPromises.readFile(originalAssetPath);
    const newAssetData = await fsPromises.readFile(newAssetPath);
    
    Logger.log(`\n📊 Asset sizes:`);
    Logger.log(`  Original asset size: ${originalAssetData.length} bytes`);
    Logger.log(`  New asset size: ${newAssetData.length} bytes`);
    Logger.log(`  Size difference: ${newAssetData.length - originalAssetData.length} bytes`);

    // Load the original bundle
    const buffer = fs.readFileSync(this.filePath);
    const reader = new BinaryReader(buffer);

    // Read and process the header
    const { compressedSize, decompSize } = this.readHeader(reader);

    // Extract and decompress block data
    const decompressedData = await this.decompressData(reader, compressedSize, decompSize);

    // Use a new BinaryReader to read from the decompressed data
    const blockReader = new BinaryReader(decompressedData);

    // Read GUID
    const guidBytes = blockReader.readBytes(16);
    this.guid = guidBytes.toString('hex');
    Logger.log(`\n🔑 GUID: ${this.guid}`);

    // Read block count
    const blockSize = blockReader.readBigEndianUInt32();
    Logger.log(`\n📦 Block count: ${blockSize}`);

    // Extract block information
    this.extractBlocks(blockReader, blockSize);

    // Extract directory information
    this.extractDirectories(blockReader);

    // Now we need to extract the CAB data, update it, and rebuild
    reader.alignToBoundary(16);
    
    Logger.log("\n🔍 Extracting CAB data from bundle...");
    
    // Process the first directory (typically the CAB file)
    const directory = this.directories[0];
    let uncompressedCABData: Buffer = Buffer.alloc(0);

    // Decompress all blocks into one buffer
    for (const block of this.blocks) {
      if (block.compressedSize !== block.uncompressedSize) {
        const compressedData = reader.readBytes(block.compressedSize);
        const decompressedData = Buffer.alloc(block.uncompressedSize);
        const decompressedSize = lz4.decodeBlock(compressedData, decompressedData);
        
        if (decompressedSize !== block.uncompressedSize) {
          throw new Error(`Block decompression size mismatch`);
        }
        
        uncompressedCABData = Buffer.concat([uncompressedCABData, decompressedData]);
      } else {
        uncompressedCABData = Buffer.concat([uncompressedCABData, reader.readBytes(block.uncompressedSize)]);
      }
    }

    Logger.log(`  Extracted CAB size: ${uncompressedCABData.length} bytes`);

    // Now update the CAB data with the new asset
    Logger.log("\n🔧 Updating CAB data with new asset...");
    
    // Scan the CAB for the original asset
    let assetOffset = -1;
    for (let i = 0; i <= uncompressedCABData.length - originalAssetData.length; i++) {
      if (uncompressedCABData.slice(i, i + originalAssetData.length).equals(originalAssetData)) {
        assetOffset = i;
        break;
      }
    }

    if (assetOffset === -1) {
      throw new Error("❌ Failed to locate original asset in CAB");
    }

    Logger.log(`  ✅ Found original asset at offset 0x${assetOffset.toString(16)} (${assetOffset})`);

    // Build new CAB with updated asset
    const assetEnd = assetOffset + originalAssetData.length;
    const sizeDelta = newAssetData.length - originalAssetData.length;
    const newCABSize = uncompressedCABData.length + sizeDelta;
    const updatedCABData = Buffer.alloc(newCABSize);

    uncompressedCABData.copy(updatedCABData, 0, 0, assetOffset); // before asset
    newAssetData.copy(updatedCABData, assetOffset);               // new asset
    uncompressedCABData.copy(updatedCABData, assetOffset + newAssetData.length, assetEnd); // after asset

    Logger.log(`  Size delta: ${sizeDelta} bytes`);
    Logger.log(`  New CAB size: ${updatedCABData.length} bytes`);

    // Now we need to update the SerializedFile metadata
    // Parse the CAB header to understand the structure
    const cabReader = new BinaryReader(updatedCABData);
    cabReader.readBytes(4); // placeholder 1
    cabReader.readBytes(4); // placeholder 2
    const version = cabReader.readBigEndianUInt32(); // version
    cabReader.readBytes(4); // placeholder 3
    cabReader.readBytes(1); // swapEndianess
    cabReader.alignToBoundary(4); // align
    
    const metadataSizeOffset = cabReader.getPosition();
    const metadataSize = cabReader.readBigEndianUInt32(); // metadataSize
    const cabFileSizeOffset = cabReader.getPosition();
    const fileSize = cabReader.readBigEndianUInt64(); // fileSize (old value)
    const dataOffsetValue = Number(cabReader.readBigEndianUInt64()); // dataOffset
    const unknown22 = cabReader.readBigEndianUInt64(); // unknown22
    
    // Read the unityVersion string
    const unityVersionStart = cabReader.getPosition();
    while (updatedCABData[cabReader.getPosition()] !== 0) {
      cabReader.readBytes(1);
    }
    cabReader.readBytes(1); // skip null terminator
    
    // Now we're at the metadata section
    // Switch to little endian for metadata
    const metadataStart = cabReader.getPosition();
    
    // Read target platform, type tree enabled, type count
    const targetPlatform = updatedCABData.readInt32LE(cabReader.getPosition());
    cabReader.readBytes(4);
    const typeTreeEnabled = updatedCABData.readUInt8(cabReader.getPosition());
    cabReader.readBytes(1);
    const typeCount = updatedCABData.readInt32LE(cabReader.getPosition());
    cabReader.readBytes(4);
    
    Logger.log(`\n📋 SerializedFile metadata:`);
    Logger.log(`  Version: ${version}`);
    Logger.log(`  Metadata size: ${metadataSize}`);
    Logger.log(`  Data offset: ${dataOffsetValue}`);
    Logger.log(`  Target platform: ${targetPlatform}`);
    Logger.log(`  Type tree enabled: ${typeTreeEnabled}`);
    Logger.log(`  Type count: ${typeCount}`);
    
    // Instead of trying to parse the complex type tree structure, we can calculate
    // where the object table should be. The metadata section layout is:
    // - Header (ends at unityVersionStart)
    // - Platform, typeTreeEnabled, typeCount
    // - Type information (variable size)
    // - Object count and object table
    // - Script types (optional)
    // - Externals (optional)
    // - RefTypes (optional, version >= 14)
    // - UserInformation (optional, version >= 7)
    //
    // The object table is the most important part for us. We can find it by
    // working backwards from metadataSize or by parsing carefully.
    //
    // For a simpler approach, let's use the fact that the metadata ends at a known position
    // and the object count is typically stored just before the object table.
    // We'll search for a reasonable object count value near the expected position.
    
    // The metadata section is from the end of the header to metadataSize
    // Let's try a different approach: skip to near the end of metadata and look for object count
    // Object table typically comes after types, so let's estimate
    
    // Actually, let's use a more robust method: parse the structure correctly
    // by calculating based on metadataSize
    // The object table starts after: types, scripts, externals
    // We know metadataSize tells us the total size of metadata
    // Let's position ourselves based on that
    
    // DISABLED: Object table updates are causing corruption due to incorrect parsing
    // The heuristic search is finding false matches (garbage data that happens to pass validation)
    // This results in corrupted object metadata with nonsensical values like 223 petabyte offsets
    // For now, we'll only update the CAB header fileSize and data section fileSize fields
    Logger.log(`  ⚠️  Object table updates DISABLED - only updating fileSize fields`);
    Logger.log(`  This avoids corruption from incorrect object table parsing`);
    
    // Skip the entire object table parsing and updating section
    // Go straight to patching the CAB header fileSize
    
    // Patch the total CAB fileSize in the header (64-bit big-endian at offset 0x18)
    updatedCABData.writeBigUInt64BE(BigInt(updatedCABData.length), cabFileSizeOffset);
    Logger.log(`  ✅ Patched CAB header fileSize from ${fileSize} to ${updatedCABData.length}`);
    
    // Only update the data section fileSize if the asset size actually changed
    if (sizeDelta !== 0) {
      // Now we need to update the fileSize field in the data section
      // The data section starts at dataOffset and has structure:
      //   fileType (4 bytes LE)
      //   fileName (null-terminated string)
      //   alignment to 4 bytes
      //   fileSize (4 bytes LE) <- THIS needs updating!
      //   [For MAD: 180 bytes + repeat above structure]
      //   [actual data]
      
      Logger.log(`\n🔧 Updating fileSize in data section (sizeDelta: ${sizeDelta})...`);
      Logger.log(`  Asset was found at offset: 0x${assetOffset.toString(16)}`);
      Logger.log(`  Data section starts at: 0x${dataOffsetValue.toString(16)}`);
      
      // IMPORTANT: We need to read from the ORIGINAL CAB data to get the old fileSize values,
      // because the updatedCABData has already had the asset replaced and offsets may have shifted
      const originalDataReader = new BinaryReader(uncompressedCABData);
      originalDataReader.setPosition(dataOffsetValue);
      
      const dataFileType = uncompressedCABData.readInt32LE(originalDataReader.getPosition());
      originalDataReader.readBytes(4);
      const dataFileName = originalDataReader.readAsciiNullTerminatedString(256);
      originalDataReader.alignToBoundary(4);
      const dataFileSizeOffset = originalDataReader.getPosition();
      const oldDataFileSize = uncompressedCABData.readUInt32LE(dataFileSizeOffset);
      originalDataReader.readBytes(4);
      
      Logger.log(`  Data section fileType: ${dataFileType}`);
      Logger.log(`  Data section fileName: ${dataFileName}`);
      Logger.log(`  Data section fileSize offset: 0x${dataFileSizeOffset.toString(16)}`);
      Logger.log(`  Data section old fileSize: ${oldDataFileSize}`);
      
      // Sanity check: dataFileSizeOffset should be less than assetOffset for correctness
      if (dataFileSizeOffset >= assetOffset) {
        Logger.log(`  ⚠️  WARNING: First fileSize offset (0x${dataFileSizeOffset.toString(16)}) is >= asset offset (0x${assetOffset.toString(16)})`);
        Logger.log(`  This suggests the asset was found in an unexpected location!`);
      }
      
      const assetEnd = assetOffset + originalAssetData.length;
      
      // Check if this is a MAD file that needs special handling
      const isMadFile = dataFileName.includes('CARD_Name') || 
                        dataFileName.includes('CARD_Desc') || 
                        dataFileName.includes('CARD_Indx') ||
                        dataFileName.includes('Card_Part') ||
                        dataFileName.includes('Card_Pidx') ||
                        dataFileName.includes('e9aa18bf') ||
                        dataFileName.includes('ebaee097') ||
                        dataFileName.includes('494e34d0');
      
      if (isMadFile) {
        Logger.log(`  Detected MAD file - updating both fileSize fields`);
        
        // Update the first fileSize field
        // IMPORTANT: If this offset is AFTER the asset, we need to adjust it in the updated buffer
        const newDataFileSize = oldDataFileSize + sizeDelta;
        const adjustedDataOffset = dataFileSizeOffset >= assetEnd ? dataFileSizeOffset + sizeDelta : dataFileSizeOffset;
        updatedCABData.writeUInt32LE(newDataFileSize, adjustedDataOffset);
        Logger.log(`  ✅ Updated first fileSize from ${oldDataFileSize} to ${newDataFileSize} at adjusted offset 0x${adjustedDataOffset.toString(16)} (original: 0x${dataFileSizeOffset.toString(16)})`);
        
        // For MAD files, skip 180 bytes and re-read the structure for the second fileSize
        // Again, read from ORIGINAL to get correct offset
        originalDataReader.readBytes(180);
        const madFileType = uncompressedCABData.readInt32LE(originalDataReader.getPosition());
        originalDataReader.readBytes(4);
        const madFileName = originalDataReader.readAsciiNullTerminatedString(256);
        originalDataReader.alignToBoundary(4);
        const madFileSizeOffset = originalDataReader.getPosition();
        const madOldFileSize = uncompressedCABData.readUInt32LE(madFileSizeOffset);
        
        Logger.log(`  MAD section fileSize offset: 0x${madFileSizeOffset.toString(16)}`);
        Logger.log(`  MAD section old fileSize: ${madOldFileSize}`);
        
        // Sanity check: madFileSizeOffset should ideally be less than assetOffset
        if (madFileSizeOffset >= assetOffset && madFileSizeOffset < assetEnd) {
          Logger.log(`  ⚠️  WARNING: Second fileSize offset (0x${madFileSizeOffset.toString(16)}) is within the asset region [0x${assetOffset.toString(16)}, 0x${assetEnd.toString(16)})`);
          Logger.log(`  This is problematic - the fileSize field is being overwritten by asset data!`);
        }
        
        // Update the MAD section fileSize (in the updatedCABData)
        // IMPORTANT: If this offset is AFTER the asset, we need to adjust it in the updated buffer
        const newMadFileSize = madOldFileSize + sizeDelta;
        const adjustedMadOffset = madFileSizeOffset >= assetEnd ? madFileSizeOffset + sizeDelta : madFileSizeOffset;
        updatedCABData.writeUInt32LE(newMadFileSize, adjustedMadOffset);
        Logger.log(`  ✅ Updated second fileSize from ${madOldFileSize} to ${newMadFileSize} at adjusted offset 0x${adjustedMadOffset.toString(16)} (original: 0x${madFileSizeOffset.toString(16)})`);
      } else {
        // Update the regular fileSize
        const newDataFileSize = oldDataFileSize + sizeDelta;
        const adjustedDataOffset = dataFileSizeOffset >= assetEnd ? dataFileSizeOffset + sizeDelta : dataFileSizeOffset;
        updatedCABData.writeUInt32LE(newDataFileSize, adjustedDataOffset);
        Logger.log(`  ✅ Updated data section fileSize from ${oldDataFileSize} to ${newDataFileSize} at adjusted offset 0x${adjustedDataOffset.toString(16)} (original: 0x${dataFileSizeOffset.toString(16)})`);
      }
    }
    
    Logger.log(`  Updated CAB size: ${updatedCABData.length} bytes`);

    // Now rebuild the AssetBundle with the updated CAB
    Logger.log("\n🏗️  Rebuilding AssetBundle...");
    
    // We'll use the same approach as rebuildAssetBundle but with in-memory CAB data
    const blockBuffers: Buffer[] = [];
    const blockInfoEntries: Buffer[] = [];

    let offsetInCAB = 0;
    for (let i = 0; i < this.blocks.length; i++) {
      const b = this.blocks[i];
      const uncompressedSize = i === this.blocks.length - 1 
        ? updatedCABData.length - offsetInCAB 
        : b.uncompressedSize;
      const flags = b.flags;

      const chunk = updatedCABData.slice(offsetInCAB, offsetInCAB + uncompressedSize);
      offsetInCAB += uncompressedSize;

      const blockCompressionMode = flags & 0x3F;
      const needsLZ4 = (blockCompressionMode === 2 || blockCompressionMode === 3);

      let finalChunk: Buffer;
      let compressedSize: number;

      if (needsLZ4) {
        const maxCompressedLen = lz4.encodeBound(uncompressedSize);
        const temp = Buffer.allocUnsafe(maxCompressedLen);
        const encodedSize = lz4.encodeBlock(chunk, temp);
        finalChunk = temp.slice(0, encodedSize);
        compressedSize = encodedSize;
      } else {
        finalChunk = chunk;
        compressedSize = uncompressedSize;
      }

      const info = Buffer.alloc(10);
      info.writeUInt32BE(uncompressedSize, 0);
      info.writeUInt32BE(compressedSize, 4);
      info.writeUInt16BE(flags, 8);

      blockBuffers.push(finalChunk);
      blockInfoEntries.push(info);
    }

    const allBlockInfo = Buffer.concat(blockInfoEntries);

    // Build directory info
    const dirCount = Buffer.alloc(4);
    dirCount.writeUInt32BE(this.directories.length);

    const d = this.directories[0];
    const dirOffsetBuffer = Buffer.alloc(8);
    dirOffsetBuffer.writeBigUInt64BE(BigInt(d.offset));

    const dirSizeBuffer = Buffer.alloc(8);
    dirSizeBuffer.writeBigUInt64BE(BigInt(updatedCABData.length));

    const dirFlagsBuffer = Buffer.alloc(4);
    dirFlagsBuffer.writeUInt32BE(d.flags);

    const pathBuffer = Buffer.concat([
      Buffer.from(d.path, "utf-8"),
      Buffer.from([0])
    ]);

    const directoryInfo = Buffer.concat([
      dirCount,
      dirOffsetBuffer,
      dirSizeBuffer,
      dirFlagsBuffer,
      pathBuffer
    ]);

    // Build GUID + block count + block info + directory info
    const guid = Buffer.from(this.guid, 'hex');
    const blockCount = Buffer.alloc(4);
    blockCount.writeUInt32BE(this.blocks.length);

    const uncompressedBlockInfoData = Buffer.concat([
      guid,
      blockCount,
      allBlockInfo,
      directoryInfo
    ]);

    // Compress the block info as LZ4
    const compressedBlockInfoBuf = Buffer.alloc(lz4.encodeBound(uncompressedBlockInfoData.length));
    const compressedBlockInfoSize = lz4.encodeBlock(uncompressedBlockInfoData, compressedBlockInfoBuf);
    const finalBlockInfo = compressedBlockInfoBuf.slice(0, compressedBlockInfoSize);

    // Build the UnityFS header
    const signature = Buffer.from("UnityFS\0", "utf-8");
    const playerVersion = Buffer.from(`${this.playerVersion}\0`, "utf-8");
    const engineVersion = Buffer.from(`${this.engineVersion}\0`, "utf-8");
    const blockInfoFlags = 0x200 | 0x40 | 3; // LZ4 + Dir + blockInfoNeedsPadding

    const versionStrings = Buffer.concat([playerVersion, engineVersion]);
    const headerLength = signature.length + 4 + versionStrings.length + 8 + 4 + 4 + 4;
    const header = Buffer.alloc(headerLength);

    let offset = 0;
    signature.copy(header, offset);
    offset += signature.length;

    header.writeUInt32BE(this.fileVersion, offset);
    offset += 4;

    versionStrings.copy(header, offset);
    offset += versionStrings.length;

    const fileSizeOffset = offset;

    // Calculate total file size
    let blocksTotalCompressedSize = 0;
    for (const bb of blockBuffers) {
      blocksTotalCompressedSize += bb.length;
    }

    const afterHeaderUnaligned = headerLength;
    const afterHeaderAligned = (afterHeaderUnaligned + 15) & ~15;
    const afterBlockInfo = afterHeaderAligned + finalBlockInfo.length;
    const afterBlockInfoAligned = (afterBlockInfo + 15) & ~15;
    const blocksStart = afterBlockInfoAligned;
    const totalSize = blocksStart + blocksTotalCompressedSize;

    header.writeBigUInt64BE(BigInt(totalSize), fileSizeOffset);
    header.writeUInt32BE(finalBlockInfo.length, fileSizeOffset + 8);
    header.writeUInt32BE(uncompressedBlockInfoData.length, fileSizeOffset + 12);
    header.writeUInt32BE(blockInfoFlags, fileSizeOffset + 16);

    // Calculate padding
    const headerPaddingSize = afterHeaderAligned - headerLength;
    const headerPadding = Buffer.alloc(headerPaddingSize);

    const blockInfoPaddingSize = afterBlockInfoAligned - afterBlockInfo;
    const blockInfoPadding = Buffer.alloc(blockInfoPaddingSize);

    // Concatenate everything
    const finalBundle = Buffer.concat([
      header,
      headerPadding,
      finalBlockInfo,
      blockInfoPadding,
      ...blockBuffers
    ]);

    // Write to disk
    await fsPromises.writeFile(outputBundlePath, finalBundle);
    Logger.log(`\n✅ Successfully wrote updated AssetBundle to: ${outputBundlePath}`);
    Logger.log(`   Final bundle size: ${finalBundle.length} bytes`);
  }
}

export { AssetBundle };
