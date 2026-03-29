import { generateCompletion } from '@/services/llm';
import { ZonePopulator } from '@/services/management/ZonePopulator';
import { useSettingsStore } from '@/stores/settings';

export interface MapData {
  layout: string[];
  // floors?: Record<string, string[]>; // 已移除设计：当前已被限制为仅支持单楼层
  theme: string;
  description: string;
}

export const DEFAULT_MAP_DATA: MapData = {
  theme: 'default',
  description: 'Standard Izakaya Layout',
  layout: [
    '####################',
    '#,,,,S,O,B,,,,,,,,,#',
    '#,,,,,,,,P,,,,,,,,,#',
    '#CCCCCCCCCC........#',
    '#..........T..T....#',
    '#..........h..h....#',
    '#..................#',
    '#...T..T...........#',
    '#...h..h...........#',
    '#..................#',
    '#..................#',
    '#..................#',
    '#..................#',
    '#..................#',
    '##########E#########'
  ]
};

// 来自 LLM 的区域设定标识
export type ZoneChar = '#' | '.' | 'K' | 'D' | 'W' | 'E' | 'L' | 'R';
// #: 边界墙体, .: 泛用地板, K: 后厨重地, D: 吃饭就餐区, W: 行走过道, E: 门店入口, L: 休息待客区, R: 卫生洗手间

const MAP_GENERATION_PROMPT = `
You are a level designer for a pixel art izakaya management game.
Your task is to generate a **ZONING MAP** based on the provided theme and constraints.

**INSTRUCTION: DO NOT PLACE FURNITURE (Tables, Chairs, Counters). ONLY PAINT ZONES.**

**Zone Symbols:**
- \`#\`: Wall (Boundaries)
- \`K\`: **Kitchen Zone** (Where cooking happens. Staff only.)
- \`D\`: **Dining Zone** (Where customers eat. Tables will be placed here.)
- \`W\`: **Walkway / Hallway** (Main paths. **MUST BE KEPT CLEAR**. No furniture will be placed here.)
- \`L\`: **Lounge Zone** (Relaxation area. Sofas/Coffee tables will be placed here.)
- \`R\`: **Restroom Zone** (Bathroom/Toilet area. Private.)
- \`E\`: **Entrance Zone** (Where customers enter. **MUST BE ON THE BOTTOM WALL**.)

**Constraints:**
1. **Map Size**: 20 Columns x 15 Rows.
2. **Boundaries**: The outer edges MUST be Walls (\`#\`) or Entrance (\`E\`).
3. **Connectivity**: All zones must be accessible via Walkways (\`W\`).
4. **Kitchen**: Must be at least 3x3.
5. **Entrance**: Must be at least 2 tiles wide on the BOTTOM row.
6. **Dining**: Maximize dining space.
7. **Single Floor**: The izakaya is a single-story building. Do not include stairs.

**Output Format:**
Return ONLY a JSON object.
\`\`\`json
{
  "theme": "Brief description of the visual theme",
  "description": "Short explanation of the layout logic",
  "layout": [
    "####################",
    "#K...W....D........#",
    ... (20x15 grid strings)
  ]
}
\`\`\`

**Step-by-Step Thinking:**
1. **Zoning**: How should I split the room? Where is the Kitchen? Where is the Dining?
2. **Dimensions Check**: Are all my rooms (K, D, L, B) at least **4x4**? If any are 3 tiles wide/high, I MUST expand them.
3. **Wall Check**: Did I draw thick walls (\`##\`)? If so, remove the extra '#' and expand the room.
4. **Pathing**: Is there a continuous 'W' (or '.') path from 'E' to all 'D' and 'K' areas?
5. **Entrance**: Is 'E' at the bottom edge?
6. **Review**: Are the rooms large and usable? Did I accidentally make many tiny rooms? (If so, merge them!)

**Output Format:**
<thinking>
...
</thinking>

\`\`\`json
{
  "theme": "string",
  "description": "string",
  "layout": [ ... ] // The Ground Floor Zone Map
}
\`\`\`
`;

export async function generateMap(
  theme: string = 'cozy wooden izakaya',
  context: string = '',
  previousMap?: MapData,
  throwOnError: boolean = false
): Promise<MapData> {
  const settingsStore = useSettingsStore();

  // 调试专用: 若设置中启用则强制走一遍缺省默认样本地图流程
  if (settingsStore.useDefaultTilemap) {
    console.log('[地图生成器] 调试模式: 使用默认地图数据。');
    return JSON.parse(JSON.stringify(DEFAULT_MAP_DATA));
  }

  try {
    let userContent = `Generate a ZONE map with the theme: ${theme}`;
    if (context) {
      userContent += `\nContext: ${context}`;
    }

    if (previousMap) {
      userContent += `\n\n**RENOVATION TASK**: Redesign the zones based on the new theme. Previous layout is irrelevant as we are rezoning.`;
    }

    console.log(`[地图生成器] 开始生成区域... 主题: "${theme}"`);

    const response = await generateCompletion({
      modelType: 'misc',
      systemPrompt: MAP_GENERATION_PROMPT,
      messages: [{ role: 'user', content: userContent }],
      jsonMode: false,
      temperature: 0.7
    });

    console.log('[地图生成器] LLM 原始响应:', response);

    let jsonStr = response;
    const jsonMatch =
      response.match(/```json\s*([\s\S]*?)\s*```/i) || response.match(/```\s*([\s\S]*?)\s*```/);
    if (jsonMatch && jsonMatch[1]) {
      jsonStr = jsonMatch[1];
    } else {
      jsonStr = jsonStr.replace(/<thinking>[\s\S]*?<\/thinking>/gi, '').trim();
      const firstBrace = jsonStr.indexOf('{');
      const lastBrace = jsonStr.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1) {
        jsonStr = jsonStr.substring(firstBrace, lastBrace + 1);
      }
    }

    if (!jsonStr || jsonStr.length < 10) throw new Error('Invalid JSON');

    let data;
    try {
      // 从结果中清理丢弃掉带单行斜杠的闲余注释语块 (// ...)
      jsonStr = jsonStr.replace(/\/\/.*$/gm, '');
      // 清除抹去那囊括其中的夹杂做多行块状形式备注代码 (/* ... */)
      jsonStr = jsonStr.replace(/\/\*[\s\S]*?\*\//g, '');

      // 最根本基础款的净空打底净化
      jsonStr = jsonStr.replace(/,\s*}/g, '}').replace(/,\s*]/g, ']');
      data = JSON.parse(jsonStr);
    } catch (e) {
      console.error('JSON 解析错误', e);
      throw e;
    }

    if (!data || !Array.isArray(data.layout)) {
      throw new Error('Invalid map data: Missing layout.');
    }

    // --- 初始化区域装载开始 ---
    console.log('[地图生成器] 正在填充一楼...');
    const populator1 = new ZonePopulator(data.layout); // 初始化一楼（基底主楼层）
    data.layout = populator1.generate();

    // 预留的后续翻修多楼层建筑填充口 (该部代码暂行搁置废留)
    // if (data.floors) {
    //     for (const key in data.floors) {
    //         console.log(`[MapGenerator] Populating Floor ${key}...`);
    //         const populator = new ZonePopulator(data.floors[key], false); // 上端的高层们
    //         data.floors[key] = populator.generate();
    //     }
    // }

    console.log('[地图生成器] 地图生成成功。');

    return data;
  } catch (error) {
    console.error('地图生成失败:', error);

    if (throwOnError) {
      throw error;
    }

    console.log('由于错误使用回退地图。');
    // 提供保底容错垫底项用的候补老备选图集 (标准常规默认款老瓦片地图档)
    return JSON.parse(JSON.stringify(DEFAULT_MAP_DATA));
  }
}
