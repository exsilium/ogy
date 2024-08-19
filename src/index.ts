import * as fs from 'fs';
import * as path from 'path';
import figlet from 'figlet';
import { Command } from '@commander-js/extra-typings';
import { YuGiOh, Transformer, DictionaryBuilder } from './compressor.js';
import { YgoTexts } from './ygotexts.js';
import { Ehp } from './ehp.js';
import { AssetBundle } from './assetbundle.js';
import { CABExtractor } from './cab.js';

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
    const extractedAssetBundle = assetBundle.extractAssetBundle(path.resolve(process.cwd(), directory));

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
  })

program
  .version("0.2.0")
  .description("A helper tool to export and import CARD texts for Yu-Gi-Oh! 5D's Tag Force 6")
  .option("-e, --export <directory>", "process and export CARD_ files in the directory for export")
  .option("-i, --import <directory>", "process and import texts to .bin files")
  .option("-f, --format <format>", "specify the export format: pot|ygt, default: ygt")
  .option("-g, --game <game>", "specify the game: tf6|mad, default: tf6")
  .option("-t, --transform <directory>", "transform CARD_Desc_J.po to CARD_Desc_J.txt")
  .option("-b, --build <directory>", "build a new Dictionary (slow)")
  .parse(process.argv);

const options = program.opts();

async function listDirContents(filepath: string) {
  try {
    const files = await fs.promises.readdir(filepath);
    const detailedFilesPromises = files.map(async (file: string) => {
      let fileDetails = await fs.promises.lstat(path.resolve(filepath, file));
      const { size, birthtime } = fileDetails;
      return { filename: file, "size(KB)": size, created_at: birthtime };
    });
    const detailedFiles = await Promise.all(detailedFilesPromises);
    console.table(detailedFiles);
  } catch (error) {
    console.error("Error occurred while reading the directory!", error);
  }
}

if ("export" in options) {
  const resolvedPath = path.resolve(process.cwd(), <string> options.export);
  console.log("Export Path: " + resolvedPath);

  const ygoTextInstance = new YgoTexts();

  if("game" in options) {
    if(options.game != "tf6" && options.game != "mad") {
      console.error("Unsupported game!")
      process.exit(1);
    }
  }

  if("format" in options && "game" in options) {
    if(options.format === "pot" && options.game === "mad") {
      console.log("Output format selected: POT");
      const result = await ygoTextInstance.exportToPot(resolvedPath, YuGiOh.MAD);
    }
  }
  else if("format" in options) {
    // We have format specifier added in the cli call
    if(options.format === "pot") {
      console.log("Output format selected: POT");
      const result = await ygoTextInstance.exportToPot(resolvedPath, YuGiOh.TF6);
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

if ("import" in options) {
  const resolvedPath = path.resolve(process.cwd(), <string> options.import);
  console.log("Import Path: " + resolvedPath);

  const CardDesc = fs.readFileSync(resolvedPath + "/CARD_Desc_J.txt", 'utf8');
  const ygoTextInstance = new YgoTexts();
  ygoTextInstance.updateCardDesc(CardDesc, resolvedPath + "/CARD_Desc_J.txt", false);
}

if ("transform" in options) {
  const resolvedPath = path.resolve(process.cwd(), <string> options.transform);
  console.log("Transform Path: " + resolvedPath);
  const transformer = new Transformer();
  transformer.poToTxt(resolvedPath + "/CARD_Desc_J.po");
}

if ("build" in options) {
  const resolvedPath = path.resolve(process.cwd(), <string> options.build);
  const dictionaryBuilder = new DictionaryBuilder();
  dictionaryBuilder.build(resolvedPath + "/DICT_J.tin");
}

if (!process.argv.slice(2).length) {
  program.outputHelp();
}