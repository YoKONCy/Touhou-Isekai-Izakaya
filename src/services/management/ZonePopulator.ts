// 从 LLM 获取的区域类型
export type ZoneChar = '#' | '.' | 'K' | 'D' | 'W' | 'E' | 'L' | 'B' | 'S' | 'R';
// #: 墙壁, .: 地板（通用）, K: 厨房, D: 餐厅, W: 走廊, E: 入口, L: 休息室, B: 卧室, S: 楼梯, R: 卫生间

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
  private resultMap: string[][]; // 最终瓦片地图的工作副本
  private reservedCells: Set<string> = new Set(); // 为门/路径保留的单元格

  constructor(zoneLayout: string[]) {
    this.layout = zoneLayout;
    this.height = zoneLayout.length;
    this.width = zoneLayout[0]?.length || 0;

    // 根据输入，使用空地板或墙壁初始化 resultMap
    this.resultMap = zoneLayout.map((row) =>
      row.split('').map((char) => {
        if (char === '#') return '#';
        return '.'; // Default base floor
      })
    );
  }

  public generate(): string[] {
    // 0. 预处理：在房间之间生成内墙
    this.generateInternalWalls();

    // 0.1 确保连通性（打破被困区域的墙壁）
    this.ensureZoneConnectivity();

    // 0.2 确保全局连通性（修复死胡同 / 无法到达的区域）
    this.ensureGlobalConnectivity();

    // 0.3 修复对角线墙壁（防止泄漏）
    this.fixDiagonalWalls();

    const zones = this.identifyZones();

    // 1. 首先处理走廊（高优先级，保持畅通）
    this.processWalkways(zones.filter((z) => z.type === 'W' || z.type === 'E'));

    // 2. 处理厨房（边界需要操作台）
    this.processKitchens(zones.filter((z) => z.type === 'K'));

    // 3. 处理餐厅（桌子）
    this.processDining(zones.filter((z) => z.type === 'D'));

    // 4. 处理生活区（卧室/休息室/卫生间）
    this.processLiving(zones.filter((z) => z.type === 'B' || z.type === 'L'));
    this.processRestroom(zones.filter((z) => z.type === 'R'));

    // 5. 装饰墙壁（窗户）
    this.decorateWalls();

    // 6. 最终清理（确保有出口）
    this.ensureExits();

    return this.resultMap.map((row) => row.join(''));
  }

  private ensureGlobalConnectivity() {
    // 从主入口 'E'（如果是在楼上则为 'S'）运行 BFS，以查找所有可到达的单元格。
    // 这确保了所有组件都连接到主入口点。

    let startPoint: Point | null = null;

    // 优先级: E > S/H > 一楼(First Floor)
    // 搜寻 E
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        if (this.getTile(x, y) === 'E') {
          startPoint = { x, y };
          break;
        }
      }
      if (startPoint) break;
    }

    // 如果没有 E，则搜索 S 或 H
    if (!startPoint) {
      for (let y = 0; y < this.height; y++) {
        for (let x = 0; x < this.width; x++) {
          const t = this.getTile(x, y);
          if (t === 'S' || t === 'H') {
            startPoint = { x, y };
            break;
          }
        }
        if (startPoint) break;
      }
    }

    // 后退方案：首个地板瓦片
    if (!startPoint) {
      for (let y = 0; y < this.height; y++) {
        for (let x = 0; x < this.width; x++) {
          const t = this.getTile(x, y);
          if (t !== '#') {
            startPoint = { x, y };
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

    while (queue.length > 0) {
      const curr = queue.shift()!;

      const neighbors = [
        { x: curr.x, y: curr.y - 1 },
        { x: curr.x, y: curr.y + 1 },
        { x: curr.x - 1, y: curr.y },
        { x: curr.x + 1, y: curr.y }
      ];

      for (const n of neighbors) {
        if (n.x < 0 || n.x >= this.width || n.y < 0 || n.y >= this.height) continue;
        const key = `${n.x},${n.y}`;
        if (reachable.has(key)) continue;

        const tile = this.getTile(n.x, n.y);
        // 可通行的瓦片：除了 '#' 以外的任何部分。
        // 注意：家具尚未放置，因此我们只能看到 '.', 'K', 'D', 'W' 等。
        if (tile !== '#') {
          reachable.add(key);
          queue.push(n);
        }
      }
    }

    // 识别无法到达的地板单元格
    const unreachableGroups: Point[][] = [];
    const visitedUnreachable = new Set<string>();

    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const key = `${x},${y}`;
        const tile = this.getTile(x, y);
        if (tile !== '#' && !reachable.has(key) && !visitedUnreachable.has(key)) {
          // 找到一个无法到达的单元格。进行泛滥填充 (Flood fill) 以查找完整的组。
          const group: Point[] = [];
          const gQueue: Point[] = [{ x, y }];
          visitedUnreachable.add(key);

          while (gQueue.length > 0) {
            const gc = gQueue.shift()!;
            group.push(gc);

            const neighbors = [
              { x: gc.x, y: gc.y - 1 },
              { x: gc.x, y: gc.y + 1 },
              { x: gc.x - 1, y: gc.y },
              { x: gc.x + 1, y: gc.y }
            ];
            for (const gn of neighbors) {
              if (gn.x < 0 || gn.x >= this.width || gn.y < 0 || gn.y >= this.height) continue;
              const gKey = `${gn.x},${gn.y}`;
              if (
                !visitedUnreachable.has(gKey) &&
                !reachable.has(gKey) &&
                this.getTile(gn.x, gn.y) !== '#'
              ) {
                visitedUnreachable.add(gKey);
                gQueue.push(gn);
              }
            }
          }
          unreachableGroups.push(group);
        }
      }
    }

    // 连接不可达的路段组
    unreachableGroups.forEach((group) => {
      // 在组内找到最接近“任意可达路段”的单元格
      // （曼哈顿距离）
      // let bestCandidate: { start: Point, target: Point, dist: number } | null = null;

      // 优化：仅检查组的边界？
      // 遍历所有组内的单元格，检查它们与所有可达路段的距离？复杂度 O(N*M) 太慢了。
      // 更好的做法是：从该组向外进行 BFS 扩展，直到我们触及可达路段。

      const searchQueue: { p: Point; dist: number; parent?: Point }[] = group.map((p) => ({
        p,
        dist: 0
      }));
      const searchVisited = new Set<string>(group.map((p) => `${p.x},${p.y}`));

      // 允许穿过墙壁搜索以寻找路径
      const foundPath: Point[] = [];

      // 用于重构路径的映射表（Map）
      const parentMap = new Map<string, Point>();

      while (searchQueue.length > 0) {
        const { p, dist } = searchQueue.shift()!;

        if (reachable.has(`${p.x},${p.y}`)) {
          // 找到了连接！
          // 执行回溯 (Backtrack)
          let curr: Point | undefined = p;
          while (curr) {
            foundPath.push(curr);
            const parent = parentMap.get(`${curr.x},${curr.y}`);
            if (parent && group.some((g) => g.x === parent.x && g.y === parent.y)) {
              // 父节点存在于起始组中，连接完成
              foundPath.push(parent);
              break;
            }
            curr = parent;
          }
          break;
        }

        const neighbors = [
          { x: p.x, y: p.y - 1 },
          { x: p.x, y: p.y + 1 },
          { x: p.x - 1, y: p.y },
          { x: p.x + 1, y: p.y }
        ];

        for (const n of neighbors) {
          if (n.x < 0 || n.x >= this.width || n.y < 0 || n.y >= this.height) continue;
          const key = `${n.x},${n.y}`;
          if (!searchVisited.has(key)) {
            searchVisited.add(key);
            parentMap.set(key, p);
            searchQueue.push({ p: n, dist: dist + 1 });
          }
        }
      }

      // 挖掘路径
      foundPath.forEach((p) => {
        if (this.getTile(p.x, p.y) === '#') {
          this.setTile(p.x, p.y, '.');
          this.reservedCells.add(`${p.x},${p.y}`);
          // 或许还需预留相邻瓷砖以此确保宽度？不，1个瓷砖足够了。
        }
        reachable.add(`${p.x},${p.y}`);
      });
    });
  }

  private fixDiagonalWalls() {
    // 遍历所有 2x2 块以查找对角线缝隙
    for (let y = 0; y < this.height - 1; y++) {
      for (let x = 0; x < this.width - 1; x++) {
        const tl = this.getTile(x, y); // 左上 (Top-Left)
        const tr = this.getTile(x + 1, y); // 右上 (Top-Right)
        const bl = this.getTile(x, y + 1); // 左下 (Bottom-Left)
        const br = this.getTile(x + 1, y + 1); // 右下 (Bottom-Right)

        // 模式 1：墙壁位于左上和右下（对角线墙壁）
        // # .
        // . #
        if (tl === '#' && br === '#' && tr !== '#' && bl !== '#') {
          // 填补一个缺口以阻挡对角线
          // 我们填补右上角以闭合它
          this.setTile(x + 1, y, '#');
        }

        // 模式 2：墙壁位于右上和左下
        // . #
        // # .
        if (tr === '#' && bl === '#' && tl !== '#' && br !== '#') {
          // 填补左上角
          this.setTile(x, y, '#');
        }
      }
    }
  }

  private ensureZoneConnectivity() {
    // 确保每个区域 (K, D, B, L, R) 至少与 W, D, L 或 E 中拥有一个连接部分
    // 这么做是为了处理布局中包含 '#' 围住某个区域（如厨房）的情况。
    const zones = this.identifyZones();

    zones.forEach((zone) => {
      if (['#', 'W', 'E', '.', 'S'].includes(zone.type)) return;

      // 检查是否已经连接（包含一个可进入的邻居）
      // 或者仅仅检查是否有任何边界单元格相邻于 resultMap 中一个可通行的瓦片？
      // 注意：如果我们还没有处理，resultMap 依然可能由于布局初始化而带有 '#'。
      // 但是我们已经运行了 generateInternalWalls。

      // 如果需要，找一个地方打个洞
      // 遍历所有边界单元格（位于区内但挨着非本区范围的单元格）
      const potentialExits: { cell: Point; neighbor: Point; nType: string; priority: number }[] =
        [];

      let hasExit = false;

      zone.cells.forEach((cell) => {
        const neighbors = [
          { x: cell.x, y: cell.y - 1 },
          { x: cell.x, y: cell.y + 1 },
          { x: cell.x - 1, y: cell.y },
          { x: cell.x + 1, y: cell.y }
        ];

        for (const n of neighbors) {
          if (n.x < 0 || n.x >= this.width || n.y < 0 || n.y >= this.height) continue;

          const nType = this.getZoneChar(n.x, n.y);
          const nTile = this.getTile(n.x, n.y); // Current tile map state

          if (nType === zone.type) continue; // 同一区域

          // 如果我们发现相邻有一个可通行瓦片，这样可以吗？
          // 可通行包括：'.', 'W', 'E', 'D', 'L'
          // 如果邻居在 tileMap 中为 '#'，那么这是一堵墙。
          // 如果邻居在 tileMap 中为 '.'，那么这是一个出口。

          if (nTile !== '#') {
            hasExit = true;
            // 标记此单元保留，以防止封锁现有出口
            this.reservedCells.add(`${cell.x},${cell.y}`);
          } else {
            // 这是一堵墙。这是一个潜在的突破点。
            // 检查墙壁后面是什么。
            // 我们需要打破一堵能通往 W/D/L/E 方向的墙。
            let priority = 0;
            const nNeighbors = [
              { x: n.x, y: n.y - 1 },
              { x: n.x, y: n.y + 1 },
              { x: n.x - 1, y: n.y },
              { x: n.x + 1, y: n.y }
            ];

            for (const nn of nNeighbors) {
              if (nn.x < 0 || nn.x >= this.width || nn.y < 0 || nn.y >= this.height) continue;
              const nnType = this.getZoneChar(nn.x, nn.y);
              if (['W', 'D', 'L', 'E'].includes(nnType)) {
                priority = 100; // 找到路径了！
                // 提升 W 的优先级
                if (nnType === 'W') priority = 150;
                break;
              }
            }

            potentialExits.push({ cell, neighbor: n, nType, priority });
          }
        }
      });

      if (!hasExit && potentialExits.length > 0) {
        // 根据优先级对出口进行排序
        potentialExits.sort((a, b) => b.priority - a.priority);

        // 挑选最佳的那个
        const best = potentialExits[0];

        if (best) {
          // 在墙壁（邻居）上打洞
          this.setTile(best.neighbor.x, best.neighbor.y, '.');

          // 标记为保留
          this.reservedCells.add(`${best.neighbor.x},${best.neighbor.y}`); // 门本身
          this.reservedCells.add(`${best.cell.x},${best.cell.y}`); // 在门内部相邻的单元格
        }
      }
    });
  }

  private generateInternalWalls() {
    // 在不同性质的区域之间创建墙壁（具体说来指卧室，洗手间，休息室等）
    // 遍历所有的单元格

    // 我们需要先识别各个区间的形体，才能被正确分配每个房间的门道
    const zones = this.identifyZones();

    zones.forEach((zone) => {
      // 只有私人/半私人的房间才需要封闭
      if (!['B', 'R', 'L'].includes(zone.type)) return;

      const zoneWallPoints: Point[] = [];

      zone.cells.forEach((cell) => {
        const neighbors = [
          { x: cell.x, y: cell.y - 1 },
          { x: cell.x, y: cell.y + 1 },
          { x: cell.x - 1, y: cell.y },
          { x: cell.x + 1, y: cell.y }
        ];

        for (const n of neighbors) {
          // 检查邻居是否有效
          if (n.x < 0 || n.x >= this.width || n.y < 0 || n.y >= this.height) continue;

          const myType = zone.type;
          const nType = this.getZoneChar(n.x, n.y);

          // 如果邻居含有不同的类型，又不是墙体 '#'；
          // 我们应该放置一堵墙。
          // 但是寻常情况下，不应该把墙放进 'W' (走道)上；
          // 而是放在 'B' 的边缘上。
          // 该 'cell' 处在 'B' 中。故而把 'cell' 变成 '#'。

          if (nType !== myType && nType !== '#') {
            // 为这个单元格子打上成为墙壁后补的标记
            // 但等等，如果我们做标记，它就不再是 'B' 了。
            // 我们还是得这么做。
            // 但是我们需要确保没有拦住所有的通道。

            // 仅仅当邻居是走廊，休息室，餐厅等时才建立墙壁。
            // 如果邻居是另一个 B 的话？(相邻卧室)。也行，把它们分隔开。
            // 然而 getZoneChar 使用的是最初原始的排布设计。相邻 B 所构成的群或许处于同一个区块下。
            // 如果它们位于不同的区间咋办？identifyZones 就是为了合并相同字符串所写的了。
            // 因此这几块挨在一起的 B 是同一间房的。我们从内部不再划分其结构（除非想要细分房间规格）。
            // 目前先设为 一格连通块 = 一个房间 即可。

            zoneWallPoints.push(cell);
            break; // 一个邻居的区别足矣说明这儿需要堵住
          }
        }
      });

      // 落实墙体
      // 但我们需要留下门禁！
      // 优先而言，出门最好的选择是跟 'W' 接壤的地方。要不然就去 'L' 或者 'D'。
      // 优先级依次为： W > L > D > 其它杂项。

      // 按照接近步道的方式为墙壁做次排序
      const doorSpots = zoneWallPoints.filter((p) => {
        // 再次检查邻居以寻找 W
        const neighbors = [
          { x: p.x, y: p.y - 1 },
          { x: p.x, y: p.y + 1 },
          { x: p.x - 1, y: p.y },
          { x: p.x + 1, y: p.y }
        ];
        return neighbors.some((n) => {
          if (n.x < 0 || n.x >= this.width || n.y < 0 || n.y >= this.height) return false;
          return this.getZoneChar(n.x, n.y) === 'W';
        });
      });

      let finalDoorSpots = doorSpots;

      // 若没有找到 W 类型的邻居，则尝试 L 或者 D
      if (finalDoorSpots.length === 0) {
        finalDoorSpots = zoneWallPoints.filter((p) => {
          const neighbors = [
            { x: p.x, y: p.y - 1 },
            { x: p.x, y: p.y + 1 },
            { x: p.x - 1, y: p.y },
            { x: p.x + 1, y: p.y }
          ];
          return neighbors.some((n) => {
            if (n.x < 0 || n.x >= this.width || n.y < 0 || n.y >= this.height) return false;
            const t = this.getZoneChar(n.x, n.y);
            return t === 'L' || t === 'D';
          });
        });
      }

      // 若还是没找到，就随便挑一堵墙（不论跟什么接壤）
      if (finalDoorSpots.length === 0) {
        finalDoorSpots = zoneWallPoints;
      }

      // 挑一个做门的位置（是随机的，还是居中处理的？）
      // 随机就好。
      const doorPos =
        finalDoorSpots.length > 0
          ? finalDoorSpots[Math.floor(Math.random() * finalDoorSpots.length)]
          : null;

      // 落实相关改动
      zoneWallPoints.forEach((p) => {
        if (doorPos && p.x === doorPos.x && p.y === doorPos.y) {
          // 这是一扇门，故而保持其为代表楼板的 '.' 符号即可（如果我们有特殊贴图的可以设为特殊贴图，但一般开扇的门用 '.' 也可以了）
          // 所以我们要显性地给它清掉这部分遮挡
          this.setTile(p.x, p.y, '.');

          // 标记为保留
          this.reservedCells.add(`${p.x},${p.y}`);

          // 除了门自己是否也要预留房间内的相邻格子？
          // p 的位置就在房间里头（过去是块儿标记着 B 的地砖）。也就是说，原来在内测的这块儿瓦片变成了门？
          // 稍加思索即可知道逻辑是这样的：`zoneWallPoints` 指的是在界内的原装格子集合。
          // 倘若把 `p` 置为 `.`，由于坐标归属，在物理学角度上讲 `p` 依然算落在这个区域的地排上。
          // 可它现在变成了当作门槛的特殊楼板瓦片。
          // 我们绝对没法在 `p` 格子上摆放物件家具。
          // 同理，原则上任何将之阻挡的邻近方格也该是禁区。
          // 那不妨将那些尚处在区内的 p 的左邻右舍同样纳入保留范围之中吧。
          const neighbors = [
            { x: p.x, y: p.y - 1 },
            { x: p.x, y: p.y + 1 },
            { x: p.x - 1, y: p.y },
            { x: p.x + 1, y: p.y }
          ];
          neighbors.forEach((n) => {
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
      { dx: 0, dy: 1 },
      { dx: 0, dy: -1 },
      { dx: 1, dy: 0 },
      { dx: -1, dy: 0 }
    ];

    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        if (visited.has(getKey(x, y))) continue;

        const row = this.layout[y];
        if (!row) continue;
        const char = row[x] as ZoneChar;
        if (char === '#') continue; // 略过墙壁

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

  // --- 特定的填充器 (Populators) ---

  private processWalkways(zones: Zone[]) {
    // 走廊畅通最重要。清理它们。
    zones.forEach((zone) => {
      zone.cells.forEach((cell) => {
        this.setTile(cell.x, cell.y, '.');
      });
    });

    // 处理入口处的通道：必得在最底部坐标上存在作为出口之用的 'E'
    const entrances = zones.filter((z) => z.type === 'E');
    entrances.forEach((zone) => {
      if (zone.cells.length === 0) return;

      // 找出地理位置最靠下的那个格子
      let bottomCell: Point | undefined = zone.cells[0];

      zone.cells.forEach((c) => {
        if (bottomCell && c.y > bottomCell.y) bottomCell = c;
      });

      // 确保出口一定是设立在围墙边上的（即 y 坐标 = 建筑高度 - 1）
      if (bottomCell) {
        const targetY = this.height - 1;
        // 如果底线位置并未贴合至围墙边界，我们将其硬生生下拉拉齐
        if (bottomCell.y < targetY) {
          // 顺便连带着描画一条能够从 bottomCell 连接并贯通奔至 targetY 的路线图
          for (let y = bottomCell.y; y <= targetY; y++) {
            this.setTile(bottomCell.x, y, '.'); // 扫清阻碍
          }
          this.setTile(bottomCell.x, targetY, 'E');
        } else {
          this.setTile(bottomCell.x, bottomCell.y, 'E');
        }
      }
    });
  }

  private processKitchens(zones: Zone[]) {
    zones.forEach((zone) => {
      // 1. 开始时把所有的方格统统标记成了代表着厨房专用的楼板的 ','
      zone.cells.forEach((c) => {
        if (this.getTile(c.x, c.y) !== '#') {
          this.setTile(c.x, c.y, ',');
        }
      });

      // 2. 对边界情况做判定区分
      // "前方方向" = 与餐厅 (D) 或着走廊 (W) 的毗邻交界处
      // "后尾方向" = 背依着墙壁 (#) 或者是其它的方向
      const frontCells: Point[] = [];
      const backCells: Point[] = [];
      const otherCells: Point[] = []; // 内部方向

      zone.cells.forEach((cell) => {
        if (this.getTile(cell.x, cell.y) === '#' || this.reservedCells.has(`${cell.x},${cell.y}`))
          return;

        const neighbors = [
          { x: cell.x, y: cell.y - 1 },
          { x: cell.x, y: cell.y + 1 },
          { x: cell.x - 1, y: cell.y },
          { x: cell.x + 1, y: cell.y }
        ];

        let isFront = false;
        let isBack = false;

        for (const n of neighbors) {
          if (n.x < 0 || n.x >= this.width || n.y < 0 || n.y >= this.height) {
            isBack = true; // 贴近地图边缘等同身在背后深处
            continue;
          }
          const nType = this.getZoneChar(n.x, n.y);
          if (nType === 'D' || nType === 'W' || nType === 'L') {
            isFront = true;
          } else if (nType === '#' || nType !== 'K') {
            // 抑或靠墙，抑或身傍异室身侧边缘（并非是在 K, D, W, L 各式地带里）
            isBack = true;
          }
        }

        if (isFront) frontCells.push(cell);
        else if (isBack) backCells.push(cell);
        else otherCells.push(cell);
      });

      // 3. 于屋门口正对处创立并配制前台营业型操作吧台
      // 这儿须有唯一且必出不二地用得出入口。
      // 难道得从中选取前卫相连内部接壤之区块不成？
      // 无伤大雅，任何能摆放在面朝大众走在最前面的操作台面格块其实全不相误。
      let entrance: Point | undefined;
      if (frontCells.length > 0) {
        // 选择前侧区片最为首当而处于正中心的核心区域格
        entrance = frontCells[Math.floor(frontCells.length / 2)];
        // 要不尝试选区随机分布的模式来排位置呢？相比之下依然是搁在中间位置的话样子最好看。
      }

      // 在所有的临街/走廊一面的那些格块上面安置营业操作柜台 'C'（留一个当通道当门脸）
      frontCells.forEach((p) => {
        if (entrance && p.x === entrance.x && p.y === entrance.y) {
          this.setTile(p.x, p.y, ','); // 给作为入门立足用的空位置保持留出地面的贴图
        } else {
          this.setTile(p.x, p.y, 'C'); // 安置吧台
        }
      });

      // 4. 首先，要在处于厨间靠尽里、面朝墙最里沿位置地带先行按部布设一切应有一系列做菜用品厨具设施 (包括了各类烤炉 O、烹饪调味用作上料台上板用的小桌 S 以及收刷置放废弃残渣破污堆脏池水槽的大海碗处 B)
      // 而对于剩下那些没挨啥干系名为且代称为属于内里的其余格面空子 'otherCells' ，从头到尾的期望和初衷都是能给这部分尽量多腾出留做人员穿梭穿梭穿行的闲余清道空隙过道。

      // 厨房用具优先靠后放置 (Back)
      const backShuffled = [...backCells].sort(() => Math.random() - 0.5);
      const otherShuffled = [...otherCells].sort(() => Math.random() - 0.5);

      // 用户的诉求是摆放 3 个 "置物台" (Counters/Boards) + 小烤箱 + 洗手清理池
      // 'S' = 备用餐台（也可视作货架或柜子类），'B' = 层叠着的大海碗垛（也就等于是水池洗刷区）
      const items = ['O', 'B', 'S', 'S', 'S'];
      items.forEach((item) => {
        if (backShuffled.length > 0) {
          const p = backShuffled.pop()!;
          this.setTile(p.x, p.y, item);
        } else if (otherShuffled.length > 0) {
          const p = otherShuffled.pop()!;
          this.setTile(p.x, p.y, item);
        }
      });

      // 给剩下的没塞东西的靠后 (BACK) 格子内挨个给塞满储物配菜柜台
      // 剩下的其它的网格区 (OTHER cells) 留作过道当纯通行的地板
      backShuffled.forEach((p) => {
        // 是设计成 70% 会长出柜子，还是 30% 的概率留个空地儿呢？
        // 一般来说靠后侧的墙边大都是被满墙的各类摆放厨柜全给占满的。
        if (Math.random() > 0.2) {
          this.setTile(p.x, p.y, 'C');
        }
      });

      // 5. 将玩家出生的生成坐标点打在这儿（指代字母 'P'）
      // 当然啦，位置必得是要处在代指地面方砖的那 ',' 上才成吧
      // 去把这个域段里面的那些 ',' 重新扫摸一遍
      const floorCells = zone.cells.filter((c) => this.getTile(c.x, c.y) === ',');

      if (floorCells.length > 0) {
        // 从偏好上看相比起紧靠屋脚门庭前是更倾向于深一些且里边点儿的内侧地带的吧？
        // 毕竟进门处也不过是一格普普通通的 ',' 嘛。
        // 这儿尽量去筛寻那些并非属于入门处的格子，倘若委实找不到的话，硬用入门那个位置当作出生点当然问题也不大。
        let spawn = floorCells.find((c) => !entrance || c.x !== entrance.x || c.y !== entrance.y);
        if (!spawn) spawn = floorCells[0]; // 退而求其次选在大门口

        if (spawn) {
          this.setTile(spawn.x, spawn.y, 'P');
        }
      }

      // 6. 最终敲定好所有的铺底地面
      // 将依然残余着的任一一个 ',' 给全数更替成真正用于表征且画着后厨图案的那块地砖上去。
      // 且慢打住，按照设想，我们应当继续保留那些原本就是用来象征着它们自己的那个 ',' ，那么到了 IzakayaScene 组件它理所当然就可以依样视这部分如 KITCHEN（厨房区瓷贴） 般来处理了。
      // 具体到 IzakayaScene 代码里，其对应的匹配映射便是: ',' -> TileType.KITCHEN (即后厨贴图)。
      // 有此结论在先，故留着它们的原身那个 ',' 便好，莫去画蛇添足。
      // 千万不必，也绝然不当将它们通通化换为普通的 '.'
    });
  }

  private processDining(zones: Zone[]) {
    zones.forEach((zone) => {
      // 画出地板来（但仍需保留原先建好的墙壁网格设定不动）
      zone.cells.forEach((c) => {
        if (this.getTile(c.x, c.y) !== '#') {
          this.setTile(c.x, c.y, '.');
        }
      });
      // 筛选并排除掉阻挡在前的墙壁部分与已标记好的专属保留方格
      const freeCells = new Set(
        zone.cells
          .filter((c) => this.getTile(c.x, c.y) !== '#' && !this.reservedCells.has(`${c.x},${c.y}`))
          .map((c) => `${c.x},${c.y}`)
      );

      // 依据随机摆样组合打包生成家具算法
      // 1. 理清当前所剩余且有效的点位好给接下来要安排 3x1 亦或 1x3 型体桌台排布腾位置？
      // 曾有用户反映抱怨“桌椅只会跟排个串似的在列里成条线状死板直线布局”。
      // 之前我们的布设规律是借由 x%3==1 并且 y%3==1 这个逻辑进而生成一个横平竖直规整状的网格位出来。
      // 不妨去切使用一个更倾向自然跟随机化一些的方案：
      // 即选取一个作为锚点的随机点位格。由该点出发向周遭检验探索究竟其尺寸容不容得下去搁置一组单桌(T)及众椅(h)。
      // 有关座椅具体的样型规范为: 水平方向的话，(x-1,y) 为 h，正中 (x,y) 置 T，另外一头 (x+1,y) 亦为 h -> 合计长达为一整条 3x1 水平方块结构。
      // 要不然则是垂直放置法：(x,y-1) 丢着 h，(x,y) 被 T 所占据，余下的尾部 (x,y+1) 仍是 h -> 构成一列高有 1x3 的垂直型纵向竖长形块堆。

      // 试图尽量在塞入多组套件的同时多生出些具有随机变数的样式分布。

      const attempts = zone.cells.length * 2;
      for (let i = 0; i < attempts; i++) {
        if (freeCells.size < 3) break;

        // 随机由空闲格子 (freeCells) 集中抽选位置
        const keys = Array.from(freeCells);
        const randomKey = keys[Math.floor(Math.random() * keys.length)];
        if (!randomKey) continue;

        const parts = randomKey.split(',').map(Number);
        const cx = parts[0];
        const cy = parts[1];
        if (cx === undefined || cy === undefined) continue;

        // 完全随性且无规律地决出当前桌椅究竟是个啥走势：要么横向 (0) 要不就竖向 (1)
        const isHorizontal = Math.random() > 0.5;

        let fits = false;
        let occupied: Point[] = [];

        if (isHorizontal) {
          // 确认有无左边空间 (座椅使用)，正中空间 (给个方桌用) 以及右边空间 (也是座椅使用)
          // 即 (x-1, y), (x, y), (x+1, y)
          const p1 = { x: cx - 1, y: cy };
          const p2 = { x: cx, y: cy };
          const p3 = { x: cx + 1, y: cy };

          if (
            freeCells.has(`${p1.x},${p1.y}`) &&
            freeCells.has(`${p2.x},${p2.y}`) &&
            freeCells.has(`${p3.x},${p3.y}`)
          ) {
            fits = true;
            occupied = [p1, p2, p3];
          }
        } else {
          // 确认有无顶部空间 (座椅使用)，正中空间 (给个方桌用) 以及底部空间 (也是座椅使用)
          const p1 = { x: cx, y: cy - 1 };
          const p2 = { x: cx, y: cy };
          const p3 = { x: cx, y: cy + 1 };

          if (
            freeCells.has(`${p1.x},${p1.y}`) &&
            freeCells.has(`${p2.x},${p2.y}`) &&
            freeCells.has(`${p3.x},${p3.y}`)
          ) {
            fits = true;
            occupied = [p1, p2, p3];
          }
        }

        if (fits) {
          // 要复检确认有无留够宽松间距与缝边吗？还是得保障玩家没被封堵得完完全全过不去身才行对吧？
          // 必须知道一点，目前的 'freeCells' 全集完全就仅仅只包含并且局限在区区代表着餐厅区的 'D' 区划范围之内而已。
          // 真要想往远处去那是得离开这一区域才能到的另外一片标记有 'W' 身名用来当过隙通道那里的事儿了。
          // 尽管言之于理但其实还是该在挨靠在一起的两丛不同组别的方桌和方桌的当中稍微间隔那么一点缝儿隙留走人的对不对呀？
          // 假设把几组成打呈 3x1 结构模式分布放置好的各块实体以过于挤挨着的方式排列在一处的话，真要玩家操控个纸片子人物想从两堵甚至好几堵互近挨靠的这群庞然巨物的死边空当中插空穿越，是不成想真真是不太容易甚至是毫无可能的事情了。
          // 既然话说到这了我们就得先查看看与这组即将占用了地盘被塞作大物件所在的附近到底有没几格闲散空白能让通行的人稍作腾挪走位的余地（也即空且自由之身）。
          // 我们真该给要准备置下的桌凳外边强行画规定个为期环周长达为 1 单位格长并被包裹上这一外边延范围缓冲空挡护圈界域不可是吧？
          // 不然大体上也就尽保自己没有贪多滥全全给霸掉填完*所有*可用立足点这事而已就算是了结了？

          // 以一种颇为纯简单的缓冲带监测排查思路如下：
          // 就看它身侧周围四邻的这些单元小格里有没有哪个老早在此之前就已变作家具摆放在那不能够被挪动了去？
          // 要说再放宽条条框框的话要不要就定在只要能让这一四四周边任留单面留缺给开有活通的口就算它是妥的行的通了呢？

          // 暂时不去设想太多先行把物件落到这位置再说吧，等摆上看是不是着实挤得压抑憋屈了再另论它。
          // 打消并克服“呆板的一条线死站”这种情况，有其生成布置物件时朝向上本身有随机倒换变动机制的干预就能帮起很大的改观忙了。

          // 着落物件
          // 最中间那点置放 T (中桌)
          if (occupied[1] && occupied[0] && occupied[2]) {
            this.setTile(occupied[1].x, occupied[1].y, 'T');
            // 余下他者皆全给安排当成用来坐这桌的人要使得座椅 h
            this.setTile(occupied[0].x, occupied[0].y, 'h');
            this.setTile(occupied[2].x, occupied[2].y, 'h');
          }

          // 将其所占据的几块地表彻底自从那标榜空旷供以调用候选的地板 (freeCells) 名单花名中予给永久除名撤籍去号
          occupied.forEach((p) => freeCells.delete(`${p.x},${p.y}`));

          // 说起来又没可能还要把以他们身占为核作为锚点周边再向外延伸出去成对角线向的，抑或干干脆脆是连带着正抵着他旁沿所贴相邻着的些边角地同样都一同剔出去从而制造出一种颇感开阔宽裕能称作予人以“留得三分好供能作喘息挪移通达宽带”（breathing room）意象氛围感来的做派举措手段？
          // 当真若置之以毫不作为袖手一旁去不管他的话，不出意外地过会儿肯定就有一溜群的桌具会挨头挨腚直接怼紧贴实撞到块了的。
          // 让咱们也顺道将那邻在桌台身旁处的这一群单格子连并着一同全部驱逐勒令在 freeCells 外，索性借助此这强取直接的霸蛮径直干预做法给外拉制造生成有能用来透气做间距使得距离段吧。
          occupied.forEach((p) => {
            [
              { x: p.x + 1, y: p.y },
              { x: p.x - 1, y: p.y },
              { x: p.x, y: p.y + 1 },
              { x: p.x, y: p.y - 1 }
            ].forEach((n) => freeCells.delete(`${n.x},${n.y}`));
          });
        }
      }
    });
  }

  private processLiving(zones: Zone[]) {
    zones.forEach((zone) => {
      zone.cells.forEach((c) => {
        if (this.getTile(c.x, c.y) !== '#') {
          this.setTile(c.x, c.y, '.');
        }
      });

      // 将诸如各类墙壁以及已经被划归保留给别的功用去的专属单元格过滤掉
      const freeCells = new Set(
        zone.cells
          .filter((c) => this.getTile(c.x, c.y) !== '#' && !this.reservedCells.has(`${c.x},${c.y}`))
          .map((c) => `${c.x},${c.y}`)
      );

      // 从数组中获取随机条目的辅辅类操作帮助器
      const pickRandom = <T>(arr: T[]): T | undefined =>
        arr.length > 0 ? arr[Math.floor(Math.random() * arr.length)] : undefined;

      // --- 关于卧室方面的布置逻辑处理 (B) ---
      if (zone.type === 'B') {
        // 用于敲定此当间所拥有需塞配密集的数量和稠密度
        // 收到玩家使用反馈中表达出的热切盼望和请愿：每个房间有且只供唯一一张可供歇脚做息用的睡床（床）。
        const bedCount = 1;
        // if (zoneSize > 30) bedCount = Math.floor(zoneSize / 15); // 鉴于采纳结合到了广大众位热心游戏用户使用过后所反映上报而来那些关于此的殷切意见故此暂切这相关一切内容给关停禁用之

        // 1. 去将那些 (长着标以呈现横纵成出个长宽拥有 2x3 这般厚硕特大体量的) 软床置备其道给安排其上。
        // 立马找出并寻觅得出这全部任何一个具备并且又符合有其拥有着空载出片达且且具备 2x3 尺段的合格良可用绝佳好穴的空位
        const bedCandidates: Point[] = [];
        for (const cell of zone.cells) {
          // 核查比对下这个玩意它现当这会里外究竟有没有真长到墙壁里边儿去（别忘了此前可着实在 'B' 划定的卧铺内部这生成造了许许多多的多处隔墙来着！）
          if (this.getTile(cell.x, cell.y) === '#') continue;

          let fits = true;
          // 对由 2x3 圈出来大小的领域片区仔细检查探查其安全状态
          for (let dy = 0; dy < 3; dy++) {
            for (let dx = 0; dx < 2; dx++) {
              const tx = cell.x + dx;
              const ty = cell.y + dy;
              // 检查有无破界超出框外或不适出空域边缘（再加一条必须确保这里不得是存在一堵墙死死怼立于此）
              if (!freeCells.has(`${tx},${ty}`) || this.getTile(tx, ty) === '#') {
                fits = false;
                break;
              }
            }
            if (!fits) break;
          }
          if (fits) bedCandidates.push(cell);
        }

        // 安排放置出多张的睡铺大床
        for (let i = 0; i < bedCount; i++) {
          if (bedCandidates.length === 0) break;
          const idx = Math.floor(Math.random() * bedCandidates.length);
          const bedPos = bedCandidates[idx];
          bedCandidates.splice(idx, 1); // 抹除已被应用且消耗掉的项目

          if (!bedPos) continue;

          // 重新检测和确证到底是否当真合规有效（谨防说不定它俩可能就会与就在刚头上那会子所安放过去的卧具撞车互叠到了一块儿重叠了去）
          // 本质而言，我们确乎该即时并立即马上就把更新变化写入进空置格子 (freeCells) 状态量库中去才对
          // 只奈何那些备受后选的各个位点本为就是在此发生之早就已被提早提前结算统算好罗列过的了。
          // 还是由重温复核一次当前预备地点的空量有无这法子来得更牢靠一些。
          let stillFits = true;
          for (let dy = 0; dy < 3; dy++) {
            for (let dx = 0; dx < 2; dx++) {
              if (!freeCells.has(`${bedPos.x + dx},${bedPos.y + dy}`)) stillFits = false;
            }
          }

          if (stillFits) {
            this.setTile(bedPos.x, bedPos.y, 'b');
            for (let dy = 0; dy < 3; dy++) {
              for (let dx = 0; dx < 2; dx++) {
                freeCells.delete(`${bedPos.x + dx},${bedPos.y + dy}`);
              }
            }
          } else {
            i--; // 重试？亦或是直接略放过？
          }
        }

        // 2. 置放用于陈设作饰的散杂件等（各式灯具，典籍经捆卷等等）
        // 布设占据所预期的装填所及比率：试图且努力为在空闲所余无多所能有的大部分面积上约计填充进将近占比为总量上十分之一的装饰物
        // 玩家们的反馈需求：保证单在每个房间配置供给给独单一的一份孤零摆件/壁灯即可作罢。
        const decorationCount = 1; // Math.ceil(freeCells.size * 0.1);

        for (let i = 0; i < decorationCount; i++) {
          // 试着安上一款落地灯座 (1x2)
          const lampCandidates: Point[] = [];
          for (const cell of zone.cells) {
            if (!freeCells.has(`${cell.x},${cell.y}`) || this.getTile(cell.x, cell.y) === '#')
              continue;
            const below = { x: cell.x, y: cell.y + 1 };
            if (freeCells.has(`${below.x},${below.y}`) && this.getTile(below.x, below.y) !== '#') {
              lampCandidates.push(cell);
            }
          }
          const lampPos = pickRandom(lampCandidates);
          if (lampPos) {
            const below = { x: lampPos.x, y: lampPos.y + 1 };
            this.setTile(lampPos.x, lampPos.y, 'l'); // 花灯
            freeCells.delete(`${lampPos.x},${lampPos.y}`);
            freeCells.delete(`${below.x},${below.y}`);
          }
        }
      }

      // --- 关于休闲大厅及室内休息等各杂功能区的处理安排逻辑 (L) ---
      if (zone.type === 'L') {
        // 占据比及密度设定项: 已经刻意做过缩减削减调整以免除出现陈滥而杂凑满堆的乱象
        const zoneSize = freeCells.size;
        const sofaTarget = Math.min(4, Math.ceil(zoneSize * 0.08)); // 至多满载不超过封顶 4 排单排宽软靠背长椅沙发的上限份额
        const bookTarget = Math.min(3, Math.ceil(zoneSize * 0.05)); // 封顶不许过 3 书架柜子

        // 1. 设置配备上舒软的休息皮座躺椅 (1x2) - 标记字码：'s'
        for (let i = 0; i < sofaTarget; i++) {
          const sofaCandidates: Point[] = [];
          for (const cell of zone.cells) {
            if (!freeCells.has(`${cell.x},${cell.y}`) || this.getTile(cell.x, cell.y) === '#')
              continue;
            const right = { x: cell.x + 1, y: cell.y };
            if (freeCells.has(`${right.x},${right.y}`) && this.getTile(right.x, right.y) !== '#') {
              sofaCandidates.push(cell);
            }
          }
          const sofaPos = pickRandom(sofaCandidates);
          if (sofaPos) {
            const right = { x: sofaPos.x + 1, y: sofaPos.y };
            this.setTile(sofaPos.x, sofaPos.y, 's');
            freeCells.delete(`${sofaPos.x},${sofaPos.y}`);
            freeCells.delete(`${right.x},${right.y}`);
          } else break;
        }

        // 2. 阅读用的各式大量经集杂书藉册子堆 (1x2) - 标记字码：'k'
        for (let i = 0; i < bookTarget; i++) {
          const bookCandidates: Point[] = [];
          for (const cell of zone.cells) {
            if (!freeCells.has(`${cell.x},${cell.y}`) || this.getTile(cell.x, cell.y) === '#')
              continue;
            const below = { x: cell.x, y: cell.y + 1 };
            if (freeCells.has(`${below.x},${below.y}`) && this.getTile(below.x, below.y) !== '#') {
              bookCandidates.push(cell);
            }
          }
          const bookPos = pickRandom(bookCandidates);
          if (bookPos) {
            const below = { x: bookPos.x, y: bookPos.y + 1 };
            this.setTile(bookPos.x, bookPos.y, 'k'); // 书籍
            freeCells.delete(`${bookPos.x},${bookPos.y}`);
            freeCells.delete(`${below.x},${below.y}`);
          } else break;
        }
      }
    });
  }

  private processRestroom(zones: Zone[]) {
    zones.forEach((zone) => {
      // 将此标记成地板样式
      zone.cells.forEach((c) => {
        if (this.getTile(c.x, c.y) !== '#') {
          this.setTile(c.x, c.y, '.');
        }
      });
      // 筛选并排除掉墙壁与保留下来的特殊单元格
      const freeCells = new Set(
        zone.cells
          .filter((c) => this.getTile(c.x, c.y) !== '#' && !this.reservedCells.has(`${c.x},${c.y}`))
          .map((c) => `${c.x},${c.y}`)
      );

      // 断定空间排布的拥挤或空疏度
      // 每号隔间至多满封上限只能放置不超 1 只的抽水马桶
      const toiletTarget = 1;
      const sinkTarget = 1;

      // 1. 马桶 (1x1) - 't'
      // 比较中意且多半偏爱选用处在犄角旮旯之位的角落处亦或是说那种深藏且缩闭的 "深壁里口" 处（一般指距离那些走动最繁多的入口门面处或者说中心大区这些位置隔去最为偏远且深幽难至的边远地带去）
      // 经验之谈外加试探直觉：更偏好被摆放在位于偏坐整个地图坐标系里的右上、左上两大死角亦或是整个北靠最贴近顶部壁岩上。
      // 何故由此一说？由于屋门的设计寻常都是处在一个房间的下方位面或者两旁侧方处啦。

      // 计算得来这一个房间区域的形心位置所在点 (Centroid)
      let cx = 0,
        cy = 0;
      if (zone.cells.length > 0) {
        zone.cells.forEach((c) => {
          cx += c.x;
          cy += c.y;
        });
        cx /= zone.cells.length;
        cy /= zone.cells.length;
      }

      for (let i = 0; i < toiletTarget; i++) {
        // 筛选可用以摆放的预备地点候选区域（需得保证这是同墙壁相挨着的）
        // 以它自其室内的几何中心店所间隔产生的距差作为基准进行大体排序（越偏离就越好 -> 此谓之愈靠最深处也即是所谓的 "在最最里面的位置" ）
        // 也要注意连带着探摸顺便数一下临四向的边界边上共有得着几堵砖壁（身兼占据死角特征的话=周侧必然盘有 2 面之壁，如果只挨普通墙边的话则等价=单边生 1 壁）

        const candidates: { p: Point; score: number }[] = [];

        for (const cell of zone.cells) {
          if (freeCells.has(`${cell.x},${cell.y}`) && this.getTile(cell.x, cell.y) !== '#') {
            const neighbors = [
              { x: cell.x, y: cell.y - 1 },
              { x: cell.x, y: cell.y + 1 },
              { x: cell.x - 1, y: cell.y },
              { x: cell.x + 1, y: cell.y }
            ];
            const wallCount = neighbors.filter((n) => this.getTile(n.x, n.y) === '#').length;

            if (wallCount > 0) {
              // 给分：取值自偏置原中心点距加乘额外靠拢紧贴墙体项作为加成得分（Wall Bonus）
              const dist = Math.sqrt(Math.pow(cell.x - cx, 2) + Math.pow(cell.y - cy, 2));
              const score = dist + wallCount * 2; // 抬高角落处的优先位权重分
              candidates.push({ p: cell, score });
            }
          }
        }

        // 给分项以至高向低层层降序的方式给排列统筹起来
        candidates.sort((a, b) => b.score - a.score);

        // 钦取定下最优解
        if (candidates.length > 0) {
          const best = candidates[0];
          if (best && best.p) {
            this.setTile(best.p.x, best.p.y, 't');
            freeCells.delete(`${best.p.x},${best.p.y}`);
          }
        }
      }

      // 2. 漱洗槽 (1x1) - 被特别冠以 'w' 代称 (取自首词 wash)
      for (let i = 0; i < sinkTarget; i++) {
        const candidates: Point[] = [];
        for (const cell of zone.cells) {
          if (freeCells.has(`${cell.x},${cell.y}`) && this.getTile(cell.x, cell.y) !== '#')
            candidates.push(cell);
        }
        if (candidates.length > 0) {
          const pos = candidates[Math.floor(Math.random() * candidates.length)];
          if (pos) {
            this.setTile(pos.x, pos.y, 'w');
            freeCells.delete(`${pos.x},${pos.y}`);
          }
        } else break;
      }

      // 3. 一面妆奁立镜（贴生并装在面墙的瓷面上面） - 代以此意指作为代码表示形式的字母：'M'
      // 探索那些依附接壤处于现所经手片区段的一路挨边土墙内侧面处（或者也有可能是由过去室内区间后生转化修起的那类室内隔断墙段上面）
      // 若能按理最完善而言，应当理所应当是摆落在那洗水池上台对不？
      // 也或者只是随意一堵皆可以便成了。
      // 行，那就姑且先去搜探周近环伺在这一个个水池位水龙头台前的这些左右贴墙点好了。
      const sinkCells = zone.cells.filter((c) => this.getTile(c.x, c.y) === 'w');

      sinkCells.forEach((sink) => {
        // 向它的四邻开始探查摸索看哪儿长有墙（自然是靠向上头的方位放长镜最好）
        const up = { x: sink.x, y: sink.y - 1 };
        if (this.getTile(up.x, up.y) === '#') {
          this.setTile(up.x, up.y, 'M'); // 给墙挂面大镜子
        } else {
          // 看看其余方向上的面壁处如何？
          const neighbors = [
            { x: sink.x - 1, y: sink.y },
            { x: sink.x + 1, y: sink.y }
          ];
          for (const n of neighbors) {
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
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        if (this.resultMap[y]?.[x] === 'E') hasExit = true;
      }
    }

    if (!hasExit) {
      const midX = Math.floor(this.width / 2);
      this.setTile(midX, this.height - 1, 'E');
    }
  }

  private decorateWalls() {
    // 装潢点缀在顶部跟底部的那些上下的边缘墙
    for (const y of [0, this.height - 1]) {
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

    // 装点那些左右两侧面上的边沿墙壁段
    for (const x of [0, this.width - 1]) {
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

  private placeWindowOnSegment(
    start: number,
    end: number,
    fixed: number,
    orientation: 'horizontal' | 'vertical'
  ) {
    const length = end - start + 1;
    // 要想叫安装出来的窗户好看没毛病，就得起步要求最低有一段起码撑过长度为 3 以上的一段（两旁带缓留空白边沿区段留空隙用）
    if (length < 3) return;

    // 有放置出现窗户的概率控制开关
    if (Math.random() < 0.3) return; // 定下了 70% 的机会会生出有开窗现象？抑或者算它作高达了 30% 概率会给无视忽略掉？之前是有定夺要求明言规定讲出“单墙最多只出一位（扇）”。
    // 下面将就假如此墙足够可长，咱们就老是试着要安上去装开一个好啦（除非走运随机撞彩免遭忽略了）。

    // 随机钦点选个给打上开窗建窗孔的好地方地段
    // 这个窗宽大小究竟该裁成 1x2 (作竖状垂直样) 又或者是裁制它为个 2x1 (作横形水平样)的呢？
    // 原来曾被交托明要讲这“新窗规格变更改为打底用 1x2 的身长”。
    // 但通常普遍来说常理下的长窗它大都是那种设建在横墙上是属于有 2x1（宽宽大大的那种），至于生立贴边竖墙头上的多为 1x2（挑高颀长那样大高个的）。
    // 按默认常理下的一般行事定夺也算不出了啥乱子差池了。

    const windowSize = orientation === 'horizontal' ? 2 : 2; // 沿此线延伸过去定宽长度
    // 且慢，如若其方位导向是垂直朝向的（此时固定横轴死死锁住住身为定子），那窗的纵生面定占去了 Y 上横跨的连续两格格距身量。
    // 如若其作水平朝向上时（彼时 Y 轴固实不变做不变量看的话），此窗定占去了位列 X 行轴上接跨过去地连续双块长度不成？
    // 难不成定口一开所言死认其 1x2 莫不是变相在作暗示隐语不论如何一切尽数以死作竖向窗看待来排划不成么？底边横出的玻璃推窗再怎样说来那往往大面大多像似宽开连展的大面透亮明通长铺开一长段或是连续着二三连接通长的开裂面玻璃段的对吧。
    // 就按 'W' 当瓦拼接着来解算了。

    if (length < windowSize) return;

    // 容此腾挪落户活动施展之开度范辖长域段: 打是从头开头首起... 直到终止结末位点 - 去却被此物吞走之宽占比身形长数外加填补贴的宽补偿回那个 + 1
    const maxPos = end - windowSize + 1;
    const pos = Math.floor(Math.random() * (maxPos - start + 1)) + start;

    if (orientation === 'horizontal') {
      // 于身在 (pos, fixed 固定位不变下) 和其兄弟坐标 (pos+1, fixed) 点处置立安建生成
      this.setTile(pos, fixed, 'W');
      this.setTile(pos + 1, fixed, 'W');
    } else {
      // 于身在 (fixed 固死点上不动, pos) 和相下顺延的点 (fixed, pos+1) 做安设布置
      this.setTile(fixed, pos, 'W');
      this.setTile(fixed, pos + 1, 'W');
    }
  }

  // --- 各种功能实用辅助处理与帮忙类 (Helpers) ---

  private getZoneChar(x: number, y: number): string {
    if (x >= 0 && x < this.width && y >= 0 && y < this.height) {
      const row = this.layout[y];
      if (row) {
        return row[x] || '#';
      }
    }
    return '#'; // 出了外围边界都算是界外之墙
  }

  private isInZone(x: number, y: number, zone: Zone): boolean {
    return zone.cells.some((c) => c.x === x && c.y === y);
  }
}
