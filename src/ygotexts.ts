import * as fs from 'fs';
import * as path from 'path';
import { YuGiOh, Dictionary } from './compressor.js';
import { Huffman } from './huffman.js';

export class YgoTexts {

  public async exportToTxt(dirCard: string, tagForce: YuGiOh): Promise<void> {
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
    const desDecompressed = await huff.decompress(cardDesc, cardHuff, cardIdx);

    const conversorDeCodigos = new Dictionary();
    const tex = conversorDeCodigos.translateWithDictionary(Dict, cardIdx, desDecompressed, cardIntID, cardName, tagForce);

    // Process each text and add to descriptionText
    tex.forEach(texts => {
      if (texts.includes("\0")) {
        descriptionText.push("<DESCRICAO>" + texts.replace("\0", "<NULL>") + "<DESCRICAO/><FIM/>\n\n");
      } else {
        descriptionText.push("<DESCRICAO>" + texts + "<NULL>" + "<DESCRICAO/><FIM/>\n\n");
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

    const cardTextsFinal: string[] = ["<Tipo de Ponteiro=Informação de Cartas=" + cardIdx + " = " + Dict + ">"];
    texts.forEach((texto, i) => cardTextsFinal.push(texto + descriptionText[i]));

    fs.writeFileSync(cardDesc.replace(".bin", ".txt"), cardTextsFinal.join('\n'));
  }

  /*
   Similar to implementation of exportToTxt but the output will be written in Gettext POT format
   Notable changes:
     - We cut away the `\0` ending terminator. This needs to be restored when importing names and descriptions
     - We try to keep things on a single line, so `\r\n` will be substituted with <BR> to indicate a single line break

   */
  public async exportToPot(dirCard: string, ygoType: YuGiOh): Promise<void> {
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
    const desDecompressed = await huff.decompress(cardDesc, cardHuff, cardIdx);

    const conversorDeCodigos = new Dictionary();
    const tex = conversorDeCodigos.translateWithDictionary(Dict, cardIdx, desDecompressed, cardIntID, cardName, ygoType);

    // Process each text and add to descriptionText
    tex.forEach(texts => {
      descriptionText.push(texts.replace("\0", ""));
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
    const textsForAnalysis: string[] = [];

    // Process and extract card names
    pointers.forEach((pointer, i) => {
      if (pointer === binBuffer.length || pointer > binBuffer.length) {
        return;
      }
      let cardName = "";
      let pos = pointer;
      while (true) {
        const character = binBuffer.slice(pos, pos + 2).toString('utf16le');
        pos += 2;
        if (character.includes("\0")) {
          break;
        }
        cardName += character;
      }

      texts.push(
        `#. type: Name\n` +
        `#. pointer: ${positionsTable[i]}\n` +
        `#: ${positionsTable[i]}\n` +
        `msgid "${cardName
          .replace(/\$CA/g, "<COR: $CA>")
          .replace(/\$C0/g, "<COR: $C0>")
          .replace(/\$C5/g, "<COR: $C5>")
          .replace(/\$C8/g, "<COR: $C8>")
          .replace(/\n/g, "<b>\n")
          .replace(/\$0/g, "<JOGADOR: $0>")
          .replace(/\0/g, "")
          .replace(/"/g, "\\\"")}"\n` +
        `msgstr ""\n` +
        `\n` +
        `#. type: Description\n` +
        `#. pointer: ${positionsTable[i]}\n` +
        `#: ${positionsTable[i]}\n` +
        `msgid ""\n` +
        `"` + descriptionText[i].replace(/"/g, "\\\"").replace(/\r\n/g, "<BR>") + `"\n` +
        `msgstr ""\n`
      );
      textsForAnalysis.push(descriptionText[i]);
    });

    const cardTextsFinal: string[] = [
      "# Yu-Gi-Oh! Portable Object Template - " + YuGiOh[ygoType] + "\n" +
      "# Export using OGY - https://github.com/exsilium/ogy\n" +
      "# This file is distributed under the same license as the OGY package.\n" +
      "#\n" +
      "#, fuzzy\n" +
      "msgid \"\"\n" +
      "msgstr \"\"\n" +
      "\"Project-Id-Version: PACKAGE VERSION\\n\"\n" +
      "\"POT-Creation-Date: " + this.formatTimestamp(new Date()) + "\\n\"\n" +
      "\"PO-Revision-Date: YEAR-MO-DA HO:MI+ZONE\\n\"\n" +
      "\"Last-Translator: FULL NAME <EMAIL@ADDRESS>\\n\"\n" +
      "\"Language-Team: LANGUAGE <LL@li.org>\\n\"\n" +
      "\"Language: \\n\"\n" +
      "\"MIME-Version: 1.0\\n\"\n" +
      "\"Content-Type: text/plain; charset=UTF-8\\n\"\n" +
      "\"Content-Transfer-Encoding: 8bit\\n\"\n"
    ];
    texts.forEach((texto, i) => cardTextsFinal.push(texto));

    const outputFile = path.dirname(cardDesc) + "/" + YuGiOh[ygoType].toLowerCase() +  ".pot";
    console.log("Output file: " + outputFile);
    fs.writeFileSync(outputFile , cardTextsFinal.join('\n'));
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

  /* This handles the CARD_Desc_J.txt */
  public updateCardDesc(text: string, filename: string, tagForce4: boolean): void {
    let headerSize = 0;
    let tableSize = 0;
    let posTable = 0;
    let pointer = 0;
    let idx = "";
    let dict = "";
    const textDivider = text.replace(/\r\n/g, "<b>").replace(/[\n\r]/g, "").split("<FIM/>").filter(Boolean);
    const tableInfo = this.getPointerType(textDivider[0]).split(',');
    idx = tableInfo[1];  // CARD_Indx_J.bin
    dict = tableInfo[2]; // DICT_J.bin
    const dictionary = new Dictionary();

    const dictBuffer = fs.readFileSync(dict.replace(".bin", ".txt"), 'utf-8');
    const binBuffer = fs.readFileSync(idx);
    const fileBytes: Buffer[] = [];
    tableSize = binBuffer.length;

    posTable = headerSize;
    const newTable = Buffer.alloc(tableSize);
    const padding = Buffer.alloc(4);
    fileBytes.push(padding);

    let descriptionUncompressed = "";
    let totalSize = 0;
    totalSize = 4;
    pointer = 4;

    for (const item of textDivider) {
      const textSplit = item.replace(/<b>/g, String.fromCharCode(13,10)).split("<NOME>").filter(Boolean);
      const infoPoint = this.getPointerInfo(textSplit[0]);
      posTable = infoPoint[0];

      newTable.writeInt32LE(pointer + infoPoint[1], posTable);

      const name = textSplit[1].split("<NOME/>").filter(Boolean);
      const nameConverted = this.removeTags(name[0]);
      const textDescription = this.removeTags(name[1].replace("<DESCRICAO>", "").replace("<DESCRICAO/>", ""));
      descriptionUncompressed += textDescription;
      const textBytes = Buffer.from(nameConverted, 'utf16le');
      fileBytes.push(textBytes);
      totalSize += textBytes.length;
      pointer = totalSize;
    }

    const textFinalBytes = Buffer.concat(fileBytes);
    const descriptionDictionary = dictionary.getDictionaryTextAndReplace(dict, descriptionUncompressed);

    fs.writeFileSync(filename.replace(".txt", ".bin").replace("CARD_Desc", "CARD_Name"), textFinalBytes);
    // First update of CARD_Indx_J.bin
    fs.writeFileSync(idx, newTable);

    let descriptionBytes = Buffer.from(descriptionDictionary, 'utf16le');
    if (descriptionBytes[0] !== 0) {
      descriptionBytes = descriptionBytes.slice(2);
    }
    fs.writeFileSync(filename.replace(".txt", ".bin"), descriptionBytes);

    this.compress(filename.replace(".txt", ".bin"), filename.replace(".txt", ".bin").replace("CARD_Desc", "CARD_Huff"), idx);

    this.updateDict(dictBuffer, dict.replace(".bin", ".txt"));
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
    const inf = text.split('§').pop()?.split('PONTEIRO:') ?? [];
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

  // Called by updateCardDesc
  private getPointerType(text: string): string {
    const divider = text.replace(".bin>", ".bin>~").split('~');
    const otherDivider = divider[0].replace(" ", "").replace("<", "").replace(">", "").split('=');
    if (text.includes("CARD_Indx")) {
      return otherDivider[1].trim() + "," + otherDivider[2].trim() + "," + otherDivider[3].trim();
    } else {
      return otherDivider[1].trim() + "," + otherDivider[2].trim();
    }
  }

  // Called by updateCardDesc
  private compress(cardDesc: string, cardHuff: string, cardIdx: string): void {
    const huffman = new Huffman();
    huffman.compress(cardDesc, cardHuff, cardIdx);
  }

  private formatTimestamp(date: Date): string {
    const year = date.getUTCFullYear();
    const month = (date.getUTCMonth() + 1).toString().padStart(2, '0');
    const day = date.getUTCDate().toString().padStart(2, '0');
    const hours = date.getUTCHours().toString().padStart(2, '0');
    const minutes = date.getUTCMinutes().toString().padStart(2, '0');

    return `${year}-${month}-${day} ${hours}:${minutes}+0000`;
  }
}