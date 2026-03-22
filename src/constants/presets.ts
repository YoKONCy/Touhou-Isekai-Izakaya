import { User, Wallet, Swords, Wand2, Sparkles, Settings } from 'lucide-vue-next';

export const PRESET_ORIGINS = [
  {
    id: 'traveler',
    name: '误入的迷途者',
    desc: '你在一次散步中偶然穿过了博丽大结界。身无长物，只有随身的衣物。',
    setting: {
      身份: '外来人',
      穿越原因: '对幻想乡一无所知的外界人类。因偶然穿过了博丽大结界误入此地。'
    },
    stats: {
      money: 5000,
      power: 'F+',
      hp: 500,
      mp: 100,
      identity: '迷途者',
      clothing: '现代休闲装束',
      location: '人间之里',
      time: '7:00',
      date: '纪元2018年12月25日'
    },
    icon: User
  },
  {
    id: 'merchant',
    name: '商务人士',
    desc: '你有着一大笔钱，可却意外来到了这个陌生的地方。',
    setting: {
      身份: '来自外界的商务人士',
      特殊能力: '谈判能力高超，尤其是对砍价还价非常在行。'
    },
    stats: {
      money: 50000,
      power: 'F+',
      hp: 500,
      mp: 100,
      identity: '商务人士',
      clothing: '整洁的西装',
      location: '人间之里',
      time: '7:00',
      date: '纪元2018年12月25日'
    },
    icon: Wallet
  },
  {
    id: 'exorcist',
    name: '异世界的退魔师',
    desc: '你来自其他世界，拥有不俗的战斗力与敏锐的感知力。',
    setting: {
      身份: '退魔师学徒',
      特殊能力: '来自异世界的退魔师，对灵力感知敏锐，能够快速识别出各类异常源。'
    },
    stats: {
      money: 0,
      power: 'C',
      hp: 1000,
      mp: 1000,
      identity: '退魔师',
      clothing: '狩衣',
      location: '人间之里',
      time: '7:00',
      date: '纪元2018年12月25日',
      spell_cards: [
        {
          name: '净符「鬼退治」',
          description: '通过净化的力量驱散邪祟。造成伤害并削弱敌方。',
          damage: 20,
          cost: 100,
          scope: 'single',
          type: 'attack',
          effects: {
            debuffs: [
              {
                name: '无力化',
                duration: 2,
                description: '减少15%伤害',
                effects: [
                  { type: 'stat_mod', targetStat: 'attack', value: -0.15, isPercentage: true }
                ]
              }
            ]
          }
        }
      ]
    },
    icon: Swords
  },
  {
    id: 'magician',
    name: '流浪魔术师',
    desc: '来自外界的流浪魔术师，掌握着一些戏法般的魔术。',
    setting: {
      身份: '流浪魔术师',
      特殊能力: '掌握一些魔术把戏；对‘命运’有敏锐的感知能力。'
    },
    stats: {
      money: 20000,
      power: 'E+',
      hp: 500,
      mp: 500,
      identity: '魔术师',
      clothing: '魔术师礼服',
      location: '人间之里',
      time: '7:00',
      date: '纪元2018年12月25日',
      spell_cards: [
        {
          name: '戏法「迷人眼」',
          description: '通过眼花缭乱的手法干扰敌人的视线。',
          damage: 0,
          cost: 100,
          scope: 'single',
          type: 'buff',
          effects: {
            buffs: [
              {
                name: '惑乱',
                duration: 3,
                description: '增加15%闪避率',
                effects: [{ type: 'dodge_mod', value: 0.15, isPercentage: true }]
              }
            ]
          }
        }
      ]
    },
    icon: Wand2
  },
  {
    id: 'isekai_visitor',
    name: '异界来客',
    desc: '因时空乱流而穿越到这个世界的普通人。对这里一无所知，但带着异世界的特质。',
    setting: {
      身份: '异界穿越者',
      穿越原因:
        '在原本的世界遭遇了罕见的时空乱流，醒来时已身处幻想乡。作为一个普通人，你必须在这个充满幻想与危险的世界找到生存之道。',
      特殊特质: '由于来自异界，你的存在方式似乎略微游离于此地的法则之外。'
    },
    stats: {
      money: 1000,
      power: 'F',
      hp: 400,
      mp: 200,
      identity: '穿越者',
      clothing: '破损的现代服饰',
      location: '博丽神社',
      time: '12:00',
      date: '纪元2018年12月25日'
    },
    icon: Sparkles
  },
  {
    id: 'god',
    name: '失落的至高神（主线剧情）',
    desc: '来自其他平行世界，在时空乱流中意外得到了至高创世神的‘遗物’。',
    setting: {
      真实身份: '神选之人（失落的至高神）',
      穿越原因:
        '因时空乱流被卷入幻想乡（注意，{{user}}来自其他平行世界，不是来自幻想乡世界的外界），在时空乱流中意外吸收了原初创世神的神格碎片。由于只有至高神才拥有本源神力，所以除了{{user}}以外，其他人都无法驱动权柄真正的力量。',
      自我指引: {
        来源: '{{user}}的神格碎片残留了至高创世神的意志',
        作用: '作为神圣而古老的存在暗中指引{{user}}'
      },
      力量恢复: {
        碎片机制:
          '每集齐一块碎片，身边都会迸发出纯粹强大的气场，并恢复对应的权柄之力（但获得完整权柄前只能发动极少一部分的力量）。',
        完成形态:
          '集齐所有五块权柄碎片后，将合成为“完整的神之权柄”，生命、灵力上限、战斗等级都提升到“∞”，且本源神力永不枯竭。届时，所有角色都会感受到一股来源不明的压迫感。'
      }
    },
    stats: {
      money: 0,
      power: 'D+',
      hp: 500,
      mp: 1000,
      identity: '失落的至高神',
      clothing: '破损的神袍',
      location: '人间之里',
      time: '7:00',
      date: '纪元2018年12月25日',
      items: [
        {
          id: 'fragment_of_godhood',
          name: '遗失权柄的神格碎片',
          count: 1,
          description: '已融合进入体内...',
          type: 'special'
        }
      ]
    },
    icon: Settings
  }
];

export const PRESET_LOCATIONS = [
  '博丽神社',
  '人间之里',
  '雾之湖',
  '妖怪之山',
  '迷途竹林',
  '旧地狱',
  '地灵殿',
  '辉针城'
];
