import * as fs from 'fs';
import * as path from 'path';

interface NDSHeader {
  gameTitle: string;
  gameCode: string;
  makerCode: string;
  unitCode: number;
  encryptionSeedSelect: number;
  deviceCapacity: number;
  reserved: Buffer;
  romVersion: number;
  internalFlags: number;
  arm9RomOffset: number;
  arm9EntryAddress: number;
  arm9RamAddress: number;
  arm9Size: number;
  arm7RomOffset: number;
  arm7EntryAddress: number;
  arm7RamAddress: number;
  arm7Size: number;
  fntOffset: number;
  fntSize: number;
  fatOffset: number;
  fatSize: number;
  arm9OverlayOffset: number;
  arm9OverlaySize: number;
  arm7OverlayOffset: number;
  arm7OverlaySize: number;
  normalCardControlRegisterSettings: number;
  secureCardControlRegisterSettings: number;
  iconBannerOffset: number;
  secureAreaChecksum: number;
  secureAreaDelay: number;
  arm9Autoload: number;
  arm7Autoload: number;
  secureDisable: bigint;
  ntrRegionRomSize: number;
  ntrRegionRomHeaderSize: number;
  reserved2: Buffer;
  logo: Buffer;
  logoChecksum: number;
  headerChecksum: number;
  debugReserved: Buffer;
}

interface FATEntry {
  startOffset: number;
  endOffset: number;
}

interface FNTEntry {
  name: string;
  id: number;
  isDirectory: boolean;
  children?: FNTEntry[];
}

export class NDSHandler {
  private ndsData: Buffer;
  private header: NDSHeader;
  private fatEntries: FATEntry[];
  private fntEntries: FNTEntry[];
  private fileIdCounter: number = 0; // Counter for file IDs

  constructor(private filePath: string) {
    this.ndsData = fs.readFileSync(this.filePath);
    this.header = this.parseHeader();
    this.fatEntries = this.parseFAT();
    this.fntEntries = this.parseFNT();
  }

  /** Parses the NDS header */
  private parseHeader(): NDSHeader {
    const data = this.ndsData;
    const header: NDSHeader = {
      gameTitle: data.toString('ascii', 0x00, 0x0C).replace(/\0/g, ''),
      gameCode: data.toString('ascii', 0x0C, 0x10),
      makerCode: data.toString('ascii', 0x10, 0x12),
      unitCode: data.readUInt8(0x12),
      encryptionSeedSelect: data.readUInt8(0x13),
      deviceCapacity: data.readUInt8(0x14),
      reserved: data.slice(0x15, 0x1E),
      romVersion: data.readUInt8(0x1E),
      internalFlags: data.readUInt8(0x1F),
      arm9RomOffset: data.readUInt32LE(0x20),
      arm9EntryAddress: data.readUInt32LE(0x24),
      arm9RamAddress: data.readUInt32LE(0x28),
      arm9Size: data.readUInt32LE(0x2C),
      arm7RomOffset: data.readUInt32LE(0x30),
      arm7EntryAddress: data.readUInt32LE(0x34),
      arm7RamAddress: data.readUInt32LE(0x38),
      arm7Size: data.readUInt32LE(0x3C),
      fntOffset: data.readUInt32LE(0x40),
      fntSize: data.readUInt32LE(0x44),
      fatOffset: data.readUInt32LE(0x48),
      fatSize: data.readUInt32LE(0x4C),
      arm9OverlayOffset: data.readUInt32LE(0x50),
      arm9OverlaySize: data.readUInt32LE(0x54),
      arm7OverlayOffset: data.readUInt32LE(0x58),
      arm7OverlaySize: data.readUInt32LE(0x5C),
      normalCardControlRegisterSettings: data.readUInt32LE(0x60),
      secureCardControlRegisterSettings: data.readUInt32LE(0x64),
      iconBannerOffset: data.readUInt32LE(0x68),
      secureAreaChecksum: data.readUInt16LE(0x6C),
      secureAreaDelay: data.readUInt16LE(0x6E),
      arm9Autoload: data.readUInt32LE(0x70),
      arm7Autoload: data.readUInt32LE(0x74),
      secureDisable: data.readBigUInt64LE(0x78),
      ntrRegionRomSize: data.readUInt32LE(0x80),
      ntrRegionRomHeaderSize: data.readUInt32LE(0x84),
      reserved2: data.slice(0x88, 0xC0),
      logo: data.slice(0xC0, 0x15C),
      logoChecksum: data.readUInt16LE(0x15C),
      headerChecksum: data.readUInt16LE(0x15E),
      debugReserved: data.slice(0x160, 0x180),
    };
    console.log('Parsed NDS Header:', header);
    return header;
  }

  /** Parses the File Allocation Table (FAT) */
  private parseFAT(): FATEntry[] {
    const data = this.ndsData;
    const fatOffset = this.header.fatOffset;
    const fatSize = this.header.fatSize;
    const entries: FATEntry[] = [];

    console.log(`Parsing FAT at offset: ${fatOffset}, size: ${fatSize}`);

    for (let i = 0; i < fatSize; i += 8) {
      const start = data.readUInt32LE(fatOffset + i);
      const end = data.readUInt32LE(fatOffset + i + 4);
      console.log(`FAT Entry ${i / 8}: start=${start}, end=${end}`);
      entries.push({ startOffset: start, endOffset: end });
    }

    return entries;
  }

  private parseFNT(): FNTEntry[] {
    const data = this.ndsData;
    const fntOffset = this.header.fntOffset;
    const fntSize = this.header.fntSize;
    const maxOffset = fntOffset + fntSize;

    const directoryRecords: {
      id: number;
      firstFileId: number;
      parentId: number;
      nameOffset: number;
    }[] = [];

    // Parse Directory Records
    let dirId = 0;
    let dirOffset = fntOffset;

    // Calculate the number of directory records
    const directoryCount = Math.floor(fntSize / 8);

    for (dirId = 0; dirId < directoryCount; dirId++) {
      dirOffset = fntOffset + dirId * 8;

      const entryStart = data.readUInt32LE(dirOffset);
      const topFileId = data.readUInt16LE(dirOffset + 4);
      const parentId = data.readUInt16LE(dirOffset + 6) & 0xFFF; // Mask parentId

      // Log directory record for debugging
      console.log(
        `Directory Record: id=${dirId}, entryStart=${entryStart}, topFileId=${topFileId}, parentId=${parentId}`
      );

      directoryRecords.push({
        id: dirId,
        firstFileId: topFileId,
        parentId,
        nameOffset: entryStart,
      });
    }

    // Recursive function to parse directories and files
    const parseDirectory = (dirId: number, prefix: string): FNTEntry[] => {
      const maskedDirId = dirId & 0xFFF; // Mask dirId
      const dirRecord = directoryRecords[maskedDirId];
      if (!dirRecord) {
        console.error(`No directory record found for dirId: ${dirId}`);
        return [];
      }

      let entries: FNTEntry[] = [];
      let currentFileId = dirRecord.firstFileId;
      let offset = this.header.fntOffset + dirRecord.nameOffset;

      // Parsing entries within the current directory
      while (offset < maxOffset) {
        const entryTypeLength = data.readUInt8(offset++);
        if (entryTypeLength === 0) break; // End of directory entries

        const isDirectory = (entryTypeLength & 0x80) !== 0;
        const nameLength = entryTypeLength & 0x7F;
        const name = data.toString('ascii', offset, offset + nameLength);
        offset += nameLength;

        if (isDirectory) {
          const subDirId = data.readUInt16LE(offset) & 0xFFF; // Mask subDirId
          offset += 2;

          if (subDirId < directoryRecords.length) {
            console.log(`Directory found: ${name}, id=${subDirId}, prefix=${prefix}`);
            const children = parseDirectory(subDirId, `${prefix}${name}/`);
            entries.push({ name, id: subDirId, isDirectory: true, children });
          } else {
            console.warn(`Skipping out-of-range sub-directory ID: ${subDirId} for ${name}`);
          }
        } else {
          if (currentFileId < this.fatEntries.length) {
            console.log(`File found: ${name}, id=${currentFileId}, prefix=${prefix}`);
            entries.push({ name, id: currentFileId, isDirectory: false });
            currentFileId++;
          } else {
            console.warn(`Skipping out-of-bounds file ID: ${currentFileId} for ${name}`);
          }
        }
      }

      return entries;
    };

    // Start parsing from the root directory
    const rootEntries = parseDirectory(0, '/');
    console.log('Parsed FNT Entries:', rootEntries);
    return rootEntries;
  }

  /** Extracts files from the NDS ROM */
  public extractFiles(outputDir: string): void {
    fs.mkdirSync(outputDir, { recursive: true });

    const extractEntry = (entries: FNTEntry[], currentPath: string) => {
      entries.forEach(entry => {
        const fullPath = path.join(currentPath, entry.name);
        if (entry.isDirectory) {
          console.log(`Creating directory: ${fullPath}`);
          fs.mkdirSync(fullPath, { recursive: true });
          if (entry.children) {
            extractEntry(entry.children, fullPath);
          }
        } else {
          const fatEntry = this.fatEntries[entry.id];
          if (!fatEntry) {
            console.error(`No FAT entry found for file id: ${entry.id}`);
            return;
          }
          const fileData = this.ndsData.slice(fatEntry.startOffset, fatEntry.endOffset);
          console.log(`Extracting file: ${fullPath}, size: ${fileData.length}`);
          fs.writeFileSync(fullPath, fileData);
        }
      });
    };

    extractEntry(this.fntEntries, outputDir);
  }

  /** Replaces a file in the NDS ROM by filename */
  public replaceFileByName(fileName: string, newFilePath: string): void {
    const entry = this.findFNTEntryByName(fileName, this.fntEntries);
    if (!entry) {
      console.error(`File "${fileName}" not found in NDS ROM.`);
      return;
    }

    if (entry.isDirectory) {
      console.error(`"${fileName}" is a directory.`);
      return;
    }

    const newData = fs.readFileSync(newFilePath);
    const fatEntry = this.fatEntries[entry.id];
    const originalSize = fatEntry.endOffset - fatEntry.startOffset;

    if (newData.length > originalSize) {
      console.error('New file size must not exceed the original file size.');
      return;
    }

    newData.copy(this.ndsData, fatEntry.startOffset);

    if (newData.length < originalSize) {
      this.ndsData.fill(0, fatEntry.startOffset + newData.length, fatEntry.endOffset);
    }

    console.log(`Replaced "${fileName}" successfully.`);
  }

  /** Saves the modified NDS ROM */
  public saveModifiedROM(outputPath: string): void {
    fs.writeFileSync(outputPath, this.ndsData);
    console.log(`Modified NDS ROM saved to "${outputPath}".`);
  }

  /** Helper function to find an FNT entry by name */
  private findFNTEntryByName(fileName: string, entries: FNTEntry[], currentPath = ''): FNTEntry | null {
    for (const entry of entries) {
      const entryPath = path.join(currentPath, entry.name);
      if (entry.isDirectory) {
        const result = this.findFNTEntryByName(fileName, entry.children || [], entryPath);
        if (result) return result;
      } else {
        if (entryPath === fileName) {
          return entry;
        }
      }
    }
    return null;
  }

  /** Updates checksums in the header */
  private updateChecksums(): void {
    const headerChecksum = this.calculateHeaderChecksum();
    this.ndsData.writeUInt16LE(headerChecksum, 0x15E);

    const logoChecksum = this.calculateLogoChecksum();
    this.ndsData.writeUInt16LE(logoChecksum, 0x15C);
  }

  /** Calculates the header checksum */
  private calculateHeaderChecksum(): number {
    let checksum = 0;
    for (let i = 0; i < 0x15E; i += 2) {
      checksum = (checksum + this.ndsData.readUInt16LE(i)) & 0xFFFF;
    }
    return 0xFFFF - checksum;
  }

  /** Calculates the logo checksum */
  private calculateLogoChecksum(): number {
    let checksum = 0;
    for (let i = 0xC0; i < 0x15C; i += 2) {
      checksum = (checksum + this.ndsData.readUInt16LE(i)) & 0xFFFF;
    }
    return 0xFFFF - checksum;
  }

  /** Rebuilds the NDS ROM after modifications */
  public rebuildNDS(outputPath: string): void {
    this.updateChecksums();
    this.saveModifiedROM(outputPath);
  }
}
