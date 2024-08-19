import * as zlib from 'zlib';

export function decrypt(data: Buffer, cryptoKey: number): Buffer {
  const decryptedData = Buffer.from(data); // Create a copy of the data to modify
  try {
    for (let i = 0; i < decryptedData.length; i++) {
      let v = i + cryptoKey + 0x23D;
      v *= cryptoKey;
      v ^= i % 7;
      decryptedData[i] ^= v & 0xFF; // Apply the decryption
    }

    // Attempt to decompress the decrypted data
    return zlib.inflateSync(decryptedData);
  } catch (err) {
    // Check if it's a zlib error or another type of error
    if (err instanceof Error) {
      console.error(`zlib error: ${err.message}`);
      console.error(`Error possibly caused by incorrect crypto key: 0x${cryptoKey.toString(16)}`);
    } else {
      console.error('Unexpected error during decryption:', err);
    }
    return Buffer.alloc(0); // Return an empty buffer on failure
  }
}