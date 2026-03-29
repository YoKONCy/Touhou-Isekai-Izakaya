// 角色映射服务 (Character Mapping Service)
// 核心逻辑：集中处理角色显示名称（中文/别称）到系统内部 ID/UUID 的双向映射
// 调用方：GameLoop, CombatLogic, CharacterStore, 静态资源加载, 记忆服务 (MemoryService)

// 1. 静态名称映射表
// 存储最常见的角色中文名/昵称到内部 ID 的映射映射关系。
// 设计说明：该表作为解析的一级索引，确保如“灵梦”、“魔理沙”等核心名称能被极速识别。

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
 * 标准化：将角色名称或不规则输入解析为系统的规范 ID（UUID 或 内部 ID）。
 *
 * 逻辑流程：
 * 1. 检索静态映射表 (中文名称 -> 内部 ID)
 * 2. 检索静态数据库 (Lorebook/设定集) —— 支持 UUID 或 名称模糊匹配
 * 3. 检索运行时状态 (活跃 NPC 列表) —— 支持 运行时 ID 或 显示名称匹配
 * 4. 若上述均未命中，则回退至原始原始字符串。
 *
 * @param input - 待解析的名称或 ID（例如 "博丽灵梦", "reimu", "reimu-uuid-..."）
 * @param staticCharacters - 静态角色数据集
 * @param runtimeNpcs - 运行时 NPC 对象记录 (Record)
 */
export function resolveCharacterId(
  input: string,
  staticCharacters: any[] = [],
  runtimeNpcs: Record<string, any> = {}
): string {
  if (!input) return '';

  const inputLower = input.toLowerCase().trim();

  // 1. 尝试静态映射检索（直接名称匹配）
  // 核心用途：立即将中文名转换为内部 ID（如 "reimu"），以便执行物理路径拼装或底层逻辑判定
  if (CHARACTER_NAME_TO_ID_MAP[input] || CHARACTER_NAME_TO_ID_MAP[input.trim()]) {
    // Note: This maps to "reimu", but the actual UUID might be "reimu-uuid-..."
    // If the static DB uses "reimu-uuid-...", we might still need step 2.
    // But if the System uses simple IDs, this is enough.
    // However, for consistency, if we find a map, we should check if that map result IS a UUID or ID in DB
    // Let's proceed to Step 2 using the mapped ID as a candidate too.
  }

  // 2. 尝试静态数据库检索（设定集）
  // 匹配策略：UUID 完全相等 OR 名称完全相等（忽略大小写与空格）
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

  // 3. 尝试运行时状态检索
  // 匹配策略：当前运行时的动态 ID === input OR 当前显示名称 === input
  const foundNpcEntry = Object.entries(runtimeNpcs).find(
    ([id, npc]) =>
      id.toLowerCase() === inputLower ||
      npc.name === input ||
      npc.name.toLowerCase().trim() === inputLower
  );

  if (foundNpcEntry) {
    return foundNpcEntry[0]; // Return Runtime ID
  }

  // 4. 最终回退：检查输入是否本身就是一个有效的已映射 ID？
  // 逻辑说明：如果输入是“博丽灵梦”，映射结果是“reimu”。如果“reimu”不在数据库中，系统通常倾向于返回英文 ID。
  const mappedId = CHARACTER_NAME_TO_ID_MAP[input.trim()];
  if (mappedId) {
    return mappedId;
  }

  return input; // Return original if all fails
}

/**
 * 辅助方法：为指定角色名称查找对应的头像 URL。
 * 封装了模糊匹配逻辑，确保多处 UI 展示在名称拼写不同（如同人名变体）时依然能显示头像。
 *
 * @param name - 角色名称（例如 "博丽灵梦"）
 * @param avatarMap - 所有已加载的头像资源映射（import.meta.glob 的结果）
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
 * 辅助方法：为指定角色名称查找对应的战斗立绘 URL。
 *
 * @param name - 角色名称（例如 "蕾米莉亚·斯卡雷特"）
 * @param spriteMap - 所有已加载的战斗立绘资源（import.meta.glob 的结果）
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
