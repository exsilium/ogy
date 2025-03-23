import * as fs from 'fs';
import * as path from 'path';
import * as gettextParser from 'gettext-parser';

enum YuGiOh {
  WC6, // Yu-Gi-Oh! Ultimate Masters: World Championship Tournament 2006, 2006, GBA
  TF1, // Yu-Gi-Oh! GX: Tag Force, 2006, PSP
  TF2, // Yu-Gi-Oh! GX: Tag Force 2, 2007, PSP
  TF3, // Yu-Gi-Oh! GX: Tag Force 3, 2008, PSP
  TF4, // Yu-Gi-Oh! 5D's: Tag Force 4, 2009, PSP
  TF5, // Yu-Gi-Oh! 5D's: Tag Force 5, 2010, PSP
  TF6, // Yu-Gi-Oh! 5D's: Tag Force 6, 2011, PSP (*Default)
  OTN, // Yu-Gi-Oh! 5D's World Championship 2011: Over the Nexus, 2011, DS
  TFS, // Yu-Gi-Oh! Arc-V Tag Force Special, 2015, PSP
  SCB, // Yu-Gi-Oh! Saikyo Card Battle, 2016, 3DS
  DUL, // Yu-Gi-Oh! Duel Links, 2017, Unity (Cross-platform)
  MAD, // Yu-Gi-Oh! Master Duel, 2022, Unity (Cross-platform)
}

type Entry = {
  Name: string;
  Description: string;
};

type PhraseFrequency = {
  phrase: string;
  frequency: number;
  length: number;
};

enum SeekOrigin {
  Begin = 0,
  Current = 1,
  End = 2,
}

class CustomBinaryReader {
  private buffer: Buffer;
  private position: number;

  constructor(buffer: Buffer) {
    this.buffer = buffer;
    this.position = 0;
  }

  seek(offset: number, origin: SeekOrigin): void {
    if (origin === SeekOrigin.Begin) {
      this.position = offset;
    } else if (origin === SeekOrigin.Current) {
      this.position += offset;
    } else if (origin === SeekOrigin.End) {
      this.position = this.buffer.length + offset;
    }

    if (this.position < 0) {
      this.position = 0;
    } else if (this.position > this.buffer.length) {
      this.position = this.buffer.length;
    }
  }

  readInt32(): number {
    const value = this.buffer.readInt32LE(this.position);
    this.position += 4;
    return value;
  }

  readInt16(): number {
    const value = this.buffer.readInt16LE(this.position);
    this.position += 2;
    return value;
  }

  readBytes(length: number): Buffer {
    const bytes = this.buffer.slice(this.position, this.position + length);
    this.position += length;
    return bytes;
  }
}

class Dictionary {
  translateWithDictionary(
    dictEL: string,
    cardIndxL: string,
    descriptions: string[],
    cardIntIDL: string,
    cardNameL: string,
    tagForce: YuGiOh
  ): string[] {
    const cardIndx = fs.readFileSync(cardIndxL);
    const dictE = fs.readFileSync(dictEL);
    const cardIntID = fs.readFileSync(cardIntIDL);
    const cardName = fs.readFileSync(cardNameL);

    let countPointers = 0;
    let headerSize = 0;
    let tableSize = 0;
    let account = 0;
    const finalDescriptions: string[] = [];

    const readCardName = new CustomBinaryReader(cardName);
    const readCardIntId = new CustomBinaryReader(cardIntID);
    const readCardIdx = new CustomBinaryReader(cardIndx);
    const readDictE = new CustomBinaryReader(dictE);

    countPointers = readDictE.readInt32();
    headerSize = readDictE.readInt32();
    tableSize = readDictE.readInt32();

    for (let i = 0; i < descriptions.length; i++) {
      account = i;

      const descriptionWithCodings = descriptions[i];

      const descriptionNoCoding = this.removeCoding(
        descriptionWithCodings,
        headerSize,
        tableSize,
        tagForce,
        readDictE,
        readCardIntId,
        readCardIdx,
        readCardName
      );

      finalDescriptions.push(descriptionNoCoding);
    }

    return finalDescriptions;
  }

  private removeCoding(
    descriptionWithCoding: string,
    headerSize: number,
    tableSize: number,
    tagForce: YuGiOh,
    readDictE: CustomBinaryReader,
    readCardIntId: CustomBinaryReader,
    readCardIdx: CustomBinaryReader,
    readCardName: CustomBinaryReader
  ): string {
    let counter = 0;
    descriptionWithCoding = descriptionWithCoding.replace(/\$R/g, "\r\n");

    while (descriptionWithCoding.includes('$')) {
      if (counter === descriptionWithCoding.length) {
        counter = 0;
      }
      if (descriptionWithCoding[counter] === '$') {
        counter++;
        let value = '';
        const identifier = descriptionWithCoding[counter];
        if (identifier === 'd' || identifier === 'm') {
          counter++;
          const accountTemp = identifier === 'd' ? 3 : 4;

          for (let i = 0; i < accountTemp; i++) {
            if (descriptionWithCoding[counter] === '$') {
              break;
            }
            value += descriptionWithCoding[counter];
            counter++;
          }

          if (value === '' || value.length < 3) {
            continue;
          }

          if (identifier === 'd') {
            descriptionWithCoding = descriptionWithCoding.replace(
              `$d${value}`,
              this.getDictionaryText(
                readDictE,
                value,
                headerSize,
                tableSize
              )
            );
          } else {
            const posicaoCardIdx = this.getPointerWithCardIntId(
              readCardIntId,
              value,
              tagForce
            );
            const nomeDaCarta = this.getCardName(
              readCardIdx,
              readCardName,
              posicaoCardIdx
            );
            descriptionWithCoding = descriptionWithCoding.replace(
              `$m${value}`,
              `<M${value}>${nomeDaCarta}<M>`
            );
          }
        }
      }

      descriptionWithCoding = descriptionWithCoding.replace(/\$R/g, "\r\n");
      counter++;
    }

    return descriptionWithCoding;
  }

  private getDictionaryText(
    readDictE: CustomBinaryReader,
    value: string,
    headerSize: number,
    tableSize: number
  ): string {
    let sb = '';

    const pointerPosition = Number(value) * 4;
    readDictE.seek(pointerPosition + headerSize, SeekOrigin.Begin);
    const pointer = readDictE.readInt32();
    readDictE.seek(pointer + tableSize, SeekOrigin.Begin);

    while (true) {
      const character = Buffer.from(readDictE.readBytes(2)).toString('utf-16le');

      if (character.includes('\0')) {
        break;
      }

      sb += character;
    }

    return sb;
  }

  private getPointerWithCardIntId(
    readCardIntId: CustomBinaryReader,
    value: string,
    tagForce: YuGiOh
  ): number {
    let posPointerXCardIDInt = parseInt(value) * 2;

    if (tagForce === YuGiOh.TF4 || tagForce === YuGiOh.TF5) {
      if (posPointerXCardIDInt >= 0x1C20) {
        posPointerXCardIDInt -= 0x1C20;
      }
    } else if (tagForce === YuGiOh.TF6) {
      if (posPointerXCardIDInt >= 0x1B06) {
        posPointerXCardIDInt -= 0x1B06;
      }
    } else {
      if (posPointerXCardIDInt >= 0x1D10) {
        posPointerXCardIDInt -= 0x1D10;
      }
    }

    readCardIntId.seek(posPointerXCardIDInt, SeekOrigin.Begin);
    const positionPointer = readCardIntId.readInt16() << 3;

    return positionPointer;
  }

  private getCardName(
    readCardIdx: CustomBinaryReader,
    readCardName: CustomBinaryReader,
    positionPointerCardIndx: number
  ): string {
    let sb = '';
    readCardIdx.seek(positionPointerCardIndx, SeekOrigin.Begin);
    const pointerCardName = readCardIdx.readInt32();

    readCardName.seek(pointerCardName, SeekOrigin.Begin);

    while (true) {
      const character = Buffer.from(readCardName.readBytes(2)).toString('utf-16le');

      if (character.includes('\0')) {
        break;
      }

      sb += character;
    }

    return sb;
  }

  // Called by updateCardDesc
  public getDictionaryTextAndReplace(dir: string, descricoesCarta: string): string {
    const termos = this.retorneListaDeCodigos(dir);
    let result = descricoesCarta;

    for (const [key, value] of Object.entries(termos)) {
      result = result.split(value).join(key);
    }

    return result;
  }

  private retorneListaDeCodigos(dir: string): Record<string, string> {
    const dic = fs.readFileSync(dir.replace('.bin', '.txt'), 'utf8').replace(/<PONTEIRO/g, '~<PONTEIRO');
    const dicSplit = dic.split('~');
    const termos: Record<string, string> = {};
    let contador = 0;

    for (let i = 0; i < dicSplit.length; i++) {
      if (!dicSplit[i].includes('<TEXTO>')) {
        continue;
      }

      const termo = dicSplit[i].replace('<TEXTO>', '<TEXTO>|').replace('<TEXTO/>', '|<TEXTO/>').split('|')[1].replace(/<NULL>/g, '');

      if (termo.length === 0) {
        throw new Error(`Empty text found in dictionary\n${dicSplit[i]}`);
      }

      termos['$d' + contador.toString().padStart(3, '0')] = termo;
      contador++;
    }

    return termos;
  }

}

class Transformer {
  private entries: Record<number, Entry>;

  constructor() {
    this.entries = {};
  }

  addEntry(key: number, name?: string, description?: string): void {
    const existingEntry = this.entries[key];
    if (existingEntry) {
      if (name) {
        existingEntry.Name = name;
      }
      if (description) {
        existingEntry.Description = description;
      }
    } else {
      const newEntry: Entry = {} as Entry;
      if (name) {
        newEntry.Name = name;
      }
      if (description) {
        newEntry.Description = description;
      }
      this.entries[key] = newEntry;
    }
  }

  getEntry(key: number): Entry | undefined {
    return this.entries[key];
  }

  printAllEntries(): void {
    console.log(this.entries);
  }
  poToTxt(sourcePo: string) {
    const po = gettextParser.po.parse(fs.readFileSync(sourcePo));
    console.log("Starting work on: " + sourcePo);

    // Initialize a counter
    let count = 0;

    // Access translations
    for (const [msgid, translation] of Object.entries(po.translations[''])) {
      console.log('Original:', msgid);
      console.log('Translation:', translation.msgstr[0]);

      // Access comments add an Entry based on pointer
      if (translation.comments) {
        if (translation.comments.extracted) {
          if(translation.comments.reference) {
            const types = translation.comments.extracted.replace(/\n/g, "").split("type: ").filter(item => item !== "")
            let textToAdd = msgid;
            if(translation.msgstr[0].length > 0) {
              textToAdd = translation.msgstr[0];
            }
            types.forEach(entry => {
              const [label, pointerStr] = entry.split('pointer: ');
              const pointer = parseInt(pointerStr, 10);

              if (label.startsWith('Name')) {
                console.log(`Processing Name at Pointer: ${pointer}`);
                this.addEntry(pointer, textToAdd)
              } else if (label.startsWith('Description')) {
                console.log(`Processing Description at Pointer: ${pointer}`);
                this.addEntry(pointer, undefined, textToAdd);
              }
            });
          }
        }
      }
      console.log('---------------------------');
      count++;
    }
    console.log("Entries processed: " + count);
    this.writeDictBuilderInput(sourcePo);
    fs.writeFileSync(sourcePo.replace(".po", ".txt"), this.entriesToTxt(path.dirname(sourcePo)));
    console.log("Files written, task complete.");
  }

  /*
  Helper function to generate JSON from a PO
   */
  poToJson(sourcePo: string, targetJson: string) {
    const po = gettextParser.po.parse(fs.readFileSync(sourcePo));
    fs.writeFileSync(targetJson, JSON.stringify(po, null, 2));
  }

  /*
  Here we generate the TXT based on the Entries, instead of going through all the entries, we follow
  The known pattern from 0 in increments of 8 until 43144
   */
  private entriesToTxt(directory: string): string {
    let txtOutput: string = "<Tipo de Ponteiro=Informação de Cartas=" + directory + "/CARD_Indx_J.bin = " + directory + "/DICT_J.bin>";
    let pointer = 0;

    while(pointer <= 43144) {
      txtOutput += `\n<PONTEIRO: ${pointer},0>\n` +
        `<NOME>` + this.entries[pointer].Name + `<NULL><NOME/>\n` +
        `<DESCRICAO>` + this.entries[pointer].Description.replace(/<BR>/g, String.fromCharCode(13,10)) + `<NULL><DESCRICAO/><FIM/>\n\n`;
      pointer += 8;
    }
    return txtOutput;
  }

  /*
  Here we generate the main input file for DICT generation
   */
  private writeDictBuilderInput(sourcePo: string): void {
    let txtOutput: string = "";
    let pointer = 8;

    while(pointer <= 43144) {
      txtOutput += this.entries[pointer].Description.replace(/<BR>/g, "\r\n") + "\r\n";
      pointer += 8;
    }
    fs.writeFileSync(path.dirname(sourcePo) + "/DICT_J.tin", txtOutput);
  }

  private parseDecimalNumbers(inputString: string): number[] {
    const regex = /\b\d+\b/g; // Regular expression to match decimal numbers
    const matches = inputString.match(regex);
    if (matches) {
      return matches.map(num => parseInt(num, 10));
    }
    return [];
  }
}

class DictionaryBuilder {
  private globalTokenNr = 0;
  private DICT: string = "<Tipo de Ponteiro = Interno Indireto>\n\n";
  private pointer: number = 0;

  public build(dictInputFile: string) {
    const text = fs.readFileSync(dictInputFile);
    const maxPhraseLength = 15;
    const maxTokens = 1;
    let phraseTokenMap = new Map<string, string>;

    let processingText = text.toString('utf8')

    for (let run = 1; run <= 1000; run++) {
      let tempMap = new Map(this.findFrequentPhrases(processingText, maxPhraseLength, maxTokens));
      tempMap.forEach((value, key) => {
        phraseTokenMap.set(key, value);
        processingText = processingText.replace(new RegExp(this.escapeRegExp(key), 'g'), "<M");

        // Regular expression to extract the number after "&d"
        const regex = /&d(\d+)/;
        const match = value.match(regex);
        let numPointer: number | null = null;

        if (match) {
          numPointer = parseInt(match[1], 10); // Convert the extracted string to number
          const pointerString = "\n<PONTEIRO: " + (numPointer * 4 + 12) + ",0>\n<TEXTO>" + key + "<NULL><TEXTO/>\n<FIM/>\n\n";
          this.DICT += pointerString;
        }
      });

      console.log(tempMap);
      console.log("Remaining text size for processing: " + processingText.length);
    }

    fs.writeFileSync(dictInputFile.replace(".tin", ".txt"), this.DICT);
    console.log("Output written");
  }

  private escapeRegExp(string: string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private findFrequentPhrases(text: string, maxPhraseLength: number, maxTokens: number): Map<string, string> {
    const wordArray = text.split(/\s+/);
    const phraseCount = new Map<string, { frequency: number; length: number }>();

    // Count the frequency of each phrase
    for (let length = 1; length <= maxPhraseLength; length++) {
      for (let i = 0; i <= wordArray.length - length; i++) {
        const phrase = wordArray.slice(i, i + length).join(' ');
        if (phrase.includes("<M")) {
          continue; // Skip phrases containing "<M"
        }
        else if (phrase.includes("●")) {
          continue;
        }
        else if (phrase.length < 5) {
          continue;
        }

        const current = phraseCount.get(phrase);
        if (current) {
          current.frequency++;
        } else {
          phraseCount.set(phrase, { frequency: 1, length });
        }
      }
    }

    // Filter, convert to array, and sort by length, then by frequency
    const sortedPhrases: PhraseFrequency[] = Array.from(phraseCount.entries())
      .filter(([_, { frequency }]) => frequency >= 15)
      .map(([phrase, { frequency, length }]) => ({ phrase, frequency, length }))
      .sort((a, b) => b.length - a.length || b.frequency - a.frequency);

    // Select the top 'maxTokens' phrases and assign tokens
    const phraseTokenMap = new Map<string, string>();
    for (let i = 0; i < Math.min(maxTokens, sortedPhrases.length); i++) {
      const token = `&d${this.globalTokenNr.toString().padStart(3, '0')}`;

      /*
       Some of the phrases were problematic as they included line feeds and as such were
       invalid and were not able to be removed from the original text. The following will
       check if we actually can use the phrase and if not, we increment the maxToken and
       move along.
       */
      const pattern = new RegExp(this.escapeRegExp(sortedPhrases[i].phrase), 'g');
      if(pattern.test(text) == false) {
        maxTokens++;
        continue;
      }

      phraseTokenMap.set(sortedPhrases[i].phrase, token + " F" + sortedPhrases[i].frequency.toString());
      this.globalTokenNr++;
    }

    return phraseTokenMap;
  }
}

export { YuGiOh, Dictionary, DictionaryBuilder, Transformer }
