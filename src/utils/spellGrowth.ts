import type { SpellCard } from '@/types/combat';

export const MAX_SPELL_LEVEL = 30;
export const EXP_PER_LEVEL = 100;

/**
 * Adds experience to a spell card and handles leveling up.
 * @param spell The spell card to update
 * @param amount The amount of experience to add
 * @returns Object containing levelUp count and oldLevel for UI notifications
 */
export function addSpellExp(spell: SpellCard, amount: number): { levelUp: boolean, oldLevel: number, newLevel: number } {
    if (!spell.level) spell.level = 1;
    if (spell.experience === undefined) spell.experience = 0;

    if (spell.level >= MAX_SPELL_LEVEL) {
        return { levelUp: false, oldLevel: spell.level, newLevel: spell.level };
    }

    const oldLevel = spell.level;
    spell.experience += amount;

    while (spell.experience >= EXP_PER_LEVEL && spell.level < MAX_SPELL_LEVEL) {
        spell.experience -= EXP_PER_LEVEL;
        spell.level++;
    }

    // Cap at max level
    if (spell.level >= MAX_SPELL_LEVEL) {
        spell.experience = 0;
    }

    return { 
        levelUp: spell.level > oldLevel, 
        oldLevel, 
        newLevel: spell.level 
    };
}

/**
 * Calculates the MP cost reduction based on spell level.
 * Level 1: 0%
 * Level 30: 29%
 * Formula: (level - 1) * 0.01
 */
export function getLevelCostReduction(level: number): number {
    if (!level || level <= 1) return 0;
    return Math.min(0.29, (level - 1) * 0.01);
}

/**
 * Calculates the additional MP cost reduction based on Combat Level.
 * Starts from level 51.
 * Each level above 50 adds 0.5% reduction.
 * Level 50: 0%
 * Level 100: 25% (50 * 0.005)
 */
export function getCombatLevelCostReduction(combatLevel: number): number {
    if (!combatLevel || combatLevel <= 50) return 0;
    const effectiveLevel = Math.min(100, combatLevel) - 50;
    return effectiveLevel * 0.005;
}
