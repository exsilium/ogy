function readUTF16String(buffer: Buffer, offset: number): { str: string, newOffset: number } {
  const bytes: number[] = [];
  while (offset + 1 < buffer.length) {
    const byte1 = buffer[offset];
    const byte2 = buffer[offset + 1];
    // Check for UTF-16LE null terminator (0x0000)
    if (byte1 === 0x00 && byte2 === 0x00) {
      offset += 2;
      break;
    }
    bytes.push(byte1, byte2);
    offset += 2;
  }
  const str = Buffer.from(bytes).toString('utf16le');
  return { str, newOffset: offset };
}

function readLatin1StringWithAlignment(buffer: Buffer, offset: number): { str: string, newOffset: number } {
  const bytes: number[] = [];
  while (offset < buffer.length) {
    const byte = buffer[offset];
    if (byte === 0x00) {
      offset += 1;
      // Check for alignment padding (optional second null byte)
      if (offset < buffer.length && buffer[offset] === 0x00) {
        offset += 1;
      }
      break;
    }
    bytes.push(byte);
    offset += 1;
  }
  const str = Buffer.from(bytes).toString('latin1');
  return { str, newOffset: offset };
}

export function parseStrings(buffer: Buffer, startOffset: number): string[] {
  const strings: string[] = [];
  let offset = startOffset;

  while (offset < buffer.length) {
    // Check for three consecutive zero bytes
    if (
      offset + 2 < buffer.length &&
      buffer[offset] === 0x00 && buffer[offset + 1] === 0x00 &&
      buffer[offset + 2] === 0x00
    ) {
      break;
    }

    // Read Japanese string (UTF-16LE)
    const { newOffset: offsetAfterJapanese } = readUTF16String(buffer, offset);
    offset = offsetAfterJapanese;

    let englishString = '';

    // Read the next 5 strings (English, German, French, Italian, Spanish)
    for (let i = 0; i < 5; i++) {
      const { str, newOffset } = readLatin1StringWithAlignment(buffer, offset);
      if (i === 0) {
        // English string
        englishString = str;
      }
      offset = newOffset;
    }

    // Add English string to array
    strings.push(englishString);
  }

  return strings;
}
