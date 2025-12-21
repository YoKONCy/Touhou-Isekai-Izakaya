
// Zone Types from LLM
export type ZoneChar = '#' | '.' | 'K' | 'D' | 'W' | 'E' | 'L' | 'B' | 'S' | 'R'; 
// #: Wall, .: Floor (Generic), K: Kitchen, D: Dining, W: Walkway, E: Entrance, L: Lounge, B: Bedroom, S: Stairs, R: Restroom

interface Point {
    x: number;
    y: number;
}

interface Zone {
    type: ZoneChar;
    cells: Point[];
}

export class ZonePopulator {
    private layout: string[];
    private width: number;
    private height: number;
    private resultMap: string[][]; // Working copy of the final tile map
    private isGroundFloor: boolean;
    private reservedCells: Set<string> = new Set(); // Cells reserved for doors/paths

    constructor(zoneLayout: string[], isGroundFloor: boolean = true) {
        this.layout = zoneLayout;
        this.isGroundFloor = isGroundFloor;
        this.height = zoneLayout.length;
        this.width = zoneLayout[0]?.length || 0;
        
        // Initialize resultMap with empty floors or walls based on input
        this.resultMap = zoneLayout.map(row => row.split('').map(char => {
            if (char === '#') return '#';
            return '.'; // Default base floor
        }));
    }

    public generate(): string[] {
        // 0. Pre-processing: Generate Internal Walls between Rooms
        this.generateInternalWalls();

        // 0.1 Ensure Connectivity (Break walls for trapped zones)
        this.ensureZoneConnectivity();

        // 0.2 Ensure Global Connectivity (Fix Dead Ends / Unreachable Areas)
        this.ensureGlobalConnectivity();

        // 0.3 Fix Diagonal Walls (Prevent leaks)
        this.fixDiagonalWalls();

        const zones = this.identifyZones();

        // 1. Process Walkways first (High priority, keep clear)
        this.processWalkways(zones.filter(z => z.type === 'W' || z.type === 'E'));

        // 2. Process Kitchen (Needs counters at boundaries)
        this.processKitchens(zones.filter(z => z.type === 'K'));

        // 3. Process Dining (Tables)
        this.processDining(zones.filter(z => z.type === 'D'));

        // 4. Process Living Areas (Bedroom/Lounge/Restroom)
        this.processLiving(zones.filter(z => z.type === 'B' || z.type === 'L'));
        this.processRestroom(zones.filter(z => z.type === 'R'));

        // 5. Decorate Walls (Windows) & Stairs
        this.decorateWalls();
        this.processStairs(zones.filter(z => z.type === 'S'));

        // 6. Final Cleanup (Ensure Exits)
        if (this.isGroundFloor) {
            this.ensureExits();
        }

        return this.resultMap.map(row => row.join(''));
    }

    private ensureGlobalConnectivity() {
        // Run BFS from Main Entrance 'E' (or 'S' if upstairs) to find all reachable cells.
        // This ensures that all components are connected to the MAIN entry point.
        
        let startPoint: Point | null = null;
        
        // Priority: E > S/H > First Floor
        // Search for E
        for(let y=0; y<this.height; y++) {
            for(let x=0; x<this.width; x++) {
                if (this.getTile(x, y) === 'E') {
                    startPoint = {x, y};
                    break;
                }
            }
            if (startPoint) break;
        }

        // Search for S or H if no E
        if (!startPoint) {
             for(let y=0; y<this.height; y++) {
                for(let x=0; x<this.width; x++) {
                    const t = this.getTile(x, y);
                    if (t === 'S' || t === 'H') {
                        startPoint = {x, y};
                        break;
                    }
                }
                if (startPoint) break;
            }
        }
        
        // Fallback: First floor tile
        if (!startPoint) {
             for(let y=0; y<this.height; y++) {
                for(let x=0; x<this.width; x++) {
                    const t = this.getTile(x, y);
                    if (t !== '#') {
                        startPoint = {x, y};
                        break;
                    }
                }
                if (startPoint) break;
            }
        }

        if (!startPoint) return;

        const reachable = new Set<string>();
        const queue: Point[] = [startPoint];
        reachable.add(`${startPoint.x},${startPoint.y}`);

        while(queue.length > 0) {
            const curr = queue.shift()!;
            
            const neighbors = [
                {x: curr.x, y: curr.y-1}, {x: curr.x, y: curr.y+1},
                {x: curr.x-1, y: curr.y}, {x: curr.x+1, y: curr.y}
            ];

            for(const n of neighbors) {
                if (n.x < 0 || n.x >= this.width || n.y < 0 || n.y >= this.height) continue;
                const key = `${n.x},${n.y}`;
                if (reachable.has(key)) continue;

                const tile = this.getTile(n.x, n.y);
                // Passable tiles: anything NOT '#'.
                // Note: Furniture isn't placed yet, so we only see '.', 'K', 'D', 'W', etc.
                if (tile !== '#') {
                    reachable.add(key);
                    queue.push(n);
                }
            }
        }

        // Identify Unreachable Floor Cells
        const unreachableGroups: Point[][] = [];
        const visitedUnreachable = new Set<string>();

        for(let y=0; y<this.height; y++) {
            for(let x=0; x<this.width; x++) {
                const key = `${x},${y}`;
                const tile = this.getTile(x, y);
                if (tile !== '#' && !reachable.has(key) && !visitedUnreachable.has(key)) {
                    // Found an unreachable cell. Flood fill to find the whole group.
                    const group: Point[] = [];
                    const gQueue: Point[] = [{x, y}];
                    visitedUnreachable.add(key);

                    while(gQueue.length > 0) {
                        const gc = gQueue.shift()!;
                        group.push(gc);

                        const neighbors = [
                            {x: gc.x, y: gc.y-1}, {x: gc.x, y: gc.y+1},
                            {x: gc.x-1, y: gc.y}, {x: gc.x+1, y: gc.y}
                        ];
                        for(const gn of neighbors) {
                            if (gn.x < 0 || gn.x >= this.width || gn.y < 0 || gn.y >= this.height) continue;
                            const gKey = `${gn.x},${gn.y}`;
                            if (!visitedUnreachable.has(gKey) && !reachable.has(gKey) && this.getTile(gn.x, gn.y) !== '#') {
                                visitedUnreachable.add(gKey);
                                gQueue.push(gn);
                            }
                        }
                    }
                    unreachableGroups.push(group);
                }
            }
        }

        // Connect unreachable groups
        unreachableGroups.forEach(group => {
            // Find the cell in group that is closest to ANY reachable cell
            // (Manhattan distance)
            // let bestCandidate: { start: Point, target: Point, dist: number } | null = null;

            // Optimization: Just check boundary of group?
            // Iterate all group cells, check distance to all reachable cells? Too slow O(N*M).
            // Better: BFS from group outwards until we hit a reachable cell.
            
            const searchQueue: {p: Point, dist: number, parent?: Point}[] = group.map(p => ({p, dist: 0}));
            const searchVisited = new Set<string>(group.map(p => `${p.x},${p.y}`));
            
            // Allow searching through walls to find path
            let foundPath: Point[] = [];
            
            // Map to reconstruct path
            const parentMap = new Map<string, Point>();

            while(searchQueue.length > 0) {
                const {p, dist} = searchQueue.shift()!;
                
                if (reachable.has(`${p.x},${p.y}`)) {
                    // Found connection!
                    // Backtrack
                    let curr: Point | undefined = p;
                    while(curr) {
                        foundPath.push(curr);
                        const parent = parentMap.get(`${curr.x},${curr.y}`);
                        if (parent && group.some(g => g.x === parent.x && g.y === parent.y)) {
                             // Parent is in start group, we are done
                             foundPath.push(parent); 
                             break;
                        }
                        curr = parent;
                    }
                    break;
                }

                const neighbors = [
                    {x: p.x, y: p.y-1}, {x: p.x, y: p.y+1},
                    {x: p.x-1, y: p.y}, {x: p.x+1, y: p.y}
                ];

                for(const n of neighbors) {
                     if (n.x < 0 || n.x >= this.width || n.y < 0 || n.y >= this.height) continue;
                     const key = `${n.x},${n.y}`;
                     if (!searchVisited.has(key)) {
                         searchVisited.add(key);
                         parentMap.set(key, p);
                         searchQueue.push({p: n, dist: dist+1});
                     }
                }
            }

            // Dig the path
            foundPath.forEach(p => {
                if (this.getTile(p.x, p.y) === '#') {
                    this.setTile(p.x, p.y, '.');
                    this.reservedCells.add(`${p.x},${p.y}`);
                    // Also reserve neighbors to ensure width? No, 1 tile is enough.
                }
                reachable.add(`${p.x},${p.y}`);
            });
        });
    }

    private fixDiagonalWalls() {
        // Iterate through all 2x2 blocks to find diagonal gaps
        for(let y=0; y<this.height-1; y++) {
            for(let x=0; x<this.width-1; x++) {
                const tl = this.getTile(x, y);     // Top-Left
                const tr = this.getTile(x+1, y);   // Top-Right
                const bl = this.getTile(x, y+1);   // Bottom-Left
                const br = this.getTile(x+1, y+1); // Bottom-Right
                
                // Pattern 1: Wall at TL and BR (Diagonal Walls)
                // # .
                // . #
                if (tl === '#' && br === '#' && tr !== '#' && bl !== '#') {
                    // Fill one gap to block diagonal
                    // We fill Top-Right to close it
                    this.setTile(x+1, y, '#');
                }
                
                // Pattern 2: Wall at TR and BL
                // . #
                // # .
                if (tr === '#' && bl === '#' && tl !== '#' && br !== '#') {
                    // Fill Top-Left
                    this.setTile(x, y, '#');
                }
            }
        }
    }

    private ensureZoneConnectivity() {
        // Ensure every zone (K, D, B, L, R) has at least one connection to W, D, L, or E
        // This handles cases where layout has '#' surrounding a zone (like Kitchen).
        const zones = this.identifyZones();
        
        zones.forEach(zone => {
            if (['#', 'W', 'E', '.', 'S'].includes(zone.type)) return;

            // Check if already connected (has a neighbor that is reachable)
            // Or just check if any boundary cell is adjacent to a passable tile in resultMap?
            // Note: resultMap might still have '#' from layout initialization if we haven't processed it.
            // But we ran generateInternalWalls.
            
            // Find a spot to punch a hole if needed
            // Iterate all boundary cells (cells in zone adjacent to non-zone)
            const potentialExits: {cell: Point, neighbor: Point, nType: string, priority: number}[] = [];

            let hasExit = false;

            zone.cells.forEach(cell => {
                const neighbors = [
                    {x: cell.x, y: cell.y-1}, {x: cell.x, y: cell.y+1},
                    {x: cell.x-1, y: cell.y}, {x: cell.x+1, y: cell.y}
                ];
                
                for (const n of neighbors) {
                    if (n.x < 0 || n.x >= this.width || n.y < 0 || n.y >= this.height) continue;
                    
                    const nType = this.getZoneChar(n.x, n.y);
                    const nTile = this.getTile(n.x, n.y); // Current tile map state

                    if (nType === zone.type) continue; // Same zone

                    // If we found a passable tile adjacent, we are good?
                    // Passable: '.', 'W', 'E', 'D', 'L'
                    // If neighbor is '#' in tileMap, it's a wall.
                    // If neighbor is '.' in tileMap, it's an exit.
                    
                    if (nTile !== '#') {
                        hasExit = true;
                        // Mark this cell as reserved to prevent blocking existing exit
                        this.reservedCells.add(`${cell.x},${cell.y}`);
                    } else {
                        // It's a wall. Potential breakout point.
                        // Check what is BEHIND the wall.
                        // We want to break a wall that leads to W/D/L/E.
                        let priority = 0;
                        const nNeighbors = [
                            {x: n.x, y: n.y-1}, {x: n.x, y: n.y+1},
                            {x: n.x-1, y: n.y}, {x: n.x+1, y: n.y}
                        ];
                        
                        for (const nn of nNeighbors) {
                            if (nn.x < 0 || nn.x >= this.width || nn.y < 0 || nn.y >= this.height) continue;
                            const nnType = this.getZoneChar(nn.x, nn.y);
                            if (['W', 'D', 'L', 'E'].includes(nnType)) {
                                priority = 100; // Found a path!
                                // Boost priority for W
                                if (nnType === 'W') priority = 150;
                                break;
                            }
                        }

                        potentialExits.push({cell, neighbor: n, nType, priority});
                    }
                }
            });

            if (!hasExit && potentialExits.length > 0) {
                // Sort exits by priority
                potentialExits.sort((a, b) => b.priority - a.priority);

                // Pick the best one
                const best = potentialExits[0];
                
                if (best) {
                    // Punch hole in the wall (neighbor)
                    this.setTile(best.neighbor.x, best.neighbor.y, '.');
                    
                    // Mark reserved
                    this.reservedCells.add(`${best.neighbor.x},${best.neighbor.y}`); // The door itself
                    this.reservedCells.add(`${best.cell.x},${best.cell.y}`);         // The cell inside adjacent to door
                }
            }
        });
    }

    private generateInternalWalls() {
        // Create walls between distinct zones (specifically Bedrooms, Restrooms, Lounges)
        // Iterate through all cells

        // We need to identify zone blobs first to assign doors correctly to each room
        const zones = this.identifyZones();
        
        zones.forEach((zone) => {
            // Only enclose private/semi-private rooms
            if (!['B', 'R', 'L'].includes(zone.type)) return;

            const zoneWallPoints: Point[] = [];

            zone.cells.forEach(cell => {
                const neighbors = [
                    {x: cell.x, y: cell.y-1}, {x: cell.x, y: cell.y+1},
                    {x: cell.x-1, y: cell.y}, {x: cell.x+1, y: cell.y}
                ];

                for (const n of neighbors) {
                    // Check if neighbor is valid
                    if (n.x < 0 || n.x >= this.width || n.y < 0 || n.y >= this.height) continue;
                    
                    const myType = zone.type;
                    const nType = this.getZoneChar(n.x, n.y);
                    
                    // If neighbor is different type and not a Wall '#'
                    // We should place a wall.
                    // But we don't want to place wall on 'W' (Walkway) usually, 
                    // we want to place it on 'B's edge.
                    // The 'cell' is in 'B'. So we turn 'cell' into '#'.
                    
                    if (nType !== myType && nType !== '#') {
                        // Mark this cell as a wall candidate
                        // But wait, if we mark it, it's no longer 'B'.
                        // We should do it.
                        // But we need to ensure we don't block everything.
                        
                        // Only build wall if neighbor is Walkway, Lounge, Dining, etc.
                        // If neighbor is another B? (Adjacent bedrooms). Yes, separate them.
                        // But getZoneChar uses raw layout. Adjacent B's in raw layout might be same zone blob.
                        // If they are different blobs? identifyZones merges adjacent same-chars.
                        // So adjacent B's are one zone. We don't separate them internally (unless we want to subdivision).
                        // For now, assume one blob = one room.
                        
                        zoneWallPoints.push(cell);
                        break; // One neighbor diff is enough
                    }
                }
            });

            // Apply walls
            // But we need to leave a door!
            // Door should connect to Walkway 'W' preferably, or 'L', or 'D'.
            // Priority: W > L > D > others.
            
            // Sort wall points by adjacency to Walkway
            const doorSpots = zoneWallPoints.filter(p => {
                // Check neighbors again for W
                 const neighbors = [
                    {x: p.x, y: p.y-1}, {x: p.x, y: p.y+1},
                    {x: p.x-1, y: p.y}, {x: p.x+1, y: p.y}
                ];
                return neighbors.some(n => {
                    if (n.x < 0 || n.x >= this.width || n.y < 0 || n.y >= this.height) return false;
                    return this.getZoneChar(n.x, n.y) === 'W';
                });
            });
            
            let finalDoorSpots = doorSpots;
            
            // If no W neighbor, try L or D
            if (finalDoorSpots.length === 0) {
                 finalDoorSpots = zoneWallPoints.filter(p => {
                    const neighbors = [
                        {x: p.x, y: p.y-1}, {x: p.x, y: p.y+1},
                        {x: p.x-1, y: p.y}, {x: p.x+1, y: p.y}
                    ];
                    return neighbors.some(n => {
                        if (n.x < 0 || n.x >= this.width || n.y < 0 || n.y >= this.height) return false;
                        const t = this.getZoneChar(n.x, n.y);
                        return t === 'L' || t === 'D';
                    });
                });
            }
            
            // If still none, just pick any wall (connect to whatever)
            if (finalDoorSpots.length === 0) {
                finalDoorSpots = zoneWallPoints;
            }

            // Pick a door spot (Random or centered?)
            // Random is fine.
            const doorPos = finalDoorSpots.length > 0 ? finalDoorSpots[Math.floor(Math.random() * finalDoorSpots.length)] : null;
            
            // Apply changes
            zoneWallPoints.forEach(p => {
                if (doorPos && p.x === doorPos.x && p.y === doorPos.y) {
                    // It's a door, keep as floor '.' (or set to special door tile if we had one, but '.' is fine for open door)
                    // We might want to clear it explicitly
                    this.setTile(p.x, p.y, '.');
                    
                    // Mark Reserved
                    this.reservedCells.add(`${p.x},${p.y}`);

                    // Also reserve the neighbor inside the room?
                    // p is inside the room (it was a B cell). So p is the internal tile that became a door?
                    // Wait. logic: `zoneWallPoints` are cells IN the zone.
                    // If I set `p` to `.`, `p` is still physically inside the zone coordinates.
                    // But it's now a floor tile that acts as a threshold.
                    // Furniture should NOT be placed on `p`.
                    // And ideally not on neighbors of `p` that block it?
                    // Let's reserve neighbors of p that are also in the zone.
                    const neighbors = [
                        {x: p.x, y: p.y-1}, {x: p.x, y: p.y+1},
                        {x: p.x-1, y: p.y}, {x: p.x+1, y: p.y}
                    ];
                    neighbors.forEach(n => {
                         if (this.isInZone(n.x, n.y, zone)) {
                             this.reservedCells.add(`${n.x},${n.y}`);
                         }
                    });

                } else {
                    this.setTile(p.x, p.y, '#');
                }
            });
        });
    }

    private identifyZones(): Zone[] {
        const visited = new Set<string>();
        const zones: Zone[] = [];
        
        const getKey = (x: number, y: number) => `${x},${y}`;
        
        const directions = [
            { dx: 0, dy: 1 }, { dx: 0, dy: -1 },
            { dx: 1, dy: 0 }, { dx: -1, dy: 0 }
        ];

        for (let y = 0; y < this.height; y++) {
            for (let x = 0; x < this.width; x++) {
                if (visited.has(getKey(x, y))) continue;
                
                const row = this.layout[y];
                if (!row) continue;
                const char = row[x] as ZoneChar;
                if (char === '#') continue; // Skip walls

                const currentZone: Zone = { type: char, cells: [] };
                const queue: Point[] = [{ x, y }];
                visited.add(getKey(x, y));

                while (queue.length > 0) {
                    const curr = queue.shift()!;
                    currentZone.cells.push(curr);

                    for (const dir of directions) {
                        const nx = curr.x + dir.dx;
                        const ny = curr.y + dir.dy;
                        
                        if (nx >= 0 && nx < this.width && ny >= 0 && ny < this.height) {
                            const nextRow = this.layout[ny];
                            if (nextRow && !visited.has(getKey(nx, ny)) && nextRow[nx] === char) {
                                visited.add(getKey(nx, ny));
                                queue.push({ x: nx, y: ny });
                            }
                        }
                    }
                }
                zones.push(currentZone);
            }
        }
        return zones;
    }

    private setTile(x: number, y: number, char: string) {
        if (x >= 0 && x < this.width && y >= 0 && y < this.height) {
            if (this.resultMap[y]) {
                this.resultMap[y][x] = char;
            }
        }
    }

    private getTile(x: number, y: number): string {
        if (x >= 0 && x < this.width && y >= 0 && y < this.height) {
            const row = this.resultMap[y];
            if (row) {
                return row[x] || '#';
            }
        }
        return '#';
    }

    // --- Specific Populators ---

    private processWalkways(zones: Zone[]) {
        // Walkways are sacred. Clear them.
        zones.forEach(zone => {
            zone.cells.forEach(cell => {
                this.setTile(cell.x, cell.y, '.');
            });
        });

        // Handle Entrance: Must be Exit 'E' at the bottom-most point
        const entrances = zones.filter(z => z.type === 'E');
        entrances.forEach(zone => {
            if (zone.cells.length === 0) return;
            
            // Find the bottom-most cell
            let bottomCell: Point | undefined = zone.cells[0];
            
            zone.cells.forEach(c => {
                if (bottomCell && c.y > bottomCell.y) bottomCell = c;
            });

            // Ensure Exit is ON THE WALL (y = height - 1)
            if (bottomCell) {
                const targetY = this.height - 1;
                // If bottomCell is not at wall, we force it down
                if (bottomCell.y < targetY) {
                    // Draw path from bottomCell to targetY
                    for (let y = bottomCell.y; y <= targetY; y++) {
                         this.setTile(bottomCell.x, y, '.'); // Clear path
                    }
                    this.setTile(bottomCell.x, targetY, 'E');
                } else {
                    this.setTile(bottomCell.x, bottomCell.y, 'E');
                }
            }
        });
    }

    private processKitchens(zones: Zone[]) {
        zones.forEach(zone => {
            // 1. Mark all as Kitchen Floor ',' initially
            zone.cells.forEach(c => {
                if (this.getTile(c.x, c.y) !== '#') {
                    this.setTile(c.x, c.y, ',');
                }
            });

            // 2. Classify Boundaries
            // "Front" = Adjacent to Dining (D) or Walkway (W)
            // "Back" = Adjacent to Wall (#) or Other
            const frontCells: Point[] = [];
            const backCells: Point[] = [];
            const otherCells: Point[] = []; // Internal

            zone.cells.forEach(cell => {
                if (this.getTile(cell.x, cell.y) === '#' || this.reservedCells.has(`${cell.x},${cell.y}`)) return;

                const neighbors = [
                    {x: cell.x, y: cell.y-1}, {x: cell.x, y: cell.y+1},
                    {x: cell.x-1, y: cell.y}, {x: cell.x+1, y: cell.y}
                ];

                let isFront = false;
                let isBack = false;

                for (const n of neighbors) {
                    if (n.x < 0 || n.x >= this.width || n.y < 0 || n.y >= this.height) {
                         isBack = true; // Map edge is back
                         continue;
                    }
                    const nType = this.getZoneChar(n.x, n.y);
                    if (nType === 'D' || nType === 'W' || nType === 'L') {
                        isFront = true;
                    } else if (nType === '#' || nType !== 'K') {
                        // Wall or other room (not K, D, W, L)
                        isBack = true;
                    }
                }

                if (isFront) frontCells.push(cell);
                else if (isBack) backCells.push(cell);
                else otherCells.push(cell);
            });

            // 3. Create Bar Counter on Front
            // We need ONE entrance.
            // Pick a front cell that is connected to internal floor?
            // Actually, any front cell is fine.
            let entrance: Point | undefined;
            if (frontCells.length > 0) {
                // Pick middle of front cells
                entrance = frontCells[Math.floor(frontCells.length / 2)];
                // Or random? Middle looks better.
            }

            // Place Counters 'C' on all Front Cells (except entrance)
            frontCells.forEach(p => {
                if (entrance && p.x === entrance.x && p.y === entrance.y) {
                    this.setTile(p.x, p.y, ','); // Keep as floor (Entrance)
                } else {
                    this.setTile(p.x, p.y, 'C'); // Bar Counter
                }
            });

            // 4. Place Kitchen Appliances (O, S, B) on Back Cells First
            // We want to keep 'otherCells' (Internal) as clear aisles if possible.
            
            // Prioritize Back for appliances
            const backShuffled = [...backCells].sort(() => Math.random() - 0.5);
            const otherShuffled = [...otherCells].sort(() => Math.random() - 0.5);
            
            // User requested 3 "置物台" (Counters/Boards) + Oven + Sink
            // 'S' = Serving Table (Shelf/Cabinet), 'B' = Bowl Stack (Sink area)
            const items = ['O', 'B', 'S', 'S', 'S'];
            items.forEach(item => {
                if (backShuffled.length > 0) {
                    const p = backShuffled.pop()!;
                    this.setTile(p.x, p.y, item);
                } else if (otherShuffled.length > 0) {
                     const p = otherShuffled.pop()!;
                     this.setTile(p.x, p.y, item);
                }
            });
            
            // Fill remaining BACK cells with Counters (Cabinets)
            // Leave OTHER cells (Aisle) as floor
            backShuffled.forEach(p => {
                 // 70% chance of Cabinet, 30% Floor?
                 // Usually back wall is full cabinets.
                 if (Math.random() > 0.2) {
                     this.setTile(p.x, p.y, 'C');
                 }
            });

            // 5. Place Player Spawn 'P'
            // Must be on a floor tile ','
            // Re-scan zone for ','
            const floorCells = zone.cells.filter(c => this.getTile(c.x, c.y) === ',');
            
            if (floorCells.length > 0) {
                 // Prefer internal floor over entrance?
                 // Entrance is ',' too.
                 // Try to pick one that is NOT the entrance if possible, but entrance is fine too.
                 let spawn = floorCells.find(c => !entrance || (c.x !== entrance.x || c.y !== entrance.y));
                 if (!spawn) spawn = floorCells[0]; // Fallback to entrance
                 
                 if (spawn) {
                     this.setTile(spawn.x, spawn.y, 'P');
                 }
            }
            
            // 6. Finalize Floor
            // Convert any remaining ',' to actual Kitchen Floor.
            // Wait, we want to KEEP them as ',' so IzakayaScene sees them as KITCHEN tile.
            // IzakayaScene mapping: ',' -> TileType.KITCHEN.
            // So we leave them as ','.
            // DO NOT convert to '.'
        });
    }

    private processDining(zones: Zone[]) {
        zones.forEach(zone => {
            // Mark floor (Respect Walls)
            zone.cells.forEach(c => {
                if (this.getTile(c.x, c.y) !== '#') {
                    this.setTile(c.x, c.y, '.');
                }
            });
            // Filter out walls AND reserved cells
            const freeCells = new Set(
                zone.cells
                    .filter(c => this.getTile(c.x, c.y) !== '#' && !this.reservedCells.has(`${c.x},${c.y}`))
                    .map(c => `${c.x},${c.y}`)
            );

            // Random Packing Algorithm
            // 1. Identify valid spots for 3x1 or 1x3 table arrangement?
            // User complained about "Line" pattern.
            // Previous was: x%3==1 && y%3==1 -> Grid.
            // Let's use a randomized approach:
            // Pick a random cell. Check if it fits a Table (T) and Chairs (h).
            // Chair pattern: (x-1,y) h, (x,y) T, (x+1,y) h -> 3x1 horizontal block.
            // Or Vertical: (x,y-1) h, (x,y) T, (x,y+1) h -> 1x3 vertical block.
            
            // Try to pack as many as possible with some random variation.
            
            const attempts = zone.cells.length * 2;
            for (let i=0; i<attempts; i++) {
                if (freeCells.size < 3) break;

                // Pick random cell from freeCells
                const keys = Array.from(freeCells);
                const randomKey = keys[Math.floor(Math.random() * keys.length)];
                if (!randomKey) continue;
                
                const parts = randomKey.split(',').map(Number);
                const cx = parts[0];
                const cy = parts[1];
                if (cx === undefined || cy === undefined) continue;
                
                // Randomly decide orientation: Horizontal (0) or Vertical (1)
                const isHorizontal = Math.random() > 0.5;
                
                let fits = false;
                let occupied: Point[] = [];
                
                if (isHorizontal) {
                    // Check Left(Chair), Center(Table), Right(Chair)
                    // (x-1, y), (x, y), (x+1, y)
                    const p1 = {x: cx-1, y: cy};
                    const p2 = {x: cx, y: cy};
                    const p3 = {x: cx+1, y: cy};
                    
                    if (freeCells.has(`${p1.x},${p1.y}`) && 
                        freeCells.has(`${p2.x},${p2.y}`) && 
                        freeCells.has(`${p3.x},${p3.y}`)) {
                            fits = true;
                            occupied = [p1, p2, p3];
                    }
                } else {
                    // Check Top(Chair), Center(Table), Bottom(Chair)
                    const p1 = {x: cx, y: cy-1};
                    const p2 = {x: cx, y: cy};
                    const p3 = {x: cx, y: cy+1};
                    
                    if (freeCells.has(`${p1.x},${p1.y}`) && 
                        freeCells.has(`${p2.x},${p2.y}`) && 
                        freeCells.has(`${p3.x},${p3.y}`)) {
                            fits = true;
                            occupied = [p1, p2, p3];
                    }
                }
                
                if (fits) {
                    // Check spacing? Ensure we don't block paths completely?
                    // The 'freeCells' are only within the Zone 'D'.
                    // Walkways 'W' are outside.
                    // But we might want some gap between tables?
                    // If we pack tightly 3x1 blocks, players can't move between them if they are adjacent.
                    // We should check that neighbors of the block are walkable or free.
                    // Let's enforce a 1-tile buffer around the table group?
                    // Or just ensure we don't consume *all* space.
                    
                    // Simple buffer check:
                    // Check if adjacent cells are already furniture?
                    // Or just require that at least one side is open?
                    
                    // Let's proceed with placement for now, see if it looks too dense.
                    // To prevent "Line", randomization of orientation helps.
                    
                    // Place items
                    // Center is T
                    if (occupied[1] && occupied[0] && occupied[2]) {
                        this.setTile(occupied[1].x, occupied[1].y, 'T');
                        // Others are h
                        this.setTile(occupied[0].x, occupied[0].y, 'h');
                        this.setTile(occupied[2].x, occupied[2].y, 'h');
                    }
                    
                    // Remove from freeCells
                    occupied.forEach(p => freeCells.delete(`${p.x},${p.y}`));
                    
                    // Also remove diagonals or adjacent to create "breathing room"?
                    // If we don't, tables will touch.
                    // Let's remove adjacent cells from freeCells to force spacing.
                    occupied.forEach(p => {
                        [
                            {x: p.x+1, y: p.y}, {x: p.x-1, y: p.y},
                            {x: p.x, y: p.y+1}, {x: p.x, y: p.y-1}
                        ].forEach(n => freeCells.delete(`${n.x},${n.y}`));
                    });
                }
            }
        });
    }

    private processLiving(zones: Zone[]) {
        zones.forEach(zone => {
            zone.cells.forEach(c => {
                if (this.getTile(c.x, c.y) !== '#') {
                    this.setTile(c.x, c.y, '.');
                }
            });

            // Filter out walls AND reserved cells
            const freeCells = new Set(
                zone.cells
                    .filter(c => this.getTile(c.x, c.y) !== '#' && !this.reservedCells.has(`${c.x},${c.y}`))
                    .map(c => `${c.x},${c.y}`)
            );
            
            // Helper to get random item from array
            const pickRandom = <T>(arr: T[]): T | undefined => arr.length > 0 ? arr[Math.floor(Math.random() * arr.length)] : undefined;
            
            // --- Bedroom (B) ---
            if (zone.type === 'B') {
                // Determine Density
                // User Request: Only ONE bed per room.
                let bedCount = 1;
                // if (zoneSize > 30) bedCount = Math.floor(zoneSize / 15); // Disabled for now based on user feedback
                
                // 1. Place Beds (2x3)
                // Find ALL valid 2x3 spots
                const bedCandidates: Point[] = [];
                for (const cell of zone.cells) {
                    // Check if on wall (we generated walls inside B zone!)
                    if (this.getTile(cell.x, cell.y) === '#') continue;

                    let fits = true;
                    // Check 2x3 area
                    for(let dy=0; dy<3; dy++) {
                        for(let dx=0; dx<2; dx++) {
                            const tx = cell.x + dx;
                            const ty = cell.y + dy;
                            // Check bounds and if free (and not wall)
                            if (!freeCells.has(`${tx},${ty}`) || this.getTile(tx, ty) === '#') {
                                fits = false;
                                break;
                            }
                        }
                        if(!fits) break;
                    }
                    if (fits) bedCandidates.push(cell);
                }

                // Place multiple beds
                for (let i=0; i<bedCount; i++) {
                    if (bedCandidates.length === 0) break;
                    const idx = Math.floor(Math.random() * bedCandidates.length);
                    const bedPos = bedCandidates[idx];
                    bedCandidates.splice(idx, 1); // Remove used

                    if (!bedPos) continue;

                    // Re-check validity (might overlap with just placed bed)
                    // Actually we should update freeCells immediately
                    // But candidates were pre-calculated.
                    // Better to re-check if space is still free.
                    let stillFits = true;
                    for(let dy=0; dy<3; dy++) {
                        for(let dx=0; dx<2; dx++) {
                            if (!freeCells.has(`${bedPos.x+dx},${bedPos.y+dy}`)) stillFits = false;
                        }
                    }
                    
                    if (stillFits) {
                        this.setTile(bedPos.x, bedPos.y, 'b'); 
                        for(let dy=0; dy<3; dy++) {
                            for(let dx=0; dx<2; dx++) {
                                freeCells.delete(`${bedPos.x+dx},${bedPos.y+dy}`);
                            }
                        }
                    } else {
                        i--; // Retry? Or just skip
                    }
                }
                
                // 2. Place Decorative Items (Lamp, Books, etc.)
                // Fill ratio: try to fill 10% of remaining space with decorations
                // User Request: Only ONE lamp/decoration per room.
                const decorationCount = 1; // Math.ceil(freeCells.size * 0.1);
                
                for (let i=0; i<decorationCount; i++) {
                    // Try placing a Lamp (1x2)
                    const lampCandidates: Point[] = [];
                     for (const cell of zone.cells) {
                        if (!freeCells.has(`${cell.x},${cell.y}`) || this.getTile(cell.x, cell.y) === '#') continue;
                        const below = {x: cell.x, y: cell.y+1};
                        if (freeCells.has(`${below.x},${below.y}`) && this.getTile(below.x, below.y) !== '#') {
                            lampCandidates.push(cell);
                        }
                     }
                     const lampPos = pickRandom(lampCandidates);
                     if (lampPos) {
                         const below = {x: lampPos.x, y: lampPos.y+1};
                         this.setTile(lampPos.x, lampPos.y, 'l'); // Lamp
                         freeCells.delete(`${lampPos.x},${lampPos.y}`);
                         freeCells.delete(`${below.x},${below.y}`);
                     }
                }
            }

            // --- Lounge (L) ---
            if (zone.type === 'L') {
                 // Fill Density: Reduced to avoid clutter
                 const zoneSize = freeCells.size;
                 const sofaTarget = Math.min(4, Math.ceil(zoneSize * 0.08)); // Max 4 sofas
                 const bookTarget = Math.min(3, Math.ceil(zoneSize * 0.05)); // Max 3 bookshelves
                 
                 // 1. Sofa (1x2) - 's'
                 for(let i=0; i<sofaTarget; i++) {
                     const sofaCandidates: Point[] = [];
                     for (const cell of zone.cells) {
                        if (!freeCells.has(`${cell.x},${cell.y}`) || this.getTile(cell.x, cell.y) === '#') continue;
                        const right = {x: cell.x+1, y: cell.y};
                        if (freeCells.has(`${right.x},${right.y}`) && this.getTile(right.x, right.y) !== '#') {
                            sofaCandidates.push(cell);
                        }
                     }
                     const sofaPos = pickRandom(sofaCandidates);
                     if (sofaPos) {
                        const right = {x: sofaPos.x+1, y: sofaPos.y};
                        this.setTile(sofaPos.x, sofaPos.y, 's');
                        freeCells.delete(`${sofaPos.x},${sofaPos.y}`);
                        freeCells.delete(`${right.x},${right.y}`);
                     } else break; 
                 }
                 
                 // 2. Books (1x2) - 'k'
                 for(let i=0; i<bookTarget; i++) {
                     const bookCandidates: Point[] = [];
                     for (const cell of zone.cells) {
                         if (!freeCells.has(`${cell.x},${cell.y}`) || this.getTile(cell.x, cell.y) === '#') continue;
                         const below = {x: cell.x, y: cell.y+1};
                         if (freeCells.has(`${below.x},${below.y}`) && this.getTile(below.x, below.y) !== '#') {
                             bookCandidates.push(cell);
                         }
                     }
                     const bookPos = pickRandom(bookCandidates);
                     if (bookPos) {
                         const below = {x: bookPos.x, y: bookPos.y+1};
                         this.setTile(bookPos.x, bookPos.y, 'k'); // Books
                         freeCells.delete(`${bookPos.x},${bookPos.y}`);
                         freeCells.delete(`${below.x},${below.y}`);
                     } else break;
                 }
            }
        });
    }

    private processRestroom(zones: Zone[]) {
        zones.forEach(zone => {
            // Mark floor
            zone.cells.forEach(c => {
                if (this.getTile(c.x, c.y) !== '#') {
                    this.setTile(c.x, c.y, '.');
                }
            });
            // Filter out walls AND reserved cells
            const freeCells = new Set(
                zone.cells
                    .filter(c => this.getTile(c.x, c.y) !== '#' && !this.reservedCells.has(`${c.x},${c.y}`))
                    .map(c => `${c.x},${c.y}`)
            );

            // Determine Density
            // 1 Toilet per room max
            const toiletTarget = 1;
            const sinkTarget = 1;

            // 1. Toilet (1x1) - 't'
            // Prefer corners or "Deep" walls (furthest from entrance/centroid)
            // Heuristic: Prefer Top-Right or Top-Left corners, or Top Wall.
            // Why? Door usually on Bottom or Side.
            
            // Calculate Centroid of Zone
            let cx = 0, cy = 0;
            if (zone.cells.length > 0) {
                zone.cells.forEach(c => { cx += c.x; cy += c.y; });
                cx /= zone.cells.length;
                cy /= zone.cells.length;
            }

            for (let i=0; i<toiletTarget; i++) {
                // Find candidates (adjacent to wall)
                // Sort by distance from centroid (Further is better -> "Inner-most")
                // Also check neighbor wall count (Corner = 2 walls, Edge = 1 wall)
                
                const candidates: {p: Point, score: number}[] = [];
                
                for (const cell of zone.cells) {
                    if (freeCells.has(`${cell.x},${cell.y}`) && this.getTile(cell.x, cell.y) !== '#') {
                        const neighbors = [
                            {x: cell.x, y: cell.y-1}, {x: cell.x, y: cell.y+1},
                            {x: cell.x-1, y: cell.y}, {x: cell.x+1, y: cell.y}
                        ];
                        const wallCount = neighbors.filter(n => this.getTile(n.x, n.y) === '#').length;
                        
                        if (wallCount > 0) {
                            // Score: Distance from Center + Wall Bonus
                            const dist = Math.sqrt(Math.pow(cell.x - cx, 2) + Math.pow(cell.y - cy, 2));
                            const score = dist + (wallCount * 2); // Boost corners
                            candidates.push({p: cell, score});
                        }
                    }
                }
                
                // Sort by score descending
                candidates.sort((a, b) => b.score - a.score);

                // Pick top candidate
                if (candidates.length > 0) {
                    const best = candidates[0];
                    if (best && best.p) {
                         this.setTile(best.p.x, best.p.y, 't');
                         freeCells.delete(`${best.p.x},${best.p.y}`);
                    }
                }
            }

            // 2. Sink (1x1) - 'w' (wash)
            for (let i=0; i<sinkTarget; i++) {
                const candidates: Point[] = [];
                for (const cell of zone.cells) {
                    if (freeCells.has(`${cell.x},${cell.y}`) && this.getTile(cell.x, cell.y) !== '#') candidates.push(cell);
                }
                if (candidates.length > 0) {
                    const pos = candidates[Math.floor(Math.random() * candidates.length)];
                    if (pos) {
                        this.setTile(pos.x, pos.y, 'w');
                        freeCells.delete(`${pos.x},${pos.y}`);
                    }
                } else break;
            }
            
            // 3. Mirror (Wall Tile) - 'M'
            // Find a wall adjacent to the zone (or inside the zone if it was converted to wall)
            // Ideally, mirror should be above sink?
            // Or just any wall.
            // Let's find walls adjacent to Sinks first.
            const sinkCells = zone.cells.filter(c => this.getTile(c.x, c.y) === 'w');
            
            sinkCells.forEach(sink => {
                // Look for adjacent walls (UP is best for mirror)
                const up = {x: sink.x, y: sink.y-1};
                if (this.getTile(up.x, up.y) === '#') {
                    this.setTile(up.x, up.y, 'M'); // Wall with Mirror
                } else {
                    // Try other walls?
                    const neighbors = [
                        {x: sink.x-1, y: sink.y}, {x: sink.x+1, y: sink.y}
                    ];
                    for(const n of neighbors) {
                        if (this.getTile(n.x, n.y) === '#') {
                            this.setTile(n.x, n.y, 'M');
                            break;
                        }
                    }
                }
            });
        });
    }

    private ensureExits() {
        let hasExit = false;
        for(let y=0; y<this.height; y++) {
            for(let x=0; x<this.width; x++) {
                if(this.resultMap[y]?.[x] === 'E') hasExit = true;
            }
        }

        if (!hasExit) {
            const midX = Math.floor(this.width / 2);
            this.setTile(midX, this.height - 1, 'E');
        }
    }

    private decorateWalls() {
        // Decorate Top and Bottom walls
        for (let y of [0, this.height - 1]) {
            let startX = -1;
            for (let x = 0; x < this.width; x++) {
                const char = this.resultMap[y]?.[x];
                if (char === '#') {
                    if (startX === -1) startX = x;
                } else {
                    if (startX !== -1) {
                        this.placeWindowOnSegment(startX, x - 1, y, 'horizontal');
                        startX = -1;
                    }
                }
            }
            if (startX !== -1) {
                this.placeWindowOnSegment(startX, this.width - 1, y, 'horizontal');
            }
        }

        // Decorate Left and Right walls
        for (let x of [0, this.width - 1]) {
            let startY = -1;
            for (let y = 0; y < this.height; y++) {
                const char = this.resultMap[y]?.[x];
                if (char === '#') {
                    if (startY === -1) startY = y;
                } else {
                    if (startY !== -1) {
                        this.placeWindowOnSegment(startY, y - 1, x, 'vertical');
                        startY = -1;
                    }
                }
            }
            if (startY !== -1) {
                this.placeWindowOnSegment(startY, this.height - 1, x, 'vertical');
            }
        }
    }

    private placeWindowOnSegment(start: number, end: number, fixed: number, orientation: 'horizontal' | 'vertical') {
        const length = end - start + 1;
        // Require at least length 3 for a window to look good (padding)
        if (length < 3) return;

        // Chance to place a window
        if (Math.random() < 0.3) return; // 70% chance to have a window? Or 30% skip? User wants "at most one".
        // Let's say we always try to place one if segment is long enough, unless random skip.
        
        // Pick a random start position for the window
        // Window size is 1x2 (Vertical) or 2x1 (Horizontal)?
        // User said "Window changed to 1x2".
        // Usually windows on horizontal walls are 2x1 (wide), on vertical walls 1x2 (tall).
        // Let's assume standard behavior.
        
        const windowSize = orientation === 'horizontal' ? 2 : 2; // Size along the segment
        // Wait, if orientation is vertical (x is fixed), window takes 2 tiles in Y.
        // If orientation is horizontal (y is fixed), window takes 2 tiles in X? 
        // Or 1x2 implies always vertical? A window on a bottom wall usually looks like a wide glass or 2 tiles.
        // Let's assume 'W' tile repeats.
        
        if (length < windowSize) return;

        // Available range: start ... end - windowSize + 1
        const maxPos = end - windowSize + 1;
        const pos = Math.floor(Math.random() * (maxPos - start + 1)) + start;
        
        if (orientation === 'horizontal') {
            // Place at (pos, fixed) and (pos+1, fixed)
             this.setTile(pos, fixed, 'W');
             this.setTile(pos+1, fixed, 'W');
        } else {
            // Place at (fixed, pos) and (fixed, pos+1)
            this.setTile(fixed, pos, 'W');
            this.setTile(fixed, pos+1, 'W');
        }
    }

    private processStairs(stairsZones: Zone[]) {
        // 1. Process explicit 'S' zones
        if (stairsZones.length > 0) {
            stairsZones.forEach(zone => {
                // Check height and expand if necessary (Fault Tolerance for 1-height stairs)
                const ys = zone.cells.map(c => c.y);
                const minY = Math.min(...ys);
                const maxY = Math.max(...ys);
                const height = maxY - minY + 1;
                
                if (height < 2) {
                     // Expand downwards to ensure at least 2 height
                     // This prevents getting stuck on 1-tile stairs against a wall
                     const newMaxY = maxY + 1;
                     if (newMaxY < this.height) {
                         zone.cells.filter(c => c.y === maxY).forEach(c => {
                             this.setTile(c.x, newMaxY, 'H');
                             // We must treat this new tile as part of the zone for the entry-clearing logic below
                             // But we can't easily modify 'zone.cells' iteration mid-stream if we rely on it.
                             // Instead, we just set it here.
                             // And we need to ensure the entry is BELOW this new row.
                         });
                     }
                }

                // Apply 'H' to all original cells
                zone.cells.forEach(c => this.setTile(c.x, c.y, 'H'));

                // Determine effective bottom of the stairs (considering expansion)
                // We re-scan the map for 'H' in this zone's x-range?
                // Or just rely on the fact that we expanded downwards.
                
                // Clear entry point
                // We group by X column to find the bottom-most 'H' for each column
                const xs = [...new Set(zone.cells.map(c => c.x))];
                
                xs.forEach(x => {
                    // Find bottom-most 'H' in this column
                    let bottomY = -1;
                    for(let y = this.height - 1; y >= 0; y--) {
                        if (this.getTile(x, y) === 'H') {
                            bottomY = y;
                            break;
                        }
                    }
                    
                    if (bottomY !== -1) {
                         const entryY = bottomY + 1;
                         if (entryY < this.height) {
                             // Force clear entry
                             this.setTile(x, entryY, '.');
                             this.reservedCells.add(`${x},${entryY}`);
                         }
                    }
                });
            });
            return;
        }

        // 2. Fallback: Look for 'W' in top row (old logic)
        const row0 = this.layout[0];
        if (!row0) return;

        for(let x=0; x<this.width; x++) {
            if (row0[x] === 'W') {
                this.setTile(x, 0, 'H');
                if (this.height > 1) {
                    this.setTile(x, 1, '.');
                }
            }
        }
    }

    // --- Helpers ---

    private getZoneChar(x: number, y: number): string {
        if (x >= 0 && x < this.width && y >= 0 && y < this.height) {
            const row = this.layout[y];
            if (row) {
                return row[x] || '#';
            }
        }
        return '#'; // Outside is wall
    }

    private isInZone(x: number, y: number, zone: Zone): boolean {
        return zone.cells.some(c => c.x === x && c.y === y);
    }
}
