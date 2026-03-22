/**
 * Location Mapping Service
 * Centralizes logic for mapping location names (Chinese/Display) to Internal IDs/UUIDs
 */

export const LOCATION_NAME_TO_ID_MAP: Record<string, string> = {
  // Hakurei Shrine area
  博丽神社: 'hakurei_shrine',
  神社: 'hakurei_shrine',
  博丽家: 'hakurei_shrine',

  // Human Village
  人间之里: 'human_village',
  人里: 'human_village',
  村庄: 'human_village',
  村子: 'human_village',

  // Forest of Magic
  魔法之森: 'forest_of_magic',
  魔理沙家: 'forest_of_magic',
  爱丽丝家: 'forest_of_magic',

  // Scarlet Devil Mansion
  红魔馆: 'sdm',
  洋馆: 'sdm',
  红魔城: 'sdm',

  // Bamboo Forest of Lost
  迷途竹林: 'bamboo_forest',
  永远亭: 'human_village', // Usually accessed through forest
  迷途之竹林: 'bamboo_forest',

  // Youkai Mountain
  妖怪之山: 'youkai_mountain',
  守矢神社: 'moriya_shrine',
  玄武之泽: 'genbu_ravine',
  九天瀑布: 'nine_heavens_waterfall',

  // Netherworld
  冥界: 'netherworld',
  白玉楼: 'hakugyokurou',

  // Underground / Chireiden
  旧地狱: 'old_hell',
  地灵殿: 'chireiden',
  灼热地狱迹: 'hell_of_blazing_fires',

  // Others
  雾之湖: 'misty_lake',
  无名之丘: 'nameless_hill',
  太阳花田: 'sunflower_field',
  三途河: 'sanzu_river',
  香霖堂: 'kourindou',
  命莲寺: 'myouren_temple',
  神灵庙: 'hall_of_dreams'
};

/**
 * Standardizes a location name or ID to a canonical ID (UUID or English ID).
 */
export function resolveLocationId(
  input: string,
  staticCharacters: any[] = [] // CharacterCard includes location types
): string {
  if (!input) return '';

  const inputLower = input.toLowerCase().trim();

  // 1. Try Static Map
  const mappedId = LOCATION_NAME_TO_ID_MAP[input] || LOCATION_NAME_TO_ID_MAP[input.trim()];

  // 2. Try Static DB (Lorebook)
  // Check if input or mappedId matches a UUID or Name in the lorebook
  const searchKey = mappedId || inputLower;
  const staticLoc = staticCharacters.find(
    (c) =>
      (c.type === 'other' || c.type === 'location') &&
      ((c.uuid && c.uuid.toLowerCase() === searchKey) ||
        (c.name && c.name.toLowerCase().trim() === inputLower) ||
        (mappedId && c.name && c.name.toLowerCase().trim() === mappedId))
  );

  if (staticLoc && staticLoc.uuid) {
    return staticLoc.uuid;
  }

  return mappedId || input;
}
