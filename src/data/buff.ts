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
    }
};

export function getBuffByName(name: string, currentTurn: number, customValue?: number): Buff | null {
    if (!name) return null;
    const generator = BUFF_DEFINITIONS[name];
    if (generator) {
        return generator(currentTurn, customValue);
    }
    return null;
}
