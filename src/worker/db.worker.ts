import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import { SCHEMA_SQL } from './schema';

let db: any = null;

const log = (...args: unknown[]) => console.log('[DB Worker]', ...args);
const error = (...args: unknown[]) => console.error('[DB Worker]', ...args);

// 初始化 SQLite 引擎
const initPromise = (sqlite3InitModule as any)({
  print: log,
  printErr: error,
  locateFile: (path: string, prefix: string) => {
    if (path.endsWith('.wasm')) {
      return '/sqlite3/sqlite3.wasm';
    }
    return prefix + path;
  }
}).then(async (sqlite3: any) => {
  try {
    log('运行 SQLite3 版本', sqlite3.version.libVersion);

    // OPFS 运行环境诊断日志 (环境连通性诊断 - Diagnostic logging)
    log('诊断 - isSecureContext:', self.isSecureContext);
    log('诊断 - crossOriginIsolated:', (self as any).crossOriginIsolated);
    log('诊断 - SharedArrayBuffer:', !!(self as any).SharedArrayBuffer);
    log('诊断 - Atomics:', !!(self as any).Atomics);
    log('诊断 - FileSystemHandle:', !!(self as any).FileSystemHandle);
    log('诊断 - navigator.storage.getDirectory:', !!navigator?.storage?.getDirectory);

    // === 策略 1: 标准 OPFS VFS (需启用 SharedArrayBuffer 与 COOP/COEP 隔离) ===
    if ('opfs' in sqlite3) {
      try {
        db = new sqlite3.oo1.OpfsDb('/touhou_isekai.sqlite3');
        log('OPFS 数据库打开成功: /touhou_isekai.sqlite3');
        (self as any).dbType = 'opfs';
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        error('打开 OPFS 数据库失败:', msg);
        db = null;
      }
    }

    // === 策略 2: opfs-sahpool VFS (无需 SharedArrayBuffer 支持) ===
    // 这是针对 Android WebView 的关键回退方案，因为其通常不支持 crossOriginIsolated。
    // opfs-sahpool 直接利用 FileSystemSyncAccessHandle，适用于 Chrome 108+。
    if (!db && typeof sqlite3.installOpfsSAHPoolVfs === 'function') {
      try {
        log('尝试初始化 opfs-sahpool VFS (不需要 SharedArrayBuffer)...');
        const poolUtil = await sqlite3.installOpfsSAHPoolVfs({
          initialCapacity: 6,
          name: 'opfs-sahpool',
          forceReinitIfPreviouslyFailed: true
        });
        db = new poolUtil.OpfsSAHPoolDb('/touhou_isekai.sqlite3');
        log('opfs-sahpool 数据库打开成功！(Android 兼容模式)');
        (self as any).dbType = 'opfs-sahpool';
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        error('opfs-sahpool 初始化失败:', msg);
        db = null;
      }
    }

    // === 策略 3: 内存回退方案 (无持久化存储) ===
    if (!db) {
      error('所有持久化存储方案均不可用，回退到临时内存数据库。数据将在页面关闭后丢失！');
      db = new sqlite3.oo1.DB('/touhou_isekai_mem.sqlite3', 'ct');
      (self as any).dbType = 'memory';
    }

    // 应用数据库结构定义 (应用数据库架构 - Apply Schema)
    log('正在应用数据库 Schema...');
    db.transaction(() => {
      SCHEMA_SQL.forEach((sql: string, index: number) => {
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

    // 为既有数据库执行版本迁移脚本 (数据库迁移 - Migrations)
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
    // 工具函数：如果列缺失则执行 DDL 自动补全 (列存在性守卫 - Column Guard)
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

    // 1. 角色表 (Characters) 迁移路径
    ensureColumn('characters', 'type', 'TEXT DEFAULT "character"');
    ensureColumn('characters', 'gender', 'TEXT');

    // 2. 聊天记录表 (Chats) 迁移路径
    ensureColumn('chats', 'thought_content', 'TEXT');
    ensureColumn('chats', 'illustrationUrl', 'TEXT');
    ensureColumn('chats', 'illustrationPrompt', 'TEXT');

    // 3. 存档插槽表 (Save Slots) 迁移路径
    ensureColumn('save_slots', 'playTime', 'INTEGER DEFAULT 0');
    ensureColumn('save_slots', 'isMultiplayer', 'BOOLEAN DEFAULT 0');

    log('所有数据库迁移已完成。');
  } catch (e: any) {
    error('迁移失败:', e.message);
  }
}

// --- 数据压缩与优化工具函数 (优化算法分片 - Optimization Shards) ---
const hashCache = new Map<string, string>();

/**
 * 用于去重的快速同步哈希算法。此处无需密码学级别的安全性，
 * 仅需为内容寻址存储提供一致的 Key。使用 FNV-1a 以平衡速度与冲突率。
 */
function fastHash(str: string): string {
  if (hashCache.has(str)) return hashCache.get(str)!;

  // FNV-1a 32位 + 辅助 djb2 算法以极大降低碰撞概率 (防碰撞处理 - Anti-collision)
  let h1 = 0x811c9dc5;
  let h2 = 5381;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    h1 ^= c;
    h1 = Math.imul(h1, 0x01000193);
    h2 = (h2 << 5) + h2 + c;
  }
  const res = (h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0');
  hashCache.set(str, res);
  return res;
}

// 保留异步 sha1 别名以维持向后兼容性 (部分旧版本调用方已使用了 await 模式)
async function sha1(str: string): Promise<string> {
  return fastHash(str);
}

async function optimizeGameState(state: any): Promise<any> {
  if (!state) return state;

  const storeStatic = (hash: string, type: string, content: string) => {
    db.exec({
      sql: 'INSERT OR IGNORE INTO static_data (id, type, content) VALUES (?, ?, ?)',
      bind: [hash, type, content]
    });
  };

  // 优化阶段 A：处理物品列表去重 (Items)
  if (state.player && Array.isArray(state.player.items)) {
    for (let i = 0; i < state.player.items.length; i++) {
      const item = state.player.items[i];
      if (item._ref) continue;

      const { id, count, ...staticProps } = item;
      if (Object.keys(staticProps).length > 0) {
        const content = JSON.stringify(staticProps);
        const hash = await sha1(content);
        storeStatic(hash, 'item', content);
        state.player.items[i] = { id, count, _ref: hash };
      }
    }
  }

  // 优化阶段 B：处理食谱列表去重 (Recipes)
  if (state.player && Array.isArray(state.player.recipes)) {
    for (let i = 0; i < state.player.recipes.length; i++) {
      const recipe = state.player.recipes[i];
      if (recipe._ref) continue;

      const { id, status, ...staticProps } = recipe;
      if (Object.keys(staticProps).length > 0) {
        const content = JSON.stringify(staticProps);
        const hash = await sha1(content);
        storeStatic(hash, 'recipe', content);
        state.player.recipes[i] = { id, status, _ref: hash };
      }
    }
  }

  // 优化阶段 C：处理任务系统 (Quests)
  // 已完成/已失败的任务：作为整体对象进行哈希（状态不再变更）
  // 进行中的任务：采用动静分离策略（状态和日志可能更新）
  if (state.system && Array.isArray(state.system.quests)) {
    for (let i = 0; i < state.system.quests.length; i++) {
      const quest = state.system.quests[i];
      if (quest._ref) continue;

      if (quest.status === 'completed' || quest.status === 'failed') {
        // 针对终态任务执行整包哈希压缩 (不可变数据处理 - Immutable)
        const content = JSON.stringify(quest);
        const hash = fastHash(content);
        storeStatic(hash, 'quest_full', content);
        state.system.quests[i] = { _ref: hash };
      } else {
        // 针对运行态任务执行属性拆分优化 (动静分离策略 - Dynamic/Static Split)
        const {
          id,
          status,
          logs,
          completedTurn,
          completedDate,
          completedTime,
          completionSummary,
          ...staticProps
        } = quest;
        if (Object.keys(staticProps).length > 0) {
          const content = JSON.stringify(staticProps);
          const hash = await sha1(content);
          storeStatic(hash, 'quest', content);
          state.system.quests[i] = {
            id,
            status,
            logs,
            completedTurn,
            completedDate,
            completedTime,
            completionSummary,
            _ref: hash
          };
        }
      }
    }
  }

  // 优化阶段 D：处理 NPC 字典 — 将每个 NPC 视为独立对象进行整体哈希
  // 考虑到多数 NPC 状态在回合间保持稳定，此举可大幅削减冗余快照量 (实体去重优化 - Entity Deduplication)
  if (state.npcs && typeof state.npcs === 'object') {
    const npcDict = state.npcs;
    for (const npcKey of Object.keys(npcDict)) {
      const npc = npcDict[npcKey];
      if (npc._ref) continue; // 已经过优化处理喵 (Already optimized)

      const content = JSON.stringify(npc);
      const hash = fastHash(content);
      storeStatic(hash, 'npc', content);
      npcDict[npcKey] = { _ref: hash };
    }
  }

  // 优化阶段 E：处理约定系统汇总 (Promises) — 执行整体对象哈希
  if (state.system && Array.isArray(state.system.promises)) {
    for (let i = 0; i < state.system.promises.length; i++) {
      const promise = state.system.promises[i];
      if (promise._ref) continue; // 已经过优化处理喵 (Already optimized)

      const content = JSON.stringify(promise);
      const hash = fastHash(content);
      storeStatic(hash, 'promise', content);
      state.system.promises[i] = { _ref: hash };
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

  // 还原阶段 D：NPC 字典解压 — 将 { _ref: hash } 形式的占位符反解为全量对象 (对象膨胀还原 - Expansion)
  if (state.npcs && typeof state.npcs === 'object') {
    for (const npcKey of Object.keys(state.npcs)) {
      const npc = state.npcs[npcKey];
      if (npc._ref) {
        state.npcs[npcKey] = getContent(npc._ref);
      }
    }
  }

  // 还原 Promise 状态 (Restore Promises)
  if (state.system && Array.isArray(state.system.promises)) {
    for (let i = 0; i < state.system.promises.length; i++) {
      const promise = state.system.promises[i];
      if (promise._ref) {
        state.system.promises[i] = getContent(promise._ref);
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
        // 自动化处理：对绑定参数中的 Object 类型执行 JSON 序列化注入
        const bind = payload.bind
          ? payload.bind.map((val: any) => {
              if (typeof val === 'object' && val !== null) return JSON.stringify(val);
              return val;
            })
          : undefined;

        result = db.exec({
          sql: payload.sql,
          bind: bind,
          returnValue: 'resultRows',
          rowMode: 'object' // 或采用 'array' 模式取值
        });
        break;

      case 'EXPORT_SAVE':
        result = await exportSave(db, payload.saveSlotId);
        break;

      case 'OPTIMIZE_AND_CREATE_SNAPSHOT':
        {
          const MAX_SNAPSHOTS_PER_SAVE = 200;
          const { saveSlotId, chatId, gameState } = payload;
          const optimizedState = await optimizeGameState(gameState);
          const stateStr = JSON.stringify(optimizedState);

          db.exec({
            sql: 'INSERT INTO snapshots (saveSlotId, chatId, createdAt, gameState) VALUES (?, ?, ?, ?)',
            bind: [saveSlotId, chatId, Date.now(), stateStr]
          });
          const res = db.exec({
            sql: 'SELECT last_insert_rowid() as id',
            returnValue: 'resultRows',
            rowMode: 'object'
          });
          const newSnapshotId = res[0].id;

          // 快照自动剪枝：每个存档槽位仅保留最近的 MAX_SNAPSHOTS_PER_SAVE 份记录 (内存守卫 - Memory Guard)
          try {
            const countRes = db.exec({
              sql: 'SELECT COUNT(*) as c FROM snapshots WHERE saveSlotId = ?',
              bind: [saveSlotId],
              returnValue: 'resultRows',
              rowMode: 'object'
            });
            const totalSnapshots = countRes[0].c;
            if (totalSnapshots > MAX_SNAPSHOTS_PER_SAVE) {
              const excess = totalSnapshots - MAX_SNAPSHOTS_PER_SAVE;
              // 级联清洗：在删除物理快照前，先解除 chats 表中的快照外键关联关系
              const oldestIds = db.exec({
                sql: 'SELECT id FROM snapshots WHERE saveSlotId = ? ORDER BY id ASC LIMIT ?',
                bind: [saveSlotId, excess],
                returnValue: 'resultRows',
                rowMode: 'object'
              });
              if (oldestIds.length > 0) {
                const idsToDelete = oldestIds.map((r: any) => r.id);
                const placeholders = idsToDelete.map(() => '?').join(',');
                // 重置聊天记录中的废弃快照引用，防止查询时产生悬挂指针 (孤儿预防 - Orphan Prevention)
                db.exec({
                  sql: `UPDATE chats SET snapshotId = NULL WHERE snapshotId IN (${placeholders})`,
                  bind: idsToDelete
                });
                db.exec({
                  sql: `DELETE FROM snapshots WHERE id IN (${placeholders})`,
                  bind: idsToDelete
                });
                log(
                  `[快照管理] 已清理存档 ${saveSlotId} 的 ${idsToDelete.length} 份陈旧快照喵 (总计 ${totalSnapshots} 份)`
                );
              }
            }
          } catch (pruneErr) {
            error('[快照管理] 快照自动剪枝失败喵 (非致命异常):', pruneErr);
          }

          result = { id: newSnapshotId };
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
                console.warn('[快照管理] 还原快照状态逻辑失败喵', e);
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
                console.warn('[快照管理] 还原最新快照状态失败喵', e);
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
            hasGetDirectory: !!navigator?.storage?.getDirectory,
            hasStorageManager: !!navigator?.storage
          }
        };
        break;

      default:
        throw new Error(`未知的消息类型喵: ${type}`);
    }

    self.postMessage({ id, type, result });
  } catch (err: any) {
    error('[数据库工作线程] 发生内部异常喵:', err);
    self.postMessage({
      id,
      type,
      error: err.message || 'Worker 内部执行异常喵'
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
        const values = keys.map((k) => {
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
  if (saveSlots.length === 0) throw new Error('未找到指定的存档插槽喵');

  const rawSave = saveSlots[0];
  const saveSlotData = {
    ...rawSave,
    id: undefined,
    isMultiplayer: Boolean(rawSave.isMultiplayer)
  };

  const chats = getRows('SELECT * FROM chats WHERE saveSlotId = ?', [saveSlotId]).map(
    (chat: any) => {
      if (chat.debugLog) {
        chat.debugLog = undefined;
      }
      return chat;
    }
  );

  const memories = getRows('SELECT * FROM memories WHERE saveSlotId = ?', [saveSlotId]);

  const memoryRelations = getRows(
    `
    SELECT mr.* 
    FROM memory_relations mr 
    JOIN memories m ON mr.source_id = m.id 
    WHERE m.saveSlotId = ?
  `,
    [saveSlotId]
  );

  const snapshotsCount = getRows('SELECT COUNT(*) as c FROM snapshots WHERE saveSlotId = ?', [
    saveSlotId
  ])[0].c;

  console.log(`[导出] 开始准备导出数据喵。快照总数: ${snapshotsCount}, 消息总数: ${chats.length}`);

  // =================================================================
  // 阶段 1：执行快照增量压缩 (增量去重Pass - Deduplication Pass)
  // 快速路径：跳过已处理过的优化快照 (即包含 "_ref" 标记的项)
  // =================================================================
  const OPTIMIZE_BATCH_SIZE = 50;
  let optimizedCount = 0;
  let skippedCount = 0;

  // 内存缓存层：以快照 ID 为键存储优化后的 gameState 负载，以便在阶段 2 中直接消费，避免冗余 DB IO
  const snapshotCache = new Map<number, string>();

  for (let offset = 0; offset < snapshotsCount; offset += OPTIMIZE_BATCH_SIZE) {
    const batch = getRows(
      'SELECT id, gameState FROM snapshots WHERE saveSlotId = ? ORDER BY id LIMIT ? OFFSET ?',
      [saveSlotId, OPTIMIZE_BATCH_SIZE, offset]
    );
    const updates: { id: number; gameState: string }[] = [];

    for (const s of batch) {
      if (!s.gameState) {
        snapshotCache.set(s.id, 'null');
        continue;
      }

      const originalStr =
        typeof s.gameState === 'string' ? s.gameState : JSON.stringify(s.gameState);

      // 快速路径：若负载字符串中已存在 _ref 标记，说明当前快照已处于压缩态
      // 此项判定是安全的，因为 optimizeGameState 仅在增量过程中插入标记而绝不执行反向操作。
      if (originalStr.includes('"_ref"')) {
        snapshotCache.set(s.id, originalStr);
        skippedCount++;
        continue;
      }

      try {
        const state = JSON.parse(originalStr);
        await optimizeGameState(state);
        const newStr = JSON.stringify(state);

        snapshotCache.set(s.id, newStr);

        if (newStr !== originalStr) {
          updates.push({ id: s.id, gameState: newStr });
        }
      } catch (e) {
        console.warn(`[导出] 快照 ${s.id} 的压缩优化步骤失败喵`, e);
        snapshotCache.set(s.id, originalStr);
      }
    }

    // 批量提交发生变更的快照数据记录 (Atomic Batch Update)
    if (updates.length > 0) {
      db.transaction(() => {
        const stmt = db.prepare('UPDATE snapshots SET gameState = ? WHERE id = ?');
        try {
          for (const u of updates) {
            stmt.bind([u.gameState, u.id]);
            stmt.step();
            stmt.reset();
          }
        } finally {
          stmt.finalize();
        }
      });
    }

    optimizedCount += batch.length;

    // 任务切片：每批次处理后释放 CPU 事件循环，确保 Worker 线程的即时响应能力
    if (optimizedCount % 100 === 0) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      console.log(
        `[Export] 压缩进度: ${optimizedCount}/${snapshotsCount} (已跳过已处理项: ${skippedCount})`
      );
    }
  }

  console.log(`[导出] 压缩处理完成喵。已处理: ${optimizedCount}, 已跳过: ${skippedCount}`);

  const facilities = getRows('SELECT * FROM facilities WHERE saveSlotId = ?', [saveSlotId]);
  const characters = getRows('SELECT * FROM characters');

  // 最终导出静态资源库内容 (此时所有新增的内容寻址 Ref 均已完成哈希链路注入)
  const staticData = getRows('SELECT * FROM static_data');

  // =================================================================
  // 阶段 2：以流式写入方式构建 JSON 二进制大对象 (二进制流序列化 - Blob)
  // =================================================================
  const jsonParts: string[] = [];

  jsonParts.push(`{"version":2,"timestamp":${Date.now()},`);
  jsonParts.push(`"saveSlot":${JSON.stringify(saveSlotData)},`);
  jsonParts.push(`"chats":${JSON.stringify(chats)},`);
  jsonParts.push(`"memories":${JSON.stringify(memories)},`);
  jsonParts.push(`"memoryRelations":${JSON.stringify(memoryRelations)},`);
  jsonParts.push(`"characters":${JSON.stringify(characters)},`);
  jsonParts.push(`"facilities":${JSON.stringify(facilities)},`);
  jsonParts.push(`"staticData":${JSON.stringify(staticData)},`);

  // 处理快照负载：优先消费阶段 1 构建的预优化缓存，避免二次触发大规模 DB 全表扫描 (缓存命中恢复 - Cache Hit Recovery)
  jsonParts.push(`"snapshots":[`);

  let processedCount = 0;
  let isFirstSnapshot = true;

  // 理想路径：若全量快照均命中缓存，则可脱离 DB 游标直接生成 JSON 片段
  if (snapshotCache.size > 0) {
    // 补全快照元数据：分批读取非静态列数据，并实时注入缓存中的 gameState 负载流 (JSON Streaming)
    const BATCH_SIZE = 100;
    for (let offset = 0; offset < snapshotsCount; offset += BATCH_SIZE) {
      const batch = getRows(
        'SELECT id, saveSlotId, chatId, createdAt FROM snapshots WHERE saveSlotId = ? ORDER BY id LIMIT ? OFFSET ?',
        [saveSlotId, BATCH_SIZE, offset]
      );

      for (const s of batch) {
        const gameStateStr = snapshotCache.get(s.id) || 'null';
        const jsonItem = `{"id":${s.id},"saveSlotId":${s.saveSlotId},"chatId":${s.chatId},"createdAt":${s.createdAt},"gameState":${gameStateStr}}`;
 
        if (!isFirstSnapshot) jsonParts.push(',');
        jsonParts.push(jsonItem);
        isFirstSnapshot = false;
        processedCount++;
      }
 
      if (processedCount % 200 === 0) {
        await new Promise((resolve) => setTimeout(resolve, 0));
        console.log(`[Export] 正在打包 JSON 数据流: ${processedCount}/${snapshotsCount} (流式写入 - JSON Streaming)`);
      }
    }
  }
 
  // 迁移完成，立即显式释放缓存占用的内存空间 (堆内存收缩 - Heap Shrink)
  snapshotCache.clear();

  jsonParts.push(']}');

  console.log(`[Export] Completed. Total snapshots: ${processedCount}`);

  return new Blob(jsonParts, { type: 'application/json' });
}

/**
 * 辅助工具：从大型 ArrayBuffer 中物理剥离指定的 JSON 数组片段以节约解析开销。
 * 返回经动态裁切的新 ArrayBuffer（或在支持的场景下执行内存原地擦除）。
 * 逻辑原理：将数组内的字节内容用空格符 (32) 物理覆写，以跳过 JSON 解码器的深层分析。
 * @param keepLast 若大于 0，则保留最近的 N 个元素，其余部分执行物理剔除。
 */
function stripJsonSection(buffer: ArrayBuffer, keyName: string, keepLast: number = 0): ArrayBuffer {
  const uint8 = new Uint8Array(buffer);
  const keyBytes = new TextEncoder().encode(`"${keyName}"`);

  let depth = 0;
  let inString = false;
  let escaped = false;
  let cursor = 0;
  let keyFoundAt = -1;

  // 1. 在根层级（树深度为 1）定位目标 Key 的字节偏移量 (Key Search Pass)
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
    console.warn(`[导入] 在 JSON 根层级未找到键 "${keyName}"。`);
    return buffer;
  }
 
  // 2. 定位数组字段的字节起始边界 (数组边界定位 - Array Start Bound)
  cursor = keyFoundAt;
  let startBracket = -1;
  while (cursor < uint8.length) {
    const byte = uint8[cursor]!;
    if (byte === 91) {
      startBracket = cursor;
      break;
    } else if (byte > 32) {
      console.warn(`[导入] "${keyName}" 的值不是数组类型。`);
      return buffer;
    }
    cursor++;
  }

  if (startBracket === -1) return buffer;
 
  // 3. 追踪数组终点符号位，并同步采集元素分隔符（逗号）的位置掩码 (逗号映射扫描 - Comma Mapping Pass)
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
    console.warn(`[导入] 无法找到 "${keyName}" 的闭合括号。`);
    return buffer;
  }

  const endBracket = cursor;
  let stripEnd = endBracket;
 
  // 4. 根据保留策略计算物理裁切的字节边界 (字节边界计算 - Boundary Calculation)
  if (keepLast > 0) {
    let hasContent = false;
    for (let k = startBracket + 1; k < endBracket; k++) {
      if (uint8[k]! > 32) {
        hasContent = true;
        break;
      }
    }

    const totalItems = hasContent ? commaPositions.length + 1 : 0;

    if (totalItems > keepLast) {
      const commaIndex = totalItems - keepLast - 1;
      if (commaIndex >= 0 && commaIndex < commaPositions.length) {
        stripEnd = commaPositions[commaIndex]! + 1;
      }
    } else {
      return buffer;
    }
  }

  // 5. 执行物理擦除：在指定字节序列区间填充空格占位符 (缓冲区快速填充 - Fast Buffer Fill)
  for (let k = startBracket + 1; k < stripEnd; k++) {
    uint8[k] = 32;
  }

  return buffer;
}

async function importSaveWithCorrectOrder(db: any, jsonContent: string | ArrayBuffer) {
  let data;
  try {
    if (typeof jsonContent === 'string') {
      console.log('[导入] 正在解析字符串内容，长度:', jsonContent.length);
      data = JSON.parse(jsonContent);
    } else {
      // 数组缓冲区对象喵 (ArrayBuffer)
      let buffer = jsonContent;
      console.log('[导入] 正在解析 ArrayBuffer 内容，大小:', buffer.byteLength);

      // 超大规模文件熔断机制 (> 100MB)：主动尝试剥离陈旧快照数据，防止解析阶段导致 Worker OOM 崩溃。
      if (buffer.byteLength > 100 * 1024 * 1024) {
        console.warn(
          '[导入] 文件体积过大，正在尝试剥离旧快照以节省内存...'
        );
        try {
          // 性能策略：仅保留最后 50 份快照，其余旧快照执行流式剥离以减小堆占用。
          buffer = stripJsonSection(buffer, 'snapshots', 50);
          console.log('[导入] 快照处理完成。新大小:', buffer.byteLength);
        } catch (e) {
          console.error('[导入] 快照剥离失败:', e);
          // 容错处理：剥离失败后尝试使用原始缓冲区继续解析。
        }
      }

      // 异步高性能流式解析：利用底层浏览器 Response 原语解析巨型 JSON 对象。
      // 此举通过分块加载，可有效绕过 V8 引擎在普通 JSON.parse 下对超长字符串的堆栈物理限制。
      data = await new Response(new Blob([buffer])).json();
    }
  } catch (e: any) {
    console.error('[导入] JSON 解析失败:', e);
    throw new Error(`JSON 解析失败: ${e.message}`);
  }

  if (!data.saveSlot || !Array.isArray(data.chats)) {
    throw new Error('存档文件格式无效');
  }

  // 结构加固：若快照字段被完全剥离，则将其重置为空数组以防止后续逻辑解构异常。
  if (!data.snapshots) data.snapshots = [];

  let newSaveId = 0;

  db.transaction(() => {
    // const exec = (sql: string, bind: any[] = []) =>
    //    db.exec({ sql, bind, returnValue: 'resultRows', rowMode: 'object' });

    // 0. 导入静态资源库 (作为后续快照内容还原的核心前置依赖项)
    if (Array.isArray(data.staticData)) {
      console.log('[导入] 正在导入静态资源数据...', data.staticData.length);
      const stmt = db.prepare(
        'INSERT OR IGNORE INTO static_data (id, type, content) VALUES (?, ?, ?)'
      );
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

    // 设计笔记：由于静态资源已在上方逻辑中全量入库，此处只需关注数据的一致性引用。
    // 如果导入的是旧版存档，我们可能需要在此处或后续异步流程中执行 optimizeGameState。
    // 但鉴于 SHA1 性能开销，我们优先采用外部异步循环处理方案。
  });

  // 数据就绪：在正式落盘前执行全局快照压缩，以最大程度优化既有数据库的物理开销。
  // 注意：此过程涉及异步 IO，务必位于事务边界外执行。
  if (data.snapshots.length > 0) {
    console.log('[导入] 正在优化存档快照存储...');
    for (const snap of data.snapshots) {
      try {
        let state = snap.gameState;
        if (typeof state === 'string') state = JSON.parse(state);

        // 执行数据压缩优化：提取出可公用的静态数据负载 (静态数据抽离 - Static Extraction)
        // 注意：即便刚导入过静态库，此操作引发的重复插入会被 INSERT OR IGNORE 高效拦截。
        state = await optimizeGameState(state);
 
        snap.gameState = JSON.stringify(state);
      } catch (e) {
        console.warn('快照预优化失败喵', e);
      }
    }
    console.log('[导入] 快照优化完成。');
  }

  db.transaction(() => {
    const exec = (sql: string, bind: any[] = []) =>
      db.exec({ sql, bind, returnValue: 'resultRows', rowMode: 'object' });

    // 1. 创建存档插槽记录 (Save Slot Entry)
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

    // 2. 导入角色元数据 (采用 Upsert 模式支持增量同步)
    if (Array.isArray(data.characters)) {
      for (const char of data.characters) {
        try {
          // 演进适配层：执行旧版本字段的向后兼容映射 (Field Compatibility Adaptation)
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

          // 归拢：将所有非标扩展字段统一汇入 stats 属性包中存储 (Stats Folding)
          const extraFields = [
            'initialPower',
            'initialMaxHp',
            'initialResidence',
            'cost',
            'damage',
            'damageType',
            'buffDetails'
          ];
          extraFields.forEach((field) => {
            if (char[field] !== undefined) {
              mappedChar.stats[field] = char[field];
            }
          });

          const existing = exec('SELECT id FROM characters WHERE uuid = ?', [mappedChar.uuid]);

          const fields = Object.keys(mappedChar);
          const values = fields.map((k) => {
            const val = mappedChar[k];
            return typeof val === 'object' && val !== null ? JSON.stringify(val) : val;
          });

          if (existing.length > 0) {
            // 执行更新操作喵 (Update)
            const setClause = fields.map((k) => `${k} = ?`).join(', ');
            exec(`UPDATE characters SET ${setClause} WHERE uuid = ?`, [...values, mappedChar.uuid]);
          } else {
            // 执行插入操作喵 (Insert)
            const placeholders = fields.map(() => '?').join(', ');
            exec(
              `INSERT OR IGNORE INTO characters (${fields.join(', ')}) VALUES (${placeholders})`,
              values
            );
          }
        } catch (e: any) {
          console.warn(`[导入] 角色 ${char.name || char.uuid} 导入失败:`, e);
          // 抛出异常以触发事务回滚，确保数据库状态的一致性与完整性。
          throw new Error(`角色 ${char.name} 导入失败: ${e.message}`);
        }
      }
    }

    // 3. 导入聊天纪录 (第一轮导入：解开对 snapshotId 的物理外键依赖以便先行入库)
    for (const chat of data.chats) {
      // 健壮性兜底：为旧版存档中缺失的必填业务字段提供默认值 (Fallback Shards)
      const role = chat.role || 'assistant';
      const timestamp = chat.timestamp || Date.now();
      const turnCount = chat.turnCount !== undefined ? chat.turnCount : 0;
      const content = chat.content || '';
      const debugLog =
        typeof chat.debugLog === 'object' ? JSON.stringify(chat.debugLog) : chat.debugLog || null;

      // 处理来自中间版本演进出的特殊标识字段 (Legacy Extension Fields)
      const thoughtContent = chat.thought_content || null;
      const illustrationUrl = chat.illustrationUrl || null;
      const illustrationPrompt = chat.illustrationPrompt || null;

      exec(
        'INSERT INTO chats (saveSlotId, role, content, debugLog, timestamp, turnCount, snapshotId, thought_content, illustrationUrl, illustrationPrompt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
          newSaveId,
          role,
          content,
          debugLog,
          timestamp,
          turnCount,
          null,
          thoughtContent,
          illustrationUrl,
          illustrationPrompt
        ]
      );
      const newChatId = exec('SELECT last_insert_rowid() as id')[0].id;
      chatIdMap.set(chat.id, newChatId);
    }

    // 4. 导入快照集 (此时消费已映射就绪的 New Chat IDs 构建关联关系)
    if (Array.isArray(data.snapshots)) {
      for (const snap of data.snapshots) {
        // 数据格式补丁：确保 gameState 始终以字符串协议形式落地 (Stringify Patch)
        let gameStateStr = snap.gameState;
        if (typeof gameStateStr !== 'string') {
          gameStateStr = JSON.stringify(gameStateStr);
        }

        const oldChatId = snap.chatId;
        const newChatId = chatIdMap.get(oldChatId) || 0;

        if (newChatId === 0) {
          console.warn(
            `[导入] 快照 ${snap.id} 引用了不存在的对话 ${oldChatId}，已跳过。`
          );
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

    // 5. 引用闭环：第二次遍历 chats 表，补全通过 ID 映射表算出的 snapshotId 正确外键引用 (Ref Repair)
    for (const chat of data.chats) {
      if (chat.snapshotId && snapshotIdMap.has(chat.snapshotId)) {
        const newChatId = chatIdMap.get(chat.id);
        const newSnapshotId = snapshotIdMap.get(chat.snapshotId);
        if (newChatId && newSnapshotId) {
          exec('UPDATE chats SET snapshotId = ? WHERE id = ?', [newSnapshotId, newChatId]);
        }
      }
    }

    // 6. 导入记忆系统集 (Memories Registry)
    const memoryIdMap = new Map<number, number>();

    if (Array.isArray(data.memories)) {
      for (const mem of data.memories) {
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

        // 健壮性适配：确保复杂嵌套字段 (tags, entities 等) 合法序列化为 JSON 字符串
        const ensureString = (val: any) =>
          typeof val === 'object' && val !== null ? JSON.stringify(val) : val || '[]';

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

        exec(`INSERT INTO memories (${fields.join(', ')}) VALUES (${placeholders})`, values);
        const newMemoryId = exec('SELECT last_insert_rowid() as id')[0].id;
        memoryIdMap.set(mem.id, newMemoryId);
      }
    }

    // 6.1 导入记忆关联图谱 (Memory Contextual Relations)
    if (Array.isArray(data.memoryRelations)) {
      for (const rel of data.memoryRelations) {
        const newSourceId = memoryIdMap.get(rel.source_id);
        const newTargetId = memoryIdMap.get(rel.target_id);

        // 关系完整性约束：仅在源端与目标端记忆对象均成功映射后才建立关联关系 (Safety Interlock)
        if (newSourceId && newTargetId) {
          try {
            exec(
              'INSERT OR IGNORE INTO memory_relations (source_id, target_id, rel_type, strength, created_at) VALUES (?, ?, ?, ?, ?)',
              [newSourceId, newTargetId, rel.rel_type, rel.strength, rel.created_at || Date.now()]
            );
          } catch (e) {
            console.warn('[导入] 记忆关联导入失败:', e);
          }
        }
      }
    }

    // 7. 导入设施/建筑注册表 (Facilities Manifest)
    const facilityIdMap = new Map<number, number>();
    if (Array.isArray(data.facilities)) {
      // 序列化辅助函数 (Serialization Helper)
      const ensureString = (val: any) =>
        typeof val === 'object' && val !== null ? JSON.stringify(val) : val || '[]';

      for (const fac of data.facilities) {
        const fields = [
          'saveSlotId',
          'name',
          'location',
          'description',
          'status',
          'sub_locations',
          'staff',
          'is_player_owned',
          'created_at',
          'updated_at'
        ];
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

        exec(`INSERT INTO facilities (${fields.join(', ')}) VALUES (${placeholders})`, values);

        const newFacId = exec('SELECT last_insert_rowid() as id')[0].id;
        facilityIdMap.set(fac.id, newFacId);
      }
    }
  });

  return { newSaveId };
}

// @ts-expect-error: TODO: 修复类型定义错误 (Type Definition Required)

function importGlobalData(db: any, gameData: any) {
  // 待办实现：根据业务需求注入全局层级的数据导入逻辑 (Global Import Logic)
  return true;
}
