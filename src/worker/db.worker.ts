import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import { SCHEMA_SQL } from './schema';

let db: any = null;

const log = (...args: any[]) => console.log('[DB Worker]', ...args);
const error = (...args: any[]) => console.error('[DB Worker]', ...args);

// Initialize SQLite
const initPromise = (sqlite3InitModule as any)({
  print: log,
  printErr: error,
}).then((sqlite3: any) => {
  try {
    log('Running SQLite3 version', sqlite3.version.libVersion);
    
    // Check for OPFS support
    if ('opfs' in sqlite3) {
      db = new sqlite3.oo1.OpfsDb('/touhou_isekai.sqlite3');
      log('OPFS Database opened successfully: /touhou_isekai.sqlite3');
      (self as any).dbType = 'opfs';
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
    
    return true;
  } catch (err: any) {
    error('Initialization failed:', err.name, err.message);
    throw err;
  }
});

self.onmessage = async (e: MessageEvent) => {
  const { id, type, payload } = e.data;
  
  try {
    await initPromise;
    
    let result;
    switch (type) {
      case 'EXEC':
        result = db.exec({
          sql: payload.sql,
          bind: payload.bind,
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
            sqliteVersion: (self as any).sqlite3?.version?.libVersion 
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
            const existing = exec('SELECT id FROM characters WHERE uuid = ?', [char.uuid]);
            
            // Remove id from char object for insertion
            const { id, ...charData } = char;
            const fields = Object.keys(charData);
            // Ensure values are primitives (stringify objects/arrays)
            const values = Object.values(charData).map(val => 
                (typeof val === 'object' && val !== null) ? JSON.stringify(val) : val
            );

            if (existing.length > 0) {
              // Update
              const setClause = fields.map(k => `${k} = ?`).join(', ');
              exec(`UPDATE characters SET ${setClause} WHERE uuid = ?`, [...values, char.uuid]);
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
        exec(
            'INSERT INTO chats (saveSlotId, role, content, debugLog, timestamp, turnCount, snapshotId) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [newSaveId, chat.role, chat.content, chat.debugLog, chat.timestamp, chat.turnCount, null]
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
         
         const newChatId = chatIdMap.get(snap.chatId) || 0; // Use 0 or null if not found (though should exist)

         exec(
            'INSERT INTO snapshots (saveSlotId, chatId, createdAt, gameState) VALUES (?, ?, ?, ?)',
            [newSaveId, newChatId, snap.createdAt, gameStateStr]
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
            const ensureString = (val: any) => (typeof val === 'object' && val !== null) ? JSON.stringify(val) : val;

            const values = [
              newSaveId,
              mem.turnCount,
              mem.type,
              mem.content,
              ensureString(mem.tags),
              ensureString(mem.related_entities),
              mem.importance,
              mem.createdAt,
              mem.gameDate,
              mem.gameTime,
              mem.location,
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
