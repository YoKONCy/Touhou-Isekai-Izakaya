
import { type Entity, type Position, TileType, TileTypeNames, type Customer, type Item, type Furniture } from '@/types/management';

export class IzakayaScene {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private entities: Entity[] = [];
  private animationFrameId: number | null = null;
  
  // Grid Configuration
  private readonly GRID_SIZE = 48; // Pixels per grid cell
  private COLS = 20;
  private ROWS = 15;
  
  // Map Data
  private map: TileType[][] = [];
  private floors: Record<number, TileType[][]> = {}; // Multi-floor storage
  private currentFloor: number = 1; // Current active floor
  private floorChairs: Record<number, Position[]> = {}; // Chairs per floor
  private floorExits: Record<number, Position[]> = {}; // Exits per floor
  private placedItems: Map<string, Item> = new Map();

  // Input State
  private keysPressed: Set<string> = new Set();
  
  // Game Loop State
  private lastTime = 0;
  private spawnTimer = 0;
  private readonly SPAWN_INTERVAL = 5000; // 5 seconds

  constructor(canvas: HTMLCanvasElement, customLayout?: string[], customFloors?: Record<string, string[]>) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    
    // Initialize Map
    // Combine layout (Floor 1) and floors (Other floors)
    const allFloors: Record<string, string[]> = {};
    
    if (customLayout) {
        allFloors["1"] = customLayout;
    }
    
    if (customFloors) {
        Object.assign(allFloors, customFloors);
    }

    if (Object.keys(allFloors).length > 0) {
        this.parseFloors(allFloors);
    } else {
        this.initMap();
    }

    // Set Canvas Size
    this.canvas.width = this.COLS * this.GRID_SIZE;
    this.canvas.height = this.ROWS * this.GRID_SIZE;

    // Initialize Input Listeners
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('keydown', this.handleInteraction);
    
    // Add Player Entity
    this.addEntity({
      id: 'player',
      type: 'player',
      floor: 1, // Start on floor 1
      x: 10,
      y: 10,
      pixelX: 10 * this.GRID_SIZE,
      pixelY: 10 * this.GRID_SIZE,
      direction: 'down',
      isMoving: false,
      moveSpeed: 0.15,
    });
  }
  
  private parseFloors(floorsData: Record<string, string[]>) {
    this.floors = {};
    this.floorChairs = {};
    this.floorExits = {};
    
    Object.entries(floorsData).forEach(([floorLevel, layout]) => {
        const level = parseInt(floorLevel);
        const { map, chairs, exits, furniture } = this.parseLayout(layout);
        this.floors[level] = map;
        this.floorChairs[level] = chairs;
        this.floorExits[level] = exits;
        
        // Add Furniture Entities
        furniture.forEach(f => {
            f.floor = level; // Assign floor
            this.addEntity(f);
        });
    });

    // Set initial floor
    this.switchFloor(1, false);
  }

  public switchFloor(targetFloor: number, movePlayer: boolean = true) {
      if (!this.floors[targetFloor]) {
          console.warn(`Floor ${targetFloor} does not exist.`);
          return;
      }
      
      this.currentFloor = targetFloor;
      this.map = this.floors[targetFloor];
      // this.chairs was removed as it was unused locally except for assignment
      
      // Update Player Floor
      if (movePlayer) {
          const player = this.entities.find(e => e.type === 'player');
          if (player) {
              player.floor = targetFloor;
          }
      }
      
      // Send event to UI (optional)
      const event = new CustomEvent('izakaya-floor-change', { detail: { floor: targetFloor } });
      this.canvas.dispatchEvent(event);
  }

  private parseLayout(layout: string[]) {
    const map: TileType[][] = [];
    const chairs: Position[] = [];
    const exits: Position[] = [];
    const furniture: Furniture[] = [];

    // Symbol Mapping
    const mapping: Record<string, TileType> = {
        '#': TileType.WALL,
        '.': TileType.FLOOR,
        ',': TileType.KITCHEN,
        'C': TileType.COUNTER,
        'T': TileType.COUNTER, // Table uses counter texture for now, need distinction if possible
        'h': TileType.CHAIR,
        'S': TileType.SERVING_TABLE,
        'O': TileType.COOKING_POT,
        'B': TileType.BOWL_STACK,
        'E': TileType.EXIT,
        'P': TileType.KITCHEN, // Player spawn is floor
        '*': TileType.FLOOR, // Decoration on floor
        '$': TileType.WALL_WITH_PAINTING,
        'H': TileType.STAIRS,
        'W': TileType.WINDOW,
        // Multi-tile items will be handled as entities, map tile becomes FLOOR
        'b': TileType.FLOOR, // BED
        's': TileType.FLOOR, // SOFA
        'l': TileType.FLOOR, // LAMP
        'k': TileType.FLOOR, // BOOKSHELF
        't': TileType.FLOOR, // TOILET
        'w': TileType.FLOOR, // SINK
        'm': TileType.FLOOR, // MIRROR (Old, Floor-based)
        'M': TileType.MIRROR // MIRROR (New, Wall-based)
    };

    let playerSpawned = false; // Used to track spawn logic if needed in future layouts
    if (playerSpawned) { /* prevent unused warning */ }

    // Calculate dimensions from layout
    const rows = layout.length;
    const cols = layout.reduce((max, line) => Math.max(max, line.length), 0);
    
    // Update scene dimensions if necessary (to fit the largest map)
    if (cols > this.COLS) this.COLS = cols;
    if (rows > this.ROWS) this.ROWS = rows;

    for (let y = 0; y < rows; y++) {
        const row: TileType[] = [];
        const layoutRow = layout[y] || "";
        for (let x = 0; x < cols; x++) {
            const char = layoutRow[x] || '.';
            let tile = mapping[char] || TileType.FLOOR;
            
            // Special handling for Spawn P
            if (char === 'P') {
               tile = TileType.KITCHEN;
               playerSpawned = true;
            }

            if (char === 'h') {
                chairs.push({ x, y });
            }
            if (char === 'E') {
                exits.push({ x, y });
            }

            // --- Entity Spawning for Multi-tile Furniture ---
            if (['b', 's', 'l', 'k', 't', 'w', 'm'].includes(char)) {
                let fType: Furniture['furnitureType'] = 'table'; // default
                let width = 1;
                let height = 1;
                
                switch(char) {
                    case 'b': fType = 'bed'; width = 2; height = 3; break;
                    case 's': fType = 'sofa'; width = 2; height = 1; break;
                    case 'l': fType = 'lamp'; width = 1; height = 2; break;
                    case 'k': fType = 'bookshelf'; width = 1; height = 2; break;
                    case 't': fType = 'toilet'; width = 1; height = 1; break;
                    case 'w': fType = 'sink'; width = 1; height = 1; break;
                    case 'm': fType = 'mirror'; width = 1; height = 1; break;
                }
                
                furniture.push({
                    id: `furniture_${x}_${y}_${Date.now()}_${Math.random()}`,
                    type: 'furniture',
                    furnitureType: fType,
                    x, y,
                    pixelX: x * this.GRID_SIZE,
                    pixelY: y * this.GRID_SIZE,
                    width,
                    height,
                    direction: 'down', // Default
                    isMoving: false,
                    moveSpeed: 0
                });
            }

            row.push(tile);
        }
        map.push(row);
    }
    
    return { map, chairs, exits, furniture };
  }

  private initMap() {
    // Initialize empty floor with walls
    const map: TileType[][] = [];
    const chairs: Position[] = [];
    const exits: Position[] = [];
    
    for (let y = 0; y < this.ROWS; y++) {
      const row: TileType[] = [];
      for (let x = 0; x < this.COLS; x++) {
        // Borders
        if (x === 0 || x === this.COLS - 1 || y === 0 || y === this.ROWS - 1) {
          row.push(TileType.WALL);
        } else {
          row.push(TileType.FLOOR);
        }
      }
      map.push(row);
    }

    // Add Kitchen (Top area)
    for (let y = 1; y < 4; y++) {
        for (let x = 1; x < this.COLS - 1; x++) {
            map[y]![x] = TileType.KITCHEN;
        }
    }
    
    // Add Counter (Row 4)
    for (let x = 1; x < this.COLS - 1; x++) {
        if (x === 10) {
             map[4]![x] = TileType.FLOOR; // Kitchen Entrance/Passage
        } else {
             map[4]![x] = TileType.COUNTER;
        }
    }

    // Add Bowl Stack
    map[4]![8] = TileType.BOWL_STACK;

    // Add Cooking Pot
    map[2]![2] = TileType.COOKING_POT;

    // Add Serving Tables (Kitchen Tables)
    map[1]![4] = TileType.SERVING_TABLE;
    map[1]![5] = TileType.SERVING_TABLE;
    map[1]![6] = TileType.SERVING_TABLE;

    // Add a painting on the back wall
    map[0]![10] = TileType.WALL_WITH_PAINTING;

    // Add Chairs (Row 5)
    for (let x = 3; x < this.COLS - 3; x+=2) {
        if (x !== 9 && x !== 11) { // Leave space for entrance path
            map[5]![x] = TileType.CHAIR;
            chairs.push({ x, y: 5 });
        }
    }
    
    // Add some Tables
    const addTable = (cx: number, cy: number) => {
         if (cx >= 0 && cx < this.COLS && cy >= 0 && cy < this.ROWS) map[cy]![cx] = TileType.COUNTER;
         if (cx-1 >= 0) { map[cy]![cx-1] = TileType.CHAIR; chairs.push({x: cx-1, y: cy}); }
         if (cx+1 < this.COLS) { map[cy]![cx+1] = TileType.CHAIR; chairs.push({x: cx+1, y: cy}); }
    };

    addTable(4, 8);
    addTable(14, 8);
    addTable(4, 11);
    addTable(14, 11);

    // Add Exit (Bottom)
    map[this.ROWS - 1]![10] = TileType.EXIT;
    map[this.ROWS - 1]![9] = TileType.EXIT;
    map[this.ROWS - 1]![11] = TileType.EXIT;
    exits.push({x: 10, y: this.ROWS - 1});
    exits.push({x: 9, y: this.ROWS - 1});
    exits.push({x: 11, y: this.ROWS - 1});

    // Add Stairs to 2nd Floor (Living Area) - Top Right Corner
    map[1]![this.COLS - 2] = TileType.STAIRS;
    map[2]![this.COLS - 2] = TileType.STAIRS;
    map[1]![this.COLS - 3] = TileType.STAIRS; 
    map[2]![this.COLS - 3] = TileType.STAIRS;
    
    // Store Floor 1
    this.floors[1] = map;
    this.floorChairs[1] = chairs;
    this.floorExits[1] = exits;
    
    // Create Default Floor 2 (Living Quarters / More tables)
    const map2: TileType[][] = [];
    const chairs2: Position[] = [];
    // Copy base structure
    for (let y = 0; y < this.ROWS; y++) {
        const row: TileType[] = [];
        for (let x = 0; x < this.COLS; x++) {
             // Walls
             if (x === 0 || x === this.COLS - 1 || y === 0 || y === this.ROWS - 1) row.push(TileType.WALL);
             else row.push(TileType.FLOOR);
        }
        map2.push(row);
    }
    // Add Stairs matching Floor 1
    map2[1]![this.COLS - 2] = TileType.STAIRS;
    map2[2]![this.COLS - 2] = TileType.STAIRS;
    map2[1]![this.COLS - 3] = TileType.STAIRS; 
    map2[2]![this.COLS - 3] = TileType.STAIRS;
    
    // Add some furniture to Floor 2
    map2[5]![5] = TileType.COUNTER; // Table
    map2[5]![4] = TileType.CHAIR; chairs2.push({x:4, y:5});
    map2[5]![6] = TileType.CHAIR; chairs2.push({x:6, y:5});

    this.floors[2] = map2;
    this.floorChairs[2] = chairs2;
    this.floorExits[2] = [];

    // Set current
    this.switchFloor(1, false);
  }


/*
  private addTable(centerX: number, centerY: number) {
      if (this.isValid(centerX, centerY)) this.map[centerY]![centerX] = TileType.COUNTER; // Reuse counter texture for table
      
      // Chairs around
      if (this.isValid(centerX-1, centerY)) {
          this.map[centerY]![centerX-1] = TileType.CHAIR;
          this.chairs.push({ x: centerX-1, y: centerY });
      }
      if (this.isValid(centerX+1, centerY)) {
          this.map[centerY]![centerX+1] = TileType.CHAIR;
          this.chairs.push({ x: centerX+1, y: centerY });
      }
  }
*/

  private isValid(x: number, y: number): boolean {
      if (!this.map || this.map.length === 0 || !this.map[0]) return false;
      return x >= 0 && x < this.map[0].length && y >= 0 && y < this.map.length;
  }

  public start() {
    if (!this.animationFrameId) {
      this.lastTime = performance.now();
      this.gameLoop(this.lastTime);
    }
  }
  
  public stop() {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('keydown', this.handleInteraction);
  }
  
  private addEntity(entity: Entity) {
    this.entities.push(entity);
  }
  
  private handleKeyDown = (e: KeyboardEvent) => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) {
        e.preventDefault();
    }
    this.keysPressed.add(e.key);
  };
  
  private handleKeyUp = (e: KeyboardEvent) => {
    this.keysPressed.delete(e.key);
  };
  
  private handleInteraction = (e: KeyboardEvent) => {
    if (e.repeat) return;
    if (e.key === 'f' || e.key === 'F' || e.key === 'Enter') {
        const player = this.entities.find(e => e.type === 'player');
        if (player && !player.isMoving) {
            this.checkInteraction(player);
        }
    }
  }

  private checkInteraction(player: Entity) {
     let targetX = player.x;
     let targetY = player.y;
     
     if (player.direction === 'up') targetY--;
     else if (player.direction === 'down') targetY++;
     else if (player.direction === 'left') targetX--;
     else if (player.direction === 'right') targetX++;

     if (!this.isValid(targetX, targetY)) return;

     const tile = this.map[targetY]![targetX]!;
     
     // Check if there is an entity at target position on the current floor
     const targetEntity = this.entities.find(e => 
        e.x === targetX && 
        e.y === targetY && 
        e.id !== player.id &&
        (e.floor === undefined || e.floor === this.currentFloor)
     );

     const event = new CustomEvent('izakaya-interact', { 
         detail: { 
             tile, 
             x: targetX, 
             y: targetY,
             tileName: TileTypeNames[tile],
             entity: targetEntity
         } 
     });
     this.canvas.dispatchEvent(event);

     // Handle customer state transition if interacting
     if (targetEntity && targetEntity.type === 'customer') {
         const customer = targetEntity as Customer;
         if (customer.state === 'ordering') {
             // Dispatch dialog event instead of immediate transition
             const event = new CustomEvent('izakaya-customer-interact', {
                 detail: {
                     customerId: customer.id,
                     customerName: customer.name,
                     dialogType: 'ordering',
                     customer: customer // Pass full object
                 }
             });
             this.canvas.dispatchEvent(event);
         } else if (customer.state === 'waiting_food') {
             // Handled by Game Logic (Check Inventory)
             // We dispatch event, Game listens, checks inventory, calls serveCustomer if valid.
         }
     }
  }

  public serveCustomer(customerId: string) {
      const customer = this.entities.find(e => e.id === customerId && e.type === 'customer') as Customer;
      if (customer && customer.state === 'waiting_food') {
          customer.state = 'eating';
          customer.eatTimer = 5000;
          this.dispatchOrderEvent('complete', customer);
      }
  }

  public takeOrder(customerId: string) {
      const customer = this.entities.find(e => e.id === customerId && e.type === 'customer') as Customer;
      if (customer && customer.state === 'ordering') {
           customer.state = 'waiting_food';
           customer.order = this.generateRandomOrder();
           console.log(`Order taken from ${customer.name}: ${customer.order.dishName}`);
           
           this.dispatchOrderEvent('add', customer);
      }
  }

  private generateRandomOrder() {
      const dishes = [
          { name: 'Grilled Fish', price: 50 },
          { name: 'Sake', price: 30 },
          { name: 'Tempura', price: 60 },
          { name: 'Oden', price: 40 }
      ];
      const choice = dishes[Math.floor(Math.random() * dishes.length)];
      if (!choice) return { dishName: 'Unknown', requirements: [], price: 0 };

      return {
          dishName: choice.name,
          requirements: [],
          price: choice.price
      };
  }
  
  private gameLoop = (timestamp: number) => {
    const deltaTime = timestamp - this.lastTime;
    this.lastTime = timestamp;
    
    this.update(deltaTime);
    this.render();
    
    this.animationFrameId = requestAnimationFrame(this.gameLoop);
  };
  
  private update(deltaTime: number) {
    // 1. Handle Player Input
    const player = this.entities.find(e => e.type === 'player');
    if (player) {
      this.handlePlayerMovement(player, deltaTime);
    }
    
    // 2. Update Entities (Smoothing)
    this.entities.forEach(entity => {
      this.updateEntityPosition(entity, deltaTime);
      
      if (entity.type === 'customer') {
          this.updateCustomer(entity as Customer, deltaTime);
      }
    });

    // 3. Spawning
    this.spawnTimer += deltaTime;
    if (this.spawnTimer > this.SPAWN_INTERVAL) {
        this.spawnTimer = 0;
        this.spawnCustomer();
    }
  }
  
  private isPassable(x: number, y: number, map: TileType[][] = this.map): boolean {
      if (y < 0 || y >= this.ROWS || x < 0 || x >= this.COLS) return false;
      const tile = map[y]![x]!;
      // Chairs are passable for pathfinding purposes if we want them to sit on them
      // But for physical collision, they are obstacles unless you are "sitting"
      // For simplicity, let's assume all chairs are passable for now, 
      // or check if it's the target chair.
      return tile === TileType.FLOOR || tile === TileType.KITCHEN || tile === TileType.EXIT || tile === TileType.CHAIR || tile === TileType.SOFA;
  }

  // A simplified check for player collision vs walls/furniture
  private isWalkable(x: number, y: number): boolean {
      if (!this.isValid(x, y)) return false;
      const tile = this.map[y]![x]!;
      // Player cannot walk on CHAIR (unless we implement jumping over it?)
      return tile === TileType.FLOOR || tile === TileType.KITCHEN || tile === TileType.EXIT || tile === TileType.STAIRS || tile === TileType.SOFA;
  }

  // Stairs Interaction Logic
  // Can only enter stairs from the front (bottom)
  /*
  private canEnterStairs(targetX: number, targetY: number, currentX: number, currentY: number): boolean {
      const targetTile = this.map[targetY]![targetX]!;
      if (targetTile !== TileType.STAIRS) return true;
      
      // Moving UP (dy < 0) means entering from bottom (y+1 to y)
      // Moving DOWN (dy > 0) means entering from top (y-1 to y) -> Allowed?
      // User says: "Only enter from front (bottom)"
      // So if moving UP (dy = -1), allowed.
      // If moving DOWN (dy = 1), blocked? (Assuming entering from top wall is invalid)
      // If moving SIDEWAYS (dx != 0), blocked?
      
      const dy = targetY - currentY;
      // const dx = targetX - currentX; // Unused
      
      if (dy < 0) return true; // Moving UP (Enter from bottom)
      
      // If ALREADY on stairs, can move anywhere on stairs?
      // Assuming "Stairs" is a region.
      const currentTile = this.map[currentY]![currentX]!;
      if (currentTile === TileType.STAIRS) return true; // Moving within/out of stairs is fine
      
      return false; // Cannot enter from side/top
  }
  */

  private handlePlayerMovement(player: Entity, _deltaTime: number) {
    // deltaTime is unused for grid movement logic but kept for future smooth interpolation
    if (!player.isMoving) {
      let dx = 0;
      let dy = 0;
      
      if (this.keysPressed.has('w') || this.keysPressed.has('ArrowUp')) dy = -1;
      else if (this.keysPressed.has('s') || this.keysPressed.has('ArrowDown')) dy = 1;
      else if (this.keysPressed.has('a') || this.keysPressed.has('ArrowLeft')) dx = -1;
      else if (this.keysPressed.has('d') || this.keysPressed.has('ArrowRight')) dx = 1;
      
        if (dx !== 0 || dy !== 0) {
        const targetX = player.x + dx;
        const targetY = player.y + dy;
        
        if (dy < 0) player.direction = 'up';
        else if (dy > 0) player.direction = 'down';
        else if (dx < 0) player.direction = 'left';
        else if (dx > 0) player.direction = 'right';

        const currentTile = this.map[player.y]![player.x];
        // Safely get target tile
        let targetTile = TileType.WALL;
        if (this.isValid(targetX, targetY)) {
             targetTile = this.map[targetY]![targetX];
        }

        // --- STAIRS TRIGGER LOGIC ---
        // Run BEFORE movement check to allow triggering even if blocked by wall (e.g. top of stairs)
        
        // Case 1: Going UP (F1 -> F2)
        // Trigger if: On Stairs AND Moving UP AND (Blocked by Wall OR Moving off Stairs)
        if (currentTile === TileType.STAIRS && dy < 0) {
            const currentFloor = player.floor || 1;
            if (currentFloor === 1) {
                const isBlockedByWall = !this.isWalkable(targetX, targetY); // Wall or Obstacle
                const isMovingOff = this.isValid(targetX, targetY) && targetTile !== TileType.STAIRS;
                
                if (isBlockedByWall || isMovingOff) {
                    const nextFloor = 2;
                    if (this.floors[nextFloor]) {
                        console.log(`Switching floor from ${currentFloor} to ${nextFloor}`);
                        this.switchFloor(nextFloor, true);
                        return;
                    }
                }
            }
        }
        
        // Case 2: Going DOWN (F2 -> F1) - Walking Up into Wall
        // Trigger if: On Stairs AND Moving UP AND Blocked by Wall
        if (currentTile === TileType.STAIRS && dy < 0) {
             const currentFloor = player.floor || 1;
             if (currentFloor === 2) {
                 const isBlockedByWall = !this.isWalkable(targetX, targetY);
                 if (isBlockedByWall) {
                     const nextFloor = 1;
                     if (this.floors[nextFloor]) {
                         console.log(`Switching floor from ${currentFloor} to ${nextFloor}`);
                         this.switchFloor(nextFloor, true);
                         return;
                     }
                 }
             }
        }

        // Case 3: Going DOWN (F2 -> F1) - Walking Down Logic
        // Trigger if: On Stairs AND Moving DOWN AND (Blocked by Wall OR Moving off Stairs)
        if (currentTile === TileType.STAIRS && dy > 0) {
             const currentFloor = player.floor || 1;
             if (currentFloor === 2) {
                 // If walking off the stairs (at the bottom)
                 const isBlockedByWall = !this.isWalkable(targetX, targetY);
                 const isMovingOff = this.isValid(targetX, targetY) && targetTile !== TileType.STAIRS;
                 
                 if (isBlockedByWall || isMovingOff) {
                     const nextFloor = 1;
                     if (this.floors[nextFloor]) {
                         console.log(`Switching floor from ${currentFloor} to ${nextFloor}`);
                         this.switchFloor(nextFloor, true);
                         return;
                     }
                 }
             }
        }

        if (this.isWalkable(targetX, targetY)) {
           // Check Stairs Entry Constraint - Removed to fix blockage feeling, rely on walls/furniture
           // if (!this.canEnterStairs(targetX, targetY, player.x, player.y)) {
           //    return; // Blocked
           // }

           // Also check if entity is there (e.g. customer) on the current floor
           const blocker = this.entities.find(e => 
               e.x === targetX && 
               e.y === targetY && 
               (e.floor === undefined || e.floor === this.currentFloor)
           );
           
           // Allow walking through certain furniture (Sofa)
           let isBlocked = !!blocker;
           if (blocker && blocker.type === 'furniture') {
               const f = blocker as Furniture;
               if (f.furnitureType === 'sofa') {
                   isBlocked = false;
               }
           }

           if (!isBlocked) {
              player.targetX = targetX;
              player.targetY = targetY;
              player.isMoving = true;
              
              // Old Trigger Logic location (Removed)
           }
        }
      }
    }
  }
  
  private updateEntityPosition(entity: Entity, _deltaTime: number) {
      // deltaTime is unused for fixed pixel step but kept for future time-based movement
      if (entity.isMoving && entity.targetX !== undefined && entity.targetY !== undefined) {
          const destPixelX = entity.targetX * this.GRID_SIZE;
          const destPixelY = entity.targetY * this.GRID_SIZE;
          
          const moveStep = 4; // Pixels per frame
          
          let finishedX = false;
          let finishedY = false;

          if (entity.pixelX < destPixelX) {
              entity.pixelX = Math.min(entity.pixelX + moveStep, destPixelX);
          } else if (entity.pixelX > destPixelX) {
              entity.pixelX = Math.max(entity.pixelX - moveStep, destPixelX);
          } else {
              finishedX = true;
          }

          if (entity.pixelY < destPixelY) {
              entity.pixelY = Math.min(entity.pixelY + moveStep, destPixelY);
          } else if (entity.pixelY > destPixelY) {
              entity.pixelY = Math.max(entity.pixelY - moveStep, destPixelY);
          } else {
              finishedY = true;
          }

          if (finishedX && finishedY) {
              entity.x = entity.targetX;
              entity.y = entity.targetY;
              entity.isMoving = false;
              entity.targetX = undefined;
              entity.targetY = undefined;
          }
      }
  }

  // --- Customer Logic ---

  private customerQueue: Partial<Customer>[] = [];

  public queueCustomer(customerData: Partial<Customer>) {
      this.customerQueue.push(customerData);
  }

  private spawnCustomer() {
      // Find an empty seat on Floor 1 (Customers only on 1st floor)
      const chairsOnFloor1 = this.floorChairs[1] || [];
      if (chairsOnFloor1.length === 0) return;

      const occupiedSeats = new Set(
          this.entities
          .filter(e => e.type === 'customer' && (e as Customer).seatId)
          .map(e => (e as Customer).seatId)
      );

      const availableChairs = chairsOnFloor1.filter(c => !occupiedSeats.has(`${c.x},${c.y}`));
      
      if (availableChairs.length === 0) return; // No seats

      const randomChair = availableChairs[Math.floor(Math.random() * availableChairs.length)];
      
      if (!randomChair) return;
      
      // Check queue for special guests
      let specialData: Partial<Customer> = {};
      if (this.customerQueue.length > 0) {
          specialData = this.customerQueue.shift()!;
      }

      // Determine Spawn Point (Exit)
      // Use the first available exit on the current floor (usually Floor 1)
      // Customers enter from outside, so they should spawn at an Exit tile.
      // If multiple exits exist, pick one randomly.
      let spawnX = 10;
      let spawnY = this.ROWS - 1;
      
      // Usually customers spawn on Floor 1
      const spawnExits = this.floorExits[1] || [];
      
      if (spawnExits.length > 0) {
          const exit = spawnExits[Math.floor(Math.random() * spawnExits.length)];
          if (exit) {
              spawnX = exit.x;
              spawnY = exit.y;
          }
      } else {
           console.warn("[IzakayaScene] No exits found for spawning customers! Using default (10, bottom).");
      }

      const customer: Customer = {
          id: `customer_${Date.now()}`,
          type: 'customer',
          floor: 1, // Always on Floor 1
          name: specialData.name || 'Guest',
          isSpecial: specialData.isSpecial || false,
          dialogue: specialData.dialogue,
          x: spawnX, 
          y: spawnY,
          pixelX: spawnX * this.GRID_SIZE,
          pixelY: spawnY * this.GRID_SIZE,
          direction: 'up',
          isMoving: false,
          moveSpeed: 0.1,
          state: 'entering',
          patience: 100,
          seatId: `${randomChair.x},${randomChair.y}`,
          targetX: undefined, // Initialize
          targetY: undefined,  // Initialize
          ...specialData // Override defaults
      };

      this.addEntity(customer);
  }

  private updateCustomer(customer: Customer, deltaTime: number) {
       if (customer.isMoving) return;
       
       const customerMap = this.floors[customer.floor || 1] || this.map;
 
       // Patience Decay
       if (['waiting_seat', 'ordering', 'waiting_food'].includes(customer.state)) {
           customer.patience -= deltaTime * 0.005; // ~20 seconds to 0
           if (customer.patience <= 0) {
               if (customer.state === 'waiting_food') {
                   this.dispatchOrderEvent('cancel', customer);
               }
               customer.state = 'leaving';
               console.log(`${customer.name} got impatient and left!`);
           }
       }

      if (customer.state === 'entering') {
          // Find path to seat
          if (customer.seatId) {
              const parts = customer.seatId.split(',');
              const sx = Number(parts[0]);
              const sy = Number(parts[1]);
              
              if (!isNaN(sx) && !isNaN(sy)) {
                  const path = this.findPath({x: customer.x, y: customer.y}, {x: sx, y: sy}, customerMap);
                  
                  if (path.length > 0) {
                      const nextStep = path[0];
                      if (nextStep) {
                          this.moveEntityTo(customer, nextStep.x, nextStep.y);
                      }
                  } else {
                       // Arrived?
                       if (customer.x === sx && customer.y === sy) {
                           customer.state = 'seated';
                           setTimeout(() => {
                               if (customer.state === 'seated') customer.state = 'ordering';
                           }, 2000 + Math.random() * 2000);
                       }
                  }
              }
          }
      } else if (customer.state === 'eating') {
          if (customer.eatTimer !== undefined) {
              customer.eatTimer -= deltaTime;
              if (customer.eatTimer <= 0) {
                  // Done eating
                  customer.state = 'leaving';
                  // Revenue
                  const revenue = customer.order ? customer.order.price : 0;
                  console.log(`${customer.name} finished eating. Revenue: ${revenue}`);
                  
                  const event = new CustomEvent('izakaya-revenue', { detail: { amount: revenue } });
                  this.canvas.dispatchEvent(event);
              }
          }
      } else if (customer.state === 'leaving') {
          // Pathfind to exit
          let exitX = 10;
          let exitY = this.ROWS - 1;
          
          const exits = this.floorExits[customer.floor || 1] || [];
          if (exits.length > 0) {
              // Find nearest exit
              let minDist = Infinity;
              for (const exit of exits) {
                  const dist = Math.abs(customer.x - exit.x) + Math.abs(customer.y - exit.y);
                  if (dist < minDist) {
                      minDist = dist;
                      exitX = exit.x;
                      exitY = exit.y;
                  }
              }
          }

          if (customer.x === exitX && customer.y === exitY) {
              this.removeEntity(customer.id);
              return;
          }

          const path = this.findPath({x: customer.x, y: customer.y}, {x: exitX, y: exitY}, customerMap);
          if (path.length > 0) {
              const nextStep = path[0];
              if (nextStep) {
                  this.moveEntityTo(customer, nextStep.x, nextStep.y);
              }
          } else {
              // Stuck or close enough? Just force move towards exit if path fails (e.g. if blocked)
              // Or just remove if close
              if (Math.abs(customer.x - exitX) + Math.abs(customer.y - exitY) < 2) {
                  this.removeEntity(customer.id);
              }
          }
      }
  }

  private removeEntity(id: string) {
      const index = this.entities.findIndex(e => e.id === id);
      if (index !== -1) {
          this.entities.splice(index, 1);
      }
  }

  private dispatchOrderEvent(type: 'add' | 'complete' | 'cancel', customer: Customer) {
      const event = new CustomEvent('izakaya-order-update', {
          detail: {
              type,
              orderId: customer.id, // Use customer ID as order ID for now
              customerName: customer.name,
              dishName: customer.order?.dishName,
              price: customer.order?.price,
              seatId: customer.seatId
          }
      });
      this.canvas.dispatchEvent(event);
  }

  private moveEntityTo(entity: Entity, x: number, y: number) {
      if (x > entity.x) entity.direction = 'right';
      else if (x < entity.x) entity.direction = 'left';
      else if (y > entity.y) entity.direction = 'down';
      else if (y < entity.y) entity.direction = 'up';

      entity.targetX = x;
      entity.targetY = y;
      entity.isMoving = true;
  }

  private findPath(start: Position, end: Position, map: TileType[][] = this.map): Position[] {
      // Simple BFS
      const queue: {pos: Position, path: Position[]}[] = [{pos: start, path: []}];
      const visited = new Set<string>();
      visited.add(`${start.x},${start.y}`);

      while (queue.length > 0) {
          const {pos, path} = queue.shift()!;
          
          if (pos.x === end.x && pos.y === end.y) {
              return path;
          }

          const neighbors = [
              {x: pos.x, y: pos.y - 1},
              {x: pos.x, y: pos.y + 1},
              {x: pos.x - 1, y: pos.y},
              {x: pos.x + 1, y: pos.y}
          ];

          for (const n of neighbors) {
              const key = `${n.x},${n.y}`;
              if (!visited.has(key) && this.isPassable(n.x, n.y, map)) {
                  // If it's the destination (chair), it's passable.
                  // But we shouldn't walk THROUGH other chairs to get there.
                  // For simplicity, let's assume all chairs are passable for now, 
                  // or check if it's the target chair.
                  
                  visited.add(key);
                  queue.push({pos: n, path: [...path, n]});
              }
          }
      }
      return [];
  }
  
  private render() {
      // Clear
      this.ctx.fillStyle = '#1a1a1a';
      this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

      // Draw Map
      const mapHeight = this.map.length;
      const mapWidth = this.map[0]?.length || 0;

      for (let y = 0; y < mapHeight; y++) {
          for (let x = 0; x < mapWidth; x++) {
              const tile = this.map[y]![x]!;
              this.drawTile(x, y, tile);
          }
      }

      // Draw Entities
      // Filter by current floor and Z-Index sort by Y
      const sortedEntities = this.entities
        .filter(e => e.floor === undefined || e.floor === this.currentFloor)
        .sort((a, b) => a.pixelY - b.pixelY);
      
      for (const entity of sortedEntities) {
          this.drawEntity(entity);
      }
  }

  public placeItem(x: number, y: number, item: Item): boolean {
      const key = `${x},${y}`;
      if (this.placedItems.has(key)) return false; // Already occupied
      this.placedItems.set(key, item);
      return true;
  }

  public pickItem(x: number, y: number): Item | null {
      const key = `${x},${y}`;
      const item = this.placedItems.get(key);
      if (item) {
          this.placedItems.delete(key);
          return item;
      }
      return null;
  }

  public getPlacedItem(x: number, y: number): Item | undefined {
      return this.placedItems.get(`${x},${y}`);
  }

  private drawFurniture(f: Furniture) {
      const px = f.pixelX;
      const py = f.pixelY;
      const w = (f.width || 1) * this.GRID_SIZE;
      const h = (f.height || 1) * this.GRID_SIZE;

      switch(f.furnitureType) {
          case 'bed':
              // Bed (2x3)
              // Headboard at top
              this.ctx.fillStyle = '#5d4037'; // Frame
              this.ctx.fillRect(px + 4, py + 4, w - 8, h - 8);
              
              // Mattress
              this.ctx.fillStyle = '#eceff1';
              this.ctx.fillRect(px + 8, py + 20, w - 16, h - 28);
              
              // Pillow
              this.ctx.fillStyle = '#90caf9';
              this.ctx.fillRect(px + 12, py + 24, w - 24, 20);
              
              // Blanket (Lower half)
              this.ctx.fillStyle = '#ef5350';
              this.ctx.fillRect(px + 8, py + h/2, w - 16, h/2 - 8);
              break;
              
          case 'sofa':
              // Sofa (2x1)
              this.ctx.fillStyle = '#8d6e63'; // Brown Leather
              // Backrest
              this.ctx.fillRect(px + 4, py + 4, w - 8, 12);
              // Seat
              this.ctx.fillStyle = '#a1887f';
              this.ctx.fillRect(px + 4, py + 16, w - 8, h - 20);
              // Armrests
              this.ctx.fillStyle = '#6d4c41';
              this.ctx.fillRect(px + 4, py + 16, 8, h - 20);
              this.ctx.fillRect(px + w - 12, py + 16, 8, h - 20);
              break;
              
          case 'lamp':
              // Lamp (1x2)
              // Base
              this.ctx.fillStyle = '#212121';
              this.ctx.fillRect(px + this.GRID_SIZE/2 - 4, py + h - 10, 8, 8);
              // Pole
              this.ctx.fillStyle = '#424242';
              this.ctx.fillRect(px + this.GRID_SIZE/2 - 2, py + 20, 4, h - 30);
              // Shade
              this.ctx.fillStyle = '#FFF59D'; // Yellow Shade
              this.ctx.beginPath();
              this.ctx.moveTo(px + 10, py + 40);
              this.ctx.lineTo(px + this.GRID_SIZE - 10, py + 40);
              this.ctx.lineTo(px + this.GRID_SIZE - 4, py + 10);
              this.ctx.lineTo(px + 4, py + 10);
              this.ctx.closePath();
              this.ctx.fill();
              
              // Glow effect (Gradient)
              const grad = this.ctx.createRadialGradient(px + this.GRID_SIZE/2, py + 20, 0, px + this.GRID_SIZE/2, py + 20, 60);
              grad.addColorStop(0, 'rgba(255, 235, 59, 0.4)');
              grad.addColorStop(1, 'rgba(255, 235, 59, 0)');
              this.ctx.fillStyle = grad;
              this.ctx.fillRect(px - 20, py - 20, w + 40, h + 40);
              break;
              
          case 'bookshelf':
              // Bookshelf (1x2)
              this.ctx.fillStyle = '#5d4037'; // Wood
              this.ctx.fillRect(px + 4, py + 4, w - 8, h - 8);
              // Shelves
              this.ctx.fillStyle = '#3e2723';
              for(let i=1; i<4; i++) {
                  this.ctx.fillRect(px + 6, py + (h/4)*i, w - 12, 4);
              }
              // Books (Random colors)
              const colors = ['#e57373', '#64b5f6', '#81c784', '#fff176'];
              for(let r=0; r<4; r++) {
                  if (r === 3) continue; // Skip bottom shelf?
                  const shelfY = py + (h/4)*r + 8;
                  for(let b=0; b<5; b++) {
                      this.ctx.fillStyle = colors[b % colors.length] || '#000000';
                      this.ctx.fillRect(px + 8 + b*8, shelfY, 6, (h/4) - 12);
                  }
              }
              break;
              
          case 'toilet':
              // Toilet (1x1)
              this.ctx.fillStyle = '#ffffff';
              // Tank
              this.ctx.fillRect(px + 8, py + 4, this.GRID_SIZE - 16, 12);
              // Bowl
              this.ctx.beginPath();
              this.ctx.ellipse(px + this.GRID_SIZE/2, py + 28, 12, 14, 0, 0, Math.PI*2);
              this.ctx.fill();
              // Lid
              this.ctx.strokeStyle = '#bdbdbd';
              this.ctx.stroke();
              break;
              
          case 'sink':
              // Sink (1x1)
              this.ctx.fillStyle = '#ffffff';
              // Basin
              this.ctx.beginPath();
              this.ctx.arc(px + this.GRID_SIZE/2, py + this.GRID_SIZE/2 + 5, 14, 0, Math.PI, false);
              this.ctx.fill();
              this.ctx.strokeStyle = '#bdbdbd';
              this.ctx.stroke();
              // Faucet
              this.ctx.fillStyle = '#90a4ae';
              this.ctx.fillRect(px + this.GRID_SIZE/2 - 2, py + 4, 4, 15);
              this.ctx.beginPath();
              this.ctx.arc(px + this.GRID_SIZE/2, py + 15, 3, 0, Math.PI*2);
              this.ctx.fill();
              break;
              
          case 'mirror':
              // Mirror (1x1) - Wall mounted
              // Frame
              this.ctx.fillStyle = '#d7ccc8';
              this.ctx.fillRect(px + 8, py + 4, this.GRID_SIZE - 16, this.GRID_SIZE - 16);
              // Glass
              this.ctx.fillStyle = '#e1f5fe';
              this.ctx.fillRect(px + 10, py + 6, this.GRID_SIZE - 20, this.GRID_SIZE - 20);
              // Reflection
              this.ctx.fillStyle = 'rgba(255,255,255,0.5)';
              this.ctx.beginPath();
              this.ctx.moveTo(px + 10, py + this.GRID_SIZE - 14);
              this.ctx.lineTo(px + 20, py + 6);
              this.ctx.lineTo(px + 25, py + 6);
              this.ctx.lineTo(px + 15, py + this.GRID_SIZE - 14);
              this.ctx.fill();
              break;
              
          default:
              // Fallback
              this.ctx.fillStyle = '#9c27b0';
              this.ctx.fillRect(px, py, w, h);
      }
  }

  private drawTile(x: number, y: number, tile: TileType) {
      const px = x * this.GRID_SIZE;
      const py = y * this.GRID_SIZE;
      
      switch(tile) {
          case TileType.FLOOR:
              this.ctx.fillStyle = '#3e2723'; // Dark Wood
              this.ctx.fillRect(px, py, this.GRID_SIZE, this.GRID_SIZE);
              this.ctx.strokeStyle = '#4e342e'; // Grid lines
              this.ctx.lineWidth = 1;
              this.ctx.strokeRect(px, py, this.GRID_SIZE, this.GRID_SIZE);
              break;
          case TileType.WALL:
          case TileType.WALL_WITH_PAINTING:
          case TileType.WINDOW:
          case TileType.MIRROR:
              // Context-Aware Rendering for Pseudo-3D
              const mapHeight = this.map.length;
              const mapWidth = this.map[0]?.length || 0;
              
              const isBottomOpen = y < mapHeight - 1 && this.map[y+1] && this.map[y+1]![x] !== TileType.WALL && this.map[y+1]![x] !== TileType.WALL_WITH_PAINTING && this.map[y+1]![x] !== TileType.WINDOW && this.map[y+1]![x] !== TileType.MIRROR;
              const isRightOpen = x < mapWidth - 1 && this.map[y]![x+1] !== TileType.WALL && this.map[y]![x+1] !== TileType.WALL_WITH_PAINTING && this.map[y]![x+1] !== TileType.WINDOW && this.map[y]![x+1] !== TileType.MIRROR;
              const isLeftOpen = x > 0 && this.map[y]![x-1] !== TileType.WALL && this.map[y]![x-1] !== TileType.WALL_WITH_PAINTING && this.map[y]![x-1] !== TileType.WINDOW && this.map[y]![x-1] !== TileType.MIRROR;
              
              // Base Color (Top Surface)
              this.ctx.fillStyle = '#5d4037'; // Standard Wood
              this.ctx.fillRect(px, py, this.GRID_SIZE, this.GRID_SIZE);
              
              // 1. Front Face (South) - Only if bottom is open (or painting/window/mirror)
              if (isBottomOpen || tile === TileType.WALL_WITH_PAINTING || tile === TileType.WINDOW || tile === TileType.MIRROR) {
                  // If it's a front face, we render the split look
                  
                  // Top Edge (Lighter)
                  this.ctx.fillStyle = '#6d4c41';
                  this.ctx.fillRect(px, py, this.GRID_SIZE, this.GRID_SIZE / 3);
                  
                  // Face (Standard)
                  this.ctx.fillStyle = '#8d6e63';
                  this.ctx.fillRect(px, py + this.GRID_SIZE / 3, this.GRID_SIZE, (this.GRID_SIZE / 3) * 2);
                  
                  // Shadow under the top edge
                  this.ctx.fillStyle = 'rgba(0,0,0,0.1)';
                  this.ctx.fillRect(px, py + this.GRID_SIZE / 3, this.GRID_SIZE, 2);
              }
              
              // 2. Right Face (East) - Only if right is open
              if (isRightOpen) {
                  // Draw a darker side panel on the right edge
                  this.ctx.fillStyle = '#4e342e'; // Dark shadow
                  this.ctx.fillRect(px + this.GRID_SIZE - 8, py, 8, this.GRID_SIZE);
              }

              // 3. Left Face (West) - Only if left is open
              if (isLeftOpen) {
                  // Draw a darker side panel on the left edge
                  this.ctx.fillStyle = '#4e342e'; // Dark shadow
                  this.ctx.fillRect(px, py, 8, this.GRID_SIZE);
              }

              // Draw Painting if applicable
              if (tile === TileType.WALL_WITH_PAINTING) {
                  const faceY = py + this.GRID_SIZE / 3;
                  const faceHeight = (this.GRID_SIZE / 3) * 2;
                  
                  // Frame
                  this.ctx.fillStyle = '#ffb300'; // Gold frame
                  this.ctx.fillRect(px + 10, faceY + 5, this.GRID_SIZE - 20, faceHeight - 15);
                  
                  // Canvas/Image
                  this.ctx.fillStyle = '#0277bd'; // Blue painting (e.g., The Great Wave)
                  this.ctx.fillRect(px + 12, faceY + 7, this.GRID_SIZE - 24, faceHeight - 19);
                  
                  // Detail
                  this.ctx.fillStyle = '#ffffff';
                  this.ctx.beginPath();
                  this.ctx.arc(px + this.GRID_SIZE/2, faceY + faceHeight/2, 3, 0, Math.PI * 2);
                  this.ctx.fill();
              }

              // Draw Mirror if applicable
              if (tile === TileType.MIRROR) {
                  const faceY = py + this.GRID_SIZE / 3;
                  const faceHeight = (this.GRID_SIZE / 3) * 2;
                  
                  // Frame
                  this.ctx.fillStyle = '#bdbdbd'; // Silver frame
                  this.ctx.fillRect(px + 10, faceY + 5, this.GRID_SIZE - 20, faceHeight - 10);
                  
                  // Mirror Glass
                  this.ctx.fillStyle = '#e3f2fd'; // Light Blue-ish White
                  this.ctx.fillRect(px + 12, faceY + 7, this.GRID_SIZE - 24, faceHeight - 14);
                  
                  // Reflection Lines
                  this.ctx.strokeStyle = 'rgba(255,255,255,0.7)';
                  this.ctx.lineWidth = 1;
                  this.ctx.beginPath();
                  this.ctx.moveTo(px + 15, faceY + faceHeight - 10);
                  this.ctx.lineTo(px + 25, faceY + 10);
                  this.ctx.stroke();
              }

              // Draw Window if applicable
              if (tile === TileType.WINDOW) {
                  const faceY = py + this.GRID_SIZE / 3;
                  const faceHeight = (this.GRID_SIZE / 3) * 2;
                  
                  // Check connections
                  const hasWindowAbove = y > 0 && this.map[y-1] && this.map[y-1]![x] === TileType.WINDOW;
                  const hasWindowBelow = y < mapHeight - 1 && this.map[y+1] && this.map[y+1]![x] === TileType.WINDOW;
                  const hasWindowLeft = x > 0 && this.map[y]![x-1] === TileType.WINDOW;
                  const hasWindowRight = x < mapWidth - 1 && this.map[y]![x+1] === TileType.WINDOW;

                  // Determine Orientation
                  // Default to horizontal if isolated or horizontal neighbors
                  let isVertical = false;
                  if (hasWindowAbove || hasWindowBelow) isVertical = true;
                  if (hasWindowLeft || hasWindowRight) isVertical = false;
                  
                  if (isVertical) {
                      // --- Vertical Window Style (New Material) ---
                      // Frame (Lighter/Different Wood)
                      this.ctx.fillStyle = '#795548'; // Lighter Brown
                      
                      // Left/Right Pillars (Thicker for vertical look)
                      this.ctx.fillRect(px + 4, faceY + 4, 6, faceHeight - 8);
                      this.ctx.fillRect(px + this.GRID_SIZE - 10, faceY + 4, 6, faceHeight - 8);
                      
                      // Top Bar (Only if start)
                      if (!hasWindowAbove) {
                           this.ctx.fillRect(px + 4, faceY + 4, this.GRID_SIZE - 8, 6);
                           // Arch detail?
                           this.ctx.beginPath();
                           this.ctx.arc(px + this.GRID_SIZE/2, faceY + 10, this.GRID_SIZE/2 - 6, Math.PI, 0);
                           this.ctx.fill();
                      }
                      
                      // Bottom Bar (Only if end)
                      if (!hasWindowBelow) {
                           this.ctx.fillRect(px + 4, faceY + faceHeight - 10, this.GRID_SIZE - 8, 6);
                      }

                      // Glass (Darker Blue/Purple tint for variety)
                      this.ctx.fillStyle = '#5c6bc0'; 
                      this.ctx.fillRect(px + 10, faceY + 10, this.GRID_SIZE - 20, faceHeight - 20);

                      // Vertical Bar (Single thin line)
                      this.ctx.fillStyle = '#795548';
                      this.ctx.fillRect(px + this.GRID_SIZE/2 - 1, faceY + 4, 2, faceHeight - 8);
                      
                  } else {
                      // --- Horizontal Window Style (Original) ---
                      // Window Frame (Dark Wood)
                      this.ctx.fillStyle = '#3e2723';
                      
                      // Left/Right Pillars
                      this.ctx.fillRect(px + 8, faceY + 4, 4, faceHeight - 8);
                      this.ctx.fillRect(px + this.GRID_SIZE - 12, faceY + 4, 4, faceHeight - 8);
                      
                      // Top Bar
                      if (!hasWindowAbove) {
                           this.ctx.fillRect(px + 8, faceY + 4, this.GRID_SIZE - 16, 4);
                      }
                      
                      // Bottom Bar
                      if (!hasWindowBelow) {
                           this.ctx.fillRect(px + 8, faceY + faceHeight - 8, this.GRID_SIZE - 16, 4);
                      }

                      // Glass (Light Blue/Cyan)
                      this.ctx.fillStyle = '#81d4fa'; 
                      this.ctx.fillRect(px + 12, faceY + 4, this.GRID_SIZE - 24, faceHeight - 8);

                      // Window Bars
                      this.ctx.fillStyle = '#3e2723';
                      this.ctx.fillRect(px + this.GRID_SIZE/2 - 1, faceY + 4, 2, faceHeight - 8);
                      this.ctx.fillRect(px + 12, faceY + faceHeight/2 - 1, this.GRID_SIZE - 24, 2);

                      // Reflection
                      this.ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
                      this.ctx.beginPath();
                      this.ctx.moveTo(px + 14, faceY + faceHeight - 8);
                      this.ctx.lineTo(px + 20, faceY + 8);
                      this.ctx.lineTo(px + 26, faceY + 8);
                      this.ctx.lineTo(px + 20, faceY + faceHeight - 8);
                      this.ctx.fill();
                  }
              }
              break;
          case TileType.COUNTER:
              this.ctx.fillStyle = '#8d6e63'; // Counter Wood
              this.ctx.fillRect(px, py, this.GRID_SIZE, this.GRID_SIZE);
              this.ctx.fillStyle = 'rgba(255,255,255,0.1)';
              this.ctx.fillRect(px, py, this.GRID_SIZE, 5);
              break;
          case TileType.CHAIR:
              this.ctx.fillStyle = '#3e2723'; // Floor BG first
              this.ctx.fillRect(px, py, this.GRID_SIZE, this.GRID_SIZE);
              
              this.ctx.fillStyle = '#a1887f'; // Chair Color
              const padding = 10;
              this.ctx.fillRect(px + padding, py + padding, this.GRID_SIZE - padding*2, this.GRID_SIZE - padding*2);
              break;
          case TileType.KITCHEN:
              this.ctx.fillStyle = '#263238'; // Dark Kitchen Floor
              this.ctx.fillRect(px, py, this.GRID_SIZE, this.GRID_SIZE);
              this.ctx.strokeStyle = '#37474f';
              this.ctx.strokeRect(px, py, this.GRID_SIZE, this.GRID_SIZE);
              break;
          case TileType.EXIT:
              this.ctx.fillStyle = '#ef5350'; // Red Exit
              this.ctx.fillRect(px, py, this.GRID_SIZE, this.GRID_SIZE);
              this.ctx.fillStyle = 'white';
              this.ctx.font = '10px Arial';
              this.ctx.fillText('EXIT', px + 10, py + 25);
              break;
          case TileType.BOWL_STACK:
              this.ctx.fillStyle = '#795548'; // Counter base
              this.ctx.fillRect(px, py, this.GRID_SIZE, this.GRID_SIZE);
              // Draw stack of bowls
              this.ctx.fillStyle = '#FF9800'; // Orange bowl
              this.ctx.beginPath();
              this.ctx.arc(px + this.GRID_SIZE/2, py + this.GRID_SIZE/2 + 5, 10, 0, Math.PI, false);
              this.ctx.fill();
              this.ctx.strokeStyle = '#FFF';
              this.ctx.lineWidth = 2;
              this.ctx.stroke();
              
              this.ctx.beginPath();
              this.ctx.arc(px + this.GRID_SIZE/2, py + this.GRID_SIZE/2, 10, 0, Math.PI, false);
              this.ctx.fill();
              this.ctx.stroke();
              
              this.ctx.fillStyle = 'white';
              this.ctx.font = '10px Arial';
              this.ctx.fillText('BOWLS', px + 5, py + 15);
              break;
          case TileType.SERVING_TABLE:
              this.ctx.fillStyle = '#8d6e63'; // Brown Table
              this.ctx.fillRect(px, py, this.GRID_SIZE, this.GRID_SIZE);
              this.ctx.strokeStyle = '#5d4037';
              this.ctx.lineWidth = 2;
              this.ctx.strokeRect(px, py, this.GRID_SIZE, this.GRID_SIZE);
              
              // Draw item if exists
              const item = this.getPlacedItem(x, y);
              if (item) {
                  if (item.type === 'dish') {
                      // Plate
                      this.ctx.fillStyle = '#ffffff';
                      this.ctx.beginPath();
                      this.ctx.arc(px + this.GRID_SIZE/2, py + this.GRID_SIZE/2, 14, 0, Math.PI * 2);
                      this.ctx.fill();
                      // Food
                      this.ctx.fillStyle = '#ff5722'; 
                      this.ctx.beginPath();
                      this.ctx.arc(px + this.GRID_SIZE/2, py + this.GRID_SIZE/2, 8, 0, Math.PI * 2);
                      this.ctx.fill();
                  } else if (item.type === 'bowl') {
                      // Bowl
                      this.ctx.fillStyle = '#b0bec5';
                      this.ctx.beginPath();
                      this.ctx.arc(px + this.GRID_SIZE/2, py + this.GRID_SIZE/2, 14, 0, Math.PI * 2);
                      this.ctx.fill();
                      this.ctx.fillStyle = '#eceff1';
                      this.ctx.beginPath();
                      this.ctx.arc(px + this.GRID_SIZE/2, py + this.GRID_SIZE/2, 10, 0, Math.PI * 2);
                      this.ctx.fill();
                  }
              }
              break;
          case TileType.COOKING_POT:
              this.ctx.fillStyle = '#263238'; // Dark Kitchen Floor
              this.ctx.fillRect(px, py, this.GRID_SIZE, this.GRID_SIZE);
              
              // Stove
              this.ctx.fillStyle = '#424242';
              this.ctx.fillRect(px + 4, py + 4, this.GRID_SIZE - 8, this.GRID_SIZE - 8);
              
              // Pot
              this.ctx.fillStyle = '#9E9E9E'; // Silver Pot
              this.ctx.beginPath();
              this.ctx.arc(px + this.GRID_SIZE/2, py + this.GRID_SIZE/2, 14, 0, Math.PI * 2);
              this.ctx.fill();
              this.ctx.strokeStyle = '#616161';
              this.ctx.stroke();
              
              // Contents?
              this.ctx.fillStyle = '#81D4FA'; // Water/Soup
              this.ctx.beginPath();
              this.ctx.arc(px + this.GRID_SIZE/2, py + this.GRID_SIZE/2, 10, 0, Math.PI * 2);
              this.ctx.fill();
              break;
          case TileType.STAIRS:
              // Draw Stairs
              this.ctx.fillStyle = '#4e342e'; // Dark Base
              this.ctx.fillRect(px, py, this.GRID_SIZE, this.GRID_SIZE);

              // Draw steps (horizontal stripes)
              // Each tile has 3 steps
              const stepHeight = this.GRID_SIZE / 3;
              this.ctx.fillStyle = '#6d4c41'; // Lighter wood for step top
              
              for (let i = 0; i < 3; i++) {
                  // Draw the top surface of each step
                  this.ctx.fillRect(px, py + i * stepHeight, this.GRID_SIZE, stepHeight - 4);
              }

              // Context-Aware Rails
              const hasStairsLeft = x > 0 && this.map[y]![x-1] === TileType.STAIRS;
              const hasStairsRight = x < this.COLS - 1 && this.map[y]![x+1] === TileType.STAIRS;

              // Left Rail
              if (!hasStairsLeft) {
                  this.ctx.fillStyle = '#3e2723'; // Dark Rail
                  this.ctx.fillRect(px, py, 4, this.GRID_SIZE);
                  this.ctx.fillStyle = '#5d4037'; // Rail Top
                  this.ctx.fillRect(px, py, 4, this.GRID_SIZE);
              }

              // Right Rail
              if (!hasStairsRight) {
                  this.ctx.fillStyle = '#3e2723'; // Dark Rail
                  this.ctx.fillRect(px + this.GRID_SIZE - 4, py, 4, this.GRID_SIZE);
                  this.ctx.fillStyle = '#5d4037'; // Rail Top
                  this.ctx.fillRect(px + this.GRID_SIZE - 4, py, 4, this.GRID_SIZE);
              }
              break;
          case TileType.BED:
              this.ctx.fillStyle = '#3e2723'; // Floor BG
              this.ctx.fillRect(px, py, this.GRID_SIZE, this.GRID_SIZE);
              
              // Bed Frame
              this.ctx.fillStyle = '#5d4037';
              this.ctx.fillRect(px + 4, py + 4, this.GRID_SIZE - 8, this.GRID_SIZE - 8);
              
              // Mattress (White)
              this.ctx.fillStyle = '#eceff1';
              this.ctx.fillRect(px + 6, py + 6, this.GRID_SIZE - 12, this.GRID_SIZE - 12);
              
              // Pillow (White/Blue)
              this.ctx.fillStyle = '#90caf9';
              this.ctx.fillRect(px + 8, py + 8, this.GRID_SIZE - 16, 12);
              
              // Blanket (Red/Pattern)
              this.ctx.fillStyle = '#ef5350';
              this.ctx.fillRect(px + 6, py + 24, this.GRID_SIZE - 12, this.GRID_SIZE - 30);
              break;
          case TileType.SOFA:
              this.ctx.fillStyle = '#3e2723'; // Floor BG
              this.ctx.fillRect(px, py, this.GRID_SIZE, this.GRID_SIZE);
              
              // Sofa Body (Red/Leather)
              this.ctx.fillStyle = '#8d6e63'; // Brown Leather
              // Backrest
              this.ctx.fillRect(px + 4, py + 4, this.GRID_SIZE - 8, 12);
              // Seat
              this.ctx.fillStyle = '#a1887f';
              this.ctx.fillRect(px + 4, py + 16, this.GRID_SIZE - 8, this.GRID_SIZE - 20);
              // Armrests
              this.ctx.fillStyle = '#6d4c41';
              this.ctx.fillRect(px + 4, py + 16, 6, this.GRID_SIZE - 20);
              this.ctx.fillRect(px + this.GRID_SIZE - 10, py + 16, 6, this.GRID_SIZE - 20);
              break;
      }
  }

  private drawEntity(entity: Entity) {
      const px = entity.pixelX;
      const py = entity.pixelY;
      
      this.ctx.save();
      
      // Shadow
      this.ctx.fillStyle = 'rgba(0,0,0,0.3)';
      this.ctx.beginPath();
      this.ctx.ellipse(px + this.GRID_SIZE/2, py + this.GRID_SIZE - 5, this.GRID_SIZE/3, this.GRID_SIZE/6, 0, 0, Math.PI*2);
      this.ctx.fill();

      // Body
      if (entity.type === 'player') {
          this.ctx.fillStyle = '#FF5252'; // Player Red
      } else if (entity.type === 'furniture') {
          this.drawFurniture(entity as Furniture);
          return; // Furniture has its own drawing logic
      } else {
          // Customer colors based on state?
          const customer = entity as Customer;
          if (customer.state === 'ordering') this.ctx.fillStyle = '#FFEB3B'; // Yellow
          else if (customer.state === 'waiting_food') this.ctx.fillStyle = '#8BC34A'; // Green
          else this.ctx.fillStyle = '#42A5F5'; // Blue
      }
      
      let bounceY = 0;
      if (entity.isMoving) {
          bounceY = Math.sin(Date.now() / 100) * 3;
      }

      this.ctx.fillRect(px + 8, py + 8 + bounceY, this.GRID_SIZE - 16, this.GRID_SIZE - 16);
      
      // Eyes
      this.ctx.fillStyle = 'white';
      if (entity.direction === 'down') {
          this.ctx.fillRect(px + 12, py + 15 + bounceY, 8, 8);
          this.ctx.fillRect(px + 28, py + 15 + bounceY, 8, 8);
      } else if (entity.direction === 'left') {
          this.ctx.fillRect(px + 10, py + 15 + bounceY, 8, 8);
      } else if (entity.direction === 'right') {
          this.ctx.fillRect(px + 30, py + 15 + bounceY, 8, 8);
      }

      // Status Icon for Customer
      if (entity.type === 'customer') {
          const customer = entity as Customer;
          if (customer.state === 'ordering') {
              // Draw "!" bubble
              this.ctx.fillStyle = 'white';
              this.ctx.beginPath();
              this.ctx.arc(px + this.GRID_SIZE - 5, py + 5 + bounceY, 10, 0, Math.PI*2);
              this.ctx.fill();
              this.ctx.fillStyle = 'red';
              this.ctx.font = 'bold 14px Arial';
              this.ctx.fillText('!', px + this.GRID_SIZE - 8, py + 10 + bounceY);
          } else if (customer.state === 'waiting_food') {
              // Draw "..." bubble
              this.ctx.fillStyle = 'white';
              this.ctx.beginPath();
              this.ctx.arc(px + this.GRID_SIZE - 5, py + 5 + bounceY, 10, 0, Math.PI*2);
              this.ctx.fill();
              this.ctx.fillStyle = '#333';
              this.ctx.font = 'bold 12px Arial';
              this.ctx.fillText('...', px + this.GRID_SIZE - 12, py + 8 + bounceY);
          } else if (customer.state === 'eating') {
              // Draw "Bowl" bubble
              this.ctx.fillStyle = 'white';
              this.ctx.beginPath();
              this.ctx.arc(px + this.GRID_SIZE - 5, py + 5 + bounceY, 10, 0, Math.PI*2);
              this.ctx.fill();
              this.ctx.fillStyle = '#FF9800'; // Orange bowl
              this.ctx.beginPath();
              this.ctx.arc(px + this.GRID_SIZE - 5, py + 8 + bounceY, 6, 0, Math.PI, false);
              this.ctx.fill();
          }
      }

      this.ctx.restore();
  }
}
