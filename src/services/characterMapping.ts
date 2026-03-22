// Character Mapping Service
// Centralizes logic for mapping character names (Chinese/Display) to Internal IDs/UUIDs
// Used by: GameLoop, CombatLogic, CharacterStore, AssetLoading, MemoryService

// 1. Static Name Map (Moved from spellcards.ts to here to avoid circular deps if needed,
//    but for now we can import or re-declare. Re-declaring for centrality is safer for future extensibility)
//    However, since spellcards.ts is a data file, we should probably extract the map FROM there
//    or move the map TO here and have spellcards.ts import it.
//    Given the request is to "move relevant code", we should move the map definition here.
//    BUT spellcards.ts is huge. Let's see if we can import it.
//    Actually, the map is at the end of spellcards.ts. Let's assume we will move it here.

export const CHARACTER_NAME_TO_ID_MAP: Record<string, string> = {
  博丽灵梦: 'reimu',
  灵梦: 'reimu',
  雾雨魔理沙: 'marisa',
  魔理沙: 'marisa',
  十六夜咲夜: 'sakuya',
  咲夜: 'sakuya',
  魂魄妖梦: 'youmu',
  妖梦: 'youmu',
  '蕾米莉亚·斯卡雷特': 'remilia',
  蕾米莉亚斯卡雷特: 'remilia',
  蕾米莉亚: 'remilia',
  蕾米: 'remilia',
  '芙兰朵露·斯卡雷特': 'flandre',
  芙兰朵露斯卡雷特: 'flandre',
  芙兰朵露: 'flandre',
  芙兰: 'flandre',
  '帕秋莉·诺蕾姬': 'patchouli',
  帕秋莉诺蕾姬: 'patchouli',
  帕秋莉: 'patchouli',
  红美铃: 'meiling',
  红美玲: 'meiling',
  琪露诺: 'cirno',
  东风谷早苗: 'sanae',
  射命丸文: 'aya',
  八云紫: 'yukari',
  八云蓝: 'ran',
  八云橙: 'chen',
  橙: 'chen',
  '铃仙·优昙华院·因幡': 'reisen',
  铃仙: 'reisen',
  因幡帝: 'tewi',
  蓬莱山辉夜: 'kaguya',
  藤原妹红: 'mokou',
  八意永琳: 'eirin',
  古明地觉: 'satori',
  古明地恋: 'koishi',
  灵乌路空: 'utsuho',
  阿空: 'utsuho',
  火焰猫燐: 'orin',
  阿燐: 'orin',
  伊吹萃香: 'suika',
  永江衣玖: 'iku',
  比那名居天子: 'tenshi',
  风见幽香: 'yuuka',
  小野冢小町: 'komachi',
  '四季映姬·夜摩仙那度': 'eiki',
  四季映姬: 'eiki',
  河城荷取: 'nitori',
  键山雏: 'hina',
  圣白莲: 'byakuren',
  丰聪耳神子: 'miko',
  神子: 'miko',
  纯狐: 'junko',
  '赫卡提亚·拉碧斯拉祖利': 'hecatia',
  赫卡提亚: 'hecatia',
  摩多罗隐岐奈: 'okina',
  埴安神袿姬: 'keiki',
  饕餮尤魔: 'yuuma',
  鬼人正邪: 'seija',
  少名针妙丸: 'shinmyoumaru',
  秦心: 'kokoro',
  茨木华扇: 'kasen',
  宇佐见堇子: 'sumireko',
  铃瑚: 'ringo',
  清兰: 'seiran',
  克劳恩皮丝: 'clownpiece',
  '哆来咪·苏伊特': 'doremy',
  依神女苑: 'joon',
  依神紫苑: 'shion',
  饭纲丸龙: 'megumu',
  骊驹早鬼: 'saki',
  早鬼: 'saki',
  丁礼田舞: 'mai',
  尔子田里乃: 'satono',
  '桑妮·米尔克': 'sunny',
  桑妮: 'sunny',
  '露娜·切露德': 'luna',
  露娜: 'luna',
  '斯塔·萨菲雅': 'star',
  斯塔: 'star',
  上白泽慧音: 'keine',
  云居一轮: 'ichirin',
  今泉影狼: 'kagerou',
  八坂神奈子: 'kanako',
  吉吊八千慧: 'yachie',
  娜兹玲: 'nazrin',
  纳兹琳: 'nazrin',
  娜兹琳: 'nazrin',
  宫古芳香: 'yoshika',
  寅丸星: 'shou',
  封兽鵺: 'nue',
  小恶魔: 'koakuma',
  大妖精: 'daiyousei',
  天弓千亦: 'chimata',
  奥野田美宵: 'miyoi',
  姬海棠果: 'hatate',
  姬虫百百世: 'momoyo',
  幽谷响子: 'kyouko',
  庭渡久侘歌: 'kutaka',
  星熊勇仪: 'yuugi',
  月夜见: 'tsukuyomi',
  本居小铃: 'kosuzu',
  本居小玲: 'kosuzu',
  朱鹭子: 'tokiko',
  村纱水蜜: 'murasa',
  杖刀偶磨弓: 'mayumi',
  '梅蒂欣·梅兰可莉': 'medicine',
  梅蒂欣: 'medicine',
  森近霖之助: 'rinnosuke',
  水桥帕露西: 'parsee',
  洩矢诹访子: 'suwako',
  泄矢诹访子: 'suwako',
  诹访子: 'suwako',
  物部布都: 'futo',
  犬走椛: 'momiji',
  玉造魅须丸: 'misumaru',
  秋穰子: 'minoriko',
  秋静叶: 'shizuha',
  稀神探女: 'sagume',
  稗田阿求: 'akyuu',
  '米斯蒂娅·萝蕾莱': 'mystia',
  米斯蒂娅: 'mystia',
  绵月丰姬: 'toyohime',
  绵月依姬: 'yorihime',
  苏我屠自古: 'tojiko',
  若鹭姬: 'wakasagihime',
  '莉格露·奈特巴格': 'wriggle',
  莉格露: 'wriggle',
  '莉莉·霍瓦特': 'lily',
  菅牧典: 'tsukasa',
  '蕾蒂·霍瓦特洛克': 'letty',
  蕾蒂: 'letty',
  豪德寺三花: 'mike',
  赤蛮奇: 'sekibanki',
  霍青娥: 'seiga',
  青娥: 'seiga',
  露米娅: 'rumia',
  驹草山如: 'sannyo',
  龙神: 'dragon',
  冴月麟: 'rin',
  堀川雷鼓: 'raiko',
  崛川雷鼓: 'raiko',
  多多良小伞: 'kogasa',
  天魔: 'tenma',
  山城高岭: 'takane',
  俊达萌: 'zundamon',
  月永爱: 'ai',
  菲娅: 'fia',
  雏森: 'hinamori',
  上海: 'shanghai',
  蓬莱: 'penglai'
};

/**
 * Standardizes a character name or ID to a canonical ID (UUID or English ID).
 *
 * Logic Flow:
 * 1. Check Static Map (Chinese Name -> English ID)
 * 2. Check Static DB (Lorebook) via Name or UUID
 * 3. Check Runtime State (Active NPCs) via Name or ID
 * 4. Fallback to raw input if nothing found
 *
 * @param input - The name or ID to resolve (e.g. "博丽灵梦", "reimu", "reimu-uuid-...")
 * @param context - Optional context providers (Stores) to avoid circular dependencies if possible,
 *                  or we can accept data arrays.
 */
export function resolveCharacterId(
  input: string,
  staticCharacters: any[] = [],
  runtimeNpcs: Record<string, any> = {}
): string {
  if (!input) return '';

  const inputLower = input.toLowerCase().trim();

  // 1. Try Static Map (Direct Name Mapping)
  // Useful for converting "博丽灵梦" -> "reimu" immediately for asset lookups or ID prefixes
  if (CHARACTER_NAME_TO_ID_MAP[input] || CHARACTER_NAME_TO_ID_MAP[input.trim()]) {
    // Note: This maps to "reimu", but the actual UUID might be "reimu-uuid-..."
    // If the static DB uses "reimu-uuid-...", we might still need step 2.
    // But if the System uses simple IDs, this is enough.
    // However, for consistency, if we find a map, we should check if that map result IS a UUID or ID in DB
    // Let's proceed to Step 2 using the mapped ID as a candidate too.
  }

  // 2. Try Static DB (Lorebook)
  // Matches: UUID === input OR Name === input
  const staticChar = staticCharacters.find(
    (c) =>
      (c.uuid && c.uuid.toLowerCase() === inputLower) ||
      (c.name && c.name.toLowerCase().trim() === inputLower) ||
      // Also check if the mapped ID matches the UUID (e.g. input="博丽灵梦" -> map="reimu" -> uuid="reimu")
      (CHARACTER_NAME_TO_ID_MAP[input.trim()] && c.uuid === CHARACTER_NAME_TO_ID_MAP[input.trim()])
  );

  if (staticChar && staticChar.uuid) {
    return staticChar.uuid;
  }

  // 3. Try Runtime State
  // Matches: ID === input OR Name === input
  const foundNpcEntry = Object.entries(runtimeNpcs).find(
    ([id, npc]) =>
      id.toLowerCase() === inputLower ||
      npc.name === input ||
      npc.name.toLowerCase().trim() === inputLower
  );

  if (foundNpcEntry) {
    return foundNpcEntry[0]; // Return Runtime ID
  }

  // 4. Fallback: Check if input matches a mapped ID directly?
  // If input is "博丽灵梦", map is "reimu". If "reimu" isn't in DB/Runtime, do we return "reimu"?
  // Often system prefers the English ID over Chinese for file paths/logic.
  const mappedId = CHARACTER_NAME_TO_ID_MAP[input.trim()];
  if (mappedId) {
    return mappedId;
  }

  return input; // Return original if all fails
}

/**
 * Helper to find an Avatar Image URL for a given character name.
 * Encapsulates the fuzzy matching logic from CharacterList.vue.
 *
 * @param name - Character name (e.g. "博丽灵梦")
 * @param avatarMap - The map of all available avatar images (import.meta.glob results)
 */
export function findAvatarImage(name: string, avatarMap: Record<string, any>): string | undefined {
  if (!name) return undefined;

  // Normalize keys
  const normalizedKeys = Object.keys(avatarMap);

  // 1. Try exact match with constructed path (Standard Convention: {Name}_头像.png)
  const directKey = `/src/assets/images/head/${name}_头像.png`;
  if (avatarMap[directKey]) return avatarMap[directKey] as string;

  // 2. Try ID-based Reverse Lookup (Canonical Match)
  // This solves variants like "红美铃" vs "红美玲", "堀川雷鼓" vs "崛川雷鼓"
  const charId = resolveCharacterId(name); // Use existing resolver to get ID (e.g. 'meiling')
  if (charId && charId !== name) {
    // If resolved to an ID
    // Find all aliases for this ID
    const aliases = Object.entries(CHARACTER_NAME_TO_ID_MAP)
      .filter(([_, id]) => id === charId)
      .map(([alias, _]) => alias);

    for (const alias of aliases) {
      const aliasKey = `/src/assets/images/head/${alias}_头像.png`;
      if (avatarMap[aliasKey]) {
        return avatarMap[aliasKey] as string;
      }
    }
  }

  // 3. Fuzzy match (Fallback)
  for (const path of normalizedKeys) {
    const fileName = path.split('/').pop()?.split('\\').pop(); // Get filename
    if (!fileName) continue;

    // Match pattern: {Name}_头像.png
    const match = fileName.match(/^(.+)_头像\.png$/);
    if (match && match[1]) {
      const coreName = match[1]; // e.g. "灵梦"

      // Check bidirectional inclusion
      if (name.includes(coreName) || coreName.includes(name)) {
        return avatarMap[path] as string;
      }
    }
  }

  return undefined;
}

/**
 * Helper to find a Battle Sprite URL for a given character name.
 *
 * @param name - Character name (e.g. "蕾米莉亚·斯卡雷特")
 * @param spriteMap - The map of all available battle sprites (import.meta.glob results)
 */
export function findBattleSprite(name: string, spriteMap: Record<string, any>): string | undefined {
  if (!name) return undefined;

  // Normalize name for matching (remove dots)
  const normalizedName = name.replace(/[·・]/g, '');

  // 1. Try exact match
  const directKey = `/src/assets/images/battle_sprites/${name}_战斗立绘.png`;
  if (spriteMap[directKey]) return spriteMap[directKey] as string;

  // 2. Try mapping via characterMapping
  const characterId = CHARACTER_NAME_TO_ID_MAP[name] || CHARACTER_NAME_TO_ID_MAP[normalizedName];
  if (characterId) {
    // Find all names that map to this ID
    const relatedNames = Object.entries(CHARACTER_NAME_TO_ID_MAP)
      .filter(([_, id]) => id === characterId)
      .map(([n, _]) => n);

    for (const relName of relatedNames) {
      const relKey = `/src/assets/images/battle_sprites/${relName}_战斗立绘.png`;
      if (spriteMap[relKey]) return spriteMap[relKey] as string;

      // Also try with dot-removed version of related name
      const relNormalized = relName.replace(/[·・]/g, '');
      const relNormKey = `/src/assets/images/battle_sprites/${relNormalized}_战斗立绘.png`;
      if (spriteMap[relNormKey]) return spriteMap[relNormKey] as string;
    }
  }

  // 3. Fuzzy match
  const normalizedKeys = Object.keys(spriteMap);
  for (const path of normalizedKeys) {
    const fileName = path.split('/').pop()?.split('\\').pop();
    if (!fileName) continue;

    const match = fileName.match(/^(.+)_战斗立绘\.png$/);
    if (match && match[1]) {
      const coreName = match[1];
      const normalizedCore = coreName.replace(/[·・]/g, '');

      // Check bidirectional inclusion with normalization
      if (
        name.includes(coreName) ||
        coreName.includes(name) ||
        normalizedName.includes(normalizedCore) ||
        normalizedCore.includes(normalizedName)
      ) {
        return spriteMap[path] as string;
      }
    }
  }

  return undefined;
}
