import * as fs from 'fs';

/* These functions are MAD specific but can be potentially be used for other games */
/* Based on the https://github.com/mtamc/masterduel_readability Project logic */

export function processCardAsset(cardIndxFilePath: string, dataFilePath: string, start: number): string[] {
  // Read binary index file
  const decList = fs.readFileSync(cardIndxFilePath)
    .toString('hex')
    .match(/.{1,2}/g) || [];  // Fallback to an empty array if match returns null

  // Convert hexadecimal string array to a number array
  const decNumberList = decList.map(hexStr => parseInt(hexStr, 16));

  // Get the index of Desc
  const indx: number[] = [];
  for (let i = start; i < decNumberList.length; i += 8) {
    const tmp = decNumberList.slice(i, i + 4);
    indx.push(fourToOne(tmp));
  }
  indx.shift(); // Remove the first index as in the Python code

  // Convert Decrypted CARD files to JSON files
  const data = fs.readFileSync(dataFilePath);
  const desc = solve(data, indx);

  return desc
}

export function fourToOne(x: number[]): number {
  let res = 0;
  for (let i = 3; i >= 0; i--) {
    res *= 16 * 16;
    res += x[i];
  }
  return res;
}

export function solve(data: Buffer, descIndx: number[]): string[] {
  const res: string[] = [];
  for (let i = 0; i < descIndx.length - 1; i++) {
    let s = data.slice(descIndx[i], descIndx[i + 1]).toString('utf8');
    s = s.replace(/\u0000+$/, ''); // Remove null characters at the end
    res.push(s);
  }
  return res;
}

export function restoreCardAsset(
  cardIndxOutputPath: string,
  nameOutputPath: string,
  descOutputPath: string,
  cardNames: string[],
  cardDescs: string[]
): void {
  // Restore Name and Desc data with initial padding
  const nameData = Buffer.concat([Buffer.from('0000000000000000', 'hex'), restoreData(cardNames)]);
  const descData = Buffer.concat([Buffer.from('0000000000000000', 'hex'), restoreData(cardDescs)]);

  // Save Name and Desc data to files
  fs.writeFileSync(nameOutputPath, nameData);
  fs.writeFileSync(descOutputPath, descData);

  // Calculate indices for Name and Desc files
  let nameIndx = calculateIndices(cardNames, 8); // Starting after 8-byte padding
  let descIndx = calculateIndices(cardDescs, 8);

  // Adjust initial offsets for Name and Desc indices
  nameIndx = [4, 8, ...nameIndx.slice(1)];
  descIndx = [4, 8, ...descIndx.slice(1)];

  // Combine Name and Desc indices into the interleaved cardIndx
  const cardIndx: number[] = [];
  for (let i = 0; i < nameIndx.length; i++) {
    cardIndx.push(nameIndx[i]);
    cardIndx.push(descIndx[i]);
  }

  // Convert indices to binary data in little-endian format
  const indxData = Buffer.concat(cardIndx.map(num => fourToOneReverse(num)));

  // Save Indx data to file
  fs.writeFileSync(cardIndxOutputPath, indxData);
}

function restoreData(dataArray: string[]): Buffer {
  const buffers = dataArray.map(str => {
    // Convert the string to a buffer using Latin-1 encoding
    let buf = Buffer.from(str, 'utf8');

    // Ensure the buffer ends with a null byte
    if (buf[buf.length - 1] !== 0x00) {
      buf = Buffer.concat([buf, Buffer.from('\u0000', 'utf8')]);
    }

    // Calculate padding needed to align to the 4-byte boundary
    const paddingLength = calculatePaddingLength(buf.length);
    const padding = Buffer.alloc(paddingLength, 0);
    return Buffer.concat([buf, padding]);
  });

  return Buffer.concat(buffers);
}

function calculateIndices(dataArray: string[], start: number): number[] {
  const indices: number[] = [start];
  let currentIndex = start;

  dataArray.forEach(str => {
    // Convert string to Latin-1 buffer and ensure it ends with a null byte
    let buf = Buffer.from(str, 'utf8');
    if (buf[buf.length - 1] !== 0x00) {
      buf = Buffer.concat([buf, Buffer.from('\u0000', 'utf8')]);
    }

    // Add padding to maintain 4-byte alignment
    const lengthWithPadding = buf.length + calculatePaddingLength(buf.length);
    currentIndex += lengthWithPadding;
    indices.push(currentIndex);
  });

  return indices;
}

function calculatePaddingLength(length: number): number {
  return (4 - (length % 4)) % 4;
}

function fourToOneReverse(num: number): Buffer {
  const buf = Buffer.alloc(4);
  buf.writeUInt32LE(num); // Ensures little-endian format
  return buf;
}
