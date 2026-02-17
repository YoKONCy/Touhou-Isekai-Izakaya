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

// --- Optimization Helpers ---
const hashCache = new Map<string, string>();

async function sha1(str: string): Promise<string> {
    if (hashCache.has(str)) return hashCache.get(str)!;
    
    // Fallback if crypto not available
    if (!self.crypto || !self.crypto.subtle) {
        let hash = 5381;
        for (let i = 0; i < str.length; i++) {
            hash = ((hash << 5) + hash) + str.charCodeAt(i);
        }
        const res = (hash >>> 0).toString(16);
        hashCache.set(str, res);
        return res;
    }
    
    const msgUint8 = new TextEncoder().encode(str);
    const hashBuffer = await self.crypto.subtle.digest('SHA-1', msgUint8);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    hashCache.set(str, hashHex);
    return hashHex;
}

async function optimizeGameState(state: any): Promise<any> {
    if (!state) return state;
    
    // Process Items
    if (state.player && Array.isArray(state.player.items)) {
        for (let i = 0; i < state.player.items.length; i++) {
            const item = state.player.items[i];
            if (item._ref) continue;
            
            const { id, count, ...staticProps } = item;
            if (Object.keys(staticProps).length > 0) {
                const content = JSON.stringify(staticProps);
                const hash = await sha1(content);
                
                db.exec({
                    sql: 'INSERT OR IGNORE INTO static_data (id, type, content) VALUES (?, ?, ?)',
                    bind: [hash, 'item', content]
                });
                
                state.player.items[i] = { id, count, _ref: hash };
            }
        }
    }
    
    // Process Recipes
    if (state.player && Array.isArray(state.player.recipes)) {
        for (let i = 0; i < state.player.recipes.length; i++) {
            const recipe = state.player.recipes[i];
            if (recipe._ref) continue;
            
            const { id, status, ...staticProps } = recipe;
             if (Object.keys(staticProps).length > 0) {
                const content = JSON.stringify(staticProps);
                const hash = await sha1(content);
                
                db.exec({
                    sql: 'INSERT OR IGNORE INTO static_data (id, type, content) VALUES (?, ?, ?)',
                    bind: [hash, 'recipe', content]
                });
                
                state.player.recipes[i] = { id, status, _ref: hash };
             }
        }
    }
    
    // Process Quests
    if (state.system && Array.isArray(state.system.quests)) {
        for (let i = 0; i < state.system.quests.length; i++) {
            const quest = state.system.quests[i];
            if (quest._ref) continue;
            
            const { id, status, logs, completedTurn, completedDate, completedTime, completionSummary, ...staticProps } = quest;
             if (Object.keys(staticProps).length > 0) {
                const content = JSON.stringify(staticProps);
                const hash = await sha1(content);
                
                db.exec({
                    sql: 'INSERT OR IGNORE INTO static_data (id, type, content) VALUES (?, ?, ?)',
                    bind: [hash, 'quest', content]
                });
                
                state.system.quests[i] = { 
                    id, status, logs, completedTurn, completedDate, completedTime, completionSummary, 
                    _ref: hash 
                };
             }
        }
    }
    
    return state;
}

async function restoreGameState(state: any): Promise<any> {
    if (!state) return state;
    
    const getContent = (hash: string) => {
        const res = db.exec({
            sql: 'SELECT content FROM static_data WHERE id = ?',
            bind: [hash],
            returnValue: 'resultRows',
            rowMode: 'object'
        });
        if (res.length > 0) return JSON.parse(res[0].content);
        return {};
    };
    
    if (state.player && Array.isArray(state.player.items)) {
        for (let i = 0; i < state.player.items.length; i++) {
            const item = state.player.items[i];
            if (item._ref) {
                const staticProps = getContent(item._ref);
                const { _ref, ...dynamicProps } = item;
                state.player.items[i] = { ...staticProps, ...dynamicProps };
            }
        }
    }
    
    if (state.player && Array.isArray(state.player.recipes)) {
        for (let i = 0; i < state.player.recipes.length; i++) {
            const recipe = state.player.recipes[i];
            if (recipe._ref) {
                const staticProps = getContent(recipe._ref);
                const { _ref, ...dynamicProps } = recipe;
                state.player.recipes[i] = { ...staticProps, ...dynamicProps };
            }
        }
    }
    
    if (state.system && Array.isArray(state.system.quests)) {
        for (let i = 0; i < state.system.quests.length; i++) {
            const quest = state.system.quests[i];
            if (quest._ref) {
                const staticProps = getContent(quest._ref);
                const { _ref, ...dynamicProps } = quest;
                state.system.quests[i] = { ...staticProps, ...dynamicProps };
            }
        }
    }
    
    return state;
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
        result = await exportSave(db, payload.saveSlotId);
        break;

      case 'OPTIMIZE_AND_CREATE_SNAPSHOT':
        {
            const { saveSlotId, chatId, gameState } = payload;
            const optimizedState = await optimizeGameState(gameState);
            const stateStr = JSON.stringify(optimizedState);
            
            db.exec({
                sql: 'INSERT INTO snapshots (saveSlotId, chatId, createdAt, gameState) VALUES (?, ?, ?, ?)',
                bind: [saveSlotId, chatId, Date.now(), stateStr]
            });
            const res = db.exec({ sql: 'SELECT last_insert_rowid() as id', returnValue: 'resultRows', rowMode: 'object' });
            result = { id: res[0].id };
        }
        break;

      case 'GET_SNAPSHOT_RESTORED':
        {
            const res = db.exec({
                sql: 'SELECT * FROM snapshots WHERE id = ?',
                bind: [payload.id],
                returnValue: 'resultRows',
                rowMode: 'object'
            });
            
            if (res.length > 0) {
                const snap = res[0];
                if (snap.gameState) {
                    try {
                        const state = JSON.parse(snap.gameState);
                        const restored = await restoreGameState(state);
                        snap.gameState = JSON.stringify(restored);
                    } catch (e) {
                        console.warn('Failed to restore snapshot state', e);
                    }
                }
                result = snap;
            } else {
                result = null;
            }
        }
        break;

      case 'GET_LATEST_SNAPSHOT':
        {
            const res = db.exec({
                sql: 'SELECT * FROM snapshots WHERE saveSlotId = ? ORDER BY id DESC LIMIT 1',
                bind: [payload.saveSlotId],
                returnValue: 'resultRows',
                rowMode: 'object'
            });
            
            if (res.length > 0) {
                const snap = res[0];
                if (snap.gameState) {
                    try {
                        const state = JSON.parse(snap.gameState);
                        const restored = await restoreGameState(state);
                        snap.gameState = JSON.stringify(restored);
                    } catch (e) {
                        console.warn('Failed to restore latest snapshot state', e);
                    }
                }
                result = snap;
            } else {
                result = null;
            }
        }
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


async function exportSave(db: any, saveSlotId: number) {
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

  const snapshotsCount = getRows('SELECT COUNT(*) as c FROM snapshots WHERE saveSlotId = ?', [saveSlotId])[0].c;
  const facilities = getRows('SELECT * FROM facilities WHERE saveSlotId = ?', [saveSlotId]);
  const characters = getRows('SELECT * FROM characters'); // Global characters
  
  // Export static data (Deduplicated items/recipes/quests)
  // We export ALL static data to ensure references in snapshots are valid.
  // In a more complex system, we would filter only used IDs, but since this table is deduplicated, it shouldn't be too large.
  const staticData = getRows('SELECT * FROM static_data');

  // Stream-like Blob Construction
  // Instead of building a huge object and JSON.stringify-ing it (which causes OOM or string limit errors),
  // we build the JSON string in parts and create a Blob.
  
  const jsonParts: string[] = [];
  
  // Header
  jsonParts.push(`{"version":2,"timestamp":${Date.now()},`);
  jsonParts.push(`"saveSlot":${JSON.stringify(saveSlotData)},`);
  jsonParts.push(`"chats":${JSON.stringify(chats)},`);
  jsonParts.push(`"memories":${JSON.stringify(memories)},`);
  jsonParts.push(`"memoryRelations":${JSON.stringify(memoryRelations)},`);
  jsonParts.push(`"characters":${JSON.stringify(characters)},`);
  jsonParts.push(`"facilities":${JSON.stringify(facilities)},`);
  jsonParts.push(`"staticData":${JSON.stringify(staticData)},`);
  
  // Snapshots (processed in batches)
  jsonParts.push(`"snapshots":[`);
  
  const BATCH_SIZE = 10;
  let processedCount = 0;
  
  for (let offset = 0; offset < snapshotsCount; offset += BATCH_SIZE) {
      const batch = getRows('SELECT * FROM snapshots WHERE saveSlotId = ? LIMIT ? OFFSET ?', [saveSlotId, BATCH_SIZE, offset]);
      
      for (let i = 0; i < batch.length; i++) {
          const s = batch[i];
          
          // FAST PATH: Directly use the stored JSON string without parsing/optimizing
          // This avoids the massive CPU overhead of parsing, optimizing, and re-stringifying 
          // thousands of snapshots during export.
          // We assume data in DB is already optimized during save (createSnapshot).
          
          let gameStateStr = 'null';
          if (s.gameState) {
              // Ensure it's treated as a raw JSON object in the output, not a string
              // s.gameState is already a JSON string from DB. 
              // We append it directly to avoid double-encoding overhead.
              gameStateStr = s.gameState;
          }

          // Manually construct the JSON object string to avoid JSON.stringify(s) 
          // which would escape s.gameState if it were a string property.
          // We want: { "id": 1, ..., "gameState": { ... } }
          
          const jsonItem = `{"id":${s.id},"saveSlotId":${s.saveSlotId},"chatId":${s.chatId},"createdAt":${s.createdAt},"gameState":${gameStateStr}}`;
          
          jsonParts.push(jsonItem);
          
          if (processedCount < snapshotsCount - 1) {
              jsonParts.push(',');
          }
          processedCount++;
      }
      
      // Optional: Report progress (every 50 items)
      if (processedCount % 50 === 0) {
          console.log(`[Export] Progress: ${processedCount}/${snapshotsCount}`);
      }
  }
  
  jsonParts.push(']}');
  
  console.log(`[Export] Completed. Total snapshots: ${processedCount}`);

  // Create Blob directly in Worker
  return new Blob(jsonParts, { type: 'application/json' });
}

/**
 * Helper to strip a large JSON array section from ArrayBuffer
 * Returns a new ArrayBuffer (or the same one modified if we want to be destructive, but better safe)
 * Replaces the content of the array with spaces: "key": [ ... ] -> "key": [     ]
 * @param keepLast If > 0, keeps the last N items and strips the rest.
 */
function stripJsonSection(buffer: ArrayBuffer, keyName: string, keepLast: number = 0): ArrayBuffer {
    const uint8 = new Uint8Array(buffer);
    const keyBytes = new TextEncoder().encode(`"${keyName}"`);
    
    let depth = 0;
    let inString = false;
    let escaped = false;
    let cursor = 0;
    let keyFoundAt = -1;
    
    // 1. Find the key at root level (depth 1)
    while (cursor < uint8.length) {
        const byte = uint8[cursor]!;
        if (inString) {
            if (escaped) escaped = false;
            else {
                if (byte === 92) escaped = true;
                else if (byte === 34) inString = false;
            }
        } else {
            if (byte === 123) depth++;
            else if (byte === 125) depth--;
            else if (byte === 34) {
                inString = true;
                if (depth === 1) {
                    let match = true;
                    if (cursor + keyBytes.length > uint8.length) match = false;
                    else {
                         for (let i = 0; i < keyBytes.length; i++) {
                             if (uint8[cursor + i]! !== keyBytes[i]) {
                                 match = false;
                                 break;
                             }
                         }
                    }
                    
                    if (match) {
                        let checkCursor = cursor + keyBytes.length;
                        while (checkCursor < uint8.length && uint8[checkCursor]! <= 32) checkCursor++;
                        if (checkCursor < uint8.length && uint8[checkCursor]! === 58) {
                            keyFoundAt = checkCursor + 1;
                            cursor = checkCursor;
                        }
                    }
                }
            }
        }
        if (keyFoundAt !== -1) break;
        cursor++;
    }
    
    if (keyFoundAt === -1) {
        console.warn(`[Import] Key "${keyName}" not found at root level.`);
        return buffer;
    }

    // 2. Find start of array value
    cursor = keyFoundAt;
    let startBracket = -1;
    while (cursor < uint8.length) {
        const byte = uint8[cursor]!;
        if (byte === 91) {
            startBracket = cursor;
            break;
        } else if (byte > 32) {
             console.warn(`[Import] Value for "${keyName}" is not an array.`);
             return buffer;
        }
        cursor++;
    }
    
    if (startBracket === -1) return buffer;
    
    // 3. Find end of array and collect comma positions
    depth = 1;
    inString = false;
    escaped = false;
    cursor = startBracket + 1;
    
    const commaPositions: number[] = [];
    
    while (cursor < uint8.length && depth > 0) {
        const byte = uint8[cursor]!;
        if (inString) {
            if (escaped) escaped = false;
            else {
                if (byte === 92) escaped = true;
                else if (byte === 34) inString = false;
            }
        } else {
            if (byte === 34) inString = true;
            else if (byte === 91) depth++;
            else if (byte === 93) depth--;
            else if (byte === 123) depth++;
            else if (byte === 125) depth--;
            else if (byte === 44 && depth === 1) {
                commaPositions.push(cursor);
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
    
    // 4. Calculate strip position
    if (keepLast > 0) {
        let hasContent = false;
        for (let k = startBracket + 1; k < endBracket; k++) {
            if (uint8[k]! > 32) { hasContent = true; break; }
        }
        
        const totalItems = hasContent ? commaPositions.length + 1 : 0;
        
        if (totalItems > keepLast) {
             const commaIndex = (totalItems - keepLast) - 1;
             if (commaIndex >= 0 && commaIndex < commaPositions.length) {
                 stripEnd = commaPositions[commaIndex]! + 1;
             }
        } else {
            return buffer;
        }
    }
    
    // 5. Fill with spaces
    for (let k = startBracket + 1; k < stripEnd; k++) {
        uint8[k] = 32;
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
    // const exec = (sql: string, bind: any[] = []) => 
    //    db.exec({ sql, bind, returnValue: 'resultRows', rowMode: 'object' });

    // 0. Import Static Data (Pre-requisite for snapshots)
    if (Array.isArray(data.staticData)) {
        console.log('[Import] Importing static data...', data.staticData.length);
        const stmt = db.prepare('INSERT OR IGNORE INTO static_data (id, type, content) VALUES (?, ?, ?)');
        try {
            for (const item of data.staticData) {
                stmt.bind([item.id, item.type, item.content]);
                stmt.step();
                stmt.reset();
            }
        } finally {
            stmt.finalize();
        }
    }

    // NEW: Optimize snapshots INSIDE transaction (or before? No, references must exist first if we want to validte, 
    // but optimizeGameState inserts into static_data if missing.
    // However, since we just imported static_data, optimizeGameState will see them if they exist?
    // Actually optimizeGameState calculates hash and inserts if not exists.
    // So if we imported static_data, optimizeGameState will generate same hash and IGNORE insert.
    // BUT we need to process snapshots to ensure they are optimized (if importing old full save)
    // OR if importing new optimized save, they are already refs.
    
    // We can do this optimization loop here, but since it involves DB writes (inserting static_data), 
    // it's better to do it. But wait, optimizeGameState is async because of SHA1?
    // Yes, sha1 is async. We cannot call async function inside db.transaction callback if we want to be safe?
    // Actually sqlite3-wasm transaction is synchronous. We cannot await inside it.
    // So we must move snapshot optimization OUTSIDE the transaction or use synchronous SHA1.
    // Our sha1 implementation checks crypto.subtle (async) or fallback (sync-ish but blocking).
    // Let's keep snapshot optimization OUTSIDE transaction as before.
  });
  
  // Optimize snapshots before transaction to save space in DB
  // This is async, so we do it outside transaction
  if (data.snapshots.length > 0) {
      console.log('[Import] Optimizing snapshots for storage...');
      for (const snap of data.snapshots) {
         try {
             let state = snap.gameState;
             if (typeof state === 'string') state = JSON.parse(state);
             
             // Optimize (extract static data)
             // Note: If we just imported staticData, this function will re-hash and try to insert.
             // INSERT OR IGNORE handles duplicates efficiently.
             state = await optimizeGameState(state);
             
             snap.gameState = JSON.stringify(state);
         } catch (e) {
             console.warn('Snapshot pre-optimization failed', e);
         }
      }
      console.log('[Import] Snapshots optimized.');
  }

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
    const facilityIdMap = new Map<number, number>();
    if (Array.isArray(data.facilities)) {
        // Helper for stringifying
        const ensureString = (val: any) => (typeof val === 'object' && val !== null) ? JSON.stringify(val) : (val || '[]');

        for (const fac of data.facilities) {
            const fields = ['saveSlotId', 'name', 'location', 'description', 'status', 'sub_locations', 'staff', 'is_player_owned', 'created_at', 'updated_at'];
            const placeholders = fields.map(() => '?').join(', ');
            
            const values = [
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
            
            const newFacId = exec('SELECT last_insert_rowid() as id')[0].id;
            facilityIdMap.set(fac.id, newFacId);
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
