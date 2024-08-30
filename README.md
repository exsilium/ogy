# ogy
Oh God Yes! Another ROM hacking tool for Yu-Gi-Oh card descriptions, targeting [Yu-Gi-Oh! 5D's Tag Force 6](https://en.wikipedia.org/wiki/Yu-Gi-Oh!_5D%27s) for the [Sony Playstation Portable](https://en.wikipedia.org/wiki/PlayStation_Portable) handheld game console.

## Background
Yu-Gi-Oh! Trading Card Game (TCG) is a collectible card game developed and published by Konami in 1999. It is among the most popular trading card games in the world like Pokémon and Magic: The Gathering. Due to the smaller collector base, the prices of physical cards have remained at an approachable level. There are also [numerous video games](https://en.wikipedia.org/wiki/List_of_Yu-Gi-Oh!_video_games) that have been released over the years for single player and multiplayer experiences.

5D's Tag Force 6 (TF6) is a video game released for PSP in 2011, officially only published in Japan and only supporting Japanese language. Several community/fan made translation projects have been created in an effort to fully translate the game to English via a process called [ROM hacking](https://en.wikipedia.org/wiki/ROM_hacking).

ROM hacking is tedious process as it requires technical knowledge to build understanding of an otherwise undocumented and closed system - how the game works, where and how assets are stored and how the game engine interacts with them. All this knowledge needs to be built up prior to implementing any kind of changes and modifications to the game.

The goal of this project is to provide a unified tool that simplifies the entire .ISO to .ISO modification workflow. Ogy integrates the extraction, conversion, and rebundling processes into a single solution, eliminating the need for separate utilities or projects. Additionally, the project offers insights into how TF6 stores and manages Yu-Gi-Oh! card descriptions. While this information is primarily based on the work and findings of others, every effort has been made to properly reference the sources from which the information is gathered.

This project is built with TypeScript, chosen for its static typing and cross-platform compatibility.

### Disclaimer

- I am not affiliated with any ROM hacking community, nor do I have any connections with active groups that create hacks. My knowledge of the subject is limited. While there is a lot of information available, much of it is internal to hacking groups, scattered across forum threads, or otherwise difficult to access. The information provided here should not be considered authoritative. Mistakes are possible, and if you find any, please notify me so I can correct them.

- This project is motivated purely by a personal desire to customize some of the card descriptions in the game.

- There are no commercial incentives behind this project. The information and data provided are solely for educational purposes.

### License

Yu-Gi-Oh! and their respective logos are trademarks of Konami Holdings Corporation in the Japan, USA, EU and other countries. All characters and their distinctive likenesses are property of Konami Holdings Corporation.

Assets and data in this repository are freely made available to general public under the fair use of Konami copyrighted material for [fan content in non-commercial setting](https://eu-support.konami.com/hc/en-gb/articles/9648771731479-Copyrights-Career-Opportunities-Goodies).

Assets which do not contain or include IP from Konami are licensed under the permissive BSD-2-Clause License.

### How to use
#### Basic flow
You require a modern `node` >= `v18` to build and run the tool.

1. Run `npm i`, `npm run build` to build the project;
2. Run `node dist/index.js chain tf6-extract ./TF6.iso export` where `./TF6.iso` is the path to the game ISO and `export` refers to the target directory where you would like the game assets to be stored;

The `tf6-extract` chain will run multiple actions:
  - Extract `cardinfo_jpn.ehp` from the UMD ISO;
  - Extract the `.ehp` contents;
  - Decode the CARD files;
  - Create a Portable Object Template `.pot` file;

Now you can use the `.pot` file as the starting point to create your new `.po` file that will include your modified texts.

1. Save your localized or otherwise modified `.po` file as `CARD_Desc_J.po` and store it to the same directory where assets were exported. This will be the primary input to compile the new CARD files;
2. Run `node dist/index.js chain tf6-implant ./TF6.iso export` where `./TF6.iso` is the path to the original game ISO and `export` still refers to the target directory that includes all the previously exported game assets and the `CARD_Desc_J.po` file that you created;

The `tf6-implant` chain will run multiple actions:
  - Transform the `.po` file to `.txt` format that also YGTool uses;
  - Builds a new dictionary;
  - Uses the new dictionary to Encode the new `.bin` files;
  - Updates the originally extracted `cardinfo_jpn.ehp` file;
  - Writes a new `.iso` file based on the original;

:warning: There seems to exist a hard limit for the size of `cardinfo_jpn.ehp` that the game is able to load. If the file hits `877000` bytes the game will crash on start. Ogy does not check for the size of updated `.ehp` file.

#### Gettext Portable Object format

Gettext PO/POT format is often used in software development for localization. It's quite wide-spread format because it is both human-readable and machine-parsable. Using `.pot` export will allow for bigger translations to be managed more easily with the help of dedicated editors like [Poedit](https://poedit.net/download) and will help integrate language translator services into the workflow.

- Export to `.pot` Portable Object Template format - `node dist/index.js -e <directory> -f pot`

After using a PO editor:

1. save the desired localized text asset file as `CARD_Desc_J.po` in the same directory as the card info `.bin` files
2. Transform the `.po` file to `.txt`: `node dist/index.js -t <directory>`
3. (Optional) Build a new Dictionary: `node dist/index.js -b <directory>`. This step can be skipped if only minor changes are being imported. :warning: Take care that the `CARD_Desc_J.bin` file will not grow too large in size after import. If it does, a new Dictionary must be generated prior to import. A large `CARD_Desc_J.bin` can cause the game to crash on start
4. Run `node dist/index.js -i <directory>` to import translations to `CARD_J.bin` and `CARD_Desc_J.bin`
5. Re-pack `cardinfo_jpn.ehp` file and copy it to the game `.iso`

```
% node dist/index.js
   ___   ______   _____   ______  ___  
  / _ \ / ___\ \ / / \ \ / / ___|/ _ \ 
 | | | | |  _ \ V /| |\ V / |  _| | | |
 | |_| | |_| | | | | | | || |_| | |_| |
  \___/ \____| |_| | | |_| \____|\___/ 
                   |_|                 
OGY - Yu-Gi-Oh! Translation tool

Usage: index [options] [command]

A helper tool to export and import CARD texts for Yu-Gi-Oh! 5D's Tag Force 6

Options:
  -V, --version                         output the version number
  -e, --export <directory>              process and export CARD_ files in the directory for export
  -i, --import <directory>              process and import texts to .bin files
  -f, --format <format>                 specify the export format: pot|ygt, default: ygt
  -g, --game <game>                     specify the game: tf6|mad, default: tf6
  -t, --transform <directory>           transform CARD_Desc_J.po to CARD_Desc_J.txt
  -b, --build <directory>               build a new Dictionary (slow)
  -h, --help                            display help for command

Commands:
  card                                  default command, actions based on option parameters
  extract <source_ehp> <directory>      extract .ehp file to destination directory
  unbundle <source_bundle> <directory>  extract UnityFS AssetBundle file to destination directory (EXPERIMENTAL and SPECIFIC to MD)
  update <target_ehp> <directory>       update existing .ehp file from the same files in directory
  po2json <source_po> <target_json>     helper function to convert .PO to .JSON structure
  chain                                 Run chained actions to fulfill multiple tasks in one go
  help [command]                        display help for command
```

## Structure
### 5D's Tag Force 6 `.iso`
- cardinfo_jpn.ehp - Located in `PSP_GAME/USRDIR/duelsys/`
  - CARD_Desc_J.bin
  - CARD_Huff_J.bin
  - CARD_Indx_J.bin
  - CARD_Name_J.bin
  - DICT_J.bin

## References

- [TF6 Translation](https://github.com/nzxth2/tf6-translation) project by [nzxth2](https://github.com/nzxth2)
  - Code Talker announcement and [overview of CARD/DICT files](https://gbatemp.net/threads/yu-gi-oh-5ds-tag-force-6-translation-project.351972/page-41#post-9627016)
- [tagforcestring](https://github.com/xan1242/tagforcestring) project by [xan1242](https://github.com/xan1242)
- [YGTool](https://github.com/matheuscardoso96/YGTool) project by [matheuscardoso96](https://github.com/matheuscardoso96)
