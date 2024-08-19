import * as fs from 'fs';

/* These functions are MAD specific */
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