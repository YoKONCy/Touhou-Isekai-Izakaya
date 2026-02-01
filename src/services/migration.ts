import { db as dexieDb } from '@/db/index_deprecated';
import { dbService } from '@/services/DatabaseService';
import Dexie from 'dexie';

const BATCH_SIZE = 50;

export async function checkMigrationNeeded(): Promise<boolean> {
  const migrated = localStorage.getItem('DB_MIGRATED_V1');
  if (migrated === 'true') return false;

  try {
      // Check if Dexie DB exists and has data
      const exists = await Dexie.exists('touhou-isekai-db');
      if (!exists) {
          // If DB doesn't exist, no migration needed.
          // Mark as migrated to avoid future checks
          localStorage.setItem('DB_MIGRATED_V1', 'true');
          return false;
      }

      await dexieDb.open();
      const count = await dexieDb.saveSlots.count();
      if (count === 0) {
           // Empty DB, no migration needed
           localStorage.setItem('DB_MIGRATED_V1', 'true');
           return false;
      }
      return true;
  } catch (e) {
      console.warn('[Migration] Dexie DB check failed:', e);
      return false;
  }
}

export async function migrateData(onProgress: (msg: string, progress: number) => void) {
  try {
    console.log('[Migration] Starting migration...');
    await dexieDb.open();
    await dbService.init(); // Ensure SQLite is ready
    
    // 1. Settings
    onProgress('正在迁移全局设置...', 0);
    const settings = await dexieDb.settings.toArray();
    if (settings.length > 0) {
        const s = settings[0];
        if (!s) return; // Safety check for TS
        // Map Dexie settings to SQLite schema
        // SQLite: theme, openaiApiKey, openaiApiUrl, openaiModel, selectedModelId, customModelName, contextLimit, autoSnapshotInterval, userName, userPersona, raw_data
        const row = {
            theme: s.theme || 'light',
            openaiApiKey: s.globalProvider?.apiKey,
            openaiApiUrl: s.globalProvider?.baseUrl,
            // Store full object in raw_data for safety
            raw_data: JSON.stringify(s)
        };
        
        // Simple check if settings already exist in SQLite (e.g. from fresh init)
        const existing = await dbService.exec('SELECT id FROM settings LIMIT 1');
        if (existing.length === 0) {
             await dbService.exec(
                'INSERT INTO settings (theme, openaiApiKey, openaiApiUrl, raw_data) VALUES (?, ?, ?, ?)', 
                [row.theme, row.openaiApiKey, row.openaiApiUrl, row.raw_data]
            );
        }
    }
    
    // 2. Characters
    onProgress('正在迁移角色卡...', 10);
    const characters = await dexieDb.characters.toArray();
    if (characters.length > 0) {
        const rows = characters.map(c => ({
            // id: c.id, // Let SQLite assign new IDs to avoid conflicts? Or preserve?
            // Since UUID is the unique identifier for logic, ID is just internal.
            // Let's preserve ID if possible, but SQLite ID must be unique.
            // If we have pre-seeded characters in SQLite, we might conflict.
            // Safe bet: Drop ID, rely on UUID.
            uuid: c.uuid,
            name: c.name,
            category: c.category || '未分类',
            tags: c.tags || [], // Will be stringified by batchInsert
            description: c.description,
            avatarUrl: (c as any).avatarUrl || '',
            stats: (c as any).stats || {},
            personality: (c as any).personality || ''
        }));
        
        // We need to handle potential duplicates if SQLite already has seeded characters
        // For migration, we usually assume target DB is empty OR we upsert.
        // `batchInsert` does simple INSERT.
        // Let's delete existing characters in SQLite before migration?
        // Or checking one by one?
        // Since this is "Migration", we assume it runs once on a fresh SQLite DB (mostly).
        // But `initializeNewGame` might have run?
        // Let's truncate characters table first to be safe?
        // No, that might delete default characters.
        // Let's just INSERT OR IGNORE? batchInsert uses INSERT.
        
        // Let's try to insert. If uuid constraint fails, it will throw.
        // We should probably filter out existing UUIDs.
        
        const existingUuids = (await dbService.exec('SELECT uuid FROM characters')).map(r => r.uuid);
        const newRows = rows.filter(r => !existingUuids.includes(r.uuid));
        
        if (newRows.length > 0) {
            await dbService.batchInsert('characters', newRows);
        }
    }
    
    // 3. Save Slots
    onProgress('正在迁移存档位...', 20);
    const slots = await dexieDb.saveSlots.toArray();
    if (slots.length > 0) {
        // We must preserve IDs for save slots because chats/snapshots reference them
        const rows = slots.map(s => ({
            id: s.id,
            name: s.name,
            summary: s.summary,
            lastPlayed: s.lastPlayed,
            location: s.location,
            playTime: (s as any).playTime || 0
        }));
        await dbService.batchInsert('save_slots', rows);
    }
    
    // 4. Chats
    const chatCount = await dexieDb.chats.count();
    let processedChats = 0;
    let offset = 0;
    
    // Disable FK checks temporarily? SQLite Wasm might enforce them.
    // If we insert chats before snapshots, snapshotId FK might fail if it's not nullable?
    // In schema: snapshotId INTEGER (nullable by default).
    // But saveSlotId is NOT NULL and references save_slots. We inserted save_slots already.
    
    while(true) {
        const batch = await dexieDb.chats.offset(offset).limit(BATCH_SIZE).toArray();
        if (batch.length === 0) break;
        
        const rows = batch.map(c => ({
            id: c.id,
            saveSlotId: c.saveSlotId,
            role: c.role,
            content: c.content || '',
            debugLog: c.debugLog, // Object, will be stringified
            timestamp: c.timestamp,
            turnCount: c.turnCount || 0,
            snapshotId: c.snapshotId
        }));
        
        await dbService.batchInsert('chats', rows);
        processedChats += batch.length;
        offset += batch.length;
        onProgress(`正在迁移对话记录 (${processedChats}/${chatCount})...`, 20 + (processedChats/chatCount * 30)); 
    }
    
    // 5. Snapshots
    const snapCount = await dexieDb.snapshots.count();
    let processedSnaps = 0;
    offset = 0;
    while(true) {
        const batch = await dexieDb.snapshots.offset(offset).limit(BATCH_SIZE).toArray();
        if (batch.length === 0) break;
        
        const rows = batch.map(s => ({
            id: s.id,
            saveSlotId: s.saveSlotId,
            chatId: s.chatId,
            createdAt: s.createdAt,
            gameState: s.gameState // Object, will be stringified
        }));
        
        await dbService.batchInsert('snapshots', rows);
        processedSnaps += batch.length;
        offset += batch.length;
        onProgress(`正在迁移系统快照 (${processedSnaps}/${snapCount})...`, 50 + (processedSnaps/snapCount * 30));
    }
    
    // 6. Memories
    const memCount = await dexieDb.memories.count();
    let processedMems = 0;
    offset = 0;
    while(true) {
        const batch = await dexieDb.memories.offset(offset).limit(BATCH_SIZE).toArray();
        if (batch.length === 0) break;
        
        const rows = batch.map(m => ({
            id: m.id,
            saveSlotId: m.saveSlotId,
            turnCount: m.turnCount,
            type: m.type,
            content: m.content, 
            tags: m.tags || [],
            related_entities: m.related_entities || [],
            importance: m.importance,
            createdAt: m.createdAt,
            gameDate: m.gameDate,
            gameTime: m.gameTime,
            location: m.location,
            characters: m.characters || []
        }));
        
        await dbService.batchInsert('memories', rows);
        processedMems += batch.length;
        offset += batch.length;
        onProgress(`正在迁移记忆库 (${processedMems}/${memCount})...`, 80 + (processedMems/memCount * 20));
    }
    
    onProgress('迁移完成！', 100);
    localStorage.setItem('DB_MIGRATED_V1', 'true');
    
  } catch (err) {
    console.error('[Migration] Failed:', err);
    throw err;
  }
}
