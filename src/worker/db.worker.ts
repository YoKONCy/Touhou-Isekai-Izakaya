import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import { SCHEMA_SQL } from './schema';

let db: any = null;

const log = (...args: any[]) => console.log('[DB Worker]', ...args);
const error = (...args: any[]) => console.error('[DB Worker]', ...args);

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
    log('Running SQLite3 version', sqlite3.version.libVersion);
    
    // Diagnostic logging for OPFS requirements
    log('Diagnostic - isSecureContext:', self.isSecureContext);
    log('Diagnostic - SharedArrayBuffer:', !!(self as any).SharedArrayBuffer);
    log('Diagnostic - Atomics:', !!(self as any).Atomics);
    log('Diagnostic - FileSystemHandle:', !!(self as any).FileSystemHandle);
    log('Diagnostic - navigator.storage.getDirectory:', !!(navigator?.storage?.getDirectory));
    
    // Check for OPFS support
    if ('opfs' in sqlite3) {
      try {
        db = new sqlite3.oo1.OpfsDb('/touhou_isekai.sqlite3');
        log('OPFS Database opened successfully: /touhou_isekai.sqlite3');
        (self as any).dbType = 'opfs';
      } catch (e: any) {
        error('Failed to open OPFS database, falling back to transient in-memory DB:', e.message);
        db = new sqlite3.oo1.DB('/touhou_isekai_mem.sqlite3', 'ct');
        (self as any).dbType = 'memory-fallback';
      }
    } else {
      error('OPFS is not available, falling back to transient in-memory DB.');
      db = new sqlite3.oo1.DB('/touhou_isekai_mem.sqlite3', 'ct');
      (self as any).dbType = 'memory';
    }

    // Apply Schema
    log('Applying Schema...');
    db.transaction(() => {
        SCHEMA_SQL.forEach((sql, index) => {
            try {
                db.exec(sql);
            } catch (e: any) {
                error(`Schema Error at index ${index}:`, e.message, 'SQL:', sql);
                throw e;
            }
        });
    });
    log('Schema applied successfully.');
    
    // Run Migrations for existing databases
    runMigrations(db);
    
    return true;
  } catch (err: any) {
    error('Initialization failed:', err.name, err.message);
    throw err;
  }
});

function runMigrations(db: any) {
  log('Starting database migrations...');
  try {
    // Helper to check and add column if missing
    const ensureColumn = (tableName: string, colName: string, typeDef: string) => {
        const tableInfo = db.exec({
            sql: `PRAGMA table_info(${tableName})`,
            returnValue: 'resultRows',
            rowMode: 'object'
        });
        if (!tableInfo.some((col: any) => col.name === colName)) {
            log(`Migration: Adding "${colName}" column to "${tableName}" table...`);
            db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${colName} ${typeDef}`);
            log(`Migration: "${colName}" column added to "${tableName}" successfully.`);
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

    log('All database migrations completed.');
  } catch (e: any) {
    error('Migration failed:', e.message);
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
        result = importSaveWithCorrectOrder(db, payload.jsonContent);
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

function exportSave(db: any, saveSlotId: number) {
  const getRows = (sql: string, bind: any[] = []) => 
    db.exec({ sql, bind, returnValue: 'resultRows', rowMode: 'object' });

  const saveSlots = getRows('SELECT * FROM save_slots WHERE id = ?', [saveSlotId]);
  if (saveSlots.length === 0) throw new Error("Save not found");
  
  const chats = getRows('SELECT * FROM chats WHERE saveSlotId = ?', [saveSlotId]);
  const memories = getRows('SELECT * FROM memories WHERE saveSlotId = ?', [saveSlotId]);
  const snapshots = getRows('SELECT * FROM snapshots WHERE saveSlotId = ?', [saveSlotId]);
  const characters = getRows('SELECT * FROM characters'); // Global characters

  // Optimize snapshots
  const optimizedSnapshots = snapshots.map((s: any) => {
    try {
      if (s.gameState) {
        const stateObj = JSON.parse(s.gameState);
        if (stateObj.player) {
          let changed = false;
          if (stateObj.player.avatarUrl) {
            delete stateObj.player.avatarUrl;
            changed = true;
          }
          if (stateObj.player.referenceImageUrl) {
            delete stateObj.player.referenceImageUrl;
            changed = true;
          }
          if (changed) {
            s.gameState = JSON.stringify(stateObj);
          }
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
    saveSlot: { ...saveSlots[0], id: undefined },
    chats,
    memories,
    snapshots: optimizedSnapshots,
    characters
  };
}

function importSaveWithCorrectOrder(db: any, jsonContent: string) {
  const data = JSON.parse(jsonContent);
  if (!data.saveSlot || !Array.isArray(data.chats)) {
    throw new Error("Invalid save file format");
  }

  let newSaveId = 0;

  db.transaction(() => {
    const exec = (sql: string, bind: any[] = []) => 
        db.exec({ sql, bind, returnValue: 'resultRows', rowMode: 'object' });

    // 1. Create Save Slot
    exec(
      'INSERT INTO save_slots (name, summary, lastPlayed, location, playTime) VALUES (?, ?, ?, ?, ?)',
      [
        `${data.saveSlot.name} (导入)`,
        data.saveSlot.summary,
        Date.now(),
        data.saveSlot.location,
        data.saveSlot.playTime || 0
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
        }
    }
  });

  return { newSaveId };
}

// @ts-ignore
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function importGlobalData(db: any, gameData: any) {
  // Implementation for global data import if needed
  return true;
}
