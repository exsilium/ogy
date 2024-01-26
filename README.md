# ogy
Oh God Yes! Another ROM hacking tool for Yu-Gi-Oh card descriptions, targeting [Yu-Gi-Oh! 5D's Tag Force 6](https://en.wikipedia.org/wiki/Yu-Gi-Oh!_5D%27s) for the [Sony Playstation Portable](https://en.wikipedia.org/wiki/PlayStation_Portable) handheld game console.

## Background
Yu-Gi-Oh! Trading Card Game (TCG) is a collectible card game developed and published by Konami in 1999. It is among the most popular trading card games in the world like Pokémon and Magic: The Gathering. Due to the smaller collector base, the prices of physical cards have remained at an approachable level. There are also [numerous video games](https://en.wikipedia.org/wiki/List_of_Yu-Gi-Oh!_video_games) that have been released over the years for single player and multiplayer experiences.

5D's Tag Force 6 (TF6) is a video game released for PSP in 2011, officially only published in Japan and only supporting Japanese language. Several community/fan made translation projects have been created in an effort to fully translate the game to English via a process called [ROM hacking](https://en.wikipedia.org/wiki/ROM_hacking).

ROM hacking is tedious process as it requires technical knowledge to build understanding of an otherwise undocumented and closed system - how the game works, where and how assets are stored and how the game engine interacts with them. All this knowledge needs to be built up prior to implementing any kind of changes and modifications to the game.

The goal of this project is to provide a tool and some understanding on how TF6 keeps and handles the Yu-Gi-Oh! card descriptions. It is based mostly on other people's work  and findings but efforts are done to keep the sources referenced from where the information is gathered.

Tooling in this project is built using TypeScript for static typing and cross-platform support.

### Disclaimer

- I am not personally part of any ROM hacking scene nor do I have any linkings to an active group who create hacks - in fact, I know very little about the subject. A lot of information is out there, but it is hacking group internal, scattered around forum threads or otherwise hard to find. In no way should the information here be considered authoritative. I am sure there are mistakes, if you find any, please let me know so I can fix them.

- The goal of this project is driven from personal desire to customize some of the card descriptions in the game.

- There are no commercial incentives involved. The information and data provided here are for educational purpsoes.

### License

Yu-Gi-Oh! and their respective logos are trademarks of Konami Holdings Corporation in the Japan, USA, EU and other countries. All characters and their distinctive likenesses are property of Konami Holdings Corporation.

Assets and data in this repository are freely made available to general public under the fair use of Konami copyrighted material for [fan content in non-commercial setting](https://eu-support.konami.com/hc/en-gb/articles/9648771731479-Copyrights-Career-Opportunities-Goodies).

Assets which do not contain or include IP from Konami are licensed under the permissive BSD-2-Clause License.

### How to use
#### Basic flow
You require a modern `node` >= `v18` to build and run the tool.

1. Unpack the `cardinfo_jpn.ehp` game file and store the `.bin` files in a separate folder
2. Run `npm i`, `npm run build` to build the project
3. `node dist/index.js -e <directory>` for exporting translations to `CARD_J.txt` and `CARD_Desc_J.txt`

By default, the exported `.txt` format is a light mark-up language as implemented in [YGTool](https://github.com/matheuscardoso96/YGTool). As such, it is possible to cross-use the tools. For small modifications, a UTF-8 supported file editor can be used to edit the texts and import the changes back to `.bin` format.

- Run `node dist/index.js -i <directory>` to import translations to `CARD_J.bin` and `CARD_Desc_J.bin`
- Re-pack `cardinfo_jpn.ehp` file and copy it to the game `.iso` file

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

Usage: index [options]

A helper tool to export and import CARD texts for Yu-Gi-Oh! 5D's Tag Force 6

Options:
  -V, --version                output the version number
  -e, --export <directory>     Process and export CARD_ files in the directory for export
  -i, --import <directory>     Process and import texts to .bin files
  -f, --format <format>        Specify the export format: pot|ygt, default: ygt
  -t, --transform <directory>  Transform CARD_Desc_J.po to CARD_Desc_J.txt
  -b, --build <directory>      Build a new Dictionary (slow)
  -h, --help                   display help for command
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
