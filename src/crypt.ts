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

/**
 * Brute-force helper to discover the correct crypto key.
 *
 * Starts at 0x00 and tries each key up to 0xFF. For each candidate key it
 * applies the same decryption algorithm used in `decrypt()` and attempts
 * to inflate the result with zlib. The first key for which inflation
 * succeeds is returned.
 *
 * If no key succeeds, this function throws an Error.
 */
export function findKey(data: Buffer): number {
  for (let cryptoKey = 0x00; cryptoKey <= 0xFF; cryptoKey++) {
    const decryptedData = Buffer.from(data);

    try {
      for (let i = 0; i < decryptedData.length; i++) {
        let v = i + cryptoKey + 0x23D;
        v *= cryptoKey;
        v ^= i % 7;
        decryptedData[i] ^= v & 0xFF;
      }

      // If inflateSync doesn't throw, we've likely found a valid key.
      zlib.inflateSync(decryptedData);
      return cryptoKey;
    } catch {
      // Ignore and try the next key.
    }
  }

  throw new Error('No valid crypto key found in range 0x00–0xFF for the provided data.');
}

export function encrypt(data: Buffer, cryptoKey: number): Buffer {
  // First, compress the data
  const compressedData = zlib.deflateSync(data);
  const encryptedData = Buffer.from(compressedData); // Copy to modify

  for (let i = 0; i < encryptedData.length; i++) {
    let v = i + cryptoKey + 0x23D;
    v *= cryptoKey;
    v ^= i % 7;
    encryptedData[i] ^= v & 0xFF; // Apply the encryption
  }

  return encryptedData;
}
