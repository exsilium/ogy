import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import figlet from 'figlet';
import { Command } from '@commander-js/extra-typings';
import { YuGiOh, Transformer, DictionaryBuilder } from './compressor.js';
import { YgoTexts } from './ygotexts.js';
import { Ehp } from './ehp.js';
import { AssetBundle } from './assetbundle.js';
import { CABExtractor } from './cab.js';
import { UMDISOReader } from './umdiso.js';
import { NDSHandler } from './nds.js';
import { decrypt, encrypt } from "./crypt.js";

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
  .description("Export from Master Duel installation directory to create mad.pot PO Template file")
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
    const cardNameBundlePathSrc = path.join(resolvedPath, `/LocalData/${variablePathName}/0000/f6/f67aab7c`);
    const cardDescBundlePathSrc = path.join(resolvedPath, `/LocalData/${variablePathName}/0000/a3/a3ec792e`);
    const cardIndxBundlePathSrc = path.join(resolvedPath, `/LocalData/${variablePathName}/0000/d2/d2350368`);
    const cryptoKey = 0x2d;

    if(fs.existsSync(cardNameBundlePathSrc) && fs.existsSync(cardDescBundlePathSrc) && fs.existsSync(cardIndxBundlePathSrc)) {
      console.log("Correct input files found");
    }

    const cardNameBundlePath = resolvedTargetPath + "/f67aab7c.orig";
    const cardDescBundlePath = resolvedTargetPath + "/a3ec792e.orig";
    const cardIndxBundlePath = resolvedTargetPath + "/d2350368.orig";

    /* Copy the original files to the target directory */
    copyFileSync(cardNameBundlePathSrc, cardNameBundlePath);
    copyFileSync(cardDescBundlePathSrc, cardDescBundlePath);
    copyFileSync(cardIndxBundlePathSrc, cardIndxBundlePath);

    /* cardName */
    let assetBundle = new AssetBundle(cardNameBundlePath);
    let extractedAssetBundle = await assetBundle.extractAssetBundle(resolvedTargetPath);

    for(const asset of extractedAssetBundle) {
      const extractedFile = await CABExtractor.extract(path.join(resolvedTargetPath, asset), resolvedTargetPath);
    }

    let encryptedData = fs.readFileSync(resolvedTargetPath + "/CARD_Name.bin");
    let decryptedData = decrypt(encryptedData, cryptoKey);

    if (decryptedData.length > 0) {
      fs.writeFileSync(resolvedTargetPath + "/CARD_Name.decrypted.bin", decryptedData);
    } else {
      console.error('Decryption failed for CARD_Name.');
    }

    /* cardDesc */
    assetBundle = new AssetBundle(cardDescBundlePath);
    extractedAssetBundle = await assetBundle.extractAssetBundle(resolvedTargetPath);

    for(const asset of extractedAssetBundle) {
      await CABExtractor.extract(path.join(resolvedTargetPath, asset), resolvedTargetPath);
    }

    encryptedData = fs.readFileSync(resolvedTargetPath + "/CARD_Desc.bin");
    decryptedData = decrypt(encryptedData, cryptoKey);

    if (decryptedData.length > 0) {
      fs.writeFileSync(resolvedTargetPath + "/CARD_Desc.decrypted.bin", decryptedData);
    } else {
      console.error('Decryption failed for CARD_Desc.');
    }

    /* cardIndx */
    assetBundle = new AssetBundle(cardIndxBundlePath);
    extractedAssetBundle = await assetBundle.extractAssetBundle(resolvedTargetPath);

    for(const asset of extractedAssetBundle) {
      await CABExtractor.extract(path.join(resolvedTargetPath, asset), resolvedTargetPath);
    }

    encryptedData = fs.readFileSync(resolvedTargetPath + "/CARD_Indx.bin");
    decryptedData = decrypt(encryptedData, cryptoKey);

    if (decryptedData.length > 0) {
      fs.writeFileSync(resolvedTargetPath + "/CARD_Indx.decrypted.bin", decryptedData);
    } else {
      console.error('Decryption failed for CARD_Indx.');
    }

    await new YgoTexts().exportToPot(resolvedTargetPath, YuGiOh.MAD);
    listDirContents(resolvedTargetPath);
  });

chain
  .command("mad-implant <game_dir> <target_dir>")
  .description("Repack MAD resources (TESTING SPACE, DOES NOT WORK, DO NOT USE!)")
  .action(async (game_dir, target_dir) => {
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

    /* Process the PO file and convert it to TXT */
    const transformer = new Transformer();
    /* We don't actually need the Txt output, nor any file for DICT, so I think for MAD we need alternative logic */
    transformer.poToTxt(resolvedPOPath, YuGiOh.MAD);
    transformer.entriesToBin(resolvedTargetPath, YuGiOh.MAD);

    /* We check for the existence of CARD_Name, CARD_Desc and CARD_Indx bundles */
    /* If these files are not found, most likely the client has updated and the location of the files have moved */
    const variablePathName = await getMADVariableDir(resolvedPath);
    const cardNameBundlePathSrc = path.join(resolvedPath, `/LocalData/${variablePathName}/0000/f6/f67aab7c`);
    const cardDescBundlePathSrc = path.join(resolvedPath, `/LocalData/${variablePathName}/0000/a3/a3ec792e`);
    const cardIndxBundlePathSrc = path.join(resolvedPath, `/LocalData/${variablePathName}/0000/d2/d2350368`);
    const cryptoKey = 0x2d;

    if(fs.existsSync(cardNameBundlePathSrc) && fs.existsSync(cardDescBundlePathSrc) && fs.existsSync(cardIndxBundlePathSrc)) {
      console.log("Correct source files found for replacement");
    }

    const cardNameBundlePath = resolvedTargetPath + "/f67aab7c";
    const cardDescBundlePath = resolvedTargetPath + "/a3ec792e";
    const cardIndxBundlePath = resolvedTargetPath + "/d2350368";

    /* cardName */
    let decryptedData = fs.readFileSync(resolvedTargetPath + "/CARD_Name_New.decrypted.bin");
    let encryptedData = encrypt(decryptedData, cryptoKey);

    /* cardDesc */
    decryptedData = fs.readFileSync(resolvedTargetPath + "/CARD_Desc_New.decrypted.bin");
    encryptedData = encrypt(decryptedData, cryptoKey);

    /* cardIndx */
    decryptedData = fs.readFileSync(resolvedTargetPath + "/CARD_Indx_New.decrypted.bin");
    encryptedData = encrypt(decryptedData, cryptoKey);

    /* Create or modify the CAB file for CARD_Name   */
    copyFileSync(resolvedTargetPath + "/CAB-260ccd1ac572eb90ac7e11a7d19da5c8",
      resolvedTargetPath + "/CAB-260ccd1ac572eb90ac7e11a7d19da5c8.orig");
    CABExtractor.update(resolvedTargetPath + "/CAB-260ccd1ac572eb90ac7e11a7d19da5c8.orig",
      resolvedTargetPath + "/CARD_Name.bin",
      resolvedTargetPath + "/CARD_Name.repack.bin",
      resolvedTargetPath + "/CAB-260ccd1ac572eb90ac7e11a7d19da5c8");

    /* Create the new AssetBundle for CARD_Name */
    let assetBundle = new AssetBundle(resolvedTargetPath + "/f67aab7c.orig");
    await assetBundle.rebuildAssetBundle(
      resolvedTargetPath + "/CAB-260ccd1ac572eb90ac7e11a7d19da5c8", // updated CAB file
      resolvedTargetPath + "/f67aab7c"
    );

    /* Create or modify the CAB file for CARD_Desc */
    copyFileSync(resolvedTargetPath + "/CAB-8c0887c885a382ccdbebde6074497517",
      resolvedTargetPath + "/CAB-8c0887c885a382ccdbebde6074497517.orig");
    CABExtractor.update(resolvedTargetPath + "/CAB-8c0887c885a382ccdbebde6074497517.orig",
      resolvedTargetPath + "/CARD_Desc.bin",
      resolvedTargetPath + "/CARD_Desc.repack.bin",
      resolvedTargetPath + "/CAB-8c0887c885a382ccdbebde6074497517");

    /* Create the new AssetBundle for CARD_Desc */
    assetBundle = new AssetBundle(resolvedTargetPath + "/a3ec792e.orig");
    await assetBundle.rebuildAssetBundle(
      resolvedTargetPath + "/CAB-8c0887c885a382ccdbebde6074497517", // updated CAB file
      resolvedTargetPath + "/a3ec792e"
    );

    /* Create or modify the CAB file for CARD_Indx */
    copyFileSync(resolvedTargetPath + "/CAB-e01e19d89734ca1ba7ddbcc5e02cd7b2",
      resolvedTargetPath + "/CAB-e01e19d89734ca1ba7ddbcc5e02cd7b2.orig");
    CABExtractor.update(resolvedTargetPath + "/CAB-e01e19d89734ca1ba7ddbcc5e02cd7b2.orig",
      resolvedTargetPath + "/CARD_Indx.bin",
      resolvedTargetPath + "/CARD_Indx.repack.bin",
      resolvedTargetPath + "/CAB-e01e19d89734ca1ba7ddbcc5e02cd7b2");

    /* Create the new AssetBundle for CARD_Indx */
    assetBundle = new AssetBundle(resolvedTargetPath + "/d2350368.orig");
    await assetBundle.rebuildAssetBundle(
      resolvedTargetPath + "/CAB-e01e19d89734ca1ba7ddbcc5e02cd7b2", // updated CAB file
      resolvedTargetPath + "/d2350368"
    );

    copyFileSync(cardNameBundlePath, cardNameBundlePathSrc);
    copyFileSync(cardDescBundlePath, cardDescBundlePathSrc);
    copyFileSync(cardIndxBundlePath, cardIndxBundlePathSrc);

    listDirContents(resolvedTargetPath);
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
  .description("Produce a new ISO based on source ISO and the language asset (CARD_Desc_J.po) in target directory")
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
  .description("Produce a new ISO based on source ISO and the language assets in target directory [NOT WORKING]")
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
