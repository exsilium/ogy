import * as fs from 'fs';
import * as path from 'path';

/*
 EHP
 */
class Ehp {
  magic: number = 0;
  ehpSize: number = 0;
  magic2: Buffer = Buffer.alloc(4);
  nrOfFiles: number = 0;
  destinationDirectory: string;
  ehpFilePath: string;

  constructor(destinationDirectory?: string, ehpFilePath?: string) {
    this.destinationDirectory = destinationDirectory || '';
    this.ehpFilePath = ehpFilePath || '';

    if (destinationDirectory && ehpFilePath) {
      this.initialize();
    }
  }

  async initialize() {
    const directoryEhp = this.ehpFilePath;
    const fileEhp = fs.readFileSync(directoryEhp);

    const magic = fileEhp.readInt32LE(0);
    const sizeEhp = fileEhp.readInt32LE(4);
    const magic2 = fileEhp.slice(8, 12);
    const nrOfFiles = fileEhp.readInt32LE(12);

    this.magic = magic;
    this.ehpSize = sizeEhp;
    this.magic2 = magic2;
    this.nrOfFiles = nrOfFiles;

    if (this.magic !== 0x03504845) {
      throw new Error('Wrong file type, header check failed!');
    }
  }

  // Extraction of EHP
  extract(): boolean {
    const directoryEhp = this.ehpFilePath;
    const st = fs.readFileSync(directoryEhp);

    let posReadingTable = 16;
    let pointerFilename = 0;
    let pointerFile = 0;
    let filename = '';
    let filesize = 0;

    if(!fs.existsSync(this.destinationDirectory)) {
      // The destination folder does not seem to exist, let's create one
      fs.mkdirSync(this.destinationDirectory, { recursive: true });
    }

    for (let i = 0; i < this.nrOfFiles; i++) {
      filename = '';

      pointerFilename = st.readUInt32LE(posReadingTable);
      pointerFile = st.readUInt32LE(posReadingTable + 4);
      posReadingTable += 8;

      let b = st[pointerFilename];
      while (b !== 0) {
        filename += String.fromCharCode(b);
        pointerFilename++;
        b = st[pointerFilename];
      }

      filesize = st.readUInt32LE(pointerFilename + 1);
      const file = st.slice(pointerFile, pointerFile + filesize);
      const dirFinal = path.join(this.destinationDirectory, filename);

      fs.writeFileSync(dirFinal, file);
    }

    return true;
  }

  // Update of EHP
  update(): boolean {
    const targetEhp = this.ehpFilePath;
    const file = fs.readFileSync(targetEhp);
    const ehpOriginal = Buffer.from(file);
    let ehpCopy = Buffer.from(file);
    let ehpEdit = Buffer.alloc(file.length * 2);

    let posReadingTable = 16;
    let pointerFilename = 0;
    let pointerArchive = 0;
    let filename = '';
    let posPointerFile = 0;
    let posFilesize = 0;

    for (let i = 0; i < this.nrOfFiles; i++) {
      filename = '';

      let reader = ehpOriginal.readUInt32LE(posReadingTable);
      pointerFilename = reader;
      posPointerFile = posReadingTable + 4;
      reader = ehpOriginal.readUInt32LE(posPointerFile);
      pointerArchive = reader;
      posReadingTable += 8;

      // Read the file name
      let b = ehpOriginal[pointerFilename];
      filename += String.fromCharCode(b);
      while (b !== 0) {
        pointerFilename++;
        b = ehpOriginal[pointerFilename];
        if (b !== 0) {
          filename += String.fromCharCode(b);
        }
      }

      if(i === 0) {
        ehpCopy = Buffer.from(ehpCopy.slice(0, pointerArchive));
      }
      let fileEdited = fs.readFileSync(path.join(this.destinationDirectory, filename));

      // File size is stored right after the file name, so last 0 byte after filename the following 4 bytes are for file size
      ehpCopy.writeUInt32LE(fileEdited.length, pointerFilename + 1);

      // File contents offset is in the header
      ehpCopy.writeUInt32LE(ehpCopy.length, posReadingTable - 4);
      ehpCopy = Buffer.from(Buffer.concat([ehpCopy, fileEdited]));

      // Padding to align to 16 bytes
      let padding = 0;
      while (ehpCopy.length % 16 !== 0) {
        ehpCopy = Buffer.from(Buffer.concat([ehpCopy, Buffer.from([padding])]));
      }

      posFilesize = ehpCopy.length;
    }
    // Add total file size to header (right after Magic)
    ehpCopy.writeUInt32LE(posFilesize, 4);

    ehpCopy.copy(ehpEdit);

    fs.writeFileSync(targetEhp, ehpEdit.slice(0, posFilesize));

    return true;
  }
}

export { Ehp };