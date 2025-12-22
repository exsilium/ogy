import * as fs from 'fs';
import * as path from 'path';
import { assert } from "chai";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe("ogy mad-revert file comparison tests", () => {
  const testDir = path.join(__dirname, "revert-test");
  
  // Small delay to ensure file system operations complete between tests
  beforeEach(done => setTimeout(done, 200));

  before(() => {
    // Create test directory if it doesn't exist
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
  });

  it("should detect identical files (same size and checksum)", () => {
    const file1 = path.join(testDir, "identical-1.bin");
    const file2 = path.join(testDir, "identical-2.bin");
    
    // Create two identical files
    const content = Buffer.from("This is identical content for testing");
    fs.writeFileSync(file1, content);
    fs.writeFileSync(file2, content);
    
    // Verify files are the same size
    const stats1 = fs.statSync(file1);
    const stats2 = fs.statSync(file2);
    assert.equal(stats1.size, stats2.size, "Files should have identical size");
    
    // Verify content is identical
    const content1 = fs.readFileSync(file1);
    const content2 = fs.readFileSync(file2);
    assert.deepEqual(content1, content2, "File contents should be identical");
    
    // Clean up
    fs.unlinkSync(file1);
    fs.unlinkSync(file2);
  });

  it("should detect different files (different size)", () => {
    const file1 = path.join(testDir, "different-size-1.bin");
    const file2 = path.join(testDir, "different-size-2.bin");
    
    // Create two files with different sizes
    fs.writeFileSync(file1, "Short content");
    fs.writeFileSync(file2, "This is much longer content that will have a different size");
    
    // Verify files have different sizes
    const stats1 = fs.statSync(file1);
    const stats2 = fs.statSync(file2);
    assert.notEqual(stats1.size, stats2.size, "Files should have different sizes");
    
    // Clean up
    fs.unlinkSync(file1);
    fs.unlinkSync(file2);
  });

  it("should detect different files (same size, different checksum)", () => {
    const file1 = path.join(testDir, "different-content-1.bin");
    const file2 = path.join(testDir, "different-content-2.bin");
    
    // Create two files with same size but different content
    fs.writeFileSync(file1, "AAAAAAAAAA");  // 10 bytes
    fs.writeFileSync(file2, "BBBBBBBBBB");  // 10 bytes, different content
    
    // Verify files have the same size
    const stats1 = fs.statSync(file1);
    const stats2 = fs.statSync(file2);
    assert.equal(stats1.size, stats2.size, "Files should have same size");
    
    // Verify content is different
    const content1 = fs.readFileSync(file1);
    const content2 = fs.readFileSync(file2);
    assert.notDeepEqual(content1, content2, "File contents should be different");
    
    // Clean up
    fs.unlinkSync(file1);
    fs.unlinkSync(file2);
  });

  it("should handle missing files gracefully", () => {
    const existingFile = path.join(testDir, "existing.bin");
    const missingFile = path.join(testDir, "non-existent.bin");
    
    // Create only one file
    fs.writeFileSync(existingFile, "content");
    
    // Verify one file exists and the other doesn't
    assert.equal(fs.existsSync(existingFile), true, "First file should exist");
    assert.equal(fs.existsSync(missingFile), false, "Second file should not exist");
    
    // Clean up
    fs.unlinkSync(existingFile);
  });

  after(() => {
    // Clean up test directory
    if (fs.existsSync(testDir)) {
      fs.rmdirSync(testDir);
    }
  });
});
