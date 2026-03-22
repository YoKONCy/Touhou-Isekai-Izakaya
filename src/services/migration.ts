import { db as dexieDb } from '@/db/index_deprecated';
import { dbService } from '@/services/DatabaseService';
import Dexie from 'dexie';

const BATCH_SIZE = 50;

export async function checkMigrationNeeded(ignoreLocalStorage = false): Promise<boolean> {
  const migrated = localStorage.getItem('DB_MIGRATED_V1');

  // Proactive check: If user has NO saves in SQLite but HAS saves in Dexie,
  // maybe the previous migration failed or was skipped.
  // We only do this if it's NOT already marked as migrated,
  // OR if we are explicitly ignoring the flag.
  if (!ignoreLocalStorage && migrated === 'true') {
    return false;
  }

  try {
    // Check if Dexie DB exists and has data
    const exists = await Dexie.exists('TouhouIsekaiIzakayaDB');
    if (!exists) {
      if (!ignoreLocalStorage) {
        localStorage.setItem('DB_MIGRATED_V1', 'true');
      }
      return false;
    }

    await dexieDb.open();
    const count = await dexieDb.saveSlots.count();
    if (count === 0) {
      if (!ignoreLocalStorage) {
        localStorage.setItem('DB_MIGRATED_V1', 'true');
      }
      return false;
    }

    // If we are here, Dexie HAS data.
    // If we are in "check" mode (not manual), we should also verify if SQLite is empty.
    if (!ignoreLocalStorage) {
      await dbService.init();
      const sqliteSaves = await dbService.exec('SELECT id FROM save_slots LIMIT 1');
      if (sqliteSaves.length > 0) {
        // SQLite already has data, don't force auto-migration
        // But mark as migrated so we don't keep checking
        localStorage.setItem('DB_MIGRATED_V1', 'true');
        return false;
      }
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
      const rows = characters.map((c) => {
        const stats = (c as any).stats || {};
        // Collect flat fields into stats if they exist
        if ((c as any).initialPower) stats.initialPower = (c as any).initialPower;
        if ((c as any).initialMaxHp) stats.initialMaxHp = (c as any).initialMaxHp;
        if ((c as any).initialResidence) stats.initialResidence = (c as any).initialResidence;
        if ((c as any).cost) stats.cost = (c as any).cost;
        if ((c as any).damage) stats.damage = (c as any).damage;
        if ((c as any).damageType) stats.damageType = (c as any).damageType;
        if ((c as any).buffDetails) stats.buffDetails = (c as any).buffDetails;

        return {
          uuid: c.uuid,
          name: c.name,
          type: (c as any).type || 'character',
          category: c.category || '未分类',
          tags: c.tags || [],
          description: c.description,
          avatarUrl: (c as any).avatarUrl || (c as any).avatar || '',
          gender: (c as any).gender || '',
          stats: stats,
          personality: (c as any).personality || (c as any).creatorNotes || ''
        };
      });

      const existingUuids = (await dbService.exec('SELECT uuid FROM characters')).map(
        (r) => r.uuid
      );
      const newRows = rows.filter((r) => !existingUuids.includes(r.uuid));

      if (newRows.length > 0) {
        await dbService.batchInsert('characters', newRows);
      }
    }

    // 3. Save Slots
    onProgress('正在迁移存档位...', 20);
    const slots = await dexieDb.saveSlots.toArray();
    if (slots.length > 0) {
      // We must preserve IDs for save slots because chats/snapshots reference them
      const rows = slots.map((s) => ({
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

    while (true) {
      const batch = await dexieDb.chats.offset(offset).limit(BATCH_SIZE).toArray();
      if (batch.length === 0) break;

      const rows = batch.map((c) => ({
        id: c.id,
        saveSlotId: c.saveSlotId,
        role: c.role,
        content: c.content || '',
        thought_content: (c as any).thought_content || '',
        illustrationUrl: (c as any).illustrationUrl || '',
        illustrationPrompt: (c as any).illustrationPrompt || '',
        debugLog: c.debugLog, // Object, will be stringified
        timestamp: c.timestamp,
        turnCount: c.turnCount || 0,
        snapshotId: c.snapshotId
      }));

      await dbService.batchInsert('chats', rows);
      processedChats += batch.length;
      offset += batch.length;
      onProgress(
        `正在迁移对话记录 (${processedChats}/${chatCount})...`,
        20 + (processedChats / chatCount) * 30
      );
    }

    // 5. Snapshots
    const snapCount = await dexieDb.snapshots.count();
    let processedSnaps = 0;
    offset = 0;
    while (true) {
      const batch = await dexieDb.snapshots.offset(offset).limit(BATCH_SIZE).toArray();
      if (batch.length === 0) break;

      const rows = batch.map((s) => ({
        id: s.id,
        saveSlotId: s.saveSlotId,
        chatId: s.chatId,
        createdAt: s.createdAt,
        gameState: s.gameState // Object, will be stringified
      }));

      await dbService.batchInsert('snapshots', rows);
      processedSnaps += batch.length;
      offset += batch.length;
      onProgress(
        `正在迁移系统快照 (${processedSnaps}/${snapCount})...`,
        50 + (processedSnaps / snapCount) * 30
      );
    }

    // 6. Memories
    const memCount = await dexieDb.memories.count();
    let processedMems = 0;
    offset = 0;
    while (true) {
      const batch = await dexieDb.memories.offset(offset).limit(BATCH_SIZE).toArray();
      if (batch.length === 0) break;

      const rows = batch.map((m) => ({
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
      onProgress(
        `正在迁移记忆库 (${processedMems}/${memCount})...`,
        80 + (processedMems / memCount) * 20
      );
    }

    onProgress('迁移完成！', 100);
    localStorage.setItem('DB_MIGRATED_V1', 'true');
  } catch (err) {
    console.error('[Migration] Failed:', err);
    throw err;
  }
}
