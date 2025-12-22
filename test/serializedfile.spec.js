import * as fs from 'fs';
import * as path from 'path';
import { assert } from 'chai';
import { fileURLToPath } from 'url';
import { SerializedFileReader, parseSerializedFile, validateHeader } from '../src/serializedfile.js';
import { extractCAB } from '../src/assetbundle.js';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
describe('SerializedFile Parser - Phase 1', () => {
    describe('SerializedFileReader', () => {
        it('should create a reader with a buffer', () => {
            const buffer = Buffer.alloc(100);
            const reader = new SerializedFileReader(buffer);
            assert.isNotNull(reader);
            assert.equal(reader.getOffset(), 0);
            assert.equal(reader.isLittleEndian(), false); // Default is big-endian
        });
        it('should read UInt32 in big-endian mode', () => {
            const buffer = Buffer.from([0x00, 0x00, 0x00, 0x2A]); // 42 in big-endian
            const reader = new SerializedFileReader(buffer);
            const value = reader.readUInt32();
            assert.equal(value, 42);
            assert.equal(reader.getOffset(), 4);
        });
        it('should read UInt64 in big-endian mode', () => {
            const buffer = Buffer.from([0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x2A]); // 42 in big-endian
            const reader = new SerializedFileReader(buffer);
            const value = reader.readUInt64();
            assert.equal(value, BigInt(42));
            assert.equal(reader.getOffset(), 8);
        });
        it('should read null-terminated strings', () => {
            const buffer = Buffer.from('Hello\x00World');
            const reader = new SerializedFileReader(buffer);
            const str = reader.readStringToNull();
            assert.equal(str, 'Hello');
            assert.equal(reader.getOffset(), 6);
        });
        it('should align to 4-byte boundary', () => {
            const buffer = Buffer.alloc(20);
            const reader = new SerializedFileReader(buffer);
            reader.setOffset(1);
            reader.align();
            assert.equal(reader.getOffset(), 4);
            reader.setOffset(5);
            reader.align();
            assert.equal(reader.getOffset(), 8);
            reader.setOffset(8);
            reader.align();
            assert.equal(reader.getOffset(), 8); // Already aligned
        });
        it('should read bytes', () => {
            const buffer = Buffer.from([1, 2, 3, 4, 5]);
            const reader = new SerializedFileReader(buffer);
            const bytes = reader.readBytes(3);
            assert.deepEqual(bytes, Buffer.from([1, 2, 3]));
            assert.equal(reader.getOffset(), 3);
        });
    });
    describe('Header Parsing', () => {
        it('should parse a basic SerializedFile header (version < 22)', () => {
            // Create a mock header for version 21
            const buffer = Buffer.alloc(50);
            let offset = 0;
            // Metadata size (UInt32 BE): 1000
            buffer.writeUInt32BE(1000, offset);
            offset += 4;
            // File size (UInt32 BE): 50000
            buffer.writeUInt32BE(50000, offset);
            offset += 4;
            // Version (UInt32 BE): 21
            buffer.writeUInt32BE(21, offset);
            offset += 4;
            // Data offset (UInt32 BE): 2000
            buffer.writeUInt32BE(2000, offset);
            offset += 4;
            // Endianness (UInt8): 0 (big-endian)
            buffer.writeUInt8(0, offset);
            offset += 1;
            // Reserved (3 bytes): zeros
            buffer.writeUInt8(0, offset);
            buffer.writeUInt8(0, offset + 1);
            buffer.writeUInt8(0, offset + 2);
            const reader = new SerializedFileReader(buffer);
            const header = reader.parseHeader();
            assert.equal(header.metadataSize, 1000);
            assert.equal(header.fileSize, BigInt(50000));
            assert.equal(header.version, 21);
            assert.equal(header.dataOffset, BigInt(2000));
            assert.equal(header.endianness, 0);
            assert.equal(reader.isLittleEndian(), false);
        });
        it('should parse a SerializedFile header (version >= 22)', () => {
            // Create a mock header for version 22
            const buffer = Buffer.alloc(50);
            let offset = 0;
            // Metadata size (UInt32 BE): 2000
            buffer.writeUInt32BE(2000, offset);
            offset += 4;
            // File size (Int64 BE): 100000
            buffer.writeBigInt64BE(BigInt(100000), offset);
            offset += 8;
            // Version (UInt32 BE): 22
            buffer.writeUInt32BE(22, offset);
            offset += 4;
            // Data offset (Int64 BE): 3000
            buffer.writeBigInt64BE(BigInt(3000), offset);
            offset += 8;
            // Endianness (UInt8): 1 (little-endian)
            buffer.writeUInt8(1, offset);
            offset += 1;
            // Reserved (3 bytes): zeros
            buffer.writeUInt8(0, offset);
            buffer.writeUInt8(0, offset + 1);
            buffer.writeUInt8(0, offset + 2);
            const reader = new SerializedFileReader(buffer);
            const header = reader.parseHeader();
            assert.equal(header.metadataSize, 2000);
            assert.equal(header.fileSize, BigInt(100000));
            assert.equal(header.version, 22);
            assert.equal(header.dataOffset, BigInt(3000));
            assert.equal(header.endianness, 1);
            assert.equal(reader.isLittleEndian(), true);
        });
        it('should detect little-endian mode', () => {
            const buffer = Buffer.alloc(50);
            let offset = 0;
            buffer.writeUInt32BE(1000, offset);
            offset += 4;
            buffer.writeUInt32BE(50000, offset);
            offset += 4;
            buffer.writeUInt32BE(21, offset);
            offset += 4;
            buffer.writeUInt32BE(2000, offset);
            offset += 4;
            // Set endianness to little-endian
            buffer.writeUInt8(1, offset);
            const reader = new SerializedFileReader(buffer);
            const header = reader.parseHeader();
            assert.equal(header.endianness, 1);
            assert.equal(reader.isLittleEndian(), true);
        });
    });
    describe('Header Validation', () => {
        it('should validate a correct header', () => {
            const header = {
                metadataSize: 2000,
                fileSize: BigInt(100000),
                version: 22,
                dataOffset: BigInt(3000),
                endianness: 1,
                reserved: Buffer.alloc(3)
            };
            assert.isTrue(validateHeader(header));
        });
        it('should reject header with invalid version', () => {
            const header = {
                metadataSize: 2000,
                fileSize: BigInt(100000),
                version: 0, // Invalid
                dataOffset: BigInt(3000),
                endianness: 1,
                reserved: Buffer.alloc(3)
            };
            assert.isFalse(validateHeader(header));
        });
        it('should reject header with invalid version (too high)', () => {
            const header = {
                metadataSize: 2000,
                fileSize: BigInt(100000),
                version: 1000, // Invalid
                dataOffset: BigInt(3000),
                endianness: 1,
                reserved: Buffer.alloc(3)
            };
            assert.isFalse(validateHeader(header));
        });
        it('should reject header with invalid endianness', () => {
            const header = {
                metadataSize: 2000,
                fileSize: BigInt(100000),
                version: 22,
                dataOffset: BigInt(3000),
                endianness: 5, // Invalid
                reserved: Buffer.alloc(3)
            };
            assert.isFalse(validateHeader(header));
        });
        it('should reject header with negative metadata size', () => {
            const header = {
                metadataSize: -100, // Invalid
                fileSize: BigInt(100000),
                version: 22,
                dataOffset: BigInt(3000),
                endianness: 1,
                reserved: Buffer.alloc(3)
            };
            assert.isFalse(validateHeader(header));
        });
        it('should reject header with unreasonably large metadata size', () => {
            const header = {
                metadataSize: 200000, // Invalid (too large)
                fileSize: BigInt(100000),
                version: 22,
                dataOffset: BigInt(3000),
                endianness: 1,
                reserved: Buffer.alloc(3)
            };
            assert.isFalse(validateHeader(header));
        });
    });
    describe('Real MAD Bundle Tests', () => {
        const bundlePath = path.join(__dirname, 'data/mad/CARD_Name-7438cca8.bundle');
        it('should parse real CARD_Name bundle header', function () {
            if (!fs.existsSync(bundlePath)) {
                this.skip();
                return;
            }
            const bundleData = fs.readFileSync(bundlePath);
            const cabData = extractCAB(bundleData);
            if (!cabData) {
                assert.fail('Failed to extract CAB from bundle');
                return;
            }
            const result = parseSerializedFile(cabData);
            assert.isNotNull(result);
            if (result) {
                const { header, reader } = result;
                // Validate header
                assert.isTrue(validateHeader(header));
                // Check reasonable values
                assert.isAbove(header.metadataSize, 0);
                assert.isBelow(header.metadataSize, 100000);
                assert.isAbove(header.version, 0);
                assert.isBelow(header.version, 100);
                assert.isTrue(header.fileSize > BigInt(0));
                assert.isTrue(header.dataOffset > BigInt(0));
                // Log the parsed header for inspection
                console.log('\n📋 Real MAD Bundle Header:');
                console.log(`  Version: ${header.version}`);
                console.log(`  Metadata size: ${header.metadataSize} bytes`);
                console.log(`  File size: ${header.fileSize} bytes`);
                console.log(`  Data offset: ${header.dataOffset}`);
                console.log(`  Endianness: ${header.endianness === 0 ? 'big-endian' : 'little-endian'}`);
            }
        });
        it('should parse multiple MAD bundles', function () {
            const bundles = [
                'CARD_Name-7438cca8.bundle',
                'CARD_Desc-21ae1efa.bundle',
                'CARD_Indx-507764bc.bundle'
            ];
            for (const bundleName of bundles) {
                const testBundlePath = path.join(__dirname, 'data/mad', bundleName);
                if (!fs.existsSync(testBundlePath)) {
                    console.log(`  ⏭️  Skipping ${bundleName} (not found)`);
                    continue;
                }
                const bundleData = fs.readFileSync(testBundlePath);
                const cabData = extractCAB(bundleData);
                if (!cabData) {
                    assert.fail(`Failed to extract CAB from ${bundleName}`);
                    continue;
                }
                const result = parseSerializedFile(cabData);
                assert.isNotNull(result, `Failed to parse ${bundleName}`);
                if (result) {
                    const { header } = result;
                    assert.isTrue(validateHeader(header), `Invalid header for ${bundleName}`);
                    console.log(`  ✅ ${bundleName}: version ${header.version}, size ${header.fileSize}`);
                }
            }
        });
    });
    describe('Error Handling', () => {
        it('should handle empty buffer gracefully', () => {
            const buffer = Buffer.alloc(0);
            const result = parseSerializedFile(buffer);
            assert.isNull(result);
        });
        it('should handle buffer too small for header', () => {
            const buffer = Buffer.alloc(10); // Too small
            const result = parseSerializedFile(buffer);
            assert.isNull(result);
        });
        it('should handle corrupted header data', () => {
            const buffer = Buffer.alloc(50);
            // Write invalid values
            buffer.writeUInt32BE(0xFFFFFFFF, 0); // Invalid metadata size
            buffer.writeUInt32BE(0xFFFFFFFF, 4);
            buffer.writeUInt32BE(0, 8); // Invalid version
            const result = parseSerializedFile(buffer);
            assert.isNull(result);
        });
    });
});
//# sourceMappingURL=serializedfile.spec.js.map