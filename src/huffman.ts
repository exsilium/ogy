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

  // Called for updating CardDesc
  public async compress(dirCardDesc: string, dirCardHuff: string, dirCardIndx: string): Promise<void> {
    const tableOfNodesOrdered = this.getNode(dirCardDesc).sort((a, b) => a.frequency - b.frequency);
    const tree = this.createTree(tableOfNodesOrdered);
    const codeTable = this.getCodeTable(tree[0]);
    this.createTreeNodeGameFormat(codeTable, dirCardHuff);
    const pointers = await this.compressWithCodeTablesAndReturnPointers(codeTable, dirCardDesc);
    this.writeInPointerTable(pointers, dirCardIndx);
  }

  // Helpers
  private getNode(directoryCardDesc: string): No[] {
    const charactersFromFile = this.getCharactersFromFile(directoryCardDesc);
    const frequencyOfNodes = new Map<string, number>([...new Set(charactersFromFile)].map(
      x => [x, charactersFromFile.filter(y => y === x).length] as [string, number]
    ));

    return Array.from(frequencyOfNodes, ([caractere, freq]) => new No(caractere, freq));
  }

  private getCharactersFromFile(diretorioCardDesc: string): string[] {
    const cardDescBuffer = fs.readFileSync(diretorioCardDesc);
    const caracteresDoArquivo: string[] = [];
    for (let i = 0; i < cardDescBuffer.length; i += 2) {
      caracteresDoArquivo.push(String.fromCharCode(cardDescBuffer.readInt16LE(i)));
    }
    return caracteresDoArquivo;
  }

  private createTree(tabelaDeNosOrdenada: No[]): No[] {
    while (tabelaDeNosOrdenada.length > 1) {
      const no1 = tabelaDeNosOrdenada.shift();
      const no2 = tabelaDeNosOrdenada.shift();

      if (!no1 || !no2) {
        break;
      }

      const novoNo = new No(null, no1.frequency + no2.frequency, no1, no2);
      tabelaDeNosOrdenada.push(novoNo);
      tabelaDeNosOrdenada.sort((a, b) => a.frequency - b.frequency);
    }
    return tabelaDeNosOrdenada;
  }

  private getCodeTable(noRaiz: No): Map<string, string> {
    const tabela = new Map<string, string>();
    this.auxilieConstrucaoDeTabela(noRaiz, "", tabela);
    return tabela;
  }

  private auxilieConstrucaoDeTabela(no: No, bit: string, tabela: Map<string, string>) {
    if (!no.ehFolha()) {
      this.auxilieConstrucaoDeTabela(no.noEsquerdo!, bit + "0", tabela);
      this.auxilieConstrucaoDeTabela(no.noDireito!, bit + "1", tabela);
    } else {
      if (no.caractere !== null) {
        tabela.set(no.caractere, bit);
      }
    }
  }

  private createTreeNodeGameFormat(tabela: Map<string, string>, dirCardHuff: string): void {

    let bufferNovaArvore = Buffer.alloc(0x500);
    let backupNovaArvore: Buffer;
    let proximoIndereco = 0;
    let ultimoEnderecoDeEscrita = 0;
    let padding = 0;
    let inderecoLeitura = 0;
    let resultadoValor = 0;
    let caminhoAlternativo = false;

    tabela.forEach((value, key) => {
      for (let i = 0; i < value.length; i++) {
        backupNovaArvore = Buffer.from(bufferNovaArvore);
        if (value[i] === '1') {
          proximoIndereco += 2;
          caminhoAlternativo = true;
        }

        inderecoLeitura = proximoIndereco;
        resultadoValor = this.verificarSeTemValorEscrito(backupNovaArvore, inderecoLeitura);

        if (resultadoValor === 0) {
          if (caminhoAlternativo) {
            proximoIndereco = ultimoEnderecoDeEscrita;
            caminhoAlternativo = false;
          } else {
            proximoIndereco += 4;
          }

          bufferNovaArvore.writeUInt16LE(proximoIndereco, inderecoLeitura);

        } else {
          proximoIndereco = resultadoValor;
        }
      }

      bufferNovaArvore.writeUInt32LE(padding, proximoIndereco);
      bufferNovaArvore.writeUInt16LE(key.charCodeAt(0), proximoIndereco + 4)

      ultimoEnderecoDeEscrita = proximoIndereco + 6;
      proximoIndereco = 0;
    });

    backupNovaArvore = Buffer.from(bufferNovaArvore);
    const arvoreFinal = backupNovaArvore.slice(0, ultimoEnderecoDeEscrita);
    fs.writeFileSync(dirCardHuff, arvoreFinal);
  }

  private verificarSeTemValorEscrito(buffer: Buffer, offset: number): number {
    return buffer.readInt16LE(offset);
  }

  private compressWithCodeTablesAndReturnPointers(tabelaDeCodigos: Map<string, string>, diretorioCardDesc: string): number[] {
    const caracteresDoArquivo = this.getCharactersFromFile(diretorioCardDesc);
    let fluxoComprimido = "";

    for (const caractere of caracteresDoArquivo) {
      const codigoHuffman = tabelaDeCodigos.get(caractere);
      if (caractere === '\0') {
        fluxoComprimido += codigoHuffman + ",";
      } else {
        fluxoComprimido += codigoHuffman;
      }
    }

    const fluxoEPonteiros = this.calculePonteiros(fluxoComprimido);
    fluxoComprimido = fluxoEPonteiros.fluxoComprimido.toString();

    if (fluxoComprimido.length % 8 !== 0) {
      fluxoComprimido = fluxoComprimido.padEnd(fluxoComprimido.length + (8 - (fluxoComprimido.length % 8)), "0");
    }

    const arquivoComprimido = this.stringParaBytes(fluxoComprimido);
    fs.writeFileSync(diretorioCardDesc, arquivoComprimido);
    return fluxoEPonteiros.ponteiros;
  }

  private calculePonteiros(fluxo: string): { fluxoComprimido: string, ponteiros: number[] } {
    let contadorDeBits = 0;
    let fluxoComprimido = "";
    let ponteiros: number[] = [];

    for (const char of fluxo) {
      if (char === ',') {
        ponteiros.push(contadorDeBits);
      } else {
        contadorDeBits++;
        fluxoComprimido += char;
      }
    }

    return { fluxoComprimido, ponteiros };
  }

  private stringParaBytes(fluxoEmBinario: string): Buffer {
    let bytesEmBinario = fluxoEmBinario.match(/.{1,8}/g) || [];
    let arquivoComprimido = bytesEmBinario.map(binario => parseInt(binario, 2));
    return Buffer.from(arquivoComprimido);
  }

  private writeInPointerTable(ponteiros: number[], dirCardIndx: string): void {
    const posicaoInicial = 12; // Examine
    const existingIdxContent = fs.readFileSync(dirCardIndx);
    const buffer = Buffer.alloc(existingIdxContent.length + 8);
    let offset = posicaoInicial;

    existingIdxContent.copy(buffer);

    for (const ponteiro of ponteiros) {
      buffer.writeInt32LE(ponteiro, offset);
      offset += 8;
    }

    fs.writeFileSync(dirCardIndx, buffer);
  }

}

class No {
  public caractere: string | null;
  public frequency: number;
  public noEsquerdo: No | null;
  public noDireito: No | null;

  constructor(caractere: string | null, frequencia: number, noEsquerdo?: No, noDireito?: No) {
    this.caractere = caractere;
    this.frequency = frequencia;
    this.noEsquerdo = noEsquerdo || null;
    this.noDireito = noDireito || null;
  }

  public ehFolha(): boolean {
    return this.noEsquerdo === null && this.noDireito === null;
  }
}

export { Huffman };
