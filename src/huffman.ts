import * as fs from 'fs';

class Huffman {
  public async decompress(dirDescription: string, dirCardHuff: string, dirCardIndx: string): Promise<string[]> {
    const descricaoBuffer = fs.readFileSync(dirDescription);
    const cardIndxBuffer = fs.readFileSync(dirCardIndx);
    const cardHuffBuffer = fs.readFileSync(dirCardHuff);
    const descriptions: string[] = [];

    let pDescription = 0;
    let pArchiveCompressed;
    let valueHuff = 0;
    const quantidadeDePonteiros = Math.floor(cardIndxBuffer.length / 4 / 2);
    let enderecoDoPonteiro = 0x4;
    const tamanhoEmBits = descricaoBuffer.length * 8;
    let ponteiro = 0;

    for (let i = 0; i < quantidadeDePonteiros; i++) {
      pDescription = cardIndxBuffer.readInt32LE(enderecoDoPonteiro);
      ponteiro = pDescription;
      pArchiveCompressed = pDescription >> 3;
      const quantidadeDeBitsANaoUsar = pDescription & 7;
      const numeroDeBits = 7;
      let quantidadeDeBitsAUsar = numeroDeBits - quantidadeDeBitsANaoUsar;

      let valorComprimido = 0;
      let posicaoSalvaDentroDaArvore = 0;
      let descricaoDescomprimida = "";

      while (quantidadeDeBitsAUsar >= 0) {
        if (pArchiveCompressed * 8 === tamanhoEmBits) {
          break;
        }
        valorComprimido = descricaoBuffer[pArchiveCompressed];
        const proximoBit = valorComprimido >> quantidadeDeBitsAUsar;
        let posicaoNaArvoreHuffman = (proximoBit & 0x1) * 2;
        posicaoNaArvoreHuffman += posicaoSalvaDentroDaArvore;

        valueHuff = cardHuffBuffer.readInt16LE(posicaoNaArvoreHuffman);

        if (valueHuff === 0) {
          valueHuff = posicaoSalvaDentroDaArvore;
          const valorDoCaractereBuffer = cardHuffBuffer.slice(valueHuff + 4, valueHuff + 6);
          const valorDoCaractere = valorDoCaractereBuffer.toString('utf16le');
          descricaoDescomprimida += valorDoCaractere;

          if (valorDoCaractere.includes("\0")) {
            break;
          } else {
            posicaoSalvaDentroDaArvore = 0;
          }
        } else {
          quantidadeDeBitsAUsar -= 1;
          posicaoSalvaDentroDaArvore = valueHuff;

          if (quantidadeDeBitsAUsar < 0) {
            pArchiveCompressed += 1;
            quantidadeDeBitsAUsar = 7;
          }
        }
      }

      descriptions.push(descricaoDescomprimida);
      enderecoDoPonteiro += 8;
    }

    return descriptions;
  }

}

export { Huffman };
