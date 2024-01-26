import * as fs from 'fs';
import * as path from 'path';
import figlet from 'figlet';
import { Command } from '@commander-js/extra-typings';
import { YuGiOh, Transformer, DictionaryBuilder } from './compressor.js';
import { YgoTexts } from './ygotexts.js';

const program = new Command();

console.log(figlet.textSync("OGY|YGO"));
console.log("OGY - Yu-Gi-Oh! Translation tool\n");

/* This is very raw - quick and dirty */
program
  .version("0.1.0")
  .description("A helper tool to export and import CARD texts for Yu-Gi-Oh! 5D's Tag Force 6")
  .option("-e, --export <directory>", "Process and export CARD_ files in the directory for export")
  .option("-i, --import <directory>", "Process and import texts to .bin files")
  .option("-f, --format <format>", "Specify the export format: pot|ygt, default: ygt")
  .option("-t, --transform <directory>", "Transform CARD_Desc_J.po to CARD_Desc_J.txt")
  .option("-b, --build <directory>", "Build a new Dictionary (slow)")
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

  if("format" in options) {
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