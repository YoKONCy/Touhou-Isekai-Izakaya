import { dbService } from '@/services/DatabaseService';
import _ from 'lodash';

// 图结构定义
export interface GraphNode {
  id: number; // 记忆体 ID
  energy: number; // 激活能量
  type: string; // '事件(event)' | '设施(facility)' | '同盟(alliance)' | '情报(intelligence)'
  baseImportance: number; // 基础重要度
}

export interface GraphEdge {
  targetId: number;
  weight: number;
  type: string;
}

// PEDSA 算法（并行能量衰减扩散激活算法）配置
export const PEDSA_CONFIG = {
  decayRate: 0.6, // 每次扩散迭代时衰减的能量比例 (0.0 - 1.0)
  activationThreshold: 0.05, // 节点保持活跃并继续扩散的最低能量阈值
  maxSteps: 3, // 最大扩散深度寻路步数
  maxFanOut: 10 // 每个节点允许遍历的最大边数（为防止图谱爆炸式扩散）
};

/**
 * 记忆图谱服务 (MemoryGraphService) 
 * PeroCore 核心功能 PEDSA 引擎（并行能量衰减扩散激活）在 TypeScript 端的高性能实现。
 */
export class MemoryGraphService {
  // 内存级别的图谱缓存服务（邻接表）
  // 键: 源记忆 ID, 值: 边列表

  private adjacencyList: Map<number, GraphEdge[]> = new Map();
  private isInitialized = false;
  private currentSaveSlotId: number | null = null;

  async ensureInitialized(saveSlotId: number) {
    if (!this.isInitialized || this.currentSaveSlotId !== saveSlotId) {
      await this.loadGraph(saveSlotId);
      this.currentSaveSlotId = saveSlotId;
    }
  }

  /**
   * 将整个记忆图谱从 SQLite 中全量加载至内存中以实现极速遍历访问。
   * 此方法应当在于游戏启动或当切换载入一个新的存档档位（save slot）时被调用。
   */
  async loadGraph(saveSlotId: number) {
    console.time('GraphLoad');
    this.adjacencyList.clear();

    try {
      const relations = await dbService.getAllMemoryRelations(saveSlotId);

      relations.forEach((rel: any) => {
        if (!this.adjacencyList.has(rel.source_id)) {
          this.adjacencyList.set(rel.source_id, []);
        }

        // 注入图谱连线边
        this.adjacencyList.get(rel.source_id)?.push({
          targetId: rel.target_id,
          weight: rel.strength,
          type: rel.rel_type
        });

        // 虽然对于“联想”来说它通常应该是一个无向图的概念（大部分时候），
        // 且对于某些特殊关系类型我们可能也期望建立双向关联。
        // 但目前我们仅严格遵循并依赖数据库中明确保存的那一份显式边关系来进行链接操作即可。
        // （注：在 PeroCore 底层里，常常会默认把这种 'associative' 视为相互的双向绑定）。

        // 有关 'sequence'（代表着串联时间序列的上一条与下一条），它是具有明确的有向性质的。
        // 而对于 'entity'类型来说（表示从 记忆体 -> 提取实体对象），如果我们把实体对象也作为图里的一个节点看待的话……
        // 等一下，在这里由于我们建立图时所有的节点全都是“记忆体”类型，
        // 实体在这里扮演的角色仅仅属于隐含或隐式的“锚点”罢了。
        // 原则上来讲，就算 记忆A 以及 记忆B 都双双跟 "灵梦" 扯上了干系而关联在了一块，这也不代表它们自身两者之间就会因此自动关联上对不对？
        // 除非我们以后在此基础中引入所谓的“虚拟节点”并拿其用来直接代表具体实体对象本身？

        // 简化的初步落实方案（V1 版）：图网里目前仅留存只收录身为具体业务实体的“记忆段落”充当唯一有效节点。
        // 当下的关联边全部指向并代指记忆与记忆两者之间的直通链接路线。
      });

      this.isInitialized = true;
      console.log(`[MemoryGraph] 图谱加载完成，共承载 ${this.adjacencyList.size} 个节点。`);
    } catch (e) {
      console.error('[MemoryGraph] 图谱加载失败:', e);
    }
    console.timeEnd('GraphLoad');
  }

  /**
   * 用于在运行阶段做状态图热更的动态接驳线挂载（譬如在刚添加好一段全新出炉的新记忆段落事件之后）
   */
  addConnection(sourceId: number, targetId: number, weight: number, type: string) {
    if (!this.adjacencyList.has(sourceId)) {
      this.adjacencyList.set(sourceId, []);
    }
    this.adjacencyList.get(sourceId)?.push({ targetId, weight, type });
  }

  /**
   * 核心能量衰减扩散激活触发算法 (The Core Spreading Activation Algorithm)
   * @param startNodes 用以充作图核启起之最初动能的初始激活源区节点： Map映射<记忆源主ID -> 开场赋予它的基础能量>
   */
  spreadActivation(startNodes: Map<number, number>): Map<number, number> {
    if (!this.isInitialized) {
      console.warn('[MemoryGraph] 警告：底层关联图谱未初始化，正对一张空图运行检索！');
      return new Map();
    }

    let currentActivations = new Map<number, number>(startNodes);
    const finalActivations = new Map<number, number>(startNodes);

    for (let step = 0; step < PEDSA_CONFIG.maxSteps; step++) {
      const nextActivations = new Map<number, number>();

      // 遍历所有当前仍处于活跃充能状态的节点
      for (const [sourceId, energy] of currentActivations.entries()) {
        if (energy < PEDSA_CONFIG.activationThreshold) continue;

        const edges = this.adjacencyList.get(sourceId) || [];

        // 将关联边依据权重做高低顺序排序，以在触及拓展数量上限时能永远优先维系最具影响和紧密关联的那条线段关系 (上限阈值: Fan-out limit)
        // 优化项记录：若在一张真正极其庞大的网络结构下，应当将图边在平时做持久缓存时就先行去排序整理完好才对。
        const activeEdges = edges
          .sort((a, b) => b.weight - a.weight)
          .slice(0, PEDSA_CONFIG.maxFanOut);

        for (const edge of activeEdges) {
          // 下发传递推散并计算导射出去的部分能量波段份额
          // 传递给下家的能量计算 E_target =  E_source (原家所载全动能) * 线距连接紧密程度权值 (Weight) * 会由于每跳多走一步路而带来相应损耗影响打折扣的衰萎率折损率常量 (Decay)
          const propagatedEnergy = energy * edge.weight * PEDSA_CONFIG.decayRate;

          if (propagatedEnergy > PEDSA_CONFIG.activationThreshold) {
            // 归入汇聚接吸附能量入定
            const currentEnergy = nextActivations.get(edge.targetId) || 0;
            const existingFinalEnergy = finalActivations.get(edge.targetId) || 0;

            // 究竟该像 Softmax 一样搞个总上限蓄集还是直截获取个两者间之最大上限值呢 (Max)?
            // 依据 PeroCore 本家作风一般走的是通过持续往里叠加累算汇拢、并对其做强制打断卡死锁定阈值在 1.0 的行径路线。
            // 在此为了简单与不出岔乱防能量暴走无尽头起见，这里大可拿取极值 max 当标底，抑或是以一种被钝化兼削弱了的简单和差加来算拢之。
            const newEnergy = currentEnergy + propagatedEnergy;

            nextActivations.set(edge.targetId, newEnergy);

            // 让归置留底的终端结果地图表集里也更新入相关信息进度状态（保留看到过有最高充能级度的数据又或是干脆直接将每一次经过传推而来到手这部分散碎游离态浮光散能皆一一通收入并加以归总记积在内？）
            // 答案理所自然是要将其汇总记录纳入进代表极终大果的一张终落表中啦，借此也好去接捕捉下那些由于经过多条不一关联路途辗转向前进而使得同一个结点历经复式冲灌反倒最终给叠满催高出多重厚实强化光环效力的关联情景呈现。
            finalActivations.set(edge.targetId, existingFinalEnergy + propagatedEnergy);
          }
        }
      }

      // 给即将启转运作之下一步波次运转流做清场换代铺设整配下工作预留
      currentActivations = nextActivations;

      // 但是倘在流转推涌路演的中途中，出现再没发现还留哪一节点头上还抱残留顶带着活跃级能数时，它即可便提前自行退避休止停截该循坏
      if (currentActivations.size === 0) break;
    }

    return finalActivations;
  }
}

export const memoryGraph = new MemoryGraphService();
