/**
 * Constants for Master Duel (MAD) AssetBundle file names and paths.
 * These filenames can change when the game is updated, so they are centralized here
 * for easier maintenance and to ensure consistency between mad2pot and mad-implant chains.
 */

/**
 * AssetBundle file identifiers used in Master Duel LocalData directory structure.
 * These are the actual filenames without path or extension.
 */
export const MAD_BUNDLE_FILES = {
  /** CARD_Name AssetBundle - Contains card names */
  CARD_NAME: '7438cca8',
  
  /** CARD_Desc AssetBundle - Contains card descriptions */
  CARD_DESC: '21ae1efa',
  
  /** CARD_Indx AssetBundle - Contains card index data */
  CARD_INDX: '507764bc',

  /** Card_Part AssetBundle - Contains effect segment metadata */
  CARD_PART: '52739c94',

  /** Card_Pidx AssetBundle - Contains pointer index data */
  CARD_PIDX: '494e34d0',
} as const;

/**
 * AssetBundle subdirectory paths within LocalData/{variable}/0000/
 */
export const MAD_BUNDLE_PATHS = {
  CARD_NAME: '74',
  CARD_DESC: '21',
  CARD_INDX: '50',
  CARD_PART: '52',
  CARD_PIDX: '49',
} as const;

/**
 * CAB file identifiers extracted from the AssetBundles.
 * These are the internal file names used within the Unity AssetBundles.
 */
export const MAD_CAB_FILES = {
  /** CAB file containing CARD_Name data */
  CARD_NAME: 'CAB-a6d8f4f42198f77b297bd6bdb7a258e3',
  
  /** CAB file containing CARD_Desc data */
  CARD_DESC: 'CAB-8498f8ef7e7d40147d79843691c73a38',
  
  /** CAB file containing CARD_Indx data */
  CARD_INDX: 'CAB-103bc9061e47e31db180ec1ca6d5e74f',

  /** CAB file containing Card_Part data */
  CARD_PART: 'CAB-54275887d3203d3b4655ba82e613ecd8',

  /** CAB file containing Card_Pidx data */
  CARD_PIDX: 'CAB-e2d422b099a8044fe09bcca800b0378a',
} as const;

/**
 * Unity object names for the encrypted text assets inside each MAD AssetBundle.
 * These are used when we rebuild bundles via UnityPy.
 */
export const MAD_ASSET_OBJECT_NAMES = {
  CARD_NAME: 'CARD_Name',
  CARD_DESC: 'CARD_Desc',
  CARD_INDX: 'CARD_Indx',
  CARD_PART: 'Card_Part',
  CARD_PIDX: 'Card_Pidx',
} as const;

/**
 * Unity container paths for each MAD TextAsset inside its AssetBundle.
 */
export const MAD_CONTAINER_PATHS = {
  CARD_NAME: 'assets/resourcesassetbundle/card/data/1d985b8c743240fd/en-us/card_name.bytes',
  CARD_DESC: 'assets/resourcesassetbundle/card/data/1d985b8c743240fd/en-us/card_desc.bytes',
  CARD_INDX: 'assets/resourcesassetbundle/card/data/1d985b8c743240fd/en-us/card_indx.bytes',
  CARD_PART: 'assets/resourcesassetbundle/card/data/1d985b8c743240fd/en-us/card_part.bytes',
  CARD_PIDX: 'assets/resourcesassetbundle/card/data/1d985b8c743240fd/en-us/card_pidx.bytes',
} as const;

/**
 * Encryption key used for Master Duel CARD files
 */
export const MAD_CRYPTO_KEY = 0xe3;
