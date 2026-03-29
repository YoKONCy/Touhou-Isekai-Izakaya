import { defineStore } from 'pinia';
import { ref } from 'vue';
import { type CharacterCard } from '@/types/db';
import { dbService } from '@/services/DatabaseService';

// RFC4122 兼容的简化版 UUID 生成算法
export function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0,
      v = c == 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export const useCharacterStore = defineStore('character', () => {
  const characters = ref<CharacterCard[]>([]);

  async function loadCharacters() {
    characters.value = await dbService.getAllCharacters();

    // 强制执行默认值初始化，确保新增的 JSON 静态资源能被即时捕获
    // initializeDefaults 内部已集成幂等性检查，防范记录重复注入
    await initializeDefaults();
  }

  async function initializeDefaults() {
    // 1. 从多个目录执行资源加载，并支持子文件夹递归扫描
    // 利用 glob 递归模式来支持文件夹层级与分类自动映射
    const charModules = import.meta.glob('@/assets/lorebook/characters/**/*.json', { eager: true });
    const locModules = import.meta.glob('@/assets/lorebook/locations/**/*.json', { eager: true });
    const infoModules = import.meta.glob('@/assets/lorebook/info/**/*.json', { eager: true });
    const spellModules = import.meta.glob('@/assets/lorebook/spellcards/**/*.json', {
      eager: true
    });

    const allModules: Record<string, any> = {
      ...charModules,
      ...locModules,
      ...infoModules,
      ...spellModules
    };

    let added = false;
    for (const path in allModules) {
      const charData = (allModules[path] as any).default || allModules[path];

      // Infer Type and Category from Path (if not specified in JSON or is generic 'other'/'character')
      let inferredType = charData.type;
      let inferredCategory = charData.category;

      const pathSegments = path.split('/');
      // 物理路径基准：/src/assets/lorebook/{Type}/{Category}/{File}.json (或无 Category)

      const lorebookIndex = pathSegments.indexOf('lorebook');
      if (lorebookIndex !== -1 && pathSegments.length > lorebookIndex + 1) {
        const typeSegment = pathSegments[lorebookIndex + 1];

        // 1. 类型推导 (Type Inference)
        if (!inferredType || inferredType === 'character' || inferredType === 'other') {
          if (typeSegment === 'locations') inferredType = 'location';
          else if (typeSegment === 'info') inferredType = 'info';
          else if (typeSegment === 'spellcards') inferredType = 'spell_card';
          else if (typeSegment === 'characters') inferredType = 'character';
          else if (!inferredType) inferredType = 'character';
        }

        // 2. 分类推导 (Category Inference)：若存在中间目录，则将其映射为分类名
        // e.g., .../characters/Hakurei_Jinja/Reimu.json -> category = Hakurei_Jinja
        if (pathSegments.length > lorebookIndex + 3) {
          const subFolderCategory = pathSegments[lorebookIndex + 2];
          if (!inferredCategory || inferredCategory === '未分类' || inferredCategory === '地点') {
            inferredCategory = subFolderCategory;
          }
        }
      }

      if (!inferredType) inferredType = 'character';
      if (!inferredCategory) inferredCategory = inferredType === 'location' ? '地点' : '未分类';

      // 健壮性校验：确保描述字段强制转换为字符串格式
      let desc = charData.description;
      if (typeof desc === 'object') {
        desc = JSON.stringify(desc, null, 2);
      }

      // 尝试匹配既有数据记录 (Deduplication Check)
      // 优先级 1: 基于 UUID 唯一标识进行精确匹配
      let existing = charData.uuid
        ? characters.value.find((c) => c.uuid === charData.uuid)
        : undefined;

      // 优先级 2: 若 UUID 缺省或不匹配，则基于显示名称执行二级模糊/精确匹配
      if (!existing && charData.name) {
        existing = characters.value.find((c) => c.name === charData.name);
      }

      if (existing && existing.id) {
        // 上海/蓬莱 实体拆分专项迁移逻辑：针对旧版合并条目执行自动重构
        if (existing.uuid === 'Shanghai' && existing.name.includes('蓬莱')) {
          const updateData = {
            name: charData.name,
            description: desc,
            // Update other fields if necessary, but name/desc are the main ones
            tags: charData.tags || [],
            category: charData.category || '未分类',
            type: inferredType
          };
          await dbService.updateCharacter(existing.id, updateData);
        }

        // --- 类型与分类自动同步迁移 (Auto-Sync) ---
        // 若磁盘物理分类与数据库记录不一致，则以磁盘为准执行自动更新 (Disk-First Sync)

        // 同时将 JSON 中持有的生理/战斗属性补齐至数据库缺项中
        const missingFields: any = {};
        const fieldsToSync = [
          'gender',
          'initialPower',
          'initialMaxHp',
          'initialResidence',
          'cost',
          'damage',
          'damageType'
        ];

        for (const field of fieldsToSync) {
          if (
            (existing[field as keyof CharacterCard] === undefined ||
              existing[field as keyof CharacterCard] === '' ||
              existing[field as keyof CharacterCard] === 0) &&
            charData[field] !== undefined
          ) {
            missingFields[field] = charData[field];
          }
        }

        const needsUpdate =
          existing.type !== inferredType ||
          (existing.category !== inferredCategory &&
            inferredCategory !== '未分类' &&
            inferredCategory !== '地点') ||
          Object.keys(missingFields).length > 0;

        if (needsUpdate) {
          await dbService.updateCharacter(existing.id, {
            type: inferredType,
            category: inferredCategory,
            ...missingFields
          });
        }

        // 角色已在库中命中，跳过核心数据覆盖以保护玩家的自定义编辑成果
        continue;
      } else {
        // CREATE new character
        if (charData.name && charData.description) {
          const newCard: CharacterCard = {
            ...charData,
            description: desc,
            uuid: charData.uuid || generateUUID(),
            tags: charData.tags || [],
            category: inferredCategory,
            type: inferredType
          };

          // Remove ID if present in JSON to let DB auto-increment
          delete newCard.id;

          await dbService.addCharacter(newCard);
          added = true;
        }
      }
    }

    if (added) {
      characters.value = await dbService.getAllCharacters();
    }
  }

  async function addCharacter(card: Omit<CharacterCard, 'id' | 'uuid'> & { uuid?: string }) {
    // Deep clone to remove Vue Proxies before saving to DB
    const rawCard = JSON.parse(JSON.stringify(card));

    const newCard: CharacterCard = {
      ...rawCard,
      uuid: rawCard.uuid || generateUUID(),
      tags: rawCard.tags || [],
      category: rawCard.category || '未分类'
    };

    await dbService.addCharacter(newCard);
    await loadCharacters();
    return newCard;
  }

  async function updateCharacter(uuid: string, updates: Partial<CharacterCard>) {
    const char = characters.value.find((c) => c.uuid === uuid);
    if (!char || !char.id) return;

    // Deep clone updates too
    const rawUpdates = JSON.parse(JSON.stringify(updates));

    await dbService.updateCharacter(char.id, rawUpdates);
    await loadCharacters();
  }

  async function deleteCharacter(uuid: string) {
    const char = characters.value.find((c) => c.uuid === uuid);
    if (!char || !char.id) return;

    await dbService.deleteCharacter(char.id);
    await loadCharacters();
  }

  async function factoryReset() {
    await dbService.clearCharacters();
    characters.value = [];
    await initializeDefaults();
    await loadCharacters();
  }

  // Find character by name (fuzzy match or exact)
  function findCharacterByName(name: string) {
    // This is a simple fuzzy search for UI purposes or manual lookup
    // For canonical ID resolution, use resolveCharacterId in characterMapping.ts
    return characters.value.find((c) => c.name.includes(name) || name.includes(c.name));
  }

  // Get all unique categories
  function getCategories() {
    const categories = new Set(characters.value.map((c) => c.category || '未分类'));
    return Array.from(categories).sort();
  }

  async function renameCategory(oldName: string, newName: string) {
    if (!oldName || !newName || oldName === newName) return;

    const charsToUpdate = characters.value.filter((c) => (c.category || '未分类') === oldName);

    for (const char of charsToUpdate) {
      if (char.id) {
        await dbService.updateCharacter(char.id, { category: newName });
      }
    }
    await loadCharacters();
  }

  async function deleteCategory(name: string) {
    if (!name) return;

    // Move all characters in this category to '未分类'
    const charsToUpdate = characters.value.filter((c) => (c.category || '未分类') === name);

    for (const char of charsToUpdate) {
      if (char.id) {
        await dbService.updateCharacter(char.id, { category: '未分类' });
      }
    }
    await loadCharacters();
  }

  return {
    characters,
    loadCharacters,
    addCharacter,
    updateCharacter,
    deleteCharacter,
    findCharacterByName,
    getCategories,
    renameCategory,
    deleteCategory,
    initializeDefaults,
    factoryReset
  };
});
