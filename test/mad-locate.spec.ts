import * as fs from 'fs';
import * as path from 'path';
import { assert } from "chai";
import { fileURLToPath } from "url";
import { AssetBundle } from '../src/assetbundle.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe("ogy mad-locate tests", () => {
  beforeEach(done => setTimeout(done, 200));
  
  it("scanning CARD_Name bundle should find card_name.bytes", async () => {
    const bundlePath = path.join(__dirname, "data/mad/CARD_Name-cde5b0ab.bundle");
    const assetBundle = new AssetBundle(bundlePath);
    
    const TARGET_SUFFIXES = [
      "card_desc.bytes",
      "card_name.bytes",
      "card_indx.bytes",
    ];
    
    const matches = await assetBundle.scanForTextAssets(TARGET_SUFFIXES);
    
    // Should find exactly one match
    assert.strictEqual(matches.length, 1, "Should find exactly one match");
    
    // The match should contain card_name.bytes
    assert.isTrue(matches[0].assetPath.toLowerCase().includes("card_name.bytes"), 
      "Asset path should contain card_name.bytes");
    
    // The bundle path should be correct
    assert.strictEqual(matches[0].bundlePath, bundlePath, "Bundle path should match");
  });
  
  it("scanning CARD_Desc bundle should find card_desc.bytes", async () => {
    const bundlePath = path.join(__dirname, "data/mad/CARD_Desc-987362f9.bundle");
    const assetBundle = new AssetBundle(bundlePath);
    
    const TARGET_SUFFIXES = [
      "card_desc.bytes",
      "card_name.bytes",
      "card_indx.bytes",
    ];
    
    const matches = await assetBundle.scanForTextAssets(TARGET_SUFFIXES);
    
    // Should find exactly one match
    assert.strictEqual(matches.length, 1, "Should find exactly one match");
    
    // The match should contain card_desc.bytes
    assert.isTrue(matches[0].assetPath.toLowerCase().includes("card_desc.bytes"), 
      "Asset path should contain card_desc.bytes");
    
    // The bundle path should be correct
    assert.strictEqual(matches[0].bundlePath, bundlePath, "Bundle path should match");
  });
  
  it("scanning CARD_Indx bundle should find card_indx.bytes", async () => {
    const bundlePath = path.join(__dirname, "data/mad/CARD_Indx-e9aa18bf.bundle");
    const assetBundle = new AssetBundle(bundlePath);
    
    const TARGET_SUFFIXES = [
      "card_desc.bytes",
      "card_name.bytes",
      "card_indx.bytes",
    ];
    
    const matches = await assetBundle.scanForTextAssets(TARGET_SUFFIXES);
    
    // Should find exactly one match
    assert.strictEqual(matches.length, 1, "Should find exactly one match");
    
    // The match should contain card_indx.bytes
    assert.isTrue(matches[0].assetPath.toLowerCase().includes("card_indx.bytes"), 
      "Asset path should contain card_indx.bytes");
    
    // The bundle path should be correct
    assert.strictEqual(matches[0].bundlePath, bundlePath, "Bundle path should match");
  });
  
  it("scanning Card_Part bundle should not find any CARD matches", async () => {
    const bundlePath = path.join(__dirname, "data/mad/Card_Part-ebaee097.bundle");
    const assetBundle = new AssetBundle(bundlePath);
    
    const TARGET_SUFFIXES = [
      "card_desc.bytes",
      "card_name.bytes",
      "card_indx.bytes",
    ];
    
    const matches = await assetBundle.scanForTextAssets(TARGET_SUFFIXES);
    
    // Should find no matches (Card_Part is not one of the target files)
    assert.strictEqual(matches.length, 0, "Should find no matches");
  });
});
