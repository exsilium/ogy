import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import figlet from 'figlet';
import { Command } from '@commander-js/extra-typings';
import { YuGiOh, Transformer, DictionaryBuilder } from './compressor.js';
import { YgoTexts } from './ygotexts.js';
import { Ehp } from './ehp.js';
import { AssetBundle } from './assetbundle.js';
import { CABExtractor } from './cab.js';
import { UMDISOReader } from './umdiso.js';
import { NDSHandler } from './nds.js';
import { decrypt, encrypt, findKey } from "./crypt.js";
import { MAD_BUNDLE_FILES, MAD_BUNDLE_PATHS, MAD_CRYPTO_KEY, MAD_CAB_FILES } from './mad-constants.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Update an AssetBundle using UnityPy Python script
 * @param originalBundlePath Path to the original AssetBundle
 * @param originalAssetPath Path to the original asset data
 * @param newAssetPath Path to the new asset data
 * @param outputBundlePath Path where the updated AssetBundle will be written
 * @returns Promise that resolves when the update is complete
 */
async function updateAssetBundleWithUnityPy(
  originalBundlePath: string,
  originalAssetPath: string,
  newAssetPath: string,
  outputBundlePath: string,
  expectedCABName?: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    const pythonScriptPath = path.join(__dirname, 'unitypy_assetbundle.py');
    
    console.log(`🐍 Using UnityPy for AssetBundle update`);
    
    const args = [
      pythonScriptPath,
      originalBundlePath,
      originalAssetPath,
      newAssetPath,
      outputBundlePath
    ];
    
    // Add expected CAB name if provided
    if (expectedCABName) {
      args.push(expectedCABName);
    }
    
    const pythonProcess = spawn('python3', args);

    let stdout = '';
    let stderr = '';

    pythonProcess.stdout.on('data', (data) => {
      const text = data.toString();
      stdout += text;
      process.stdout.write(text);
    });

    pythonProcess.stderr.on('data', (data) => {
      const text = data.toString();
      stderr += text;
      process.stderr.write(text);
    });

    pythonProcess.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`UnityPy script failed with exit code ${code}\nStderr: ${stderr}`));
      }
    });

    pythonProcess.on('error', (err) => {
      reject(new Error(`Failed to spawn Python process: ${err.message}`));
    });
  });
}

const program = new Command();

console.log(figlet.textSync("OGY|YGO"));
console.log("OGY - Yu-Gi-Oh! Translation tool\n");

/* This is very raw - quick and dirty */
program
  .command("card", { isDefault: true })
  .description("default command, actions based on option parameters")
  .action((source, destination) => {});

program
  .command("extract <source_ehp> <directory>")
  .description("extract .ehp file to destination directory")
  .action((source_ehp, directory) => {
    console.log("Extract command called");
    console.log("Source .ehp: " + path.resolve(process.cwd(), source_ehp));
    console.log("Destination directory: " + path.resolve(process.cwd(), directory));

    const ehp = new Ehp(path.resolve(process.cwd(), directory), path.resolve(process.cwd(), source_ehp));
    ehp.extract();
  });

program
  .command("unbundle <source_bundle> <directory>")
  .description("extract UnityFS AssetBundle file to destination directory (EXPERIMENTAL and SPECIFIC to MD)")
  .action(async (source_bundle, directory) => {
    let extractedFile = "";
    console.log("Unbundle command called");
    console.log("Source bundle: " + path.resolve(process.cwd(), source_bundle));
    console.log("Destination directory: " + path.resolve(process.cwd(), directory));

    const assetBundle = new AssetBundle(source_bundle);
    const extractedAssetBundle = await assetBundle.extractAssetBundle(path.resolve(process.cwd(), directory));

    for(const asset of extractedAssetBundle) {
      const extractedFile = await CABExtractor.extract(path.join(directory, asset), directory);

      // If we know about the extracted file, let's try to decrypt it.
      if(extractedFile === "CARD_Indx") {
        console.log("Trying to decrypt " + extractedFile);
      }
    }
  });

program
  .command("update <target_ehp> <directory>")
  .description("update existing .ehp file from the same files in directory")
  .action((target_ehp, directory) => {
    console.log("Create command called");
    console.log("Target .ehp: " + target_ehp);
    console.log("Directory for files: " + directory);

    const ehp = new Ehp(path.resolve(process.cwd(), directory), path.resolve(process.cwd(), target_ehp));
    ehp.update();
  });

program
  .command("po2json <source_po> <target_json>")
  .description("helper function to convert .PO to .JSON structure")
  .action((source_po, target_json) => {
    console.log("po2json command called");

    const resolvedSource = path.resolve(source_po);
    const resolvedTarget = path.resolve(target_json);

    if(fs.existsSync(resolvedSource)) {
      console.log("Source PO: " + resolvedSource);
      console.log("Target JSON: " + resolvedTarget);

      const transformer = new Transformer();
      transformer.poToJson(resolvedSource, resolvedTarget);
    }
    else {
      console.log("Unable to find source PO: " + resolvedSource);
    }
  });

const chain = program.command('chain')
  .description("Run chained actions to fulfill multiple tasks in one go");

chain
  .command("mad2pot <game_dir> <target_dir>")
  .description("Export from Master Duel installation directory to create PO Template file (mad.pot)")
  .action(async (game_dir, target_dir) => {
    /* Game source dir e.g: "~/Library/Application Support/CrossOver/Bottles/Steam/drive_c/Program Files (x86)/Steam/steamapps/common/Yu-Gi-Oh!  Master Duel" */
    /* Check the source directory existence */
    if (game_dir.startsWith('~')) {
      game_dir = path.join(os.homedir(), game_dir.slice(1));
    }

    const resolvedPath = path.resolve(game_dir);
    const resolvedTargetPath = path.resolve(target_dir);

    if(fs.existsSync(resolvedPath)) {
      console.log("Game dir: " + resolvedPath);
    }
    else {
      console.log("Game dir invalid, exiting");
      process.exit(1);
    }

    /* We check for the existence of CARD_Name, CARD_Desc and CARD_Indx bundles */
    /* If these files are not found, most likely the client has updated and the location of the files have moved */
    const variablePathName = await getMADVariableDir(resolvedPath);
    const cardNameBundlePathSrc = path.join(resolvedPath, `/LocalData/${variablePathName}/0000/${MAD_BUNDLE_PATHS.CARD_NAME}/${MAD_BUNDLE_FILES.CARD_NAME}`);
    const cardDescBundlePathSrc = path.join(resolvedPath, `/LocalData/${variablePathName}/0000/${MAD_BUNDLE_PATHS.CARD_DESC}/${MAD_BUNDLE_FILES.CARD_DESC}`);
    const cardIndxBundlePathSrc = path.join(resolvedPath, `/LocalData/${variablePathName}/0000/${MAD_BUNDLE_PATHS.CARD_INDX}/${MAD_BUNDLE_FILES.CARD_INDX}`);

    if(fs.existsSync(cardNameBundlePathSrc) && fs.existsSync(cardDescBundlePathSrc) && fs.existsSync(cardIndxBundlePathSrc)) {
      console.log("Correct input files found");
    }

    const cardNameBundlePath = resolvedTargetPath + `/${MAD_BUNDLE_FILES.CARD_NAME}.orig`;
    const cardDescBundlePath = resolvedTargetPath + `/${MAD_BUNDLE_FILES.CARD_DESC}.orig`;
    const cardIndxBundlePath = resolvedTargetPath + `/${MAD_BUNDLE_FILES.CARD_INDX}.orig`;

    /* Copy the original files to the target directory only if they don't already exist */
    console.log("\n=== Backing up original AssetBundles ===");
    copyFileIfNotExists(cardNameBundlePathSrc, cardNameBundlePath);
    copyFileIfNotExists(cardDescBundlePathSrc, cardDescBundlePath);
    copyFileIfNotExists(cardIndxBundlePathSrc, cardIndxBundlePath);

    /* cardName */
    let assetBundle = new AssetBundle(cardNameBundlePath);
    let extractedAssetBundle = await assetBundle.extractAssetBundle(resolvedTargetPath);

    for(const asset of extractedAssetBundle) {
      const extractedFile = await CABExtractor.extract(path.join(resolvedTargetPath, asset), resolvedTargetPath);
    }

    let encryptedData = fs.readFileSync(resolvedTargetPath + "/CARD_Name.bin");
    let decryptedData = decrypt(encryptedData, MAD_CRYPTO_KEY);

    if (decryptedData.length > 0) {
      fs.writeFileSync(resolvedTargetPath + "/CARD_Name.decrypted.bin", decryptedData);
    } else {
      console.error('Decryption failed for CARD_Name.');
      console.info('Attempting to find the correct crypto key...');
      const newCryptoKey = findKey(encryptedData);
      console.info('Found crypto key: 0x' + newCryptoKey.toString(16));
      process.exit(1);
    }

    /* cardDesc */
    assetBundle = new AssetBundle(cardDescBundlePath);
    extractedAssetBundle = await assetBundle.extractAssetBundle(resolvedTargetPath);

    for(const asset of extractedAssetBundle) {
      await CABExtractor.extract(path.join(resolvedTargetPath, asset), resolvedTargetPath);
    }

    encryptedData = fs.readFileSync(resolvedTargetPath + "/CARD_Desc.bin");
    decryptedData = decrypt(encryptedData, MAD_CRYPTO_KEY);

    if (decryptedData.length > 0) {
      fs.writeFileSync(resolvedTargetPath + "/CARD_Desc.decrypted.bin", decryptedData);
    } else {
      console.error('Decryption failed for CARD_Desc.');
      process.exit(1);
    }

    /* cardIndx */
    assetBundle = new AssetBundle(cardIndxBundlePath);
    extractedAssetBundle = await assetBundle.extractAssetBundle(resolvedTargetPath);

    for(const asset of extractedAssetBundle) {
      await CABExtractor.extract(path.join(resolvedTargetPath, asset), resolvedTargetPath);
    }

    encryptedData = fs.readFileSync(resolvedTargetPath + "/CARD_Indx.bin");
    decryptedData = decrypt(encryptedData, MAD_CRYPTO_KEY);

    if (decryptedData.length > 0) {
      fs.writeFileSync(resolvedTargetPath + "/CARD_Indx.decrypted.bin", decryptedData);
    } else {
      console.error('Decryption failed for CARD_Indx.');
      process.exit(1);
    }

    await new YgoTexts().exportToPot(resolvedTargetPath, YuGiOh.MAD);
    listDirContents(resolvedTargetPath);
  });

chain
  .command("mad-implant <game_dir> <target_dir>")
  .description("Repack MAD resources using in-memory AssetBundle updates")
  .option("--skip-replace", "Skip copying updated AssetBundles back to the game directory")
  .option("--unitypy", "Use UnityPy for AssetBundle replacement instead of built-in method")
  .action(async (game_dir, target_dir, options) => {
    /* Game source dir e.g: "~/Library/Application Support/CrossOver/Bottles/Steam/drive_c/Program Files (x86)/Steam/steamapps/common/Yu-Gi-Oh!  Master Duel" */
    /* Check the source directory existence */
    if (game_dir.startsWith('~')) {
      game_dir = path.join(os.homedir(), game_dir.slice(1));
    }

    const resolvedPath = path.resolve(game_dir);
    const resolvedTargetPath = path.resolve(target_dir);

    if(fs.existsSync(resolvedPath)) {
      console.log("Game dir: " + resolvedPath);
    }
    else {
      console.log("Game dir invalid, exiting");
      process.exit(1);
    }

    const resolvedPOPath = path.join(target_dir, "/mad.po");

    if(fs.existsSync(resolvedPOPath)) {
      console.log("Source PO: " + resolvedPOPath);
    }
    else {
      console.log("Source PO invalid. Cannot find mad.po, exiting");
      process.exit(1);
    }

    console.log("\n=== Processing PO file and generating new CARD data ===");
    
    /* Process the PO file and convert it to TXT */
    const transformer = new Transformer();
    transformer.poToTxt(resolvedPOPath, YuGiOh.MAD);
    transformer.entriesToBin(resolvedTargetPath, YuGiOh.MAD);

    console.log("\n=== Sanity check: comparing entry counts ===");

    function countNullTerminatedStrings(buf: Buffer): number {
      let count = 0;
      let inString = false;
      for (let i = 0; i < buf.length; i++) {
        const b = buf[i];
        if (b !== 0) {
          if (!inString) inString = true;
        } else {
          if (inString) {
            count++;
            inString = false;
          }
        }
      }
      // If buffer doesn't end with NUL but had characters, count trailing string
      if (inString) count++;
      return count;
    }

    // Load original name/desc (prefer decrypted if present, else decrypt from .bin)
    const origNameDecryptedPath = path.join(resolvedTargetPath, "CARD_Name.decrypted.bin");
    const origDescDecryptedPath = path.join(resolvedTargetPath, "CARD_Desc.decrypted.bin");
    const origNameBinPath = path.join(resolvedTargetPath, "CARD_Name.bin");
    const origDescBinPath = path.join(resolvedTargetPath, "CARD_Desc.bin");

    let origNameBuf: Buffer;
    let origDescBuf: Buffer;

    if (fs.existsSync(origNameDecryptedPath)) {
      origNameBuf = fs.readFileSync(origNameDecryptedPath);
    } else {
      const enc = fs.readFileSync(origNameBinPath);
      origNameBuf = decrypt(enc, MAD_CRYPTO_KEY);
    }

    if (fs.existsSync(origDescDecryptedPath)) {
      origDescBuf = fs.readFileSync(origDescDecryptedPath);
    } else {
      const enc = fs.readFileSync(origDescBinPath);
      origDescBuf = decrypt(enc, MAD_CRYPTO_KEY);
    }

    // Load newly generated decrypted files
    const newNameDecryptedPath = path.join(resolvedTargetPath, "CARD_Name_New.decrypted.bin");
    const newDescDecryptedPath = path.join(resolvedTargetPath, "CARD_Desc_New.decrypted.bin");

    if (!fs.existsSync(newNameDecryptedPath) || !fs.existsSync(newDescDecryptedPath)) {
      console.error("❌ Missing newly generated decrypted files for sanity check.");
      console.error("   Expected CARD_Name_New.decrypted.bin and CARD_Desc_New.decrypted.bin in target directory.");
      process.exit(1);
    }

    const newNameBuf = fs.readFileSync(newNameDecryptedPath);
    const newDescBuf = fs.readFileSync(newDescDecryptedPath);

    const origNameCount = countNullTerminatedStrings(origNameBuf);
    const origDescCount = countNullTerminatedStrings(origDescBuf);
    const newNameCount = countNullTerminatedStrings(newNameBuf);
    const newDescCount = countNullTerminatedStrings(newDescBuf);

    console.log(`   Original CARD_Name entries: ${origNameCount}`);
    console.log(`   New CARD_Name entries     : ${newNameCount}`);
    console.log(`   Original CARD_Desc entries: ${origDescCount}`);
    console.log(`   New CARD_Desc entries     : ${newDescCount}`);

    if (origNameCount !== newNameCount || origDescCount !== newDescCount) {
      console.error("\n❌ Sanity check failed: entry count mismatch.");
      if (origNameCount !== newNameCount) {
        console.error(`   CARD_Name mismatch: original=${origNameCount}, new=${newNameCount}`);
      }
      if (origDescCount !== newDescCount) {
        console.error(`   CARD_Desc mismatch: original=${origDescCount}, new=${newDescCount}`);
      }
      console.error("   Aborting implant to prevent corrupt game data.");
      process.exit(1);
    }
    console.log("✅ Sanity check passed: entry counts match.");

    /* We check for the existence of CARD_Name, CARD_Desc and CARD_Indx bundles */
    /* If these files are not found, most likely the client has updated and the location of the files have moved */
    const variablePathName = await getMADVariableDir(resolvedPath);
    const cardNameBundlePathSrc = path.join(resolvedPath, `/LocalData/${variablePathName}/0000/${MAD_BUNDLE_PATHS.CARD_NAME}/${MAD_BUNDLE_FILES.CARD_NAME}`);
    const cardDescBundlePathSrc = path.join(resolvedPath, `/LocalData/${variablePathName}/0000/${MAD_BUNDLE_PATHS.CARD_DESC}/${MAD_BUNDLE_FILES.CARD_DESC}`);
    const cardIndxBundlePathSrc = path.join(resolvedPath, `/LocalData/${variablePathName}/0000/${MAD_BUNDLE_PATHS.CARD_INDX}/${MAD_BUNDLE_FILES.CARD_INDX}`);

    if(fs.existsSync(cardNameBundlePathSrc) && fs.existsSync(cardDescBundlePathSrc) && fs.existsSync(cardIndxBundlePathSrc)) {
      console.log("✅ Correct source files found for replacement");
    }
    else {
      console.error("❌ Source AssetBundle files not found. Game may have been updated.");
      process.exit(1);
    }

    console.log("\n=== Encrypting new CARD data ===");

    /* Encrypt the new decrypted data */
    let decryptedData = fs.readFileSync(resolvedTargetPath + "/CARD_Name_New.decrypted.bin");
    let encryptedData = encrypt(decryptedData, MAD_CRYPTO_KEY);
    fs.writeFileSync(resolvedTargetPath + "/CARD_Name_New.bin", encryptedData);
    console.log("✅ CARD_Name encrypted");

    decryptedData = fs.readFileSync(resolvedTargetPath + "/CARD_Desc_New.decrypted.bin");
    encryptedData = encrypt(decryptedData, MAD_CRYPTO_KEY);
    fs.writeFileSync(resolvedTargetPath + "/CARD_Desc_New.bin", encryptedData);
    console.log("✅ CARD_Desc encrypted");

    decryptedData = fs.readFileSync(resolvedTargetPath + "/CARD_Indx_New.decrypted.bin");
    encryptedData = encrypt(decryptedData, MAD_CRYPTO_KEY);
    fs.writeFileSync(resolvedTargetPath + "/CARD_Indx_New.bin", encryptedData);
    console.log("✅ CARD_Indx encrypted");

    const useUnityPy = options.unitypy || false;
    
    if (useUnityPy) {
      console.log("\n=== Repackaging AssetBundles using UnityPy ===");
    } else {
      console.log("\n=== Repackaging AssetBundles using in-memory update ===");
    }

    /* Update CARD_Name AssetBundle */
    console.log("\n📦 Processing CARD_Name...");
    const cardNameBundleOrig = path.join(resolvedTargetPath, `${MAD_BUNDLE_FILES.CARD_NAME}.orig`);
    const cardNameBundleNew = path.join(resolvedTargetPath, MAD_BUNDLE_FILES.CARD_NAME);
    const originalNameAsset = path.join(resolvedTargetPath, "CARD_Name.bin");
    const newNameAsset = path.join(resolvedTargetPath, "CARD_Name_New.bin");

    if (useUnityPy) {
      await updateAssetBundleWithUnityPy(cardNameBundleOrig, originalNameAsset, newNameAsset, cardNameBundleNew, MAD_CAB_FILES.CARD_NAME);
    } else {
      let assetBundle = new AssetBundle(cardNameBundleOrig);
      await assetBundle.updateAssetBundle(originalNameAsset, newNameAsset, cardNameBundleNew);
    }
    console.log("✅ CARD_Name AssetBundle updated");

    /* Update CARD_Desc AssetBundle */
    console.log("\n📦 Processing CARD_Desc...");
    const cardDescBundleOrig = path.join(resolvedTargetPath, `${MAD_BUNDLE_FILES.CARD_DESC}.orig`);
    const cardDescBundleNew = path.join(resolvedTargetPath, MAD_BUNDLE_FILES.CARD_DESC);
    const originalDescAsset = path.join(resolvedTargetPath, "CARD_Desc.bin");
    const newDescAsset = path.join(resolvedTargetPath, "CARD_Desc_New.bin");

    if (useUnityPy) {
      await updateAssetBundleWithUnityPy(cardDescBundleOrig, originalDescAsset, newDescAsset, cardDescBundleNew, MAD_CAB_FILES.CARD_DESC);
    } else {
      let assetBundle = new AssetBundle(cardDescBundleOrig);
      await assetBundle.updateAssetBundle(originalDescAsset, newDescAsset, cardDescBundleNew);
    }
    console.log("✅ CARD_Desc AssetBundle updated");

    /* Update CARD_Indx AssetBundle */
    console.log("\n📦 Processing CARD_Indx...");
    const cardIndxBundleOrig = path.join(resolvedTargetPath, `${MAD_BUNDLE_FILES.CARD_INDX}.orig`);
    const cardIndxBundleNew = path.join(resolvedTargetPath, MAD_BUNDLE_FILES.CARD_INDX);
    const originalIndxAsset = path.join(resolvedTargetPath, "CARD_Indx.bin");
    const newIndxAsset = path.join(resolvedTargetPath, "CARD_Indx_New.bin");

    if (useUnityPy) {
      await updateAssetBundleWithUnityPy(cardIndxBundleOrig, originalIndxAsset, newIndxAsset, cardIndxBundleNew, MAD_CAB_FILES.CARD_INDX);
    } else {
      let assetBundle = new AssetBundle(cardIndxBundleOrig);
      await assetBundle.updateAssetBundle(originalIndxAsset, newIndxAsset, cardIndxBundleNew);
    }
    console.log("✅ CARD_Indx AssetBundle updated");

    // Verification step: Check that the created bundles are valid
    console.log("\n=== Verifying created AssetBundles ===");
    
    let verificationPassed = true;
    
    // Helper function to extract directory path from bundle
    async function getDirectoryPath(bundlePath: string): Promise<string | null> {
      try {
        // Extract to a temp directory to get the CAB filename
        const tempDir = path.join(resolvedTargetPath, '.verify_temp');
        if (!fs.existsSync(tempDir)) {
          fs.mkdirSync(tempDir, { recursive: true });
        }
        
        const bundle = new AssetBundle(bundlePath);
        const extracted = await bundle.extractAssetBundle(tempDir);
        
        // The extracted filename is the CAB name
        const cabName = extracted.length > 0 ? extracted[0] : null;
        
        // Clean up temp files
        extracted.forEach(file => {
          const filePath = path.join(tempDir, file);
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }
          const metaPath = filePath + '.meta.json';
          if (fs.existsSync(metaPath)) {
            fs.unlinkSync(metaPath);
          }
        });
        
        return cabName;
      } catch (error) {
        return null;
      }
    }
    
    // Verify CARD_Name bundle
    console.log("\n🔍 Verifying CARD_Name AssetBundle...");
    try {
      // Check CAB filename
      const origCABName = await getDirectoryPath(cardNameBundleOrig);
      const newCABName = await getDirectoryPath(cardNameBundleNew);
      
      if (origCABName && newCABName) {
        if (origCABName !== newCABName) {
          console.log(`❌ CAB filename mismatch: original="${origCABName}", new="${newCABName}"`);
          verificationPassed = false;
        } else {
          console.log(`✅ CAB filename preserved: "${origCABName}"`);
        }
      }
      
      // Check asset path is readable
      const nameNewBundle = new AssetBundle(cardNameBundleNew);
      const nameMatches = await nameNewBundle.scanForTextAssets(["card_name.bytes"]);
      if (nameMatches.length === 0) {
        console.log(`❌ Asset path not readable in new bundle (card_name.bytes not found)`);
        verificationPassed = false;
      } else {
        console.log(`✅ Asset path readable: "${nameMatches[0].assetPath}"`);
      }
    } catch (error) {
      console.log(`❌ Error verifying CARD_Name bundle: ${error instanceof Error ? error.message : String(error)}`);
      verificationPassed = false;
    }
    
    // Verify CARD_Desc bundle
    console.log("\n🔍 Verifying CARD_Desc AssetBundle...");
    try {
      const origCABName = await getDirectoryPath(cardDescBundleOrig);
      const newCABName = await getDirectoryPath(cardDescBundleNew);
      
      if (origCABName && newCABName) {
        if (origCABName !== newCABName) {
          console.log(`❌ CAB filename mismatch: original="${origCABName}", new="${newCABName}"`);
          verificationPassed = false;
        } else {
          console.log(`✅ CAB filename preserved: "${origCABName}"`);
        }
      }
      
      const descNewBundle = new AssetBundle(cardDescBundleNew);
      const descMatches = await descNewBundle.scanForTextAssets(["card_desc.bytes"]);
      if (descMatches.length === 0) {
        console.log(`❌ Asset path not readable in new bundle (card_desc.bytes not found)`);
        verificationPassed = false;
      } else {
        console.log(`✅ Asset path readable: "${descMatches[0].assetPath}"`);
      }
    } catch (error) {
      console.log(`❌ Error verifying CARD_Desc bundle: ${error instanceof Error ? error.message : String(error)}`);
      verificationPassed = false;
    }
    
    // Verify CARD_Indx bundle
    console.log("\n🔍 Verifying CARD_Indx AssetBundle...");
    try {
      const origCABName = await getDirectoryPath(cardIndxBundleOrig);
      const newCABName = await getDirectoryPath(cardIndxBundleNew);
      
      if (origCABName && newCABName) {
        if (origCABName !== newCABName) {
          console.log(`❌ CAB filename mismatch: original="${origCABName}", new="${newCABName}"`);
          verificationPassed = false;
        } else {
          console.log(`✅ CAB filename preserved: "${origCABName}"`);
        }
      }
      
      const indxNewBundle = new AssetBundle(cardIndxBundleNew);
      const indxMatches = await indxNewBundle.scanForTextAssets(["card_indx.bytes"]);
      if (indxMatches.length === 0) {
        console.log(`❌ Asset path not readable in new bundle (card_indx.bytes not found)`);
        verificationPassed = false;
      } else {
        console.log(`✅ Asset path readable: "${indxMatches[0].assetPath}"`);
      }
    } catch (error) {
      console.log(`❌ Error verifying CARD_Indx bundle: ${error instanceof Error ? error.message : String(error)}`);
      verificationPassed = false;
    }
    
    // Clean up temp directory
    const tempDir = path.join(resolvedTargetPath, '.verify_temp');
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    
    if (!verificationPassed) {
      console.log("\n❌ Verification failed! Created AssetBundles may not work correctly in the game.");
      console.log("   Please review the errors above before continuing.");
      if (!options?.skipReplace) {
        console.log("   Recommendation: Use --skip-replace to prevent copying potentially broken bundles.");
      }
    } else {
      console.log("\n✅ All verification checks passed!");
    }

    if (!options?.skipReplace) {
      console.log("\n=== Copying updated AssetBundles back to game directory ===");

      /* Copy the updated bundles back to the game directory */
      copyFileSync(cardNameBundleNew, cardNameBundlePathSrc);
      console.log(`✅ Copied ${MAD_BUNDLE_FILES.CARD_NAME} to game directory`);
      
      copyFileSync(cardDescBundleNew, cardDescBundlePathSrc);
      console.log(`✅ Copied ${MAD_BUNDLE_FILES.CARD_DESC} to game directory`);
      
      copyFileSync(cardIndxBundleNew, cardIndxBundlePathSrc);
      console.log(`✅ Copied ${MAD_BUNDLE_FILES.CARD_INDX} to game directory`);
    } else {
      console.log("\n⏭️  Skipping replacement step (--skip-replace enabled). Updated bundles left in target directory.");
    }

    console.log("\n=== mad-implant completed successfully! ===");
    console.log("\nTarget directory contents:");
    listDirContents(resolvedTargetPath);
  });

chain
  .command("mad-revert <game_dir> <target_dir>")
  .description("Revert modified AssetBundles in game directory to original backups from target directory")
  .action(async (game_dir, target_dir) => {
    /* Game source dir e.g: "~/Library/Application Support/CrossOver/Bottles/Steam/drive_c/Program Files (x86)/Steam/steamapps/common/Yu-Gi-Oh!  Master Duel" */
    /* Check the source directory existence */
    if (game_dir.startsWith('~')) {
      game_dir = path.join(os.homedir(), game_dir.slice(1));
    }

    const resolvedPath = path.resolve(game_dir);
    const resolvedTargetPath = path.resolve(target_dir);

    if(fs.existsSync(resolvedPath)) {
      console.log("Game dir: " + resolvedPath);
    }
    else {
      console.log("Game dir invalid, exiting");
      process.exit(1);
    }

    if(!fs.existsSync(resolvedTargetPath)) {
      console.log("Target directory invalid, exiting");
      process.exit(1);
    }

    console.log("Target dir: " + resolvedTargetPath);

    /* Check for the existence of .orig backup files */
    const cardNameBundleOrig = path.join(resolvedTargetPath, `${MAD_BUNDLE_FILES.CARD_NAME}.orig`);
    const cardDescBundleOrig = path.join(resolvedTargetPath, `${MAD_BUNDLE_FILES.CARD_DESC}.orig`);
    const cardIndxBundleOrig = path.join(resolvedTargetPath, `${MAD_BUNDLE_FILES.CARD_INDX}.orig`);

    if(!fs.existsSync(cardNameBundleOrig) || !fs.existsSync(cardDescBundleOrig) || !fs.existsSync(cardIndxBundleOrig)) {
      console.error("❌ Original backup files (.orig) not found in target directory.");
      console.error("   Make sure you have run 'mad2pot' first to create the backups.");
      process.exit(1);
    }

    console.log("✅ Found all original backup files");

    /* We check for the existence of CARD_Name, CARD_Desc and CARD_Indx bundles in game directory */
    const variablePathName = await getMADVariableDir(resolvedPath);
    const cardNameBundlePathDest = path.join(resolvedPath, `/LocalData/${variablePathName}/0000/${MAD_BUNDLE_PATHS.CARD_NAME}/${MAD_BUNDLE_FILES.CARD_NAME}`);
    const cardDescBundlePathDest = path.join(resolvedPath, `/LocalData/${variablePathName}/0000/${MAD_BUNDLE_PATHS.CARD_DESC}/${MAD_BUNDLE_FILES.CARD_DESC}`);
    const cardIndxBundlePathDest = path.join(resolvedPath, `/LocalData/${variablePathName}/0000/${MAD_BUNDLE_PATHS.CARD_INDX}/${MAD_BUNDLE_FILES.CARD_INDX}`);

    if(!fs.existsSync(cardNameBundlePathDest) || !fs.existsSync(cardDescBundlePathDest) || !fs.existsSync(cardIndxBundlePathDest)) {
      console.error("❌ Game AssetBundle files not found. Game may have been moved or updated.");
      process.exit(1);
    }

    console.log("✅ Game AssetBundle files found");

    console.log("\n=== Checking if revert is necessary ===");

    /* Check if files are already identical to the backups */
    const nameIdentical = areFilesIdentical(cardNameBundleOrig, cardNameBundlePathDest);
    const descIdentical = areFilesIdentical(cardDescBundleOrig, cardDescBundlePathDest);
    const indxIdentical = areFilesIdentical(cardIndxBundleOrig, cardIndxBundlePathDest);

    if (nameIdentical && descIdentical && indxIdentical) {
      console.log("✅ All game files are already identical to the original backups");
      console.log("   No action needed - game directory already has the reverted files");
      console.log("\n=== mad-revert completed ===");
      return;
    }

    console.log("\n=== Reverting AssetBundles to original backups ===");

    /* Copy the original backup files back to the game directory only if different */
    if (!nameIdentical) {
      copyFileSync(cardNameBundleOrig, cardNameBundlePathDest);
      console.log(`✅ Reverted ${MAD_BUNDLE_FILES.CARD_NAME} to original`);
    } else {
      console.log(`⏭️  Skipped ${MAD_BUNDLE_FILES.CARD_NAME} (already matches original)`);
    }
    
    if (!descIdentical) {
      copyFileSync(cardDescBundleOrig, cardDescBundlePathDest);
      console.log(`✅ Reverted ${MAD_BUNDLE_FILES.CARD_DESC} to original`);
    } else {
      console.log(`⏭️  Skipped ${MAD_BUNDLE_FILES.CARD_DESC} (already matches original)`);
    }
    
    if (!indxIdentical) {
      copyFileSync(cardIndxBundleOrig, cardIndxBundlePathDest);
      console.log(`✅ Reverted ${MAD_BUNDLE_FILES.CARD_INDX} to original`);
    } else {
      console.log(`⏭️  Skipped ${MAD_BUNDLE_FILES.CARD_INDX} (already matches original)`);
    }

    console.log("\n=== mad-revert completed successfully! ===");
    console.log("AssetBundles have been reverted to their original state.");
  });

chain
  .command("mad-locate <game_dir>")
  .description("Locate MAD AssetBundles containing CARD files (card_name.bytes, card_desc.bytes, card_indx.bytes)")
  .action(async (game_dir) => {
    /* Expand tilde in path */
    if (game_dir.startsWith('~')) {
      game_dir = path.join(os.homedir(), game_dir.slice(1));
    }

    const resolvedPath = path.resolve(game_dir);

    if(!fs.existsSync(resolvedPath)) {
      console.log("Game directory invalid, exiting");
      process.exit(1);
    }

    console.log("Scanning directory: " + resolvedPath);
    
    const TARGET_SUFFIXES = [
      "card_desc.bytes",
      "card_name.bytes",
      "card_indx.bytes",
    ];

    // Find LocalData directory
    const localDataPath = path.join(resolvedPath, 'LocalData');
    if (!fs.existsSync(localDataPath)) {
      console.log("LocalData directory not found in game directory");
      process.exit(1);
    }

    console.log("Traversing LocalData AssetBundles...\n");

    // Track which target files have been found
    const foundFiles = new Set<string>();

    // Recursively walk all files in LocalData
    async function walkFiles(dir: string): Promise<boolean> {
      const entries = await fs.promises.readdir(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        
        if (entry.isDirectory()) {
          const shouldStop = await walkFiles(fullPath);
          if (shouldStop) return true;
        } else if (entry.isFile()) {
          // Try to scan this file as an AssetBundle
          const assetBundle = new AssetBundle(fullPath);
          const matches = await assetBundle.scanForTextAssets(TARGET_SUFFIXES);
          
          if (matches.length > 0) {
            for (const match of matches) {
              console.log("--------------------------------------------------");
              console.log("FOUND MATCH:");
              console.log(`  Asset Path : ${match.assetPath}`);
              console.log(`  In Bundle  : ${match.bundlePath}`);
              console.log("--------------------------------------------------");
              
              // Track which target file was found
              for (const suffix of TARGET_SUFFIXES) {
                if (match.assetPath.toLowerCase().endsWith(suffix.toLowerCase())) {
                  foundFiles.add(suffix);
                  break;
                }
              }
              
              // Check if all target files have been found
              if (foundFiles.size === TARGET_SUFFIXES.length) {
                console.log("\nAll target files located. Exiting...");
                return true;
              }
            }
          }
        }
      }
      return false;
    }

    await walkFiles(localDataPath);
    console.log("\nScan complete.");
  });

chain
  .command("otn2pot <source_nds> <target_dir>")
  .description("Export from OTN NDS to create otn.pot PO Template file")
  .action(async (source_nds, target_dir) => {
    const ndsPath = source_nds;
    const outputDir = target_dir;

    const ndsHandler = new NDSHandler(ndsPath);
    ndsHandler.extractFiles(outputDir);

    ndsHandler.rebuildNDS('modified.nds');
  });

chain
  .command("wc62pot <source_gba> <target_dir>")
  .description("Export from WCT 2006 GBA to create wc6.pot PO Template file")
  .action(async (source_gba, target_dir) => {
    fs.copyFileSync(source_gba, path.join(target_dir, '/wc6.gba'));
    (async () => await new YgoTexts().exportToPot(target_dir, YuGiOh.WC6).then(() => listDirContents(target_dir)))();
  });

chain
  .command("tf6-extract <source_iso> <target_dir>")
  .description("Read Tag Force 6 .iso file to extract card information to target directory (tf6.pot)")
  .action((source_iso, target_dir) => {
    if(source_iso.startsWith('~')) {
      source_iso = path.join(os.homedir(), source_iso.slice(1));
    }

    if(target_dir.startsWith('~')) {
      target_dir = path.join(os.homedir(), target_dir.slice(1));
    }

    const resolvedISOPath = path.resolve(source_iso);

    if(fs.existsSync(resolvedISOPath)) {
      console.log("Source iso: " + resolvedISOPath);
    }
    else {
      console.log("Source iso invalid, exiting");
      process.exit(1);
    }

    /* Extract .ehp container from .iso */
    const isoReader = new UMDISOReader(resolvedISOPath);
    ensureDirectoryExists(target_dir);
    isoReader.exportFile("PSP_GAME/USRDIR/duelsys/cardinfo_jpn.ehp", target_dir);
    isoReader.close();

    /* Extract card .bin files from .ehp */
    const ehp = new Ehp(target_dir, path.join(target_dir, "/cardinfo_jpn.ehp"));
    ehp.extract();

    /* Convert .bin CARD files to tf6.pot */
    (async () => await new YgoTexts().exportToPot(target_dir, YuGiOh.TF6).then(() => listDirContents(target_dir)))();
  });

chain
  .command("tf6-implant <source_iso> <target_dir>")
  .description("Produce a new ISO based on source ISO and the language asset (CARD_Desc_J.po) in target directory. A new ISO will be written to <target_dir> as tf6.iso")
  .action(async (source_iso, target_dir) => {
    if(source_iso.startsWith('~')) {
      source_iso = path.join(os.homedir(), source_iso.slice(1));
    }

    if(target_dir.startsWith('~')) {
      target_dir = path.join(os.homedir(), target_dir.slice(1));
    }

    const resolvedISOPath = path.resolve(source_iso);
    const resolvedPOPath = path.join(target_dir, "/CARD_Desc_J.po");
    const resolvedEHPPath = path.join(target_dir, "/cardinfo_jpn.ehp");

    if(fs.existsSync(resolvedISOPath)) {
      console.log("Source iso: " + resolvedISOPath);
    }
    else {
      console.log("Source iso invalid, exiting");
      process.exit(1);
    }

    if(fs.existsSync(resolvedPOPath)) {
      console.log("Source PO: " + resolvedPOPath);
    }
    else {
      console.log("Source PO invalid. Cannot find CARD_Desc_J.po, exiting");
      process.exit(1);
    }

    /* Process the PO file and convert it to TXT */
    const transformer = new Transformer();
    transformer.poToTxt(resolvedPOPath);

    /* Build new Dictionary */
    const dictionaryBuilder = new DictionaryBuilder();
    dictionaryBuilder.build(path.join(target_dir + "/DICT_J.tin"));

    /* Update .bin */
    const CardDesc = fs.readFileSync(path.join(target_dir + "/CARD_Desc_J.txt"), 'utf8');
    const ygoTextInstance = new YgoTexts();
    console.log("Processing...");
    ygoTextInstance.updateCardDesc(CardDesc, path.join(target_dir + "/CARD_Desc_J.txt"), false);

    /* It seems that without delay an incorrect .ehp gets compiled in the next step which may lead to missing card
       descriptions. Needs further investigation why exactly that happens.
     */
    await delay(1000);

    /* Update the .ehp in target directory */
    const ehp = new Ehp(target_dir, resolvedEHPPath);
    ehp.update();

    /* Write a new .iso with the updated .ehp */
    const isoReader = new UMDISOReader(resolvedISOPath);
    isoReader.writeUpdatedISO("PSP_GAME/USRDIR/duelsys/cardinfo_jpn.ehp", resolvedEHPPath,
      path.join(target_dir, YuGiOh[YuGiOh.TF6].toLowerCase() + ".iso"));
  });

chain
  .command("tfs-extract <source_iso> <target_dir>")
  .description("Read Tag Force Special .iso file to extract card information to target directory (.txt)")
  .action((source_iso, target_dir) => {
    if(source_iso.startsWith('~')) {
      source_iso = path.join(os.homedir(), source_iso.slice(1));
    }

    if(target_dir.startsWith('~')) {
      target_dir = path.join(os.homedir(), target_dir.slice(1));
    }

    const resolvedISOPath = path.resolve(source_iso);

    if(fs.existsSync(resolvedISOPath)) {
      console.log("Source iso: " + resolvedISOPath);
    }
    else {
      console.log("Source iso invalid, exiting");
      process.exit(1);
    }

    /* Extract .ehp container from .iso */
    const isoReader = new UMDISOReader(resolvedISOPath);
    ensureDirectoryExists(target_dir);
    isoReader.exportFile("PSP_GAME/USRDIR/duelsys/cardinfo_jpn.ehp", target_dir);
    isoReader.close();

    /* Extract card .bin files from .ehp */
    const ehp = new Ehp(target_dir, path.join(target_dir, "/cardinfo_jpn.ehp"));
    ehp.extract();

    /* Convert .bin CARD files to .txt */
    (async () => await new YgoTexts().exportToPot(target_dir, YuGiOh.TFS).then(() => listDirContents(target_dir)))();
  });

chain
  .command("tfs-implant <source_iso> <target_dir>")
  .description("Produce a new ISO based on source ISO and the language asset (CARD_Desc_R.po) in target directory. A new ISO will be written to <target_dir> as tfs.iso")
  .action(async (source_iso, target_dir) => {
    if(source_iso.startsWith('~')) {
      source_iso = path.join(os.homedir(), source_iso.slice(1));
    }

    if(target_dir.startsWith('~')) {
      target_dir = path.join(os.homedir(), target_dir.slice(1));
    }

    const resolvedISOPath = path.resolve(source_iso);
    const resolvedPOPath = path.join(target_dir, "/CARD_Desc_R.po");
    const resolvedEHPPath = path.join(target_dir, "/cardinfo_jpn.ehp");

    if(fs.existsSync(resolvedISOPath)) {
      console.log("Source iso: " + resolvedISOPath);
    }
    else {
      console.log("Source iso invalid, exiting");
      process.exit(1);
    }

    if(fs.existsSync(resolvedPOPath)) {
      console.log("Source PO: " + resolvedPOPath);
    }
    else {
      console.log("Source PO invalid. Cannot find CARD_Desc_R.po, exiting");
      process.exit(1);
    }

    /* Process the PO file and convert it to TXT */
    const transformer = new Transformer();
    transformer.poToTxt(resolvedPOPath, YuGiOh.TFS);

    /* Build new Dictionary */
    const dictionaryBuilder = new DictionaryBuilder();
    dictionaryBuilder.build(path.join(target_dir + "/DICT_R.tin"));

    /* Update .bin */
    const CardDesc = fs.readFileSync(path.join(target_dir + "/CARD_Desc_R.txt"), 'utf8');
    const ygoTextInstance = new YgoTexts();
    console.log("Processing...");
    ygoTextInstance.updateCardDesc(CardDesc, path.join(target_dir + "/CARD_Desc_R.txt"), false);

    /* It seems that without delay an incorrect .ehp gets compiled in the next step which may lead to missing card
       descriptions. Needs further investigation why exactly that happens.
     */
    await delay(1000);

    /* Update the .ehp in target directory */
    const ehp = new Ehp(target_dir, resolvedEHPPath);
    ehp.update();

    /* Write a new .iso with the updated .ehp */
    const isoReader = new UMDISOReader(resolvedISOPath);
    isoReader.writeUpdatedISO("PSP_GAME/USRDIR/duelsys/cardinfo_jpn.ehp", resolvedEHPPath,
      path.join(target_dir, YuGiOh[YuGiOh.TFS].toLowerCase() + ".iso"));

    listDirContents(target_dir);
  });

program
  .version("0.3.0")
  .description("A helper tool to export and import CARD texts for Yu-Gi-Oh! 5D's Tag Force 6")
  .option("-e, --export <directory>", "process and export CARD_ files in the directory for export")
  .option("-i, --import <directory>", "process and import texts to .bin files")
  .option("-f, --format <format>", "specify the export format: pot|ygt, default: ygt")
  .option("-g, --game <game>", "specify the game: tf6|tfs|mad, default: tf6")
  .option("-t, --transform <directory>", "transform CARD_Desc_J.po to CARD_Desc_J.txt")
  .option("-b, --build <directory>", "build a new Dictionary (slow)")
  .parse(process.argv);

const options = program.opts();

function ensureDirectoryExists(directoryPath: string): void {
  if (!fs.existsSync(directoryPath)) {
    fs.mkdirSync(directoryPath, { recursive: true });
    console.log(`Directory created: ${directoryPath}`);
  } else {
    console.log(`Directory already exists: ${directoryPath}`);
  }
}

async function listDirContents(filepath: string) {
  try {
    const files = await fs.promises.readdir(filepath);
    const detailedFilesPromises = files.map(async (file: string) => {
      let fileDetails = await fs.promises.lstat(path.resolve(filepath, file));
      const { size, birthtime } = fileDetails;
      return { filename: file, "size(B)": size, created_at: birthtime };
    });
    const detailedFiles = await Promise.all(detailedFilesPromises);
    console.table(detailedFiles);
  } catch (error) {
    console.error("Error occurred while reading the directory!", error);
  }
}

async function getMADVariableDir(resolvedPath: string): Promise<string> {
  const localDataPath = path.join(resolvedPath, 'LocalData');

  try {
    const entries = await fs.promises.readdir(localDataPath, { withFileTypes: true });

    // Filter out only directories
    const directories = entries
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name);

    if (directories.length === 0) {
      throw new Error('No directories found in LocalData.');
    }

    // Select the directory you need (e.g., the first one)
    const variableDir = directories[0]; // Replace with your selection logic if needed

    return variableDir;
  } catch (err) {
    if (err instanceof Error) {
      throw new Error(`Error accessing LocalData directory: ${err.message}`);
    } else {
      throw new Error('Error accessing LocalData directory: An unknown error occurred.');
    }
  }
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Copies a file synchronously from source to destination
 * @param sourcePath The path to the source file
 * @param destinationPath The path to the destination file
 * @throws Error if the source file doesn't exist or if the copy operation fails
 */
function copyFileSync(sourcePath: string, destinationPath: string): void {
  try {
    // Ensure the source file exists
    if (!fs.existsSync(sourcePath)) {
      throw new Error(`Source file does not exist: ${sourcePath}`);
    }

    // Ensure the destination directory exists
    const destDir = path.dirname(destinationPath);
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }

    // Copy the file
    fs.copyFileSync(sourcePath, destinationPath);
    console.log(`File copied successfully from ${sourcePath} to ${destinationPath}`);
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to copy file: ${error.message}`);
    } else {
      throw new Error('Failed to copy file: Unknown error occurred');
    }
  }
}

/**
 * Copies a file synchronously from source to destination only if destination doesn't exist.
 * This function is useful for preserving original backup files that should not be overwritten.
 * @param sourcePath The path to the source file
 * @param destinationPath The path to the destination file
 * @returns boolean indicating whether the file was copied (true) or skipped because destination exists (false)
 * @throws Error if the source file doesn't exist (missing source) or if the copy operation fails
 */
function copyFileIfNotExists(sourcePath: string, destinationPath: string): boolean {
  try {
    // Check if destination already exists
    if (fs.existsSync(destinationPath)) {
      console.log(`Skipping copy - destination already exists: ${destinationPath}`);
      return false;
    }

    // Ensure the source file exists
    if (!fs.existsSync(sourcePath)) {
      throw new Error(`Source file does not exist: ${sourcePath}`);
    }

    // Ensure the destination directory exists
    const destDir = path.dirname(destinationPath);
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }

    // Copy the file
    fs.copyFileSync(sourcePath, destinationPath);
    console.log(`File copied successfully from ${sourcePath} to ${destinationPath}`);
    return true;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to copy file: ${error.message}`);
    } else {
      throw new Error('Failed to copy file: Unknown error occurred');
    }
  }
}

/**
 * Compares two files by size and SHA-256 checksum to determine if they are identical
 * @param filePath1 Path to the first file
 * @param filePath2 Path to the second file
 * @returns true if files are identical (same size and checksum), false otherwise
 */
function areFilesIdentical(filePath1: string, filePath2: string): boolean {
  try {
    // Check if both files exist
    if (!fs.existsSync(filePath1) || !fs.existsSync(filePath2)) {
      return false;
    }

    // Quick check: compare file sizes first
    const stats1 = fs.statSync(filePath1);
    const stats2 = fs.statSync(filePath2);
    
    if (stats1.size !== stats2.size) {
      return false;
    }

    // If sizes match, compare checksums
    const hash1 = crypto.createHash('sha256');
    const hash2 = crypto.createHash('sha256');
    
    const data1 = fs.readFileSync(filePath1);
    const data2 = fs.readFileSync(filePath2);
    
    hash1.update(data1);
    hash2.update(data2);
    
    const checksum1 = hash1.digest('hex');
    const checksum2 = hash2.digest('hex');
    
    return checksum1 === checksum2;
  } catch (error) {
    // If any error occurs during comparison, assume files are different
    return false;
  }
}

/* The below represents the default command "card" scope actions for export,import,transform and build */
if ("export" in options) {
  const resolvedPath = path.resolve(process.cwd(), <string> options.export);
  console.log("Export Path: " + resolvedPath);

  const ygoTextInstance = new YgoTexts();

  if("game" in options) {
    if(!["tf6", "tfs", "mad", "otn"].includes(options.game as string)) {
      console.error("Unsupported game!")
      process.exit(1);
    }
  }

  if("format" in options) {
    // We have format specifier added in the cli call
    if(options.format === "pot" && "game" in options) {
      console.log("Output format selected: POT");
      if("game" in options && options.game === "mad") {
        const result = await ygoTextInstance.exportToPot(resolvedPath, YuGiOh.MAD);
      }
      else if("game" in options && options.game === "otn") {
        await ygoTextInstance.exportToPot(resolvedPath, YuGiOh.OTN);
      }
      else {
        const result = await ygoTextInstance.exportToPot(resolvedPath, YuGiOh.TF6);
      }
    }
    else if(options.format === "ygt") {
      console.log("Output format selected: YGTool");
      const result = await ygoTextInstance.exportToTxt(resolvedPath, YuGiOh.TF6);
    }
    else {
      // Unknown format specified
      console.error("Invalid format specified, legal values: 'pot' || 'ygt', you specified: '" + options.format + "'");
      process.exit(1);
    }
  }
  else {
    const result = await ygoTextInstance.exportToTxt(resolvedPath, YuGiOh.TF6);
    listDirContents(resolvedPath);
  }
}
else if ("import" in options) {
  const resolvedPath = path.resolve(process.cwd(), <string> options.import);
  console.log("Import Path: " + resolvedPath);
  let fileName = "CARD_Desc_J.txt";

  if("game" in options) {
    if(!["tf6", "tfs"].includes(options.game as string)) {
      console.error("Unsupported game!")
      process.exit(1);
    }

    fileName = options.game === "tfs" ? "CARD_Desc_R.txt" : "CARD_Desc_J.txt";
  }

  const CardDesc = fs.readFileSync(resolvedPath + '/' + fileName, 'utf8');
  const ygoTextInstance = new YgoTexts();
  console.log("Processing...");
  ygoTextInstance.updateCardDesc(CardDesc, resolvedPath + '/' + fileName, false);
}
else if ("transform" in options) {
  const resolvedPath = path.resolve(process.cwd(), <string> options.transform);
  console.log("Transform Path: " + resolvedPath);
  const transformer = new Transformer();
  transformer.poToTxt(resolvedPath + "/CARD_Desc_J.po");
}
else if ("build" in options) {
  const resolvedPath = path.resolve(process.cwd(), <string> options.build);
  const dictionaryBuilder = new DictionaryBuilder();
  dictionaryBuilder.build(resolvedPath + "/DICT_J.tin");
}

if (!process.argv.slice(2).length) {
  program.outputHelp();
}
