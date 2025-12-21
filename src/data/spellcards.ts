import { type SpellCard } from '@/types/combat';

export const PRESET_SPELLCARDS: Record<string, Partial<SpellCard>> = {
  // --- 博丽灵梦 (Reimu Hakurei) ---
  'reimu_fantasy_seal': {
    name: '梦想封印',
    description: '灵梦的招牌符卡，发射强力的灵力光玉追踪敌人。',
    cost: 60,
    damage: 240,
    scope: 'single',
    type: 'attack',
    isUltimate: true,
    hitRate: 1.0
  },
  'reimu_evil_sealing_circle': {
    name: '灵符「阴阳印」',
    description: '展开巨大的结界，对范围内敌人造成伤害。',
    cost: 40,
    damage: 60,
    scope: 'aoe',
    type: 'attack',
    hitRate: 0.1
  },
  'reimu_persuasion_needle': {
    name: '宝具「阴阳鬼神玉」',
    description: '投掷巨大的阴阳玉碾碎敌人。',
    cost: 30,
    damage: 70,
    scope: 'single',
    type: 'attack',
    hitRate: 0.15
  },
  'reimu_hakurei_amulet': {
    name: '灵符「梦想妙珠」',
    description: '连续发射灵符攻击敌人。',
    cost: 20,
    damage: 45,
    scope: 'single',
    type: 'attack',
    hitRate: 0.1
  },
  'reimu_fantasy_barrier': {
    name: '梦符「二重结界」',
    description: '展开二重结界反弹攻击。',
    cost: 35,
    damage: 0,
    scope: 'single',
    type: 'shield',
    hitRate: 1.0,
    buffDetails: {
        name: '二重结界',
        duration: 2,
        description: '获得护盾',
        effects: [{ type: 'shield', value: 80, isPercentage: false }]
    }
  },

// --- 雾雨魔理沙 (Marisa Kirisame) ---
  'marisa_master_spark': {
    name: '恋符「极限火花」',
    description: '魔理沙的招牌符卡，释放巨大的激光束，破坏力惊人。',
    cost: 80,
    damage: 210,
    scope: 'aoe',
    type: 'attack',
    isUltimate: true,
    hitRate: 1.0
  },
  'marisa_stardust_reverie': {
    name: '魔符「星屑幻想」',
    description: '如星屑般洒落的魔法弹幕。',
    cost: 40,
    damage: 55,
    scope: 'aoe',
    type: 'attack',
    hitRate: 0.1
  },
  'marisa_magic_missile': {
    name: '魔空「小行星带」',
    description: '召唤无数魔法星体撞击敌人。',
    cost: 30,
    damage: 40,
    scope: 'aoe',
    type: 'attack',
    hitRate: 0.1
  },
  'marisa_non_directional_laser': {
    name: '光符「地球光」',
    description: '从自身向四周发射激光。',
    cost: 35,
    damage: 65,
    scope: 'single',
    type: 'attack',
    hitRate: 0.1
  },
  'marisa_comet': {
    name: '彗星「巴雷如彗星」',
    description: '高速冲撞的魔法攻击。',
    cost: 35,
    damage: 60,
    scope: 'single',
    type: 'attack',
    hitRate: 0.15
  },

// --- 十六夜咲夜 (Sakuya Izayoi) ---
  'sakuya_the_world': {
    name: '幻世「The World」',
    description: '停止时间，对敌人进行暴风骤雨般的飞刀攻击。',
    cost: 70,
    damage: 200,
    scope: 'single',
    type: 'attack',
    isUltimate: true,
    hitRate: 1.0
  },
  'sakuya_killing_doll': {
    name: '幻符「杀人玩偶」',
    description: '投掷大量飞刀，如同操控人偶般攻击。',
    cost: 35,
    damage: 60,
    scope: 'single',
    type: 'attack',
    hitRate: 0.15
  },
  'sakuya_misdirection': {
    name: '奇术「误导」',
    description: '通过空间扭曲投掷飞刀，难以闪避。',
    cost: 25,
    damage: 50,
    scope: 'single',
    type: 'attack',
    hitRate: 0.3
  },
  'sakuya_private_square': {
    name: '时符「私人广场」',
    description: '减缓周围的时间流逝。',
    cost: 40,
    damage: 0,
    scope: 'single',
    type: 'buff',
    hitRate: 1.0,
    buffDetails: {
        name: '时间减缓',
        duration: 2,
        description: '闪避率提升',
        effects: [{ type: 'dodge_mod', value: 0.25, isPercentage: true }]
    }
  },

// --- 蕾米莉亚·斯卡雷特 (Remilia Scarlet) ---
  'remilia_gungnir': {
    name: '神枪「冈格尼尔」',
    description: '投掷必中的神枪，贯穿一切。',
    cost: 75,
    damage: 240,
    scope: 'single',
    type: 'attack',
    isUltimate: true,
    hitRate: 1.0
  },
  'remilia_red_magic': {
    name: '红符「不夜城红」',
    description: '释放出鲜红色的魔力风暴。',
    cost: 40,
    damage: 70,
    scope: 'aoe',
    type: 'attack',
    hitRate: 0.1
  },
  'remilia_demon_lord_walk': {
    name: '夜符「恶魔之王」',
    description: '展现恶魔之王的威压。',
    cost: 30,
    damage: 0,
    scope: 'single',
    type: 'buff',
    buffDetails: {
        name: '恶魔威压',
        duration: 3,
        description: '攻击力大幅提升',
        effects: [{ type: 'stat_mod', targetStat: 'attack', value: 0.3, isPercentage: true }]
    }
  },
  'remilia_miserable_fate': {
    name: '命运「悲惨的命运」',
    description: '诅咒敌人，使其变得不幸。',
    cost: 35,
    damage: 40,
    scope: 'single',
    type: 'debuff',
    hitRate: 1.0,
    buffDetails: {
        name: '厄运',
        duration: 3,
        description: '命中率降低',
        effects: [{ type: 'stat_mod', targetStat: 'attack', value: -0.15, isPercentage: true }]
    }
  },

// --- 芙兰朵露·斯卡雷特 (Flandre Scarlet) ---
  'flandre_laevateinn': {
    name: '禁忌「莱瓦汀」',
    description: '挥舞巨大的炎之魔剑，将一切燃烧殆尽。',
    cost: 80,
    damage: 260,
    scope: 'single',
    type: 'attack',
    isUltimate: true,
    hitRate: 1.0
  },
  'flandre_cranberry_trap': {
    name: '禁忌「克兰伯里之陷阱」',
    description: '布下致命的弹幕陷阱。',
    cost: 45,
    damage: 80,
    scope: 'aoe',
    type: 'attack',
    hitRate: 0.1
  },
  'flandre_four_of_a_kind': {
    name: '禁忌「四重存在」',
    description: '分身为四，同时进行攻击。',
    cost: 50,
    damage: 90,
    scope: 'single',
    type: 'attack',
    hitRate: 0.1
  },
  'flandre_caged_bird': {
    name: '禁忌「笼中鸟」',
    description: '将敌人困在弹幕结界中。',
    cost: 45,
    damage: 80,
    scope: 'single',
    type: 'attack',
    hitRate: 0.15
  },

// --- 魂魄妖梦 (Youmu Konpaku) ---
  'youmu_paschal_moon': {
    name: '人鬼「未来永劫斩」',
    description: '超越时间的斩击，斩断迷惘。',
    cost: 65,
    damage: 210,
    scope: 'single',
    type: 'attack',
    isUltimate: true,
    hitRate: 1.0
  },
  'youmu_cherry_blossom': {
    name: '剑技「樱花闪闪」',
    description: '如樱花飘落般绚烂的剑技。',
    cost: 30,
    damage: 60,
    scope: 'single',
    type: 'attack',
    hitRate: 0.2
  },
  'youmu_meditation': {
    name: '魂符「幽明的苦轮」',
    description: '集中精神，提升斩击的威力。',
    cost: 25,
    damage: 0,
    scope: 'single',
    type: 'buff',
    buffDetails: {
        name: '心眼',
        duration: 3,
        description: '暴击率与命中率提升',
        effects: [
            { type: 'stat_mod', targetStat: 'attack', value: 0.2, isPercentage: true },
            { type: 'dodge_mod', value: 0.1, isPercentage: true }
        ]
    }
  },
  'youmu_meditation_slash': {
    name: '断命「冥想斩」',
    description: '心如止水的一击。',
    cost: 35,
    damage: 70,
    scope: 'single',
    type: 'attack',
    hitRate: 0.2
  },

// --- 西行寺幽幽子 (Yuyuko Saigyouji) ---
  'yuyuko_resurrection_butterfly': {
    name: '西行寺「反魂蝶」',
    description: '死亡与重生的华丽蝶舞，引领灵魂归于虚无。',
    cost: 90,
    damage: 190,
    scope: 'aoe',
    type: 'attack',
    isUltimate: true,
    hitRate: 1.0
  },
  'yuyuko_death_dream': {
    name: '死符「加斯利之梦」',
    description: '让人陷入沉睡的死亡之梦。',
    cost: 40,
    damage: 60,
    scope: 'single',
    type: 'attack',
    hitRate: 0.1
  },
  'yuyuko_spirit_invite': {
    name: '幽雅「死灵的灵梦」',
    description: '召唤死灵纠缠敌人，降低其防御。',
    cost: 35,
    damage: 30,
    scope: 'single',
    type: 'debuff',
    buffDetails: {
        name: '死灵缠身',
        duration: 3,
        description: '防御力降低',
        effects: [{ type: 'stat_mod', targetStat: 'defense', value: -0.2, isPercentage: true }]
    }
  },
  'yuyuko_papilio': {
    name: '蝶符「凤蝶纹的死枪」',
    description: '致命的死灵光束。',
    cost: 40,
    damage: 75,
    scope: 'single',
    type: 'attack',
    hitRate: 0.15
  },

// --- 爱丽丝·玛格特洛伊德 (Alice Margatroid) ---
  'alice_grimoire': {
    name: '魔操「回归虚无」',
    description: '利用魔导书释放强大的魔力波。',
    cost: 70,
    damage: 160,
    scope: 'aoe',
    type: 'attack',
    isUltimate: true,
    hitRate: 1.0
  },
  'alice_doll_war': {
    name: '战操「人偶的战争」',
    description: '指挥人偶军团进行协同攻击。',
    cost: 35,
    damage: 55,
    scope: 'single',
    type: 'attack',
    hitRate: 0.1
  },
  'alice_hourai_doll': {
    name: '诅咒「蓬莱人偶」',
    description: '释放带有诅咒的人偶攻击。',
    cost: 40,
    damage: 65,
    scope: 'single',
    type: 'attack',
    hitRate: 0.1
  },
  'alice_bunraku': {
    name: '操符「乙女文乐」',
    description: '人偶们优雅的连携攻击。',
    cost: 30,
    damage: 55,
    scope: 'single',
    type: 'attack',
    hitRate: 0.15
  },

// --- 帕秋莉·诺蕾姬 (Patchouli Knowledge) ---
  'patchouli_royal_flare': {
    name: '火水木金土符「贤者之石」',
    description: '融合五元素的究极魔法。',
    cost: 80,
    damage: 180,
    scope: 'aoe',
    type: 'attack',
    isUltimate: true,
    hitRate: 1.0
  },
  'patchouli_silent_selene': {
    name: '月符「沉静的月神」',
    description: '召唤月光的守护与攻击。',
    cost: 45,
    damage: 0,
    scope: 'single',
    type: 'shield',
    buffDetails: {
        name: '月神守护',
        duration: 3,
        description: '获得护盾',
        effects: [{ type: 'shield', value: 80, isPercentage: false }]
    }
  },
  'patchouli_djinn_gust': {
    name: '木火符「森林大火」',
    description: '燃烧的风暴席卷全场。',
    cost: 50,
    damage: 60,
    scope: 'aoe',
    type: 'attack',
    hitRate: 0.1
  },
  'patchouli_elemental_harvest': {
    name: '金土符「元素收割」',
    description: '汲取大地的力量。',
    cost: 35,
    damage: 60,
    scope: 'single',
    type: 'attack',
    hitRate: 0.1
  },

// --- 红美铃 (Hong Meiling) ---
  'meiling_colorful_rain': {
    name: '华符「彩光莲华」',
    description: '如莲花般绽放的气功波。',
    cost: 60,
    damage: 190,
    scope: 'single',
    type: 'attack',
    isUltimate: true,
    hitRate: 1.0
  },
  'meiling_rainbow_wind_chime': {
    name: '虹符「烈虹真拳」',
    description: '彩虹色的连续拳击。',
    cost: 30,
    damage: 60,
    scope: 'single',
    type: 'attack',
    hitRate: 0.2
  },
  'meiling_qi_burst': {
    name: '气符「地龙天龙脚」',
    description: '利用大地之气进行的强力踢击。',
    cost: 35,
    damage: 70,
    scope: 'single',
    type: 'attack',
    hitRate: 0.15
  },
  'meiling_colorful_dance': {
    name: '极彩「彩光乱舞」',
    description: '绚丽多彩的连续踢击。',
    cost: 35,
    damage: 65,
    scope: 'aoe',
    type: 'attack',
    hitRate: 0.1
  },

// --- 琪露诺 (Cirno) ---
  'cirno_perfect_freeze': {
    name: '冻符「完美冻结」',
    description: '将周围的一切全部冻结！我是最强的！',
    cost: 50,
    damage: 120,
    scope: 'aoe',
    type: 'attack',
    isUltimate: true,
    hitRate: 1.0
  },
  'cirno_icicle_fall': {
    name: '冰符「冰瀑」',
    description: '落下无数冰锥攻击。',
    cost: 20,
    damage: 40,
    scope: 'single',
    type: 'attack',
    hitRate: 0.1
  },
  'cirno_minus_k': {
    name: '冻符「Minus K」',
    description: '达到绝对零度的攻击。',
    cost: 35,
    damage: 60,
    scope: 'single',
    type: 'attack',
    hitRate: 0.15
  },

// --- 东风谷早苗 (Sanae Kochiya) ---
  'sanae_moses_miracle': {
    name: '神德「五谷丰希米之傲」',
    description: '召唤神风，引发奇迹。',
    cost: 70,
    damage: 180,
    scope: 'aoe',
    type: 'attack',
    isUltimate: true,
    hitRate: 1.0
  },
  'sanae_star_ritual': {
    name: '秘术「灰色奇术」',
    description: '使用秘术增强自身灵力。',
    cost: 40,
    damage: 0,
    scope: 'single',
    type: 'buff',
    buffDetails: {
        name: '现人神的加护',
        duration: 3,
        description: '攻击力与防御力提升',
        effects: [
            { type: 'stat_mod', targetStat: 'attack', value: 0.15, isPercentage: true },
            { type: 'stat_mod', targetStat: 'defense', value: 0.15, isPercentage: true }
        ]
    }
  },
  'sanae_wind_call': {
    name: '准备「呼风唤雨」',
    description: '召唤风雨冲刷敌人。',
    cost: 35,
    damage: 55,
    scope: 'aoe',
    type: 'attack',
    hitRate: 0.1
  },
  'sanae_bright_night': {
    name: '奇迹「客星的明亮之夜」',
    description: '召唤璀璨星光攻击。',
    cost: 40,
    damage: 65,
    scope: 'aoe',
    type: 'attack',
    hitRate: 0.1
  },

// --- 射命丸文 (Aya Shameimaru) ---
  'aya_illusionary_dominion': {
    name: '「幻想风靡」',
    description: '以超高速穿梭于战场，无人能及。',
    cost: 65,
    damage: 190,
    scope: 'single',
    type: 'attack',
    isUltimate: true,
    hitRate: 1.0
  },
  'aya_wind_god_fan': {
    name: '风符「风神一扇」',
    description: '挥动团扇，卷起烈风。',
    cost: 30,
    damage: 50,
    scope: 'aoe',
    type: 'attack',
    hitRate: 0.1
  },
  'aya_sarutahiko': {
    name: '岐符「天之八衢」',
    description: '利用风的力量提升闪避。',
    cost: 25,
    damage: 0,
    scope: 'single',
    type: 'buff',
    buffDetails: {
        name: '风之加护',
        duration: 2,
        description: '闪避率大幅提升',
        effects: [{ type: 'dodge_mod', value: 0.25, isPercentage: true }]
    }
  },
  'aya_momiji_fan': {
    name: '旋符「红叶扇风」',
    description: '扇动红叶般的旋风。',
    cost: 30,
    damage: 50,
    scope: 'aoe',
    type: 'attack',
    hitRate: 0.15
  },

// --- 八云紫 (Yukari Yakumo) ---
  'yukari_boundary_life_death': {
    name: '结界「生与死的境界」',
    description: '操纵境界，对敌人造成无法理解的伤害。',
    cost: 90,
    damage: 280,
    scope: 'single',
    type: 'attack',
    isUltimate: true,
    hitRate: 1.0
  },
  'yukari_quadruple_barrier': {
    name: '境符「四重结界」',
    description: '张开多重不可侵犯的结界。',
    cost: 50,
    damage: 0,
    scope: 'single',
    type: 'shield',
    buffDetails: {
        name: '四重结界',
        duration: 3,
        description: '获得巨额护盾',
        effects: [{ type: 'shield', value: 150, isPercentage: false }]
    }
  },
  'yukari_laplace_demon': {
    name: '罔两「拉普拉斯之魔」',
    description: '洞悉因果的攻击。',
    cost: 45,
    damage: 80,
    scope: 'single',
    type: 'attack',
    hitRate: 0.5
  },
  'yukari_abandoned_station': {
    name: '废线「废弃车站下车之旅」',
    description: '用废弃的列车进行撞击。',
    cost: 50,
    damage: 90,
    scope: 'single',
    type: 'attack',
    hitRate: 0.1
  },

// --- 八云蓝 (Ran Yakumo) ---
  'ran_princess_tenko': {
    name: '式神「前鬼后鬼」',
    description: '召唤强力的式神进行攻击。',
    cost: 65,
    damage: 160,
    scope: 'aoe',
    type: 'attack',
    isUltimate: true,
    hitRate: 1.0
  },
  'ran_dakini': {
    name: '式神「仙狐思念」',
    description: '狐火燃烧敌人。',
    cost: 35,
    damage: 60,
    scope: 'single',
    type: 'attack',
    hitRate: 0.1
  },
  'ran_defense': {
    name: '式神「十二神将之宴」',
    description: '强化自身的防御。',
    cost: 40,
    damage: 0,
    scope: 'single',
    type: 'buff',
    buffDetails: {
        name: '式神护体',
        duration: 3,
        description: '防御力提升',
        effects: [{ type: 'stat_mod', targetStat: 'defense', value: 0.25, isPercentage: true }]
    }
  },
  'ran_chen_shikigami': {
    name: '式神「橙」',
    description: '召唤橙进行支援攻击。',
    cost: 30,
    damage: 55,
    scope: 'single',
    type: 'attack',
    hitRate: 0.15
  },

// --- 八云橙 (Chen) ---
  'chen_blue_oni_red_oni': {
    name: '鬼符「青鬼赤鬼」',
    description: '如鬼神般凶猛的爪击。',
    cost: 55,
    damage: 170,
    scope: 'single',
    type: 'attack',
    isUltimate: true,
    hitRate: 1.0
  },
  'chen_flight_idaten': {
    name: '翔符「飞翔韦驮天」',
    description: '利用速度进行突袭。',
    cost: 25,
    damage: 50,
    scope: 'single',
    type: 'attack',
    hitRate: 0.2
  },
  'chen_bishamonten': {
    name: '鬼神「飞翔毗沙门天」',
    description: '如天神般飞翔的突袭。',
    cost: 30,
    damage: 60,
    scope: 'single',
    type: 'attack',
    hitRate: 0.2
  },

// --- 铃仙·优昙华院·因幡 (Reisen Udongein Inaba) ---
  'reisen_lunatic_red_eyes': {
    name: '「月面波长」',
    description: '通过操控波长让敌人陷入疯狂。',
    cost: 70,
    damage: 160,
    scope: 'aoe',
    type: 'attack',
    isUltimate: true,
    hitRate: 1.0
  },
  'reisen_illusion_bomb': {
    name: '波符「赤眼催眠」',
    description: '催眠敌人，使其变得脆弱。',
    cost: 40,
    damage: 30,
    scope: 'single',
    type: 'debuff',
    buffDetails: {
        name: '催眠',
        duration: 2,
        description: '闪避率大幅降低',
        effects: [{ type: 'dodge_mod', value: -0.3, isPercentage: true }]
    }
  },
  'reisen_invisible_full_moon': {
    name: '散符「真实之月」',
    description: '看不见的弹幕攻击。',
    cost: 35,
    damage: 60,
    scope: 'single',
    type: 'attack',
    hitRate: 0.3
  },
  'reisen_lunatic_dream': {
    name: '狂梦「风狂的梦」',
    description: '让敌人陷入疯狂的梦境。',
    cost: 35,
    damage: 40,
    scope: 'single',
    type: 'debuff',
    hitRate: 1.0,
    buffDetails: {
        name: '狂乱',
        duration: 2,
        description: '防御力降低',
        effects: [{ type: 'stat_mod', targetStat: 'defense', value: -0.2, isPercentage: true }]
    }
  },

// --- 因幡帝 (Tewi Inaba) ---
  'tewi_ancient_duper': {
    name: '「古老的骗术」',
    description: '意想不到的陷阱攻击。',
    cost: 50,
    damage: 150,
    scope: 'single',
    type: 'attack',
    isUltimate: true,
    hitRate: 1.0
  },
  'tewi_lucky_charm': {
    name: '借符「大额财富」',
    description: '虽然是借来的运气，但也能保命。',
    cost: 30,
    damage: 0,
    scope: 'single',
    type: 'buff',
    buffDetails: {
        name: '强运',
        duration: 3,
        description: '闪避率提升',
        effects: [{ type: 'dodge_mod', value: 0.15, isPercentage: true }]
    }
  },
  'tewi_white_rabbit': {
    name: '兔符「因幡的白兔」',
    description: '召唤大量兔子踩踏。',
    cost: 30,
    damage: 50,
    scope: 'aoe',
    type: 'attack',
    hitRate: 0.1
  },

// --- 蓬莱山辉夜 (Kaguya Houraisan) ---
  'kaguya_hourai_jewel': {
    name: '神宝「蓬莱的玉枝」',
    description: '释放出五色光辉的弹幕。',
    cost: 80,
    damage: 200,
    scope: 'aoe',
    type: 'attack',
    isUltimate: true,
    hitRate: 1.0
  },
  'kaguya_buddha_stone_bowl': {
    name: '神宝「佛体的金刚石」',
    description: '坚不可摧的防御。',
    cost: 50,
    damage: 0,
    scope: 'single',
    type: 'shield',
    buffDetails: {
        name: '金刚石之盾',
        duration: 3,
        description: '获得强力护盾',
        effects: [{ type: 'shield', value: 120, isPercentage: false }]
    }
  },
  'kaguya_impossible_request': {
    name: '难题「龙颈之玉」',
    description: '如龙之吐息般的攻击。',
    cost: 45,
    damage: 75,
    scope: 'single',
    type: 'attack',
    hitRate: 0.1
  },
  'kaguya_swallow_cowrie': {
    name: '难题「燕子的子安贝」',
    description: '以子安贝作为护盾。',
    cost: 40,
    damage: 0,
    scope: 'single',
    type: 'shield',
    hitRate: 1.0,
    buffDetails: {
        name: '子安贝',
        duration: 3,
        description: '获得护盾',
        effects: [{ type: 'shield', value: 90, isPercentage: false }]
    }
  },

// --- 藤原妹红 (Fujiwara no Mokou) ---
  'mokou_phoenix_tail': {
    name: '「菲尼克斯的尾巴」',
    description: '燃烧生命，释放不死鸟的火焰。',
    cost: 75,
    damage: 240,
    scope: 'single',
    type: 'attack',
    isUltimate: true,
    hitRate: 1.0
  },
  'mokou_possessed_by_phoenix': {
    name: '不死「火鸟」',
    description: '化身为火鸟冲向敌人。',
    cost: 40,
    damage: 80,
    scope: 'single',
    type: 'attack',
    hitRate: 0.1
  },
  'mokou_resurrection': {
    name: '虚人「无」',
    description: '即使受到伤害也能快速复原。',
    cost: 50,
    damage: 0,
    scope: 'single',
    type: 'heal',
    buffDetails: {
        name: '再生',
        duration: 3,
        description: '每回合恢复生命',
        effects: [{ type: 'heal', value: 50, isPercentage: false }]
    }
  },
  'mokou_honest_man': {
    name: '藤原「灭罪寺院伤」',
    description: '燃烧罪恶的火焰。',
    cost: 45,
    damage: 85,
    scope: 'single',
    type: 'attack',
    hitRate: 0.15
  },

// --- 八意永琳 (Eirin Yagokoro) ---
  'eirin_astronomical_entombing': {
    name: '秘术「天文密葬法」',
    description: '用星辰封锁敌人的行动并造成伤害。',
    cost: 85,
    damage: 210,
    scope: 'aoe',
    type: 'attack',
    isUltimate: true,
    hitRate: 1.0
  },
  'eirin_hourai_elixir': {
    name: '禁药「蓬莱之药」',
    description: '究极的恢复药。',
    cost: 60,
    damage: 0,
    scope: 'single',
    type: 'heal',
    buffDetails: {
        name: '蓬莱之力',
        duration: 1,
        description: '完全恢复生命（模拟巨额治疗）',
        effects: [{ type: 'heal', value: 999, isPercentage: false }]
    }
  },
  'eirin_galaxy': {
    name: '药符「壶中的大银河」',
    description: '释放出银河般的弹幕。',
    cost: 40,
    damage: 70,
    scope: 'aoe',
    type: 'attack',
    hitRate: 0.1
  },
  'eirin_apollo': {
    name: '天咒「阿波罗13」',
    description: '来自宇宙的诅咒。',
    cost: 40,
    damage: 70,
    scope: 'single',
    type: 'attack',
    hitRate: 0.15
  },

// --- 古明地觉 (Satori Komeiji) ---
  'satori_terrible_souvenir': {
    name: '想起「泰瑞恐怖的回忆」',
    description: '唤起敌人内心深处的恐惧。',
    cost: 70,
    damage: 200,
    scope: 'single',
    type: 'attack',
    isUltimate: true,
    hitRate: 1.0
  },
  'satori_brain_fingerprint': {
    name: '脑符「脑指纹」',
    description: '精神攻击，直接伤害敌人的意志。',
    cost: 35,
    damage: 60,
    scope: 'single',
    type: 'attack',
    hitRate: 0.2
  },
  'satori_camera_rose': {
    name: '心花「相机腼腆的蔷薇」',
    description: '绽放的心灵之花。',
    cost: 30,
    damage: 50,
    scope: 'aoe',
    type: 'attack',
    hitRate: 0.1
  },
  'satori_wave_particle': {
    name: '想起「波与粒的境界」',
    description: '复制复杂的弹幕逻辑。',
    cost: 35,
    damage: 60,
    scope: 'single',
    type: 'attack',
    hitRate: 0.15
  },

// --- 古明地恋 (Koishi Komeiji) ---
  'koishi_philosophy': {
    name: '「被嫌恶者的菲尔佐之哲学」',
    description: '无意识的攻击，根本无法预测。',
    cost: 75,
    damage: 210,
    scope: 'single',
    type: 'attack',
    isUltimate: true,
    hitRate: 1.0
  },
  'koishi_super_ego': {
    name: '抑制「超级自我」',
    description: '释放潜意识的力量。',
    cost: 40,
    damage: 70,
    scope: 'aoe',
    type: 'attack',
    hitRate: 0.1
  },
  'koishi_id_release': {
    name: '本能「本我的解放」',
    description: '完全释放本能进行攻击。',
    cost: 45,
    damage: 85,
    scope: 'single',
    type: 'attack',
    hitRate: 0.1
  },
  'koishi_dying_love': {
    name: '没落「死绝之恋」',
    description: '无意识中释放的毁灭爱意。',
    cost: 40,
    damage: 75,
    scope: 'single',
    type: 'attack',
    hitRate: 0.15
  },

// --- 灵乌路空 (Utsuho Reiuji) ---
  'utsuho_hell_sun': {
    name: '「地狱的人工太阳」',
    description: '召唤微型太阳，将一切化为灰烬。',
    cost: 90,
    damage: 230,
    scope: 'aoe',
    type: 'attack',
    isUltimate: true,
    hitRate: 1.0
  },
  'utsuho_gigaf_flare': {
    name: '核热「核反应控制不能」',
    description: '释放失控的核热能量。',
    cost: 50,
    damage: 90,
    scope: 'aoe',
    type: 'attack',
    hitRate: 0.1
  },
  'utsuho_subterranean_sun': {
    name: '爆符「十个太阳」',
    description: '连续的爆炸攻击。',
    cost: 40,
    damage: 75,
    scope: 'single',
    type: 'attack',
    hitRate: 0.1
  },
  'utsuho_nuclear_shield': {
    name: '遮光「核热护盾」',
    description: '用高热阻挡攻击。',
    cost: 40,
    damage: 0,
    scope: 'single',
    type: 'shield',
    hitRate: 1.0,
    buffDetails: {
        name: '核热盾',
        duration: 2,
        description: '获得护盾',
        effects: [{ type: 'shield', value: 110, isPercentage: false }]
    }
  },

// --- 火焰猫燐 (Rin Kaenbyou) ---
  'orin_corpse_cart': {
    name: '「死灰复燃」',
    description: '召唤怨灵车轮碾压敌人。',
    cost: 65,
    damage: 180,
    scope: 'single',
    type: 'attack',
    isUltimate: true,
    hitRate: 1.0
  },
  'orin_cat_walk': {
    name: '猫符「怨灵猫乱步」',
    description: '如猫般灵巧而诡异的步伐。',
    cost: 30,
    damage: 55,
    scope: 'single',
    type: 'attack',
    hitRate: 0.2
  },
  'orin_spleen_eater': {
    name: '恨灵「脾脏蛀食者」',
    description: '怨灵啃食敌人的生命。',
    cost: 35,
    damage: 40,
    scope: 'single',
    type: 'attack',
    hitRate: 0.15,
    buffDetails: {
        name: '生命流失',
        duration: 3,
        description: '持续受到伤害',
        effects: [{ type: 'damage_over_time', value: 25, isPercentage: false }]
    }
  },

// --- 伊吹萃香 (Suika Ibuki) ---
  'suika_million_demons': {
    name: '「百万鬼夜行」',
    description: '召唤无数的小萃香进行群殴。',
    cost: 80,
    damage: 220,
    scope: 'aoe',
    type: 'attack',
    isUltimate: true,
    hitRate: 1.0
  },
  'suika_missing_power': {
    name: '鬼神「失落的力量」',
    description: '巨大化后的一击。',
    cost: 45,
    damage: 90,
    scope: 'single',
    type: 'attack',
    hitRate: 0.1
  },
  'suika_throw': {
    name: '萃符「户隐山之投」',
    description: '投掷巨石攻击。',
    cost: 35,
    damage: 70,
    scope: 'single',
    type: 'attack',
    hitRate: 0.1
  },
  'suika_mist': {
    name: '鬼气「蒙蒙迷雾」',
    description: '化为雾气躲避攻击。',
    cost: 35,
    damage: 0,
    scope: 'single',
    type: 'buff',
    hitRate: 1.0,
    buffDetails: {
        name: '雾化',
        duration: 2,
        description: '闪避率大幅提升',
        effects: [{ type: 'dodge_mod', value: 0.3, isPercentage: true }]
    }
  },

// --- 永江衣玖 (Iku Nagae) ---
  'iku_thunder_fish': {
    name: '「雷云棘鱼」',
    description: '召唤雷云释放强力闪电。',
    cost: 70,
    damage: 170,
    scope: 'aoe',
    type: 'attack',
    isUltimate: true,
    hitRate: 1.0
  },
  'iku_dragon_palace': {
    name: '雷符「神鸣的龙宫」',
    description: '龙宫的雷鸣。',
    cost: 40,
    damage: 65,
    scope: 'aoe',
    type: 'attack',
    hitRate: 0.1
  },
  'iku_veils': {
    name: '羽衣「羽衣若如空」',
    description: '身轻如燕，难以捉摸。',
    cost: 30,
    damage: 0,
    scope: 'single',
    type: 'buff',
    hitRate: 1.0,
    buffDetails: {
        name: '羽衣',
        duration: 3,
        description: '闪避率提升',
        effects: [{ type: 'dodge_mod', value: 0.2, isPercentage: true }]
    }
  },

// --- 比那名居天子 (Tenshi Hinanawi) ---
  'tenshi_scarlet_weather': {
    name: '「全人类的绯想天」',
    description: '发动绯想天之剑的力量，引发天变地异。',
    cost: 80,
    damage: 210,
    scope: 'aoe',
    type: 'attack',
    isUltimate: true,
    hitRate: 1.0
  },
  'tenshi_keystone': {
    name: '要石「天空之灵石」',
    description: '投掷巨大的要石。',
    cost: 40,
    damage: 75,
    scope: 'single',
    type: 'attack',
    hitRate: 0.1
  },
  'tenshi_earth_sword': {
    name: '地符「不让土壤之剑」',
    description: '操控大地之气进行攻击。',
    cost: 35,
    damage: 60,
    scope: 'single',
    type: 'attack',
    hitRate: 0.1
  },
  'tenshi_weather_sword': {
    name: '气符「天启气象之剑」',
    description: '聚集气象之力于剑上。',
    cost: 35,
    damage: 0,
    scope: 'single',
    type: 'buff',
    hitRate: 1.0,
    buffDetails: {
        name: '气象剑',
        duration: 3,
        description: '攻击力提升',
        effects: [{ type: 'stat_mod', targetStat: 'attack', value: 0.25, isPercentage: true }]
    }
  },

// --- 风见幽香 (Yuuka Kazami) ---
  'yuuka_gensokyo_flower': {
    name: '「幻想乡的开花」',
    description: '让鲜花开遍战场，以自然之力吞噬敌人。',
    cost: 85,
    damage: 240,
    scope: 'aoe',
    type: 'attack',
    isUltimate: true,
    hitRate: 1.0
  },
  'yuuka_master_spark': {
    name: '花符「幻想乡的开花」',
    description: '虽然名字一样，但这是双重魔炮。',
    cost: 50,
    damage: 85,
    scope: 'single',
    type: 'attack',
    hitRate: 0.1
  },
  'yuuka_flower_bird': {
    name: '幻想「花鸟风月，啸风弄月」',
    description: '自然之美的致命一击。',
    cost: 50,
    damage: 95,
    scope: 'aoe',
    type: 'attack',
    hitRate: 0.1
  },

// --- 小野冢小町 (Komachi Onozuka) ---
  'komachi_scythe': {
    name: '「死者选别的镰刀」',
    description: '挥舞巨大的镰刀收割灵魂。',
    cost: 65,
    damage: 190,
    scope: 'single',
    type: 'attack',
    isUltimate: true,
    hitRate: 1.0
  },
  'komachi_exchange': {
    name: '换命「不惜身命，可惜身命」',
    description: '操控距离与寿命的法术。',
    cost: 35,
    damage: 60,
    scope: 'single',
    type: 'attack',
    hitRate: 0.1
  },
  'komachi_fog_crossing': {
    name: '死歌「八重雾之渡」',
    description: '迷雾中的摆渡。',
    cost: 35,
    damage: 60,
    scope: 'aoe',
    type: 'attack',
    hitRate: 0.1
  },

// --- 四季映姬·夜摩仙那度 (Eiki Shiki, Yamaxanadu) ---
  'eiki_last_judgment': {
    name: '「最后的审判」',
    description: '对罪人降下最终的裁决。',
    cost: 80,
    damage: 250,
    scope: 'single',
    type: 'attack',
    isUltimate: true,
    hitRate: 1.0
  },
  'eiki_ten_kings': {
    name: '审判「十王裁判」',
    description: '十殿阎罗的审判。',
    cost: 45,
    damage: 80,
    scope: 'aoe',
    type: 'attack',
    hitRate: 0.1
  },
  'eiki_court': {
    name: '是非「是非曲直厅」',
    description: '公正无私的灵力冲击。',
    cost: 35,
    damage: 65,
    scope: 'single',
    type: 'attack',
    hitRate: 0.1
  },
  'eiki_guilty_or_not': {
    name: '审判「有罪还是无罪」',
    description: '威严的审问。',
    cost: 30,
    damage: 40,
    scope: 'single',
    type: 'debuff',
    hitRate: 1.0,
    buffDetails: {
        name: '审判',
        duration: 2,
        description: '全属性降低',
        effects: [{ type: 'stat_mod', targetStat: 'attack', value: -0.1, isPercentage: true }]
    }
  },

// --- 河城荷取 (Nitori Kawashiro) ---
  'nitori_poltergeist': {
    name: '「河童的波尔特盖斯特」',
    description: '引发骚灵现象进行攻击。',
    cost: 60,
    damage: 150,
    scope: 'aoe',
    type: 'attack',
    isUltimate: true,
    hitRate: 1.0
  },
  'nitori_optical_camo': {
    name: '光学「光学迷彩」',
    description: '隐身并提升闪避。',
    cost: 30,
    damage: 0,
    scope: 'single',
    type: 'buff',
    buffDetails: {
        name: '光学迷彩',
        duration: 3,
        description: '大幅提升闪避率',
        effects: [{ type: 'dodge_mod', value: 0.3, isPercentage: true }]
    }
  },
  'nitori_water': {
    name: '水符「河童之河流」',
    description: '高压水流冲击。',
    cost: 30,
    damage: 55,
    scope: 'single',
    type: 'attack',
    hitRate: 0.1
  },
  'nitori_arm_extension': {
    name: '河童「延展手臂」',
    description: '伸长手臂进行远程打击。',
    cost: 25,
    damage: 50,
    scope: 'single',
    type: 'attack',
    hitRate: 0.2
  },

// --- 键山雏 (Hina Kagiyama) ---
  'hina_misfortune': {
    name: '「厄神大人的元旦」',
    description: '释放积累的厄运。',
    cost: 70,
    damage: 160,
    scope: 'aoe',
    type: 'attack',
    isUltimate: true,
    hitRate: 1.0
  },
  'hina_wheel': {
    name: '厄符「厄运之轮」',
    description: '旋转的厄运之轮。',
    cost: 35,
    damage: 60,
    scope: 'single',
    type: 'attack',
    hitRate: 0.1
  },
  'hina_misfortune_wheel': {
    name: '厄符「厄运之轮」',
    description: '旋转的厄运。',
    cost: 30,
    damage: 45,
    scope: 'single',
    type: 'debuff',
    hitRate: 1.0,
    buffDetails: {
        name: '厄运缠身',
        duration: 3,
        description: '命中率降低',
        effects: [{ type: 'stat_mod', targetStat: 'attack', value: -0.15, isPercentage: true }]
    }
  },

// --- 圣白莲 (Byakuren Hijiri) ---
  'byakuren_devil_recitation': {
    name: '「大魔法『魔神复诵』」',
    description: '咏唱强力魔法强化自身并攻击。',
    cost: 80,
    damage: 230,
    scope: 'single',
    type: 'attack',
    isUltimate: true,
    hitRate: 1.0
  },
  'byakuren_purple_cloud': {
    name: '魔法「紫云之恩」',
    description: '提升身体能力的魔法。',
    cost: 40,
    damage: 0,
    scope: 'single',
    type: 'buff',
    buffDetails: {
        name: '超人化',
        duration: 3,
        description: '全属性提升',
        effects: [
            { type: 'stat_mod', targetStat: 'attack', value: 0.2, isPercentage: true },
            { type: 'stat_mod', targetStat: 'defense', value: 0.2, isPercentage: true }
        ]
    }
  },
  'byakuren_bowl': {
    name: '飞钵「飞行的托钵」',
    description: '操控巨大的钵进行撞击。',
    cost: 35,
    damage: 70,
    scope: 'single',
    type: 'attack',
    hitRate: 0.1
  },

  // --- 丰聪耳神子 (Toyosatomimi no Miko) ---
  'miko_sunrise': {
    name: '「日出之国的神子」',
    description: '如太阳般耀眼的光辉。',
    cost: 80,
    damage: 200,
    scope: 'aoe',
    type: 'attack',
    isUltimate: true,
    hitRate: 1.0
  },
  'miko_taoism': {
    name: '仙符「日出之处的道士」',
    description: '道教的秘法攻击。',
    cost: 40,
    damage: 75,
    scope: 'single',
    type: 'attack',
    hitRate: 0.1
  },
  'miko_summon': {
    name: '召唤「豪族乱舞」',
    description: '召唤豪族之灵协助攻击。',
    cost: 45,
    damage: 80,
    scope: 'single',
    type: 'attack',
    hitRate: 0.1
  },

  // --- 纯狐 (Junko) ---
  'junko_pure_madness': {
    name: '「纯粹的狂气」',
    description: '不掺杂任何杂质的纯粹攻击。',
    cost: 90,
    damage: 270,
    scope: 'single',
    type: 'attack',
    isUltimate: true,
    hitRate: 1.0
  },
  'junko_pure_light': {
    name: '掌上的纯光',
    description: '手中的纯净光辉。',
    cost: 45,
    damage: 85,
    scope: 'aoe',
    type: 'attack',
    hitRate: 0.2
  },

  // --- 赫卡提亚·拉碧斯拉祖利 (Hecatia Lapislazuli) ---
  'hecatia_otherworld': {
    name: '「异界地狱」',
    description: '展现三个世界的地狱之力。',
    cost: 95,
    damage: 260,
    scope: 'aoe',
    type: 'attack',
    isUltimate: true,
    hitRate: 1.0
  },
  'hecatia_hell_gate': {
    name: '异界「地狱之门」',
    description: '打开地狱之门释放能量。',
    cost: 50,
    damage: 90,
    scope: 'single',
    type: 'attack',
    hitRate: 0.1
  },

  // --- 摩多罗隐岐奈 (Okina Matara) ---
  'okina_secret_god': {
    name: '「秘神的游戏」',
    description: '操控生命力的神秘仪式。',
    cost: 85,
    damage: 220,
    scope: 'aoe',
    type: 'attack',
    isUltimate: true,
    hitRate: 1.0
  },
  'okina_back_door': {
    name: '后户「疯狂的后户」',
    description: '从后户释放出的魔力。',
    cost: 45,
    damage: 80,
    scope: 'single',
    type: 'attack',
    hitRate: 0.1
  },

  // --- 埴安神袿姬 (Keiki Haniyasushin) ---
  'keiki_idol_creator': {
    name: '「偶像创造」',
    description: '创造出完美的偶像（战力）。',
    cost: 80,
    damage: 210,
    scope: 'aoe',
    type: 'attack',
    isUltimate: true,
    hitRate: 1.0
  },
  'keiki_haniwa': {
    name: '埴轮「弓兵埴轮」',
    description: '召唤埴轮军团射击。',
    cost: 40,
    damage: 70,
    scope: 'single',
    type: 'attack',
    hitRate: 0.1
  },

  // --- 饕餮尤魔 (Yuuma Toutetsu) ---
  'yuuma_greed': {
    name: '「强欲的吞噬」',
    description: '吞噬一切的饕餮之力。',
    cost: 85,
    damage: 230,
    scope: 'single',
    type: 'attack',
    isUltimate: true,
    hitRate: 1.0
  },
  'yuuma_oil': {
    name: '刚欲「黑油之海」',
    description: '召唤黑油淹没敌人。',
    cost: 45,
    damage: 80,
    scope: 'aoe',
    type: 'attack',
    hitRate: 0.1
  },

  // --- 鬼人正邪 (Seija Kijin) ---
  'seija_reverse': {
    name: '「逆转天地」',
    description: '颠倒一切常识的攻击。',
    cost: 70,
    damage: 180,
    scope: 'single',
    type: 'attack',
    isUltimate: true,
    hitRate: 1.0
  },
  'seija_class_reversal': {
    name: '逆符「阶级反转」',
    description: '下克上的强力一击。',
    cost: 35,
    damage: 65,
    scope: 'single',
    type: 'attack',
    hitRate: 0.2
  },

  // --- 少名针妙丸 (Shinmyoumaru Sukuna) ---
  'shinmyoumaru_little_hell': {
    name: '「小人的地狱」',
    description: '虽然小，但如同地狱般的压迫感。',
    cost: 75,
    damage: 170,
    scope: 'aoe',
    type: 'attack',
    isUltimate: true,
    hitRate: 1.0
  },
  'shinmyoumaru_mallet': {
    name: '宝槌「大得要死的万宝槌」',
    description: '挥舞变大的万宝槌砸向敌人。',
    cost: 40,
    damage: 75,
    scope: 'single',
    type: 'attack',
    hitRate: 0.1
  },

  // --- 秦心 (Hata no Kokoro) ---
  'kokoro_dance': {
    name: '「假面丧心舞」',
    description: '操控感情的舞蹈。',
    cost: 75,
    damage: 170,
    scope: 'aoe',
    type: 'attack',
    isUltimate: true,
    hitRate: 1.0
  },
  'kokoro_worry': {
    name: '忧面「杞人忧天」',
    description: '释放忧郁的情绪波。',
    cost: 35,
    damage: 60,
    scope: 'single',
    type: 'attack',
    hitRate: 0.1
  },

  // --- 茨木华扇 (Kasen Ibaraki) ---
  'kasen_dragon': {
    name: '「包仙鸣动」',
    description: '解放鬼之力的全力一击。',
    cost: 80,
    damage: 230,
    scope: 'single',
    type: 'attack',
    isUltimate: true,
    hitRate: 1.0
  },
  'kasen_dragon_tooth': {
    name: '龙符「龙之牙」',
    description: '召唤龙牙撕碎敌人。',
    cost: 40,
    damage: 75,
    scope: 'single',
    type: 'attack',
    hitRate: 0.1
  },

  // --- 宇佐见堇子 (Sumireko Usami) ---
  'sumireko_seven_wonders': {
    name: '「深秘的七大不可思议」',
    description: '利用都市传说具现化进行攻击。',
    cost: 75,
    damage: 160,
    scope: 'aoe',
    type: 'attack',
    isUltimate: true,
    hitRate: 1.0
  },
  'sumireko_3d_printer': {
    name: '枪符「3D打印机之枪」',
    description: '虽然是假枪，但威力不俗。',
    cost: 35,
    damage: 65,
    scope: 'single',
    type: 'attack',
    hitRate: 0.1
  },

  // --- 铃瑚 (Ringo) ---
  'ringo_dango': {
    name: '「团子雨」',
    description: '无数的团子落下攻击（其实很痛）。',
    cost: 60,
    damage: 140,
    scope: 'aoe',
    type: 'attack',
    isUltimate: true,
    hitRate: 1.0
  },
  'ringo_snack': {
    name: '兔符「草莓团子」',
    description: '吃团子恢复体力。',
    cost: 30,
    damage: 0,
    scope: 'single',
    type: 'heal',
    buffDetails: {
        name: '美味团子',
        duration: 1,
        description: '恢复少量生命',
        effects: [{ type: 'heal', value: 50, isPercentage: false }]
    }
  },

  // --- 清兰 (Seiran) ---
  'seiran_moon_rabbit': {
    name: '「月之兔」',
    description: '月兔特种部队的全力射击。',
    cost: 60,
    damage: 150,
    scope: 'single',
    type: 'attack',
    isUltimate: true,
    hitRate: 1.0
  },
  'seiran_hammer': {
    name: '杵符「狂月的捣年糕」',
    description: '用巨大的杵砸击敌人。',
    cost: 35,
    damage: 60,
    scope: 'single',
    type: 'attack',
    hitRate: 0.1
  },

  // --- 克劳恩皮丝 (Clownpiece) ---
  'clownpiece_hell_eclipse': {
    name: '「地狱蚀」',
    description: '将敌人笼罩在疯狂的月光下。',
    cost: 80,
    damage: 190,
    scope: 'aoe',
    type: 'attack',
    isUltimate: true,
    hitRate: 1.0
  },
  'clownpiece_star': {
    name: '狱符「地狱之星」',
    description: '投掷星形弹幕。',
    cost: 40,
    damage: 70,
    scope: 'single',
    type: 'attack',
    hitRate: 0.1
  },

  // --- 哆来咪·苏伊特 (Doremy Sweet) ---
  'doremy_nightmare': {
    name: '羊符「噩梦羊」',
    description: '让敌人陷入无尽的噩梦。',
    cost: 70,
    damage: 180,
    scope: 'single',
    type: 'attack',
    isUltimate: true,
    hitRate: 1.0
  },
  'doremy_dream_eater': {
    name: '梦符「食梦貘」',
    description: '吞噬敌人的美梦（造成精神伤害）。',
    cost: 35,
    damage: 60,
    scope: 'single',
    type: 'attack',
    hitRate: 0.1
  },

  // --- 依神女苑 (Jo'on Yorigami) ---
  'joon_possession': {
    name: '「凭依剥夺」',
    description: '强制夺取敌人的财物和运气。',
    cost: 75,
    damage: 170,
    scope: 'single',
    type: 'attack',
    isUltimate: true,
    hitRate: 1.0
  },
  'joon_extortion': {
    name: '夺符「强欲的掠夺」',
    description: '从敌人身上榨取力量。',
    cost: 40,
    damage: 65,
    scope: 'single',
    type: 'attack',
    hitRate: 0.1
  },

  // --- 依神紫苑 (Shion Yorigami) ---
  'shion_poverty_god': {
    name: '「贫穷神」',
    description: '附身敌人，使其陷入极度的不幸。',
    cost: 70,
    damage: 150,
    scope: 'aoe',
    type: 'debuff',
    isUltimate: true,
    hitRate: 1.0,
    buffDetails: {
        name: '超级贫穷神',
        duration: 3,
        description: '攻击与防御大幅下降',
        effects: [
            { type: 'stat_mod', targetStat: 'attack', value: -0.25, isPercentage: true },
            { type: 'stat_mod', targetStat: 'defense', value: -0.25, isPercentage: true }
        ]
    }
  },
  'shion_bad_luck': {
    name: '贫符「超级贫穷」',
    description: '让敌人变得倒霉。',
    cost: 30,
    damage: 40,
    scope: 'single',
    type: 'attack',
    hitRate: 0.1
  },

  // --- 饭纲丸龙 (Megumu Iizunamaru) ---
  'megumu_tengu': {
    name: '「饭纲权现」',
    description: '大天狗的神力显现。',
    cost: 80,
    damage: 180,
    scope: 'aoe',
    type: 'attack',
    isUltimate: true,
    hitRate: 1.0
  },
  'megumu_wind': {
    name: '星符「天魔之星」',
    description: '如流星般坠落的攻击。',
    cost: 40,
    damage: 75,
    scope: 'single',
    type: 'attack',
    hitRate: 0.1
  },

  // --- 骊驹早鬼 (Saki Kurokoma) ---
  'saki_pegasus': {
    name: '「天马行空」',
    description: '展现劲牙组老大的怪力。',
    cost: 80,
    damage: 220,
    scope: 'single',
    type: 'attack',
    isUltimate: true,
    hitRate: 1.0
  },
  'saki_kick': {
    name: '劲符「黑马的飞踢」',
    description: '强力的一击飞踢。',
    cost: 40,
    damage: 80,
    scope: 'single',
    type: 'attack',
    hitRate: 0.1
  },

  // --- 丁礼田舞 (Mai Teireida) ---
  'mai_dance': {
    name: '「狂舞」',
    description: '引导生命力的疯狂舞蹈。',
    cost: 70,
    damage: 160,
    scope: 'aoe',
    type: 'attack',
    isUltimate: true,
    hitRate: 1.0
  },
  'mai_bamboo': {
    name: '竹符「竹林之舞」',
    description: '如竹林般茂密的弹幕。',
    cost: 35,
    damage: 60,
    scope: 'single',
    type: 'attack',
    hitRate: 0.1
  },

  // --- 尔子田里乃 (Satono Okina) ---
  'satono_dance': {
    name: '「狂舞」',
    description: '引导精神力的疯狂舞蹈。',
    cost: 70,
    damage: 160,
    scope: 'aoe',
    type: 'attack',
    isUltimate: true,
    hitRate: 1.0
  },

  // --- 桑妮·米尔克 (Sunny Milk) ---
  'sunny_sun_burst': {
    name: '日符「阳光爆发」',
    description: '汇聚阳光进行的爆炸攻击。',
    cost: 50,
    damage: 130,
    scope: 'single',
    type: 'attack',
    isUltimate: true,
    hitRate: 1.0
  },
  'sunny_refraction': {
    name: '光符「折射的彩虹」',
    description: '利用光线折射迷惑敌人。',
    cost: 30,
    damage: 0,
    scope: 'single',
    type: 'buff',
    buffDetails: {
        name: '光之折射',
        duration: 2,
        description: '闪避率提升',
        effects: [{ type: 'dodge_mod', value: 0.15, isPercentage: true }]
    }
  },
  'sunny_solar_beam': {
    name: '日符「太阳光束」',
    description: '虽然是小妖精，但也能发射光束。',
    cost: 25,
    damage: 50,
    scope: 'single',
    type: 'attack',
    hitRate: 0.1
  },
  'sunny_sun_reflection': {
    name: '日符「阳光反射」',
    description: '利用反射干扰视线。',
    cost: 25,
    damage: 0,
    scope: 'single',
    type: 'buff',
    hitRate: 1.0,
    buffDetails: {
        name: '反射',
        duration: 2,
        description: '闪避率提升',
        effects: [{ type: 'dodge_mod', value: 0.15, isPercentage: true }]
    }
  },

// --- 露娜·切露德 (Luna Child) ---
  'luna_moonlight_ray': {
    name: '月符「月光射线」',
    description: '宁静而致命的月光。',
    cost: 50,
    damage: 125,
    scope: 'single',
    type: 'attack',
    isUltimate: true,
    hitRate: 1.0
  },
  'luna_silence': {
    name: '静符「无声的夜晚」',
    description: '消除周围的声音，便于偷袭。',
    cost: 25,
    damage: 45,
    scope: 'single',
    type: 'attack',
    hitRate: 0.2
  },
  'luna_moon_stone': {
    name: '月符「月之石」',
    description: '投掷发光的石头。',
    cost: 20,
    damage: 40,
    scope: 'single',
    type: 'attack',
    hitRate: 0.1
  },
  'luna_silent_night': {
    name: '月符「静谧之夜」',
    description: '安静的夜晚适合休息。',
    cost: 30,
    damage: 0,
    scope: 'single',
    type: 'heal',
    hitRate: 1.0,
    buffDetails: {
        name: '静谧',
        duration: 1,
        description: '恢复生命',
        effects: [{ type: 'heal', value: 50, isPercentage: false }]
    }
  },

// --- 斯塔·萨菲雅 (Star Sapphire) ---
  'star_star_laser': {
    name: '星符「星光镭射」',
    description: '从星辰中汲取力量的激光。',
    cost: 50,
    damage: 120,
    scope: 'aoe',
    type: 'attack',
    isUltimate: true,
    hitRate: 1.0
  },
  'star_meteor_shower': {
    name: '流星「小流星雨」',
    description: '召唤小型流星雨。',
    cost: 30,
    damage: 55,
    scope: 'aoe',
    type: 'attack',
    hitRate: 0.1
  },
  'star_detection': {
    name: '探符「星之探测」',
    description: '感知敌人的动向。',
    cost: 25,
    damage: 0,
    scope: 'single',
    type: 'buff',
    buffDetails: {
        name: '星之感知',
        duration: 3,
        description: '命中率提升',
        effects: [{ type: 'stat_mod', targetStat: 'attack', value: 0.1, isPercentage: true }]
    }
  },
  'star_twinkle_star': {
    name: '星符「闪烁之星」',
    description: '一闪一闪亮晶晶。',
    cost: 25,
    damage: 45,
    scope: 'single',
    type: 'attack',
    hitRate: 0.15
  },

// --- 上白泽慧音 (Keine Kamishirasawa) ---
  'keine_history_creation': {
    name: '「日出之国的创造」',
    description: '创造新的历史（攻击）。',
    cost: 70,
    damage: 160,
    scope: 'single',
    type: 'attack',
    isUltimate: true,
    hitRate: 1.0
  },
  'keine_old_history': {
    name: '旧史「旧秘境史」',
    description: '挖掘过去的历史进行攻击。',
    cost: 35,
    damage: 60,
    scope: 'single',
    type: 'attack',
    hitRate: 0.1
  },
  'keine_headbutt': {
    name: '野符「武烈危机」',
    description: '强力的头槌攻击。',
    cost: 30,
    damage: 70,
    scope: 'single',
    type: 'attack',
    hitRate: 0.1
  },
  'keine_history_eater': {
    name: '产灵「吞食历史」',
    description: '消除敌人的攻击意图。',
    cost: 35,
    damage: 45,
    scope: 'single',
    type: 'debuff',
    hitRate: 1.0,
    buffDetails: {
        name: '遗忘',
        duration: 2,
        description: '攻击力降低',
        effects: [{ type: 'stat_mod', targetStat: 'attack', value: -0.2, isPercentage: true }]
    }
  },

// --- 云居一轮 (Ichirin Kumoi) ---
  'ichirin_unkazan': {
    name: '怒号「云山之怒」',
    description: '云山的全力一击。',
    cost: 65,
    damage: 155,
    scope: 'single',
    type: 'attack',
    isUltimate: true,
    hitRate: 1.0
  },
  'ichirin_fist': {
    name: '铁拳「问答无用的铁拳」',
    description: '巨大的拳头砸向敌人。',
    cost: 35,
    damage: 75,
    scope: 'single',
    type: 'attack',
    hitRate: 0.1
  },
  'ichirin_thunder': {
    name: '雷符「颤抖的雷云」',
    description: '从云山释放雷电。',
    cost: 30,
    damage: 55,
    scope: 'aoe',
    type: 'attack',
    hitRate: 0.1
  },
  'ichirin_fist_smash': {
    name: '铁拳「问答无用的铁拳」',
    description: '云山的巨大拳头。',
    cost: 40,
    damage: 70,
    scope: 'single',
    type: 'attack',
    hitRate: 0.15
  },

// --- 今泉影狼 (Kagerou Imaizumi) ---
  'kagerou_full_moon': {
    name: '狼符「满月下的咆哮」',
    description: '满月之夜的狼人是最强的。',
    cost: 60,
    damage: 145,
    scope: 'single',
    type: 'attack',
    isUltimate: true,
    hitRate: 1.0
  },
  'kagerou_claw': {
    name: '天狼「高速扑杀」',
    description: '快速的利爪攻击。',
    cost: 30,
    damage: 65,
    scope: 'single',
    type: 'attack',
    hitRate: 0.2
  },
  'kagerou_wolf_fang': {
    name: '狼牙「嗜血之牙」',
    description: '狼人的撕咬。',
    cost: 30,
    damage: 55,
    scope: 'single',
    type: 'attack',
    hitRate: 0.2
  },

// --- 八坂神奈子 (Kanako Yasaka) ---
  'kanako_mountain_god': {
    name: '「神之御柱」',
    description: '召唤巨大的御柱粉碎敌人。',
    cost: 85,
    damage: 210,
    scope: 'aoe',
    type: 'attack',
    isUltimate: true,
    hitRate: 1.0
  },
  'kanako_onbashira1': {
    name: '神符「御柱」',
    description: '投掷御柱攻击。',
    cost: 40,
    damage: 80,
    scope: 'single',
    type: 'attack',
    hitRate: 0.1
  },
  'kanako_divine_wind': {
    name: '神祭「扩展御柱」',
    description: '御柱引发的冲击波。',
    cost: 45,
    damage: 75,
    scope: 'aoe',
    type: 'attack',
    hitRate: 0.1
  },
  'kanako_onbashira2': {
    name: '神祭「扩展御柱」',
    description: '御柱砸击。',
    cost: 45,
    damage: 80,
    scope: 'aoe',
    type: 'attack',
    hitRate: 0.1
  },

// --- 吉吊八千慧 (Yachie Kicchou) ---
  'yachie_otter': {
    name: '「鬼杰组的威光」',
    description: '展现龙龟的绝对支配力。',
    cost: 80,
    damage: 180,
    scope: 'single',
    type: 'attack',
    isUltimate: true,
    hitRate: 1.0
  },
  'yachie_shell': {
    name: '龟符「坚固之甲」',
    description: '强化防御。',
    cost: 35,
    damage: 0,
    scope: 'single',
    type: 'buff',
    buffDetails: {
        name: '铁壁',
        duration: 3,
        description: '大幅提升防御力',
        effects: [{ type: 'stat_mod', targetStat: 'defense', value: 0.3, isPercentage: true }]
    }
  },
  'yachie_command': {
    name: '鬼符「搦手之法」',
    description: '无法违抗的命令攻击。',
    cost: 40,
    damage: 70,
    scope: 'single',
    type: 'attack',
    hitRate: 0.2
  },
  'yachie_turtle_shell': {
    name: '龟甲「坚不可摧」',
    description: '绝对的防御。',
    cost: 40,
    damage: 0,
    scope: 'single',
    type: 'shield',
    hitRate: 1.0,
    buffDetails: {
        name: '龟甲',
        duration: 3,
        description: '获得护盾',
        effects: [{ type: 'shield', value: 100, isPercentage: false }]
    }
  },

// --- 娜兹玲 (Nazrin) ---
  'nazrin_pendulum': {
    name: '视符「娜兹玲灵摆」',
    description: '寻找宝物（和敌人弱点）的灵摆。',
    cost: 55,
    damage: 130,
    scope: 'single',
    type: 'attack',
    isUltimate: true,
    hitRate: 1.0
  },
  'nazrin_rod': {
    name: '棒符「忙碌的探知棒」',
    description: '挥舞探知棒攻击。',
    cost: 25,
    damage: 50,
    scope: 'single',
    type: 'attack',
    hitRate: 0.1
  },
  'nazrin_gold_rush': {
    name: '宝塔「黄金宝塔」',
    description: '虽然不是自己的，但能释放激光。',
    cost: 35,
    damage: 60,
    scope: 'single',
    type: 'attack',
    hitRate: 0.1
  },
  'nazrin_treasure_hunter': {
    name: '搜符「珍稀物品探测」',
    description: '寻找敌人的弱点。',
    cost: 25,
    damage: 40,
    scope: 'single',
    type: 'attack',
    hitRate: 0.2
  },

// --- 宫古芳香 (Yoshika Miyako) ---
  'yoshika_heal': {
    name: '「恢复吧」',
    description: '吸收周围的灵气恢复自身。',
    cost: 60,
    damage: 0,
    scope: 'single',
    type: 'heal',
    isUltimate: true,
    hitRate: 1.0,
    buffDetails: {
        name: '僵尸再生',
        duration: 1,
        description: '大幅恢复生命',
        effects: [{ type: 'heal', value: 300, isPercentage: false }]
    }
  },
  'yoshika_poison_claw': {
    name: '毒爪「死毒之爪」',
    description: '带有尸毒的爪击。',
    cost: 30,
    damage: 50,
    scope: 'single',
    type: 'attack',
    hitRate: 0.1,
    buffDetails: {
        name: '尸毒',
        duration: 3,
        description: '每回合受到真实伤害',
        effects: [{ type: 'damage_over_time', value: 20, isPercentage: false }]
    }
  },
  'zombie_heal': {
    name: '回复「僵尸再生」',
    description: '僵尸是不死的。',
    cost: 35,
    damage: 0,
    scope: 'single',
    type: 'heal',
    hitRate: 1.0,
    buffDetails: {
        name: '再生',
        duration: 2,
        description: '恢复生命',
        effects: [{ type: 'heal', value: 60, isPercentage: false }]
    }
  },

// --- 寅丸星 (Shou Toramaru) ---
  'shou_pagoda': {
    name: '「佛光普照」',
    description: '宝塔释放出的无量光辉。',
    cost: 80,
    damage: 100,
    scope: 'aoe',
    type: 'attack',
    isUltimate: true,
    hitRate: 1.0
  },
  'shou_tiger': {
    name: '寅符「饥饿的老虎」',
    description: '如猛虎下山般的攻击。',
    cost: 40,
    damage: 80,
    scope: 'single',
    type: 'attack',
    hitRate: 0.1
  },
  'shou_laser': {
    name: '光符「绝对正义」',
    description: '正义的激光制裁。',
    cost: 45,
    damage: 85,
    scope: 'single',
    type: 'attack',
    hitRate: 0.1
  },
  'shou_jeweled_pagoda': {
    name: '宝塔「光辉宝塔」',
    description: '宝塔释放的光辉。',
    cost: 40,
    damage: 65,
    scope: 'aoe',
    type: 'attack',
    hitRate: 0.1
  },

// --- 封兽鵺 (Nue Houjuu) ---
  'nue_ufo': {
    name: '「正体不明的黑暗」',
    description: '召唤不明飞行物进行轰炸。',
    cost: 75,
    damage: 95,
    scope: 'aoe',
    type: 'attack',
    isUltimate: true,
    hitRate: 1.0
  },
  'nue_snake': {
    name: '恨弓「源三位赖政之弓」',
    description: '难以捉摸的箭矢。',
    cost: 35,
    damage: 65,
    scope: 'single',
    type: 'attack',
    hitRate: 0.2
  },
  'nue_danmaku': {
    name: '正体不明「愤怒的红云」',
    description: '红色的弹幕云。',
    cost: 40,
    damage: 70,
    scope: 'aoe',
    type: 'attack',
    hitRate: 0.1
  },
  'nue_undefined_darkness': {
    name: '正体不明「黑暗中的恐惧」',
    description: '看不清真面目的攻击。',
    cost: 35,
    damage: 55,
    scope: 'single',
    type: 'attack',
    hitRate: 0.15
  },

// --- 小恶魔 (Koakuma) ---
  'koakuma_support': {
    name: '「恶魔的支援」',
    description: '尽力支援主人（或队友）。',
    cost: 50,
    damage: 0,
    scope: 'single',
    type: 'buff',
    isUltimate: true,
    hitRate: 1.0,
    buffDetails: {
        name: '恶魔强化',
        duration: 3,
        description: '全属性小幅提升',
        effects: [
            { type: 'stat_mod', targetStat: 'attack', value: 0.15, isPercentage: true },
            { type: 'stat_mod', targetStat: 'defense', value: 0.15, isPercentage: true }
        ]
    }
  },
  'koakuma_fireball': {
    name: '火球术',
    description: '普通的恶魔火球。',
    cost: 20,
    damage: 40,
    scope: 'single',
    type: 'attack',
    hitRate: 0.1
  },
  'koakuma_little_devil': {
    name: '魔符「小恶魔的恶作剧」',
    description: '烦人的骚扰攻击。',
    cost: 25,
    damage: 40,
    scope: 'single',
    type: 'attack',
    hitRate: 0.2
  },

// --- 大妖精 (Daiyousei) ---
  'daiyousei_nature': {
    name: '「大自然的恩惠」',
    description: '调动自然之力进行治疗。',
    cost: 50,
    damage: 0,
    scope: 'single',
    type: 'heal',
    isUltimate: true,
    hitRate: 1.0,
    buffDetails: {
        name: '自然愈合',
        duration: 1,
        description: '恢复生命',
        effects: [{ type: 'heal', value: 150, isPercentage: false }]
    }
  },
  'daiyousei_wind': {
    name: '风之刃',
    description: '小型的风刃攻击。',
    cost: 20,
    damage: 35,
    scope: 'single',
    type: 'attack',
    hitRate: 0.1
  },
  'daiyousei_fairy_support': {
    name: '支援「妖精的加护」',
    description: '支援同伴。',
    cost: 30,
    damage: 0,
    scope: 'single',
    type: 'heal',
    hitRate: 1.0,
    buffDetails: {
        name: '加护',
        duration: 1,
        description: '恢复生命',
        effects: [{ type: 'heal', value: 50, isPercentage: false }]
    }
  },

// --- 天弓千亦 (Chimata Tenkyuu) ---
  'chimata_market': {
    name: '「无主物的市场」',
    description: '在市场中只有强者才能生存。',
    cost: 85,
    damage: 100,
    scope: 'aoe',
    type: 'attack',
    isUltimate: true,
    hitRate: 1.0
  },
  'chimata_rainbow': {
    name: '虹符「暴雨后的彩虹」',
    description: '绚丽但危险的彩虹弹幕。',
    cost: 40,
    damage: 75,
    scope: 'aoe',
    type: 'attack',
    hitRate: 0.1
  },
  'chimata_sale': {
    name: '市符「天弓的买卖」',
    description: '强制交易（造成伤害）。',
    cost: 35,
    damage: 65,
    scope: 'single',
    type: 'attack',
    hitRate: 0.1
  },
  'chimata_market_crash': {
    name: '金符「市场崩溃」',
    description: '操纵市场的力量。',
    cost: 45,
    damage: 75,
    scope: 'aoe',
    type: 'attack',
    hitRate: 0.1
  },

// --- 奥野田美宵 (Miyoi Okunoda) ---
  'miyoi_whale': {
    name: '「鲸鱼的梦」',
    description: '让巨大的鲸鱼幻影吞噬敌人。',
    cost: 70,
    damage: 140,
    scope: 'single',
    type: 'attack',
    isUltimate: true,
    hitRate: 1.0
  },
  'miyoi_memory': {
    name: '忆符「遗忘的酒」',
    description: '让人遗忘痛苦（和防御）。',
    cost: 30,
    damage: 40,
    scope: 'single',
    type: 'debuff',
    buffDetails: {
        name: '醉酒',
        duration: 3,
        description: '防御力降低',
        effects: [{ type: 'stat_mod', targetStat: 'defense', value: -0.15, isPercentage: true }]
    }
  },
  'miyoi_whale_hat': {
    name: '梦符「鲸鱼帽的梦」',
    description: '让人沉睡的梦境。',
    cost: 30,
    damage: 0,
    scope: 'single',
    type: 'buff',
    hitRate: 1.0,
    buffDetails: {
        name: '美梦',
        duration: 2,
        description: '闪避率提升',
        effects: [{ type: 'dodge_mod', value: 0.2, isPercentage: true }]
    }
  },

// --- 姬海棠果 (Hatate Himekaidou) ---
  'hatate_continuous_shooting': {
    name: '取材「连续拍摄」',
    description: '快速连拍，找出破绽并攻击。',
    cost: 65,
    damage: 135,
    scope: 'single',
    type: 'attack',
    isUltimate: true,
    hitRate: 1.0
  },
  'hatate_burst': {
    name: '连写「极速快门」',
    description: '如同闪光灯般密集的弹幕。',
    cost: 35,
    damage: 60,
    scope: 'single',
    type: 'attack',
    hitRate: 0.2
  },
  'hatate_scoop': {
    name: '摄影「独家新闻」',
    description: '抓拍敌人的破绽。',
    cost: 30,
    damage: 0,
    scope: 'single',
    type: 'buff',
    hitRate: 1.0,
    buffDetails: {
        name: '洞察',
        duration: 3,
        description: '命中率大幅提升',
        effects: [{ type: 'stat_mod', targetStat: 'attack', value: 0.3, isPercentage: true }]
    }
  },

// --- 姬虫百百世 (Momoyo Himemushi) ---
  'momoyo_dragon_eater': {
    name: '「吞噬龙的大蜈蚣」',
    description: '展现大蜈蚣的恐怖怪力。',
    cost: 85,
    damage: 190,
    scope: 'single',
    type: 'attack',
    isUltimate: true,
    hitRate: 1.0
  },
  'momoyo_poison': {
    name: '蛊毒「虫之呼吸」',
    description: '喷吐毒雾。',
    cost: 40,
    damage: 50,
    scope: 'aoe',
    type: 'attack',
    hitRate: 0.1,
    buffDetails: {
        name: '猛毒',
        duration: 3,
        description: '每回合受到真实伤害',
        effects: [{ type: 'damage_over_time', value: 30, isPercentage: false }]
    }
  },
  'momoyo_mining': {
    name: '掘符「挖掘矿山」',
    description: '用巨大的铲子（或爪子）挖掘攻击。',
    cost: 35,
    damage: 75,
    scope: 'single',
    type: 'attack',
    hitRate: 0.1
  },
  'momoyo_dragon_gem': {
    name: '龙符「龙之颈之玉」',
    description: '如同龙鳞般坚硬。',
    cost: 35,
    damage: 0,
    scope: 'single',
    type: 'buff',
    hitRate: 1.0,
    buffDetails: {
        name: '龙鳞',
        duration: 3,
        description: '防御力提升',
        effects: [{ type: 'stat_mod', targetStat: 'defense', value: 0.25, isPercentage: true }]
    }
  },

// --- 幽谷响子 (Kyouko Kasodani) ---
  'kyouko_echo': {
    name: '「山彦的回声」',
    description: '巨大的声波攻击。',
    cost: 60,
    damage: 90,
    scope: 'aoe',
    type: 'attack',
    isUltimate: true,
    hitRate: 1.0
  },
  'kyouko_scream': {
    name: '响符「强力回声」',
    description: '震耳欲聋的尖叫。',
    cost: 30,
    damage: 55,
    scope: 'aoe',
    type: 'attack',
    hitRate: 0.1
  },
  'kyouko_sutra': {
    name: '经文「佛法之声」',
    description: '诵经产生的弹幕。',
    cost: 25,
    damage: 45,
    scope: 'single',
    type: 'attack',
    hitRate: 0.1
  },
  'kyouko_yahoo': {
    name: '响符「山彦的呼喊」',
    description: 'Yahoooooo!',
    cost: 30,
    damage: 55,
    scope: 'aoe',
    type: 'attack',
    hitRate: 0.1
  },

// --- 庭渡久侘歌 (Kutaka Niwatari) ---
  'kutaka_checkpoint': {
    name: '「鬼门关的守护者」',
    description: '来自地狱关卡的强力阻击。',
    cost: 70,
    damage: 150,
    scope: 'single',
    type: 'attack',
    isUltimate: true,
    hitRate: 1.0
  },
  'kutaka_water': {
    name: '水符「冥河之水」',
    description: '召唤冥河的水流攻击。',
    cost: 35,
    damage: 60,
    scope: 'aoe',
    type: 'attack',
    hitRate: 0.1
  },
  'kutaka_chicken': {
    name: '鸡符「庭院之主」',
    description: '召唤鸡群（？）。',
    cost: 30,
    damage: 50,
    scope: 'single',
    type: 'attack',
    hitRate: 0.1
  },
  'kutaka_checkpoint_gate': {
    name: '关符「天界的关所」',
    description: '设立关卡阻挡攻击。',
    cost: 35,
    damage: 0,
    scope: 'single',
    type: 'shield',
    hitRate: 1.0,
    buffDetails: {
        name: '关所',
        duration: 3,
        description: '获得护盾',
        effects: [{ type: 'shield', value: 80, isPercentage: false }]
    }
  },

// --- 星熊勇仪 (Yuugi Hoshiguma) ---
  'yuugi_knockout': {
    name: '「三步必杀」',
    description: '传说中三步之内必杀的一击。',
    cost: 80,
    damage: 200,
    scope: 'single',
    type: 'attack',
    isUltimate: true,
    hitRate: 1.0
  },
  'yuugi_shackles': {
    name: '枷符「罪人的金锁」',
    description: '挥舞巨大的锁链攻击。',
    cost: 40,
    damage: 85,
    scope: 'aoe',
    type: 'attack',
    hitRate: 0.1
  },
  'yuugi_storm': {
    name: '力业「大江山岚」',
    description: '仅仅是挥拳产生的风压。',
    cost: 35,
    damage: 75,
    scope: 'single',
    type: 'attack',
    hitRate: 0.1
  },
  'yuugi_scolding': {
    name: '大喝「得罪鬼神者」',
    description: '震慑灵魂的怒吼。',
    cost: 35,
    damage: 50,
    scope: 'aoe',
    type: 'debuff',
    hitRate: 1.0,
    buffDetails: {
        name: '震慑',
        duration: 2,
        description: '防御力降低',
        effects: [{ type: 'stat_mod', targetStat: 'defense', value: -0.2, isPercentage: true }]
    }
  },

// --- 月夜见 (Tsukuyomi) ---
  'tsukuyomi_night': {
    name: '「永夜的支配者」',
    description: '月神的威光，笼罩一切。',
    cost: 90,
    damage: 100,
    scope: 'aoe',
    type: 'attack',
    isUltimate: true,
    hitRate: 1.0
  },
  'tsukuyomi_mirror': {
    name: '神宝「月之镜」',
    description: '反射攻击的镜子。',
    cost: 45,
    damage: 0,
    scope: 'single',
    type: 'shield',
    buffDetails: {
        name: '月镜护盾',
        duration: 3,
        description: '获得强力护盾',
        effects: [{ type: 'shield', value: 100, isPercentage: false }]
    }
  },
  'tsukuyomi_quiet_moon': {
    name: '月光「静谧的月夜」',
    description: '沐浴在月光下。',
    cost: 40,
    damage: 0,
    scope: 'single',
    type: 'heal',
    hitRate: 1.0,
    buffDetails: {
        name: '月光浴',
        duration: 1,
        description: '恢复生命',
        effects: [{ type: 'heal', value: 80, isPercentage: false }]
    }
  },

// --- 本居小铃 (Kosuzu Motoori) ---
  'kosuzu_book': {
    name: '「妖魔书的解放」',
    description: '解放书中封印的妖怪之力。',
    cost: 65,
    damage: 130,
    scope: 'single',
    type: 'attack',
    isUltimate: true,
    hitRate: 1.0
  },
  'kosuzu_read': {
    name: '读符「速读」',
    description: '快速获取知识（提升属性）。',
    cost: 30,
    damage: 0,
    scope: 'single',
    type: 'buff',
    buffDetails: {
        name: '知识充能',
        duration: 3,
        description: '攻击力小幅提升',
        effects: [{ type: 'stat_mod', targetStat: 'attack', value: 0.15, isPercentage: true }]
    }
  },
  'kosuzu_scroll_parade': {
    name: '书符「百鬼夜行绘卷」',
    description: '释放绘卷中的妖怪。',
    cost: 45,
    damage: 70,
    scope: 'aoe',
    type: 'attack',
    hitRate: 0.1
  },

// --- 朱鹭子 (Tokiko) ---
  'tokiko_reading': {
    name: '「读书邪魔退散」',
    description: '被打扰读书的愤怒一击。',
    cost: 60,
    damage: 120,
    scope: 'single',
    type: 'attack',
    isUltimate: true,
    hitRate: 1.0
  },
  'tokiko_book_barrage': {
    name: '书符「密集的书页」',
    description: '飞散的书页弹幕。',
    cost: 25,
    damage: 45,
    scope: 'single',
    type: 'attack',
    hitRate: 0.1
  },
  'tokiko_speed_reading': {
    name: '读符「快速翻页」',
    description: '书页如刀片般飞出。',
    cost: 25,
    damage: 50,
    scope: 'single',
    type: 'attack',
    hitRate: 0.2
  },

// --- 村纱水蜜 (Minamitsu Murasa) ---
  'murasa_phantom_ship': {
    name: '「圣辇船起航」',
    description: '召唤幽灵船冲撞敌人。',
    cost: 75,
    damage: 160,
    scope: 'single',
    type: 'attack',
    isUltimate: true,
    hitRate: 1.0
  },
  'murasa_anchor': {
    name: '锚符「幽灵船的锚」',
    description: '巨大的船锚砸击。',
    cost: 40,
    damage: 75,
    scope: 'single',
    type: 'attack',
    hitRate: 0.1
  },
  'murasa_sink': {
    name: '溺符「深海的漩涡」',
    description: '召唤水漩涡。',
    cost: 35,
    damage: 60,
    scope: 'aoe',
    type: 'attack',
    hitRate: 0.1
  },
  'murasa_unsinkable_ship': {
    name: '船符「不沉的幽灵船」',
    description: '幽灵船的坚固船体。',
    cost: 35,
    damage: 0,
    scope: 'single',
    type: 'buff',
    hitRate: 1.0,
    buffDetails: {
        name: '不沉',
        duration: 3,
        description: '防御力提升',
        effects: [{ type: 'stat_mod', targetStat: 'defense', value: 0.2, isPercentage: true }]
    }
  },

// --- 杖刀偶磨弓 (Mayumi Joutouguu) ---
  'mayumi_haniwa_army': {
    name: '「埴轮军团冲锋」',
    description: '率领埴轮大军进行突击。',
    cost: 75,
    damage: 95,
    scope: 'aoe',
    type: 'attack',
    isUltimate: true,
    hitRate: 1.0
  },
  'mayumi_sword': {
    name: '剑术「埴轮之剑」',
    description: '精湛的剑术攻击。',
    cost: 35,
    damage: 70,
    scope: 'single',
    type: 'attack',
    hitRate: 0.15
  },
  'mayumi_arrow': {
    name: '弓术「埴轮之弓」',
    description: '精准的弓箭射击。',
    cost: 30,
    damage: 60,
    scope: 'single',
    type: 'attack',
    hitRate: 0.2
  },
  'mayumi_archer_squad': {
    name: '埴轮「弓兵部队」',
    description: '召唤弓兵齐射。',
    cost: 30,
    damage: 60,
    scope: 'aoe',
    type: 'attack',
    hitRate: 0.15
  },

// --- 梅蒂欣·梅兰可莉 (Medicine Melancholy) ---
  'medicine_poison_fog': {
    name: '「铃兰的毒雾」',
    description: '释放剧毒的雾气笼罩全场。',
    cost: 70,
    damage: 80,
    scope: 'aoe',
    type: 'attack',
    isUltimate: true,
    hitRate: 1.0,
    buffDetails: {
        name: '致命铃兰毒',
        duration: 3,
        description: '持续受到大量真实伤害',
        effects: [{ type: 'damage_over_time', value: 40, isPercentage: false }]
    }
  },
  'medicine_melancholy': {
    name: '毒符「忧郁的毒药」',
    description: '让人陷入忧郁的毒素。',
    cost: 35,
    damage: 40,
    scope: 'single',
    type: 'debuff',
    buffDetails: {
        name: '忧郁',
        duration: 3,
        description: '攻击力降低',
        effects: [{ type: 'stat_mod', targetStat: 'attack', value: -0.2, isPercentage: true }]
    }
  },
  'medicine_neurotoxin': {
    name: '毒符「神经毒素」',
    description: '麻痹敌人的毒素。',
    cost: 35,
    damage: 40,
    scope: 'single',
    type: 'debuff',
    hitRate: 1.0,
    buffDetails: {
        name: '麻痹',
        duration: 2,
        description: '闪避率降低',
        effects: [{ type: 'dodge_mod', value: -0.2, isPercentage: true }]
    }
  },

// --- 森近霖之助 (Rinnosuke Morichika) ---
  'rinnosuke_kusanagi': {
    name: '「草薙之剑（伪）」',
    description: '挥舞传说中的神剑（大概是真货？）。',
    cost: 80,
    damage: 170,
    scope: 'single',
    type: 'attack',
    isUltimate: true,
    hitRate: 1.0
  },
  'rinnosuke_identify': {
    name: '识符「道具鉴定」',
    description: '看穿敌人的本质（造成精神打击）。',
    cost: 30,
    damage: 50,
    scope: 'single',
    type: 'attack',
    hitRate: 0.2
  },
  'rinnosuke_appraisal': {
    name: '鉴符「名刀鉴定」',
    description: '找出武器的最佳使用方法。',
    cost: 30,
    damage: 0,
    scope: 'single',
    type: 'buff',
    hitRate: 1.0,
    buffDetails: {
        name: '锐利',
        duration: 3,
        description: '攻击力提升',
        effects: [{ type: 'stat_mod', targetStat: 'attack', value: 0.2, isPercentage: true }]
    }
  },

// --- 水桥帕露西 (Parsee Mizuhashi) ---
  'parsee_jealousy': {
    name: '「丑时三刻的参拜」',
    description: '强烈的嫉妒心化为诅咒。',
    cost: 70,
    damage: 140,
    scope: 'single',
    type: 'attack',
    isUltimate: true,
    hitRate: 1.0
  },
  'parsee_green_eyes': {
    name: '嫉妒「绿眼怪兽」',
    description: '嫉妒之火燃烧敌人。',
    cost: 35,
    damage: 60,
    scope: 'single',
    type: 'attack',
    hitRate: 0.1
  },
  'parsee_bridge': {
    name: '桥姬「通过这种地方的人」',
    description: '阻碍敌人的行动。',
    cost: 30,
    damage: 50,
    scope: 'single',
    type: 'debuff',
    buffDetails: {
        name: '嫉妒的重压',
        duration: 2,
        description: '闪避率降低',
        effects: [{ type: 'dodge_mod', value: -0.2, isPercentage: true }]
    }
  },
  'parsee_green_eyed_monster': {
    name: '嫉妒「看不见的绿眼」',
    description: '嫉妒使人盲目。',
    cost: 30,
    damage: 45,
    scope: 'single',
    type: 'debuff',
    hitRate: 1.0,
    buffDetails: {
        name: '嫉妒',
        duration: 3,
        description: '命中率降低',
        effects: [{ type: 'stat_mod', targetStat: 'attack', value: -0.2, isPercentage: true }]
    }
  },

// --- 洩矢诹访子 (Suwako Moriya) ---
  'suwako_mishaguji': {
    name: '「土著神的作祟」',
    description: '召唤古代土著神的力量。',
    cost: 85,
    damage: 100,
    scope: 'aoe',
    type: 'attack',
    isUltimate: true,
    hitRate: 1.0
  },
  'suwako_frog': {
    name: '土着神「小小青蛙不输风雨」',
    description: '虽然可爱但威力巨大的青蛙弹幕。',
    cost: 40,
    damage: 75,
    scope: 'aoe',
    type: 'attack',
    hitRate: 0.1
  },
  'suwako_ring': {
    name: '源符「厌川的翡翠」',
    description: '水与铁轮的攻击。',
    cost: 45,
    damage: 80,
    scope: 'single',
    type: 'attack',
    hitRate: 0.1
  },
  'suwako_iron_ring': {
    name: '铁轮「以此轮命君剥离」',
    description: '投掷铁轮攻击。',
    cost: 35,
    damage: 70,
    scope: 'single',
    type: 'attack',
    hitRate: 0.15
  },

// --- 物部布都 (Futo Mononobe) ---
  'futo_fire': {
    name: '「大火的改新」',
    description: '纵火烧尽一切。',
    cost: 75,
    damage: 90,
    scope: 'aoe',
    type: 'attack',
    isUltimate: true,
    hitRate: 1.0
  },
  'futo_plate': {
    name: '风符「三轮的盘子风暴」',
    description: '投掷大量的盘子。',
    cost: 35,
    damage: 65,
    scope: 'aoe',
    type: 'attack',
    hitRate: 0.1
  },
  'futo_boat': {
    name: '光符「天之岩船」',
    description: '乘坐岩船进行冲撞。',
    cost: 40,
    damage: 75,
    scope: 'single',
    type: 'attack',
    hitRate: 0.1
  },
  'futo_plate_throw': {
    name: '投皿「物部氏的八十平瓮」',
    description: '无数盘子飞向敌人。',
    cost: 30,
    damage: 55,
    scope: 'aoe',
    type: 'attack',
    hitRate: 0.1
  },

// --- 犬走椛 (Momiji Inubashiri) ---
  'momiji_blade': {
    name: '「白狼天牙」',
    description: '白狼天狗的强力斩击。',
    cost: 65,
    damage: 145,
    scope: 'single',
    type: 'attack',
    isUltimate: true,
    hitRate: 1.0
  },
  'momiji_scope': {
    name: '狗符「狂犬的撕咬」',
    description: '凶猛的撕咬攻击。',
    cost: 30,
    damage: 60,
    scope: 'single',
    type: 'attack',
    hitRate: 0.1
  },
  'momiji_shield': {
    name: '盾符「大天狗的盾」',
    description: '架起盾牌防御。',
    cost: 35,
    damage: 0,
    scope: 'single',
    type: 'shield',
    buffDetails: {
        name: '白狼之盾',
        duration: 3,
        description: '获得护盾',
        effects: [{ type: 'shield', value: 80, isPercentage: false }]
    }
  },
  'momiji_clairvoyance': {
    name: '千里眼「千里一望」',
    description: '看穿敌人的动作。',
    cost: 25,
    damage: 0,
    scope: 'single',
    type: 'buff',
    hitRate: 1.0,
    buffDetails: {
        name: '千里眼',
        duration: 3,
        description: '命中率提升',
        effects: [{ type: 'stat_mod', targetStat: 'attack', value: 0.2, isPercentage: true }]
    }
  },

// --- 玉造魅须丸 (Misumaru Tamatsukuri) ---
  'misumaru_orb': {
    name: '「神代勾玉」',
    description: '利用古代勾玉的力量进行攻击。',
    cost: 75,
    damage: 155,
    scope: 'single',
    type: 'attack',
    isUltimate: true,
    hitRate: 1.0
  },
  'misumaru_craft': {
    name: '玉符「阴阳神玉」',
    description: '制造阴阳玉进行轰炸。',
    cost: 40,
    damage: 70,
    scope: 'aoe',
    type: 'attack',
    hitRate: 0.1
  },
  'misumaru_divine_light': {
    name: '勾玉「神之光辉」',
    description: '勾玉的光芒治愈伤口。',
    cost: 40,
    damage: 0,
    scope: 'single',
    type: 'heal',
    hitRate: 1.0,
    buffDetails: {
        name: '神光',
        duration: 1,
        description: '恢复生命',
        effects: [{ type: 'heal', value: 70, isPercentage: false }]
    }
  },

// --- 秋穰子 (Minoriko Aki) ---
  'minoriko_harvest': {
    name: '「丰收的约定」',
    description: '带来丰收的喜悦（和攻击）。',
    cost: 60,
    damage: 120,
    scope: 'single',
    type: 'attack',
    isUltimate: true,
    hitRate: 1.0
  },
  'minoriko_potato': {
    name: '秋符「秋季的天空」',
    description: '红薯像雨一样落下。',
    cost: 30,
    damage: 55,
    scope: 'aoe',
    type: 'attack',
    hitRate: 0.1
  },
  'minoriko_autumn_sky': {
    name: '秋符「秋之天空与少女的心」',
    description: '秋日的宁静。',
    cost: 35,
    damage: 0,
    scope: 'single',
    type: 'heal',
    hitRate: 1.0,
    buffDetails: {
        name: '丰收',
        duration: 1,
        description: '恢复生命',
        effects: [{ type: 'heal', value: 60, isPercentage: false }]
    }
  },

// --- 秋静叶 (Shizuha Aki) ---
  'shizuha_leaves': {
    name: '「凋零的红叶」',
    description: '象征终结的红叶风暴。',
    cost: 60,
    damage: 120,
    scope: 'single',
    type: 'attack',
    isUltimate: true,
    hitRate: 1.0
  },
  'shizuha_fall': {
    name: '叶符「狂舞的落叶」',
    description: '落叶化作利刃。',
    cost: 30,
    damage: 50,
    scope: 'aoe',
    type: 'attack',
    hitRate: 0.1
  },
  'shizuha_colorless_world': {
    name: '枯符「失去颜色的世界」',
    description: '夺走生机。',
    cost: 30,
    damage: 40,
    scope: 'single',
    type: 'debuff',
    hitRate: 1.0,
    buffDetails: {
        name: '枯萎',
        duration: 3,
        description: '攻击力降低',
        effects: [{ type: 'stat_mod', targetStat: 'attack', value: -0.15, isPercentage: true }]
    }
  },

// --- 稀神探女 (Sagume Kishin) ---
  'sagume_reverse': {
    name: '「片翼的白鹭」',
    description: '逆转战局的一击，将劣势化为优势。',
    cost: 85,
    damage: 170,
    scope: 'single',
    type: 'attack',
    isUltimate: true,
    hitRate: 1.0
  },
  'sagume_arrow': {
    name: '玉符「乌合之咒」',
    description: '言语化作的利箭。',
    cost: 40,
    damage: 75,
    scope: 'single',
    type: 'attack',
    hitRate: 0.1
  },
  'sagume_orb': {
    name: '凶占「天火占星术」',
    description: '从天而降的火球。',
    cost: 45,
    damage: 80,
    scope: 'aoe',
    type: 'attack',
    hitRate: 0.1
  },
  'sagume_reversal': {
    name: '逆符「正邪的翻转」',
    description: '将危机转化为力量。',
    cost: 35,
    damage: 0,
    scope: 'single',
    type: 'buff',
    hitRate: 1.0,
    buffDetails: {
        name: '逆转',
        duration: 2,
        description: '攻击力大幅提升',
        effects: [{ type: 'stat_mod', targetStat: 'attack', value: 0.3, isPercentage: true }]
    }
  },

// --- 稗田阿求 (Akyuu Hieda) ---
  'akyuu_memory': {
    name: '「幻想乡缘起」',
    description: '记录一切历史的力量。',
    cost: 60,
    damage: 110,
    scope: 'single',
    type: 'attack',
    isUltimate: true,
    hitRate: 1.0
  },
  'akyuu_pen': {
    name: '笔符「过目不忘」',
    description: '用笔尖进行的精准打击。',
    cost: 25,
    damage: 40,
    scope: 'single',
    type: 'attack',
    hitRate: 0.2
  },
  'akyuu_chronicle': {
    name: '记符「幻想乡缘起」',
    description: '记录历史的力量。',
    cost: 30,
    damage: 0,
    scope: 'single',
    type: 'buff',
    hitRate: 1.0,
    buffDetails: {
        name: '记录',
        duration: 3,
        description: '全属性小幅提升',
        effects: [{ type: 'stat_mod', targetStat: 'attack', value: 0.1, isPercentage: true }]
    }
  },

// --- 米斯蒂娅·萝蕾莱 (Mystia Lorelei) ---
  'mystia_song': {
    name: '「夜雀的歌声」',
    description: '让人陷入黑暗和混乱的歌声。',
    cost: 65,
    damage: 130,
    scope: 'single',
    type: 'attack',
    isUltimate: true,
    hitRate: 1.0
  },
  'mystia_blind': {
    name: '声符「枭的夜鸣声」',
    description: '剥夺敌人的视野。',
    cost: 35,
    damage: 50,
    scope: 'single',
    type: 'debuff',
    buffDetails: {
        name: '夜盲',
        duration: 3,
        description: '命中率大幅降低',
        effects: [{ type: 'stat_mod', targetStat: 'attack', value: -0.2, isPercentage: true }]
    }
  },
  'mystia_moth': {
    name: '蛾符「天蛾的蛊毒」',
    description: '带毒的磷粉攻击。',
    cost: 30,
    damage: 45,
    scope: 'aoe',
    type: 'attack',
    hitRate: 0.1
  },
  'mystia_night_song': {
    name: '盲符「夜幕之歌」',
    description: '在黑暗中迷失方向。',
    cost: 30,
    damage: 40,
    scope: 'single',
    type: 'debuff',
    hitRate: 1.0,
    buffDetails: {
        name: '夜盲',
        duration: 2,
        description: '命中率降低',
        effects: [{ type: 'stat_mod', targetStat: 'attack', value: -0.2, isPercentage: true }]
    }
  },

// --- 绵月丰姬 (Toyohime Watatsuki) ---
  'toyohime_fan': {
    name: '「连接海与山的扇子」',
    description: '能够连接任何地方，将敌人送往虚空。',
    cost: 95,
    damage: 220,
    scope: 'single',
    type: 'attack',
    isUltimate: true,
    hitRate: 1.0
  },
  'toyohime_wind': {
    name: '扇符「净化之风」',
    description: '强力的净化之风。',
    cost: 50,
    damage: 90,
    scope: 'aoe',
    type: 'attack',
    hitRate: 0.1
  },
  'toyohime_wind_fan': {
    name: '扇符「风之扇」',
    description: '扇出强风吹飞敌人。',
    cost: 35,
    damage: 60,
    scope: 'aoe',
    type: 'attack',
    hitRate: 0.1
  },

// --- 绵月依姬 (Yorihime Watatsuki) ---
  'yorihime_god': {
    name: '「神灵凭依」',
    description: '召唤无数神灵的力量进行连续攻击。',
    cost: 95,
    damage: 230,
    scope: 'single',
    type: 'attack',
    isUltimate: true,
    hitRate: 1.0
  },
  'yorihime_sword': {
    name: '剑符「天照大御神」',
    description: '如太阳般耀眼的斩击。',
    cost: 50,
    damage: 95,
    scope: 'single',
    type: 'attack',
    hitRate: 0.15
  },
  'yorihime_fire': {
    name: '火符「爱宕大权现」',
    description: '召唤神火。',
    cost: 45,
    damage: 85,
    scope: 'aoe',
    type: 'attack',
    hitRate: 0.1
  },
  'yorihime_kusanagi': {
    name: '剑符「草薙剑」',
    description: '神剑的一击。',
    cost: 40,
    damage: 80,
    scope: 'single',
    type: 'attack',
    hitRate: 0.2
  },

// --- 苏我屠自古 (Tojiko Soga) ---
  'tojiko_thunder': {
    name: '「引起雷鸣的怨灵」',
    description: '召唤狂暴的雷电。',
    cost: 70,
    damage: 90,
    scope: 'aoe',
    type: 'attack',
    isUltimate: true,
    hitRate: 1.0
  },
  'tojiko_arrow': {
    name: '雷矢「元兴寺的飓风」',
    description: '带电的箭矢风暴。',
    cost: 35,
    damage: 60,
    scope: 'aoe',
    type: 'attack',
    hitRate: 0.1
  },
  'tojiko_thunder_cloud': {
    name: '怨灵「入道云」',
    description: '雷云密布。',
    cost: 35,
    damage: 65,
    scope: 'aoe',
    type: 'attack',
    hitRate: 0.1
  },

// --- 若鹭姬 (Wakasagihime) ---
  'wakasagihime_tide': {
    name: '「人鱼的潮汐」',
    description: '召唤巨大的海浪冲击。',
    cost: 65,
    damage: 85,
    scope: 'aoe',
    type: 'attack',
    isUltimate: true,
    hitRate: 1.0
  },
  'wakasagihime_scale': {
    name: '潮符「湖面的满月」',
    description: '闪耀的鳞片弹幕。',
    cost: 30,
    damage: 55,
    scope: 'single',
    type: 'attack',
    hitRate: 0.1
  },
  'wakasagihime_school_of_fish': {
    name: '鱼符「鱼群游泳」',
    description: '召唤小鱼攻击。',
    cost: 25,
    damage: 45,
    scope: 'single',
    type: 'attack',
    hitRate: 0.15
  },

// --- 莉格露·奈特巴格 (Wriggle Nightbug) ---
  'wriggle_insect_storm': {
    name: '「昆虫风暴」',
    description: '召唤无数虫子吞噬敌人。',
    cost: 60,
    damage: 80,
    scope: 'aoe',
    type: 'attack',
    isUltimate: true,
    hitRate: 1.0
  },
  'wriggle_firefly': {
    name: '萤符「地上的流星」',
    description: '萤火虫般的光弹。',
    cost: 25,
    damage: 45,
    scope: 'single',
    type: 'attack',
    hitRate: 0.1
  },
  'wriggle_earth_star': {
    name: '萤符「地上的恒星」',
    description: '耀眼的萤火虫光芒。',
    cost: 30,
    damage: 50,
    scope: 'single',
    type: 'attack',
    hitRate: 0.15
  },

// --- 莉莉·霍瓦特 (Lily White) ---
  'lily_spring': {
    name: '「春之宣告」',
    description: '宣告春天的到来，带来生机（和弹幕）。',
    cost: 55,
    damage: 120,
    scope: 'single',
    type: 'attack',
    isUltimate: true,
    hitRate: 1.0
  },
  'lily_pollen': {
    name: '春符「惊喜的春天」',
    description: '散布花粉攻击。',
    cost: 25,
    damage: 40,
    scope: 'aoe',
    type: 'attack',
    hitRate: 0.1
  },
  'lily_warm_spring': {
    name: '春符「温暖的春天」',
    description: '春暖花开，万物复苏。',
    cost: 35,
    damage: 0,
    scope: 'single',
    type: 'heal',
    hitRate: 1.0,
    buffDetails: {
        name: '春之息',
        duration: 1,
        description: '恢复生命',
        effects: [{ type: 'heal', value: 60, isPercentage: false }]
    }
  },

// --- 菅牧典 (Tsukasa Kudamaki) ---
  'tsukasa_fox': {
    name: '「管狐的耳语」',
    description: '利用管狐进行精神攻击。',
    cost: 65,
    damage: 135,
    scope: 'single',
    type: 'attack',
    isUltimate: true,
    hitRate: 1.0
  },
  'tsukasa_trick': {
    name: '骗符「贪婪的建议」',
    description: '充满恶意的建议。',
    cost: 30,
    damage: 50,
    scope: 'single',
    type: 'attack',
    hitRate: 0.1
  },
  'tsukasa_pipe_fox_dance': {
    name: '狐符「管狐乱舞」',
    description: '管狐们疯狂的舞蹈。',
    cost: 35,
    damage: 60,
    scope: 'aoe',
    type: 'attack',
    hitRate: 0.1
  },

// --- 蕾蒂·霍瓦特洛克 (Letty Whiterock) ---
  'letty_cold_snap': {
    name: '「寒潮」',
    description: '极寒的冷气冻结一切。',
    cost: 65,
    damage: 85,
    scope: 'aoe',
    type: 'attack',
    isUltimate: true,
    hitRate: 1.0
  },
  'letty_winter': {
    name: '寒符「延长的冬日」',
    description: '寒冷的风暴。',
    cost: 30,
    damage: 55,
    scope: 'aoe',
    type: 'attack',
    hitRate: 0.1
  },
  'letty_flower_wither': {
    name: '冬符「花之凋零」',
    description: '让花朵凋零的寒冷。',
    cost: 30,
    damage: 55,
    scope: 'single',
    type: 'attack',
    hitRate: 0.15
  },

// --- 豪德寺三花 (Mike Goutokuji) ---
  'mike_lucky_cat': {
    name: '「招财猫的生意兴隆」',
    description: '用金币掩埋敌人。',
    cost: 65,
    damage: 140,
    scope: 'single',
    type: 'attack',
    isUltimate: true,
    hitRate: 1.0
  },
  'mike_coin': {
    name: '猫符「猫的小判」',
    description: '投掷小判金币。',
    cost: 30,
    damage: 60,
    scope: 'single',
    type: 'attack',
    hitRate: 0.1
  },
  'mike_business_prosperity': {
    name: '招财「生意兴隆」',
    description: '招来好运（和金钱）。',
    cost: 30,
    damage: 0,
    scope: 'single',
    type: 'buff',
    hitRate: 1.0,
    buffDetails: {
        name: '招财',
        duration: 3,
        description: '攻击力提升',
        effects: [{ type: 'stat_mod', targetStat: 'attack', value: 0.15, isPercentage: true }]
    }
  },

// --- 赤蛮奇 (Sekibanki) ---
  'sekibanki_head': {
    name: '「飞头蛮的突袭」',
    description: '头颅飞离身体进行强力撞击。',
    cost: 65,
    damage: 145,
    scope: 'single',
    type: 'attack',
    isUltimate: true,
    hitRate: 1.0
  },
  'sekibanki_multiple': {
    name: '飞符「飞行之首」',
    description: '制造头部分身进行围攻。',
    cost: 35,
    damage: 60,
    scope: 'aoe',
    type: 'attack',
    hitRate: 0.1
  },
  'sekibanki_dullahan_night': {
    name: '飞头「杜拉汉之夜」',
    description: '头颅在夜空中飞舞。',
    cost: 35,
    damage: 60,
    scope: 'single',
    type: 'attack',
    hitRate: 0.2
  },

// --- 霍青娥 (Seiga Kaku) ---
  'seiga_wall': {
    name: '「穿墙邪仙」',
    description: '神出鬼没的穿墙攻击。',
    cost: 75,
    damage: 150,
    scope: 'single',
    type: 'attack',
    isUltimate: true,
    hitRate: 1.0
  },
  'seiga_necromancy': {
    name: '邪符「养小鬼」',
    description: '召唤小鬼进行骚扰。',
    cost: 35,
    damage: 65,
    scope: 'single',
    type: 'attack',
    hitRate: 0.1
  },
  'seiga_tao': {
    name: '道符「道胎动」',
    description: '道术能量球。',
    cost: 40,
    damage: 70,
    scope: 'single',
    type: 'attack',
    hitRate: 0.1
  },
  'seiga_revival': {
    name: '仙符「尸解仙的复活」',
    description: '道术治愈。',
    cost: 40,
    damage: 0,
    scope: 'single',
    type: 'heal',
    hitRate: 1.0,
    buffDetails: {
        name: '尸解',
        duration: 1,
        description: '恢复生命',
        effects: [{ type: 'heal', value: 75, isPercentage: false }]
    }
  },

// --- 露米娅 (Rumia) ---
  'rumia_darkness': {
    name: '「夜幕降临」',
    description: '释放黑暗吞噬光明和敌人。',
    cost: 60,
    damage: 130,
    scope: 'single',
    type: 'attack',
    isUltimate: true,
    hitRate: 1.0
  },
  'rumia_moon': {
    name: '月符「月光」',
    description: '虽然是暗妖，但也能用月光。',
    cost: 30,
    damage: 50,
    scope: 'single',
    type: 'attack',
    hitRate: 0.1
  },
  'rumia_demarcation': {
    name: '暗符「境界线」',
    description: '黑暗的结界。',
    cost: 35,
    damage: 55,
    scope: 'aoe',
    type: 'attack',
    hitRate: 0.1
  },
  'rumia_eternal_night': {
    name: '冥符「常夜之境」',
    description: '永远的黑夜。',
    cost: 30,
    damage: 45,
    scope: 'aoe',
    type: 'debuff',
    hitRate: 1.0,
    buffDetails: {
        name: '黑暗',
        duration: 2,
        description: '命中率降低',
        effects: [{ type: 'stat_mod', targetStat: 'attack', value: -0.15, isPercentage: true }]
    }
  },

// --- 驹草山如 (Sannyo Komakusa) ---
  'sannyo_smoke': {
    name: '「太夫的烟管」',
    description: '吐出带有魔力的烟雾。',
    cost: 70,
    damage: 90,
    scope: 'aoe',
    type: 'attack',
    isUltimate: true,
    hitRate: 1.0
  },
  'sannyo_gamble': {
    name: '赌符「胜负师的直觉」',
    description: '豪赌一击（伤害波动大）。',
    cost: 40,
    damage: 70,
    scope: 'single',
    type: 'attack',
    hitRate: 0.1
  },
  'sannyo_purple_smoke': {
    name: '烟符「紫烟缭绕」',
    description: '迷幻的烟雾。',
    cost: 30,
    damage: 40,
    scope: 'aoe',
    type: 'debuff',
    hitRate: 1.0,
    buffDetails: {
        name: '迷烟',
        duration: 2,
        description: '闪避率降低',
        effects: [{ type: 'dodge_mod', value: -0.15, isPercentage: true }]
    }
  },

// --- 龙神 (Dragon God) ---
  'dragon_god_wrath': {
    name: '「龙神的震怒」',
    description: '传说中龙神的愤怒，毁灭性的打击。',
    cost: 100,
    damage: 300,
    scope: 'aoe',
    type: 'attack',
    isUltimate: true,
    hitRate: 1.0
  },
  'dragon_rain': {
    name: '神雨「恩泽之雨」',
    description: '降下治愈之雨。',
    cost: 50,
    damage: 0,
    scope: 'single',
    type: 'heal',
    buffDetails: {
        name: '龙神恩泽',
        duration: 1,
        description: '大幅恢复生命',
        effects: [{ type: 'heal', value: 200, isPercentage: false }]
    }
  },
  'dragon_heavy_rain': {
    name: '龙符「暴雨」',
    description: '倾盆大雨。',
    cost: 50,
    damage: 80,
    scope: 'aoe',
    type: 'attack',
    hitRate: 0.1
  },

// --- 冴月麟 (Rin Satsuki) ---
  'rin_kirin': {
    name: '「麒麟的咆哮」',
    description: '幻之角色的强力声波攻击。',
    cost: 75,
    damage: 150,
    scope: 'aoe',
    type: 'attack',
    isUltimate: true,
    hitRate: 1.0
  },
  'rin_flower': {
    name: '花符「幻之花」',
    description: '不存在的花朵绽放。',
    cost: 35,
    damage: 65,
    scope: 'single',
    type: 'attack',
    hitRate: 0.1
  },
  'rin_kind_wind': {
    name: '麒麟「仁慈之风」',
    description: '治愈的风。',
    cost: 40,
    damage: 0,
    scope: 'single',
    type: 'heal',
    hitRate: 1.0,
    buffDetails: {
        name: '仁慈',
        duration: 1,
        description: '恢复生命',
        effects: [{ type: 'heal', value: 90, isPercentage: false }]
    }
  },

// --- 堀川雷鼓 (Raiko Horikawa) ---
  'raiko_drum': {
    name: '「原始的鼓动」',
    description: '激昂的鼓点引发雷电和冲击波。',
    cost: 75,
    damage: 95,
    scope: 'aoe',
    type: 'attack',
    isUltimate: true,
    hitRate: 1.0
  },
  'raiko_thunder': {
    name: '雷符「雷鼓节奏」',
    description: '伴随雷电的节奏攻击。',
    cost: 40,
    damage: 75,
    scope: 'single',
    type: 'attack',
    hitRate: 0.1
  },
  'raiko_beat': {
    name: '太鼓「狂乱的节拍」',
    description: '连续的音波攻击。',
    cost: 35,
    damage: 65,
    scope: 'aoe',
    type: 'attack',
    hitRate: 0.1
  },
  'raiko_primal_beat': {
    name: '鼓符「原始节拍」',
    description: '激发原始的斗志。',
    cost: 35,
    damage: 0,
    scope: 'single',
    type: 'buff',
    hitRate: 1.0,
    buffDetails: {
        name: '节拍',
        duration: 3,
        description: '攻击力提升',
        effects: [{ type: 'stat_mod', targetStat: 'attack', value: 0.2, isPercentage: true }]
    }
  },

// --- 多多良小伞 (Kogasa Tatara) ---
  'kogasa_surprise': {
    name: '「吓你一跳！」',
    description: '突然出现惊吓敌人（造成精神伤害）。',
    cost: 60,
    damage: 120,
    scope: 'single',
    type: 'attack',
    isUltimate: true,
    hitRate: 1.0
  },
  'kogasa_rain': {
    name: '雨符「雨夜的怪谈」',
    description: '召唤阴森的雨。',
    cost: 30,
    damage: 50,
    scope: 'aoe',
    type: 'attack',
    hitRate: 0.1
  },
  'kogasa_umbrella': {
    name: '伞符「唐伞的回旋」',
    description: '旋转伞进行防御和攻击。',
    cost: 35,
    damage: 55,
    scope: 'single',
    type: 'attack',
    hitRate: 0.1
  },
  'kogasa_typhoon_passage': {
    name: '惊雨「台风经过」',
    description: '模拟台风的攻击。',
    cost: 30,
    damage: 50,
    scope: 'aoe',
    type: 'attack',
    hitRate: 0.1
  },

// --- 天魔 (Tenma) ---
  'tenma_wind': {
    name: '「天魔的狂风」',
    description: '天狗首领召唤的毁灭性风暴。',
    cost: 90,
    damage: 220,
    scope: 'aoe',
    type: 'attack',
    isUltimate: true,
    hitRate: 1.0
  },
  'tenma_command': {
    name: '天狗「号令天下」',
    description: '威严的命令。',
    cost: 45,
    damage: 0,
    scope: 'single',
    type: 'buff',
    buffDetails: {
        name: '领袖气质',
        duration: 3,
        description: '攻击力大幅提升',
        effects: [{ type: 'stat_mod', targetStat: 'attack', value: 0.3, isPercentage: true }]
    }
  },
  'tenma_tengu_wind': {
    name: '天狗「天魔之风」',
    description: '天狗的狂风。',
    cost: 45,
    damage: 70,
    scope: 'aoe',
    type: 'attack',
    hitRate: 0.15
  },

// --- 山城高岭 (Takane Yamashiro) ---
  'takane_business': {
    name: '「山童的商业机密」',
    description: '利用神秘技术进行的攻击。',
    cost: 65,
    damage: 135,
    scope: 'single',
    type: 'attack',
    isUltimate: true,
    hitRate: 1.0
  },
  'takane_forest': {
    name: '森符「深山的隐遁者」',
    description: '利用森林地形攻击。',
    cost: 35,
    damage: 60,
    scope: 'single',
    type: 'attack',
    hitRate: 0.1
  },
  'takane_secret_trade': {
    name: '商业「隐秘的交易」',
    description: '通过交易获取优势。',
    cost: 30,
    damage: 0,
    scope: 'single',
    type: 'buff',
    hitRate: 1.0,
    buffDetails: {
        name: '交易',
        duration: 3,
        description: '防御力提升',
        effects: [{ type: 'stat_mod', targetStat: 'defense', value: 0.2, isPercentage: true }]
    }
  },

// --- 俊达萌 (Zundamon) ---
  'zundamon_arrow': {
    name: '弓符「俊达萌之箭」',
    description: '变身成长弓射出的能量箭。',
    cost: 50,
    damage: 110,
    scope: 'single',
    type: 'attack',
    isUltimate: true,
    hitRate: 1.0
  },
  'zundamon_edamame': {
    name: '豆符「枝豆冲击」',
    description: '发射大量毛豆攻击。',
    cost: 25,
    damage: 45,
    scope: 'aoe',
    type: 'attack',
    hitRate: 0.1
  },
  'zundamon_infinite_edamame': {
    name: '豆符「无限毛豆」',
    description: '吃毛豆回血。',
    cost: 30,
    damage: 0,
    scope: 'single',
    type: 'heal',
    hitRate: 1.0,
    buffDetails: {
        name: '毛豆',
        duration: 1,
        description: '恢复生命',
        effects: [{ type: 'heal', value: 60, isPercentage: false }]
    }
  },

// --- 月永爱 (Ai Tsukinaga) ---
  'ai_wheel_fortune': {
    name: '占卜「命运之轮」',
    description: '转动命运的齿轮。',
    cost: 60,
    damage: 125,
    scope: 'single',
    type: 'attack',
    isUltimate: true,
    hitRate: 1.0
  },
  'ai_tarot_fool': {
    name: '塔罗「愚者的旅程」',
    description: '新的开始，充满未知与希望。',
    cost: 30,
    damage: 0,
    scope: 'single',
    type: 'buff',
    buffDetails: {
        name: '愚者',
        duration: 3,
        description: '闪避率提升',
        effects: [{ type: 'dodge_mod', value: 0.2, isPercentage: true }]
    }
  },
  'ai_magician': {
    name: '塔罗「魔术师」',
    description: '创造无限可能。',
    cost: 30,
    damage: 0,
    scope: 'single',
    type: 'buff',
    hitRate: 1.0,
    buffDetails: {
        name: '魔术师',
        duration: 3,
        description: '攻击力提升',
        effects: [{ type: 'stat_mod', targetStat: 'attack', value: 0.2, isPercentage: true }]
    }
  },

// --- 菲娅 (Fia) ---
  'fia_prayer': {
    name: '祈愿「微弱的光芒」',
    description: '来自异界公主的祈祷。',
    cost: 50,
    damage: 0,
    scope: 'single',
    type: 'shield',
    isUltimate: true,
    hitRate: 1.0,
    buffDetails: {
        name: '公主的祈祷',
        duration: 3,
        description: '获得护盾',
        effects: [{ type: 'shield', value: 100, isPercentage: false }]
    }
  },
  'fia_tear': {
    name: '泪符「寻求庇护」',
    description: '楚楚可怜的姿态让人不忍攻击。',
    cost: 20,
    damage: 0,
    scope: 'single',
    type: 'buff',
    buffDetails: {
        name: '庇护',
        duration: 2,
        description: '闪避率提升',
        effects: [{ type: 'dodge_mod', value: 0.3, isPercentage: true }]
    }
  },
  'fia_hiding': {
    name: '怯懦「躲藏」',
    description: '躲起来不被打到。',
    cost: 25,
    damage: 0,
    scope: 'single',
    type: 'buff',
    hitRate: 1.0,
    buffDetails: {
        name: '躲藏',
        duration: 2,
        description: '闪避率大幅提升',
        effects: [{ type: 'dodge_mod', value: 0.3, isPercentage: true }]
    }
  },

// --- 雏森 (Hinamori) ---
  'hinamori_deduction': {
    name: '解析「弱点洞察」',
    description: '分析敌人的弱点进行精准打击。',
    cost: 60,
    damage: 130,
    scope: 'single',
    type: 'attack',
    isUltimate: true,
    hitRate: 1.0
  },
  'hinamori_strike': {
    name: '算符「精准打击」',
    description: '计算后的必中一击。',
    cost: 30,
    damage: 55,
    scope: 'single',
    type: 'attack',
    hitRate: 0.3
  }
,
  'hinamori_optimal_solution': {
    name: '算符「最优解」',
    description: '计算出最佳方案。',
    cost: 30,
    damage: 0,
    scope: 'single',
    type: 'buff',
    hitRate: 1.0,
    buffDetails: {
        name: '最优解',
        duration: 3,
        description: '暴击率提升',
        effects: [{ type: 'stat_mod', targetStat: 'attack', value: 0.2, isPercentage: true }]
    }
  },
};

export const CHARACTER_NAME_MAP: Record<string, string> = {
  '博丽灵梦': 'reimu',
  '雾雨魔理沙': 'marisa',
  '十六夜咲夜': 'sakuya',
  '蕾米莉亚·斯卡雷特': 'remilia',
  '蕾米莉亚': 'remilia',
  '芙兰朵露·斯卡雷特': 'flandre',
  '芙兰朵露': 'flandre',
  '魂魄妖梦': 'youmu',
  '西行寺幽幽子': 'yuyuko',
  '爱丽丝·玛格特洛伊德': 'alice',
  '爱丽丝': 'alice',
  '帕秋莉·诺蕾姬': 'patchouli',
  '帕秋莉': 'patchouli',
  '红美铃': 'meiling',
  '琪露诺': 'cirno',
  '东风谷早苗': 'sanae',
  '射命丸文': 'aya',
  '八云紫': 'yukari',
  '八云蓝': 'ran',
  '八云橙': 'chen',
  '橙': 'chen',
  '铃仙·优昙华院·因幡': 'reisen',
  '铃仙': 'reisen',
  '因幡帝': 'tewi',
  '蓬莱山辉夜': 'kaguya',
  '藤原妹红': 'mokou',
  '八意永琳': 'eirin',
  '古明地觉': 'satori',
  '古明地恋': 'koishi',
  '灵乌路空': 'utsuho',
  '阿空': 'utsuho',
  '火焰猫燐': 'orin',
  '阿燐': 'orin',
  '伊吹萃香': 'suika',
  '永江衣玖': 'iku',
  '比那名居天子': 'tenshi',
  '风见幽香': 'yuuka',
  '小野冢小町': 'komachi',
  '四季映姬·夜摩仙那度': 'eiki',
  '四季映姬': 'eiki',
  '河城荷取': 'nitori',
  '键山雏': 'hina',
  '圣白莲': 'byakuren',
  '丰聪耳神子': 'miko',
  '神子': 'miko',
  '纯狐': 'junko',
  '赫卡提亚·拉碧斯拉祖利': 'hecatia',
  '赫卡提亚': 'hecatia',
  '摩多罗隐岐奈': 'okina',
  '埴安神袿姬': 'keiki',
  '饕餮尤魔': 'yuuma',
  '鬼人正邪': 'seija',
  '少名针妙丸': 'shinmyoumaru',
  '秦心': 'kokoro',
  '茨木华扇': 'kasen',
  '宇佐见堇子': 'sumireko',
  '铃瑚': 'ringo',
  '清兰': 'seiran',
  '克劳恩皮丝': 'clownpiece',
  '哆来咪·苏伊特': 'doremy',
  '依神女苑': 'joon',
  '依神紫苑': 'shion',
  '饭纲丸龙': 'megumu',
  '骊驹早鬼': 'saki',
  '早鬼': 'saki',
  '丁礼田舞': 'mai',
  '尔子田里乃': 'satono',
  '桑妮·米尔克': 'sunny',
  '桑妮': 'sunny',
  '露娜·切露德': 'luna',
  '露娜': 'luna',
  '斯塔·萨菲雅': 'star',
  '斯塔': 'star',
  '上白泽慧音': 'keine',
  '云居一轮': 'ichirin',
  '今泉影狼': 'kagerou',
  '八坂神奈子': 'kanako',
  '吉吊八千慧': 'yachie',
  '娜兹玲': 'nazrin',
  '宫古芳香': 'yoshika',
  '寅丸星': 'shou',
  '封兽鵺': 'nue',
  '小恶魔': 'koakuma',
  '大妖精': 'daiyousei',
  '天弓千亦': 'chimata',
  '奥野田美宵': 'miyoi',
  '姬海棠果': 'hatate',
  '姬虫百百世': 'momoyo',
  '幽谷响子': 'kyouko',
  '庭渡久侘歌': 'kutaka',
  '星熊勇仪': 'yuugi',
  '月夜见': 'tsukuyomi',
  '本居小铃': 'kosuzu',
  '朱鹭子': 'tokiko',
  '村纱水蜜': 'murasa',
  '杖刀偶磨弓': 'mayumi',
  '梅蒂欣·梅兰可莉': 'medicine',
  '梅蒂欣': 'medicine',
  '森近霖之助': 'rinnosuke',
  '水桥帕露西': 'parsee',
  '洩矢诹访子': 'suwako',
  '物部布都': 'futo',
  '犬走椛': 'momiji',
  '玉造魅须丸': 'misumaru',
  '秋穰子': 'minoriko',
  '秋静叶': 'shizuha',
  '稀神探女': 'sagume',
  '稗田阿求': 'akyuu',
  '米斯蒂娅·萝蕾莱': 'mystia',
  '米斯蒂娅': 'mystia',
  '绵月丰姬': 'toyohime',
  '绵月依姬': 'yorihime',
  '苏我屠自古': 'tojiko',
  '若鹭姬': 'wakasagihime',
  '莉格露·奈特巴格': 'wriggle',
  '莉格露': 'wriggle',
  '莉莉·霍瓦特': 'lily',
  '菅牧典': 'tsukasa',
  '蕾蒂·霍瓦特洛克': 'letty',
  '蕾蒂': 'letty',
  '豪德寺三花': 'mike',
  '赤蛮奇': 'sekibanki',
  '霍青娥': 'seiga',
  '青娥': 'seiga',
  '露米娅': 'rumia',
  '驹草山如': 'sannyo',
  '龙神': 'dragon',
  '冴月麟': 'rin',
  '堀川雷鼓': 'raiko',
  '多多良小伞': 'kogasa',
  '天魔': 'tenma',
  '山城高岭': 'takane',
  '俊达萌': 'zundamon',
  '月永爱': 'ai',
  '菲娅': 'fia',
  '雏森': 'hinamori'
};
