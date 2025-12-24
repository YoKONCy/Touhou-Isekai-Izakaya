export interface TileSlice {
    canvas: HTMLCanvasElement; // 预渲染的切片
    ctx: CanvasRenderingContext2D;
}

export interface TileSet {
    id: string;
    source: HTMLImageElement;
    slices: TileSlice[]; // 0-8 flat array
    gridSize: number; // e.g. 48px
}

export class TextureManager {
    private static instance: TextureManager;
    private tileSets: Map<string, TileSet> = new Map();
    private loadingPromises: Map<string, Promise<TileSet>> = new Map();

    private constructor() {}

    public static getInstance(): TextureManager {
        if (!TextureManager.instance) {
            TextureManager.instance = new TextureManager();
        }
        return TextureManager.instance;
    }

    /**
     * 加载并切分图集
     * @param id 资源ID (e.g. 'test_tileset')
     * @param url 图片路径 (必须提供)
     * @param gridSize 目标网格大小 (游戏内的瓦片大小，如 48)
     * @param spacing 瓦片之间的间隙 (像素)
     * @param margin 图片外围的边距 (像素)
     * @param rows 行数 (默认 3)
     * @param cols 列数 (默认 3)
     * @param innerBleed 边缘收缩像素 (默认 0)
     */
    public async loadTileSet(
        id: string, 
        url: string, 
        gridSize: number = 48, 
        spacing: number = 0, 
        margin: number = 0,
        rows: number = 3,
        cols: number = 3,
        innerBleed: number = 0
    ): Promise<TileSet> {
        if (this.tileSets.has(id)) {
            return this.tileSets.get(id)!;
        }

        if (this.loadingPromises.has(id)) {
            return this.loadingPromises.get(id)!;
        }

        const promise = new Promise<TileSet>((resolve, reject) => {
            const img = new Image();
            img.src = url;
            img.onload = () => {
                const slices = this.sliceImage(img, rows, cols, gridSize, spacing, margin, innerBleed);
                const tileSet: TileSet = {
                    id,
                    source: img,
                    slices,
                    gridSize
                };
                this.tileSets.set(id, tileSet);
                this.loadingPromises.delete(id);
                console.log(`[TextureManager] Loaded tileset: ${id} (${rows}x${cols}) with innerBleed: ${innerBleed}`);
                resolve(tileSet);
            };
            img.onerror = (e) => {
                this.loadingPromises.delete(id);
                console.error(`[TextureManager] Failed to load tileset: ${url}`, e);
                reject(e);
            };
        });

        this.loadingPromises.set(id, promise);
        return promise;
    }

    /**
     * 将大图切分为小块
     * @param img 图片
     * @param rows 行数
     * @param cols 列数
     * @param targetSize 目标瓦片大小
     * @param spacing 瓦片间的间隙
     * @param margin 外边距
     * @param innerBleed 边缘收缩像素 (用于消除 AI 生成素材的接缝绿边)
     */
    private sliceImage(
        img: HTMLImageElement, 
        rows: number, 
        cols: number, 
        targetSize: number, 
        spacing: number, 
        margin: number,
        innerBleed: number = 0
    ): TileSlice[] {
        const slices: TileSlice[] = [];
        // 计算原始每个单元格的大小
        const srcW = (img.width - 2 * margin - (cols - 1) * spacing) / cols;
        const srcH = (img.height - 2 * margin - (rows - 1) * spacing) / rows;

        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const canvas = document.createElement('canvas');
                canvas.width = targetSize;
                canvas.height = targetSize;
                const ctx = canvas.getContext('2d', { alpha: true })!;
                
                ctx.imageSmoothingEnabled = false;

                // 核心改动：应用 innerBleed。
                // 我们从原始区域的中心向内收缩 innerBleed 个像素，以剔除可能存在的绿边。
                const sx = margin + c * (srcW + spacing) + innerBleed;
                const sy = margin + r * (srcH + spacing) + innerBleed;
                const sW = srcW - 2 * innerBleed;
                const sH = srcH - 2 * innerBleed;

                ctx.drawImage(
                    img, 
                    sx, sy, sW, sH, 
                    0, 0, targetSize, targetSize
                );
                
                slices.push({ canvas, ctx });
            }
        }
        return slices;
    }

    public getTileSet(id: string): TileSet | undefined {
        return this.tileSets.get(id);
    }
    
    /**
     * 获取指定索引的切片
     * @param id 图集ID
     * @param index 0-8
     */
    public getSlice(id: string, index: number): HTMLCanvasElement | null {
        const set = this.tileSets.get(id);
        if (!set || !set.slices[index]) return null;
        return set.slices[index].canvas;
    }
}
