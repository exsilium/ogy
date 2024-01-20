# ogy
Oh God Yes! Another ROM hacking tool for Yu-Gi-Oh card descriptions, targeting [Yu-Gi-Oh! 5D's Tag Force 6](https://en.wikipedia.org/wiki/Yu-Gi-Oh!_5D%27s) for the [Sony Playstation Portable](https://en.wikipedia.org/wiki/PlayStation_Portable) handheld game console.

WIP - A work in progress project

## Background
Yu-Gi-Oh! Trading Card Game (TCG) is a collectible card game developed and published by Konami in 1999. It is among the most popular trading card games in the world like Pokémon and Magic: The Gathering. Due to the smaller collector base, the prices of physical cards have remained at an approachable level. There are also [numerous video games](https://en.wikipedia.org/wiki/List_of_Yu-Gi-Oh!_video_games) that have been released over the years for single player and multiplayer experiences.

5D Tag Force 6 (TF6) is a video game released for PSP in 2011, officially only published in Japan and only supporting Japanese language. Several community/fan made translation projects have been created in an effort to fully translate the game to English via a process called [ROM hacking](https://en.wikipedia.org/wiki/ROM_hacking).

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

## Structure

- cardinfo_jpn.ehp - Located in `PSP_GAME/USRDIR/duelsys/` - 
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
