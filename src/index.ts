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
import { decrypt } from "./decrypt.js";

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
  .command("mad2pot <source_dir> <target_dir>")
  .description("Export from Master Duel installation directory to create mad.pot PO Template file")
  .action(async (source_dir, target_dir) => {
    /* Game source dir e.g: "~/Library/Application Support/CrossOver/Bottles/Steam/drive_c/Program Files (x86)/Steam/steamapps/common/Yu-Gi-Oh!  Master Duel" */
    /* Check the source directory existence */
    if (source_dir.startsWith('~')) {
      source_dir = path.join(os.homedir(), source_dir.slice(1));
    }

    const resolvedPath = path.resolve(source_dir);
    const resolvedTargetPath = path.resolve(target_dir);

    if(fs.existsSync(resolvedPath)) {
      console.log("Source dir: " + resolvedPath);
    }
    else {
      console.log("Source dir invalid, exiting");
      process.exit(1);
    }

    /* We check for the existence of CARD_Name, CARD_Desc and CARD_Indx containers */
    /* If these files are not found, most likely the client has updated and the location of the files have moved */
    const variablePathName = await getMADVariableDir(resolvedPath);
    const cardNameBundlePath = path.join(resolvedPath, `/LocalData/${variablePathName}/0000/7c/7cc714c8`);
    const cardDescBundlePath = path.join(resolvedPath, `/LocalData/${variablePathName}/0000/29/2951c69a`);
    const cardIndxBundlePath = path.join(resolvedPath, `/LocalData/${variablePathName}/0000/58/5888bcdc`);
    const cryptoKey = 0xd5;

    if(fs.existsSync(cardNameBundlePath) && fs.existsSync(cardDescBundlePath) && fs.existsSync(cardIndxBundlePath)) {
      console.log("Correct input files found");
    }

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
  .action((source_iso, target_dir) => {
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
      console.log("Source PO invalid, exiting");
      process.exit(1);
    }

    /* Process the PO file and convert it to TXT */
    const transformer = new Transformer();
    transformer.poToTxt(resolvedPOPath);

    /* Build new Dictionary */
    const dictionaryBuilder = new DictionaryBuilder();
    dictionaryBuilder.build(path.join(target_dir + "/DICT_J.tin"));

    /* Update the .ehp in target directory */
    const ehp = new Ehp(target_dir, resolvedEHPPath);
    ehp.update();

    /* Write a new .iso with the updated .ehp */
    const isoReader = new UMDISOReader(resolvedISOPath);
    isoReader.writeUpdatedISO("PSP_GAME/USRDIR/duelsys/cardinfo_jpn.ehp", resolvedEHPPath,
      path.join(target_dir, YuGiOh[YuGiOh.TF6].toLowerCase() + ".iso"));

    listDirContents(target_dir);
  });

program
  .version("0.3.0")
  .description("A helper tool to export and import CARD texts for Yu-Gi-Oh! 5D's Tag Force 6")
  .option("-e, --export <directory>", "process and export CARD_ files in the directory for export")
  .option("-i, --import <directory>", "process and import texts to .bin files")
  .option("-f, --format <format>", "specify the export format: pot|ygt, default: ygt")
  .option("-g, --game <game>", "specify the game: tf6|mad, default: tf6")
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

  const CardDesc = fs.readFileSync(resolvedPath + "/CARD_Desc_J.txt", 'utf8');
  const ygoTextInstance = new YgoTexts();
  ygoTextInstance.updateCardDesc(CardDesc, resolvedPath + "/CARD_Desc_J.txt", false);
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
