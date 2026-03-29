export const SCHEMA_SQL = [
  // 1. 设置表 (应用全局配置 - Global App Settings)喵
  `CREATE TABLE IF NOT EXISTS settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    theme TEXT,
    openaiApiKey TEXT,
    openaiApiUrl TEXT,
    openaiModel TEXT,
    selectedModelId TEXT,
    customModelName TEXT,
    contextLimit INTEGER DEFAULT 10,
    autoSnapshotInterval INTEGER DEFAULT 5,
    userName TEXT,
    userPersona TEXT,
    -- 通过 JSON 字段或列扩展其他设置项喵
    raw_data TEXT -- 为了灵活性，部分字段以 JSON 形式存储喵
  );`,

  // 2. 存档位表 (游戏会话管理 - Game Sessions)喵
  `CREATE TABLE IF NOT EXISTS save_slots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    summary TEXT,
    lastPlayed INTEGER NOT NULL,
    location TEXT,
    gameDate TEXT,
    gameTime TEXT,
    playTime INTEGER DEFAULT 0,
    isMultiplayer BOOLEAN DEFAULT 0
  );`,

  // 3. 对话历史表 (剧情对白记录 - Dialogue History)喵
  `CREATE TABLE IF NOT EXISTS chats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    saveSlotId INTEGER NOT NULL,
    role TEXT NOT NULL, -- 'user' | 'assistant' | 'system'
    content TEXT,
    thought_content TEXT,
    illustrationUrl TEXT,
    illustrationPrompt TEXT,
    debugLog TEXT, -- JSON 字符串格式喵
    timestamp INTEGER NOT NULL,
    turnCount INTEGER NOT NULL,
    snapshotId INTEGER,
    FOREIGN KEY(saveSlotId) REFERENCES save_slots(id) ON DELETE CASCADE
  );`,
  `CREATE INDEX IF NOT EXISTS idx_chats_saveSlotId ON chats(saveSlotId);`,
  `CREATE INDEX IF NOT EXISTS idx_chats_timestamp ON chats(timestamp);`,

  // 4. 快照表 (游戏状态回溯历史 - Game State History)喵
  `CREATE TABLE IF NOT EXISTS snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    saveSlotId INTEGER NOT NULL,
    chatId INTEGER NOT NULL,
    createdAt INTEGER NOT NULL,
    gameState BLOB, -- 压缩后的 JSON 或普通 JSON 字符串喵
    FOREIGN KEY(saveSlotId) REFERENCES save_slots(id) ON DELETE CASCADE
  );`,
  `CREATE INDEX IF NOT EXISTS idx_snapshots_saveSlotId_chatId ON snapshots(saveSlotId, chatId);`,

  // 5. 记忆系统表 (RAG 向量/检索存储 - Search Store)喵
  // 利用 FTS5 虚拟表提升全文检索性能喵
  `CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
    content, 
    tags, 
    related_entities
  );`,

  `CREATE TABLE IF NOT EXISTS memories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    saveSlotId INTEGER NOT NULL,
    turnCount INTEGER,
    type TEXT, -- 'facility' | 'alliance' | 'intelligence' | 'event'
    content TEXT,
    tags TEXT, -- JSON 数组格式喵
    related_entities TEXT, -- JSON 数组格式喵
    importance INTEGER,
    createdAt INTEGER,
    gameDate TEXT,
    gameTime TEXT,
    location TEXT,
    characters TEXT, -- JSON 数组格式喵
    FOREIGN KEY(saveSlotId) REFERENCES save_slots(id) ON DELETE CASCADE
  );`,
  `CREATE INDEX IF NOT EXISTS idx_memories_saveSlotId ON memories(saveSlotId);`,
  `CREATE INDEX IF NOT EXISTS idx_memories_type ON memories(type);`,

  // 5.1 记忆关联图谱 (图数据库边关系 - Graph Edges)喵
  `CREATE TABLE IF NOT EXISTS memory_relations (
    source_id INTEGER NOT NULL,
    target_id INTEGER NOT NULL,
    rel_type TEXT NOT NULL, -- 'sequence', 'entity', 'causal', 'tag', 'reference'
    strength REAL DEFAULT 1.0,
    created_at INTEGER,
    PRIMARY KEY (source_id, target_id, rel_type),
    FOREIGN KEY(source_id) REFERENCES memories(id) ON DELETE CASCADE,
    FOREIGN KEY(target_id) REFERENCES memories(id) ON DELETE CASCADE
  );`,
  `CREATE INDEX IF NOT EXISTS idx_memory_relations_source ON memory_relations(source_id);`,
  `CREATE INDEX IF NOT EXISTS idx_memory_relations_target ON memory_relations(target_id);`,

  // 6. 静态属性表 (物品/食谱/任务的重复数据存储 - Deduplication Storage)喵
  `CREATE TABLE IF NOT EXISTS static_data (
    id TEXT PRIMARY KEY, -- 内容的哈希值喵 (Content Hash)
    type TEXT, -- 'item' | 'recipe' | 'quest'
    content TEXT -- 静态属性的 JSON 字符串喵
  );`,

  // FTS5 触发器：确保虚表与主表实时同步 (Keep FTS index in sync)喵
  `CREATE TRIGGER IF NOT EXISTS memories_ai AFTER INSERT ON memories BEGIN
    INSERT INTO memories_fts(rowid, content, tags, related_entities) 
    VALUES (new.id, new.content, new.tags, new.related_entities);
  END;`,
  `CREATE TRIGGER IF NOT EXISTS memories_ad AFTER DELETE ON memories BEGIN
    DELETE FROM memories_fts WHERE rowid = old.id;
  END;`,
  `CREATE TRIGGER IF NOT EXISTS memories_au AFTER UPDATE ON memories BEGIN
    INSERT INTO memories_fts(memories_fts, rowid, content, tags, related_entities) 
    VALUES('delete', old.id, old.content, old.tags, old.related_entities);
    INSERT INTO memories_fts(rowid, content, tags, related_entities) 
    VALUES (new.id, new.content, new.tags, new.related_entities);
  END;`,

  // 6. 设施表 (结构化建筑注册表 - Facilities Manifest)喵
  `CREATE TABLE IF NOT EXISTS facilities (
    id TEXT PRIMARY KEY, -- UUID 身份令牌喵
    saveSlotId INTEGER NOT NULL,
    name TEXT NOT NULL,
    location TEXT,
    description TEXT,
    status TEXT,
    sub_locations TEXT, -- JSON 格式喵
    staff TEXT, -- JSON 格式喵
    is_player_owned BOOLEAN DEFAULT 1,
    created_at INTEGER,
    updated_at INTEGER,
    FOREIGN KEY(saveSlotId) REFERENCES save_slots(id) ON DELETE CASCADE
  );`,
  `CREATE INDEX IF NOT EXISTS idx_facilities_saveSlotId ON facilities(saveSlotId);`,
  `CREATE INDEX IF NOT EXISTS idx_facilities_name ON facilities(name);`,

  // 7. 角色表 (全局角色数据库 - Global Character Database)喵
  `CREATE TABLE IF NOT EXISTS characters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid TEXT UNIQUE,
    name TEXT NOT NULL,
    type TEXT DEFAULT 'character', -- character, spell_card, location, info, others
    category TEXT,
    tags TEXT, -- JSON 数组格式喵
    description TEXT,
    avatarUrl TEXT,
    gender TEXT,
    referenceImageUrl TEXT,
    personality TEXT,
    stats TEXT -- JSON 格式喵
  );`,
  `CREATE INDEX IF NOT EXISTS idx_characters_uuid ON characters(uuid);`
];
