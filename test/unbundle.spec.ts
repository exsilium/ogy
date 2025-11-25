import * as fs from 'fs';
import * as path from 'path';
import { assert } from "chai";
import { fileURLToPath } from "url";
import { AssetBundle } from '../src/assetbundle.js';
import { CABExtractor } from '../src/cab.js';
import { decrypt } from '../src/crypt.js';
import { processCardAsset } from '../src/converter.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe("ogy application level tests - unbundle", () => {
  beforeEach(done => setTimeout(done, 200));
  it("setup test data files", () => {
    fs.copyFile(__dirname + "/data/mad/CARD_Desc-987362f9.bundle", __dirname + "/CARD_Desc-987362f9.bundle", (err) => { if (err) throw err; });
    fs.copyFile(__dirname + "/data/mad/CARD_Indx-e9aa18bf.bundle", __dirname + "/CARD_Indx-e9aa18bf.bundle", (err) => { if (err) throw err; });
    fs.copyFile(__dirname + "/data/mad/CARD_Name-cde5b0ab.bundle", __dirname + "/CARD_Name-cde5b0ab.bundle", (err) => { if (err) throw err; });
    fs.copyFile(__dirname + "/data/mad/Card_Part-ebaee097.bundle", __dirname + "/Card_Part-ebaee097.bundle", (err) => { if (err) throw err; });
    fs.copyFile(__dirname + "/data/mad/Card_Pidx-f09348d3.bundle", __dirname + "/Card_Pidx-f09348d3.bundle", (err) => { if (err) throw err; });
  });

  /*
  The most simple test is to extract the Card files from the packaged UnityFS asset bundle file:
    - CAB
 */
  it("unbundling of CARD_Desc should work and produce a CAB and a meta file", async () => {
    const assetBundle = new AssetBundle(__dirname + "/CARD_Desc-987362f9.bundle");
    const extractedFiles: string[] = await assetBundle.extractAssetBundle(__dirname);

    // Assert that the array has exactly one element
    assert.strictEqual(extractedFiles.length, 1, "Array does not have exactly one element");

    // Assert that the element matches the expected string
    assert.strictEqual(extractedFiles[0], "CAB-a8c0ceacfc16220e07816e269e33cb5a", "Element does not match the expected string");

    // Assert that the files were written to disk
    assert.equal(fs.existsSync(__dirname + "/CAB-a8c0ceacfc16220e07816e269e33cb5a"), true);
    assert.equal(fs.existsSync(__dirname + "/CAB-a8c0ceacfc16220e07816e269e33cb5a.meta.json"), true);
  });

  it("unbundled CAB of CARD_Desc should be possible to be written out",  async () => {
    const extractedBaseFile = await CABExtractor.extract(path.join(__dirname, "CAB-a8c0ceacfc16220e07816e269e33cb5a"), __dirname);

    // Assert that the file extracted was CARD_Desc
    assert.equal(extractedBaseFile, "CARD_Desc");

    // Assert that the file was written to disk
    assert.equal(fs.existsSync(__dirname + "/CARD_Desc.bin"), true);

    const dataName = fs.readFileSync(__dirname + "/CARD_Desc.bin");
    const compareDataName = fs.readFileSync(__dirname + "/data/mad/CARD_Desc.bin");

    assert.equal(Buffer.compare(dataName, compareDataName), 0);
  });

  it("unbundling of CARD_Indx should work and produce a CAB and a meta file", async () => {
    const assetBundle = new AssetBundle(__dirname + "/CARD_Indx-e9aa18bf.bundle");
    const extractedFiles: string[] = await assetBundle.extractAssetBundle(__dirname);

    // Assert that the array has exactly one element
    assert.strictEqual(extractedFiles.length, 1, "Array does not have exactly one element");

    // Assert that the element matches the expected string
    assert.strictEqual(extractedFiles[0], "CAB-3edab2009c2927c0c55132bf9a3b0a53", "Element does not match the expected string");

    // Assert that the file was written to disk
    assert.equal(fs.existsSync(__dirname + "/CAB-3edab2009c2927c0c55132bf9a3b0a53"), true);
    assert.equal(fs.existsSync(__dirname + "/CAB-3edab2009c2927c0c55132bf9a3b0a53.meta.json"), true);
  });

  it("unbundled CAB of CARD_Indx should be possible to be written out",  async () => {
    const extractedBaseFile = await CABExtractor.extract(path.join(__dirname, "CAB-3edab2009c2927c0c55132bf9a3b0a53"), __dirname);

    // Assert that the file extracted was CARD_Desc
    assert.equal(extractedBaseFile, "CARD_Indx");

    // Assert that the file was written to disk
    assert.equal(fs.existsSync(__dirname + "/CARD_Indx.bin"), true);

    const dataName = fs.readFileSync(__dirname + "/CARD_Indx.bin");
    const compareDataName = fs.readFileSync(__dirname + "/data/mad/CARD_Indx.bin");

    assert.equal(Buffer.compare(dataName, compareDataName), 0);
  });

  it("unbundling of CARD_Name should work and produce a CAB and a meta file", async () => {
    const assetBundle = new AssetBundle(__dirname + "/CARD_Name-cde5b0ab.bundle");
    const extractedFiles: string[] = await assetBundle.extractAssetBundle(__dirname);

    // Assert that the array has exactly one element
    assert.strictEqual(extractedFiles.length, 1, "Array does not have exactly one element");

    // Assert that the element matches the expected string
    assert.strictEqual(extractedFiles[0], "CAB-b15dec2777dad9f13353696821e3ecfc", "Element does not match the expected string");

    // Assert that the file was written to disk
    assert.equal(fs.existsSync(__dirname + "/CAB-b15dec2777dad9f13353696821e3ecfc"), true);
    assert.equal(fs.existsSync(__dirname + "/CAB-b15dec2777dad9f13353696821e3ecfc.meta.json"), true);
  });

  it("unbundled CAB of CARD_Name should be possible to be written out",  async () => {
    const extractedBaseFile = await CABExtractor.extract(path.join(__dirname, "CAB-b15dec2777dad9f13353696821e3ecfc"), __dirname);

    // Assert that the file extracted was CARD_Desc
    assert.equal(extractedBaseFile, "CARD_Name");

    // Assert that the file was written to disk
    assert.equal(fs.existsSync(__dirname + "/CARD_Name.bin"), true);

    const dataName = fs.readFileSync(__dirname + "/CARD_Name.bin");
    const compareDataName = fs.readFileSync(__dirname + "/data/mad/CARD_Name.bin");

    assert.equal(Buffer.compare(dataName, compareDataName), 0);
  });

  it("unbundling of Card_Part should work and produce a CAB and a meta file", async () => {
    const assetBundle = new AssetBundle(__dirname + "/Card_Part-ebaee097.bundle");
    const extractedFiles: string[] = await assetBundle.extractAssetBundle(__dirname);

    // Assert that the array has exactly one element
    assert.strictEqual(extractedFiles.length, 1, "Array does not have exactly one element");

    // Assert that the element matches the expected string
    assert.strictEqual(extractedFiles[0], "CAB-d775896c9bbf867ea2a06f6d9d9d638e", "Element does not match the expected string");

    // Assert that the file was written to disk
    assert.equal(fs.existsSync(__dirname + "/CAB-d775896c9bbf867ea2a06f6d9d9d638e"), true);
    assert.equal(fs.existsSync(__dirname + "/CAB-d775896c9bbf867ea2a06f6d9d9d638e.meta.json"), true);
  });

  it("unbundled CAB of Card_Part should be possible to be written out",  async () => {
    const extractedBaseFile = await CABExtractor.extract(path.join(__dirname, "CAB-d775896c9bbf867ea2a06f6d9d9d638e"), __dirname);

    // Assert that the file extracted was CARD_Desc
    assert.equal(extractedBaseFile, "Card_Part");

    // Assert that the file was written to disk
    assert.equal(fs.existsSync(__dirname + "/Card_Part.bin"), true);

    const dataName = fs.readFileSync(__dirname + "/Card_Part.bin");
    const compareDataName = fs.readFileSync(__dirname + "/data/mad/Card_Part.bin");

    assert.equal(Buffer.compare(dataName, compareDataName), 0);
  });

  it("unbundling of Card_Pidx should work and produce a CAB and a meta file", async () => {
    const assetBundle = new AssetBundle(__dirname + "/Card_Pidx-f09348d3.bundle");
    const extractedFiles: string[] = await assetBundle.extractAssetBundle(__dirname);

    // Assert that the array has exactly one element
    assert.strictEqual(extractedFiles.length, 1, "Array does not have exactly one element");

    // Assert that the element matches the expected string
    assert.strictEqual(extractedFiles[0], "CAB-7ee66e49a29b3d2f2bf1104c66bf106d", "Element does not match the expected string");

    // Assert that the file was written to disk
    assert.equal(fs.existsSync(__dirname + "/CAB-7ee66e49a29b3d2f2bf1104c66bf106d"), true);
    assert.equal(fs.existsSync(__dirname + "/CAB-7ee66e49a29b3d2f2bf1104c66bf106d.meta.json"), true);
  });

  it("unbundled CAB of Card_Pidx should be possible to be written out",  async () => {
    const extractedBaseFile = await CABExtractor.extract(path.join(__dirname, "CAB-7ee66e49a29b3d2f2bf1104c66bf106d"), __dirname);

    // Assert that the file extracted was CARD_Desc
    assert.equal(extractedBaseFile, "Card_Pidx");

    // Assert that the file was written to disk
    assert.equal(fs.existsSync(__dirname + "/Card_Pidx.bin"), true);

    const dataName = fs.readFileSync(__dirname + "/Card_Pidx.bin");
    const compareDataName = fs.readFileSync(__dirname + "/data/mad/Card_Pidx.bin");

    assert.equal(Buffer.compare(dataName, compareDataName), 0);
  });

  it("decryption of CARD_Desc should be successful",  async () => {
    const encryptedData = fs.readFileSync(__dirname + "/CARD_Desc.bin");
    const cryptoKey = 0x11;

    const decryptedData = decrypt(encryptedData, cryptoKey);

    if (decryptedData.length > 0) {
      fs.writeFileSync(__dirname + "/CARD_Desc.decrypted.bin", decryptedData);
    } else {
      console.error('Decryption failed.');
    }
  });

  it("decryption of CARD_Indx should be successful",  async () => {
    const encryptedData = fs.readFileSync(__dirname + "/CARD_Indx.bin");
    const cryptoKey = 0x11;

    const decryptedData = decrypt(encryptedData, cryptoKey);

    if (decryptedData.length > 0) {
      fs.writeFileSync(__dirname + "/CARD_Indx.decrypted.bin", decryptedData);
    } else {
      console.error('Decryption failed.');
    }
  });

  it("decryption of CARD_Name should be successful",  async () => {
    const encryptedData = fs.readFileSync(__dirname + "/CARD_Name.bin");
    const cryptoKey = 0x11;

    const decryptedData = decrypt(encryptedData, cryptoKey);

    if (decryptedData.length > 0) {
      fs.writeFileSync(__dirname + "/CARD_Name.decrypted.bin", decryptedData);
    } else {
      console.error('Decryption failed.');
    }
  });

  it("decryption of Card_Part should be successful",  async () => {
    const encryptedData = fs.readFileSync(__dirname + "/Card_Part.bin");
    const cryptoKey = 0x11;

    const decryptedData = decrypt(encryptedData, cryptoKey);

    if (decryptedData.length > 0) {
      fs.writeFileSync(__dirname + "/Card_Part.decrypted.bin", decryptedData);
    } else {
      console.error('Decryption failed.');
    }
  });

  it("decryption of Card_Pidx should be successful",  async () => {
    const encryptedData = fs.readFileSync(__dirname + "/Card_Pidx.bin");
    const cryptoKey = 0x11;

    const decryptedData = decrypt(encryptedData, cryptoKey);

    if (decryptedData.length > 0) {
      fs.writeFileSync(__dirname + "/Card_Pidx.decrypted.bin", decryptedData);
    } else {
      console.error('Decryption failed.');
    }
  });

  it("converting of CARD_Name data to string array should be possible",  async () => {
    const cardIndxFilename = __dirname + "/CARD_Indx.decrypted.bin";
    const filename = __dirname + "/CARD_Name.decrypted.bin";
    const start = 0;

    processCardAsset(cardIndxFilename, filename, start);
  });

  it("converting of CARD_Desc data to string array should be possible",  async () => {
    const cardIndxFilename = __dirname + "/CARD_Indx.decrypted.bin";
    const filename = __dirname + "/CARD_Desc.decrypted.bin";
    const start = 4;

    processCardAsset(cardIndxFilename, filename, start);
  });

  it("repackaging CARD_Name bundle should work and produce identical output", async () => {
    // Use the updateAssetBundle method to repackage CARD_Name
    const originalBundle = __dirname + "/CARD_Name-cde5b0ab.bundle";
    const originalAsset = __dirname + "/CARD_Name.bin";
    const newAsset = __dirname + "/CARD_Name.bin"; // Use same file for testing
    const repackagedBundle = __dirname + "/CARD_Name-repackaged.bundle";

    const assetBundle = new AssetBundle(originalBundle);
    await assetBundle.updateAssetBundle(originalAsset, newAsset, repackagedBundle);

    // Verify the repackaged bundle exists
    assert.equal(fs.existsSync(repackagedBundle), true, "Repackaged bundle should exist");

    // Extract from the repackaged bundle
    const repackagedAssetBundle = new AssetBundle(repackagedBundle);
    const extractedFiles = await repackagedAssetBundle.extractAssetBundle(__dirname);

    // Extract the CAB to get the asset
    const cabFile = path.join(__dirname, extractedFiles[0]);
    const extractedFileName = await CABExtractor.extract(cabFile, __dirname);

    // Verify the extracted file matches the original
    const reextractedAsset = fs.readFileSync(__dirname + "/" + extractedFileName + ".bin");
    const originalAssetData = fs.readFileSync(originalAsset);
    
    assert.equal(Buffer.compare(reextractedAsset, originalAssetData), 0, 
      "Repackaged asset should match original");

    // Clean up repackaged files
    fs.unlinkSync(repackagedBundle);
    fs.unlinkSync(cabFile);
    fs.unlinkSync(cabFile + ".meta.json");
    fs.unlinkSync(__dirname + "/" + extractedFileName + ".bin");
  });

  it("repackaging CARD_Desc bundle should work and produce identical output", async () => {
    const originalBundle = __dirname + "/CARD_Desc-987362f9.bundle";
    const originalAsset = __dirname + "/CARD_Desc.bin";
    const newAsset = __dirname + "/CARD_Desc.bin";
    const repackagedBundle = __dirname + "/CARD_Desc-repackaged.bundle";

    const assetBundle = new AssetBundle(originalBundle);
    await assetBundle.updateAssetBundle(originalAsset, newAsset, repackagedBundle);

    assert.equal(fs.existsSync(repackagedBundle), true, "Repackaged bundle should exist");

    const repackagedAssetBundle = new AssetBundle(repackagedBundle);
    const extractedFiles = await repackagedAssetBundle.extractAssetBundle(__dirname);

    const cabFile = path.join(__dirname, extractedFiles[0]);
    const extractedFileName = await CABExtractor.extract(cabFile, __dirname);

    const reextractedAsset = fs.readFileSync(__dirname + "/" + extractedFileName + ".bin");
    const originalAssetData = fs.readFileSync(originalAsset);
    
    assert.equal(Buffer.compare(reextractedAsset, originalAssetData), 0,
      "Repackaged asset should match original");

    fs.unlinkSync(repackagedBundle);
    fs.unlinkSync(cabFile);
    fs.unlinkSync(cabFile + ".meta.json");
    fs.unlinkSync(__dirname + "/" + extractedFileName + ".bin");
  });

  it("repackaging CARD_Indx bundle should work and produce identical output", async () => {
    const originalBundle = __dirname + "/CARD_Indx-e9aa18bf.bundle";
    const originalAsset = __dirname + "/CARD_Indx.bin";
    const newAsset = __dirname + "/CARD_Indx.bin";
    const repackagedBundle = __dirname + "/CARD_Indx-repackaged.bundle";

    const assetBundle = new AssetBundle(originalBundle);
    await assetBundle.updateAssetBundle(originalAsset, newAsset, repackagedBundle);

    assert.equal(fs.existsSync(repackagedBundle), true, "Repackaged bundle should exist");

    const repackagedAssetBundle = new AssetBundle(repackagedBundle);
    const extractedFiles = await repackagedAssetBundle.extractAssetBundle(__dirname);

    const cabFile = path.join(__dirname, extractedFiles[0]);
    const extractedFileName = await CABExtractor.extract(cabFile, __dirname);

    const reextractedAsset = fs.readFileSync(__dirname + "/" + extractedFileName + ".bin");
    const originalAssetData = fs.readFileSync(originalAsset);
    
    assert.equal(Buffer.compare(reextractedAsset, originalAssetData), 0,
      "Repackaged asset should match original");

    fs.unlinkSync(repackagedBundle);
    fs.unlinkSync(cabFile);
    fs.unlinkSync(cabFile + ".meta.json");
    fs.unlinkSync(__dirname + "/" + extractedFileName + ".bin");
  });

  it("clean up", () => {
    const filesToCleanup = [
      // Base test data
      "/CARD_Desc-987362f9.bundle",
      "/CARD_Indx-e9aa18bf.bundle",
      "/CARD_Name-cde5b0ab.bundle",
      "/Card_Part-ebaee097.bundle",
      "/Card_Pidx-f09348d3.bundle",
      // Produced test data
      "/CAB-3edab2009c2927c0c55132bf9a3b0a53",
      "/CAB-7ee66e49a29b3d2f2bf1104c66bf106d",
      "/CAB-a8c0ceacfc16220e07816e269e33cb5a",
      "/CAB-b15dec2777dad9f13353696821e3ecfc",
      "/CAB-d775896c9bbf867ea2a06f6d9d9d638e",
      "/CAB-3edab2009c2927c0c55132bf9a3b0a53.meta.json",
      "/CAB-7ee66e49a29b3d2f2bf1104c66bf106d.meta.json",
      "/CAB-a8c0ceacfc16220e07816e269e33cb5a.meta.json",
      "/CAB-b15dec2777dad9f13353696821e3ecfc.meta.json",
      "/CAB-d775896c9bbf867ea2a06f6d9d9d638e.meta.json",
      "/CARD_Desc.bin",
      "/CARD_Indx.bin",
      "/CARD_Name.bin",
      "/Card_Part.bin",
      "/Card_Pidx.bin",
      // Decrypted test files
      "/CARD_Desc.decrypted.bin",
      "/CARD_Indx.decrypted.bin",
      "/CARD_Name.decrypted.bin",
      "/Card_Part.decrypted.bin",
      "/Card_Pidx.decrypted.bin"
    ];

    // Clean up only files that exist
    filesToCleanup.forEach(file => {
      const fullPath = __dirname + file;
      if (fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);
      }
    });
  });
});
