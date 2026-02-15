import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import { SCHEMA_SQL } from './schema';

let db: any = null;

const log = (...args: unknown[]) => console.log('[DB Worker]', ...args);
const error = (...args: unknown[]) => console.error('[DB Worker]', ...args);

// Initialize SQLite
const initPromise = (sqlite3InitModule as any)({
  print: log,
  printErr: error,
  locateFile: (path: string, prefix: string) => {
    if (path.endsWith('.wasm')) {
      return '/sqlite3/sqlite3.wasm';
    }
    return prefix + path;
  }
}).then((sqlite3: any) => {
  try {
    log('运行 SQLite3 版本', sqlite3.version.libVersion);
    
    // Diagnostic logging for OPFS requirements
    log('诊断 - isSecureContext:', self.isSecureContext);
    log('诊断 - crossOriginIsolated:', (self as any).crossOriginIsolated);
    log('诊断 - SharedArrayBuffer:', !!(self as any).SharedArrayBuffer);
    log('诊断 - Atomics:', !!(self as any).Atomics);
    log('诊断 - FileSystemHandle:', !!(self as any).FileSystemHandle);
    log('诊断 - navigator.storage.getDirectory:', !!(navigator?.storage?.getDirectory));
    
    // Check for OPFS support
    if ('opfs' in sqlite3) {
      try {
        db = new sqlite3.oo1.OpfsDb('/touhou_isekai.sqlite3');
        log('OPFS 数据库打开成功: /touhou_isekai.sqlite3');
        (self as any).dbType = 'opfs';
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        error('打开 OPFS 数据库失败，回退到临时内存数据库:', msg);
        db = new sqlite3.oo1.DB('/touhou_isekai_mem.sqlite3', 'ct');
        (self as any).dbType = 'memory-fallback';
      }
    } else {
      error('OPFS 不可用，回退到临时内存数据库。');
      db = new sqlite3.oo1.DB('/touhou_isekai_mem.sqlite3', 'ct');
      (self as any).dbType = 'memory';
    }

    // Apply Schema
    log('正在应用数据库 Schema...');
    db.transaction(() => {
        SCHEMA_SQL.forEach((sql, index) => {
            try {
                db.exec(sql);
            } catch (e: unknown) {
                const msg = e instanceof Error ? e.message : String(e);
                error(`Schema 错误 (索引 ${index}):`, msg, 'SQL:', sql);
                throw e;
            }
        });
    });
    log('数据库 Schema 应用成功。');
    
    // Run Migrations for existing databases
    runMigrations(db);
    
    return true;
  } catch (err: unknown) {
    const errorObj = err as Error;
    error('数据库初始化失败:', errorObj.name, errorObj.message);
    throw err;
  }
});

function runMigrations(db: any) {
  log('开始数据库迁移...');
  try {
    // Helper to check and add column if missing
    const ensureColumn = (tableName: string, colName: string, typeDef: string) => {
        const tableInfo = db.exec({
            sql: `PRAGMA table_info(${tableName})`,
            returnValue: 'resultRows',
            rowMode: 'object'
        });
        if (!tableInfo.some((col: { name: string }) => col.name === colName)) {
            log(`迁移: 正在添加列 "${colName}" 到表 "${tableName}"...`);
            db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${colName} ${typeDef}`);
            log(`迁移: 列 "${colName}" 已成功添加到表 "${tableName}"。`);
        }
    };

    // 1. Characters table migrations
    ensureColumn('characters', 'type', 'TEXT DEFAULT "character"');
    ensureColumn('characters', 'gender', 'TEXT');

    // 2. Chats table migrations
    ensureColumn('chats', 'thought_content', 'TEXT');
    ensureColumn('chats', 'illustrationUrl', 'TEXT');
    ensureColumn('chats', 'illustrationPrompt', 'TEXT');

    // 3. Save slots table migrations
    ensureColumn('save_slots', 'playTime', 'INTEGER DEFAULT 0');
    ensureColumn('save_slots', 'isMultiplayer', 'BOOLEAN DEFAULT 0');

    log('所有数据库迁移已完成。');
  } catch (e: any) {
    error('迁移失败:', e.message);
  }
}

self.onmessage = async (e: MessageEvent) => {
  const { id, type, payload } = e.data;
  
  try {
    await initPromise;
    
    let result;
    switch (type) {
      case 'EXEC':
        // Automatically stringify objects in bind parameters
        const bind = payload.bind ? payload.bind.map((val: any) => {
            if (typeof val === 'object' && val !== null) return JSON.stringify(val);
            return val;
        }) : undefined;
        
        result = db.exec({
          sql: payload.sql,
          bind: bind,
          returnValue: 'resultRows',
          rowMode: 'object' // or 'array'
        });
        break;

      case 'EXPORT_SAVE':
        result = exportSave(db, payload.saveSlotId);
        break;

      case 'IMPORT_SAVE':
        result = await importSaveWithCorrectOrder(db, payload.jsonContent);
        break;



      case 'BATCH_INSERT':
        result = batchInsert(db, payload.table, payload.rows);
        break;
        
      case 'PING':
        result = { status: 'ok', time: Date.now() };
        break;

      case 'GET_DB_INFO':
        result = { 
            type: (self as any).dbType || 'unknown',
            sqliteVersion: (self as any).sqlite3?.version?.libVersion,
            diagnostics: {
                isSecureContext: self.isSecureContext,
                crossOriginIsolated: (self as any).crossOriginIsolated,
                hasSharedArrayBuffer: !!(self as any).SharedArrayBuffer,
                hasAtomics: !!(self as any).Atomics,
                hasFileSystemHandle: !!(self as any).FileSystemHandle,
                hasGetDirectory: !!(navigator?.storage?.getDirectory),
                hasStorageManager: !!navigator?.storage
            }
        };
        break;
        
      default:
        throw new Error(`Unknown message type: ${type}`);
    }
    
    self.postMessage({ id, type, result });
    
  } catch (err: any) {
    error('Worker Error:', err);
    self.postMessage({ 
      id, 
      type, 
      error: err.message || String(err) 
    });
  }
};

function batchInsert(db: any, table: string, rows: any[]) {
  if (!rows || rows.length === 0) return 0;
  
  const sample = rows[0];
  const keys = Object.keys(sample);
  if (keys.length === 0) return 0;

  const columns = keys.join(', ');
  const placeholders = keys.map(() => '?').join(', ');
  const sql = `INSERT OR IGNORE INTO ${table} (${columns}) VALUES (${placeholders})`;
  
  let insertedCount = 0;
  
  db.transaction(() => {
    const stmt = db.prepare(sql);
    try {
        for (const row of rows) {
            const values = keys.map(k => {
                const val = row[k];
                if (typeof val === 'object' && val !== null) return JSON.stringify(val);
                return val;
            });
            stmt.bind(values);
            stmt.step();
            stmt.reset();
            insertedCount++;
        }
    } finally {
        stmt.finalize();
    }
  });
  
  return insertedCount;
}

/**
 * Recursively strips Base64 images and large strings from an object
 * Returns true if any change was made
 */
function stripBase64Images(obj: any, threshold = 1024): boolean {
    if (!obj || typeof obj !== 'object') return false;
    let changed = false;

    if (Array.isArray(obj)) {
        for (const item of obj) {
            if (stripBase64Images(item, threshold)) changed = true;
        }
        return changed;
    }

    for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
            const val = obj[key];
            if (typeof val === 'string') {
                // Check for potential image fields
                // We target keys that likely contain images
                const lowerKey = key.toLowerCase();
                const isImageKey = lowerKey.includes('avatar') || 
                                  lowerKey.includes('image') || 
                                  lowerKey.includes('img') ||
                                  lowerKey.includes('b64') ||
                                  lowerKey.includes('url');

                if (isImageKey) {
                    if (val.startsWith('data:image')) {
                        // It is definitely a base64 image
                        delete obj[key];
                        changed = true;
                    } else if (val.length > threshold * 2 && !val.startsWith('http')) {
                        // Very long string that is not a standard URL (likely base64 without prefix or raw data)
                        // Be conservative: only if > 2KB
                        delete obj[key];
                        changed = true;
                    }
                }
            } else if (typeof val === 'object') {
                if (stripBase64Images(val, threshold)) changed = true;
            }
        }
    }
    return changed;
}

function exportSave(db: any, saveSlotId: number) {
  const getRows = (sql: string, bind: any[] = []) => 
    db.exec({ sql, bind, returnValue: 'resultRows', rowMode: 'object' });

  const saveSlots = getRows('SELECT * FROM save_slots WHERE id = ?', [saveSlotId]);
  if (saveSlots.length === 0) throw new Error("Save not found");
  
  const rawSave = saveSlots[0];
  const saveSlotData = {
    ...rawSave,
    id: undefined,
    isMultiplayer: Boolean(rawSave.isMultiplayer)
  };
  
  const chats = getRows('SELECT * FROM chats WHERE saveSlotId = ?', [saveSlotId]).map((chat: any) => {
    // Optimization: Remove debugLog and potential duplicate large fields from chat history
    // We keep illustrationUrl as it is content
    if (chat.debugLog) {
        chat.debugLog = undefined;
    }
    return chat;
  });

  const memories = getRows('SELECT * FROM memories WHERE saveSlotId = ?', [saveSlotId]);
  
  // Export memory relations associated with this save slot's memories
  const memoryRelations = getRows(`
    SELECT mr.* 
    FROM memory_relations mr 
    JOIN memories m ON mr.source_id = m.id 
    WHERE m.saveSlotId = ?
  `, [saveSlotId]);

  const snapshots = getRows('SELECT * FROM snapshots WHERE saveSlotId = ?', [saveSlotId]);
  const facilities = getRows('SELECT * FROM facilities WHERE saveSlotId = ?', [saveSlotId]);
  const characters = getRows('SELECT * FROM characters'); // Global characters

  // Optimize snapshots
  const optimizedSnapshots = snapshots.map((s: any) => {
    try {
      if (s.gameState) {
        const stateObj = JSON.parse(s.gameState);
        let changed = false;

        // More aggressive cleaning: recursively remove all base64 images from the ENTIRE state object
        // This handles player avatar, companions, and any other deeply nested image data
        if (stripBase64Images(stateObj, 2048)) { // 2KB threshold for non-data URI strings
            changed = true;
        }

        if (changed) {
          s.gameState = JSON.stringify(stateObj);
        }
      }
    } catch (e) {
      console.warn('Snapshot optimization failed', e);
    }
    return s;
  });

  return {
    version: 2,
    timestamp: Date.now(),
    saveSlot: saveSlotData,
    chats,
    memories,
    memoryRelations,
    snapshots: optimizedSnapshots,
    characters,
    facilities
  };
}

/**
 * Helper to strip a large JSON array section from ArrayBuffer
 * Returns a new ArrayBuffer (or the same one modified if we want to be destructive, but better safe)
 * Replaces the content of the array with spaces: "key": [ ... ] -> "key": [     ]
 * @param keepLast If > 0, keeps the last N items and strips the rest.
 */
function stripJsonSection(buffer: ArrayBuffer, keyName: string, keepLast: number = 0): ArrayBuffer {
    const uint8 = new Uint8Array(buffer);
    const key = `"${keyName}":`;
    const keyBytes = new TextEncoder().encode(key);
    
    // Simple Knuth-Morris-Pratt or just brute force search (fast enough for 100MB-1GB in simple loop)
    let foundIndex = -1;
    
    for (let i = 0; i < uint8.length - keyBytes.length; i++) {
        let match = true;
        for (let j = 0; j < keyBytes.length; j++) {
            if (uint8[i + j] !== keyBytes[j]) {
                match = false;
                break;
            }
        }
        if (match) {
            foundIndex = i;
            break;
        }
    }
    
    if (foundIndex === -1) {
        console.warn(`[Import] Key "${keyName}" not found in buffer.`);
        return buffer;
    }
    
    // Found key. Now find the start of the value.
    // Scan forward from foundIndex + keyBytes.length
    let cursor = foundIndex + keyBytes.length;
    let startBracket = -1;
    
    // Find opening '['
    while (cursor < uint8.length) {
        const byte = uint8[cursor];
        if (byte === undefined) break;
        
        if (byte === 91) { // '['
            startBracket = cursor;
            break;
        } else if (byte > 32) { // Non-whitespace char that is not '['
            // Maybe it's null? or object? We only target arrays here.
            console.warn(`[Import] Value for "${keyName}" is not an array.`);
            return buffer;
        }
        cursor++;
    }
    
    if (startBracket === -1) return buffer;
    
    // Now find the matching closing ']'
    let depth = 1;
    let inString = false;
    let escaped = false;
    cursor = startBracket + 1;
    
    while (cursor < uint8.length && depth > 0) {
        const byte = uint8[cursor];
        if (byte === undefined) break;
        
        if (inString) {
            if (escaped) {
                escaped = false;
            } else {
                if (byte === 92) { // Backslash '\'
                    escaped = true;
                } else if (byte === 34) { // Quote '"'
                    inString = false;
                }
            }
        } else {
            if (byte === 34) { // Quote '"'
                inString = true;
            } else if (byte === 91) { // '['
                depth++;
            } else if (byte === 93) { // ']'
                depth--;
            }
        }
        
        if (depth === 0) break;
        cursor++;
    }
    
    if (depth !== 0) {
        console.warn(`[Import] Could not find closing bracket for "${keyName}".`);
        return buffer;
    }
    
    const endBracket = cursor;
    
    let stripEnd = endBracket;
    
    if (keepLast > 0) {
        // We want to keep the last N items.
        // Scan backwards from endBracket - 1 to find the (N)th comma at depth 1.
        let commaCount = 0;
        let scanCursor = endBracket - 1;
        let scanDepth = 1; // We are inside the array
        let scanInString = false;
        
        // Helper to check if a quote at scanCursor is escaped
        // Looks at bytes BEFORE scanCursor to count backslashes
        const isEscapedQuote = (pos: number): boolean => {
            let backslashCount = 0;
            let checkPos = pos - 1;
            while (checkPos >= startBracket && uint8[checkPos] === 92) { // 92 is backslash
                backslashCount++;
                checkPos--;
            }
            return (backslashCount % 2) === 1;
        };

        while (scanCursor > startBracket) {
            const byte = uint8[scanCursor];
            if (byte === undefined) break;
            
            if (byte === 34) { // Quote '"'
                if (!isEscapedQuote(scanCursor)) {
                    scanInString = !scanInString;
                }
            } else if (!scanInString) {
                if (byte === 93) { // ']'
                    scanDepth++;
                } else if (byte === 91) { // '['
                    scanDepth--;
                } else if (byte === 125) { // '}'
                    scanDepth++;
                } else if (byte === 123) { // '{'
                    scanDepth--;
                } else if (byte === 44) { // ','
                    if (scanDepth === 1) {
                        commaCount++;
                        if (commaCount === keepLast) {
                            // Found the split point!
                            // The comma at scanCursor separates the kept items from the stripped ones.
                            // We should strip up to and including this comma.
                            stripEnd = scanCursor + 1; // +1 to include comma in strip range
                            break;
                        }
                    }
                }
            }
            scanCursor--;
        }
        
        if (commaCount < keepLast) {
            // Found fewer items than requested. Keep everything.
            console.log(`[Import] Requested to keep ${keepLast} items, but only found ${commaCount} (or fewer). Keeping all.`);
            return buffer;
        }
    }

    // We want to keep the brackets but empty the content
    // Replace range (startBracket + 1) to (stripEnd - 1) with spaces (32)
    
    console.log(`[Import] Stripping "${keyName}" from byte ${startBracket} to ${stripEnd}. Length: ${stripEnd - startBracket}`);
    
    for (let k = startBracket + 1; k < stripEnd; k++) {
        uint8[k] = 32; // Space
    }
    
    return buffer;
}

async function importSaveWithCorrectOrder(db: any, jsonContent: string | ArrayBuffer) {
  let data;
  try {
    if (typeof jsonContent === 'string') {
        console.log('[Import] Parsing string content, length:', jsonContent.length);
        data = JSON.parse(jsonContent);
    } else {
        // ArrayBuffer
        let buffer = jsonContent;
        console.log('[Import] Parsing ArrayBuffer content, size:', buffer.byteLength);
        
        // If file is very large (> 100MB), try to strip unnecessary data (snapshots) to avoid OOM
         if (buffer.byteLength > 100 * 1024 * 1024) {
             console.warn('[Import] File too large, attempting to strip old snapshots to save memory...');
             try {
                 // Try to keep the last 50 snapshots, strip the rest
                 buffer = stripJsonSection(buffer, 'snapshots', 50);
                 console.log('[Import] Snapshots processed. New size:', buffer.byteLength); 
             } catch (e) {
                 console.error('[Import] Failed to strip snapshots:', e);
                 // Continue with original buffer
             }
         }

        // Use Response.json() to parse large JSON asynchronously and efficiently
        // This avoids V8 string length limits for large files
        data = await new Response(new Blob([buffer])).json();
    }
  } catch (e: any) {
    console.error('[Import] JSON Parse failed:', e);
    throw new Error(`JSON parsing failed: ${e.message}`);
  }
  
  if (!data.saveSlot || !Array.isArray(data.chats)) {
    throw new Error("Invalid save file format");
  }

  // Ensure snapshots is an array if we stripped it (it might be parsed as empty array if we replaced content)
  if (!data.snapshots) data.snapshots = [];

  let newSaveId = 0;

  db.transaction(() => {
    const exec = (sql: string, bind: any[] = []) => 
        db.exec({ sql, bind, returnValue: 'resultRows', rowMode: 'object' });

    // 1. Create Save Slot
    exec(
      'INSERT INTO save_slots (name, summary, lastPlayed, location, gameDate, gameTime, playTime, isMultiplayer) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [
        `${data.saveSlot.name} (导入)`,
        data.saveSlot.summary,
        Date.now(),
        data.saveSlot.location,
        data.saveSlot.gameDate || '1/1',
        data.saveSlot.gameTime || '10:00',
        data.saveSlot.playTime || 0,
        data.saveSlot.isMultiplayer ? 1 : 0
      ]
    );
    newSaveId = exec('SELECT last_insert_rowid() as id')[0].id;

    const chatIdMap = new Map<number, number>();
    const snapshotIdMap = new Map<number, number>();

    // 2. Import Characters (Upsert)
    if (Array.isArray(data.characters)) {
      for (const char of data.characters) {
        try {
            // Mapping for old fields
            const mappedChar: any = {
                uuid: char.uuid || `char-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                name: char.name || '未知角色',
                type: char.type || 'character',
                category: char.category || '未分类',
                tags: Array.isArray(char.tags) ? char.tags : [],
                description: char.description || '',
                avatarUrl: char.avatarUrl || char.avatar || '',
                gender: char.gender || '',
                referenceImageUrl: char.referenceImageUrl || '',
                personality: char.personality || char.creatorNotes || '',
                stats: typeof char.stats === 'object' ? { ...char.stats } : {}
            };

            // Collect extra fields into stats
            const extraFields = ['initialPower', 'initialMaxHp', 'initialResidence', 'cost', 'damage', 'damageType', 'buffDetails'];
            extraFields.forEach(field => {
                if (char[field] !== undefined) {
                    mappedChar.stats[field] = char[field];
                }
            });

            const existing = exec('SELECT id FROM characters WHERE uuid = ?', [mappedChar.uuid]);
            
            const fields = Object.keys(mappedChar);
            const values = fields.map(k => {
                const val = mappedChar[k];
                return (typeof val === 'object' && val !== null) ? JSON.stringify(val) : val;
            });

            if (existing.length > 0) {
              // Update
              const setClause = fields.map(k => `${k} = ?`).join(', ');
              exec(`UPDATE characters SET ${setClause} WHERE uuid = ?`, [...values, mappedChar.uuid]);
            } else {
              // Insert
              const placeholders = fields.map(() => '?').join(', ');
              exec(
                `INSERT OR IGNORE INTO characters (${fields.join(', ')}) VALUES (${placeholders})`,
                values
              );
            }
        } catch (e: any) {
            console.warn(`[Import] Failed to import character ${char.name || char.uuid}:`, e);
            // Continue with other characters? Or throw?
            // Throwing stops the whole import. Let's throw to ensure data integrity.
            throw new Error(`Failed to import character ${char.name}: ${e.message}`);
        }
      }
    }

    // 3. Import Chats (First Pass: snapshotId = NULL)
    for (const chat of data.chats) {
        // Fallback for required fields in old saves
        const role = chat.role || 'assistant';
        const timestamp = chat.timestamp || Date.now();
        const turnCount = chat.turnCount !== undefined ? chat.turnCount : 0;
        const content = chat.content || '';
        const debugLog = typeof chat.debugLog === 'object' ? JSON.stringify(chat.debugLog) : (chat.debugLog || null);
        
        // Extra fields from old version
        const thoughtContent = chat.thought_content || null;
        const illustrationUrl = chat.illustrationUrl || null;
        const illustrationPrompt = chat.illustrationPrompt || null;

        exec(
            'INSERT INTO chats (saveSlotId, role, content, debugLog, timestamp, turnCount, snapshotId, thought_content, illustrationUrl, illustrationPrompt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [newSaveId, role, content, debugLog, timestamp, turnCount, null, thoughtContent, illustrationUrl, illustrationPrompt]
        );
        const newChatId = exec('SELECT last_insert_rowid() as id')[0].id;
        chatIdMap.set(chat.id, newChatId);
    }

    // 4. Import Snapshots (Use Mapped Chat IDs)
    if (Array.isArray(data.snapshots)) {
      for (const snap of data.snapshots) {
         // Fix gameState format if needed
         let gameStateStr = snap.gameState;
         if (typeof gameStateStr !== 'string') {
             gameStateStr = JSON.stringify(gameStateStr);
         }
         
         const oldChatId = snap.chatId;
         const newChatId = chatIdMap.get(oldChatId) || 0;

         if (newChatId === 0) {
             console.warn(`[Import] Snapshot ${snap.id} refers to non-existent chat ${oldChatId}, skipping.`);
             continue;
         }

         exec(
            'INSERT INTO snapshots (saveSlotId, chatId, createdAt, gameState) VALUES (?, ?, ?, ?)',
            [newSaveId, newChatId, snap.createdAt || Date.now(), gameStateStr]
         );
         const newId = exec('SELECT last_insert_rowid() as id')[0].id;
         snapshotIdMap.set(snap.id, newId);
      }
    }

    // 5. Update Chats with Mapped Snapshot IDs
    for (const chat of data.chats) {
        if (chat.snapshotId && snapshotIdMap.has(chat.snapshotId)) {
            const newChatId = chatIdMap.get(chat.id);
            const newSnapshotId = snapshotIdMap.get(chat.snapshotId);
            if (newChatId && newSnapshotId) {
                exec('UPDATE chats SET snapshotId = ? WHERE id = ?', [newSnapshotId, newChatId]);
            }
        }
    }
    
    // 6. Import Memories
    const memoryIdMap = new Map<number, number>();
    
    if (Array.isArray(data.memories)) {
        for (const mem of data.memories) {
            const fields = ['saveSlotId', 'turnCount', 'type', 'content', 'tags', 'related_entities', 'importance', 'createdAt', 'gameDate', 'gameTime', 'location', 'characters'];
            const placeholders = fields.map(() => '?').join(', ');
            
            // Need to ensure JSON fields are stringified if they come as objects
            const ensureString = (val: any) => (typeof val === 'object' && val !== null) ? JSON.stringify(val) : (val || '[]');

            const values = [
              newSaveId,
              mem.turnCount || 0,
              mem.type || 'event',
              mem.content || '',
              ensureString(mem.tags),
              ensureString(mem.related_entities),
              mem.importance || 1,
              mem.createdAt || Date.now(),
              mem.gameDate || '',
              mem.gameTime || '',
              mem.location || '',
              ensureString(mem.characters)
            ];

            exec(
                `INSERT INTO memories (${fields.join(', ')}) VALUES (${placeholders})`,
                values
            );
            const newMemoryId = exec('SELECT last_insert_rowid() as id')[0].id;
            memoryIdMap.set(mem.id, newMemoryId);
        }
    }

    // 6.1 Import Memory Relations
    if (Array.isArray(data.memoryRelations)) {
        for (const rel of data.memoryRelations) {
            const newSourceId = memoryIdMap.get(rel.source_id);
            const newTargetId = memoryIdMap.get(rel.target_id);
            
            // Only import if both memories were successfully imported/mapped
            if (newSourceId && newTargetId) {
                try {
                    exec(
                        'INSERT OR IGNORE INTO memory_relations (source_id, target_id, rel_type, strength, created_at) VALUES (?, ?, ?, ?, ?)',
                        [newSourceId, newTargetId, rel.rel_type, rel.strength, rel.created_at || Date.now()]
                    );
                } catch (e) {
                    console.warn('[Import] Failed to import memory relation:', e);
                }
            }
        }
    }

    // 7. Import Facilities
    if (Array.isArray(data.facilities)) {
        // Helper for stringifying
        const ensureString = (val: any) => (typeof val === 'object' && val !== null) ? JSON.stringify(val) : (val || '[]');

        for (const fac of data.facilities) {
            const fields = ['id', 'saveSlotId', 'name', 'location', 'description', 'status', 'sub_locations', 'staff', 'is_player_owned', 'created_at', 'updated_at'];
            const placeholders = fields.map(() => '?').join(', ');
            
            const values = [
                fac.id,
                newSaveId,
                fac.name,
                fac.location || '',
                fac.description || '',
                fac.status || '正常',
                ensureString(fac.sub_locations),
                ensureString(fac.staff),
                fac.is_player_owned ? 1 : 0,
                fac.created_at || Date.now(),
                fac.updated_at || Date.now()
            ];

            exec(
                `INSERT INTO facilities (${fields.join(', ')}) VALUES (${placeholders})`,
                values
            );
        }
    }
  });

  return { newSaveId };
}

// @ts-expect-error: TODO: fix type error
 
function importGlobalData(db: any, gameData: any) {
  // Implementation for global data import if needed
  return true;
}
