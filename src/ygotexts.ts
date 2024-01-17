import * as fs from 'fs';
import * as path from 'path';
import { TagForce, Dictionary } from './compressor';
import { Huffman } from './huffman';

export class YgoTexts {

  public async exportToTxt(dirCard: string, tagForce: TagForce): Promise<void> {
    const sourceFiles = this.requiredFiles(dirCard).sort();
    const cardDesc = sourceFiles[0];
    const cardHuff = sourceFiles[1];
    const cardIdx = sourceFiles[2];
    const cardIntID = sourceFiles[3];
    const cardName = sourceFiles[4];
    const Dict = sourceFiles[5];
    const descriptionText: string[] = [];
    this.exportToTxtInternalPointers(Dict);
    const huff = new Huffman();
    const descomp = await huff.decompress(cardDesc, cardHuff, cardIdx);

    const conversorDeCodigos = new Dictionary();
    const tex = conversorDeCodigos.translateWithDictionary(Dict, cardIdx, descomp, cardIntID, cardName, tagForce);

    // Process each text and add to descriptionText
    tex.forEach(textoo => {
      if (textoo.includes("\0")) {
        descriptionText.push("<DESCRICAO>" + textoo.replace("\0", "<NULL>") + "<DESCRICAO/><FIM/>\n\n");
      } else {
        descriptionText.push("<DESCRICAO>" + textoo + "<NULL>" + "<DESCRICAO/><FIM/>\n\n");
      }
    });

    // Read binary data and process it
    const binBuffer = fs.readFileSync(cardName);
    const idxBuffer = fs.readFileSync(cardIdx);
    const countOffsetSeek = 8;
    const countOfPointers = idxBuffer.length / countOffsetSeek;
    const pointers: number[] = [];
    let positionsTable: number[] = [];

    for (let i = 0; i < countOfPointers; i++) {
      const position = i * countOffsetSeek;
      positionsTable.push(position);
      pointers.push(idxBuffer.readInt32LE(position));
    }

    const texts: string[] = [];

    // Process and extract card names
    pointers.forEach((pointer, i) => {
      if (pointer === binBuffer.length || pointer > binBuffer.length) {
        return;
      }
      let cardName = "";
      let pos = pointer;
      while (true) {
        const letra = binBuffer.slice(pos, pos + 2).toString('utf16le');
        pos += 2;
        if (letra.includes("\0")) {
          cardName += "<NULL>";
          break;
        }
        cardName += letra;
      }
      // Add processed name to texts
      texts.push(
        `<PONTEIRO: ${positionsTable[i]},0>\n` +
        `<NOME>${cardName
          .replace(/\$CA/g, "<COR: $CA>")
          .replace(/\$C0/g, "<COR: $C0>")
          .replace(/\$C5/g, "<COR: $C5>")
          .replace(/\$C8/g, "<COR: $C8>")
          .replace(/\n/g, "<b>\n")
          .replace(/\$0/g, "<JOGADOR: $0>")
          .replace(/\0/g, "<NULL>")}<NOME/>\n`
      );
    });

    const textosCartaFinal: string[] = ["<Tipo de Ponteiro=Informação de Cartas=" + cardIdx + " = " + Dict + ">"];
    texts.forEach((texto, i) => textosCartaFinal.push(texto + descriptionText[i]));

    fs.writeFileSync(cardDesc.replace(".bin", ".txt"), textosCartaFinal.join('\n'));
  }

  public exportToTxtInternalPointers(binDir: string): void {
    let countOfPointers = 0;
    let headerSize = 0;
    let tableSize = 0;
    let tablePosition = 0;
    let pointer = 0;
    const texts: string[] = [];
    let sumPointer = 0;

    const bin = fs.readFileSync(binDir);
    texts.push("<Tipo de Ponteiro = Interno Indireto>\n\n");

    countOfPointers = bin.readInt32LE(0);
    headerSize = bin.readInt32LE(4);
    tableSize = bin.readInt32LE(8);
    tablePosition = 12; // The position after reading the header and table size

    for (let i = 0; i < countOfPointers; i++) {
      let textSize = 0;
      pointer = bin.readInt32LE(tablePosition);

      // Perform the pointer adjustments as in the original C# code
      if (pointer > bin.length) {
        if (pointer > 0x10000000 && pointer < 0x1FFFFFFF) {
          pointer -= 0x10000000;
          sumPointer = 0x10000000;
        } else if (pointer > 0x20000000 && pointer < 0x2FFFFFFF) {
          pointer -= 0x20000000;
          sumPointer = 0x20000000;
        } else if (pointer > 0x30000000 && pointer < 0x3FFFFFFF) {
          pointer -= 0x30000000;
          sumPointer = 0x30000000;
        } else if (pointer > 0x40000000 && pointer < 0x4FFFFFFF) {
          pointer -= 0x40000000;
          sumPointer = 0x40000000;
        } else if (pointer > 0x50000000 && pointer < 0x5FFFFFFF) {
          pointer -= 0x50000000;
          sumPointer = 0x50000000;
        } else {
          throw new Error("Not compatible"); // Use Error instead of Exception
        }
      }

      pointer += tableSize;

      let textInString = "";

      if (pointer === bin.length) {
        texts.push(`<PONTEIRO: ${tablePosition},${sumPointer}>\n<TEXTO>${textInString}<TEXTO/>\n<FIM/>\n\n`);
        break;
      }

      let value = bin.readUInt16LE(pointer);
      textSize += 2;

      while (value !== 0) {
        pointer += 2;
        value = bin.readUInt16LE(pointer);
        textSize += 2;

      }

      const textInUnicode = bin.slice(pointer - textSize + 2, pointer + 2);
      textInString = textInUnicode.toString('utf16le');

      // Perform string replacements as in the original C# code
      textInString = textInString
        .replace(/\$CA/g, "<COR: $CA>")
        // ... (include all other replacements)
        .replace(/\0/g, "<NULL>");

      texts.push(`<PONTEIRO: ${tablePosition},${sumPointer}>\n<TEXTO>${textInString}<TEXTO/>\n<FIM/>\n\n`);
      tablePosition += 4;
      sumPointer = 0;
    }

    fs.writeFileSync(binDir.replace('.bin', '.txt'), texts.join('\n'));
  }

  private requiredFiles(directory: string): string[] {
    const sourceFiles = ["CARD_Name_", "CARD_Desc", "CARD_Indx", "CARD_Huff", "DICT", "CARD_IntID"];
    const files = fs.readdirSync(directory);
    const filesVerified: string[] = [];

    for (let i = 0; i < files.length; i++) {
      for (let y = 0; y < sourceFiles.length; y++) {
        if (files[i].includes(sourceFiles[y])) {
          filesVerified.push(path.join(directory, files[i]));
          sourceFiles[y] += "<v>";
          break;
        }
      }
    }

    if (filesVerified.length < 5) {
      let missingFiles = "";
      for (let i = 0; i < sourceFiles.length; i++) {
        if (!sourceFiles[i].includes("<v>")) {
          missingFiles += sourceFiles[i] + "\n";
        }
      }

      throw new Error("The following files were not found: " + missingFiles);
    }

    return filesVerified;
  }

  /* Update DICT_J.bin */
  public updateDict(texto: string, filename: string): void {
    let pointerCount = 0;
    let headerSize = 0;
    let tableSize = 0;
    let tablePos = 0;
    let pointer = 0;

    const splitText = texto.replace(/[\n\r]/g, "").split("<FIM/>").filter(Boolean);
    const binBuffer = fs.readFileSync(filename.replace(".txt", ".bin"));
    const backupTabela = Buffer.from(binBuffer);
    const fileBytes: Buffer[] = [];

    pointerCount = binBuffer.readInt32LE(0);
    headerSize = binBuffer.readInt32LE(4);
    tableSize = binBuffer.readInt32LE(8);

    tablePos = headerSize;
    const newTable = Buffer.alloc(tableSize);

    // We construct the table header based on the old file information (0-11) // FIXME
    newTable.writeInt32LE(pointerCount, 0);
    newTable.writeInt32LE(headerSize, 4);
    newTable.writeInt32LE(tableSize, 8);

    for (const item of splitText) {
      const textSplit = item.replace("<b>", "\r\n").replace("<TEXTO/>", "").split("<TEXTO>").filter(Boolean);
      const dataPoint = this.getPointerInfo(textSplit[0]);
      tablePos = dataPoint[0];

      //
      newTable.writeInt32LE(pointer + dataPoint[1], tablePos);
      if (textSplit.length > 1) {
        const convertedText = this.removeTags(textSplit[1]);
        const textToBytes = Buffer.from(convertedText, 'utf16le');
        fileBytes.push(textToBytes);
        pointer += textToBytes.length;
      }
    }

    const textFinalBytes = Buffer.concat([newTable, ...fileBytes]);
    fs.writeFileSync(filename.replace(".txt", ".bin"), textFinalBytes);
  }

  // Helpers
  // This is called by updateDict when working with the DICT_J import
  private getPointerInfo(text: string): number[] {
    text = text.replace(" ", "").replace(">", "").replace("<", "§");
    const information: number[] = new Array(2);
    const inf = text.split('§').pop()?.split(':') ?? [];
    const separator = inf[1].split(',');
    const pointerPosition = parseInt(separator[0]);
    const pointerValue = parseInt(separator[1]);

    information[0] = pointerPosition;
    information[1] = pointerValue;

    return information;
  }

  // This is called by updateDict when working with the DICT_J import
  private removeTags(text: string): string {
    let sb = "";
    for (let i = 0; i < text.length; i++) {
      if (text[i] !== '<') {
        sb += text[i];
      } else {
        let tagCommand: string | null = "";
        if (text[i + 1] === 'M') {
          i += 2;
          sb += "$m";

          while (text[i] !== '>') {
            sb += text[i];
            i++;
          }
          i++;
          let ignore = "";
          while (text[i] !== '>') {
            ignore += text[i];
            i++;
          }
        } else {
          while (text[i] !== '>') {
            tagCommand += text[i];
            i++;
          }

          tagCommand += text[i];
          tagCommand = this.tagConverter(tagCommand);
          sb += tagCommand;
        }
      }
    }
    return sb;
  }

  // Called by removeTags
  private tagConverter(tag: string | null): string | null {
    if (tag === null) {
      return null;
    }

    if (tag.includes("<NULL>")) {
      return "\0";
    }

    if (tag.includes("<r>")) {
      return "\r";
    }

    if (tag.toUpperCase().includes("<COR") || tag.toUpperCase().includes("<JOGADOR")) {
      tag = tag.replace(" ", "").replace(">", "");
      const valueCOR = tag.split(':');
      return valueCOR[valueCOR.length - 1];
    }

    return null;
  }

}