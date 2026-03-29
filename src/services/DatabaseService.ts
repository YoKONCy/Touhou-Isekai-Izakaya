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
  private pendingRequests: Map<string, { resolve: (val: any) => void; reject: (err: any) => void }>;

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

  /**
   * 辅助方法：在将数据发送至 Worker 前执行序列化清理。
   * 此操作旨在剥离 Vue 的响应式代理 (Proxies)，并确保对象满足 postMessage 的结构化克隆要求。
   */
  private sanitize<T>(data: T): T {
    if (data === undefined || data === null) return data;
    try {
      return JSON.parse(JSON.stringify(data));
    } catch (e) {
      console.error('Failed to sanitize data:', e);
      return data;
    }
  }

  public async init(): Promise<void> {
    await this.exec('SELECT 1');
    console.log('[数据库服务] Worker 已初始化就绪。');
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
        payload: {
          sql,
          bind: this.sanitize(bind)
        }
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
        payload: {
          table,
          rows: this.sanitize(rows)
        }
      });
    });
  }

  // =================================================================
  //  数据访问层 (DAL) - 替换原有的 Dexie 操作集 (IndexedDB -> SQLite)
  // =================================================================

  // --- 存档槽位管理 (Save Slots) ---

  async getSaveSlots(): Promise<any[]> {
    const rows = await this.exec('SELECT * FROM save_slots ORDER BY lastPlayed DESC');
    return rows.map((row) => ({
      ...row,
      isMultiplayer: Boolean(row.isMultiplayer)
    }));
  }

  async createSaveSlot(
    name: string,
    summary: string = '新游戏',
    location: string = '未知',
    isMultiplayer: boolean = false
  ): Promise<number> {
    const now = Date.now();
    await this.exec(
      'INSERT INTO save_slots (name, summary, lastPlayed, location, playTime, isMultiplayer) VALUES (?, ?, ?, ?, ?, ?)',
      [name, summary, now, location, 0, isMultiplayer ? 1 : 0]
    );
    // 获取最后一次插入操作生成的物理 RowID
    const res = await this.exec('SELECT last_insert_rowid() as id');
    return res[0].id;
  }

  async updateSaveSlot(id: number, data: Partial<any>): Promise<void> {
    const fields = Object.keys(data)
      .map((k) => `${k} = ?`)
      .join(', ');
    const values = Object.values(data);
    if (fields.length === 0) return;

    await this.exec(`UPDATE save_slots SET ${fields} WHERE id = ?`, [...values, id]);
  }

  async deleteSaveSlot(id: number): Promise<void> {
    // 级联处理：由于 Schema 已启用 ON DELETE CASCADE，此操作将同步清理相关的聊天、记忆与快照。
    await this.exec('DELETE FROM save_slots WHERE id = ?', [id]);
  }

  // --- 聊天记录管理 (Chats) ---

  async getChatHistory(saveSlotId: number, limit: number = 50, offset: number = 0): Promise<any[]> {
    // 注意：后续可根据 UI 展示需求或 SQL 性能优化目标调整排序方向。
    return this.exec(
      'SELECT * FROM chats WHERE saveSlotId = ? ORDER BY timestamp ASC LIMIT ? OFFSET ?',
      [saveSlotId, limit, offset]
    );
  }

  async getAllChatHistory(saveSlotId: number): Promise<any[]> {
    return this.exec('SELECT * FROM chats WHERE saveSlotId = ? ORDER BY timestamp ASC', [
      saveSlotId
    ]);
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
    // 逻辑考量：是否需要同步销毁快照文件？
    // 当前逻辑采用由 ChatStore 触发的“清理这些消息引用的快照记录”方案。
    await this.exec(`DELETE FROM snapshots WHERE id IN (${placeholders})`, snapshotIds);
  }

  // --- 状态快照管理 (Snapshots) ---

  async getSnapshot(id: number): Promise<any | null> {
    return new Promise((resolve, reject) => {
      const reqId = this.generateId();
      this.pendingRequests.set(reqId, { resolve, reject });

      this.worker.postMessage({
        id: reqId,
        type: 'GET_SNAPSHOT_RESTORED',
        payload: { id }
      });
    });
  }

  async createSnapshot(saveSlotId: number, chatId: number, gameState: any): Promise<number> {
    return new Promise((resolve, reject) => {
      const id = this.generateId();
      this.pendingRequests.set(id, { resolve, reject });

      this.worker.postMessage({
        id,
        type: 'OPTIMIZE_AND_CREATE_SNAPSHOT',
        payload: {
          saveSlotId,
          chatId,
          gameState: this.sanitize(gameState)
        }
      });
    }).then((res: any) => res.id);
  }

  async updateSnapshot(id: number, updates: any): Promise<void> {
    const fields = Object.keys(updates)
      .map((k) => `${k} = ?`)
      .join(', ');
    const values = Object.values(updates);
    if (fields.length === 0) return;
    await this.exec(`UPDATE snapshots SET ${fields} WHERE id = ?`, [...values, id]);
  }

  async getLatestSnapshot(saveSlotId: number): Promise<any | null> {
    return new Promise((resolve, reject) => {
      const id = this.generateId();
      this.pendingRequests.set(id, { resolve, reject });

      this.worker.postMessage({
        id,
        type: 'GET_LATEST_SNAPSHOT',
        payload: { saveSlotId }
      });
    });
  }

  // --- 记忆关联图谱 (Memory Relations) ---

  async addMemoryRelation(
    sourceId: number,
    targetId: number,
    relType: string,
    strength: number = 1.0
  ): Promise<void> {
    await this.exec(
      'INSERT OR IGNORE INTO memory_relations (source_id, target_id, rel_type, strength, created_at) VALUES (?, ?, ?, ?, ?)',
      [sourceId, targetId, relType, strength, Date.now()]
    );
  }

  async getMemoryRelations(memoryId: number): Promise<any[]> {
    return this.exec('SELECT * FROM memory_relations WHERE source_id = ? OR target_id = ?', [
      memoryId,
      memoryId
    ]);
  }

  async getAllMemoryRelations(saveSlotId: number): Promise<any[]> {
    // 联表查询：通过 memories 表进行存档槽位 (saveSlotId) 过滤。
    return this.exec(
      `SELECT mr.* 
       FROM memory_relations mr
       JOIN memories m ON mr.source_id = m.id
       WHERE m.saveSlotId = ?`,
      [saveSlotId]
    );
  }

  // --- 存档导入/导出 (Import / Export) ---

  async exportSave(saveSlotId: number): Promise<Blob> {
    return new Promise((resolve, reject) => {
      const id = this.generateId();
      this.pendingRequests.set(id, {
        resolve: (data: any) => {
          // 通讯协议升级：Worker 现已改为直接返回 Blob 对象。
          if (data instanceof Blob) {
            resolve(data);
          } else {
            console.error('Unexpected data format from worker export', data);
            // 容错回退：兼容旧版数据格式（尽管 Worker 已完成升级）。
            try {
              const json = JSON.stringify(data);
              resolve(new Blob([json], { type: 'application/json' }));
            } catch (e) {
              reject(new Error('Failed to process export data: ' + e));
            }
          }
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

  async importSave(fileContent: ArrayBuffer): Promise<{ newSaveId: number }> {
    return new Promise((resolve, reject) => {
      const id = this.generateId();
      this.pendingRequests.set(id, { resolve, reject });

      this.worker.postMessage(
        {
          id,
          type: 'IMPORT_SAVE',
          payload: { jsonContent: fileContent }
        },
        [fileContent]
      ); // 性能优化：通过所有权转移 (Transferable Object) 方式传递 ArrayBuffer
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
      } catch (e) {
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
  //  设施注册表管理方法 (Facility Registry)
  // =================================================================

  async getFacilities(saveSlotId: number): Promise<Facility[]> {
    const rows = await this.exec(
      'SELECT * FROM facilities WHERE saveSlotId = ? ORDER BY updated_at DESC',
      [saveSlotId]
    );
    return rows.map((row) => ({
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

  async deleteFacility(id: string): Promise<void> {
    await this.exec('DELETE FROM facilities WHERE id = ?', [id]);
  }

  // =================================================================
  //  记忆系统相关方法 (Memory System)
  // =================================================================

  async addMemory(memory: any): Promise<number> {
    const fields = [
      'saveSlotId',
      'turnCount',
      'type',
      'content',
      'tags',
      'related_entities',
      'importance',
      'createdAt',
      'gameDate',
      'gameTime',
      'location',
      'characters'
    ];
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

    await this.exec(`INSERT INTO memories (${fields.join(', ')}) VALUES (${placeholders})`, values);
    const res = await this.exec('SELECT last_insert_rowid() as id');
    return res[0].id;
  }

  async deleteMemories(saveSlotId: number, type: string, turnCount: number): Promise<void> {
    await this.exec('DELETE FROM memories WHERE saveSlotId = ? AND type = ? AND turnCount = ?', [
      saveSlotId,
      type,
      turnCount
    ]);
  }

  async getMemoriesByType(saveSlotId: number, type: string, limit: number = 20): Promise<any[]> {
    const rows = await this.exec(
      'SELECT * FROM memories WHERE saveSlotId = ? AND type = ? ORDER BY id DESC LIMIT ?',
      [saveSlotId, type, limit]
    );
    // 逆序列化解析 JSON 存储字段
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
    const rows = await this.exec('SELECT * FROM memories WHERE saveSlotId = ? ORDER BY id DESC', [
      saveSlotId
    ]);
    return rows.map(this.parseMemoryRow);
  }

  async getAllMemoriesAcrossSlots(): Promise<any[]> {
    const rows = await this.exec('SELECT * FROM memories ORDER BY id DESC');
    return rows.map(this.parseMemoryRow);
  }

  async getMemoriesByIds(ids: number[]): Promise<any[]> {
    if (ids.length === 0) return [];
    const placeholders = ids.map(() => '?').join(',');
    const rows = await this.exec(`SELECT * FROM memories WHERE id IN (${placeholders})`, ids);
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

    await this.exec(`UPDATE memories SET ${fields.join(', ')} WHERE id = ?`, [...values, id]);
  }

  async deleteMemory(id: number): Promise<void> {
    await this.exec('DELETE FROM memories WHERE id = ?', [id]);
  }

  async searchMemories(saveSlotId: number, keywords: string[]): Promise<any[]> {
    // 基础实现方案：由于 FTS5 全文搜索桥接较为复杂，当前优先采用 LIKE 模糊检索。
    // 技术预研：系统已集成 FTS5，后续应考虑启用虚拟表 (Virtual Table) 进行原生全文检索优化。
    // SELECT m.* FROM memories m JOIN memories_fts f ON m.id = f.rowid WHERE m.saveSlotId = ? AND f.memories_fts MATCH ?

    // 构造 FTS 查询语句: "标签 OR 内容 OR ..."
    // 目前为了确保与之前基于“拆分关键词”的宽泛（OR）逻辑 100% 兼容，
    // 我们先拉取所有相关的记忆（例如摘要）并在 JS 中过滤，或者执行基于 LIKE 的搜索。
    // 考虑到记忆数量可能很大，FTS（全文搜索）会是更好的选择。
    // 但对于每个存档来说，“memories”表可能并没那么庞大。
    // 暂时先提供一个获取所有摘要的辅助方法，
    // 因为 memory.ts 中的 retrieve（检索）方法会执行显式过滤。
    // 实际上，让我们提供一个对每个关键词执行 LIKE 查询的 SEARCH 方法。
    if (keywords.length === 0) return [];

    const conditions = keywords
      .map(() => `(content LIKE ? OR tags LIKE ? OR related_entities LIKE ?)`)
      .join(' OR ');
    const params: any[] = [];
    keywords.forEach((k) => {
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
      if (typeof row.related_entities === 'string')
        row.related_entities = JSON.parse(row.related_entities);
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
        try {
          res[0].debugLog = JSON.parse(res[0].debugLog);
        } catch (e) {}
      }
    }
    return res[0] || null;
  }

  async getPrecedingUserMessage(chatId: number, saveSlotId: number): Promise<any | null> {
    // 检索上下文：获取当前消息之前的最后一条用户输入 (Preceding User Prompt)
    const res = await this.exec(
      'SELECT * FROM chats WHERE id < ? AND saveSlotId = ? AND role = ? ORDER BY id DESC LIMIT 1',
      [chatId, saveSlotId, 'user']
    );
    if (res[0]) {
      if (typeof res[0].debugLog === 'string') {
        try {
          res[0].debugLog = JSON.parse(res[0].debugLog);
        } catch (e) {}
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
  //  角色设定库管理方法 (Character / Lorebook)
  // =================================================================

  async getAllCharacters(): Promise<any[]> {
    const rows = await this.exec('SELECT * FROM characters');
    return rows.map((row) => {
      try {
        if (typeof row.tags === 'string') row.tags = JSON.parse(row.tags);
        if (typeof row.stats === 'string') {
          const stats = JSON.parse(row.stats);
          // Transparently map stats fields to top level
          return { ...row, ...stats };
        }
      } catch (e) {
        /* ignore */
      }
      return row;
    });
  }

  async clearCharacters(): Promise<void> {
    await this.exec('DELETE FROM characters');
  }

  async addCharacter(char: any): Promise<number> {
    const fields = [
      'uuid',
      'name',
      'type',
      'category',
      'tags',
      'description',
      'avatarUrl',
      'referenceImageUrl',
      'personality',
      'stats'
    ];
    const placeholders = fields.map(() => '?').join(', ');

    // Extract stats fields
    const coreFields = [
      'uuid',
      'name',
      'type',
      'category',
      'tags',
      'description',
      'avatarUrl',
      'referenceImageUrl',
      'personality',
      'id'
    ];
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

    // 核心通用字段映射 (Direct Mapping)
    const directFields = [
      'uuid',
      'name',
      'type',
      'category',
      'description',
      'avatarUrl',
      'referenceImageUrl',
      'personality'
    ];
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
        } catch (e) {
          /* ignore */
        }
      }

      const mergedStats = { ...finalStats, ...(updates.stats || {}), ...stats };
      fields.push('stats = ?');
      values.push(JSON.stringify(mergedStats));
    }

    if (fields.length === 0) return;

    await this.exec(`UPDATE characters SET ${fields.join(', ')} WHERE id = ?`, [...values, id]);
  }

  async deleteCharacter(id: number): Promise<void> {
    await this.exec('DELETE FROM characters WHERE id = ?', [id]);
  }
}

export const dbService = new DatabaseService();
