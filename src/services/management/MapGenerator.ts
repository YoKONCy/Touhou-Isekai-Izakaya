import { generateCompletion } from '@/services/llm';
import { ZonePopulator } from '@/services/management/ZonePopulator';

export interface MapData {
  layout: string[];
  floors?: Record<string, string[]>; // Optional: Multiple floors support (Key: "1", "2", etc.)
  theme: string;
  description: string;
}

// Zone Types from LLM
export type ZoneChar = '#' | '.' | 'K' | 'D' | 'W' | 'E' | 'L' | 'B' | 'S' | 'R'; 
// #: Wall, .: Floor (Generic), K: Kitchen, D: Dining, W: Walkway, E: Entrance, L: Lounge, B: Bedroom, S: Stairs, R: Restroom
// S is MANDATORY for multi-floor maps.

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
- \`B\`: **Bedroom Zone** (Residential area. Beds will be placed here. **ONLY ON 2ND FLOOR**.)
- \`R\`: **Restroom Zone** (Bathroom/Toilet area. Private.)
- \`E\`: **Entrance Zone** (Where customers enter. **MUST BE ON THE BOTTOM WALL**.)
- \`S\`: **Stairs Zone** (Location of stairs to other floors. Place on a wall or walkway.)

**Reference Template (Zone Map):**
####################
#KKKKKKKKK..DDDDDDD#  <-- Kitchen at top left, Dining at right
#KKKKKKKKK..DDDDDDD#
#KKKKKKKKK..DDDDDDD#
#WWWWWWWWWWWWWWWWWW#  <-- Main horizontal walkway (Clear path!)
#DDDDDDDD...DDDDDDD#
#DDDDDDDD...RRRR...#  <-- Restroom near Dining
#DDDDDDDD...RRRR...#
#...........WW.....#
#...........WW.....#
#...........WW.....#
#...........EE.....#  <-- Entrance at bottom wall (y=13 or 14)
####################

**Constraints:**
1. **Grid Size**: 20 columns x 15 rows.
2. **Connectivity**: 
   - Draw a clear **Walkway (W)** connecting the Entrance (E) to the Dining Zones (D) and Kitchen (K).
   - The Walkway (W) ensures that players and customers can move freely. **Do not block it.**
3. **Kitchen (K)**:
   - Must be a contiguous block (e.g., rectangle).
   - Usually at the top or side.
4. **Dining (D)**:
   - Large open areas for tables.
5. **Multi-floor Support**:
   - If requested (or implied by theme), generate a second floor layout.
   - Use 'B' (Bedroom) and 'L' (Lounge) for the second floor.
   - **Stairs ('S')**: **MANDATORY** if there is a second floor. Place it logically (e.g., at the back wall or connected to a walkway).
   - **Stairs Size**: Stairs must be at least **2x2** (2 tiles wide, 2 tiles high) to allow proper movement. **Avoid 1-tile high stairs.**
   - Ensure the 'S' position is consistent across floors if possible (or just logical).
6. **Entrance (E)**:
    - **MUST** be located on the **BOTTOM WALL** (last row or second to last row).
    - Do not place 'E' in the middle of the room.
7. **Zone Consolidation (CRITICAL)**:
    - **AVOID FRAGMENTATION**: Do NOT create many small, isolated rooms (e.g., many 3x3 blocks).
    - **PREFER LARGE ZONES**: Create large, contiguous areas for Dining (D), Bedroom (B), and Lounge (L).
    - **LAYOUT LOGIC**: Group similar zones. For example, have one large Master Bedroom block rather than 3 tiny separate bedrooms.
    - **HALLWAY DESIGN**: The Walkway (W) should be a simple corridor connecting these large zones, not a maze.
8. **Wall Thickness & Efficiency**:
    - **SINGLE THICKNESS**: Internal walls and Map Boundaries should only be **1 TILE THICK** (\`#\`). Do NOT generate double or triple walls (e.g., \`##\` or \`###\`).
    - **MAXIMIZE SPACE**: Expand the rooms (K, D, L) to fill the grid width (20). Do not pad the right side with extra walls.
9. **Minimum Zone Size (MANDATORY)**:
    - **MINIMUM 4x4**: Every functional zone (K, D, L, B) MUST be at least **4 TILES WIDE** and **4 TILES HIGH**.
    - **REASON**: The game engine builds walls *inside* the zone edges. A 3-tile high zone results in only 1 tile of usable space (Wall-Floor-Wall), which is unusable.
    - **VIOLATION EXAMPLE**: A 3-tile high Lounge (\`LLL\`) is **FORBIDDEN**. Make it 4 or 5 tiles high.

**Step-by-Step Thinking:**
1. **Zoning**: How should I split the room? Where is the Kitchen? Where is the Dining?
2. **Dimensions Check**: Are all my rooms (K, D, L, B) at least **4x4**? If any are 3 tiles wide/high, I MUST expand them.
3. **Wall Check**: Did I draw thick walls (\`##\`)? If so, remove the extra '#' and expand the room.
4. **Pathing**: Is there a continuous 'W' (or '.') path from 'E' to all 'D' and 'K' areas?
5. **Expansion**: If 2nd floor is needed, where do the stairs ('S') go? **I MUST place 'S'.**
6. **Entrance**: Is 'E' at the bottom edge?
7. **Review**: Are the rooms large and usable? Did I accidentally make many tiny rooms? (If so, merge them!)

**Output Format:**
<thinking>
...
</thinking>

\`\`\`json
{
  "theme": "string",
  "description": "string",
  "layout": [ ... ], // The Ground Floor Zone Map
  "floors": {        // Optional
     "2": [ ... ]    // Second Floor Zone Map
  }
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
    const populator1 = new ZonePopulator(data.layout, true); // Ground Floor
    data.layout = populator1.generate();

    if (data.floors) {
        for (const key in data.floors) {
            console.log(`[MapGenerator] Populating Floor ${key}...`);
            const populator = new ZonePopulator(data.floors[key], false); // Upper Floors
            data.floors[key] = populator.generate();
        }
    }
    
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
