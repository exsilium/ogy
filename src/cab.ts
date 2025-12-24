import * as fs from 'fs';
import { Buffer } from 'buffer';
import path from "path";
import { Logger } from './logger.js';
import { MAD_BUNDLE_FILES, MAD_BUNDLE_PATHS } from './mad-constants.js';
import { SerializedFile as SerializedFileWriter } from './cab-file.js';

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

/*
 * Offset    Field                    Type (size)
 * ------    -----------------------  ------------
 * 0x00      [placeholder 1]          UInt32
 * 0x04      [placeholder 2]          UInt32
 * 0x08      version                  Int32
 * 0x0C      [placeholder 3]          UInt32
 * 0x10      swapEndianess            Boolean (1 byte)
 * 0x11-0x13 align
 * 0x14      metadataSize             UInt32 (4 bytes)
 * 0x18      fileSize                 Int64 (8 bytes)
 * 0x20      dataOffset               Int64 (8 bytes)
 * 0x28      unknown22                Int64 (8 bytes)
 * 0x30      unityVersion             null-terminated string
 */
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

interface UnityObject {
  pathId: bigint;
  byteStart: bigint;
  byteSize: number;
  typeId: number;
  container?: string;
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
  
  objects: UnityObject[] = [];

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

    // CARD_Name || Card_Indx || CARD_Desc || AssetBundle, we skip ahead 180 bytes and re-read
    if(this.fileName === `${MAD_BUNDLE_PATHS.CARD_NAME}/${MAD_BUNDLE_FILES.CARD_NAME}` ||
      this.fileName === `${MAD_BUNDLE_PATHS.CARD_INDX}/${MAD_BUNDLE_FILES.CARD_INDX}` ||
      this.fileName === `${MAD_BUNDLE_PATHS.CARD_DESC}/${MAD_BUNDLE_FILES.CARD_DESC}` ||
      this.fileName === `${MAD_BUNDLE_PATHS.CARD_PART}/${MAD_BUNDLE_FILES.CARD_PART}` ||
      this.fileName === `${MAD_BUNDLE_PATHS.CARD_PIDX}/${MAD_BUNDLE_FILES.CARD_PIDX}` ||
      // Test files Card_Indx, Card_Part, Card_Pidx
      this.fileName === "e9/e9aa18bf" || this.fileName === "eb/ebaee097" || this.fileName === "49/494e34d0"
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

    let dataStart = this.reader.getPosition();

    if (this.fileType === 0 && (!this.fileName || this.fileName.length === 0)) {
      // Some CAB start with the actual file name in the data stream.
      const inlineName = this.reader.readStringToNull();
      if (inlineName.length > 0) {
        this.fileName = inlineName;
      }

      this.reader.alignStream();
      this.fileSize = this.reader.readUInt32();
      dataStart = this.reader.getPosition();

      Logger.log("New fileName: " + this.fileName);
      Logger.log("New fileSize: " + this.fileSize);
    }

    this.reader.setPosition(dataStart);
    const bytesToWrite = this.reader.readBytes(this.fileSize);

    fs.writeFileSync(path.join(outputDir, this.fileName + ".bin"), bytesToWrite);
    Logger.log("Position: " + this.reader.getPosition());
    return this.fileName;
  }
  
  getFileName(): string {
    return this.fileName;
  }

  parseObjects(): UnityObject[] {
    // Save current position
    const currentPos = this.reader.getPosition();
    
    // Go back to after header to read metadata
    this.reader.setPosition(Number(this.header.metadataSize) + 0x14);
    
    // Read objects count
    const objectCount = this.reader.readInt32();
    Logger.log(`Object count: ${objectCount}`);
    
    for (let i = 0; i < objectCount; i++) {
      const pathId = this.reader.readInt64();
      const byteStart = this.reader.readInt64();
      const byteSize = this.reader.readUInt32();
      const typeId = this.reader.readInt32();
      
      this.objects.push({
        pathId,
        byteStart,
        byteSize,
        typeId
      });
    }
    
    // Read container information if available
    // Container data is typically at the end of the metadata section
    try {
      const containerCount = this.reader.readInt32();
      if (containerCount > 0 && containerCount < 10000) {
        for (let i = 0; i < containerCount; i++) {
          const containerPath = this.reader.readStringToNull();
          this.reader.alignStream();
          const preloadIndex = this.reader.readInt32();
          const preloadSize = this.reader.readInt32();
          const assetPathId = this.reader.readInt64();
          
          // Find the object and add container path
          const obj = this.objects.find(o => o.pathId === assetPathId);
          if (obj) {
            obj.container = containerPath;
          }
        }
      }
    } catch (e) {
      // Container information might not be present
      Logger.log("No container information available");
    }
    
    // Restore position
    this.reader.setPosition(currentPos);
    
    return this.objects;
  }
  
  getTextAssetObjects(): UnityObject[] {
    // TextAsset type ID is typically 49
    return this.objects.filter(obj => obj.typeId === 49);
  }
  
  static scanForTextAssets(cabData: Buffer, targetSuffixes: string[]): string[] {
    const matches: string[] = [];
    
    try {
      // Convert buffer to string to search for container paths
      // Search the entire buffer or up to a reasonable limit
      const cabString = cabData.toString('utf8');
      
      // Look for each target suffix in the data
      for (const suffix of targetSuffixes) {
        // Search for the suffix in the string
        const index = cabString.toLowerCase().indexOf(suffix.toLowerCase());
        if (index !== -1) {
          // Found a match, try to extract the full path
          // Look backwards from the match to find the start of the path
          let startIndex = index;
          // Paths typically start with "assets/" or similar
          while (startIndex > 0 && cabString[startIndex - 1] !== '\0' && startIndex > index - 200) {
            startIndex--;
          }
          
          // Extract the path
          let endIndex = index + suffix.length;
          const containerPath = cabString.substring(startIndex, endIndex);
          
          // Clean up the path (remove any leading null bytes or non-printable characters)
          const cleanPath = containerPath.replace(/[\x00-\x1F]/g, '').trim();
          
          if (cleanPath.length > 0) {
            matches.push(cleanPath);
          }
        }
      }
    } catch (error) {
      // Silently fail - not a valid CAB or doesn't match
    }
    
    return matches;
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
  
  static scanForTextAssets(cabData: Buffer, targetSuffixes: string[]): string[] {
    return SerializedFile.scanForTextAssets(cabData, targetSuffixes);
  }

  static update(
    originalCabPath: string,
    originalExtractedAssetPath: string,
    newFilePath: string,
    outputCabPath: string
  ): void {
    Logger.log(`Updating CAB: ${originalCabPath}`);

    const originalBuffer = fs.readFileSync(originalCabPath);
    const originalExtracted = fs.readFileSync(originalExtractedAssetPath);
    const newAssetBuffer = fs.readFileSync(newFilePath);

    const reader = new EndianBinaryReader(originalBuffer);
    const header = new SerializedFileHeader(reader);

    reader.switchToLittle();
    reader.readInt32(); // targetPlatform
    reader.readBoolean(); // typeTreeEnabled
    reader.readInt32(); // typeCount

    reader.setPosition(Number(header.dataOffset));

    reader.readInt32();        // fileType
    reader.readStringToNull(); // fileName
    reader.alignStream();

    const sizeOffset = reader.getPosition();
    const oldFileSize = reader.readUInt32();
    const scanStart = reader.getPosition(); // this is our lower bound

    Logger.log(`🔍 Scanning for original encrypted asset (${originalExtracted.length} bytes)...`);

    // Scan original CAB for exact match of extracted asset
    let assetOffset = -1;
    for (let i = scanStart; i <= originalBuffer.length - originalExtracted.length; i++) {
      if (originalBuffer.slice(i, i + originalExtracted.length).equals(originalExtracted)) {
        assetOffset = i;
        break;
      }
    }

    if (assetOffset === -1) {
      throw new Error("❌ Failed to locate original asset in CAB, is the reference provided correct?");
    }

    const assetEnd = assetOffset + originalExtracted.length;

    Logger.log(`✅ Found original asset at offset 0x${assetOffset.toString(16)} (${assetOffset})`);
    Logger.log(`Old asset size: ${oldFileSize}, new asset size: ${newAssetBuffer.length}`);

    // Build new buffer with updated asset
    const newTotalSize = originalBuffer.length - originalExtracted.length + newAssetBuffer.length;
    const finalBuffer = Buffer.alloc(newTotalSize);

    originalBuffer.copy(finalBuffer, 0, 0, assetOffset); // before asset
    newAssetBuffer.copy(finalBuffer, assetOffset);       // new asset
    originalBuffer.copy(finalBuffer, assetOffset + newAssetBuffer.length, assetEnd); // after asset

    // Patch fileSize
    finalBuffer.writeUInt32LE(newAssetBuffer.length, sizeOffset);

    // Patch total CAB size
    finalBuffer.writeBigUInt64BE(BigInt(finalBuffer.length), 24);

    fs.writeFileSync(outputCabPath, finalBuffer);
    Logger.log(`✅ CAB updated and saved to: ${outputCabPath}`);
  }
}

/**
 * CAB (SerializedFile) writer that supports both same-size and different-size asset updates
 */
export class CABWriter {
  /**
   * Rebuild a CAB file with updated asset data
   * Supports both same-size and different-size updates
   *
   * @param originalCABData Original CAB file data
   * @param originalAssetData Original asset data (for finding which object to update)
   * @param newAssetData New asset data to insert
   * @returns Updated CAB file data
   */
  static rebuildCAB(
    originalCABData: Buffer,
    originalAssetData: Buffer,
    newAssetData: Buffer
  ): Buffer {
    Logger.log('\n🔧 CABWriter: Rebuilding CAB file...');
    Logger.log(`  Original CAB size: ${originalCABData.length}`);
    Logger.log(`  Original asset size: ${originalAssetData.length}`);
    Logger.log(`  New asset size: ${newAssetData.length}`);

    // If same size, use simple byte replacement (faster and safer)
    if (originalAssetData.length === newAssetData.length) {
      return this.rebuildCABSameSize(originalCABData, originalAssetData, newAssetData);
    }

    // Different size - use full SerializedFile parsing
    Logger.log(`  Asset size changed, using SerializedFile parser...`);

    try {
      // Parse the SerializedFile
      const serializedFile = new SerializedFileWriter(originalCABData);

      // Load all object data before making any modifications
      serializedFile.loadAllObjectData(originalCABData);

      // Find which object contains the asset data
      const pathId = serializedFile.findObjectByData(originalAssetData, originalCABData);

      if (pathId === null) {
        throw new Error('❌ Failed to locate asset in any object within SerializedFile');
      }

      Logger.log(`  ✅ Found asset in object with pathId: ${pathId}`);

      // Get the object
      const obj = serializedFile.objects.get(pathId)!;
      const objectData = obj.data!;

      // Find the asset within the object data and replace it
      let assetOffsetInObject = -1;
      for (let i = 0; i <= objectData.length - originalAssetData.length; i++) {
        if (objectData.slice(i, i + originalAssetData.length).equals(originalAssetData)) {
          assetOffsetInObject = i;
          break;
        }
      }

      if (assetOffsetInObject === -1) {
        throw new Error('❌ Failed to locate asset within object data');
      }

      Logger.log(`  ✅ Found asset at offset ${assetOffsetInObject} within object data`);

      // The m_Script length field is 4 bytes BEFORE the asset data
      // TextAsset structure:
      //   m_Name: aligned string (length + data + padding)
      //   m_Script: bytes array (length + data)
      // We need to update the m_Script length field when the asset size changes

      const lengthFieldOffset = assetOffsetInObject - 4;
      if (lengthFieldOffset < 0) {
        throw new Error('❌ Invalid asset offset - length field would be before object start');
      }

      // Verify the length field contains the original asset length
      const storedLength = objectData.readInt32LE(lengthFieldOffset);
      if (storedLength !== originalAssetData.length) {
        Logger.log(`  ⚠️ Length field mismatch: stored=${storedLength}, expected=${originalAssetData.length}`);
        // This might not be a TextAsset or the structure is different
        // Try to continue anyway
      } else {
        Logger.log(`  ✅ Verified m_Script length field at offset ${lengthFieldOffset}: ${storedLength}`);
      }

      // TextAsset structure:
      //   m_Name: aligned string (length + data + padding to 4)
      //   m_Script: aligned byte array (length + data + padding to 4)
      //
      // The object data ends with m_Script + its 4-byte alignment padding.
      // When we replace m_Script data, we need to recalculate the alignment.

      // Calculate old and new alignment padding for m_Script
      const oldPadding = (4 - (originalAssetData.length % 4)) % 4;
      const newPadding = (4 - (newAssetData.length % 4)) % 4;

      Logger.log(`  Old m_Script padding: ${oldPadding} bytes (size ${originalAssetData.length} % 4 = ${originalAssetData.length % 4})`);
      Logger.log(`  New m_Script padding: ${newPadding} bytes (size ${newAssetData.length} % 4 = ${newAssetData.length % 4})`);

      // Check if there's any data after m_Script + its padding
      const originalAssetEnd = assetOffsetInObject + originalAssetData.length;
      const originalObjectEnd = originalAssetEnd + oldPadding;
      const hasDataAfterScript = originalObjectEnd < objectData.length;

      if (hasDataAfterScript) {
        Logger.log(`  ⚠️ Found ${objectData.length - originalObjectEnd} bytes after m_Script+padding, will preserve`);
      }

      // Calculate new object data size:
      // = data before m_Script + length field (4) + new asset + new padding + data after (if any)
      const dataBeforeAsset = assetOffsetInObject; // includes length field
      const dataAfterScriptPadding = hasDataAfterScript ? (objectData.length - originalObjectEnd) : 0;
      const newObjectSize = dataBeforeAsset + newAssetData.length + newPadding + dataAfterScriptPadding;

      const newObjectData = Buffer.alloc(newObjectSize);

      // Copy data before asset (includes the length field, which we'll update)
      objectData.copy(newObjectData, 0, 0, assetOffsetInObject);

      // UPDATE the m_Script length field with the new asset size
      newObjectData.writeInt32LE(newAssetData.length, lengthFieldOffset);
      Logger.log(`  ✅ Updated m_Script length field: ${originalAssetData.length} -> ${newAssetData.length}`);

      // Copy new asset data
      newAssetData.copy(newObjectData, assetOffsetInObject);

      // Add new 4-byte alignment padding (zeros already from Buffer.alloc)
      const newAssetEnd = assetOffsetInObject + newAssetData.length;
      // Padding is already zeros from Buffer.alloc

      // Copy data after m_Script+padding (if any)
      if (hasDataAfterScript) {
        objectData.copy(newObjectData, newAssetEnd + newPadding, originalObjectEnd);
      }

      Logger.log(`  New object data size: ${newObjectData.length} (was ${objectData.length})`);

      // Update the object in the SerializedFile
      serializedFile.updateObject(pathId, newObjectData);

      // Serialize the SerializedFile back to binary
      Logger.log('\n📝 Serializing SerializedFile with updated object...');
      const newCABData = serializedFile.save();

      Logger.log(`\n✅ CAB rebuilt successfully`);
      Logger.log(`  Final CAB size: ${newCABData.length}`);

      return newCABData;
    } catch (error) {
      Logger.log(`\n❌ SerializedFile parsing failed: ${error}`);
      Logger.log(`  Falling back to same-size check...`);

      // If parsing failed and sizes are same, try simple replacement as fallback
      if (originalAssetData.length === newAssetData.length) {
        Logger.log(`  Sizes match, using simple byte replacement`);
        return this.rebuildCABSameSize(originalCABData, originalAssetData, newAssetData);
      }

      throw error;
    }
  }

  /**
   * Simple byte replacement for same-size updates
   */
  private static rebuildCABSameSize(
    originalCABData: Buffer,
    originalAssetData: Buffer,
    newAssetData: Buffer
  ): Buffer {
    Logger.log(`  Using simple byte replacement (same size)...`);

    // Find the asset in CAB
    let assetOffset = -1;
    for (let i = 0; i <= originalCABData.length - originalAssetData.length; i++) {
      if (originalCABData.slice(i, i + originalAssetData.length).equals(originalAssetData)) {
        assetOffset = i;
        break;
      }
    }

    if (assetOffset === -1) {
      throw new Error('❌ Failed to locate original asset in CAB');
    }

    Logger.log(`  ✅ Found asset at offset: 0x${assetOffset.toString(16)}`);

    // Create new buffer and replace asset bytes
    const newCABData = Buffer.from(originalCABData);
    newAssetData.copy(newCABData, assetOffset);

    Logger.log(`  ✅ CAB rebuilt successfully`);

    return newCABData;
  }
}
