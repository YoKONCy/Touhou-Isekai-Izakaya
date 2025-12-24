
import { type Entity, type Position, TileType, TileTypeNames, type Customer, type Item, type Furniture } from '@/types/management';
import { TextureManager } from '@/services/graphics/TextureManager';
import floorTileImage from '@/assets/images/tilesets/地板.jpg';
import wallTileImage from '@/assets/images/tilesets/墙体.jpg';
import counterTileImage from '@/assets/images/tilesets/吧台.jpg';
import propsTileImage from '@/assets/images/tilesets/装饰杂项.jpg';
import chairTileImage from '@/assets/images/tilesets/椅子.jpg';
import tableTileImage from '@/assets/images/tilesets/桌子.jpg';

export class IzakayaScene {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private entities: Entity[] = [];
  private animationFrameId: number | null = null;
  
  // Grid Configuration
  private readonly GRID_SIZE = 48; // Pixels per grid cell
  private COLS = 20;
  private ROWS = 15;
  
  // Texture State
  private texturesLoaded = false;
  
  // Map Data
  private map: TileType[][] = [];
  private chairs: Position[] = [];
  private exits: Position[] = [];
  // private floors: Record<number, TileType[][]> = {}; // Multi-floor storage (Removed)
  // private currentFloor: number = 1; // Current active floor (Removed)
  // private floorChairs: Record<number, Position[]> = {}; // Chairs per floor (Removed)
  // private floorExits: Record<number, Position[]> = {}; // Exits per floor (Removed)
  private placedItems: Map<string, Item> = new Map();

  // Input State
  private keysPressed: Set<string> = new Set();
  
  // Game Loop State
  private lastTime = 0;
  private spawnTimer = 0;
  private readonly SPAWN_INTERVAL = 5000; // 5 seconds

  constructor(canvas: HTMLCanvasElement, customLayout?: string[]) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    
    // Initialize Map
    if (customLayout) {
        // Parse single floor layout
        const { map, chairs, exits, furniture } = this.parseLayout(customLayout);
        this.map = map;
        // this.chairs = chairs; // We need to store chairs if we want to access them, or rely on entities
        // Since we removed floorChairs, we might want to just rely on entities or a single chairs array if needed.
        // Original code used floorChairs for random seating?
        // Let's see... spawnCustomer uses this.floorChairs[1].
        // So I should keep a single chairs array.
        this.chairs = chairs;
        this.exits = exits;

        // Add Furniture Entities
        furniture.forEach(f => {
            this.addEntity(f);
        });
    } else {
        this.initMap();
    }

    // Set Canvas Size
    this.canvas.width = this.COLS * this.GRID_SIZE;
    this.canvas.height = this.ROWS * this.GRID_SIZE;

    // Disable image smoothing for crisp pixel art
    this.ctx.imageSmoothingEnabled = false;
    (this.ctx as any).webkitImageSmoothingEnabled = false;
    (this.ctx as any).mozImageSmoothingEnabled = false;
    (this.ctx as any).msImageSmoothingEnabled = false;

    // Initialize Input Listeners
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('keydown', this.handleInteraction);
    
    // Add Player Entity
    this.addEntity({
      id: 'player',
      type: 'player',
      x: 10,
      y: 10,
      pixelX: 10 * this.GRID_SIZE,
      pixelY: 10 * this.GRID_SIZE,
      direction: 'down',
      isMoving: false,
      moveSpeed: 0.15,
    });

    // Load Textures
    this.loadTextures();
  }

    private async loadTextures() {
        try {
            // 设置 spacing 参数进行裁剪，适配 AI 生成的带间隙或无缝素材
            // 地板 (2x2)
            await TextureManager.getInstance().loadTileSet('floor_pack', floorTileImage, this.GRID_SIZE, 0, 0, 2, 2);
            
            // 墙体 (3x3) - innerBleed=2 消除绿边
            await TextureManager.getInstance().loadTileSet('wall_pack', wallTileImage, this.GRID_SIZE, 0, 0, 3, 3, 2);
            
            // 吧台 (3x3) - innerBleed=2
            await TextureManager.getInstance().loadTileSet('counter_pack', counterTileImage, this.GRID_SIZE, 0, 0, 3, 3, 2);
            
            // 椅子 (2x2) - innerBleed=2
            await TextureManager.getInstance().loadTileSet('chair_pack', chairTileImage, this.GRID_SIZE, 0, 0, 2, 2, 2);
            
            // 桌子 (2x2) - innerBleed=2
            await TextureManager.getInstance().loadTileSet('table_pack', tableTileImage, this.GRID_SIZE, 0, 0, 2, 2, 2);
            
            // 装饰杂项 (3x4) - innerBleed=2
            await TextureManager.getInstance().loadTileSet('props_pack', propsTileImage, this.GRID_SIZE, 0, 0, 3, 4, 2);

            this.texturesLoaded = true;
            console.log('[IzakayaScene] Textures loaded.');
        } catch (e) {
            console.error('[IzakayaScene] Failed to load textures', e);
        }
    }

  /* parseFloors and switchFloor removed */

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
        'T': TileType.FLOOR, // Table will be an Entity, floor underneath
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
            
            // Spawn Table Entity from 'T'
            if (char === 'T') {
                // Determine orientation based on context (default Horizontal 2x1)
                // If there are chairs above/below (y-1 or y+1), it suggests Horizontal (Long edge top/bottom)
                // If there are chairs left/right (x-1 or x+1), it suggests Vertical (Long edge left/right)
                
                // Let's use a simple heuristic: Default Horizontal.
                // Or check the DEFAULT_MAP_DATA layout.
                // In DEFAULT_MAP_DATA, T is at (x,y), h is at (x,y+1). This fits Horizontal Table (chairs on long side).
                
                const fType = 'table';
                const width = 2; // Horizontal default
                const height = 1;
                
                furniture.push({
                    id: `furniture_${x}_${y}_${Date.now()}_${Math.random()}`,
                    type: 'furniture',
                    furnitureType: fType,
                    x, y,
                    pixelX: x * this.GRID_SIZE,
                    pixelY: y * this.GRID_SIZE,
                    width,
                    height,
                    direction: 'down',
                    isMoving: false,
                    moveSpeed: 0
                });
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
    const furniture: Furniture[] = [];
    
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

    // Add Furniture Entities (Demonstrating the new 4x3 Props)
    const addProp = (x: number, y: number, type: Furniture['furnitureType']) => {
        furniture.push({
            id: `prop_${x}_${y}`,
            type: 'furniture',
            furnitureType: type,
            x, y,
            pixelX: x * this.GRID_SIZE,
            pixelY: y * this.GRID_SIZE,
            direction: 'down',
            isMoving: false,
            moveSpeed: 0
        });
    };

    addProp(2, 2, 'stove'); // Row 1, Col 2 in props
    addProp(8, 4, 'sink');  // Row 1, Col 1 in props
    addProp(1, 1, 'lamp');  // Row 2, Col 1 in props

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
    const addTable = (cx: number, cy: number, orientation: 'h' | 'v' = 'h') => {
         const width = orientation === 'h' ? 2 : 1;
         const height = orientation === 'v' ? 2 : 1;
         
         furniture.push({
             id: `table_${cx}_${cy}_${Date.now()}_${Math.random()}`,
             type: 'furniture',
             furnitureType: 'table',
             x: cx,
             y: cy,
             pixelX: cx * this.GRID_SIZE,
             pixelY: cy * this.GRID_SIZE,
             width,
             height,
             direction: 'down',
             isMoving: false,
             moveSpeed: 0
         });

         if (orientation === 'v') {
             // 1x2 Vertical Table (Anchor at top)
             if (cy + 1 < this.ROWS) {
                 // Chairs (Left/Right of top part)
                 if (cx-1 >= 0) { map[cy]![cx-1] = TileType.CHAIR; chairs.push({x: cx-1, y: cy}); }
                 if (cx+1 < this.COLS) { map[cy]![cx+1] = TileType.CHAIR; chairs.push({x: cx+1, y: cy}); }
                 
                 // Chairs (Left/Right of bottom part)
                 if (cx-1 >= 0) { map[cy+1]![cx-1] = TileType.CHAIR; chairs.push({x: cx-1, y: cy+1}); }
                 if (cx+1 < this.COLS) { map[cy+1]![cx+1] = TileType.CHAIR; chairs.push({x: cx+1, y: cy+1}); }
             }
         } else {
             // 2x1 Horizontal Table (Anchor at left)
             if (cx + 1 < this.COLS) {
                 // Chairs (Top/Bottom of left part)
                 if (cy-1 >= 0) { map[cy-1]![cx] = TileType.CHAIR; chairs.push({x: cx, y: cy-1}); }
                 if (cy+1 < this.ROWS) { map[cy+1]![cx] = TileType.CHAIR; chairs.push({x: cx, y: cy+1}); }
                 
                 // Chairs (Top/Bottom of right part)
                 if (cy-1 >= 0) { map[cy-1]![cx+1] = TileType.CHAIR; chairs.push({x: cx+1, y: cy-1}); }
                 if (cy+1 < this.ROWS) { map[cy+1]![cx+1] = TileType.CHAIR; chairs.push({x: cx+1, y: cy+1}); }
             }
         }
    };

    addTable(4, 8, 'v');
    addTable(14, 8, 'v');
    addTable(4, 11, 'h');
    addTable(14, 11, 'h');

    // Add Exit (Bottom)
    map[this.ROWS - 1]![10] = TileType.EXIT;
    map[this.ROWS - 1]![9] = TileType.EXIT;
    map[this.ROWS - 1]![11] = TileType.EXIT;
    exits.push({x: 10, y: this.ROWS - 1});
    exits.push({x: 9, y: this.ROWS - 1});
    exits.push({x: 11, y: this.ROWS - 1});

    this.map = map;
    this.chairs = chairs;
    this.exits = exits;
    furniture.forEach(f => this.addEntity(f));
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
     
     // Check if there is an entity at target position
     const targetEntity = this.entities.find(e => {
        const w = (e as any).width || 1;
        const h = (e as any).height || 1;
        return targetX >= e.x && targetX < e.x + w && 
               targetY >= e.y && targetY < e.y + h && 
               e.id !== player.id;
     });

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
      if (tile === TileType.FLOOR || tile === TileType.KITCHEN || tile === TileType.EXIT || tile === TileType.CHAIR || tile === TileType.SOFA) {
          // Check for solid furniture entities
          const blocker = this.entities.find(e => {
              if (e.type !== 'furniture') return false;
              const f = e as Furniture;
              if (f.furnitureType === 'sofa') return false; // Sofa is passable
              const w = f.width || 1;
              const h = f.height || 1;
              return x >= f.x && x < f.x + w && y >= f.y && y < f.y + h;
          });
          return !blocker;
      }
      return false;
  }

  // A simplified check for player collision vs walls/furniture
  private isWalkable(x: number, y: number): boolean {
      if (!this.isValid(x, y)) return false;
      const tile = this.map[y]![x]!;
      // Player cannot walk on CHAIR (unless we implement jumping over it?)
      return tile === TileType.FLOOR || tile === TileType.KITCHEN || tile === TileType.EXIT || tile === TileType.SOFA;
  }

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

        if (this.isWalkable(targetX, targetY)) {

           // Also check if entity is there (e.g. customer) on the current floor
           const blocker = this.entities.find(e => {
               const w = (e as any).width || 1;
               const h = (e as any).height || 1;
               return targetX >= e.x && targetX < e.x + w &&
                      targetY >= e.y && targetY < e.y + h;
           });
           
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
      const chairsOnFloor1 = this.chairs;
      if (chairsOnFloor1.length === 0) return;

      const occupiedSeats = new Set(
          this.entities
          .filter(e => e.type === 'customer' && (e as Customer).seatId)
          .map(e => (e as Customer).seatId)
      );

      const availableChairs = chairsOnFloor1.filter((c: Position) => !occupiedSeats.has(`${c.x},${c.y}`));
      
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
      const spawnExits = this.exits;
      
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
       
       const customerMap = this.map;
 
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
          
          const exits = this.exits;
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

      // Draw Entities (Z-Index sort by Y)
      const sortedEntities = this.entities
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
      const tm = TextureManager.getInstance();

      // 尝试使用 props_pack 绘制
      let sliceIndex = -1;
      // 4x3 Grid (12 items) mapping:
      // Row 1: Sink(0), Stove(1), BowlStack(2), Spices(3)
      // Row 2: Lamp(4), Cat(5), Plant(6), Box/Bookshelf(7)
      // Row 3: Barrel(8), Scroll(9), Screen(10), Cushion(11)
      switch(f.furnitureType) {
          case 'sink': sliceIndex = 0; break;
          case 'stove': sliceIndex = 1; break;
          case 'lamp': sliceIndex = 4; break;
          case 'bookshelf': sliceIndex = 7; break;
          case 'prep_table': sliceIndex = 11; break; // Kitchen prep table
          // Add more mappings as needed
      }

      if (sliceIndex !== -1) {
          const slice = tm.getSlice('props_pack', sliceIndex);
          if (slice) {
              this.ctx.drawImage(slice, px, py);
              return;
          }
      }

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

          case 'table':
              // Table Entity Rendering using table_pack
              // Width/Height determines orientation
              // Horizontal (2x1) -> Use Row 1 (Index 2 or 3)
              // Vertical (1x2) -> Use Row 0 (Index 0 or 1)
              
              const tm = TextureManager.getInstance();
              let tIdx = 0;
              
              if (w > h) {
                  // Horizontal
                  // Use Index 2 (Standard) or 3 (Variant)
                  tIdx = 2; 
                  // Could use random variant based on ID or Position
                  if ((f.x + f.y) % 2 !== 0) tIdx = 3;
              } else {
                  // Vertical
                  // Use Index 0 (Standard) or 1 (Variant)
                  tIdx = 0;
                  if ((f.x + f.y) % 2 !== 0) tIdx = 1;
              }

              const tSprite = tm.getSlice('table_pack', tIdx);
              if (tSprite) {
                  // Draw the single sprite by splitting it into two halves (natural tiling)
                  // For horizontal (2x1), draw left half in first tile, right half in second tile
                  // For vertical (1x2), draw top half in first tile, bottom half in second tile
                  
                  const halfW = tSprite.width / 2;
                  const halfH = tSprite.height / 2;
                  
                  if (w > h) {
                      // Horizontal (2x1)
                      // Left half
                      this.ctx.drawImage(tSprite, 0, 0, halfW, tSprite.height, px, py, this.GRID_SIZE, this.GRID_SIZE);
                      // Right half
                      this.ctx.drawImage(tSprite, halfW, 0, halfW, tSprite.height, px + this.GRID_SIZE, py, this.GRID_SIZE, this.GRID_SIZE);
                  } else {
                      // Vertical (1x2)
                      // Top half
                      this.ctx.drawImage(tSprite, 0, 0, tSprite.width, halfH, px, py, this.GRID_SIZE, this.GRID_SIZE);
                      // Bottom half
                      this.ctx.drawImage(tSprite, 0, halfH, tSprite.width, halfH, px, py + this.GRID_SIZE, this.GRID_SIZE, this.GRID_SIZE);
                  }
              } else {
                  // Fallback
                  this.ctx.fillStyle = '#795548';
                  this.ctx.fillRect(px, py, w, h);
              }
              break;
              
          default:
              // Fallback
              this.ctx.fillStyle = '#9c27b0';
              this.ctx.fillRect(px, py, w, h);
      }
  }

  private getVariant(x: number, y: number, count: number): number {
      const n = (x * 37 + y * 17) ^ (x * y);
      return Math.abs(n) % count;
  }

  private isWall(x: number, y: number): boolean {
      if (!this.isValid(x, y)) return false;
      const t = this.map[y]![x];
      return t === TileType.WALL || t === TileType.WALL_WITH_PAINTING || t === TileType.WINDOW || t === TileType.MIRROR;
  }

  private getWallSliceIndex(x: number, y: number): number {
      const hasTop = this.isWall(x, y - 1);
      const hasBottom = this.isWall(x, y + 1);
      const hasLeft = this.isWall(x - 1, y);
      const hasRight = this.isWall(x + 1, y);

      let row = 1; // Default to Middle Body
      
      if (!hasTop && !hasBottom) {
          // 水平墙体段：判断它是顶墙还是底墙
          // 如果上方是地板或室内区域，说明这段墙是空间的下边界
          const isFloorAbove = this.isValid(x, y - 1) && !this.isWall(x, y - 1);
          row = isFloorAbove ? 2 : 0;
      } else if (!hasTop) {
          row = 0; // Top Cap
      } else if (!hasBottom) {
          row = 2; // Base
      }

      let col = 1; // Default to Center
      
      if (!hasLeft && !hasRight) {
          // 垂直墙体段：判断它是左墙还是右墙
          // 如果左侧是地板或室内区域，说明这段墙是空间的右边界
          const isFloorToLeft = this.isValid(x - 1, y) && !this.isWall(x - 1, y);
          col = isFloorToLeft ? 2 : 0;
      } else if (!hasLeft) {
          col = 0;
      } else if (!hasRight) {
          col = 2;
      }

      return row * 3 + col;
  }

  private isCounter(x: number, y: number): boolean {
      if (!this.isValid(x, y)) return false;
      const t = this.map[y]![x];
      // Treat Counter and Table as same connecting material
      if (t === TileType.COUNTER || t === TileType.BOWL_STACK || t === TileType.SERVING_TABLE) return true;
      
      // Also check for furniture entities (like the new multi-tile tables)
      const entityAt = this.entities.find(e => {
          if (e.type !== 'furniture') return false;
          const f = e as Furniture;
          const w = f.width || 1;
          const h = f.height || 1;
          return x >= f.x && x < f.x + w && y >= f.y && y < f.y + h;
      });
      return !!entityAt;
  }

  private getChairSliceIndex(x: number, y: number): number {
      // 简单的朝向判断：椅子通常朝向桌子
      // Chair Pack Layout:
      // (0,0) Down/Back (Index 0)
      // (0,1) Up/Front (Index 1)
      // (1,0) Left (Index 2)
      // (1,1) Right (Index 3)
      
      // If table is above (y-1), chair should face Up (Index 1)
      if (this.isCounter(x, y - 1)) return 1;
      // If table is below (y+1), chair should face Down (Index 0)
      if (this.isCounter(x, y + 1)) return 0;
      // If table is left (x-1), chair should face Left (Index 2)
      if (this.isCounter(x - 1, y)) return 2;
      // If table is right (x+1), chair should face Right (Index 3)
      if (this.isCounter(x + 1, y)) return 3;
      
      return 0; // Default Down
  }

  private getCounterSliceIndex(x: number, y: number): number {
      const hasTop = this.isCounter(x, y - 1);
      const hasBottom = this.isCounter(x, y + 1);
      const hasLeft = this.isCounter(x - 1, y);
      const hasRight = this.isCounter(x + 1, y);

      let row = 1; 
      // 修正：如果下方是大厅（没有吧台），应该显示瓦片图的底排（正面）
      if (!hasBottom) row = 2;
      else if (!hasTop) row = 0;

      let col = 1;
      if (!hasLeft && !hasRight) col = 1; // 单个吧台默认使用中间列
      else if (!hasLeft) col = 0;
      else if (!hasRight) col = 2;

      return row * 3 + col;
  }

  private drawWallBackground(x: number, y: number) {
      const px = x * this.GRID_SIZE;
      const py = y * this.GRID_SIZE;
      const tm = TextureManager.getInstance();
      
      const sliceIndex = this.getWallSliceIndex(x, y);
      const slice = tm.getSlice('wall_pack', sliceIndex);
      
      if (slice) {
          this.ctx.drawImage(slice, px, py);
      } else {
          // Fallback if slice not found (shouldn't happen if loaded)
          this.ctx.fillStyle = '#5d4037';
          this.ctx.fillRect(px, py, this.GRID_SIZE, this.GRID_SIZE);
      }
  }

  private drawPaintingOverlay(x: number, y: number) {
      const px = x * this.GRID_SIZE;
      const py = y * this.GRID_SIZE;
      const faceY = py + this.GRID_SIZE / 3;
      const faceHeight = (this.GRID_SIZE / 3) * 2;
      
      // Frame
      this.ctx.fillStyle = '#ffb300'; // Gold frame
      this.ctx.fillRect(px + 10, faceY + 5, this.GRID_SIZE - 20, faceHeight - 15);
      
      // Canvas/Image
      this.ctx.fillStyle = '#0277bd'; // Blue painting
      this.ctx.fillRect(px + 12, faceY + 7, this.GRID_SIZE - 24, faceHeight - 19);
      
      // Detail
      this.ctx.fillStyle = '#ffffff';
      this.ctx.beginPath();
      this.ctx.arc(px + this.GRID_SIZE/2, faceY + faceHeight/2, 3, 0, Math.PI * 2);
      this.ctx.fill();
  }

  private drawMirrorOverlay(x: number, y: number) {
      const px = x * this.GRID_SIZE;
      const py = y * this.GRID_SIZE;
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

  private drawWindowOverlay(x: number, y: number) {
      const px = x * this.GRID_SIZE;
      const py = y * this.GRID_SIZE;
      const mapHeight = this.map.length;
      const mapWidth = this.map[0]?.length || 0;
      const faceY = py + this.GRID_SIZE / 3;
      const faceHeight = (this.GRID_SIZE / 3) * 2;
      
      // Check connections
      const hasWindowAbove = y > 0 && this.map[y-1] && this.map[y-1]![x] === TileType.WINDOW;
      const hasWindowBelow = y < mapHeight - 1 && this.map[y+1] && this.map[y+1]![x] === TileType.WINDOW;
      const hasWindowLeft = x > 0 && this.map[y]![x-1] === TileType.WINDOW;
      const hasWindowRight = x < mapWidth - 1 && this.map[y]![x+1] === TileType.WINDOW;

      // Determine Orientation
      let isVertical = false;
      if (hasWindowAbove || hasWindowBelow) isVertical = true;
      if (hasWindowLeft || hasWindowRight) isVertical = false;
      
      if (isVertical) {
          // --- Vertical Window Style ---
          this.ctx.fillStyle = '#795548'; 
          this.ctx.fillRect(px + 4, faceY + 4, 6, faceHeight - 8);
          this.ctx.fillRect(px + this.GRID_SIZE - 10, faceY + 4, 6, faceHeight - 8);
          
          if (!hasWindowAbove) {
               this.ctx.fillRect(px + 4, faceY + 4, this.GRID_SIZE - 8, 6);
               this.ctx.beginPath();
               this.ctx.arc(px + this.GRID_SIZE/2, faceY + 10, this.GRID_SIZE/2 - 6, Math.PI, 0);
               this.ctx.fill();
          }
          
          if (!hasWindowBelow) {
               this.ctx.fillRect(px + 4, faceY + faceHeight - 10, this.GRID_SIZE - 8, 6);
          }

          this.ctx.fillStyle = '#5c6bc0'; 
          this.ctx.fillRect(px + 10, faceY + 10, this.GRID_SIZE - 20, faceHeight - 20);

          this.ctx.fillStyle = '#795548';
          this.ctx.fillRect(px + this.GRID_SIZE/2 - 1, faceY + 4, 2, faceHeight - 8);
          
      } else {
          // --- Horizontal Window Style ---
          this.ctx.fillStyle = '#3e2723';
          this.ctx.fillRect(px + 8, faceY + 4, 4, faceHeight - 8);
          this.ctx.fillRect(px + this.GRID_SIZE - 12, faceY + 4, 4, faceHeight - 8);
          
          if (!hasWindowAbove) {
               this.ctx.fillRect(px + 8, faceY + 4, this.GRID_SIZE - 16, 4);
          }
          
          if (!hasWindowBelow) {
               this.ctx.fillRect(px + 8, faceY + faceHeight - 8, this.GRID_SIZE - 16, 4);
          }

          this.ctx.fillStyle = '#81d4fa'; 
          this.ctx.fillRect(px + 12, faceY + 4, this.GRID_SIZE - 24, faceHeight - 8);

          this.ctx.fillStyle = '#3e2723';
          this.ctx.fillRect(px + this.GRID_SIZE/2 - 1, faceY + 4, 2, faceHeight - 8);
          this.ctx.fillRect(px + 12, faceY + faceHeight/2 - 1, this.GRID_SIZE - 24, 2);

          this.ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
          this.ctx.beginPath();
          this.ctx.moveTo(px + 14, faceY + faceHeight - 8);
          this.ctx.lineTo(px + 20, faceY + 8);
          this.ctx.lineTo(px + 26, faceY + 8);
          this.ctx.lineTo(px + 20, faceY + faceHeight - 8);
          this.ctx.fill();
      }
  }

    private drawTile(x: number, y: number, tile: TileType) {
        const px = x * this.GRID_SIZE;
        const py = y * this.GRID_SIZE;
        const tm = TextureManager.getInstance();

        if (!this.texturesLoaded) {
            this.drawTileFallback(x, y, tile);
            return;
        }

        // --- Layer 0: Floor (Base) ---
        let floorSliceIndex = this.getVariant(x, y, 4);
        const floorSlice = tm.getSlice('floor_pack', floorSliceIndex);
        if (floorSlice) {
            this.ctx.drawImage(floorSlice, px, py);
        } else {
            this.ctx.fillStyle = '#3e2723';
            this.ctx.fillRect(px, py, this.GRID_SIZE, this.GRID_SIZE);
        }

        // --- Layer 1: Object/Wall ---
        switch(tile) {
            case TileType.FLOOR:
            case TileType.KITCHEN:
            case TileType.EXIT:
                // Floor already drawn
                break;
            case TileType.WALL:
                this.drawWallBackground(x, y);
                break;
            case TileType.WALL_WITH_PAINTING:
                this.drawWallBackground(x, y);
                this.drawPaintingOverlay(x, y);
                break;
            case TileType.WINDOW:
                this.drawWallBackground(x, y);
                this.drawWindowOverlay(x, y);
                break;
            case TileType.MIRROR:
                this.drawWallBackground(x, y);
                this.drawMirrorOverlay(x, y);
                break;
            case TileType.COUNTER:
            case TileType.BOWL_STACK:
                const cSliceIndex = this.getCounterSliceIndex(x, y);
                const cSlice = tm.getSlice('counter_pack', cSliceIndex);
                if (cSlice) {
                    this.ctx.drawImage(cSlice, px, py);
                }
                if (tile === TileType.BOWL_STACK) {
                    // Use Props Pack Index 2 (Bowl Stack)
                    const bowlSlice = tm.getSlice('props_pack', 2);
                    if (bowlSlice) this.ctx.drawImage(bowlSlice, px, py);
                    else this.drawTileFallback(x, y, tile);
                }
                break;
            
            case TileType.SERVING_TABLE:
                 // Kitchen prep table/shelf (1x1 tile)
                 const prepSlice = tm.getSlice('props_pack', 11);
                 if (prepSlice) this.ctx.drawImage(prepSlice, px, py);
                 else this.drawTileFallback(x, y, tile);
                 break;

            case TileType.CHAIR:
                const chairIndex = this.getChairSliceIndex(x, y);
                const chairSlice = tm.getSlice('chair_pack', chairIndex);
                if (chairSlice) this.ctx.drawImage(chairSlice, px, py);
                else this.drawTileFallback(x, y, tile);
                break;
            
            case TileType.COOKING_POT:
                // Map to Stove (Index 1) in props_pack
                const stoveSlice = tm.getSlice('props_pack', 1);
                if (stoveSlice) this.ctx.drawImage(stoveSlice, px, py);
                else this.drawTileFallback(x, y, tile);
                break;

            default:
                // 其他类型（如 SERVING_TABLE, COOKING_POT 等）暂时使用 fallback
                this.drawTileFallback(x, y, tile);
                break;
        }
    }

  private drawTileFallback(x: number, y: number, tile: TileType) {
      const px = x * this.GRID_SIZE;
      const py = y * this.GRID_SIZE;
      const tm = TextureManager.getInstance();
      
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
                  this.drawPaintingOverlay(x, y);
              }

              // Draw Mirror if applicable
              if (tile === TileType.MIRROR) {
                  this.drawMirrorOverlay(x, y);
              }

              // Draw Window if applicable
              if (tile === TileType.WINDOW) {
                  this.drawWindowOverlay(x, y);
              }
              break;
          case TileType.COUNTER:
          case TileType.BOWL_STACK:
              // Use new Counter Pack
              const cSliceIndex = this.getCounterSliceIndex(x, y);
              const cSlice = tm.getSlice('counter_pack', cSliceIndex);
              if (cSlice) {
                  this.ctx.drawImage(cSlice, px, py);
              } else {
                  // Fallback
                  this.ctx.fillStyle = '#8d6e63'; // Counter Wood
                  this.ctx.fillRect(px, py, this.GRID_SIZE, this.GRID_SIZE);
                  this.ctx.fillStyle = 'rgba(255,255,255,0.1)';
                  this.ctx.fillRect(px, py, this.GRID_SIZE, 5);
              }
              
              if (tile === TileType.COUNTER) {
                  break;
              }
              // If it's BOWL_STACK, continue to draw bowls
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
        const tm = TextureManager.getInstance();

        if (entity.type === 'furniture') {
            const f = entity as Furniture;
            let sliceIndex = -1;
            let pack = 'props_pack';

            switch(f.furnitureType) {
                case 'sink': sliceIndex = 0; break; 
                case 'stove': sliceIndex = 1; break;
                case 'toilet': sliceIndex = 9; break; // 示例索引
                case 'lamp': sliceIndex = 4; break;
                case 'bookshelf': sliceIndex = 7; break;
                // 桌子和椅子已经在 drawTile 中处理了（作为 TileType）
                // 如果是作为实体存在的家具，也可以在这里映射
            }

            const slice = sliceIndex !== -1 ? tm.getSlice(pack, sliceIndex) : null;
            if (slice) {
                this.ctx.drawImage(slice, px, py);
            } else {
                this.drawFurniture(f);
            }
            return;
        }
        
        this.ctx.save();
      
      // Shadow
      this.ctx.fillStyle = 'rgba(0,0,0,0.3)';
      this.ctx.beginPath();
      this.ctx.ellipse(px + this.GRID_SIZE/2, py + this.GRID_SIZE - 5, this.GRID_SIZE/3, this.GRID_SIZE/6, 0, 0, Math.PI*2);
      this.ctx.fill();

      // Body
      if (entity.type === 'player') {
          this.ctx.fillStyle = '#FF5252'; // Player Red
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
