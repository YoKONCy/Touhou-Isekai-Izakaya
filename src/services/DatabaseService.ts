import DbWorker from '@/worker/db.worker.ts?worker';

interface WorkerMessage {
  id: string;
  type: string;
  result?: any;
  error?: string;
}

export interface Facility {
  id: string;
  saveSlotId: number;
  name: string;
  location?: string;
  description?: string;
  status?: string;
  sub_locations?: any[];
  staff?: string[];
  is_player_owned?: boolean;
  created_at?: number;
  updated_at?: number;
}

export class DatabaseService {
  private worker: Worker;
  private pendingRequests: Map<string, { resolve: (val: any) => void, reject: (err: any) => void }>;

  constructor() {
    this.worker = new DbWorker();
    this.pendingRequests = new Map();

    this.worker.onmessage = (e: MessageEvent<WorkerMessage>) => {
      const { id, result, error } = e.data;
      const request = this.pendingRequests.get(id);

      if (request) {
        if (error) {
          request.reject(new Error(error));
        } else {
          request.resolve(result);
        }
        this.pendingRequests.delete(id);
      }
    };

    this.worker.onerror = (err) => {
      console.error('Database Worker Error:', err);
    };
  }

  private generateId(): string {
    return Math.random().toString(36).substring(2, 15);
  }

  public async init(): Promise<void> {
    await this.exec('SELECT 1');
    console.log('[DatabaseService] Worker initialized and ready.');
  }

  public async getDbInfo(): Promise<{ type: string; sqliteVersion?: string; diagnostics?: any }> {
    return new Promise((resolve, reject) => {
        const id = this.generateId();
        this.pendingRequests.set(id, { resolve, reject });
        
        this.worker.postMessage({
            id,
            type: 'GET_DB_INFO',
            payload: {}
        });
    });
  }

  public exec<T = any>(sql: string, bind?: any[]): Promise<T[]> {
    return new Promise((resolve, reject) => {
      const id = this.generateId();
      this.pendingRequests.set(id, { resolve, reject });
      
      this.worker.postMessage({
        id,
        type: 'EXEC',
        payload: { sql, bind }
      });
    });
  }

  public batchInsert(table: string, rows: any[]): Promise<number> {
    return new Promise((resolve, reject) => {
      const id = this.generateId();
      this.pendingRequests.set(id, { resolve, reject });
      
      this.worker.postMessage({
        id,
        type: 'BATCH_INSERT',
        payload: { table, rows }
      });
    });
  }
  
  // =================================================================
  //  Data Access Methods (DAL) - Replacing Dexie Operations
  // =================================================================

  // --- Save Slots ---
  
  async getSaveSlots(): Promise<any[]> {
    return this.exec('SELECT * FROM save_slots ORDER BY lastPlayed DESC');
  }

  async createSaveSlot(name: string, summary: string = '新游戏', location: string = '未知'): Promise<number> {
    const now = Date.now();
    await this.exec(
      'INSERT INTO save_slots (name, summary, lastPlayed, location, playTime) VALUES (?, ?, ?, ?, ?)',
      [name, summary, now, location, 0]
    );
    // Get the ID of the last inserted row
    const res = await this.exec('SELECT last_insert_rowid() as id');
    return res[0].id;
  }

  async updateSaveSlot(id: number, data: Partial<any>): Promise<void> {
    const fields = Object.keys(data).map(k => `${k} = ?`).join(', ');
    const values = Object.values(data);
    if (fields.length === 0) return;
    
    await this.exec(
      `UPDATE save_slots SET ${fields} WHERE id = ?`,
      [...values, id]
    );
  }

  async deleteSaveSlot(id: number): Promise<void> {
    // ON DELETE CASCADE is enabled in schema, so this deletes related chats, memories, snapshots
    await this.exec('DELETE FROM save_slots WHERE id = ?', [id]);
  }

  // --- Chats ---

  async getChatHistory(saveSlotId: number, limit: number = 50, offset: number = 0): Promise<any[]> {
    // Note: We might need to reverse the order in UI or SQL depending on requirement
    return this.exec(
      'SELECT * FROM chats WHERE saveSlotId = ? ORDER BY timestamp ASC LIMIT ? OFFSET ?',
      [saveSlotId, limit, offset]
    );
  }
  
  async addChatMessage(saveSlotId: number, msg: any): Promise<number> {
    await this.exec(
      'INSERT INTO chats (saveSlotId, role, content, thought_content, illustrationUrl, illustrationPrompt, debugLog, timestamp, turnCount, snapshotId) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        saveSlotId, 
        msg.role, 
        msg.content, 
        msg.thought_content || null,
        msg.illustrationUrl || null,
        msg.illustrationPrompt || null,
        JSON.stringify(msg.debugLog || {}), 
        msg.timestamp || Date.now(), 
        msg.turnCount || 0,
        msg.snapshotId || null
      ]
    );
    const res = await this.exec('SELECT last_insert_rowid() as id');
    return res[0].id;
  }
  
  async deleteChatMessagesBySnapshotIds(snapshotIds: number[]): Promise<void> {
    if (snapshotIds.length === 0) return;
    const placeholders = snapshotIds.map(() => '?').join(',');
    // Also delete the snapshot itself?
    // Usually we delete snapshot -> chat references it.
    // Or we delete chat -> snapshot is deleted?
    // Logic in ChatStore: "Delete snapshots referenced by these messages"
    await this.exec(`DELETE FROM snapshots WHERE id IN (${placeholders})`, snapshotIds);
  }

  // --- Snapshots ---
  
  async getSnapshot(id: number): Promise<any | null> {
    const res = await this.exec('SELECT * FROM snapshots WHERE id = ?', [id]);
    return res[0] || null;
  }
  
  async createSnapshot(saveSlotId: number, chatId: number, gameState: any): Promise<number> {
    // gameState is object, we stringify it. BLOB compression can be added in Worker later.
    const stateStr = JSON.stringify(gameState);
    await this.exec(
      'INSERT INTO snapshots (saveSlotId, chatId, createdAt, gameState) VALUES (?, ?, ?, ?)',
      [saveSlotId, chatId, Date.now(), stateStr]
    );
    const res = await this.exec('SELECT last_insert_rowid() as id');
    return res[0].id;
  }

  async updateSnapshot(id: number, updates: any): Promise<void> {
    const fields = Object.keys(updates).map(k => `${k} = ?`).join(', ');
    const values = Object.values(updates);
    if (fields.length === 0) return;
    await this.exec(`UPDATE snapshots SET ${fields} WHERE id = ?`, [...values, id]);
  }
  
  async getLatestSnapshot(saveSlotId: number): Promise<any | null> {
    const res = await this.exec(
        'SELECT * FROM snapshots WHERE saveSlotId = ? ORDER BY id DESC LIMIT 1', 
        [saveSlotId]
    );
    return res[0] || null;
  }

  // --- Memory Relations ---
  
  async addMemoryRelation(sourceId: number, targetId: number, relType: string, strength: number = 1.0): Promise<void> {
    await this.exec(
      'INSERT OR IGNORE INTO memory_relations (source_id, target_id, rel_type, strength, created_at) VALUES (?, ?, ?, ?, ?)',
      [sourceId, targetId, relType, strength, Date.now()]
    );
  }

  async getMemoryRelations(memoryId: number): Promise<any[]> {
    return this.exec(
      'SELECT * FROM memory_relations WHERE source_id = ? OR target_id = ?',
      [memoryId, memoryId]
    );
  }

  async getAllMemoryRelations(saveSlotId: number): Promise<any[]> {
    // Join with memories to filter by saveSlotId
    return this.exec(
      `SELECT mr.* 
       FROM memory_relations mr
       JOIN memories m ON mr.source_id = m.id
       WHERE m.saveSlotId = ?`,
      [saveSlotId]
    );
  }

  // --- Import / Export ---

  async exportSave(saveSlotId: number): Promise<Blob> {
    return new Promise((resolve, reject) => {
        const id = this.generateId();
        this.pendingRequests.set(id, {
            resolve: (data: any) => {
                const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
                resolve(blob);
            },
            reject
        });
        
        this.worker.postMessage({
            id,
            type: 'EXPORT_SAVE',
            payload: { saveSlotId }
        });
    });
  }

  async importSave(fileContent: string): Promise<{ newSaveId: number }> {
    return new Promise((resolve, reject) => {
        const id = this.generateId();
        this.pendingRequests.set(id, { resolve, reject });
        
        this.worker.postMessage({
            id,
            type: 'IMPORT_SAVE',
            payload: { jsonContent: fileContent }
        });
    });
  }

  async exportGlobalData(): Promise<any> {
    return new Promise((resolve, reject) => {
        const id = this.generateId();
        this.pendingRequests.set(id, { resolve, reject });
        
        this.worker.postMessage({
            id,
            type: 'EXPORT_GLOBAL_DATA',
            payload: {}
        });
    });
  }

  async importGlobalData(gameData: any): Promise<void> {
    return new Promise((resolve, reject) => {
        const id = this.generateId();
        this.pendingRequests.set(id, { resolve, reject });
        
        this.worker.postMessage({
            id,
            type: 'IMPORT_GLOBAL_DATA',
            payload: { gameData }
        });
    });
  }

  async getSettings(): Promise<any | null> {
      const res = await this.exec('SELECT * FROM settings WHERE id = 1');
      if (res[0] && res[0].raw_data) {
          try {
              return JSON.parse(res[0].raw_data);
          } catch(e) {
              console.error('Failed to parse settings:', e);
          }
      }
      return null;
  }

  async saveSettings(settings: any): Promise<void> {
      const json = JSON.stringify(settings);
      const existing = await this.exec('SELECT id FROM settings WHERE id = 1');
      if (existing.length > 0) {
          await this.exec('UPDATE settings SET raw_data = ? WHERE id = 1', [json]);
      } else {
          await this.exec('INSERT INTO settings (id, raw_data) VALUES (1, ?)', [json]);
      }
  }

  // =================================================================
  //  Facility Registry Methods
  // =================================================================

  async getFacilities(saveSlotId: number): Promise<Facility[]> {
    const rows = await this.exec(
      'SELECT * FROM facilities WHERE saveSlotId = ? ORDER BY updated_at DESC',
      [saveSlotId]
    );
    return rows.map(row => ({
      ...row,
      sub_locations: row.sub_locations ? JSON.parse(row.sub_locations) : [],
      staff: row.staff ? JSON.parse(row.staff) : [],
      is_player_owned: Boolean(row.is_player_owned)
    }));
  }

  async getFacilityByName(saveSlotId: number, name: string): Promise<Facility | undefined> {
    const rows = await this.exec(
      'SELECT * FROM facilities WHERE saveSlotId = ? AND name = ? LIMIT 1',
      [saveSlotId, name]
    );
    if (rows.length === 0) return undefined;
    const row = rows[0];
    return {
      ...row,
      sub_locations: row.sub_locations ? JSON.parse(row.sub_locations) : [],
      staff: row.staff ? JSON.parse(row.staff) : [],
      is_player_owned: Boolean(row.is_player_owned)
    };
  }

  async upsertFacility(facility: Facility): Promise<void> {
    const now = Date.now();
    const existing = await this.exec('SELECT id FROM facilities WHERE id = ?', [facility.id]);
    
    if (existing.length > 0) {
      // Update
      await this.exec(
        `UPDATE facilities SET 
          name = ?, location = ?, description = ?, status = ?, 
          sub_locations = ?, staff = ?, is_player_owned = ?, updated_at = ?
         WHERE id = ?`,
        [
          facility.name,
          facility.location || '',
          facility.description || '',
          facility.status || '正常',
          JSON.stringify(facility.sub_locations || []),
          JSON.stringify(facility.staff || []),
          facility.is_player_owned ? 1 : 0,
          now,
          facility.id
        ]
      );
    } else {
      // Insert
      await this.exec(
        `INSERT INTO facilities (
          id, saveSlotId, name, location, description, status, 
          sub_locations, staff, is_player_owned, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          facility.id,
          facility.saveSlotId,
          facility.name,
          facility.location || '',
          facility.description || '',
          facility.status || '正常',
          JSON.stringify(facility.sub_locations || []),
          JSON.stringify(facility.staff || []),
          facility.is_player_owned ? 1 : 0,
          facility.created_at || now,
          now
        ]
      );
    }
  }

  // =================================================================
  //  Memory Related Methods
  // =================================================================

  async addMemory(memory: any): Promise<number> {
    const fields = ['saveSlotId', 'turnCount', 'type', 'content', 'tags', 'related_entities', 'importance', 'createdAt', 'gameDate', 'gameTime', 'location', 'characters'];
    const placeholders = fields.map(() => '?').join(', ');
    const values = [
      memory.saveSlotId,
      memory.turnCount,
      memory.type,
      memory.content,
      JSON.stringify(memory.tags || []),
      JSON.stringify(memory.related_entities || []),
      memory.importance || 0,
      memory.createdAt || Date.now(),
      memory.gameDate,
      memory.gameTime,
      memory.location,
      JSON.stringify(memory.characters || [])
    ];

    await this.exec(
      `INSERT INTO memories (${fields.join(', ')}) VALUES (${placeholders})`,
      values
    );
    const res = await this.exec('SELECT last_insert_rowid() as id');
    return res[0].id;
  }

  async deleteMemories(saveSlotId: number, type: string, turnCount: number): Promise<void> {
    await this.exec(
      'DELETE FROM memories WHERE saveSlotId = ? AND type = ? AND turnCount = ?',
      [saveSlotId, type, turnCount]
    );
  }

  async getMemoriesByType(saveSlotId: number, type: string, limit: number = 20): Promise<any[]> {
    const rows = await this.exec(
      'SELECT * FROM memories WHERE saveSlotId = ? AND type = ? ORDER BY id DESC LIMIT ?',
      [saveSlotId, type, limit]
    );
    // Parse JSON fields
    return rows.map(this.parseMemoryRow);
  }

  async getAllMemoriesByType(saveSlotId: number, type: string): Promise<any[]> {
    const rows = await this.exec(
      'SELECT * FROM memories WHERE saveSlotId = ? AND type = ? ORDER BY id DESC',
      [saveSlotId, type]
    );
    return rows.map(this.parseMemoryRow);
  }

  async getAllMemories(saveSlotId: number): Promise<any[]> {
    const rows = await this.exec(
      'SELECT * FROM memories WHERE saveSlotId = ? ORDER BY id DESC',
      [saveSlotId]
    );
    return rows.map(this.parseMemoryRow);
  }

  async getAllMemoriesAcrossSlots(): Promise<any[]> {
    const rows = await this.exec('SELECT * FROM memories ORDER BY id DESC');
    return rows.map(this.parseMemoryRow);
  }

  async getMemoriesByIds(ids: number[]): Promise<any[]> {
    if (ids.length === 0) return [];
    const placeholders = ids.map(() => '?').join(',');
    const rows = await this.exec(
      `SELECT * FROM memories WHERE id IN (${placeholders})`,
      ids
    );
    return rows.map(this.parseMemoryRow);
  }

  async updateMemory(id: number, updates: any): Promise<void> {
    const fields = [];
    const values = [];
    const directFields = ['type', 'content', 'importance', 'gameDate', 'gameTime', 'location'];
    const jsonFields = ['tags', 'related_entities', 'characters'];

    for (const key of Object.keys(updates)) {
        if (directFields.includes(key)) {
            fields.push(`${key} = ?`);
            values.push(updates[key]);
        } else if (jsonFields.includes(key)) {
            fields.push(`${key} = ?`);
            values.push(JSON.stringify(updates[key]));
        }
    }

    if (fields.length === 0) return;

    await this.exec(
        `UPDATE memories SET ${fields.join(', ')} WHERE id = ?`,
        [...values, id]
    );
  }

  async deleteMemory(id: number): Promise<void> {
    await this.exec('DELETE FROM memories WHERE id = ?', [id]);
  }


  async searchMemories(saveSlotId: number, keywords: string[]): Promise<any[]> {
    // Simple implementation: Fetch all and filter in JS if FTS is complex to bridge.
    // However, we have FTS5. Let's try to use it if possible.
    // But FTS5 queries are global. We need to filter by saveSlotId too.
    // JOINing virtual table with standard table:
    // SELECT m.* FROM memories m JOIN memories_fts f ON m.id = f.rowid WHERE m.saveSlotId = ? AND f.memories_fts MATCH ?
    
    // Construct FTS query: "tag OR content OR ..."
    // For now, to ensure 100% compatibility with the previous "split keyword" logic which was permissive (OR),
    // let's fetch all relevant memories (e.g. summaries) and filter in JS, OR implement a LIKE-based search.
    // Given the potentially large number of memories, FTS is better.
    // But "memories" table might not be that huge per save.
    // Let's stick to providing a helper to get all summaries for now, 
    // as the `retrieve` method in memory.ts does explicit filtering.
    
    // Actually, let's provide a SEARCH method that does a LIKE query for each keyword.
    if (keywords.length === 0) return [];
    
    const conditions = keywords.map(() => `(content LIKE ? OR tags LIKE ? OR related_entities LIKE ?)`).join(' OR ');
    const params: any[] = [];
    keywords.forEach(k => {
        const pattern = `%${k}%`;
        params.push(pattern, pattern, pattern);
    });

    const sql = `SELECT * FROM memories WHERE saveSlotId = ? AND (${conditions})`;
    const rows = await this.exec(sql, [saveSlotId, ...params]);
    return rows.map(this.parseMemoryRow);
  }
  
  private parseMemoryRow(row: any) {
    try {
        if (typeof row.tags === 'string') row.tags = JSON.parse(row.tags);
        if (typeof row.related_entities === 'string') row.related_entities = JSON.parse(row.related_entities);
        if (typeof row.characters === 'string') row.characters = JSON.parse(row.characters);
    } catch (e) {
        // ignore parse error
    }
    return row;
  }

  // --- Chat Helpers for Memory ---

  async getChat(id: number): Promise<any | null> {
    const res = await this.exec('SELECT * FROM chats WHERE id = ?', [id]);
    if (res[0]) {
        if (typeof res[0].debugLog === 'string') {
            try { res[0].debugLog = JSON.parse(res[0].debugLog); } catch(e) {}
        }
    }
    return res[0] || null;
  }

  async getPrecedingUserMessage(chatId: number, saveSlotId: number): Promise<any | null> {
    // Get the message with id < chatId AND role='user' AND saveSlotId = ... ORDER BY id DESC LIMIT 1
    const res = await this.exec(
        'SELECT * FROM chats WHERE id < ? AND saveSlotId = ? AND role = ? ORDER BY id DESC LIMIT 1',
        [chatId, saveSlotId, 'user']
    );
    if (res[0]) {
         if (typeof res[0].debugLog === 'string') {
            try { res[0].debugLog = JSON.parse(res[0].debugLog); } catch(e) {}
        }
    }
    return res[0] || null;
  }

  async getLastChatWithSnapshot(saveSlotId: number): Promise<any | null> {
    const res = await this.exec(
        'SELECT * FROM chats WHERE saveSlotId = ? AND snapshotId IS NOT NULL AND snapshotId != 0 ORDER BY id DESC LIMIT 1',
        [saveSlotId]
    );
    return res[0] || null;
  }

  // =================================================================
  //  Character Methods
  // =================================================================

  async getAllCharacters(): Promise<any[]> {
    const rows = await this.exec('SELECT * FROM characters');
    return rows.map(row => {
        try {
            if (typeof row.tags === 'string') row.tags = JSON.parse(row.tags);
            if (typeof row.stats === 'string') {
                const stats = JSON.parse(row.stats);
                // Transparently map stats fields to top level
                return { ...row, ...stats };
            }
        } catch (e) { /* ignore */ }
        return row;
    });
  }

  async clearCharacters(): Promise<void> {
    await this.exec('DELETE FROM characters');
  }

  async addCharacter(char: any): Promise<number> {
    const fields = ['uuid', 'name', 'type', 'category', 'tags', 'description', 'avatarUrl', 'referenceImageUrl', 'personality', 'stats'];
    const placeholders = fields.map(() => '?').join(', ');
    
    // Extract stats fields
    const coreFields = ['uuid', 'name', 'type', 'category', 'tags', 'description', 'avatarUrl', 'referenceImageUrl', 'personality', 'id'];
    const stats: any = {};
    for (const key of Object.keys(char)) {
        if (!coreFields.includes(key)) {
            stats[key] = char[key];
        }
    }

    const values = [
        char.uuid,
        char.name,
        char.type || 'character',
        char.category,
        JSON.stringify(char.tags || []),
        char.description,
        char.avatarUrl,
        char.referenceImageUrl,
        char.personality,
        JSON.stringify(stats)
    ];

    await this.exec(
        `INSERT OR IGNORE INTO characters (${fields.join(', ')}) VALUES (${placeholders})`,
        values
    );
    const res = await this.exec('SELECT last_insert_rowid() as id');
    return res[0].id;
  }

  async updateCharacter(id: number, updates: any): Promise<void> {
    const fields = [];
    const values = [];

    // Map common fields
    const directFields = ['uuid', 'name', 'type', 'category', 'description', 'avatarUrl', 'referenceImageUrl', 'personality'];
    const jsonFields = ['tags'];

    // We need to handle 'stats' specially. 
    // Since we don't have the existing stats here, we might need to fetch them first or do a partial update in SQL if possible.
    // However, for Lorebook, overwriting the whole stats object is usually fine as the UI sends the full object.
    
    const stats: any = {};
    const coreFields = [...directFields, ...jsonFields, 'id', 'stats'];
    
    for (const key of Object.keys(updates)) {
        if (directFields.includes(key)) {
            fields.push(`${key} = ?`);
            values.push(updates[key]);
        } else if (jsonFields.includes(key)) {
            fields.push(`${key} = ?`);
            values.push(JSON.stringify(updates[key]));
        } else if (!coreFields.includes(key)) {
            // It's a stat field
            stats[key] = updates[key];
        }
    }

    // If stats were updated, we need to merge them with existing or just overwrite
    // The safest way is to fetch existing first, but for now let's see if we can just append to fields
    if (Object.keys(stats).length > 0 || updates.stats) {
        // Fetch existing stats to merge
        const existing = await this.exec('SELECT stats FROM characters WHERE id = ?', [id]);
        let finalStats = {};
        if (existing.length > 0 && existing[0].stats) {
            try {
                finalStats = JSON.parse(existing[0].stats);
            } catch (e) { /* ignore */ }
        }
        
        const mergedStats = { ...finalStats, ...(updates.stats || {}), ...stats };
        fields.push('stats = ?');
        values.push(JSON.stringify(mergedStats));
    }

    if (fields.length === 0) return;

    await this.exec(
        `UPDATE characters SET ${fields.join(', ')} WHERE id = ?`,
        [...values, id]
    );
  }

  async deleteCharacter(id: number): Promise<void> {
    await this.exec('DELETE FROM characters WHERE id = ?', [id]);
  }


}


export const dbService = new DatabaseService();
