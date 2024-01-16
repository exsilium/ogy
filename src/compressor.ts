import * as fs from 'fs';

enum TagForce {
  TagForce2,
  TagForce3,
  TagForce4,
  TagForce5,
  TagForce6,
}

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
    tagForce: TagForce
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
    tagForce: TagForce,
    readDictE: CustomBinaryReader,
    readCardIntId: CustomBinaryReader,
    readCardIdx: CustomBinaryReader,
    readCardName: CustomBinaryReader
  ): string {
    let counter = 0;

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
    tagForce: TagForce
  ): number {
    let posPointerXCardIDInt = parseInt(value) * 2;

    if (tagForce === TagForce.TagForce4 || tagForce === TagForce.TagForce5) {
      if (posPointerXCardIDInt >= 0x1C20) {
        posPointerXCardIDInt -= 0x1C20;
      }
    } else if (tagForce === TagForce.TagForce6) {
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

}

export { TagForce, Dictionary }