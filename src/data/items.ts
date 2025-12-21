export interface ItemDefinition {
  id: string;
  name: string;
  description: string;
  type: 'material' | 'equipment' | 'special';
  effects?: Record<string, any>;
}

export const PRESET_ITEMS: Record<string, ItemDefinition> = {
  'tea': {
    id: 'tea',
    name: '红茶',
    description: '普通的红茶，可以稍微回复一点精神。',
    type: 'material',
    effects: { hp: 10, mp: 5 }
  },
  'high_grade_tea': {
    id: 'high_grade_tea',
    name: '高级红茶',
    description: '蕾米莉亚喜欢的红茶，香气扑鼻。',
    type: 'material',
    effects: { hp: 50, mp: 30 }
  },
  'sake': {
    id: 'sake',
    name: '清酒',
    description: '普通的清酒。',
    type: 'material',
    effects: { mood: 'happy' }
  },
  'reimu_donation': {
    id: 'reimu_donation',
    name: '赛钱',
    description: '给博丽神社的捐款证明？',
    type: 'special'
  },
  'fragment_of_godhood': {
    id: 'fragment_of_godhood',
    name: '遗失权柄的神格碎片',
    description: '已融合进入体内...',
    type: 'special'
  }
};
