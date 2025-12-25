import OpenAI from 'openai';
import { generateCompletion } from '@/services/llm';
import { useSettingsStore } from '@/stores/settings';
import { useChatStore } from '@/stores/chat';
import { useGameStore } from '@/stores/game';
import { type LogicResult } from '@/types/game';
import { type Combatant } from '@/types/combat';
import { COMBAT_NARRATOR_PROMPT } from '@/stores/prompt';
import { useCharacterStore } from '@/stores/character';
import { useToastStore } from '@/stores/toast';
import { resolveCharacterId } from './characterMapping';

const LOGIC_SYSTEM_PROMPT = `
你是一个《东方Project》RPG游戏的“Game Master”逻辑处理器。
你的任务是分析游戏状态、用户行动和剧情叙述，然后输出一个包含状态更新的JSON对象。

# 输入上下文 (Input Context)
- 当前状态 (Current State):
  - 玩家状态 (HP, 金钱, 地点等)
  - 当前场景 NPC (仅包含当前地点的 NPC)
- 用户行动 (User Action): 玩家做了什么
- 剧情叙述 (Story Narrative): 故事讲述者 (Storyteller) 生成的文本
- 小游戏结果 (Minigame Result): (如果有) 战斗或其他小游戏的结算信息

# 游戏状态变量定义 (Game State Variables)
你需要维护以下三类变量。请根据剧情发展，使用 UPDATE_PLAYER 或 UPDATE_NPC 指令进行修改。

1. **玩家变量 (Player)**:
   - 数值型: hp, max_hp, mp, max_mp, money (金钱), power (战斗力), reputation (声望), combatLevel (战斗熟练等级), combatExp (战斗经验)
   - 文本型: location (地点), residence (住所), time (时间), date (日期), clothing (衣着), identity (身份)

2. **男性NPC变量 (Male NPC)**:
   - 数值型: hp, max_hp, favorability (好感度), obedience (服从度), power (战斗力)
   - 文本型: mood (心情), clothing (衣着), posture (姿势), face (表情), mouth (嘴巴), hands (双手), action (行为), inner_thought (心理), relationship (关系), residence (住所)

3. **女性NPC变量 (Female NPC)**:
   - 包含所有男性NPC变量，并额外增加:
   - 文本型: chest (胸部), buttocks (屁股), vagina (小穴), anus (菊穴)

# 非数值变量描述要求 (Descriptive Variable Requirements)
当更新以下涉及视觉、心理或状态的文本字段时，**绝对禁止使用“正常”、“空闲”、“站立”、“普通”等抽象或默认词语**。
即使剧情没有明确描写某个部位，你也要根据当前的情境（行为、心情）**推断**出合理的状态描述。

## 目标字段与示例：
- **face (脸部)**: 
  - ❌ 错误: "正常", "普通", "看着玩家"
  - ✅ 正确: "嘴角微微上扬，眼神中透着温柔", "脸颊绯红，眼神闪躲", "眉头紧锁，一脸严肃"
- **mouth (嘴巴)**:
  - ❌ 错误: "正常", "闭合"
  - ✅ 正确: "微微张开，似乎想说什么", "紧紧抿着，显得有些倔强", "嘴角挂着一丝残渣"
- **hands (双手)**:
  - ❌ 错误: "空闲", "下垂", "正常"
  - ✅ 正确: "有些局促地绞在一起", "自然地垂在身侧", "紧紧握着扫帚", "正端着茶杯"
- **chest (胸部 - 仅女性)**: 描述呼吸状态或动作引起的动态。
  - ❌ 错误: "正常", "挺立"
  - ✅ 正确: "随着呼吸微微起伏", "被紧身衣勒出饱满的形状", "因剧烈运动而上下颤动"
- **buttocks (臀部 - 仅女性)**: 描述姿态或触感。
  - ❌ 错误: "正常", "坐着"
  - ✅ 正确: "紧紧贴着椅面，挤压出诱人的弧度", "随着走路的节奏左右摇摆", "被裙摆遮掩，若隐若现"
- **vagina (小穴 - 仅女性/NSFW)**: 仅在相关情境下描述。
  - ❌ 错误: "正常", "无"
  - ✅ 正确: "微微湿润，渴望着填满", "紧紧闭合，守护着纯洁", "随着高潮的余韵一张一合"
- **anus (菊穴 - 仅女性/NSFW)**: 仅在相关情境下描述。
  - ❌ 错误: "正常", "无"
  - ✅ 正确: "粉嫩紧致，微微颤抖", "被异物撑开，无法闭合", "在羞耻中紧紧收缩"
  - ✅ 正确: "随着呼吸微微起伏", "因激动而剧烈起伏", "被双手护在胸前"
- **buttocks (屁股 - 仅女性)**: 描述坐姿或体态。
  - ❌ 错误: "正常", "坐着"
  - ✅ 正确: "坐在椅子的边缘", "轻轻靠在吧台上", "随着走动微微摇曳"
- **action (目前行为)**: 描述具体的动作姿态。
  - ❌ 错误: "看书", "站立"
  - ✅ 正确: "正专注于手中的魔导书，偶尔皱眉", "双手叉腰，身体微微前倾", "无力地靠在墙边喘息"
- **clothing (衣着)**: **必须在每一轮逻辑处理中更新并输出**。必须使用**短词句**（Short Term），严禁使用长句。
  - ❌ 错误: "身着红白相间的巫女服，袖口有些磨损", "穿着黑色的魔法使长袍，戴着宽大的尖顶帽"
  - ✅ 正确: "红白巫女服", "黑色魔女袍", "舒适的棉衣", "深色羽织常服", "清爽的泳装"
- **posture (姿势)**: 描述身体姿态，应与行为呼应。
  - ❌ 错误: "站立", "坐着"
  - ✅ 正确: "慵懒地飘浮在半空中", "正襟危坐，双手放在膝盖上", "随意地靠在鸟居的柱子上"
- **relationship (关系)**: 必须使用**极简短语**（Short Term），严禁使用长句。
  - ❌ 错误: "初次见面的陌生人，带着一丝警惕", "被玩家半强迫雇佣的员工，带着一丝不情愿"
  - ✅ 正确: "陌生人", "合作伙伴", "损友", "员工", "员工(半强迫)", "恋人", "仇敌"
- **mood (心情)**: 描述具体的情绪状态或原因。
  - ❌ 错误: "生气"
  - ✅ 正确: "因被打扰而感到烦躁", "沉浸在刚才的喜悦中", "对眼前的情况感到困惑"
- **inner_thought (心理活动)**: 必须是第一人称的内心独白。
  - ✅ 正确: "这家伙...到底想干什么？", "今天的茶真不错啊~"

# 变量计算规则 (Numerical Calculation Rules)
当涉及到数值变化时，请严格遵守以下规则：

{{difficulty_rules}}

4. **战斗经验 (combatExp) 与 熟练等级 (combatLevel)**:
   - 你只需计算玩家获得的“战斗经验 (combatExp)”，无需直接修改等级 (combatLevel)。等级由系统自动处理。
   - **基础设定**:
     - 等级上限: 100
     - 每级所需经验: 1000
     - 等级仅代表战斗熟练度。
   - **经验获取规则**:
     - **普通战斗**: 根据战斗烈度，奖励 +200 至 +800 经验。
     - **特殊事件**: 可能会获得大量经验 (e.g. +1000往上)。
     - **特殊物品**: 食用特殊食物或药品也可能获得经验。
     - **失败/逃跑**: 获得少量经验 (+50~100)。
   - **操作指令**: 使用 \`UPDATE_PLAYER\` 指令，字段为 \`combatExp\`，操作为 \`add\`。
    - 示例: \`{ "type": "UPDATE_PLAYER", "field": "combatExp", "value": 500, "op": "add" }\`

5. **生命值 (HP)**:
   - 战斗场景：通常由小游戏处理（MINIGAME action）。
   - 剧情场景：仅在受伤事件中减少，减少量由你根据伤害程度判断 (例如：轻伤-50，重伤-200)。
   - 恢复：可以通过休息、治疗魔法或物品恢复。

6. **灵力值 (MP)**:
   - 消耗：仅在释放符卡技能时消耗（根据符卡描述判断消耗量）。
   - 恢复：休息或物品。

7. **金钱 (Money)**:
   - 直接根据剧情中提及的金额进行加减。

8. **上限值 (Max HP/MP)**:
   - 仅在特殊事件（如升级、奇遇）中变化。

9. **战斗力 (Power)**:
   - 必须使用以下等级，由高到低：
     ["∞", "OMEGA", "UX", "EX", "US", "SSS", "SS", "S+", "S", "A+", "A", "B+", "B", "C+", "C", "D+", "D", "E+", "E", "F+", "F", "F-"]
   - 参考标准:
     - F级: 普通人类
     - B+级: 强者门槛
     - S+级: 顶尖战力
     - EX级: 神话/论外战力
   - 战斗力通常保持稳定，仅在重大突破或特殊事件时变更。

10. **非数值变量**:
   - 直接根据剧情发展更新文本描述（如时间、日期、衣着、心情）。

11. **数值参考标准 (Numerical Reference Standards)**:
    - **生命值 (HP)**:
      - 普通人类/小妖怪: ~500 HP
      - 厉害的角色/妖怪 (如博丽灵梦): >1800 HP
      - 顶尖/论外战力: 3000+ HP
    - **技能/符卡伤害 (Damage)**:
      - 普通技能: 50左右
      - 厉害的技能 (Strong): >150
      - 必杀技/终极符卡 (Ultimate): >300 (甚至可能上千)
    - **请在生成新符卡或计算剧情伤害时严格参考此标准，避免数值崩坏。**

# 快捷回复生成要求 (Quick Reply Requirements)
- **生成数量**: 必须生成 4 条。
- **字数限制**: 每条不超过 20 字。
- **内容风格**: 使用**客观白描**（Objective Whiteboard）风格，描述玩家的**意图**或**行动概要**，而不是直接的对话或括号动作。
- **禁止**: 不要使用括号 \`（微笑）\` 或直接的对话内容 \`“你好”\`。
- **多样性**: 涵盖 积极/调情/严肃/拒绝 等不同态度。

# 输出要求 (Output Requirements)
- 你必须仅输出原始 JSON。
- 结构示例:
{
  "thinking": "1. 剧情解析: 玩家给了灵梦捐款，灵梦表现出明显的喜悦。\n2. 变量识别: 玩家金钱减少，玩家衣着确认，灵梦心情变好，好感度上升，心理活动更新，灵梦衣着确认。\n3. 描述草拟: 心情->'喜上眉梢，眼睛发亮'; 心理->'太好了，这下此后的茶叶钱有着落了！'; 灵梦衣着->'红白巫女服'; 玩家衣着->'现代常服'\n4. 数值验证: 1000円是合理的捐赠额，好感度+5符合规则。\n→ 准备输出 UPDATE_PLAYER 和 UPDATE_NPC 指令。",
  "actions": [
    { "type": "UPDATE_PLAYER", "field": "money", "op": "subtract", "value": 1000 },
    { "type": "UPDATE_PLAYER", "field": "clothing", "op": "set", "value": "现代常服" },
    { "type": "UPDATE_NPC", "npcId": "reimu", "field": "mood", "op": "set", "value": "喜上眉梢，眼睛发亮" },
    { "type": "UPDATE_NPC", "npcId": "reimu", "field": "clothing", "op": "set", "value": "红白巫女服" },
    { "type": "UPDATE_NPC", "npcId": "reimu", "field": "favorability", "op": "add", "value": 5 },
    { "type": "UPDATE_NPC", "npcId": "reimu", "field": "inner_thought", "op": "set", "value": "太好了，这下此后的茶叶钱有着落了！" }
  ],
  "quick_replies": [
    "告诉她，能看到这么美的笑容就已足够",
    "得寸进尺，让灵梦晚上请吃顿饭",
    "严肃地建议她把钱用在神社修缮上",
    "礼貌地拒绝，表示这是基本礼仪"
  ],
  "summary": "{{玩家名}}向灵梦捐赠了 1000 円。"
}

# 可以进行的变量修改行为 (Supported Actions)
1. UPDATE_PLAYER: field (hp, max_hp, mp, max_mp, money, power, reputation, identity, location, time, date, clothing, etc.), op (add, subtract, set), value
2. UPDATE_NPC: npcId (UUID or Name), field (hp, max_hp, power, favorability, obedience, mood, relationship, clothing, posture, hands, mouth, face, chest, buttocks, residence, inner_thought, action), op (add, subtract, set), value
3. INVENTORY: target (items, spell_cards, authorities), op (push, remove), value
   - "items" target:
     - "value" CAN be a simple string (e.g. "Tea" or "红茶") OR a detailed object:
     - { "id": "english_id", "name": "中文物品名", "count": 1, "description": "中文描述...", "type": "material|equipment|special", "effects": { "hp": 10 } }
     - "op": "push" (Add/Stack item), "remove" (Remove item by ID or Name).
     - **LANGUAGE RULE**: 当你创建新物品时，"name" 和 "description" 字段必须使用**简体中文**（除非该物品原本就是外文名）。
     - **TYPE RULE**: "type" 字段必须严格从以下三个值中选择：
       1. "material" (素材/消耗品) - 包括食材、药水、制造材料等。
       2. "equipment" (装备) - 武器、防具、饰品等。
       3. "special" (特殊) - 任务物品、剧情道具、纪念品、以及所有不属于前两类的物品。
     - If the item is new or created by you, YOU MUST provide the detailed object to define its properties.
     - To remove an item, you can use: { "type": "INVENTORY", "target": "items", "op": "remove", "value": "Item ID or Name" }

   - "spell_cards" target:
     - "value" MUST be a detailed object for new spells:
     - { 
         "name": "中文符卡名", 
         "description": "中文符卡描述...", 
         "cost": 50, 
         "damage": 0, // Direct hit damage (Standard, subject to defense)
         "hitRate": 0.1, // 命中率 (Ignored dodge rate). Default 0.1 (10%). Ultimate should be 1.0 (100%).
         "scope": "single|aoe", 
         "type": "attack|buff", 
         "isUltimate": false,
         "buffDetails": { // REQUIRED for buff/debuff effects
            "name": "Effect Name",
            "duration": 3, // Set to 1 for instant/one-time True Damage or Heal
            "description": "Effect description",
            "effects": [
              // 1. "damage_over_time" (True Damage): Ignores defense, respects shield/dodge.
              //    Use this for Poison, Burn, or direct True Damage attacks.
              { "type": "damage_over_time", "value": 50 },
              // 2. "heal" (Healing): Restores HP.
              { "type": "heal", "value": 100 },
              // 3. "stat_mod" (Stats): Buff/Debuff stats.
              //    Allowed "targetStat" values: "attack" | "defense" | "dodge" | "damage_taken".
              //    IMPORTANT: DO NOT use non-combat stats (e.g. "crafting_quality", "luck", "cooking").
              //    Value 0.2 means +20%, -0.1 means -10%.
              { "type": "stat_mod", "targetStat": "attack", "value": 0.2 },
              // 4. "shield" (Shield): Adds shield points.
              { "type": "shield", "value": 200 }
            ],
            // **CRITICAL RULE FOR NON-COMBAT SPELLS**:
            // If the spell is narrative/utility (e.g. "Better Cooking", "Crafting Luck", "Polymerization"),
            // you MUST translate it into a COMBAT METAPHOR for the "effects" array.
            // - "Crafting Quality" -> "attack" (Precision) or "heal" (Restoration).
            // - "Luck" -> "dodge_mod" (Evasion) or "damage_reduction" (Safety).
            // - "Gathering" -> "heal" (Recover HP/MP) or "stat_mod" (Power Up).
            // DO NOT leave "effects" empty if type is "buff" or "debuff".
         }
       }
     - **Parameter Rules**:
       - "scope": "single" (单体) or "aoe" (全体).
       - "type": "attack", "buff" (增益), "debuff" (减益), "shield" (护盾).
       - "damage": For attacks, it is base damage. For buffs/shields, it is 0.
       - "hitRate": float, default 0.1. If isUltimate is true, it MUST be 1.0.
       - "isUltimate": boolean, true if this is an ultimate spell.
       - "cost": MP consumption (typically 30-100).
       - "buffDetails": MUST follow the same structure as defined in combat system for buffs/shields.

4. SCENE: location (new location name), add_chars (list of npc objects), remove_chars (list of npcIds)
   - 重要: 如果剧情中出现了新角色，或者玩家进入了新地点导致新角色在场，必须使用 "add_chars" 将其加入场景。
   - 重要: 如果角色离开了当前场景，必须使用 "remove_chars" 将其移除。
   - Example: { "type": "SCENE", "add_chars": [{ "id": "reimu", "name": "Reimu" }] }
   - DO NOT use "op" or "value" for SCENE actions. Use top-level fields "location", "add_chars", "remove_chars".
5. MINIGAME: trigger (boolean), type (string, e.g. "cooking"), difficulty (string)

# 物品/符卡标准化 (Item/Spell Standardization)
系统检测到剧情（LLM1）可能仅输出了物品或符卡的名字，导致其在状态中仅显示为 "暂无描述" 的占位符。
你的任务是在下一轮逻辑处理中修复这些数据。

1. **检测 (Detect)**: 
   - 检查 \`current_state.player.items\` 和 \`current_state.player.spell_cards\`。
   - 寻找 \`description\` 为 "暂无描述" 或 \`type\` 为 "other" (且显然不是普通杂物) 的项目。

2. **标准化 (Standardize)**:
   - 如果发现此类项目，必须生成一对指令来**替换**它：
     1. \`remove\`: 移除旧的占位符项目（使用名称）。
     2. \`push\`: 添加包含完整属性（中文描述、正确分类、战斗数值/效果）的新项目对象。

3. **示例**:
   - 假设玩家持有 \`{ "name": "绯红之王", "description": "暂无描述" }\`。
   - 你需要输出：
     { "type": "INVENTORY", "target": "spell_cards", "op": "remove", "value": "绯红之王" },
     { "type": "INVENTORY", "target": "spell_cards", "op": "push", "value": { "name": "绯红之王", "description": "抹除时间...", "cost": 80, ... } }

# Thinking思维链要求 (Chain of Thought Requirement)
在生成最终 JSON 之前，你必须在 "thinking" 字段中分析当前情况。请按以下步骤进行思考：
1. **剧情解析**: 实际上发生了什么？(例如：玩家送了礼物，或者被攻击了)
2. **变量识别**: 哪些变量受到影响？(例如：好感度应上升，HP应下降)。**特别注意**: 检查是否需要更新衣着(clothing)、姿势(posture)或关系(relationship)描述。
3. **物品/符卡检测**: 
      - **标准化检查**: 扫描 \`current_state\` 中是否有 "暂无描述" 的物品/符卡。如有，必须生成替换指令。
      - **新物品检测**: 本轮剧情是否明确提到了获得新物品、新符卡？
      - 若有，详细规划 INVENTORY 指令的参数（特别是新符卡的 buffDetails 战斗隐喻转换）。
4. **描述草拟**: 对于 face, mood, inner_thought, clothing, posture 等字段，先在脑海中构思一段生动的短描述。
5. **数值验证**: 检查数值变化是否合理 (例如 HP 不能低于 0，好感度不应一次加太多)。
6. **格式检查**: 确保输出的是合法的 JSON，不要被Markdown符号干扰。
`;


export class LogicService {
  
  /**
   * Remove large or unnecessary data from player object before sending to LLM
   */
  public sanitizePlayer(player: any) {
    if (!player) return player;
    const sanitized = { ...player };
    delete sanitized.avatarUrl;
    delete sanitized.referenceImageUrl;
    return sanitized;
  }

  async processLogic(
    userContent: string, 
    storyContent: string, 
    gameState: any
  ): Promise<LogicResult> {
    
    const settingsStore = useSettingsStore();
    const config = settingsStore.getEffectiveConfig('logic');
    
    if (!config.apiKey) {
      console.warn('Logic LLM not configured, skipping logic processing.');
      return { thinking: '', actions: [], quick_replies: [], summary: '' };
    }

    const openai = new OpenAI({
      baseURL: config.baseUrl,
      apiKey: config.apiKey,
      dangerouslyAllowBrowser: true
    });

    // Heuristic: Scan story for NPC names to include them in context
    // This ensures that if a pre-defined character appears, the Logic Model sees their initial stats
    // Enhanced: Scan previous 2 turns (approx 4 messages) + current content
    const chatStore = useChatStore();
    const recentMessages = chatStore.messages.slice(-4);
    const recentContext = recentMessages.map(m => m.content).join('\n');
    const scanText = recentContext + '\n' + userContent + '\n' + storyContent;

    const allNpcs = gameState.npcs ? Object.values(gameState.npcs) : [];
    const mentionedNpcs = allNpcs.filter((npc: any) => {
        if (!npc.name) return false;
        return scanText.includes(npc.name);
    });

    // Merge mentioned NPCs with current_scene_npcs (avoiding duplicates)
    const currentSceneIds = new Set(gameState.system.current_scene_npcs);
    const relevantNpcs = [...gameState.system.current_scene_npcs.map((id: string) => gameState.npcs[id] || { id, name: id })];
    
    for (const npc of mentionedNpcs) {
        // @ts-ignore
        if (!currentSceneIds.has(npc.id)) {
            // @ts-ignore
            relevantNpcs.push(npc);
        }
    }

    // Inject Difficulty Rules
    const difficulty = gameState.system?.difficulty || 'normal';
    let difficultyRules = '';
    
    if (difficulty === 'gentle') {
        difficultyRules = `1. **好感度 (Favorability)**:
   - 范围：[-100, 100]
   - 默认变化幅度：[-2, +5] (温柔世界：好感度容易提升)
   - 逻辑：NPC性格温和，容易对玩家产生好感。

2. **服从度 (Obedience)**:
   - 范围：[-100, 100]
   - 默认变化幅度：[-2, +5] (温柔世界：容易获得服从)
   - 逻辑：NPC比较顺从，容易被玩家折服。

3. **声望 (Reputation)**:
   - 范围：[-100, 100]
   - 特性：较易获取。行侠仗义或帮助他人即可获得声望。`;
    } else if (difficulty === 'cruel') {
        difficultyRules = `1. **好感度 (Favorability)**:
   - 范围：[-100, 100]
   - 默认变化幅度：[-8, +1] (残酷世界：好感度极难提升)
   - 逻辑：NPC冷漠且多疑，极难建立信任。

2. **服从度 (Obedience)**:
   - 范围：[-100, 100]
   - 默认变化幅度：[-8, +1] (残酷世界：极难获得服从)
   - 逻辑：除非展示绝对的力量碾压，否则很难让NPC服从。

3. **声望 (Reputation)**:
   - 范围：[-100, 100]
   - 特性：极难变化。仅在发生震动幻想乡的大事件时才可能变动。`;
    } else {
        difficultyRules = `1. **好感度 (Favorability)**:
   - 范围：[-100, 100]
   - 默认变化幅度：[-5, +2] (除非发生重大事件)
   - 逻辑：好感度很难提升，但容易因为冒犯行为而下降。

2. **服从度 (Obedience)**:
   - 范围：[-100, 100]
   - 默认变化幅度：[-5, +2]
   - 逻辑：类似于好感度，通常在玩家展示权威或力量时提升。

3. **声望 (Reputation)**:
   - 范围：[-100, 100]
   - 特性：极难变化。仅在“影响声望的重大公开事件”发生时才可变动。`;
    }

    const finalSystemPrompt = LOGIC_SYSTEM_PROMPT.replace('{{difficulty_rules}}', difficultyRules);

    const messages = [
      { role: 'system', content: finalSystemPrompt },
      { role: 'user', content: JSON.stringify({
          current_state: {
             player: this.sanitizePlayer(gameState.player),
             // Filter NPCs: Send those in current_scene_npcs AND those mentioned in the story
             scene_npcs: relevantNpcs
          },
          user_action: userContent,
          story_narrative: storyContent,
          minigame_result: gameState.system.minigame_result
        })
      }
    ];

    try {
      const response = await openai.chat.completions.create({
        model: config.model || 'gpt-3.5-turbo',
        messages: messages as any,
        temperature: 0.1, // Low temp for logic
        response_format: { type: "json_object" } // Force JSON if supported
      });

      let content = response.choices[0]?.message?.content;
      if (!content) throw new Error('Empty response from Logic LLM');

      // 0. Strip CoT (Chain of Thought) tags like <think>...</think>
      // This handles models that output internal reasoning (e.g. Gemini, DeepSeek)
      content = content.replace(/<think>[\s\S]*?<\/think>/gi, '');

      // Strip Markdown code blocks if present
      content = content.replace(/^```json\s*/, '').replace(/^```\s*/, '').replace(/\s*```$/, '');
      
      // Locate the JSON object (first '{' to last '}') to ignore conversational text
      const jsonStart = content.indexOf('{');
      const jsonEnd = content.lastIndexOf('}');
      if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
        content = content.substring(jsonStart, jsonEnd + 1);
      }

      // Helper to sanitize JSON (fix quotes, control chars, comments)
      const sanitizeJson = (str: string): string => {
        // Remove comments (simple C-style)
        str = str.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
        
        let result = '';
        let inString = false;
        let inSingle = false;
        let isEscaped = false;

        for (let i = 0; i < str.length; i++) {
          const char = str[i];

          if (!inString && !inSingle) {
            if (char === '"') {
              inString = true;
              result += char;
            } else if (char === "'") {
              inSingle = true;
              result += '"'; // Convert single quote start to double
            } else {
              result += char;
            }
          } else if (inString) {
            if (isEscaped) {
              isEscaped = false;
              result += '\\' + char;
            } else if (char === '\\') {
              isEscaped = true;
            } else if (char === '"') {
              inString = false;
              result += char;
            } else if (char === '\n') { result += '\\n'; }
            else if (char === '\r') { result += '\\r'; }
            else if (char === '\t') { result += '\\t'; }
            else {
              result += char;
            }
          } else if (inSingle) {
             if (isEscaped) {
               isEscaped = false;
               if (char === "'") result += "'"; // Unescape \' -> '
               else result += '\\' + char;
             } else if (char === '\\') {
               isEscaped = true;
             } else if (char === "'") {
               inSingle = false;
               result += '"'; // Convert single quote end to double
             } else if (char === '"') {
               result += '\\"'; // Escape double quote inside
             } else if (char === '\n') { result += '\\n'; }
             else if (char === '\r') { result += '\\r'; }
             else if (char === '\t') { result += '\\t'; }
             else {
               result += char;
             }
          }
        }
        return result;
      };

      const sanitizedContent = sanitizeJson(content);

      let result: LogicResult;
      try {
        result = JSON.parse(sanitizedContent) as LogicResult;
      } catch (parseError) {
        // If strict parse fails, try one more permissive fix for unquoted keys
        // Use a safer regex that requires preceding '{' or ',' to avoid matching text in strings
        try {
           const fixed = sanitizedContent.replace(/([{,]\s*)([a-zA-Z0-9_]+)(\s*:)/g, '$1"$2"$3');
           result = JSON.parse(fixed) as LogicResult;
        } catch (e2) {
           throw parseError; // Throw original error if fallback also fails
        }
      }

      return result;

    } catch (e: any) {
      console.error('Logic Processing Failed:', e);
      const toastStore = useToastStore();
      toastStore.addToast(`逻辑模型处理失败: ${e.message}`, 'error');
      
      // Fallback: return empty result so game doesn't crash
      return { 
        actions: [], 
        quick_replies: [], 
        summary: `Logic Error: ${e.message}`,
        thinking: `Logic processing failed. Error: ${e.message}`
      };
    }
  }

  /**
   * Generates a narrative description of the combat process based on logs.
   * This uses the Misc Model (LLM4) but with a specific "Narrator" persona.
   */
  async generateCombatNarrative(combatSummary: string, combatants: Combatant[] = [], contextText: string = ''): Promise<string> {
    const charStore = useCharacterStore();
    const gameStore = useGameStore();
    try {
      // 0. Build Character Persona Context
      let systemPrompt = COMBAT_NARRATOR_PROMPT;

      // Inject Context (Pre-combat dialogue)
      if (contextText) {
          systemPrompt += `\n\n# 战斗前置剧情 (Context)\n以下是触发本次战斗的剧情对话，请根据此语境（如双方的对话、冲突原因、语气）来润色战斗描写，使其自然衔接：\n"""\n${contextText}\n"""\n`;
      }

      // Inject Player Persona
      const player = gameStore.state.player;
      if (player) {
          let playerDesc = "暂无详细设定";
          let playerGlobalSetting = "无特殊设定";
          const rawPersona = player.persona || "";

          // If persona is JSON, extract text like we did in PromptBuilder/PromptService
          try {
             const jsonObj = JSON.parse(rawPersona);
             
             // 1. Text Persona
             if (jsonObj["详细人设"]) playerDesc = jsonObj["详细人设"];
             else if (jsonObj["补充设定"]) playerDesc = jsonObj["补充设定"];
             else playerDesc = "无特殊描述";

             // 2. Global Setting
             const settingObj = { ...jsonObj };
             if ('详细人设' in settingObj) delete settingObj['详细人设'];
             if ('补充设定' in settingObj) delete settingObj['补充设定'];
             playerGlobalSetting = JSON.stringify(settingObj, null, 2);

          } catch(e) {
             // Not JSON, use as is
             playerDesc = rawPersona;
          }
          
          systemPrompt += `\n\n# 主角人设 (Player Persona)\n姓名：${player.name}\n描述：${playerDesc}\n`;
          systemPrompt += `\n## Global User Setting (Player Origin/World Info)\n${playerGlobalSetting}\n`;
      }
      
      if (combatants && combatants.length > 0) {
        systemPrompt += "\n\n# 战斗场景其他角色人设 (Other Characters)\n请在描写中参考以下角色的性格与外貌设定：\n";
        
        for (const c of combatants) {
           // Skip Player if they are in the list (handled above)
           if (c.isPlayer) continue;

           // Try to find static data in Lorebook
           const resolvedId = resolveCharacterId(c.id || c.name, charStore.characters, gameStore.state.npcs);
           const staticChar = charStore.characters.find(ch => ch.uuid === resolvedId);
           
           const desc = staticChar?.description || "暂无详细设定";
           // Truncate desc if too long
           const safeDesc = desc.length > 300 ? desc.substring(0, 300) + "..." : desc;
           
           systemPrompt += `- **${c.name}**: ${safeDesc}\n`;
        }
      }

      // 1. Call API (Using LLM4 / Misc Model)
      // Note: We use 'misc' (LLM4) for text polishing as requested
      const content = await generateCompletion({
        modelType: 'misc',
        systemPrompt,
        messages: [{ role: 'user', content: combatSummary }],
        temperature: 0.7, // Higher creativity for narration
        max_tokens: 3000
      });
      
      return content.trim();

    } catch (e: any) {
      console.error('Combat Narration Failed:', e);
      const toastStore = useToastStore();
      toastStore.addToast(`战斗战报生成失败: ${e.message}`, 'error');
      // Fallback: return original summary if AI fails
      return `(战斗描写生成失败，以下是原始记录)\n${combatSummary}`;
    }
  }
}

export const logicService = new LogicService();
