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
} as const;

/**
 * AssetBundle subdirectory paths within LocalData/{variable}/0000/
 */
export const MAD_BUNDLE_PATHS = {
  CARD_NAME: '74',
  CARD_DESC: '21',
  CARD_INDX: '50',
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
} as const;

/**
 * Encryption key used for Master Duel CARD files
 */
export const MAD_CRYPTO_KEY = 0xe3;
