import { generateCompletion } from '@/services/llm';
import { ZonePopulator } from '@/services/management/ZonePopulator';

export interface MapData {
  layout: string[];
  // floors?: Record<string, string[]>; // Removed: Single floor only
  theme: string;
  description: string;
}

// Zone Types from LLM
export type ZoneChar = '#' | '.' | 'K' | 'D' | 'W' | 'E' | 'L' | 'R'; 
// #: Wall, .: Floor (Generic), K: Kitchen, D: Dining, W: Walkway, E: Entrance, L: Lounge, R: Restroom

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

export async function generateMap(theme: string = "cozy wooden izakaya", context: string = "", previousMap?: MapData, throwOnError: boolean = false): Promise<MapData> {
  try {
    let userContent = `Generate a ZONE map with the theme: ${theme}`;
    if (context) {
        userContent += `\nContext: ${context}`;
    }
    
    if (previousMap) {
        userContent += `\n\n**RENOVATION TASK**: Redesign the zones based on the new theme. Previous layout is irrelevant as we are rezoning.`;
    }

    console.log(`[MapGenerator] Starting ZONE generation... Theme: "${theme}"`);

    const response = await generateCompletion({
      modelType: 'misc', 
      systemPrompt: MAP_GENERATION_PROMPT,
      messages: [
        { role: 'user', content: userContent }
      ],
      jsonMode: false,
      temperature: 0.7
    });

    console.log("[MapGenerator] Raw LLM Response:", response);

    let jsonStr = response;
    const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/i) || response.match(/```\s*([\s\S]*?)\s*```/);
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

    if (!jsonStr || jsonStr.length < 10) throw new Error("Invalid JSON");

    let data;
    try {
        // Remove comments (// ...)
        jsonStr = jsonStr.replace(/\/\/.*$/gm, '');
        // Remove multi-line comments (/* ... */)
        jsonStr = jsonStr.replace(/\/\*[\s\S]*?\*\//g, '');

        // Simple cleanup
        jsonStr = jsonStr.replace(/,\s*}/g, '}').replace(/,\s*]/g, ']');
        data = JSON.parse(jsonStr);
    } catch (e) {
        console.error("JSON Parse Error", e);
        throw e;
    }

    if (!data || !Array.isArray(data.layout)) {
        throw new Error("Invalid map data: Missing layout.");
    }

    // --- POPULATE ZONES ---
    console.log("[MapGenerator] Populating Ground Floor...");
    const populator1 = new ZonePopulator(data.layout); // Ground Floor
    data.layout = populator1.generate();

    // if (data.floors) {
    //     for (const key in data.floors) {
    //         console.log(`[MapGenerator] Populating Floor ${key}...`);
    //         const populator = new ZonePopulator(data.floors[key], false); // Upper Floors
    //         data.floors[key] = populator.generate();
    //     }
    // }
    
    console.log("[MapGenerator] Map generated successfully.");

    return data;

  } catch (error) {
    console.error("Failed to generate map:", error);
    
    if (throwOnError) {
        throw error;
    }

    console.log("Using fallback map due to error.");
    // Fallback map (Standard Tile Map)
    return {
      theme: "default",
      description: "Fallback Map",
      layout: [
        "####################",
        "#,,,,S,O,B,,,,,,,,,#",
        "#,,,,,,,,P,,,,,,,,,#",
        "#CCCCCCCCCC........#",
        "#..........T..T....#",
        "#..........h..h....#",
        "#..................#",
        "#...T..T...........#",
        "#...h..h...........#",
        "#..................#",
        "#..................#",
        "#..................#",
        "#..................#",
        "#..................#",
        "##########E#########"
      ]
    };
  }
}
