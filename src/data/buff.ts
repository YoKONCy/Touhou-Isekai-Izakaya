import { v4 as uuidv4 } from 'uuid';
import type { Buff } from '@/types/combat';

export const BUFF_DEFINITIONS: Record<string, (turn: number, customValue?: number) => Buff> = {
    '知己知彼': (turn: number, customValue?: number) => {
        let value: number;
        if (customValue !== undefined) {
             value = Math.max(0.1, Math.min(0.5, customValue));
        } else {
             // Fallback: 10% ~ 50% Random
             const percent = Math.floor(Math.random() * 41) + 10; 
             value = Number((percent / 100).toFixed(2));
        }
        
        const percentDisplay = Math.round(value * 100);
        
        return {
            id: `buff_knowledge_${uuidv4()}`,
            name: '知己知彼',
            type: 'buff',
            description: `因掌握情报优势，攻击力提升${percentDisplay}%`,
            duration: 4,
            createdTurn: turn,
            effects: [{
                type: 'stat_mod',
                targetStat: 'attack',
                value: value,
                isPercentage: true
            }]
        };
    },
    '被偷袭': (turn: number, customValue?: number) => {
        let value: number;
        if (customValue !== undefined) {
             value = Math.max(0.1, Math.min(0.5, customValue));
        } else {
             // Fallback: 10% ~ 50% Random
             const percent = Math.floor(Math.random() * 41) + 10;
             value = Number((percent / 100).toFixed(2));
        }

        const percentDisplay = Math.round(value * 100);

        return {
            id: `debuff_ambush_${uuidv4()}`,
            name: '被偷袭',
            type: 'debuff',
            description: `遭遇突袭，受到的伤害增加${percentDisplay}%`,
            duration: 4,
            createdTurn: turn,
            effects: [{
                type: 'stat_mod',
                targetStat: 'damage_taken',
                value: value,
                isPercentage: true
            }]
        };
    },
    '气场压制': (turn: number) => {
        return {
            id: `debuff_suppression_${uuidv4()}`,
            name: '气场压制',
            type: 'debuff',
            description: '受到强者气场压制，闪避率降低15%',
            duration: 4,
            createdTurn: turn,
            effects: [{
                type: 'dodge_mod',
                value: -0.15,
                isPercentage: true
            }]
        };
    },
    '绯想天': (turn: number) => ({
        id: `buff_scarlet_${uuidv4()}`,
        name: '「绯想天」',
        type: 'buff',
        description: '周身环绕着绯色的气息，攻击力大幅提升30%',
        duration: 3,
        createdTurn: turn,
        effects: [{ type: 'stat_mod', targetStat: 'attack', value: 0.3, isPercentage: true }]
    }),
    '明镜止水': (turn: number) => ({
        id: `buff_still_water_${uuidv4()}`,
        name: '「明镜止水」',
        type: 'buff',
        description: '心境如明镜般清澈，闪避率提升25%',
        duration: 3,
        createdTurn: turn,
        effects: [{ type: 'dodge_mod', value: 0.25, isPercentage: true }]
    }),
    '金刚不坏': (turn: number) => ({
        id: `buff_vajra_${uuidv4()}`,
        name: '「金刚不坏」',
        type: 'buff',
        description: '身体如金刚石般坚硬，受到的伤害降低25%',
        duration: 3,
        createdTurn: turn,
        effects: [{ type: 'damage_reduction', value: 0.25, isPercentage: true }]
    }),
    '森罗万象': (turn: number) => ({
        id: `buff_nature_${uuidv4()}`,
        name: '「森罗万象」',
        type: 'buff',
        description: '感悟自然之理，灵力消耗降低30%',
        duration: 5,
        createdTurn: turn,
        effects: [{ type: 'stat_mod', targetStat: 'mp_cost_reduction', value: 0.3, isPercentage: true }]
    }),
    '彼岸花开': (turn: number) => ({
        id: `debuff_equinox_${uuidv4()}`,
        name: '「彼岸花开」',
        type: 'debuff',
        description: '死亡之花在脚下绽放，每回合受到持续伤害',
        duration: 3,
        createdTurn: turn,
        effects: [{ type: 'damage_over_time', value: 50, isPercentage: false }]
    }),
    '月之加护': (turn: number) => ({
        id: `buff_moon_${uuidv4()}`,
        name: '「月之加护」',
        type: 'buff',
        description: '月光的温柔庇护，获得200点护盾',
        duration: 3,
        createdTurn: turn,
        effects: [{ type: 'shield', value: 200, isPercentage: false }]
    }),
    '百鬼夜行': (turn: number) => ({
        id: `buff_parade_${uuidv4()}`,
        name: '「百鬼夜行」',
        type: 'buff',
        description: '众鬼随行，气势如虹。攻击+20%，闪避+10%',
        duration: 4,
        createdTurn: turn,
        effects: [
            { type: 'stat_mod', targetStat: 'attack', value: 0.2, isPercentage: true },
            { type: 'dodge_mod', value: 0.1, isPercentage: true }
        ]
    }),
    '万物虚无': (turn: number) => ({
        id: `debuff_void_${uuidv4()}`,
        name: '「万物虚无」',
        type: 'debuff',
        description: '陷入虚无的泥沼，攻击力降低30%',
        duration: 3,
        createdTurn: turn,
        effects: [{ type: 'stat_mod', targetStat: 'attack', value: -0.3, isPercentage: true }]
    }),
    '星火燎原': (turn: number) => ({
        id: `debuff_spark_${uuidv4()}`,
        name: '「星火燎原」',
        type: 'debuff',
        description: '灼热的火星不断侵蚀，受到的伤害增加25%',
        duration: 3,
        createdTurn: turn,
        effects: [{ type: 'stat_mod', targetStat: 'damage_taken', value: 0.25, isPercentage: true }]
    }),
    '境界之缝': (turn: number) => ({
        id: `buff_gap_${uuidv4()}`,
        name: '「境界之缝」',
        type: 'buff',
        description: '游走于境界的缝隙，闪避率大幅提升50%',
        duration: 2,
        createdTurn: turn,
        effects: [{ type: 'dodge_mod', value: 0.5, isPercentage: true }]
    })
};

export function getBuffByName(name: string, currentTurn: number, customValue?: number): Buff | null {
    if (!name) return null;
    const generator = BUFF_DEFINITIONS[name];
    if (generator) {
        return generator(currentTurn, customValue);
    }
    return null;
}
