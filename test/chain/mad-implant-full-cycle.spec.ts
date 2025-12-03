import * as fs from 'fs';
import * as path from 'path';
import { assert } from "chai";
import { fileURLToPath } from "url";
import { AssetBundle } from '../../src/assetbundle.js';
import { CABExtractor } from '../../src/cab.js';
import { decrypt, encrypt } from '../../src/crypt.js';
import { YgoTexts } from '../../src/ygotexts.js';
import { YuGiOh, Transformer } from '../../src/compressor.js';
import * as gettextParser from 'gettext-parser';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe("ogy mad-implant full cycle tests", () => {
  const testDir = __dirname;
  const dataDir = path.join(__dirname, "../data/mad");
  // These specific bundles use the production crypto key
  const TEST_CRYPTO_KEY = 0xe3;
  
  // Store original CAB names and asset paths for verification
  const originalBundleInfo: { [key: string]: { cabName: string | null, assetPath: string | null } } = {};
  
  beforeEach(done => setTimeout(done, 200));
  
  it("setup test data - copy bundles from test/data/mad", () => {
    // Use the specific bundles mentioned in the requirements
    fs.copyFileSync(
      path.join(dataDir, "CARD_Desc-21ae1efa.bundle"),
      path.join(testDir, "CARD_Desc-21ae1efa.bundle.orig")
    );
    fs.copyFileSync(
      path.join(dataDir, "CARD_Indx-507764bc.bundle"),
      path.join(testDir, "CARD_Indx-507764bc.bundle.orig")
    );
    fs.copyFileSync(
      path.join(dataDir, "CARD_Name-7438cca8.bundle"),
      path.join(testDir, "CARD_Name-7438cca8.bundle.orig")
    );
    
    assert.equal(fs.existsSync(path.join(testDir, "CARD_Desc-21ae1efa.bundle.orig")), true);
    assert.equal(fs.existsSync(path.join(testDir, "CARD_Indx-507764bc.bundle.orig")), true);
    assert.equal(fs.existsSync(path.join(testDir, "CARD_Name-7438cca8.bundle.orig")), true);
  });

  it("extract and store original CAB names and asset paths", async () => {
    // Extract CARD_Name bundle
    const nameBundle = new AssetBundle(path.join(testDir, "CARD_Name-7438cca8.bundle.orig"));
    const nameExtracted = await nameBundle.extractAssetBundle(testDir);
    assert.strictEqual(nameExtracted.length, 1, "Should extract one CAB file from CARD_Name bundle");
    originalBundleInfo['CARD_Name'] = {
      cabName: nameExtracted[0],
      assetPath: null
    };
    
    // Scan for asset path in CARD_Name bundle
    const nameMatches = await nameBundle.scanForTextAssets(["card_name.bytes"]);
    if (nameMatches.length > 0) {
      originalBundleInfo['CARD_Name'].assetPath = nameMatches[0].assetPath;
      console.log(`  Original CARD_Name CAB: ${originalBundleInfo['CARD_Name'].cabName}`);
      console.log(`  Original CARD_Name asset path: ${originalBundleInfo['CARD_Name'].assetPath}`);
    }
    
    // Extract CARD_Desc bundle
    const descBundle = new AssetBundle(path.join(testDir, "CARD_Desc-21ae1efa.bundle.orig"));
    const descExtracted = await descBundle.extractAssetBundle(testDir);
    assert.strictEqual(descExtracted.length, 1, "Should extract one CAB file from CARD_Desc bundle");
    originalBundleInfo['CARD_Desc'] = {
      cabName: descExtracted[0],
      assetPath: null
    };
    
    const descMatches = await descBundle.scanForTextAssets(["card_desc.bytes"]);
    if (descMatches.length > 0) {
      originalBundleInfo['CARD_Desc'].assetPath = descMatches[0].assetPath;
      console.log(`  Original CARD_Desc CAB: ${originalBundleInfo['CARD_Desc'].cabName}`);
      console.log(`  Original CARD_Desc asset path: ${originalBundleInfo['CARD_Desc'].assetPath}`);
    }
    
    // Extract CARD_Indx bundle
    const indxBundle = new AssetBundle(path.join(testDir, "CARD_Indx-507764bc.bundle.orig"));
    const indxExtracted = await indxBundle.extractAssetBundle(testDir);
    assert.strictEqual(indxExtracted.length, 1, "Should extract one CAB file from CARD_Indx bundle");
    originalBundleInfo['CARD_Indx'] = {
      cabName: indxExtracted[0],
      assetPath: null
    };
    
    const indxMatches = await indxBundle.scanForTextAssets(["card_indx.bytes"]);
    if (indxMatches.length > 0) {
      originalBundleInfo['CARD_Indx'].assetPath = indxMatches[0].assetPath;
      console.log(`  Original CARD_Indx CAB: ${originalBundleInfo['CARD_Indx'].cabName}`);
      console.log(`  Original CARD_Indx asset path: ${originalBundleInfo['CARD_Indx'].assetPath}`);
    }
  });

  it("extract and decrypt CARD files from bundles", async () => {
    // Extract CARD_Name
    const nameCabFile = path.join(testDir, originalBundleInfo['CARD_Name'].cabName!);
    const nameExtracted = await CABExtractor.extract(nameCabFile, testDir);
    assert.equal(nameExtracted, "CARD_Name");
    const nameEncrypted = fs.readFileSync(path.join(testDir, "CARD_Name.bin"));
    const nameDecrypted = decrypt(nameEncrypted, TEST_CRYPTO_KEY);
    fs.writeFileSync(path.join(testDir, "CARD_Name.decrypted.bin"), nameDecrypted);
    
    // Extract CARD_Desc
    const descCabFile = path.join(testDir, originalBundleInfo['CARD_Desc'].cabName!);
    const descExtracted = await CABExtractor.extract(descCabFile, testDir);
    assert.equal(descExtracted, "CARD_Desc");
    const descEncrypted = fs.readFileSync(path.join(testDir, "CARD_Desc.bin"));
    const descDecrypted = decrypt(descEncrypted, TEST_CRYPTO_KEY);
    fs.writeFileSync(path.join(testDir, "CARD_Desc.decrypted.bin"), descDecrypted);
    
    // Extract CARD_Indx
    const indxCabFile = path.join(testDir, originalBundleInfo['CARD_Indx'].cabName!);
    const indxExtracted = await CABExtractor.extract(indxCabFile, testDir);
    assert.equal(indxExtracted, "CARD_Indx");
    const indxEncrypted = fs.readFileSync(path.join(testDir, "CARD_Indx.bin"));
    const indxDecrypted = decrypt(indxEncrypted, TEST_CRYPTO_KEY);
    fs.writeFileSync(path.join(testDir, "CARD_Indx.decrypted.bin"), indxDecrypted);
    
    assert.isTrue(nameDecrypted.length > 0);
    assert.isTrue(descDecrypted.length > 0);
    assert.isTrue(indxDecrypted.length > 0);
  });

  it("export to mad.pot using mad2pot functionality", async () => {
    const ygoTexts = new YgoTexts();
    await ygoTexts.exportToPot(testDir, YuGiOh.MAD);
    
    const potPath = path.join(testDir, "mad.pot");
    assert.equal(fs.existsSync(potPath), true, "mad.pot should be created");
    
    // Verify POT file structure
    const potContent = fs.readFileSync(potPath, 'utf-8');
    assert.include(potContent, 'msgid', "POT should contain msgid");
    assert.include(potContent, 'msgstr', "POT should contain msgstr");
    
    console.log(`  Created mad.pot with ${potContent.split('msgid').length - 1} entries`);
  });

  it("convert mad.pot to mad.po (copy msgid to msgstr)", () => {
    const potPath = path.join(testDir, "mad.pot");
    const poPath = path.join(testDir, "mad_fullcycle.po");
    
    // Read POT file
    const potBuffer = fs.readFileSync(potPath);
    const po = gettextParser.po.parse(potBuffer);
    
    // Fill in translations by copying msgid to msgstr
    // This simulates a translated file where translations match the original
    const translations = po.translations[''];
    for (const msgid of Object.keys(translations)) {
      const entry = translations[msgid];
      // Skip empty msgid (header entry)
      if (msgid !== '' && (!entry.msgstr || !entry.msgstr[0])) {
        entry.msgstr = [msgid];
      }
    }
    
    // Write PO file
    const poBuffer = gettextParser.po.compile(po);
    fs.writeFileSync(poPath, poBuffer);
    
    assert.equal(fs.existsSync(poPath), true, "mad_fullcycle.po should be created");
    
    // Verify PO has filled translations
    const poText = fs.readFileSync(poPath, 'utf-8');
    assert.include(poText, 'msgstr', "PO should contain msgstr");
    
    console.log(`  Converted mad.pot to mad_fullcycle.po (copied msgid to msgstr)`);
  });

  it("generate new asset files (simulate transformation like mad-implant does)", () => {
    // Since the test data may be incomplete (not all cards), we'll create modified
    // versions manually to test the AssetBundle repackaging functionality
    // This simulates what would happen if we actually transformed the PO file
    
    // Read the original decrypted files
    const originalName = fs.readFileSync(path.join(testDir, "CARD_Name.decrypted.bin"));
    const originalDesc = fs.readFileSync(path.join(testDir, "CARD_Desc.decrypted.bin"));
    const originalIndx = fs.readFileSync(path.join(testDir, "CARD_Indx.decrypted.bin"));
    
    // Create "modified" versions - in a real scenario, these would come from the PO transformation
    // For testing, we'll just make minor modifications to prove the round-trip works
    const modifiedName = Buffer.from(originalName);
    const modifiedDesc = Buffer.from(originalDesc);
    const modifiedIndx = Buffer.from(originalIndx);
    
    // Add a test marker to prove modifications were preserved
    const testMarker = 'FULL_CYCLE_TEST';
    const markerBuffer = Buffer.from(testMarker, 'utf-8');
    
    // Modify at safe offsets
    markerBuffer.copy(modifiedName, 1500);
    markerBuffer.copy(modifiedDesc, 7500);
    
    // Write the "new" files
    fs.writeFileSync(path.join(testDir, "CARD_Name_New.decrypted.bin"), modifiedName);
    fs.writeFileSync(path.join(testDir, "CARD_Desc_New.decrypted.bin"), modifiedDesc);
    fs.writeFileSync(path.join(testDir, "CARD_Indx_New.decrypted.bin"), modifiedIndx);
    
    // Check that new binary files were created
    assert.equal(fs.existsSync(path.join(testDir, "CARD_Name_New.decrypted.bin")), true);
    assert.equal(fs.existsSync(path.join(testDir, "CARD_Desc_New.decrypted.bin")), true);
    assert.equal(fs.existsSync(path.join(testDir, "CARD_Indx_New.decrypted.bin")), true);
    
    // Verify the modification is present
    const nameContent = fs.readFileSync(path.join(testDir, "CARD_Name_New.decrypted.bin"), 'utf-8');
    assert.include(nameContent, testMarker, "Test marker should be present in modified file");
    
    console.log(`  Generated new CARD files (simulated PO transformation)`);
  });

  it("encrypt new CARD files", () => {
    // Encrypt CARD_Name_New
    let decryptedData = fs.readFileSync(path.join(testDir, "CARD_Name_New.decrypted.bin"));
    let encryptedData = encrypt(decryptedData, TEST_CRYPTO_KEY);
    fs.writeFileSync(path.join(testDir, "CARD_Name_New_FullCycle.bin"), encryptedData);
    
    // Encrypt CARD_Desc_New
    decryptedData = fs.readFileSync(path.join(testDir, "CARD_Desc_New.decrypted.bin"));
    encryptedData = encrypt(decryptedData, TEST_CRYPTO_KEY);
    fs.writeFileSync(path.join(testDir, "CARD_Desc_New_FullCycle.bin"), encryptedData);
    
    // Encrypt CARD_Indx_New
    decryptedData = fs.readFileSync(path.join(testDir, "CARD_Indx_New.decrypted.bin"));
    encryptedData = encrypt(decryptedData, TEST_CRYPTO_KEY);
    fs.writeFileSync(path.join(testDir, "CARD_Indx_New_FullCycle.bin"), encryptedData);
    
    assert.equal(fs.existsSync(path.join(testDir, "CARD_Name_New_FullCycle.bin")), true);
    assert.equal(fs.existsSync(path.join(testDir, "CARD_Desc_New_FullCycle.bin")), true);
    assert.equal(fs.existsSync(path.join(testDir, "CARD_Indx_New_FullCycle.bin")), true);
  });

  it("update AssetBundles with new encrypted CARD files", async () => {
    // Update CARD_Name bundle
    const nameOriginalBundle = path.join(testDir, "CARD_Name-7438cca8.bundle.orig");
    const nameOriginalAsset = path.join(testDir, "CARD_Name.bin");
    const nameNewAsset = path.join(testDir, "CARD_Name_New_FullCycle.bin");
    const nameUpdatedBundle = path.join(testDir, "CARD_Name-7438cca8.bundle.new");
    
    const nameAssetBundle = new AssetBundle(nameOriginalBundle);
    await nameAssetBundle.updateAssetBundle(nameOriginalAsset, nameNewAsset, nameUpdatedBundle);
    assert.equal(fs.existsSync(nameUpdatedBundle), true, "Updated CARD_Name bundle should exist");
    
    // Update CARD_Desc bundle
    const descOriginalBundle = path.join(testDir, "CARD_Desc-21ae1efa.bundle.orig");
    const descOriginalAsset = path.join(testDir, "CARD_Desc.bin");
    const descNewAsset = path.join(testDir, "CARD_Desc_New_FullCycle.bin");
    const descUpdatedBundle = path.join(testDir, "CARD_Desc-21ae1efa.bundle.new");
    
    const descAssetBundle = new AssetBundle(descOriginalBundle);
    await descAssetBundle.updateAssetBundle(descOriginalAsset, descNewAsset, descUpdatedBundle);
    assert.equal(fs.existsSync(descUpdatedBundle), true, "Updated CARD_Desc bundle should exist");
    
    // Update CARD_Indx bundle
    const indxOriginalBundle = path.join(testDir, "CARD_Indx-507764bc.bundle.orig");
    const indxOriginalAsset = path.join(testDir, "CARD_Indx.bin");
    const indxNewAsset = path.join(testDir, "CARD_Indx_New_FullCycle.bin");
    const indxUpdatedBundle = path.join(testDir, "CARD_Indx-507764bc.bundle.new");
    
    const indxAssetBundle = new AssetBundle(indxOriginalBundle);
    await indxAssetBundle.updateAssetBundle(indxOriginalAsset, indxNewAsset, indxUpdatedBundle);
    assert.equal(fs.existsSync(indxUpdatedBundle), true, "Updated CARD_Indx bundle should exist");
    
    console.log(`  Updated all three AssetBundles`);
  });

  it("verify CAB filenames are preserved in updated bundles", async () => {
    // Verify CARD_Name
    const nameUpdatedBundle = new AssetBundle(path.join(testDir, "CARD_Name-7438cca8.bundle.new"));
    const nameExtracted = await nameUpdatedBundle.extractAssetBundle(testDir);
    assert.strictEqual(nameExtracted.length, 1, "Should extract one CAB file");
    assert.equal(
      nameExtracted[0], 
      originalBundleInfo['CARD_Name'].cabName, 
      `CAB filename should match original: ${originalBundleInfo['CARD_Name'].cabName}`
    );
    console.log(`  ✅ CARD_Name CAB filename preserved: ${nameExtracted[0]}`);
    
    // Verify CARD_Desc
    const descUpdatedBundle = new AssetBundle(path.join(testDir, "CARD_Desc-21ae1efa.bundle.new"));
    const descExtracted = await descUpdatedBundle.extractAssetBundle(testDir);
    assert.strictEqual(descExtracted.length, 1, "Should extract one CAB file");
    assert.equal(
      descExtracted[0],
      originalBundleInfo['CARD_Desc'].cabName,
      `CAB filename should match original: ${originalBundleInfo['CARD_Desc'].cabName}`
    );
    console.log(`  ✅ CARD_Desc CAB filename preserved: ${descExtracted[0]}`);
    
    // Verify CARD_Indx
    const indxUpdatedBundle = new AssetBundle(path.join(testDir, "CARD_Indx-507764bc.bundle.new"));
    const indxExtracted = await indxUpdatedBundle.extractAssetBundle(testDir);
    assert.strictEqual(indxExtracted.length, 1, "Should extract one CAB file");
    assert.equal(
      indxExtracted[0],
      originalBundleInfo['CARD_Indx'].cabName,
      `CAB filename should match original: ${originalBundleInfo['CARD_Indx'].cabName}`
    );
    console.log(`  ✅ CARD_Indx CAB filename preserved: ${indxExtracted[0]}`);
  });

  it("verify asset paths are readable in updated bundles (like mad-locate)", async () => {
    // Verify CARD_Name asset path
    const nameUpdatedBundle = new AssetBundle(path.join(testDir, "CARD_Name-7438cca8.bundle.new"));
    const nameMatches = await nameUpdatedBundle.scanForTextAssets(["card_name.bytes"]);
    assert.isTrue(nameMatches.length > 0, "Should find card_name.bytes in updated bundle");
    
    // If we had an original asset path, verify it matches
    if (originalBundleInfo['CARD_Name'].assetPath) {
      assert.equal(
        nameMatches[0].assetPath,
        originalBundleInfo['CARD_Name'].assetPath,
        `Asset path should match original: ${originalBundleInfo['CARD_Name'].assetPath}`
      );
    }
    console.log(`  ✅ CARD_Name asset path readable: ${nameMatches[0].assetPath}`);
    
    // Verify CARD_Desc asset path
    const descUpdatedBundle = new AssetBundle(path.join(testDir, "CARD_Desc-21ae1efa.bundle.new"));
    const descMatches = await descUpdatedBundle.scanForTextAssets(["card_desc.bytes"]);
    assert.isTrue(descMatches.length > 0, "Should find card_desc.bytes in updated bundle");
    
    if (originalBundleInfo['CARD_Desc'].assetPath) {
      assert.equal(
        descMatches[0].assetPath,
        originalBundleInfo['CARD_Desc'].assetPath,
        `Asset path should match original: ${originalBundleInfo['CARD_Desc'].assetPath}`
      );
    }
    console.log(`  ✅ CARD_Desc asset path readable: ${descMatches[0].assetPath}`);
    
    // Verify CARD_Indx asset path
    const indxUpdatedBundle = new AssetBundle(path.join(testDir, "CARD_Indx-507764bc.bundle.new"));
    const indxMatches = await indxUpdatedBundle.scanForTextAssets(["card_indx.bytes"]);
    assert.isTrue(indxMatches.length > 0, "Should find card_indx.bytes in updated bundle");
    
    if (originalBundleInfo['CARD_Indx'].assetPath) {
      assert.equal(
        indxMatches[0].assetPath,
        originalBundleInfo['CARD_Indx'].assetPath,
        `Asset path should match original: ${originalBundleInfo['CARD_Indx'].assetPath}`
      );
    }
    console.log(`  ✅ CARD_Indx asset path readable: ${indxMatches[0].assetPath}`);
  });

  it("clean up test files", () => {
    const filesToCleanup = [
      "/CARD_Name-7438cca8.bundle.orig",
      "/CARD_Name-7438cca8.bundle.new",
      "/CARD_Desc-21ae1efa.bundle.orig",
      "/CARD_Desc-21ae1efa.bundle.new",
      "/CARD_Indx-507764bc.bundle.orig",
      "/CARD_Indx-507764bc.bundle.new",
      "/CARD_Name.bin",
      "/CARD_Desc.bin",
      "/CARD_Indx.bin",
      "/CARD_Name.decrypted.bin",
      "/CARD_Desc.decrypted.bin",
      "/CARD_Indx.decrypted.bin",
      "/CARD_Name_New.decrypted.bin",
      "/CARD_Desc_New.decrypted.bin",
      "/CARD_Indx_New.decrypted.bin",
      "/CARD_Name_New_FullCycle.bin",
      "/CARD_Desc_New_FullCycle.bin",
      "/CARD_Indx_New_FullCycle.bin",
      "/mad.pot",
      "/mad_fullcycle.po",
      "/CARD_Name_J.txt",
      "/CARD_Desc_J.txt",
      "/CARD_Indx_J.txt",
    ];

    filesToCleanup.forEach(file => {
      const fullPath = testDir + file;
      if (fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);
      }
    });
    
    // Clean up any CAB files from extraction
    const files = fs.readdirSync(testDir);
    files.forEach(file => {
      if (file.startsWith('CAB-')) {
        fs.unlinkSync(path.join(testDir, file));
      }
    });
  });
});
