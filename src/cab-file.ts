/**
 * Unity SerializedFile (CAB) parser and writer implementation
 * Based on UnityPy's SerializedFile functionality for proper Unity format compatibility
 */

import { Buffer } from 'buffer';
import { Logger } from './logger.js';

/**
 * Binary writer with endianness support for Unity format
 */
export class EndianBinaryWriter {
  private buffers: Buffer[] = [];
  private position: number = 0;
  private endian: string; // '>' for big-endian, '<' for little-endian

  constructor(endian: string = '>') {
    this.endian = endian;
  }

  get Length(): number {
    return this.position;
  }

  get Position(): number {
    return this.position;
  }

  get bytes(): Buffer {
    return Buffer.concat(this.buffers);
  }

  write(data: Buffer): void {
    this.buffers.push(data);
    this.position += data.length;
  }

  writeByte(value: number): void {
    const buf = Buffer.allocUnsafe(1);
    buf.writeInt8(value, 0);
    this.write(buf);
  }

  writeUByte(value: number): void {
    const buf = Buffer.allocUnsafe(1);
    buf.writeUInt8(value, 0);
    this.write(buf);
  }

  writeBytes(value: Buffer): void {
    this.write(value);
  }

  writeShort(value: number): void {
    const buf = Buffer.allocUnsafe(2);
    if (this.endian === '<') {
      buf.writeInt16LE(value, 0);
    } else {
      buf.writeInt16BE(value, 0);
    }
    this.write(buf);
  }

  writeInt(value: number): void {
    const buf = Buffer.allocUnsafe(4);
    if (this.endian === '<') {
      buf.writeInt32LE(value, 0);
    } else {
      buf.writeInt32BE(value, 0);
    }
    this.write(buf);
  }

  writeLong(value: bigint): void {
    const buf = Buffer.allocUnsafe(8);
    if (this.endian === '<') {
      buf.writeBigInt64LE(value, 0);
    } else {
      buf.writeBigInt64BE(value, 0);
    }
    this.write(buf);
  }

  writeUShort(value: number): void {
    const buf = Buffer.allocUnsafe(2);
    if (this.endian === '<') {
      buf.writeUInt16LE(value, 0);
    } else {
      buf.writeUInt16BE(value, 0);
    }
    this.write(buf);
  }

  writeUInt(value: number): void {
    const buf = Buffer.allocUnsafe(4);
    if (this.endian === '<') {
      buf.writeUInt32LE(value, 0);
    } else {
      buf.writeUInt32BE(value, 0);
    }
    this.write(buf);
  }

  writeULong(value: bigint): void {
    const buf = Buffer.allocUnsafe(8);
    if (this.endian === '<') {
      buf.writeBigUInt64LE(value, 0);
    } else {
      buf.writeBigUInt64BE(value, 0);
    }
    this.write(buf);
  }

  writeBoolean(value: boolean): void {
    this.writeUByte(value ? 1 : 0);
  }

  writeStringToNull(value: string): void {
    const buf = Buffer.from(value + '\0', 'utf8');
    this.write(buf);
  }

  alignStream(alignment: number = 4): void {
    const pos = this.position;
    const align = (alignment - (pos % alignment)) % alignment;
    if (align > 0) {
      this.write(Buffer.alloc(align));
    }
  }

  writeIntArray(values: number[], writeLength: boolean = false): void {
    if (writeLength) {
      this.writeInt(values.length);
    }
    for (const val of values) {
      this.writeInt(val);
    }
  }
}

/**
 * Binary reader with endianness support
 */
export class EndianBinaryReader {
  private buffer: Buffer;
  private position: number = 0;
  public endian: string; // '>' for big-endian, '<' for little-endian

  constructor(buffer: Buffer, endian: string = '>') {
    this.buffer = buffer;
    this.endian = endian;
  }

  get Position(): number {
    return this.position;
  }

  set Position(pos: number) {
    this.position = pos;
  }

  readByte(): number {
    const value = this.buffer.readInt8(this.position);
    this.position += 1;
    return value;
  }

  readUByte(): number {
    const value = this.buffer.readUInt8(this.position);
    this.position += 1;
    return value;
  }

  readBoolean(): boolean {
    return this.readUByte() !== 0;
  }

  readShort(): number {
    const value = this.endian === '<'
      ? this.buffer.readInt16LE(this.position)
      : this.buffer.readInt16BE(this.position);
    this.position += 2;
    return value;
  }

  readInt(): number {
    const value = this.endian === '<'
      ? this.buffer.readInt32LE(this.position)
      : this.buffer.readInt32BE(this.position);
    this.position += 4;
    return value;
  }

  readLong(): bigint {
    const value = this.endian === '<'
      ? this.buffer.readBigInt64LE(this.position)
      : this.buffer.readBigInt64BE(this.position);
    this.position += 8;
    return value;
  }

  readUInt(): number {
    const value = this.endian === '<'
      ? this.buffer.readUInt32LE(this.position)
      : this.buffer.readUInt32BE(this.position);
    this.position += 4;
    return value;
  }

  readULong(): bigint {
    const value = this.endian === '<'
      ? this.buffer.readBigUInt64LE(this.position)
      : this.buffer.readBigUInt64BE(this.position);
    this.position += 8;
    return value;
  }

  readUShort(): number {
    const value = this.endian === '<'
      ? this.buffer.readUInt16LE(this.position)
      : this.buffer.readUInt16BE(this.position);
    this.position += 2;
    return value;
  }

  readBytes(length: number): Buffer {
    const bytes = this.buffer.slice(this.position, this.position + length);
    this.position += length;
    return bytes;
  }

  readStringToNull(): string {
    const start = this.position;
    let end = start;
    while (this.buffer[end] !== 0 && end < this.buffer.length) end++;
    this.position = end + 1; // Skip null terminator
    return this.buffer.toString('utf8', start, end);
  }

  readUIntArray(): number[] {
    const count = this.readInt();
    const arr: number[] = [];
    for (let i = 0; i < count; i++) {
      arr.push(this.readUInt());
    }
    return arr;
  }

  alignStream(alignment: number = 4): void {
    const pos = this.position;
    const align = (alignment - (pos % alignment)) % alignment;
    this.position += align;
  }

  read(length: number): Buffer {
    return this.readBytes(length);
  }
}

/**
 * SerializedFile header structure
 */
interface SerializedFileHeader {
  metadataSize: number;
  fileSize: bigint;
  version: number;
  dataOffset: bigint;
  endian: string;
  reserved: Buffer;
}

/**
 * Type definition in SerializedFile
 */
interface SerializedType {
  classId: number;
  isStrippedType?: boolean;
  scriptTypeIndex: number;
  scriptId?: Buffer;
  oldTypeHash?: Buffer;
  typeDependencies?: number[];
  // Ref type fields (version >= 21)
  className?: string;
  nameSpace?: string;
  assemblyName?: string;
  // Raw type tree data (to preserve for writing)
  typeTreeData?: Buffer;
}

/**
 * Object record in SerializedFile
 */
interface ObjectInfo {
  pathId: bigint;
  byteStart: bigint;
  byteSize: number;
  typeId: number;
  classId?: number;
  isDestroyed?: number;
  stripped?: number;
  data?: Buffer;
}

/**
 * External file reference
 */
interface FileIdentifier {
  tempEmpty?: string;
  guid?: Buffer;
  type?: number;
  path: string;
}

/**
 * Script type reference
 */
interface LocalSerializedObjectIdentifier {
  localSerializedFileIndex: number;
  localIdentifierInFile: bigint;
}

/**
 * Complete SerializedFile (CAB) representation
 */
export class SerializedFile {
  header!: SerializedFileHeader;
  unityVersion: string;
  targetPlatform: number;
  enableTypeTree: boolean;
  types: SerializedType[];
  bigIdEnabled: number;
  objects: Map<bigint, ObjectInfo>;
  scriptTypes: LocalSerializedObjectIdentifier[];
  externals: FileIdentifier[];
  refTypes?: SerializedType[];
  userInformation?: string;
  unknown: bigint;

  constructor(data: Buffer) {
    this.objects = new Map();
    this.types = [];
    this.scriptTypes = [];
    this.externals = [];
    this.bigIdEnabled = 0;
    this.enableTypeTree = true;
    this.targetPlatform = 0;
    this.unityVersion = '';
    this.unknown = BigInt(0);

    this.parse(data);
  }

  private readSerializedType(reader: EndianBinaryReader, isRefType: boolean): SerializedType {
    const version = this.header.version;
    const type: SerializedType = {
      classId: reader.readInt(),
      scriptTypeIndex: -1
    };

    if (version >= 16) {
      type.isStrippedType = reader.readBoolean();
    }

    if (version >= 17) {
      type.scriptTypeIndex = reader.readShort();
    }

    if (version >= 13) {
      const needsHash = (isRefType && type.scriptTypeIndex >= 0) ||
                       (version < 16 && type.classId < 0) ||
                       (version >= 16 && type.classId === 114);
      
      if (needsHash) {
        type.scriptId = reader.readBytes(16);
      }
      type.oldTypeHash = reader.readBytes(16);
    }

    // Parse type tree if enabled
    if (this.enableTypeTree) {
      if (version >= 12 || version === 10) {
        type.typeTreeData = this.parseTypeTreeBlob(reader);
      } else {
        type.typeTreeData = this.parseTypeTree(reader);
      }

      // Version 21+ has additional ref type data
      if (version >= 21) {
        if (isRefType) {
          type.className = reader.readStringToNull();
          type.nameSpace = reader.readStringToNull();
          type.assemblyName = reader.readStringToNull();
        } else {
          // Read type dependencies as int array
          const length = reader.readInt();
          type.typeDependencies = [];
          for (let i = 0; i < length; i++) {
            type.typeDependencies.push(reader.readInt());
          }
        }
      }
    }

    return type;
  }

  private parseTypeTreeBlob(reader: EndianBinaryReader): Buffer {
    // Parse type tree blob format (version >= 12 or version == 10)
    const startPos = reader.Position;
    const nodeCount = reader.readInt();
    const stringBufferSize = reader.readInt();

    // Calculate node struct size based on version
    const version = this.header.version;
    let nodeSize: number;
    
    if (version >= 19) {
      nodeSize = 32; // m_Version, m_Level, m_TypeFlags, m_TypeStrOffset, m_NameStrOffset, m_ByteSize, m_Index, m_MetaFlag
    } else if (version >= 17) {
      nodeSize = 28; // No m_RefTypeHash
    } else {
      nodeSize = 24;
    }

    // Skip node data and string buffer
    reader.Position += nodeSize * nodeCount + stringBufferSize;
    
    // Return the complete type tree blob data
    const endPos = reader.Position;
    const blobSize = endPos - startPos;
    reader.Position = startPos;
    const typeTreeData = reader.readBytes(blobSize);
    return typeTreeData;
  }

  private parseTypeTree(reader: EndianBinaryReader): Buffer {
    // Parse type tree format (version < 12 and version != 10)
    // This is a recursive structure, so we capture it as raw data
    const startPos = reader.Position;
    this.parseTypeTreeRecursive(reader);
    const endPos = reader.Position;
    
    // Return the complete type tree data
    const treeSize = endPos - startPos;
    reader.Position = startPos;
    const typeTreeData = reader.readBytes(treeSize);
    return typeTreeData;
  }
  
  private parseTypeTreeRecursive(reader: EndianBinaryReader): void {
    const version = this.header.version;
    
    // Read type
    reader.readStringToNull();
    // Read name
    reader.readStringToNull();
    // Read byte size
    reader.readInt();
    
    if (version === 2) {
      reader.readInt(); // variable count
    }
    
    if (version !== 3) {
      reader.readInt(); // index
    }
    
    // Read type flags
    reader.readInt();
    // Read version
    reader.readInt();
    
    if (version !== 3) {
      reader.readInt(); // meta flag
    }
    
    // Read children count
    const childrenCount = reader.readInt();
    
    // Recursively read children
    for (let i = 0; i < childrenCount; i++) {
      this.parseTypeTreeRecursive(reader);
    }
  }

  private readFileIdentifier(reader: EndianBinaryReader): FileIdentifier {
    const version = this.header.version;
    const fileId: FileIdentifier = {
      path: '',
      guid: Buffer.alloc(0),
      type: 0
    };

    if (version >= 6) {
      fileId.tempEmpty = reader.readStringToNull();
    }

    if (version >= 5) {
      fileId.guid = reader.readBytes(16);
      fileId.type = reader.readInt();
    }

    fileId.path = reader.readStringToNull();

    return fileId;
  }

  private parse(data: Buffer): void {
    const reader = new EndianBinaryReader(data, '>');

    // Read header
    const metadataSize = reader.readUInt();
    const fileSize = reader.readUInt();
    const version = reader.readUInt();
    const dataOffset = reader.readUInt();

    this.header = {
      metadataSize,
      fileSize: BigInt(fileSize),
      version,
      dataOffset: BigInt(dataOffset),
      endian: '>',
      reserved: Buffer.alloc(0)
    };

    if (version >= 9) {
      this.header.endian = reader.readBoolean() ? '>' : '<';
      this.header.reserved = reader.readBytes(3);
      
      if (version >= 22) {
        this.header.metadataSize = reader.readUInt();
        this.header.fileSize = reader.readLong();
        this.header.dataOffset = reader.readLong();
        this.unknown = reader.readLong();
      }
    } else {
      reader.Position = Number(this.header.fileSize) - this.header.metadataSize;
      this.header.endian = reader.readBoolean() ? '>' : '<';
    }

    // Switch to correct endianness for metadata
    reader.endian = this.header.endian;

    // Read unity version
    if (version >= 7) {
      this.unityVersion = reader.readStringToNull();
    }

    // Read target platform
    if (version >= 8) {
      this.targetPlatform = reader.readInt();
    }

    // Read type tree enabled flag
    if (version >= 13) {
      this.enableTypeTree = reader.readBoolean();
      Logger.log(`📋 SerializedFile: Type tree enabled = ${this.enableTypeTree}`);
    }

    // Read types
    const typeCount = reader.readInt();
    this.types = [];
    for (let i = 0; i < typeCount; i++) {
      const type = this.readSerializedType(reader, false);
      this.types.push(type);
    }

    // Read big ID enabled flag
    if (version >= 7 && version < 14) {
      this.bigIdEnabled = reader.readInt();
    }

    // Read objects
    const objectCount = reader.readInt();
    for (let i = 0; i < objectCount; i++) {
      const obj = this.readObjectInfo(reader);
      this.objects.set(obj.pathId, obj);
    }

    // Read script types
    if (version >= 11) {
      const scriptCount = reader.readInt();
      for (let i = 0; i < scriptCount; i++) {
        const script: LocalSerializedObjectIdentifier = {
          localSerializedFileIndex: reader.readInt(),
          localIdentifierInFile: version < 14 ? BigInt(reader.readInt()) : (reader.alignStream(), reader.readLong())
        };
        this.scriptTypes.push(script);
      }
    }

    // Read externals
    const externalCount = reader.readInt();
    for (let i = 0; i < externalCount; i++) {
      this.externals.push(this.readFileIdentifier(reader));
    }

    // Read ref types
    if (version >= 20) {
      const refTypeCount = reader.readInt();
      this.refTypes = [];
      for (let i = 0; i < refTypeCount; i++) {
        this.refTypes.push(this.readSerializedType(reader, true));
      }
    }

    // Read user information
    if (version >= 5) {
      this.userInformation = reader.readStringToNull();
    }

    Logger.log('📋 SerializedFile parsed successfully');
    Logger.log(`  Unity Version: ${this.unityVersion}`);
    Logger.log(`  Format Version: ${version}`);
    Logger.log(`  Object count: ${this.objects.size}`);
    Logger.log(`  Type count: ${this.types.length}`);
  }

  private readObjectInfo(reader: EndianBinaryReader): ObjectInfo {
    const version = this.header.version;
    
    let pathId: bigint;
    if (this.bigIdEnabled) {
      pathId = reader.readLong();
    } else if (version < 14) {
      pathId = BigInt(reader.readInt());
    } else {
      reader.alignStream();
      pathId = reader.readLong();
    }

    const byteStart = version >= 22 
      ? reader.readLong()
      : BigInt(reader.readUInt());
    
    const byteSize = reader.readUInt();
    const typeId = reader.readInt();

    const obj: ObjectInfo = {
      pathId,
      byteStart: byteStart + this.header.dataOffset,
      byteSize,
      typeId
    };

    if (version < 16) {
      obj.classId = reader.readUShort();
    }

    if (version < 11) {
      obj.isDestroyed = reader.readUShort();
    }

    if (version >= 11 && version < 17) {
      const scriptTypeIndex = reader.readShort();
      // Store this in type if needed
    }

    if (version === 15 || version === 16) {
      obj.stripped = reader.readByte();
    }

    return obj;
  }

  /**
   * Save the SerializedFile with updated object data
   */
  save(): Buffer {
    const version = this.header.version;
    const header = this.header;
    
    // Create writers for metadata and data sections
    const metaWriter = new EndianBinaryWriter(header.endian);
    const dataWriter = new EndianBinaryWriter(header.endian);

    // Write unity version
    if (version >= 7) {
      metaWriter.writeStringToNull(this.unityVersion);
    }

    // Write target platform
    if (version >= 8) {
      metaWriter.writeInt(this.targetPlatform);
    }

    // Write type tree enabled
    if (version >= 13) {
      metaWriter.writeBoolean(this.enableTypeTree);
    }

    // Write types (we preserve the original data)
    metaWriter.writeInt(this.types.length);
    Logger.log(`📋 SerializedFile.save(): Writing ${this.types.length} types, enableTypeTree=${this.enableTypeTree}`);
    for (const type of this.types) {
      const startPos = metaWriter.Position;
      metaWriter.writeInt(type.classId);
      
      if (version >= 16 && type.isStrippedType !== undefined) {
        metaWriter.writeBoolean(type.isStrippedType);
      }
      
      if (version >= 17) {
        metaWriter.writeShort(type.scriptTypeIndex);
      }
      
      if (version >= 13) {
        const needsHash = (version < 16 && type.classId < 0) ||
                         (version >= 16 && type.classId === 114) ||
                         (type.scriptTypeIndex >= 0);
        
        if (needsHash && type.scriptId) {
          metaWriter.writeBytes(type.scriptId);
        }
        if (type.oldTypeHash) {
          metaWriter.writeBytes(type.oldTypeHash);
        }
      }

      // Write type tree if enabled
      if (this.enableTypeTree && type.typeTreeData) {
        metaWriter.writeBytes(type.typeTreeData);
        
        // Write version 21+ ref type data
        if (version >= 21) {
          if (type.className !== undefined) {
            // This is a ref type
            metaWriter.writeStringToNull(type.className);
            metaWriter.writeStringToNull(type.nameSpace!);
            metaWriter.writeStringToNull(type.assemblyName!);
          } else if (type.typeDependencies !== undefined) {
            // Write type dependencies
            metaWriter.writeInt(type.typeDependencies.length);
            for (const dep of type.typeDependencies) {
              metaWriter.writeInt(dep);
            }
          }
        }
      }
    }

    // Write big ID enabled
    if (version >= 7 && version < 14) {
      metaWriter.writeInt(this.bigIdEnabled);
    }

    // Write objects
    metaWriter.writeInt(this.objects.size);
    for (const obj of this.objects.values()) {
      this.writeObjectInfo(obj, header, metaWriter, dataWriter);
      dataWriter.alignStream(8);
    }

    // Write script types
    if (version >= 11) {
      metaWriter.writeInt(this.scriptTypes.length);
      for (const script of this.scriptTypes) {
        metaWriter.writeInt(script.localSerializedFileIndex);
        if (version < 14) {
          metaWriter.writeInt(Number(script.localIdentifierInFile));
        } else {
          metaWriter.alignStream();
          metaWriter.writeLong(script.localIdentifierInFile);
        }
      }
    }

    // Write externals
    metaWriter.writeInt(this.externals.length);
    for (const external of this.externals) {
      if (version >= 6 && external.tempEmpty !== undefined) {
        metaWriter.writeStringToNull(external.tempEmpty);
      }
      if (version >= 5) {
        if (external.guid) metaWriter.writeBytes(external.guid);
        if (external.type !== undefined) metaWriter.writeInt(external.type);
      }
      metaWriter.writeStringToNull(external.path);
    }

    // Write ref types
    if (version >= 20 && this.refTypes) {
      metaWriter.writeInt(this.refTypes.length);
      // Write ref types...
    }

    // Write user information
    if (version >= 5 && this.userInformation !== undefined) {
      metaWriter.writeStringToNull(this.userInformation);
    }

    // Build final file
    const writer = new EndianBinaryWriter('>');
    const headerSize = 16;
    const metadataSize = metaWriter.Length;
    const dataSize = dataWriter.Length;

    if (version >= 9) {
      const extraHeaderSize = version < 22 ? 4 : 32;
      const totalHeaderSize = headerSize + extraHeaderSize;
      const dataOffset = totalHeaderSize + metadataSize;
      const alignedDataOffset = dataOffset + ((16 - (dataOffset % 16)) % 16);
      const fileSize = alignedDataOffset + dataSize;

      if (version < 22) {
        writer.writeUInt(metadataSize);
        writer.writeUInt(fileSize);
        writer.writeUInt(version);
        writer.writeUInt(alignedDataOffset);
        writer.writeBoolean(header.endian === '>');
        writer.writeBytes(header.reserved);
      } else {
        // Old header
        writer.writeUInt(0);
        writer.writeUInt(0);
        writer.writeUInt(version);
        writer.writeUInt(0);
        writer.writeBoolean(header.endian === '>');
        writer.writeBytes(header.reserved);
        writer.writeUInt(metadataSize);
        writer.writeLong(BigInt(fileSize));
        writer.writeLong(BigInt(alignedDataOffset));
        writer.writeLong(this.unknown);
      }

      writer.writeBytes(metaWriter.bytes);
      writer.alignStream(16);
      writer.writeBytes(dataWriter.bytes);
    } else {
      const metadataSizeWithEndian = metadataSize + 1;
      const fileSize = headerSize + metadataSizeWithEndian + dataSize;
      
      writer.writeUInt(metadataSizeWithEndian);
      writer.writeUInt(fileSize);
      writer.writeUInt(version);
      writer.writeUInt(32); // data offset
      writer.writeBytes(dataWriter.bytes);
      writer.writeBoolean(header.endian === '>');
      writer.writeBytes(metaWriter.bytes);
    }

    return writer.bytes;
  }

  private writeObjectInfo(
    obj: ObjectInfo,
    header: SerializedFileHeader,
    metaWriter: EndianBinaryWriter,
    dataWriter: EndianBinaryWriter
  ): void {
    const version = header.version;

    // Write path ID
    if (this.bigIdEnabled) {
      metaWriter.writeLong(obj.pathId);
    } else if (version < 14) {
      metaWriter.writeInt(Number(obj.pathId));
    } else {
      metaWriter.alignStream();
      metaWriter.writeLong(obj.pathId);
    }

    // Write byte start (relative to data section)
    if (version >= 22) {
      metaWriter.writeLong(BigInt(dataWriter.Position));
    } else {
      metaWriter.writeUInt(dataWriter.Position);
    }

    // Write data and byte size
    const data = obj.data!;
    metaWriter.writeUInt(data.length);
    dataWriter.writeBytes(data);

    // Write type ID
    metaWriter.writeInt(obj.typeId);

    // Write class ID (for older versions)
    if (version < 16 && obj.classId !== undefined) {
      metaWriter.writeUShort(obj.classId);
    }

    // Write is destroyed
    if (version < 11 && obj.isDestroyed !== undefined) {
      metaWriter.writeUShort(obj.isDestroyed);
    }

    // Write script type index
    if (version >= 11 && version < 17) {
      // Get from type if needed
      const type = this.types[obj.typeId];
      if (type) {
        metaWriter.writeShort(type.scriptTypeIndex);
      } else {
        metaWriter.writeShort(-1);
      }
    }

    // Write stripped
    if ((version === 15 || version === 16) && obj.stripped !== undefined) {
      metaWriter.writeByte(obj.stripped);
    }
  }

  /**
   * Update object data for a specific pathId
   */
  updateObject(pathId: bigint, newData: Buffer): void {
    const obj = this.objects.get(pathId);
    if (!obj) {
      throw new Error(`Object with pathId ${pathId} not found`);
    }
    
    obj.data = newData;
    obj.byteSize = newData.length;
    
    Logger.log(`✅ Updated object ${pathId} with ${newData.length} bytes`);
  }

  /**
   * Load all object data from the original buffer
   * Must be called before save() to ensure all object data is available
   */
  loadAllObjectData(fullData: Buffer): void {
    for (const obj of this.objects.values()) {
      if (!obj.data) {
        obj.data = fullData.slice(Number(obj.byteStart), Number(obj.byteStart) + obj.byteSize);
      }
    }
    Logger.log(`✅ Loaded data for ${this.objects.size} objects`);
  }

  /**
   * Find object by scanning data section
   */
  findObjectByData(originalData: Buffer, fullData: Buffer): bigint | null {
    // Find which object contains this data
    for (const [pathId, obj] of this.objects.entries()) {
      const objData = fullData.slice(Number(obj.byteStart), Number(obj.byteStart) + obj.byteSize);
      
      // Check if this object contains the original data
      for (let i = 0; i <= objData.length - originalData.length; i++) {
        if (objData.slice(i, i + originalData.length).equals(originalData)) {
          // Found it! Extract and store the object data
          obj.data = objData;
          return pathId;
        }
      }
    }
    return null;
  }
}
