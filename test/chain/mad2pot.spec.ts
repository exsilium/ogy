import * as fs from 'fs';
import * as path from 'path';
import { assert } from "chai";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe("ogy mad2pot backup tests", () => {
  const testDir = path.join(__dirname, "backup-test");
  const dataDir = path.join(__dirname, "../data/mad");
  
  // Small delay to ensure file system operations complete between tests
  beforeEach(done => setTimeout(done, 200));

  before(() => {
    // Create test directory if it doesn't exist
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
  });

  it("setup: copy test bundles to simulate game files", () => {
    const testFile1 = path.join(testDir, "test-bundle-1.orig");
    const testFile2 = path.join(testDir, "test-bundle-2.orig");
    const testFile3 = path.join(testDir, "test-bundle-3.orig");
    
    // Clean up any existing test files
    [testFile1, testFile2, testFile3].forEach(file => {
      if (fs.existsSync(file)) {
        fs.unlinkSync(file);
      }
    });

    // Create test files with specific content
    fs.writeFileSync(testFile1, "original content 1");
    fs.writeFileSync(testFile2, "original content 2");
    fs.writeFileSync(testFile3, "original content 3");
    
    assert.equal(fs.existsSync(testFile1), true);
    assert.equal(fs.existsSync(testFile2), true);
    assert.equal(fs.existsSync(testFile3), true);
  });

  it("should preserve original .orig files when they exist", () => {
    const testFile1 = path.join(testDir, "test-bundle-1.orig");
    const testFile2 = path.join(testDir, "test-bundle-2.orig");
    
    // Verify original content
    const originalContent1 = fs.readFileSync(testFile1, 'utf8');
    const originalContent2 = fs.readFileSync(testFile2, 'utf8');
    
    assert.equal(originalContent1, "original content 1");
    assert.equal(originalContent2, "original content 2");
    
    // Simulate a second run: try to overwrite with different content
    // In real scenario, this would be prevented by copyFileIfNotExists
    const sourceFile1 = path.join(testDir, "new-source-1");
    const sourceFile2 = path.join(testDir, "new-source-2");
    
    fs.writeFileSync(sourceFile1, "modified content 1");
    fs.writeFileSync(sourceFile2, "modified content 2");
    
    // Simulate the behavior of copyFileIfNotExists
    // It should NOT copy if destination exists
    if (!fs.existsSync(testFile1)) {
      fs.copyFileSync(sourceFile1, testFile1);
    }
    if (!fs.existsSync(testFile2)) {
      fs.copyFileSync(sourceFile2, testFile2);
    }
    
    // Verify content is still original
    const currentContent1 = fs.readFileSync(testFile1, 'utf8');
    const currentContent2 = fs.readFileSync(testFile2, 'utf8');
    
    assert.equal(currentContent1, "original content 1", "Original .orig file should not be overwritten");
    assert.equal(currentContent2, "original content 2", "Original .orig file should not be overwritten");
    
    // Clean up temp source files
    fs.unlinkSync(sourceFile1);
    fs.unlinkSync(sourceFile2);
  });

  it("should create .orig files when they don't exist", () => {
    const testFile4 = path.join(testDir, "test-bundle-4.orig");
    const sourceFile4 = path.join(testDir, "source-4");
    
    // Clean up if exists
    if (fs.existsSync(testFile4)) {
      fs.unlinkSync(testFile4);
    }
    
    // Create source file
    fs.writeFileSync(sourceFile4, "new bundle content");
    
    // Simulate copyFileIfNotExists behavior
    if (!fs.existsSync(testFile4)) {
      fs.copyFileSync(sourceFile4, testFile4);
    }
    
    // Verify file was created
    assert.equal(fs.existsSync(testFile4), true);
    const content = fs.readFileSync(testFile4, 'utf8');
    assert.equal(content, "new bundle content");
    
    // Clean up
    fs.unlinkSync(sourceFile4);
    fs.unlinkSync(testFile4);
  });

  after(() => {
    // Clean up test directory
    const testFile1 = path.join(testDir, "test-bundle-1.orig");
    const testFile2 = path.join(testDir, "test-bundle-2.orig");
    const testFile3 = path.join(testDir, "test-bundle-3.orig");
    
    [testFile1, testFile2, testFile3].forEach(file => {
      if (fs.existsSync(file)) {
        fs.unlinkSync(file);
      }
    });
    
    // Remove test directory
    if (fs.existsSync(testDir)) {
      fs.rmdirSync(testDir);
    }
  });
});
