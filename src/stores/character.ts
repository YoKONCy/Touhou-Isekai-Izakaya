import { defineStore } from 'pinia';
import { ref } from 'vue';
import { db, type CharacterCard } from '@/db';
import { v4 as uuidv4 } from 'uuid'; // We need to install uuid or implement simple generator

// Simple UUID generator if we don't want to install uuid package yet
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

export const useCharacterStore = defineStore('character', () => {
  const characters = ref<CharacterCard[]>([]);

  async function loadCharacters() {
    characters.value = await db.characters.toArray();
    
    // Always try to load defaults to ensure new JSON files are picked up
    // The initializeDefaults function checks for duplicates
    await initializeDefaults();
  }

  async function initializeDefaults() {
    // Glob import all json files from assets/characters
    const modules = import.meta.glob('@/assets/characters/*.json', { eager: true });
    
    let added = false;
    for (const path in modules) {
      const charData = (modules[path] as any).default || modules[path];
      
      // Ensure description is a string
      let desc = charData.description;
      if (typeof desc === 'object') {
        desc = JSON.stringify(desc, null, 2);
      }

      // Try to match existing character
      // Priority 1: UUID match
      let existing = charData.uuid 
        ? characters.value.find(c => c.uuid === charData.uuid)
        : undefined;
      
      // Priority 2: Name match (if UUID match failed or no UUID in file)
      if (!existing && charData.name) {
        existing = characters.value.find(c => c.name === charData.name);
      }

      if (existing && existing.id) {
        // UPDATE existing character
        // We overwrite DB data with File data to ensure consistency with source files
        const updatedCard: CharacterCard = {
           ...existing, // Keep existing fields (like ID)
           ...charData, // Overwrite with File Data
           description: desc, // Ensure processed description
           tags: charData.tags || existing.tags || [],
           category: charData.category || existing.category || '未分类',
           // Critical: Ensure we keep the valid ID and UUID
           id: existing.id,
           uuid: existing.uuid 
        };
        
        // Only update if something changed? 
        // For simplicity and "force sync", we just put. Dexie is fast enough.
        // But to avoid unnecessary writes/reactivity triggers, maybe simple check?
        // Let's just put.
        await db.characters.put(updatedCard);
        added = true; // Trigger reload
      } else {
        // CREATE new character
        if (charData.name && charData.description) {
           const newCard: CharacterCard = {
             ...charData,
             description: desc,
             uuid: charData.uuid || generateUUID(),
             tags: charData.tags || [],
             category: charData.category || '未分类'
           };
           
           // Remove ID if present in JSON to let Dexie auto-increment
           delete newCard.id;

           await db.characters.add(newCard);
           added = true;
        }
      }
    }
    
    if (added) {
      characters.value = await db.characters.toArray();
    }
  }

  async function addCharacter(card: Omit<CharacterCard, 'id' | 'uuid'>) {
    // Deep clone to remove Vue Proxies before saving to IndexedDB
    const rawCard = JSON.parse(JSON.stringify(card));
    
    const newCard: CharacterCard = {
      ...rawCard,
      uuid: generateUUID(),
      tags: rawCard.tags || [],
      category: rawCard.category || '未分类'
    };
    
    await db.characters.add(newCard);
    await loadCharacters();
    return newCard;
  }

  async function updateCharacter(uuid: string, updates: Partial<CharacterCard>) {
    const char = characters.value.find(c => c.uuid === uuid);
    if (!char || !char.id) return;

    // Deep clone updates too
    const rawUpdates = JSON.parse(JSON.stringify(updates));

    await db.characters.update(char.id, rawUpdates);
    await loadCharacters();
  }

  async function deleteCharacter(uuid: string) {
    const char = characters.value.find(c => c.uuid === uuid);
    if (!char || !char.id) return;

    await db.characters.delete(char.id);
    await loadCharacters();
  }

  // Find character by name (fuzzy match or exact)
  function findCharacterByName(name: string) {
    return characters.value.find(c => c.name.includes(name) || name.includes(c.name));
  }
  
  // Get all unique categories
  function getCategories() {
    const categories = new Set(characters.value.map(c => c.category || '未分类'));
    return Array.from(categories).sort();
  }

  async function renameCategory(oldName: string, newName: string) {
    if (!oldName || !newName || oldName === newName) return;
    
    const charsToUpdate = characters.value.filter(c => (c.category || '未分类') === oldName);
    
    for (const char of charsToUpdate) {
      if (char.id) {
        await db.characters.update(char.id, { category: newName });
      }
    }
    await loadCharacters();
  }

  async function deleteCategory(name: string) {
    if (!name) return;
    
    // Move all characters in this category to '未分类'
    const charsToUpdate = characters.value.filter(c => (c.category || '未分类') === name);
    
    for (const char of charsToUpdate) {
      if (char.id) {
        await db.characters.update(char.id, { category: '未分类' });
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
    initializeDefaults
  };
});
