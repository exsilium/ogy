import * as fs from 'fs';
import * as path from 'path';
import ProgressBar from 'progress';
import { Logger } from './logger.js';

interface IsoFile {
  name: string;
  size: number;
  offset: number;
}

export class UMDISOReader {
  private fd: number;
  private files: IsoFile[] = [];

  constructor(private filePath: string) {
    try {
      this.fd = fs.openSync(filePath, 'r');
      this.files = this.readFiles(); // Load files upon initialization
    } catch (err) {
      console.error(`Failed to open file: ${filePath}`, err);
      throw err;
    }
  }

  public readFiles(): IsoFile[] {
    const buffer = Buffer.alloc(2048);

    // Read the Primary Volume Descriptor (PVD) from sector 16
    fs.readSync(this.fd, buffer, 0, 2048, 16 * 2048);

    if (buffer.toString('ascii', 1, 6) !== 'CD001') {
      console.error('Not a valid UMD ISO file.');
      throw new Error('Not a valid UMD ISO file.');
    }

    console.log('Primary Volume Descriptor (PVD) found.');

    // Read the root directory entry (offset 156 in PVD, directory entry starts here)
    const rootDirectoryOffsetLE = buffer.readUInt32LE(156 + 2);
    const rootDirectorySize = buffer.readUInt32LE(156 + 10);

    const rootDirectoryOffset = rootDirectoryOffsetLE * 2048; // Sector number * sector size (2048 bytes)

    console.log(`Root Directory Offset: ${rootDirectoryOffset}`);
    console.log(`Root Directory Size: ${rootDirectorySize}`);

    // Now we have the root directory entry, let's read its content
    return this.readDirectory(rootDirectoryOffset, rootDirectorySize);
  }

  private readDirectory(offset: number, size: number): IsoFile[] {
    const buffer = Buffer.alloc(size);
    fs.readSync(this.fd, buffer, 0, size, offset);

    const files: IsoFile[] = [];
    let pos = 0;

    Logger.log(`Reading directory at offset ${offset} with size ${size}`);

    while (pos < size) {
      const recordLength = buffer[pos];

      if (recordLength === 0) {
        Logger.log('End of directory entries.');
        break; // End of directory entries
      }

      const fileSize = buffer.readUInt32LE(pos + 10);
      const fileOffsetLE = buffer.readUInt32LE(pos + 2);
      const fileOffset = fileOffsetLE * 2048; // Sector number * sector size
      const nameLength = buffer[pos + 32];
      const fileName = buffer.toString('ascii', pos + 33, pos + 33 + nameLength);

      if (fileName !== '\x00' && fileName !== '\x01') {
        Logger.log(`Found file: ${fileName}, Size: ${fileSize}, Offset: ${fileOffset}`);
        files.push({
          name: fileName,
          size: fileSize,
          offset: fileOffset
        });

        // If the file is a directory (high bit of flags at pos+25 is set), recurse into it
        const fileFlags = buffer[pos + 25];
        if ((fileFlags & 0x02) !== 0) { // Directory flag
          Logger.log(`Entering directory: ${fileName}`);
          const subFiles = this.readDirectory(fileOffset, fileSize);
          subFiles.forEach((subFile) => {
            subFile.name = path.join(fileName, subFile.name);
          });
          files.push(...subFiles);
        }
      }

      pos += recordLength;
    }

    return files;
  }

  public exportFile(fullPath: string, outputDir: string): void {
    const normalizedPath = path.normalize(fullPath).replace(/\\/g, '/'); // Normalize and ensure forward slashes
    const targetFile = this.files.find(file => normalizedPath.endsWith(file.name));

    if (!targetFile) {
      console.error(`File ${fullPath} not found in ISO.`);
      return;
    }

    const buffer = Buffer.alloc(targetFile.size);
    fs.readSync(this.fd, buffer, 0, targetFile.size, targetFile.offset);

    const outputFilePath = path.join(outputDir, path.basename(normalizedPath));
    fs.writeFileSync(outputFilePath, buffer);

    console.log(`Exported file ${fullPath} to ${outputFilePath}`);
  }

  public writeUpdatedISO(fullPath: string, localFilePath: string, outputIsoPath: string): void {
    const normalizedPath = path.normalize(fullPath).replace(/\\/g, '/'); // Normalize and ensure forward slashes
    const targetFile = this.files.find(file => normalizedPath.endsWith(file.name));

    if (!targetFile) {
      console.error(`File ${fullPath} not found in ISO.`);
      return;
    }

    const newFileBuffer = fs.readFileSync(localFilePath);
    const newSize = newFileBuffer.length;

    // Create a new ISO file for writing
    const outFd = fs.openSync(outputIsoPath, 'w');
    const progressBar = new ProgressBar('Writing: [:bar] :percent :etas', { total: fs.fstatSync(this.fd).size });

    try {
      // Write the entire ISO content to the new file, replacing the specified file
      let totalBytesWritten = 0;
      const buffer = Buffer.alloc(2048);

      // Copy up to the start of the target file
      let position = 0;
      while (position < targetFile.offset) {
        const bytesRead = fs.readSync(this.fd, buffer, 0, buffer.length, position);
        fs.writeSync(outFd, buffer, 0, bytesRead);
        position += bytesRead;
        totalBytesWritten += bytesRead;
        progressBar.tick(bytesRead);
      }

      // Write the new file content
      fs.writeSync(outFd, newFileBuffer, 0, newFileBuffer.length);
      totalBytesWritten += newFileBuffer.length;
      position += targetFile.size;
      progressBar.tick(newFileBuffer.length);

      // Update the directory record with the new file size
      this.updateUMDDirectoryRecord(outFd, normalizedPath, newSize);

      // Copy the rest of the ISO after the updated file
      while (true) {
        const bytesRead = fs.readSync(this.fd, buffer, 0, buffer.length, position);
        if (bytesRead === 0) break;
        fs.writeSync(outFd, buffer, 0, bytesRead);
        position += bytesRead;
        totalBytesWritten += bytesRead;
        progressBar.tick(bytesRead);
      }

      console.log(`New ISO written to ${outputIsoPath}`);
    } catch (err) {
      console.error('Error writing new ISO file:', err);
    } finally {
      fs.closeSync(outFd);
    }
  }

  private updateUMDDirectoryRecord(outFd: number, filePath: string, newSize: number): void {
    // Read the Primary Volume Descriptor (PVD) to get the root directory offset
    const pvdBuffer = Buffer.alloc(2048);
    fs.readSync(this.fd, pvdBuffer, 0, 2048, 16 * 2048); // Sector 16 contains the PVD

    if (pvdBuffer.toString('ascii', 1, 6) !== 'CD001') {
      console.error('Not a valid ISO9660 file.');
      throw new Error('Not a valid ISO9660 file.');
    }

    const rootDirectoryOffset = pvdBuffer.readUInt32LE(156 + 2) * 2048;
    const rootDirectorySize = pvdBuffer.readUInt32LE(156 + 10);

    Logger.log(`Root Directory Offset: ${rootDirectoryOffset}, Size: ${rootDirectorySize}`);

    // Traverse the UMD-specific directory structure
    this.traverseUMDDirectory(rootDirectoryOffset, rootDirectorySize, filePath.split('/'), newSize, outFd);
  }

  private traverseUMDDirectory(directoryOffset: number, directorySize: number, parts: string[], newSize: number, outFd: number): void {
    const buffer = Buffer.alloc(directorySize);
    fs.readSync(this.fd, buffer, 0, directorySize, directoryOffset);

    let pos = 0;
    while (pos < directorySize) {
      const recordLength = buffer[pos];
      if (recordLength === 0) break; // End of directory entries

      const fileNameLength = buffer[pos + 32];
      const fileName = buffer.toString('ascii', pos + 33, pos + 33 + fileNameLength);

      if (fileName === parts[0]) {
        if (parts.length === 1) {
          // This is the file we need to update
          buffer.writeUInt32LE(newSize, pos + 10); // Update the size field
          fs.writeSync(outFd, buffer, 0, directorySize, directoryOffset);
          Logger.log(`Updated UMD directory record for ${fileName} with new size ${newSize}`);
          return;
        } else {
          // Traverse into the next directory
          const nextDirectoryOffset = buffer.readUInt32LE(pos + 2) * 2048;
          const nextDirectorySize = buffer.readUInt32LE(pos + 10);
          this.traverseUMDDirectory(nextDirectoryOffset, nextDirectorySize, parts.slice(1), newSize, outFd);
          return;
        }
      }

      pos += recordLength;
    }

    console.error(`Failed to update UMD directory record for ${parts.join('/')}`);
  }

  public close(): void {
    fs.closeSync(this.fd);
    console.log(`File ${this.filePath} closed.`);
  }
}
