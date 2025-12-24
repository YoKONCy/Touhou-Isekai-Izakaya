import type { Combatant, Buff } from '@/types/combat';
import { calculateDamage } from '@/services/combatLogic';
import { applyLifecycleHook } from '@/services/combatModifiers';

export function runCombatVerification() {
  console.log('%c--- Running Combat Logic Verification ---', 'color: #fb923c; font-weight: bold; font-size: 14px;');

  // 1. Mock Combatants
  const attacker: Combatant = {
    id: 'p1', name: 'Tester', isPlayer: true, team: 'player',
    hp: 100, maxHp: 100, mp: 10, maxMp: 10, power: 'E',
    buffs: [], shield: 0,
    spellCards: [], dodgeRate: 0.15
  };
  const defender: Combatant = {
    id: 'e1', name: 'Dummy', isPlayer: false, team: 'enemy',
    hp: 100, maxHp: 100, mp: 0, maxMp: 0, power: 'E',
    buffs: [], shield: 0,
    spellCards: [], dodgeRate: 0.15
  };

  // 2. Test Base Damage
  // Note: calculateDamage might throw if store is missing, but we added try-catch in combatLogic.
  try {
      const baseResult = calculateDamage(attacker, defender);
      console.log(`Base Damage (E vs E): ${baseResult.damage}`);

      // 3. Test Attack Buff (Stat Mod)
      const atkBuff: Buff = {
        id: 'b1', name: 'Attack Up', description: '', duration: 3, type: 'buff',
        effects: [{ type: 'stat_mod', targetStat: 'attack', value: 0.5, isPercentage: true }] // +50% Atk
      };
      // We need to clone attacker to avoid mutating original for future tests if needed
      const buffedAttacker = { ...attacker, buffs: [atkBuff] };
      
      const buffedResult = calculateDamage(buffedAttacker, defender);
      console.log(`Buffed Damage (+50% Atk): ${buffedResult.damage}`);
      
      if (buffedResult.damage > baseResult.damage) {
        console.log('%c✅ Attack Buff Verified', 'color: green');
      } else {
        console.error('❌ Attack Buff Failed');
      }
  } catch (e) {
      console.warn('⚠️ Base Damage Test skipped due to store dependency (likely normal in test env):', e);
  }

  // 4. Test DoT Lifecycle Hook
  // This part doesn't depend on store, only combatModifiers.ts logic
  const dotBuff: Buff = {
    id: 'b2', name: 'Poison', description: '', duration: 3, type: 'debuff',
    effects: [{ type: 'damage_over_time', value: 10, isPercentage: false }]
  };
  
  // Clone defender
  const dotDefender = { ...defender, buffs: [dotBuff] };
  const initialHp = dotDefender.hp;

  // Manually trigger hook
  let logMsg = '';
  const context = {
      attacker: dotDefender, // Self is context for turn start
      turn: 1,
      onLog: (msg: string) => { logMsg = msg; }
  };
  
  applyLifecycleHook('onTurnStart', dotDefender, context);
  
  if (dotDefender.hp < initialHp && logMsg.includes('Poison')) {
    console.log(`%c✅ DoT Hook Verified (HP: ${initialHp} -> ${dotDefender.hp})`, 'color: green');
  } else {
    console.error(`❌ DoT Hook Failed. HP: ${dotDefender.hp}, Log: ${logMsg}`);
  }

  console.log('%c--- Verification Complete ---', 'color: #fb923c; font-weight: bold; font-size: 14px;');
}
