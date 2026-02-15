export const SCHEMA_SQL = [
  // 1. Settings (Global App Settings)
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
    -- Add other setting fields as JSON or columns
    raw_data TEXT -- Store other fields as JSON for flexibility
  );`,

  // 2. Save Slots (Game Sessions)
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

  // 3. Chats (Dialogue History)
  `CREATE TABLE IF NOT EXISTS chats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    saveSlotId INTEGER NOT NULL,
    role TEXT NOT NULL, -- 'user' | 'assistant' | 'system'
    content TEXT,
    thought_content TEXT,
    illustrationUrl TEXT,
    illustrationPrompt TEXT,
    debugLog TEXT, -- JSON String
    timestamp INTEGER NOT NULL,
    turnCount INTEGER NOT NULL,
    snapshotId INTEGER,
    FOREIGN KEY(saveSlotId) REFERENCES save_slots(id) ON DELETE CASCADE
  );`,
  `CREATE INDEX IF NOT EXISTS idx_chats_saveSlotId ON chats(saveSlotId);`,
  `CREATE INDEX IF NOT EXISTS idx_chats_timestamp ON chats(timestamp);`,

  // 4. Snapshots (Game State History)
  `CREATE TABLE IF NOT EXISTS snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    saveSlotId INTEGER NOT NULL,
    chatId INTEGER NOT NULL,
    createdAt INTEGER NOT NULL,
    gameState BLOB, -- Compressed JSON or just JSON string
    FOREIGN KEY(saveSlotId) REFERENCES save_slots(id) ON DELETE CASCADE
  );`,
  `CREATE INDEX IF NOT EXISTS idx_snapshots_saveSlotId_chatId ON snapshots(saveSlotId, chatId);`,

  // 5. Memories (RAG Vector/Search Store)
  // Using FTS5 for full-text search capabilities
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
    tags TEXT, -- JSON array
    related_entities TEXT, -- JSON array
    importance INTEGER,
    createdAt INTEGER,
    gameDate TEXT,
    gameTime TEXT,
    location TEXT,
    characters TEXT, -- JSON array
    FOREIGN KEY(saveSlotId) REFERENCES save_slots(id) ON DELETE CASCADE
  );`,
  `CREATE INDEX IF NOT EXISTS idx_memories_saveSlotId ON memories(saveSlotId);`,
  `CREATE INDEX IF NOT EXISTS idx_memories_type ON memories(type);`,

  // 5.1 Memory Relations (Graph Edges)
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

  // 6. Static Data (Deduplication Storage for Items, Recipes, Quests)
  `CREATE TABLE IF NOT EXISTS static_data (
    id TEXT PRIMARY KEY, -- Hash of the content
    type TEXT, -- 'item' | 'recipe' | 'quest'
    content TEXT -- JSON string of the static properties
  );`,

  // Trigger to keep FTS index in sync with memories table
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

  // 6. Facilities (Structured Facility Registry)
  `CREATE TABLE IF NOT EXISTS facilities (
    id TEXT PRIMARY KEY, -- UUID
    saveSlotId INTEGER NOT NULL,
    name TEXT NOT NULL,
    location TEXT,
    description TEXT,
    status TEXT,
    sub_locations TEXT, -- JSON
    staff TEXT, -- JSON
    is_player_owned BOOLEAN DEFAULT 1,
    created_at INTEGER,
    updated_at INTEGER,
    FOREIGN KEY(saveSlotId) REFERENCES save_slots(id) ON DELETE CASCADE
  );`,
  `CREATE INDEX IF NOT EXISTS idx_facilities_saveSlotId ON facilities(saveSlotId);`,
  `CREATE INDEX IF NOT EXISTS idx_facilities_name ON facilities(name);`,

  // 7. Characters (Global Character Database)
  `CREATE TABLE IF NOT EXISTS characters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid TEXT UNIQUE,
    name TEXT NOT NULL,
    type TEXT DEFAULT 'character', -- character, spell_card, location, info, other
    category TEXT,
    tags TEXT, -- JSON array
    description TEXT,
    avatarUrl TEXT,
    gender TEXT,
    referenceImageUrl TEXT,
    personality TEXT,
    stats TEXT -- JSON
  );`,
  `CREATE INDEX IF NOT EXISTS idx_characters_uuid ON characters(uuid);`
];
