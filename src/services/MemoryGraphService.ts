import { dbService } from '@/services/DatabaseService';
import _ from 'lodash';

// Graph Definitions
export interface GraphNode {
  id: number; // Memory ID
  energy: number;
  type: string; // 'event' | 'facility' | 'alliance' | 'intelligence'
  baseImportance: number;
}

export interface GraphEdge {
  targetId: number;
  weight: number;
  type: string;
}

// Configuration for PEDSA Algorithm
export const PEDSA_CONFIG = {
  decayRate: 0.6, // How much energy is lost per step (0.0 - 1.0)
  activationThreshold: 0.05, // Minimum energy to keep propagating
  maxSteps: 3, // Maximum propagation depth
  maxFanOut: 10 // Max edges to traverse per node (to prevent explosion)
};

/**
 * MemoryGraphService - TypeScript implementation of PeroCore's PEDSA Engine
 * (Parallel Energy-Decay Spreading Activation)
 */
export class MemoryGraphService {
  // In-memory cache of the graph structure (adjacency list)
  // key: Source Memory ID, value: List of Edges
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
   * Load the entire graph structure from SQLite into memory for fast traversal.
   * Call this when the game loads or when entering a new save slot.
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

        // Add edge
        this.adjacencyList.get(rel.source_id)?.push({
          targetId: rel.target_id,
          weight: rel.strength,
          type: rel.rel_type
        });

        // Since it's an undirected graph concept for association (mostly),
        // we might want bidirectional links for some types, but let's stick to
        // explicit edges from DB. If DB has only one-way, we respect it.
        // PeroCore usually treats 'associative' as bidirectional.

        // For 'sequence' (prev/next), it's directed.
        // For 'entity' (memory -> entity), if we treat entity as a node...
        // Wait, our nodes are ALL memories.
        // Entities are implicit anchors.
        // If Memory A and Memory B both relate to "Reimu", they should be connected?
        // OR, we have "Virtual Nodes" for entities?

        // Simplified approach V1: Nodes are ONLY Memories.
        // Edges are direct links between memories.
      });

      this.isInitialized = true;
      console.log(`[MemoryGraph] Graph loaded with ${this.adjacencyList.size} nodes.`);
    } catch (e) {
      console.error('[MemoryGraph] Failed to load graph:', e);
    }
    console.timeEnd('GraphLoad');
  }

  /**
   * Add a connection dynamically (e.g., after adding a new memory)
   */
  addConnection(sourceId: number, targetId: number, weight: number, type: string) {
    if (!this.adjacencyList.has(sourceId)) {
      this.adjacencyList.set(sourceId, []);
    }
    this.adjacencyList.get(sourceId)?.push({ targetId, weight, type });
  }

  /**
   * The Core Spreading Activation Algorithm
   * @param startNodes Map of MemoryID -> Initial Energy
   */
  spreadActivation(startNodes: Map<number, number>): Map<number, number> {
    if (!this.isInitialized) {
      console.warn('[MemoryGraph] Graph not initialized, running on empty graph.');
      return new Map();
    }

    let currentActivations = new Map<number, number>(startNodes);
    const finalActivations = new Map<number, number>(startNodes);

    for (let step = 0; step < PEDSA_CONFIG.maxSteps; step++) {
      const nextActivations = new Map<number, number>();

      // Process all currently active nodes
      for (const [sourceId, energy] of currentActivations.entries()) {
        if (energy < PEDSA_CONFIG.activationThreshold) continue;

        const edges = this.adjacencyList.get(sourceId) || [];

        // Sort by weight to prioritize strong connections (Fan-out limit)
        // Optimization: In a real large graph, pre-sort edges.
        const activeEdges = edges
          .sort((a, b) => b.weight - a.weight)
          .slice(0, PEDSA_CONFIG.maxFanOut);

        for (const edge of activeEdges) {
          // Calculate propagated energy
          // E_target = E_source * Weight * Decay
          const propagatedEnergy = energy * edge.weight * PEDSA_CONFIG.decayRate;

          if (propagatedEnergy > PEDSA_CONFIG.activationThreshold) {
            // Accumulate energy
            const currentEnergy = nextActivations.get(edge.targetId) || 0;
            const existingFinalEnergy = finalActivations.get(edge.targetId) || 0;

            // Softmax-like accumulation or Max?
            // PeroCore uses accumulation but capped at 1.0 usually.
            // Let's use max for simplicity to avoid explosion, or simple add with dampening.
            const newEnergy = currentEnergy + propagatedEnergy;

            nextActivations.set(edge.targetId, newEnergy);

            // Update final result map (keeping the highest energy seen or accumulating?)
            // We accumulate into final map to capture multi-path reinforcement.
            finalActivations.set(edge.targetId, existingFinalEnergy + propagatedEnergy);
          }
        }
      }

      // Prepare for next step
      currentActivations = nextActivations;

      // If no nodes active, stop early
      if (currentActivations.size === 0) break;
    }

    return finalActivations;
  }
}

export const memoryGraph = new MemoryGraphService();
