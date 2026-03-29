import {
  type Entity,
  type Position,
  TileType,
  TileTypeNames,
  type Customer,
  type Item,
  type Furniture
} from '@/types/management';
import { TextureManager } from '@/services/graphics/TextureManager';
import floorTileImage from '@/assets/images/tilesets/地板.webp';
import wallTileImage from '@/assets/images/tilesets/墙体.webp';
import counterTileImage from '@/assets/images/tilesets/吧台.webp';
import propsTileImage from '@/assets/images/tilesets/装饰杂项.webp';
import chairTileImage from '@/assets/images/tilesets/椅子.webp';
import tableTileImage from '@/assets/images/tilesets/桌子.webp';

export class IzakayaScene {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private entities: Entity[] = [];
  private animationFrameId: number | null = null;

  // 网格配置设置
  private readonly GRID_SIZE = 48; // 每个网格单元的像素大小尺寸
  private COLS = 20;
  private ROWS = 15;

  // 材质纹理加载状态
  private texturesLoaded = false;

  // 地图数据相关
  private map: TileType[][] = [];
  private chairs: Position[] = [];
  private exits: Position[] = [];
  // private floors: Record<number, TileType[][]> = {}; // 多楼层楼面存储器（已被移除弃用）
  // private currentFloor: number = 1; // 当前活跃的活动楼层（已被移除弃用）
  // private floorChairs: Record<number, Position[]> = {}; // 各不同楼层的摆椅记录（已被移除弃用）
  // private floorExits: Record<number, Position[]> = {}; // 各不同楼层的出入口记录（已被移除弃用）
  private placedItems: Map<string, Item> = new Map();

  // 输入监听状态捕获相关
  private keysPressed: Set<string> = new Set();
  private virtualInput: { x: number; y: number } = { x: 0, y: 0 };

  // 游戏主循环流程相关状态控制
  private lastTime = 0;
  private spawnTimer = 0;
  private readonly SPAWN_INTERVAL = 5000; // 上客刷新间隙为 5 秒

  constructor(canvas: HTMLCanvasElement, customLayout?: string[]) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;

    // 启动地图的初始化运作
    if (customLayout) {
      // 解析读取出属于单层楼的蓝图构成版面
      const { map, chairs, exits, furniture } = this.parseLayout(customLayout);
      this.map = map;
      // this.chairs = chairs; // 假设我们欲图对其进行访问或提取则仍不可不备下有关就座席位椅子的储备量记录，若不然就只能全指仗于依赖着场景内部生成挂载出来的实控体了。
      // 由前事已将 floorChairs 删除不用以观，如若还须有它的牵扯到话那我们或许也就只能将之寄希望在全单单依靠挂载实体、抑或者只须独保此下那唯一一张名为椅座群单的数组对象上便可了。
      // 难不成原来的代码底层里是用这 floorChairs 拿做随机排选接留客人落座功能的不成？
      // 且来看两眼……对上了，在 spawnCustomer 这段底下的确是有被借用且被调用了其这儿处的 this.floorChairs[1]。
      // 所以看来我无论如何也还是该保有这单单独一份保留的有关这椅子记录归置的专门字列号位为妙。
      this.chairs = chairs;
      this.exits = exits;

      // 追加上各类归放好的家具大实体的相关显示呈现
      furniture.forEach((f) => {
        this.addEntity(f);
      });
    } else {
      this.initMap();
    }

    // 对这要用以表现呈现图作的一整张大画板先一步给它铺设安好总的规格占定尺寸
    this.canvas.width = this.COLS * this.GRID_SIZE;
    this.canvas.height = this.ROWS * this.GRID_SIZE;

    // 为了彰显和使得整个场景流散有更加清透硬朗方方块块极其有像素化特点美术的特立独属质感风气而将其本身画面上的反锯齿以及任何图像平滑渲染都给统统统的予以取消强制禁掉不予发挥使效
    this.ctx.imageSmoothingEnabled = false;
    (this.ctx as any).webkitImageSmoothingEnabled = false;
    (this.ctx as any).mozImageSmoothingEnabled = false;
    (this.ctx as any).msImageSmoothingEnabled = false;

    // 给有关键鼠输入的监听响应也开上做上个初开底定化的整套套件预备安插配载好
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('keydown', this.handleInteraction);

    // 将有关充当玩家这一操作游玩活动本身在其中这第一最核心实操实体角色的也接插归投了去到里头里边
    this.addEntity({
      id: 'player',
      type: 'player',
      x: 10,
      y: 10,
      pixelX: 10 * this.GRID_SIZE,
      pixelY: 10 * this.GRID_SIZE,
      direction: 'down',
      isMoving: false,
      moveSpeed: 0.15
    });

    // 装运加载材质纹理素材图库包
    this.loadTextures();
  }

  private async loadTextures() {
    try {
      // 设置 spacing 参数进行裁剪，适配 AI 生成的带间隙或无缝素材
      // 地板 (2x2)
      await TextureManager.getInstance().loadTileSet(
        'floor_pack',
        floorTileImage,
        this.GRID_SIZE,
        0,
        0,
        2,
        2
      );

      // 墙体 (3x3) - innerBleed=2 消除绿边
      await TextureManager.getInstance().loadTileSet(
        'wall_pack',
        wallTileImage,
        this.GRID_SIZE,
        0,
        0,
        3,
        3,
        2
      );

      // 吧台 (3x3) - innerBleed=2
      await TextureManager.getInstance().loadTileSet(
        'counter_pack',
        counterTileImage,
        this.GRID_SIZE,
        0,
        0,
        3,
        3,
        2
      );

      // 椅子 (2x2) - innerBleed=2
      await TextureManager.getInstance().loadTileSet(
        'chair_pack',
        chairTileImage,
        this.GRID_SIZE,
        0,
        0,
        2,
        2,
        2
      );

      // 桌子 (2x2) - innerBleed=2
      await TextureManager.getInstance().loadTileSet(
        'table_pack',
        tableTileImage,
        this.GRID_SIZE,
        0,
        0,
        2,
        2,
        2
      );

      // 装饰杂项 (3x4) - innerBleed=2
      await TextureManager.getInstance().loadTileSet(
        'props_pack',
        propsTileImage,
        this.GRID_SIZE,
        0,
        0,
        3,
        4,
        2
      );

      this.texturesLoaded = true;
      console.log('[IzakayaScene] Textures loaded.');
    } catch (e) {
      console.error('[IzakayaScene] Failed to load textures', e);
    }
  }

  /* 有关 parseFloors（楼面解析）与 switchFloor（楼面切换）的方法均已被连底去除不作留存 */

  private parseLayout(layout: string[]) {
    const map: TileType[][] = [];
    const chairs: Position[] = [];
    const exits: Position[] = [];
    const furniture: Furniture[] = [];

    // 为特定代号作匹配指向关系配图映射用的字典表合集
    const mapping: Record<string, TileType> = {
      '#': TileType.WALL,
      '.': TileType.FLOOR,
      ',': TileType.KITCHEN,
      C: TileType.COUNTER,
      T: TileType.FLOOR, // 此处之作为桌子 Table 将脱身单独作为挂出来的实体（Entity）看待，其底板之下依然视为地面（floor）平铺
      h: TileType.CHAIR,
      S: TileType.SERVING_TABLE,
      O: TileType.COOKING_POT,
      B: TileType.BOWL_STACK,
      E: TileType.EXIT,
      P: TileType.KITCHEN, // 玩家凭代生成的挂靠点实质指代为厨房所用地板
      '*': TileType.FLOOR, // 平置贴近于地面位置所在的零星装饰组件
      $: TileType.WALL_WITH_PAINTING,
      H: TileType.STAIRS,
      W: TileType.WINDOW,
      // 下侧的一众拥有着占据多块瓦图复合型面庞宽广物事，亦都将当一并作为实控体被纳入做独立处置，至于底盘位置所在的基面瓦身将无异变为地板（FLOOR）用衬底
      b: TileType.FLOOR, // 床铺 (BED)
      s: TileType.FLOOR, // 软座沙发 (SOFA)
      l: TileType.FLOOR, // 立灯 (LAMP)
      k: TileType.FLOOR, // 书架 (BOOKSHELF)
      t: TileType.FLOOR, // 抽水马桶 (TOILET)
      w: TileType.FLOOR, // 洗漱洗手池组合 (SINK)
      m: TileType.FLOOR, // 仪镜梳妆镜（此为旧有旧版，主要凭贴紧基于地面而置的基础款）
      M: TileType.MIRROR // 挂墙镜子（此为所现推崇翻新的新版，基于附着于砖墙墙体一面凭托挂出之款）
    };

    let playerSpawned = false; // 用作给于指明预先标记追踪出生锚入点，防在未来哪版预定布局版样面有此求设好备不时需
    if (playerSpawned) {
      /* 取个巧做规避防叫报出一干乱抛诸种不用警告防报错阻拦 */
    }

    // 依据布局图设计测算出实际所涉规模几何的长宽三维体量
    const rows = layout.length;
    const cols = layout.reduce((max, line) => Math.max(max, line.length), 0);

    // 当逢非必为之时要为这一部场景里的大尺寸重新翻定刷新大面盘范围作更新扩面才好去顺切装好迎下这里面占着身量当之无愧做最宽头最大的版图
    if (cols > this.COLS) this.COLS = cols;
    if (rows > this.ROWS) this.ROWS = rows;

    for (let y = 0; y < rows; y++) {
      const row: TileType[] = [];
      const layoutRow = layout[y] || '';
      for (let x = 0; x < cols; x++) {
        const char = layoutRow[x] || '.';
        let tile = mapping[char] || TileType.FLOOR;

        // 若撞见 P (玩家落生座标) 还要兼做个加项专属单独专人处理对待
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

        // 自那字码图上名为 'T' 的方位所代唤出来的方桌（大只占体实物）的应时成生挂接
        if (char === 'T') {
          // 基于上下的牵扯情况敲定判清其实该打往个哪副方向边面生摆放排去为好呢？（未做有干预改动前寻常的默许规约下则全一做作水平宽展状即指 2x1 型体来看去化用的）
          // 说起上下来，假定是在其大正顶头位或乃致正坐最下盘的下方身位 (即代表着 y-1 此处或是说位至 y+1 那个头) 寻访有见它椅子小凳等存在的话呢，那么它就在很隐秘暗透出自身此物应作这展平的横向状态了（也就是说此时这它最修长的两面临边也就必然正端顶在其上头跟脚底位置啦）
          // 反观来看倘使长摆列放有凳子椅子一类供人着身落座位置全都在了这当正中心块的正左近又或者是右手侧边去呢 (指的就等若如 x-1 所处又或者换至 x+1 之地)，此景此情也大便极力透露向外界它正正要打定呈着这种成列向为直竖着的长长排陈的样式排势无疑的咯呀（而它那更为纤长边角线便必然被拉到两端处最外层那分别处左右的位置的左右双侧身位上面去去啦啦）

          // 我们倒大可姑且且仅拿一类极其浅而明见之最直观质感的探查试探方式来就下判断一回算了：不假思索统通一切将其一律全都强行给归结看打上个等似预设水平模版的标识给强上不就结了嘛。
          // 若说不然还可翻扒一回那在默认情况中所引作为标准例板大地图模板内之陈列面布局的规制式又是怎样个搞法（去查查看 DEFAULT_MAP_DATA 默认例设文件内的 layout 排局式布位图的讲究去）。
          // 要知在于向那份 DEFAULT_MAP_DATA 的样表中，这 T 字当其正盘在 (x,y)，那 h 则理当且也恰必会被压至处在其正处于下向位盘方底处的 (x,y+1) 那头所在也才对的。像这般正好不偏不倚恰也妥正可算说是对应契合与映照符合得上我们先前所做打的那等对以那些一作平列横置大大长宽座席桌椅的大面貌定式想象判断啦。

          const fType = 'table';
          const width = 2; // 无指令插足干涉之下将权全视为是水平大横置式所认默认值
          const height = 1;

          furniture.push({
            id: `furniture_${x}_${y}_${Date.now()}_${Math.random()}`,
            type: 'furniture',
            furnitureType: fType,
            x,
            y,
            pixelX: x * this.GRID_SIZE,
            pixelY: y * this.GRID_SIZE,
            width,
            height,
            direction: 'down',
            isMoving: false,
            moveSpeed: 0
          });
        }

        // --- 关于生设并挂放那些属多方网格大兼复合之身的大件头一干家具大活体的生衍成建大计 ---
        if (['b', 's', 'l', 'k', 't', 'w', 'm'].includes(char)) {
          let fType: Furniture['furnitureType'] = 'table'; // default
          let width = 1;
          let height = 1;

          switch (char) {
            case 'b':
              fType = 'bed';
              width = 2;
              height = 3;
              break;
            case 's':
              fType = 'sofa';
              width = 2;
              height = 1;
              break;
            case 'l':
              fType = 'lamp';
              width = 1;
              height = 2;
              break;
            case 'k':
              fType = 'bookshelf';
              width = 1;
              height = 2;
              break;
            case 't':
              fType = 'toilet';
              width = 1;
              height = 1;
              break;
            case 'w':
              fType = 'sink';
              width = 1;
              height = 1;
              break;
            case 'm':
              fType = 'mirror';
              width = 1;
              height = 1;
              break;
          }

          furniture.push({
            id: `furniture_${x}_${y}_${Date.now()}_${Math.random()}`,
            type: 'furniture',
            furnitureType: fType,
            x,
            y,
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
    // 用包含四周墙壁的空心地板开底设局
    const map: TileType[][] = [];
    const chairs: Position[] = [];
    const exits: Position[] = [];
    const furniture: Furniture[] = [];

    for (let y = 0; y < this.ROWS; y++) {
      const row: TileType[] = [];
      for (let x = 0; x < this.COLS; x++) {
        // 勾勒边界四围
        if (x === 0 || x === this.COLS - 1 || y === 0 || y === this.ROWS - 1) {
          row.push(TileType.WALL);
        } else {
          row.push(TileType.FLOOR);
        }
      }
      map.push(row);
    }

    // 构建铺垫生做起厨房用的一干事（处于上头的地段区域部位）
    for (let y = 1; y < 4; y++) {
      for (let x = 1; x < this.COLS - 1; x++) {
        map[y]![x] = TileType.KITCHEN;
      }
    }

    // 生安上配货用的服务接应与操办处理工作柜吧大面台（此位居入到了那所谓的第四纵列当中去即 Row 4 里头中）
    for (let x = 1; x < this.COLS - 1; x++) {
      if (x === 10) {
        map[4]![x] = TileType.FLOOR; // 兼作为踏向及直深入此等灶班地儿里的去的那厨防重地大营前用以行当充任通途开道或门厅通口等名目走道的之用地板
      } else {
        map[4]![x] = TileType.COUNTER;
      }
    }

    // 添加补建出各类名物用其所属大实指明类的实体形貌家具物件上（就当作是一趟可一借以之作为展示以向旁宣那新型的由大号 4x3 模版规格的做陈实装大物杂多饰物之用了吧）
    const addProp = (x: number, y: number, type: Furniture['furnitureType']) => {
      furniture.push({
        id: `prop_${x}_${y}`,
        type: 'furniture',
        furnitureType: type,
        x,
        y,
        pixelX: x * this.GRID_SIZE,
        pixelY: y * this.GRID_SIZE,
        direction: 'down',
        isMoving: false,
        moveSpeed: 0
      });
    };

    addProp(2, 2, 'stove'); // Row 1, Col 2 in props
    addProp(8, 4, 'sink'); // Row 1, Col 1 in props
    addProp(1, 1, 'lamp'); // Row 2, Col 1 in props

    // 搭建并垒放摆落上供盛具放置那一重叠海碗池位（Bowl Stack）
    map[4]![8] = TileType.BOWL_STACK;

    // 起加一口可作翻烹与煮吃汤物专用锅灶头（Cooking Pot）
    map[2]![2] = TileType.COOKING_POT;

    // 平添塞入给加备上诸样以作呈餐接侍上盘起菜做大底用来多用杂台（说白了皆可视为为这后厨班专司制用配用等同类餐具厨用方大面桌）
    map[1]![4] = TileType.SERVING_TABLE;
    map[1]![5] = TileType.SERVING_TABLE;
    map[1]![6] = TileType.SERVING_TABLE;

    // 朝向面背顶对正冲的底墙位置墙背之上再高打并装挂上去一面供做作秀与赏光提提色品级的一副挂墙名画
    map[0]![10] = TileType.WALL_WITH_PAINTING;

    // 添加进备排用上待座诸如待用的坐席各类用椅物件（第五排间中去加添）
    for (let x = 3; x < this.COLS - 3; x += 2) {
      if (x !== 9 && x !== 11) {
        // 刻意给要用以出入留的口道正前方腾挪留点空地儿出来
        map[5]![x] = TileType.CHAIR;
        chairs.push({ x, y: 5 });
      }
    }

    // 顺此也再连同添进备备着几长可做迎客大面宽大阔的食客人入位餐宴同用的长面木边吃饭用的长座围宽方大面桌板来
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
        // 定型出以这高宽幅相为以 1x2 长势相做坚挑大竖式站状大高直桌（打顶上锚死头标来算起）
        if (cy + 1 < this.ROWS) {
          // 配置坐席椅位（给上方的那部分做左跟做右各配椅座一把）
          if (cx - 1 >= 0) {
            map[cy]![cx - 1] = TileType.CHAIR;
            chairs.push({ x: cx - 1, y: cy });
          }
          if (cx + 1 < this.COLS) {
            map[cy]![cx + 1] = TileType.CHAIR;
            chairs.push({ x: cx + 1, y: cy });
          }

          // 再行配位入一干位靠其下之半断截方下向里各塞给其左右向两处旁座两把小板凳位置
          if (cx - 1 >= 0) {
            map[cy + 1]![cx - 1] = TileType.CHAIR;
            chairs.push({ x: cx - 1, y: cy + 1 });
          }
          if (cx + 1 < this.COLS) {
            map[cy + 1]![cx + 1] = TileType.CHAIR;
            chairs.push({ x: cx + 1, y: cy + 1 });
          }
        }
      } else {
        // 此系一成生为高广比以达宽 2x1 以求其平坦卧趴样呈的大字面水平样横款低长横幅方扁阔桌案面款式之局（打这居极左前部位向发之端所抛出这初下做其之大局定子定起）
        if (cx + 1 < this.COLS) {
          // 入定备好诸座小矮交木席座（先于那正端左身所分置的那一侧面中将位于那最先打的上下口给先落塞置入并安置去各椅座这去一把罢）
          if (cy - 1 >= 0) {
            map[cy - 1]![cx] = TileType.CHAIR;
            chairs.push({ x: cx, y: cy - 1 });
          }
          if (cy + 1 < this.ROWS) {
            map[cy + 1]![cx] = TileType.CHAIR;
            chairs.push({ x: cx, y: cy + 1 });
          }

          // 在复打将把着剩余身下空等位座也给定座好这等其余木凳座位上（其之正右半段躯区处的于那处居顶位更还之其对边正接其尾底下的空位里处也要各相呼应也安置上这去一把对等吧）
          if (cy - 1 >= 0) {
            map[cy - 1]![cx + 1] = TileType.CHAIR;
            chairs.push({ x: cx + 1, y: cy - 1 });
          }
          if (cy + 1 < this.ROWS) {
            map[cy + 1]![cx + 1] = TileType.CHAIR;
            chairs.push({ x: cx + 1, y: cy + 1 });
          }
        }
      }
    };

    addTable(4, 8, 'v');
    addTable(14, 8, 'v');
    addTable(4, 11, 'h');
    addTable(14, 11, 'h');

    // 指派开指造一个作下脚大步出行的口户与出门来（落放到了脚底边缘也即底层）
    map[this.ROWS - 1]![10] = TileType.EXIT;
    map[this.ROWS - 1]![9] = TileType.EXIT;
    map[this.ROWS - 1]![11] = TileType.EXIT;
    exits.push({ x: 10, y: this.ROWS - 1 });
    exits.push({ x: 9, y: this.ROWS - 1 });
    exits.push({ x: 11, y: this.ROWS - 1 });

    this.map = map;
    this.chairs = chairs;
    this.exits = exits;
    furniture.forEach((f) => this.addEntity(f));
  }

  /*
  // private addTable(centerX: number, centerY: number) { // 已被淘汏废除
      if (this.isValid(centerX, centerY)) this.map[centerY]![centerX] = TileType.COUNTER; // Reuse counter texture for table
      
      // 摆靠环绕靠这周围之靠椅
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
      const player = this.entities.find((e) => e.type === 'player');
      if (player && !player.isMoving) {
        this.checkInteraction(player);
      }
    }
  };

  private checkInteraction(player: Entity) {
    let targetX = player.x;
    let targetY = player.y;

    if (player.direction === 'up') targetY--;
    else if (player.direction === 'down') targetY++;
    else if (player.direction === 'left') targetX--;
    else if (player.direction === 'right') targetX++;

    if (!this.isValid(targetX, targetY)) return;

    const tile = this.map[targetY]![targetX]!;

    // 检查目标位置是否已有实体
    const targetEntity = this.entities.find((e) => {
      const w = (e as any).width || 1;
      const h = (e as any).height || 1;
      return (
        targetX >= e.x &&
        targetX < e.x + w &&
        targetY >= e.y &&
        targetY < e.y + h &&
        e.id !== player.id
      );
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

    // 如果正在交互，处理客人状态转换
    if (targetEntity && targetEntity.type === 'customer') {
      const customer = targetEntity as Customer;
      if (customer.state === 'ordering') {
        // 发出对话事件而不是立即转换状态
        const event = new CustomEvent('izakaya-customer-interact', {
          detail: {
            customerId: customer.id,
            customerName: customer.name,
            dialogType: 'ordering',
            customer: customer // 传入完整客人对象
          }
        });
        this.canvas.dispatchEvent(event);
      } else if (customer.state === 'waiting_food') {
        // 由游戏逻辑处理 (检查库存)
        // 我们只派发事件，Game（主游戏系统）来监听，检查库存，如果合法再调用 serveCustomer。
      }
    }
  }

  public serveCustomer(customerId: string) {
    const customer = this.entities.find(
      (e) => e.id === customerId && e.type === 'customer'
    ) as Customer;
    if (customer && customer.state === 'waiting_food') {
      customer.state = 'eating';
      customer.eatTimer = 5000;
      this.dispatchOrderEvent('complete', customer);
    }
  }

  public takeOrder(customerId: string) {
    const customer = this.entities.find(
      (e) => e.id === customerId && e.type === 'customer'
    ) as Customer;
    if (customer && customer.state === 'ordering') {
      customer.state = 'waiting_food';
      customer.order = this.generateRandomOrder();
      console.log(`收到 ${customer.name} 的订单: ${customer.order.dishName}`);

      this.dispatchOrderEvent('add', customer);
    }
  }

  // 为移动端提供支持的虚拟摇杆输入方法
  public setVirtualInput(x: number, y: number) {
    this.virtualInput = { x, y };
  }

  public triggerInteraction() {
    const player = this.entities.find((e) => e.type === 'player');
    if (player && !player.isMoving) {
      this.checkInteraction(player);
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
    // 1. 处理玩家输入
    const player = this.entities.find((e) => e.type === 'player');
    if (player) {
      this.handlePlayerMovement(player, deltaTime);
    }

    // 2. 更新实体 (实现平滑移动效果)
    this.entities.forEach((entity) => {
      this.updateEntityPosition(entity, deltaTime);

      if (entity.type === 'customer') {
        this.updateCustomer(entity as Customer, deltaTime);
      }
    });

    // 3. 生成客人
    this.spawnTimer += deltaTime;
    if (this.spawnTimer > this.SPAWN_INTERVAL) {
      this.spawnTimer = 0;
      this.spawnCustomer();
    }
  }

  private isPassable(x: number, y: number, map: TileType[][] = this.map): boolean {
    if (y < 0 || y >= this.ROWS || x < 0 || x >= this.COLS) return false;
    const tile = map[y]![x]!;
    // 对于寻路而言，如果我们想让客人坐下，椅子是可通行的。
    // 但是在物理碰撞上，它们是障碍物，除非处于“坐下”状态。
    // 为简便起见，假设目前所有椅子都是可通行的，
    // 或者判断它是否是目标椅子。
    if (
      tile === TileType.FLOOR ||
      tile === TileType.KITCHEN ||
      tile === TileType.EXIT ||
      tile === TileType.CHAIR ||
      tile === TileType.SOFA
    ) {
      // 检查是否有实体家具阻挡
      const blocker = this.entities.find((e) => {
        if (e.type !== 'furniture') return false;
        const f = e as Furniture;
        if (f.furnitureType === 'sofa') return false; // 沙发是可通行的
        const w = f.width || 1;
        const h = f.height || 1;
        return x >= f.x && x < f.x + w && y >= f.y && y < f.y + h;
      });
      return !blocker;
    }
    return false;
  }

  // 对玩家与墙/家具碰撞的一种简化检查
  private isWalkable(x: number, y: number): boolean {
    if (!this.isValid(x, y)) return false;
    const tile = this.map[y]![x]!;
    // 玩家无法走到椅子上 (除非我们实现了跳跃机制？)
    return (
      tile === TileType.FLOOR ||
      tile === TileType.KITCHEN ||
      tile === TileType.EXIT ||
      tile === TileType.SOFA
    );
  }

  private handlePlayerMovement(player: Entity, _deltaTime: number) {
    // 这里并未使用 deltaTime 计算在网格逻辑中的移步，只是将其作为未来做平滑插值预留。
    if (!player.isMoving) {
      let dx = 0;
      let dy = 0;

      // 首先检查键盘输入
      if (this.keysPressed.has('w') || this.keysPressed.has('ArrowUp')) dy = -1;
      else if (this.keysPressed.has('s') || this.keysPressed.has('ArrowDown')) dy = 1;
      else if (this.keysPressed.has('a') || this.keysPressed.has('ArrowLeft')) dx = -1;
      else if (this.keysPressed.has('d') || this.keysPressed.has('ArrowRight')) dx = 1;

      // 如果没有键盘输入，检查虚拟摇杆输入（移动端）
      if (dx === 0 && dy === 0 && (this.virtualInput.x !== 0 || this.virtualInput.y !== 0)) {
        const threshold = 0.3;
        if (Math.abs(this.virtualInput.x) > Math.abs(this.virtualInput.y)) {
          // 以横向移动为主
          if (this.virtualInput.x > threshold) dx = 1;
          else if (this.virtualInput.x < -threshold) dx = -1;
        } else {
          // 以纵向移动为主
          if (this.virtualInput.y > threshold) dy = 1;
          else if (this.virtualInput.y < -threshold) dy = -1;
        }
      }

      if (dx !== 0 || dy !== 0) {
        const targetX = player.x + dx;
        const targetY = player.y + dy;

        if (dy < 0) player.direction = 'up';
        else if (dy > 0) player.direction = 'down';
        else if (dx < 0) player.direction = 'left';
        else if (dx > 0) player.direction = 'right';

        if (this.isWalkable(targetX, targetY)) {
          // 同时检查在当前楼面是否有实体(如客人)占据该目标位
          const blocker = this.entities.find((e) => {
            const w = (e as any).width || 1;
            const h = (e as any).height || 1;
            return targetX >= e.x && targetX < e.x + w && targetY >= e.y && targetY < e.y + h;
          });

          // 允许直接踩上某些特定家具穿行（例如：沙发）
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

            // 原触发逻辑区域 (已移除)
          }
        }
      }
    }
  }

  private updateEntityPosition(entity: Entity, _deltaTime: number) {
    // 像素步进步移尚未套用到 deltaTime，但这是为未来的基于时间的流动而作保留设计的
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

  // --- 客体 (客人) 的内含逻辑 ---

  private customerQueue: Partial<Customer>[] = [];

  public queueCustomer(customerData: Partial<Customer>) {
    this.customerQueue.push(customerData);
  }

  private spawnCustomer() {
    // 在 1 楼找一个空位 (客人只会进入 1 楼)
    const chairsOnFloor1 = this.chairs;
    if (chairsOnFloor1.length === 0) return;

    const occupiedSeats = new Set(
      this.entities
        .filter((e) => e.type === 'customer' && (e as Customer).seatId)
        .map((e) => (e as Customer).seatId)
    );

    const availableChairs = chairsOnFloor1.filter(
      (c: Position) => !occupiedSeats.has(`${c.x},${c.y}`)
    );

    if (availableChairs.length === 0) return; // No seats

    const randomChair = availableChairs[Math.floor(Math.random() * availableChairs.length)];

    if (!randomChair) return;

    // 检查队伍里是否有特殊NPC客人
    let specialData: Partial<Customer> = {};
    if (this.customerQueue.length > 0) {
      specialData = this.customerQueue.shift()!;
    }

    // 决定出生点位置 (即：地皮出口处)
    // 使用在当前层能捕捉到的第一个出口 (通常即为 1 楼)
    // 客人是从门边直接进来进入大室的，也因之应当从标代有 Exit 的地皮出口方块上出现生成出降临世间。
    // 若存在带有若干数的复数组出口门，那么那就任挑其一共个就好啦。
    let spawnX = 10;
    let spawnY = this.ROWS - 1;

    // 寻常时候顾客只降落在 1 楼
    const spawnExits = this.exits;

    if (spawnExits.length > 0) {
      const exit = spawnExits[Math.floor(Math.random() * spawnExits.length)];
      if (exit) {
        spawnX = exit.x;
        spawnY = exit.y;
      }
    } else {
      console.warn(
        '[IzakayaScene] No exits found for spawning customers! Using default (10, bottom).'
      );
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
      targetY: undefined, // Initialize
      ...specialData // 可对默许预设值作覆写更替
    };

    this.addEntity(customer);
  }

  private updateCustomer(customer: Customer, deltaTime: number) {
    if (customer.isMoving) return;

    const customerMap = this.map;

    // 随候时增长逐渐耗损的耐心期望值机制（Patience Decay）
    if (['waiting_seat', 'ordering', 'waiting_food'].includes(customer.state)) {
      customer.patience -= deltaTime * 0.005; // 耗去约莫 20 秒左右便会折归至完全绝耗光为 0
      if (customer.patience <= 0) {
        if (customer.state === 'waiting_food') {
          this.dispatchOrderEvent('cancel', customer);
        }
        customer.state = 'leaving';
        console.log(`${customer.name} got impatient and left!`);
      }
    }

    if (customer.state === 'entering') {
      // 找路查寻摸索打探向可落去就坐的那座椅而去的一路路径轨迹
      if (customer.seatId) {
        const parts = customer.seatId.split(',');
        const sx = Number(parts[0]);
        const sy = Number(parts[1]);

        if (!isNaN(sx) && !isNaN(sy)) {
          const path = this.findPath(
            { x: customer.x, y: customer.y },
            { x: sx, y: sy },
            customerMap
          );

          if (path.length > 0) {
            const nextStep = path[0];
            if (nextStep) {
              this.moveEntityTo(customer, nextStep.x, nextStep.y);
            }
          } else {
            // 这是已成算抵达已赴至目的落脚点了吧？
            if (customer.x === sx && customer.y === sy) {
              customer.state = 'seated';
              setTimeout(
                () => {
                  if (customer.state === 'seated') customer.state = 'ordering';
                },
                2000 + Math.random() * 2000
              );
            }
          }
        }
      }
    } else if (customer.state === 'eating') {
      if (customer.eatTimer !== undefined) {
        customer.eatTimer -= deltaTime;
        if (customer.eatTimer <= 0) {
          // 吃光用膳全用完了
          customer.state = 'leaving';
          // 计收其这这单进所献进呈上的盈付结帐营收款金（Revenue）
          const revenue = customer.order ? customer.order.price : 0;
          console.log(`${customer.name} finished eating. Revenue: ${revenue}`);

          const event = new CustomEvent('izakaya-revenue', { detail: { amount: revenue } });
          this.canvas.dispatchEvent(event);
        }
      }
    } else if (customer.state === 'leaving') {
      // 探索摸出门去出至出口离去的路径算法通路
      let exitX = 10;
      let exitY = this.ROWS - 1;

      const exits = this.exits;
      if (exits.length > 0) {
        // 会找且挑这当下隔着最近可供最易脚程短的外向通途出口离去
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

      const path = this.findPath(
        { x: customer.x, y: customer.y },
        { x: exitX, y: exitY },
        customerMap
      );
      if (path.length > 0) {
        const nextStep = path[0];
        if (nextStep) {
          this.moveEntityTo(customer, nextStep.x, nextStep.y);
        }
      } else {
        // 是真死被逼停死卡死住了身还是真其实已早够贴近靠出口够了？（倘使路已真就寻不到探走断尽不复通的时候比方被挡路实大堵实等等事由时干脆粗暴强行直生驱将其强送出）
        // 或者干脆就见若真已也大抵确乎近其便直接叫移除作去清下场拉倒吧就算了
        if (Math.abs(customer.x - exitX) + Math.abs(customer.y - exitY) < 2) {
          this.removeEntity(customer.id);
        }
      }
    }
  }

  private removeEntity(id: string) {
    const index = this.entities.findIndex((e) => e.id === id);
    if (index !== -1) {
      this.entities.splice(index, 1);
    }
  }

  private dispatchOrderEvent(type: 'add' | 'complete' | 'cancel', customer: Customer) {
    const event = new CustomEvent('izakaya-order-update', {
      detail: {
        type,
        orderId: customer.id, // 先把客人本身所独持有之 ID 暂先强直接权做套给订单去当作它 ID 单号来顶用一算先
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
    // 单发大简浅用一最浅最直接且最最为通俗易用的朴实无华广度优先搜寻寻路算法路书 (简单 BFS 算法)
    const queue: { pos: Position; path: Position[] }[] = [{ pos: start, path: [] }];
    const visited = new Set<string>();
    visited.add(`${start.x},${start.y}`);

    while (queue.length > 0) {
      const { pos, path } = queue.shift()!;

      if (pos.x === end.x && pos.y === end.y) {
        return path;
      }

      const neighbors = [
        { x: pos.x, y: pos.y - 1 },
        { x: pos.x, y: pos.y + 1 },
        { x: pos.x - 1, y: pos.y },
        { x: pos.x + 1, y: pos.y }
      ];

      for (const n of neighbors) {
        const key = `${n.x},${n.y}`;
        if (!visited.has(key) && this.isPassable(n.x, n.y, map)) {
          // 若是当前这个椅子本身就是最终目的坐标点，那么对于寻路而言它就是畅通可过作为抵达目的的。
          // 但是我们不应该“穿趟”过其它的闲杂非目标椅子来去试图抄近道强行趟走过去到我们想去的目标点。
          // 但是纯为求简单省事及当前行规便利所思，现在就姑且一切都当它们全是“大畅通无阻，见之皆可一趟平趟穿身过去无碍”全给当通过了去了。
          // 如果不那般搞法大老粗的话，那你只能去一一对照看“当前脚下的到底是不是那张指定的目标专用看对眼了的专属椅？”的这类复杂查账方式来验明验正了。

          visited.add(key);
          queue.push({ pos: n, path: [...path, n] });
        }
      }
    }
    return [];
  }

  private render() {
    // 绘前清盘去扫做底
    this.ctx.fillStyle = '#1a1a1a';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // 下笔绘做大面大盘景色的底壳大片全图之地形
    const mapHeight = this.map.length;
    const mapWidth = this.map[0]?.length || 0;

    for (let y = 0; y < mapHeight; y++) {
      for (let x = 0; x < mapWidth; x++) {
        const tile = this.map[y]![x]!;
        this.drawTile(x, y, tile);
      }
    }

    // 紧跟着连起加画上其中在各处于之其面上的这众带能独立活走各实大体这活主儿等全给描画出来（兼带着且以把其各位随带挂等身所自拥带位这在盘居所在横面有随有之 y 行系高身位并借作为之有类等 Z-Index 画作层上行做下连同重行并给排序并压做堆高这作绘并排作起并给其按着这顺序也）
    const sortedEntities = this.entities.sort((a, b) => a.pixelY - b.pixelY);

    for (const entity of sortedEntities) {
      this.drawEntity(entity);
    }
  }

  public placeItem(x: number, y: number, item: Item): boolean {
    const key = `${x},${y}`;
    if (this.placedItems.has(key)) return false; // 已被捷足先占下了位头了去了
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
    // 依 4x3 网格（计有 12 项组件）所作的映照分布：
    // 第 1 排：洗手池盆(0), 四方炉灶(1), 碗叠(2), 瓶瓶罐罐类调料(3)
    // 第 2 排：立灯(4), 活体猫(5), 植大盆栽(6), 箱装或大书架(7)
    // 第 3 排：大木酒桶(8), 书轴卷轴(9), 屏立大遮屏(10), 坐垫软垫(11)
    switch (f.furnitureType) {
      case 'sink':
        sliceIndex = 0;
        break;
      case 'stove':
        sliceIndex = 1;
        break;
      case 'lamp':
        sliceIndex = 4;
        break;
      case 'bookshelf':
        sliceIndex = 7;
        break;
      case 'prep_table':
        sliceIndex = 11;
        break; // 给厨房打杂备菜用的长板操作台（Kitchen prep table）
      // 倘如有其余未尽所需也可一并全再附接加上其各类更多的映射添入
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

    switch (f.furnitureType) {
      case 'bed':
        // 睡床 (占地 2x3)
        // 床头板放在顶部
        this.ctx.fillStyle = '#5d4037'; // 床体框架
        this.ctx.fillRect(px + 4, py + 4, w - 8, h - 8);

        // 床垫
        this.ctx.fillStyle = '#eceff1';
        this.ctx.fillRect(px + 8, py + 20, w - 16, h - 28);

        // 枕头
        this.ctx.fillStyle = '#90caf9';
        this.ctx.fillRect(px + 12, py + 24, w - 24, 20);

        // 被毯 (盖在下半部分)
        this.ctx.fillStyle = '#ef5350';
        this.ctx.fillRect(px + 8, py + h / 2, w - 16, h / 2 - 8);
        break;

      case 'sofa':
        // 沙发 (占地 2x1)
        this.ctx.fillStyle = '#8d6e63'; // 棕色皮革
        // 沙发靠背
        this.ctx.fillRect(px + 4, py + 4, w - 8, 12);
        // 沙发垫/坐垫
        this.ctx.fillStyle = '#a1887f';
        this.ctx.fillRect(px + 4, py + 16, w - 8, h - 20);
        // 扶手
        this.ctx.fillStyle = '#6d4c41';
        this.ctx.fillRect(px + 4, py + 16, 8, h - 20);
        this.ctx.fillRect(px + w - 12, py + 16, 8, h - 20);
        break;

      case 'lamp':
        // 落地灯 (1x2)
        // 底座
        this.ctx.fillStyle = '#212121';
        this.ctx.fillRect(px + this.GRID_SIZE / 2 - 4, py + h - 10, 8, 8);
        // 灯柱/支杆
        this.ctx.fillStyle = '#424242';
        this.ctx.fillRect(px + this.GRID_SIZE / 2 - 2, py + 20, 4, h - 30);
        // 灯罩
        this.ctx.fillStyle = '#FFF59D'; // 黄色的灯罩
        this.ctx.beginPath();
        this.ctx.moveTo(px + 10, py + 40);
        this.ctx.lineTo(px + this.GRID_SIZE - 10, py + 40);
        this.ctx.lineTo(px + this.GRID_SIZE - 4, py + 10);
        this.ctx.lineTo(px + 4, py + 10);
        this.ctx.closePath();
        this.ctx.fill();

        // 发光效果 (采用渐变渲染)
        const grad = this.ctx.createRadialGradient(
          px + this.GRID_SIZE / 2,
          py + 20,
          0,
          px + this.GRID_SIZE / 2,
          py + 20,
          60
        );
        grad.addColorStop(0, 'rgba(255, 235, 59, 0.4)');
        grad.addColorStop(1, 'rgba(255, 235, 59, 0)');
        this.ctx.fillStyle = grad;
        this.ctx.fillRect(px - 20, py - 20, w + 40, h + 40);
        break;

      case 'bookshelf':
        // 书架 (1x2)
        this.ctx.fillStyle = '#5d4037'; // 实木底色
        this.ctx.fillRect(px + 4, py + 4, w - 8, h - 8);
        // 存放书的隔层档板 (Shelves)
        this.ctx.fillStyle = '#3e2723';
        for (let i = 1; i < 4; i++) {
          this.ctx.fillRect(px + 6, py + (h / 4) * i, w - 12, 4);
        }
        // 书籍 (用随机颜色表示种类繁杂)
        const colors = ['#e57373', '#64b5f6', '#81c784', '#fff176'];
        for (let r = 0; r < 4; r++) {
          if (r === 3) continue; // 跳过最底层的书架空着不放书？
          const shelfY = py + (h / 4) * r + 8;
          for (let b = 0; b < 5; b++) {
            this.ctx.fillStyle = colors[b % colors.length] || '#000000';
            this.ctx.fillRect(px + 8 + b * 8, shelfY, 6, h / 4 - 12);
          }
        }
        break;

      case 'toilet':
        // 厕所抽水马桶 (1x1)
        this.ctx.fillStyle = '#ffffff';
        // 冲水水箱
        this.ctx.fillRect(px + 8, py + 4, this.GRID_SIZE - 16, 12);
        // 马桶便池盆
        this.ctx.beginPath();
        this.ctx.ellipse(px + this.GRID_SIZE / 2, py + 28, 12, 14, 0, 0, Math.PI * 2);
        this.ctx.fill();
        // 马桶盖
        this.ctx.strokeStyle = '#bdbdbd';
        this.ctx.stroke();
        break;

      case 'sink':
        // 洗手池 (1x1)
        this.ctx.fillStyle = '#ffffff';
        // 水盆/水槽
        this.ctx.beginPath();
        this.ctx.arc(px + this.GRID_SIZE / 2, py + this.GRID_SIZE / 2 + 5, 14, 0, Math.PI, false);
        this.ctx.fill();
        this.ctx.strokeStyle = '#bdbdbd';
        this.ctx.stroke();
        // 水龙头
        this.ctx.fillStyle = '#90a4ae';
        this.ctx.fillRect(px + this.GRID_SIZE / 2 - 2, py + 4, 4, 15);
        this.ctx.beginPath();
        this.ctx.arc(px + this.GRID_SIZE / 2, py + 15, 3, 0, Math.PI * 2);
        this.ctx.fill();
        break;

      case 'mirror':
        // 梳妆镜 (1x1) - 墙装式
        // 镜框
        this.ctx.fillStyle = '#d7ccc8';
        this.ctx.fillRect(px + 8, py + 4, this.GRID_SIZE - 16, this.GRID_SIZE - 16);
        // 镜面玻璃
        this.ctx.fillStyle = '#e1f5fe';
        this.ctx.fillRect(px + 10, py + 6, this.GRID_SIZE - 20, this.GRID_SIZE - 20);
        // 镜面反光线
        this.ctx.fillStyle = 'rgba(255,255,255,0.5)';
        this.ctx.beginPath();
        this.ctx.moveTo(px + 10, py + this.GRID_SIZE - 14);
        this.ctx.lineTo(px + 20, py + 6);
        this.ctx.lineTo(px + 25, py + 6);
        this.ctx.lineTo(px + 15, py + this.GRID_SIZE - 14);
        this.ctx.fill();
        break;

      case 'table':
        // 一套通过拼叠 table_pack 材质图所绘制出的桌子大物件（Table Entity）
        // 通过判断宽/高比例来决定摆放朝向
        // 水平摆放 (2x1) -> 使用第 1 行的图 (切片缩引 Index 2 或 3)
        // 垂直摆放 (1x2) -> 使用第 0 行的图 (切片缩引 Index 0 或 1)

        const tm = TextureManager.getInstance();
        let tIdx = 0;

        if (w > h) {
          // 水平方向
          // 运用第一默认款(Index 2) 或第二变体款(Index 3)
          tIdx = 2;
          // 可以基于它本身 ID 或坐标位置为基准掺入些随机款式变体
          if ((f.x + f.y) % 2 !== 0) tIdx = 3;
        } else {
          // 垂直竖向
          // 运用第一默认直向图(Index 0)或是其变体款(Index 1)
          tIdx = 0;
          if ((f.x + f.y) % 2 !== 0) tIdx = 1;
        }

        const tSprite = tm.getSlice('table_pack', tIdx);
        if (tSprite) {
          // 将一整张切片精灵图剥成两半拆开来拼绘 (以达到自然的平滑衔接过渡)
          // 若按横向(2x1)来排布，即将裁出的左半边画在第一个方格位上，而右半边则顺延画在第二块上
          // 若顺纵向(1x2)垂直看的话，就是将上端的部分挂画在原首位上，下端的便落在其之下身位了

          const halfW = tSprite.width / 2;
          const halfH = tSprite.height / 2;

          if (w > h) {
            // 水平走向 (2x1)
            // 画下左半边
            this.ctx.drawImage(
              tSprite,
              0,
              0,
              halfW,
              tSprite.height,
              px,
              py,
              this.GRID_SIZE,
              this.GRID_SIZE
            );
            // 画下右半边
            this.ctx.drawImage(
              tSprite,
              halfW,
              0,
              halfW,
              tSprite.height,
              px + this.GRID_SIZE,
              py,
              this.GRID_SIZE,
              this.GRID_SIZE
            );
          } else {
            // 垂直纵向 (1x2)
            // 画下上半身的部分
            this.ctx.drawImage(
              tSprite,
              0,
              0,
              tSprite.width,
              halfH,
              px,
              py,
              this.GRID_SIZE,
              this.GRID_SIZE
            );
            // 画下半身的部分
            this.ctx.drawImage(
              tSprite,
              0,
              halfH,
              tSprite.width,
              halfH,
              px,
              py + this.GRID_SIZE,
              this.GRID_SIZE,
              this.GRID_SIZE
            );
          }
        } else {
          // 未找到贴图时的降级填色
          this.ctx.fillStyle = '#795548';
          this.ctx.fillRect(px, py, w, h);
        }
        break;

      default:
        // 未匹配上具体种类时的默认保底方块
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
    return (
      t === TileType.WALL ||
      t === TileType.WALL_WITH_PAINTING ||
      t === TileType.WINDOW ||
      t === TileType.MIRROR
    );
  }

  private getWallSliceIndex(x: number, y: number): number {
    const hasTop = this.isWall(x, y - 1);
    const hasBottom = this.isWall(x, y + 1);
    const hasLeft = this.isWall(x - 1, y);
    const hasRight = this.isWall(x + 1, y);

    let row = 1; // 默认作取中间体段

    if (!hasTop && !hasBottom) {
      // 水平墙体段：判断它是顶墙还是底墙
      // 如果上方是地板或室内区域，说明这段墙是空间的下边界
      const isFloorAbove = this.isValid(x, y - 1) && !this.isWall(x, y - 1);
      row = isFloorAbove ? 2 : 0;
    } else if (!hasTop) {
      row = 0; // 取顶端贴天花板墙图的切片
    } else if (!hasBottom) {
      row = 2; // 取作下底接地底座处的图
    }

    let col = 1; // 默认采用列中横位中心的画面图

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
    // 把配菜柜台和长条餐桌等都一并视为同类型的接续连带材质作统等相接处理
    if (t === TileType.COUNTER || t === TileType.BOWL_STACK || t === TileType.SERVING_TABLE)
      return true;

    // 兼着也顺带查找一番周遭有没有存在什么实体摆设件（就比如像那些横跨挤占多网块的新型多格大木桌子之类）
    const entityAt = this.entities.find((e) => {
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
    // 给 Chair Pack (椅子包) 按位置规制之布局说明排列明细：
    // (0,0) 面朝下背身向南 (下标 0)
    // (0,1) 冲上正身向北 (下标 1)
    // (1,0) 撇头面靠左向西 (下标 2)
    // (1,1) 面冲右首朝东 (下标 3)

    // 当正紧挨的桌子在上头方向(也就是 y-1)，这靠椅就应该也是冲顶朝上摆的 (作下标 1 图)
    if (this.isCounter(x, y - 1)) return 1;
    // 当紧挨跟的桌子是座落在底侧(即作 y+1 处时)，小椅便大应也自然冲南面下摆出 (选下标 0 图)
    if (this.isCounter(x, y + 1)) return 0;
    // 向正左有着伴桌时(在 x-1 此向)，它也即应该转朝向并面向着左侧方向 (用下标 2 此图)
    if (this.isCounter(x - 1, y)) return 2;
    // 遇有桌摆右头(x+1 方向)，它便也必向右边转顺 (用下标 3 之贴图)
    if (this.isCounter(x + 1, y)) return 3;

    return 0; // 无周遭依靠时的默认向下方
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
    if (!hasLeft && !hasRight)
      col = 1; // 单个吧台默认使用中间列
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
      // 切图未发现提取后的备作填充防坠底策 (只要载入成功则应不会发生此报错情况)
      this.ctx.fillStyle = '#5d4037';
      this.ctx.fillRect(px, py, this.GRID_SIZE, this.GRID_SIZE);
    }
  }

  private drawPaintingOverlay(x: number, y: number) {
    const px = x * this.GRID_SIZE;
    const py = y * this.GRID_SIZE;
    const faceY = py + this.GRID_SIZE / 3;
    const faceHeight = (this.GRID_SIZE / 3) * 2;

    // 油画外框
    this.ctx.fillStyle = '#ffb300'; // Gold frame
    this.ctx.fillRect(px + 10, faceY + 5, this.GRID_SIZE - 20, faceHeight - 15);

    // 画板/画心图像区
    this.ctx.fillStyle = '#0277bd'; // Blue painting
    this.ctx.fillRect(px + 12, faceY + 7, this.GRID_SIZE - 24, faceHeight - 19);

    // 画作细节与内容点缀
    this.ctx.fillStyle = '#ffffff';
    this.ctx.beginPath();
    this.ctx.arc(px + this.GRID_SIZE / 2, faceY + faceHeight / 2, 3, 0, Math.PI * 2);
    this.ctx.fill();
  }

  private drawMirrorOverlay(x: number, y: number) {
    const px = x * this.GRID_SIZE;
    const py = y * this.GRID_SIZE;
    const faceY = py + this.GRID_SIZE / 3;
    const faceHeight = (this.GRID_SIZE / 3) * 2;

    // 镜子挂框
    this.ctx.fillStyle = '#bdbdbd'; // Silver frame
    this.ctx.fillRect(px + 10, faceY + 5, this.GRID_SIZE - 20, faceHeight - 10);

    // 玻璃主镜面
    this.ctx.fillStyle = '#e3f2fd'; // Light Blue-ish White
    this.ctx.fillRect(px + 12, faceY + 7, this.GRID_SIZE - 24, faceHeight - 14);

    // 高光反光划线点缀
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

    // 侦察相邻上下左右其接连关系
    const hasWindowAbove = y > 0 && this.map[y - 1] && this.map[y - 1]![x] === TileType.WINDOW;
    const hasWindowBelow =
      y < mapHeight - 1 && this.map[y + 1] && this.map[y + 1]![x] === TileType.WINDOW;
    const hasWindowLeft = x > 0 && this.map[y]![x - 1] === TileType.WINDOW;
    const hasWindowRight = x < mapWidth - 1 && this.map[y]![x + 1] === TileType.WINDOW;

    // 断定理出窗面的摆列走向朝向
    let isVertical = false;
    if (hasWindowAbove || hasWindowBelow) isVertical = true;
    if (hasWindowLeft || hasWindowRight) isVertical = false;

    if (isVertical) {
      // --- 纵向开垂直窗的立高款式结构 ---
      this.ctx.fillStyle = '#795548';
      this.ctx.fillRect(px + 4, faceY + 4, 6, faceHeight - 8);
      this.ctx.fillRect(px + this.GRID_SIZE - 10, faceY + 4, 6, faceHeight - 8);

      if (!hasWindowAbove) {
        this.ctx.fillRect(px + 4, faceY + 4, this.GRID_SIZE - 8, 6);
        this.ctx.beginPath();
        this.ctx.arc(px + this.GRID_SIZE / 2, faceY + 10, this.GRID_SIZE / 2 - 6, Math.PI, 0);
        this.ctx.fill();
      }

      if (!hasWindowBelow) {
        this.ctx.fillRect(px + 4, faceY + faceHeight - 10, this.GRID_SIZE - 8, 6);
      }

      this.ctx.fillStyle = '#5c6bc0';
      this.ctx.fillRect(px + 10, faceY + 10, this.GRID_SIZE - 20, faceHeight - 20);

      this.ctx.fillStyle = '#795548';
      this.ctx.fillRect(px + this.GRID_SIZE / 2 - 1, faceY + 4, 2, faceHeight - 8);
    } else {
      // --- 水平开向的窗户款式 ---
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
      this.ctx.fillRect(px + this.GRID_SIZE / 2 - 1, faceY + 4, 2, faceHeight - 8);
      this.ctx.fillRect(px + 12, faceY + faceHeight / 2 - 1, this.GRID_SIZE - 24, 2);

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

    // --- 渲染层级 0: 地板表面 (垫底基础层) ---
    const floorSliceIndex = this.getVariant(x, y, 4);
    const floorSlice = tm.getSlice('floor_pack', floorSliceIndex);
    if (floorSlice) {
      this.ctx.drawImage(floorSlice, px, py);
    } else {
      this.ctx.fillStyle = '#3e2723';
      this.ctx.fillRect(px, py, this.GRID_SIZE, this.GRID_SIZE);
    }

    // --- 渲染层级 1: 各类静物/墙壁 ---
    switch (tile) {
      case TileType.FLOOR:
      case TileType.KITCHEN:
      case TileType.EXIT:
        // 地板刚才已经画过了，跳过
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
          // 取用道具包中的下标 2 图块 (堆叠的脏碗)
          const bowlSlice = tm.getSlice('props_pack', 2);
          if (bowlSlice) this.ctx.drawImage(bowlSlice, px, py);
          else this.drawTileFallback(x, y, tile);
        }
        break;

      case TileType.SERVING_TABLE:
        // 厨房备菜操作台/多用层架 (1x1 方块)
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

    switch (tile) {
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
        // 呈现带有上下文环境自适应感知能力的伪 3D 视觉立体渲染效果
        const mapHeight = this.map.length;
        const mapWidth = this.map[0]?.length || 0;

        const isBottomOpen =
          y < mapHeight - 1 &&
          this.map[y + 1] &&
          this.map[y + 1]![x] !== TileType.WALL &&
          this.map[y + 1]![x] !== TileType.WALL_WITH_PAINTING &&
          this.map[y + 1]![x] !== TileType.WINDOW &&
          this.map[y + 1]![x] !== TileType.MIRROR;
        const isRightOpen =
          x < mapWidth - 1 &&
          this.map[y]![x + 1] !== TileType.WALL &&
          this.map[y]![x + 1] !== TileType.WALL_WITH_PAINTING &&
          this.map[y]![x + 1] !== TileType.WINDOW &&
          this.map[y]![x + 1] !== TileType.MIRROR;
        const isLeftOpen =
          x > 0 &&
          this.map[y]![x - 1] !== TileType.WALL &&
          this.map[y]![x - 1] !== TileType.WALL_WITH_PAINTING &&
          this.map[y]![x - 1] !== TileType.WINDOW &&
          this.map[y]![x - 1] !== TileType.MIRROR;

        // 方块上的基底底色 (物体朝上的面)
        this.ctx.fillStyle = '#5d4037'; // Standard Wood
        this.ctx.fillRect(px, py, this.GRID_SIZE, this.GRID_SIZE);

        // 1. 正对前边的外立面 (面向南) - 仅当它下方相邻格无阻挡时才显露绘制 (亦或是墙面上附载了画作/窗户/镜子等时)
        if (
          isBottomOpen ||
          tile === TileType.WALL_WITH_PAINTING ||
          tile === TileType.WINDOW ||
          tile === TileType.MIRROR
        ) {
          // 一旦确定了这段外皮是属于其正面的立墙脸皮，我们此下便给它涂装出具备上下分割色阶层次感的视效

          // 立面的上部边缘层 (色调偏明亮)
          this.ctx.fillStyle = '#6d4c41';
          this.ctx.fillRect(px, py, this.GRID_SIZE, this.GRID_SIZE / 3);

          // 立面的主体正脸 (标准中间色基调)
          this.ctx.fillStyle = '#8d6e63';
          this.ctx.fillRect(px, py + this.GRID_SIZE / 3, this.GRID_SIZE, (this.GRID_SIZE / 3) * 2);

          // 在顶部亮边之下打上的一小截下垂阴影
          this.ctx.fillStyle = 'rgba(0,0,0,0.1)';
          this.ctx.fillRect(px, py + this.GRID_SIZE / 3, this.GRID_SIZE, 2);
        }

        // 2. 靠着右手的侧脸立面 (朝东) - 仅当右侧为空开状态时才展现
        if (isRightOpen) {
          // 在它的右缘贴上一层深暗色调的侧板
          this.ctx.fillStyle = '#4e342e'; // Dark shadow
          this.ctx.fillRect(px + this.GRID_SIZE - 8, py, 8, this.GRID_SIZE);
        }

        // 3. 靠着左手的侧脸立面 (朝西) - 仅当左侧呈空落落的状态才予以展露
        if (isLeftOpen) {
          // 对应在其左手侧缘也画上一面暗沉色的侧板影子
          this.ctx.fillStyle = '#4e342e'; // Dark shadow
          this.ctx.fillRect(px, py, 8, this.GRID_SIZE);
        }

        // 既然此处这堵墙是有带配置挂画的，那便连同一起将名画也嵌挂着手画上去
        if (tile === TileType.WALL_WITH_PAINTING) {
          this.drawPaintingOverlay(x, y);
        }

        // 同理连镜子也照常给对应贴画到这面墙上去
        if (tile === TileType.MIRROR) {
          this.drawMirrorOverlay(x, y);
        }

        // 当它带贴有窗户也就得同开上并呈画显露
        if (tile === TileType.WINDOW) {
          this.drawWindowOverlay(x, y);
        }
        break;
      case TileType.COUNTER:
      case TileType.BOWL_STACK:
        // 取用引调最新制成的专属服务方柜这一套图层包 (Counter Pack)
        const cSliceIndex = this.getCounterSliceIndex(x, y);
        const cSlice = tm.getSlice('counter_pack', cSliceIndex);
        if (cSlice) {
          this.ctx.drawImage(cSlice, px, py);
        } else {
          // 图包缺失异常未匹配时所作涂画补补防降级裸木色底柜之方台
          this.ctx.fillStyle = '#8d6e63'; // Counter Wood
          this.ctx.fillRect(px, py, this.GRID_SIZE, this.GRID_SIZE);
          this.ctx.fillStyle = 'rgba(255,255,255,0.1)';
          this.ctx.fillRect(px, py, this.GRID_SIZE, 5);
        }

        if (tile === TileType.COUNTER) {
          break;
        }
        // 如果当前处理的其实是堆叠的海碗群，那还要接茬儿添补画上相应的脏碗图
        this.ctx.fillStyle = '#FF9800'; // Orange bowl
        this.ctx.beginPath();
        this.ctx.arc(px + this.GRID_SIZE / 2, py + this.GRID_SIZE / 2 + 5, 10, 0, Math.PI, false);
        this.ctx.fill();
        this.ctx.strokeStyle = '#FFF';
        this.ctx.lineWidth = 2;
        this.ctx.stroke();

        this.ctx.beginPath();
        this.ctx.arc(px + this.GRID_SIZE / 2, py + this.GRID_SIZE / 2, 10, 0, Math.PI, false);
        this.ctx.fill();
        this.ctx.stroke();

        this.ctx.fillStyle = 'white';
        this.ctx.font = '10px Arial';
        this.ctx.fillText('BOWLS', px + 5, py + 15);
        break;
      case TileType.CHAIR:
        this.ctx.fillStyle = '#3e2723'; // 起手先给底部的地板背景着个色铺层底
        this.ctx.fillRect(px, py, this.GRID_SIZE, this.GRID_SIZE);

        this.ctx.fillStyle = '#a1887f'; // 填上椅子该有的材质木色
        const padding = 10;
        this.ctx.fillRect(
          px + padding,
          py + padding,
          this.GRID_SIZE - padding * 2,
          this.GRID_SIZE - padding * 2
        );
        break;
      case TileType.KITCHEN:
        this.ctx.fillStyle = '#263238'; // 专为后厨配置的深色防油暗地板
        this.ctx.fillRect(px, py, this.GRID_SIZE, this.GRID_SIZE);
        this.ctx.strokeStyle = '#37474f';
        this.ctx.strokeRect(px, py, this.GRID_SIZE, this.GRID_SIZE);
        break;
      case TileType.EXIT:
        this.ctx.fillStyle = '#ef5350'; // 醒目扎眼的红色出口提示大方块
        this.ctx.fillRect(px, py, this.GRID_SIZE, this.GRID_SIZE);
        this.ctx.fillStyle = 'white';
        this.ctx.font = '10px Arial';
        this.ctx.fillText('EXIT', px + 10, py + 25);
        break;
      case TileType.SERVING_TABLE:
        this.ctx.fillStyle = '#8d6e63'; // 发呈现为棕褐色的实木餐桌台
        this.ctx.fillRect(px, py, this.GRID_SIZE, this.GRID_SIZE);
        this.ctx.strokeStyle = '#5d4037';
        this.ctx.lineWidth = 2;
        this.ctx.strokeRect(px, py, this.GRID_SIZE, this.GRID_SIZE);

        // 假如在桌案上面还落陈摆着有啥物件的话便一并把它也顶带落画并在最上沿的顶端上面
        const item = this.getPlacedItem(x, y);
        if (item) {
          if (item.type === 'dish') {
            // 绘制餐盘
            this.ctx.fillStyle = '#ffffff';
            this.ctx.beginPath();
            this.ctx.arc(px + this.GRID_SIZE / 2, py + this.GRID_SIZE / 2, 14, 0, Math.PI * 2);
            this.ctx.fill();
            // 绘制盘中食物
            this.ctx.fillStyle = '#ff5722';
            this.ctx.beginPath();
            this.ctx.arc(px + this.GRID_SIZE / 2, py + this.GRID_SIZE / 2, 8, 0, Math.PI * 2);
            this.ctx.fill();
          } else if (item.type === 'bowl') {
            // 绘制重叠的汤碗
            this.ctx.fillStyle = '#b0bec5';
            this.ctx.beginPath();
            this.ctx.arc(px + this.GRID_SIZE / 2, py + this.GRID_SIZE / 2, 14, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.fillStyle = '#eceff1';
            this.ctx.beginPath();
            this.ctx.arc(px + this.GRID_SIZE / 2, py + this.GRID_SIZE / 2, 10, 0, Math.PI * 2);
            this.ctx.fill();
          }
        }
        break;
      case TileType.COOKING_POT:
        this.ctx.fillStyle = '#263238'; // 后厨用地身防渗深颜色板砖
        this.ctx.fillRect(px, py, this.GRID_SIZE, this.GRID_SIZE);

        // 后厨火炉
        this.ctx.fillStyle = '#424242';
        this.ctx.fillRect(px + 4, py + 4, this.GRID_SIZE - 8, this.GRID_SIZE - 8);

        // 大铁锅主体
        this.ctx.fillStyle = '#9E9E9E'; // Silver Pot
        this.ctx.beginPath();
        this.ctx.arc(px + this.GRID_SIZE / 2, py + this.GRID_SIZE / 2, 14, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.strokeStyle = '#616161';
        this.ctx.stroke();

        // 锅里的烹饪物汤汁
        this.ctx.fillStyle = '#81D4FA'; // Water/Soup
        this.ctx.beginPath();
        this.ctx.arc(px + this.GRID_SIZE / 2, py + this.GRID_SIZE / 2, 10, 0, Math.PI * 2);
        this.ctx.fill();
        break;
      case TileType.STAIRS:
        // 落笔打出攀上攀下踩踏借用之楼梯竖向大实直大长级来梯面通直上
        this.ctx.fillStyle = '#4e342e'; // Dark Base
        this.ctx.fillRect(px, py, this.GRID_SIZE, this.GRID_SIZE);

        // 洗出阶梯面纹路 (表现为水平平行的横条格栅)
        // 在每一块方形网格内部都强塞并排定入内切包含进这作三等面三步登天用的横接大等面大面有跨度长的有其内的这有跨其大内的阶梯层平阶出它这这也大它有等面一层阶那这也面上
        const stepHeight = this.GRID_SIZE / 3;
        this.ctx.fillStyle = '#6d4c41'; // Lighter wood for step top

        for (let i = 0; i < 3; i++) {
          // 给每一级阶梯面板的顶部上色
          this.ctx.fillRect(px, py + i * stepHeight, this.GRID_SIZE, stepHeight - 4);
        }

        // 贴紧连通上下文智能依附衔接的防护栏杆
        const hasStairsLeft = x > 0 && this.map[y]![x - 1] === TileType.STAIRS;
        const hasStairsRight = x < this.COLS - 1 && this.map[y]![x + 1] === TileType.STAIRS;

        // 左侧阶梯扶手栏杆
        if (!hasStairsLeft) {
          this.ctx.fillStyle = '#3e2723'; // Dark Rail
          this.ctx.fillRect(px, py, 4, this.GRID_SIZE);
          this.ctx.fillStyle = '#5d4037'; // Rail Top
          this.ctx.fillRect(px, py, 4, this.GRID_SIZE);
        }

        // 右侧阶梯扶手栏杆
        if (!hasStairsRight) {
          this.ctx.fillStyle = '#3e2723'; // Dark Rail
          this.ctx.fillRect(px + this.GRID_SIZE - 4, py, 4, this.GRID_SIZE);
          this.ctx.fillStyle = '#5d4037'; // Rail Top
          this.ctx.fillRect(px + this.GRID_SIZE - 4, py, 4, this.GRID_SIZE);
        }
        break;
      case TileType.BED:
        this.ctx.fillStyle = '#3e2723'; // 贴铺垫衬于底部的地板用基底面
        this.ctx.fillRect(px, py, this.GRID_SIZE, this.GRID_SIZE);

        // 床体大支底边上其四周边外的大主干其木框架
        this.ctx.fillStyle = '#5d4037';
        this.ctx.fillRect(px + 4, py + 4, this.GRID_SIZE - 8, this.GRID_SIZE - 8);

        // 承重打底平铺卧用的大厚长实棉床白垫底座底面 (白底垫布等色底那床垫这等白色)
        this.ctx.fillStyle = '#eceff1';
        this.ctx.fillRect(px + 6, py + 6, this.GRID_SIZE - 12, this.GRID_SIZE - 12);

        // 上首枕身其用枕头
        this.ctx.fillStyle = '#90caf9';
        this.ctx.fillRect(px + 8, py + 8, this.GRID_SIZE - 16, 12);

        // 盖面被子 (带红底印花图案)
        this.ctx.fillStyle = '#ef5350';
        this.ctx.fillRect(px + 6, py + 24, this.GRID_SIZE - 12, this.GRID_SIZE - 30);
        break;
      case TileType.SOFA:
        this.ctx.fillStyle = '#3e2723'; // Floor BG
        this.ctx.fillRect(px, py, this.GRID_SIZE, this.GRID_SIZE);

        // 沙发主体 (红色/皮质)
        this.ctx.fillStyle = '#8d6e63'; // Brown Leather
        // 沙发椅背
        this.ctx.fillRect(px + 4, py + 4, this.GRID_SIZE - 8, 12);
        // 沙发座垫
        this.ctx.fillStyle = '#a1887f';
        this.ctx.fillRect(px + 4, py + 16, this.GRID_SIZE - 8, this.GRID_SIZE - 20);
        // 沙发两边扶手
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
      const pack = 'props_pack';

      switch (f.furnitureType) {
        case 'sink':
          sliceIndex = 0;
          break;
        case 'stove':
          sliceIndex = 1;
          break;
        case 'toilet':
          sliceIndex = 9;
          break; // 示例索引
        case 'lamp':
          sliceIndex = 4;
          break;
        case 'bookshelf':
          sliceIndex = 7;
          break;
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

    // 足底阴影
    this.ctx.fillStyle = 'rgba(0,0,0,0.3)';
    this.ctx.beginPath();
    this.ctx.ellipse(
      px + this.GRID_SIZE / 2,
      py + this.GRID_SIZE - 5,
      this.GRID_SIZE / 3,
      this.GRID_SIZE / 6,
      0,
      0,
      Math.PI * 2
    );
    this.ctx.fill();

    // 玩家/角色的躯干主体
    if (entity.type === 'player') {
      this.ctx.fillStyle = '#FF5252'; // Player Red
    } else {
      // 依据客人的不同状态展现出不同的体色？
      const customer = entity as Customer;
      if (customer.state === 'ordering')
        this.ctx.fillStyle = '#FFEB3B'; // Yellow
      else if (customer.state === 'waiting_food')
        this.ctx.fillStyle = '#8BC34A'; // Green
      else this.ctx.fillStyle = '#42A5F5'; // Blue
    }

    let bounceY = 0;
    if (entity.isMoving) {
      bounceY = Math.sin(Date.now() / 100) * 3;
    }

    this.ctx.fillRect(px + 8, py + 8 + bounceY, this.GRID_SIZE - 16, this.GRID_SIZE - 16);

    // 眼睛
    this.ctx.fillStyle = 'white';
    if (entity.direction === 'down') {
      this.ctx.fillRect(px + 12, py + 15 + bounceY, 8, 8);
      this.ctx.fillRect(px + 28, py + 15 + bounceY, 8, 8);
    } else if (entity.direction === 'left') {
      this.ctx.fillRect(px + 10, py + 15 + bounceY, 8, 8);
    } else if (entity.direction === 'right') {
      this.ctx.fillRect(px + 30, py + 15 + bounceY, 8, 8);
    }

    // 呈现用来提示客人当前状态的标识图标
    if (entity.type === 'customer') {
      const customer = entity as Customer;
      if (customer.state === 'ordering') {
        // 绘制代表有突发需求的 "!" 惊叹气泡
        this.ctx.fillStyle = 'white';
        this.ctx.beginPath();
        this.ctx.arc(px + this.GRID_SIZE - 5, py + 5 + bounceY, 10, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.fillStyle = 'red';
        this.ctx.font = 'bold 14px Arial';
        this.ctx.fillText('!', px + this.GRID_SIZE - 8, py + 10 + bounceY);
      } else if (customer.state === 'waiting_food') {
        // 绘制代表静默等待的 "..." 气泡
        this.ctx.fillStyle = 'white';
        this.ctx.beginPath();
        this.ctx.arc(px + this.GRID_SIZE - 5, py + 5 + bounceY, 10, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.fillStyle = '#333';
        this.ctx.font = 'bold 12px Arial';
        this.ctx.fillText('...', px + this.GRID_SIZE - 12, py + 8 + bounceY);
      } else if (customer.state === 'eating') {
        // 绘制正在吃饭的 "海碗" 图标气泡
        this.ctx.fillStyle = 'white';
        this.ctx.beginPath();
        this.ctx.arc(px + this.GRID_SIZE - 5, py + 5 + bounceY, 10, 0, Math.PI * 2);
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
