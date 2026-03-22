<script setup lang="ts">
import {
  X,
  ZoomIn,
  ZoomOut,
  Maximize2,
  MapPin,
  Users,
  Info,
  ChevronRight,
  ArrowLeft,
  MessageSquare,
  Send,
  Loader2
} from 'lucide-vue-next';
import { ref, nextTick, onMounted, onUnmounted } from 'vue';
import { generateCompletion } from '@/services/llm';

interface LocationInfo {
  id: string;
  name: string;
  x: number; // 0-100 percentage
  y: number; // 0-100 percentage
  description: string;
  characters: string[];
  subLocations?: string[];
  subLocationDetails?: Record<string, string>;
  collabCharacters?: string[];
  collabCharacterDetails?: Record<string, string>;
  type?:
    | 'shrine'
    | 'village'
    | 'forest'
    | 'mansion'
    | 'lake'
    | 'mountain'
    | 'underground'
    | 'castle'
    | 'temple';
}

defineProps<{
  isOpen: boolean;
}>();

const emit = defineEmits(['close']);

const zoom = ref(1);
const isDragging = ref(false);
const position = ref({ x: 0, y: 0 });
const startPos = ref({ x: 0, y: 0 });
const selectedLocation = ref<LocationInfo | null>(null);
const selectedSubLocationName = ref<string | null>(null);
const selectedDetailType = ref<'sub' | 'collab'>('sub');

// AI 问答状态
const isChatOpen = ref(false);
const chatMessages = ref<{ role: 'user' | 'assistant'; content: string }[]>([]);
const userInput = ref('');
const isLoading = ref(false);
const chatScrollContainer = ref<HTMLElement | null>(null);
const selectedModelType = ref<'chat' | 'logic' | 'memory' | 'misc'>('chat');

// 多人同步：处理远程 LLM Token
function handleRemoteLLMToken(e: CustomEvent) {
  const { token } = e.detail;
  if (token && isChatOpen.value) {
    // 寻找最后一个 assistant 消息，或者创建一个
    const lastMsg = chatMessages.value[chatMessages.value.length - 1];
    if (lastMsg && lastMsg.role === 'assistant') {
      lastMsg.content += token;
    } else {
      chatMessages.value.push({ role: 'assistant', content: token });
    }
    scrollToBottom();
  }
}

onMounted(() => {
  window.addEventListener('mp-llm-token', handleRemoteLLMToken as unknown as EventListener);
});

onUnmounted(() => {
  window.removeEventListener('mp-llm-token', handleRemoteLLMToken as unknown as EventListener);
});

const modelOptions = [
  { id: 'chat', name: 'LLM #1 (叙述者)' },
  { id: 'logic', name: 'LLM #2 (GM)' },
  { id: 'memory', name: 'LLM #3 (记录员)' },
  { id: 'misc', name: 'LLM #4 (记忆库)' }
] as const;

const typeMap: Record<string, string> = {
  shrine: '神社',
  village: '村落',
  forest: '森林',
  mansion: '洋馆',
  lake: '湖泊',
  mountain: '山岳',
  underground: '地底',
  castle: '城堡',
  temple: '寺庙'
};

// 幻想乡地点数据
const locations = ref<LocationInfo[]>([
  {
    id: 'myouren-temple',
    name: '命莲寺',
    x: 50.9,
    y: 74.6,
    type: 'temple',
    description:
      '命莲寺位于人间之里正南方的某处空地中，是由僧侣圣白莲创建的佛教寺庙。这里体现了圣白莲“佛法面前，众生平等”的理念，是人类与妖怪可以共同参拜、共同修行的独特场所。',
    characters: [
      '圣白莲',
      '寅丸星',
      '村纱水蜜',
      '娜兹玲',
      '封兽鵺',
      '云居一轮',
      '秦心',
      '多多良小伞',
      '幽谷响子'
    ],
    subLocations: ['命莲寺大殿', '命莲寺墓地', '梦殿大祀庙'],
    subLocationDetails: {
      命莲寺大殿:
        '庄严神圣的大殿，是僧侣们修行与诵经的核心场所。秦心与娜兹玲常在此研习佛法，空气中弥漫着淡淡的檀香味，能洗涤心灵的尘埃。',
      命莲寺墓地:
        '位于寺庙后方的宁静墓园，虽然环境幽静，却时常能见到多多良小伞试图惊吓路人的身影。这里也是通往神秘梦殿大祀庙的必经之地。',
      梦殿大祀庙:
        '曾深埋于地下的古老陵墓，现已通过圣人的伟力接入仙界。整座建筑被晶莹剔透的莲花池环绕，散发着超凡脱俗的仙气，是丰聪耳神子与其追随者的居所。'
    }
  },
  {
    id: 'misty-lake',
    name: '雾之湖',
    x: 37.5,
    y: 40.6,
    type: 'lake',
    description:
      '雾之湖是位于妖怪之山山脚下的神秘核心湖泊，因正午前后升起的浓雾而得名。这里栖息着大量妖精和体型巨大的鱼类，是幻想乡中景色优美但又充满未知危险的区域。',
    characters: ['琪露诺', '大妖精', '露米娅', '若鹭姬', '俊达萌'],
    subLocations: ['红魔馆', '雾之湖钓台', '春之小径'],
    subLocationDetails: {
      红魔馆:
        '屹立于湖畔的深红洋馆，其哥特式的塔楼在浓雾中若隐若现。作为吸血鬼领主的领地，这里散发着令人敬畏的威压，是湖区最醒目的地标。',
      雾之湖钓台:
        '由垂钓爱好者们搭建的木质平台，虽然简陋，却是观察湖中幻之鱼类的绝佳位置。有时也能见到若鹭姬在附近水域悄悄探头。',
      春之小径:
        '一条被繁花簇拥的幽静小路，连接着湖泊与魔法森林。微风拂过时，落英缤纷，步行其中仿佛能忘却世俗的烦恼。'
    },
    collabCharacters: ['俊达萌'],
    collabCharacterDetails: {
      俊达萌:
        '穿越而来的异世界虚拟歌手，以“毛豆妖精”的形态实体化。现作为红魔馆的临时外勤女仆，虽然运气极差且天然呆，但总能凭乐观心态迅速复原。'
    }
  },
  {
    id: 'human-village',
    name: '人间之里',
    x: 54.6,
    y: 49.9,
    type: 'village',
    description:
      '位于幻想乡中心区域的人类聚居地，是人类文明、经济与文化的核心。这里有着传统的建筑风格，部分不危险的妖怪也会在此与人类共存，每个月7号的集市日尤为热闹。',
    characters: [
      '上白泽慧音',
      '稗田阿求',
      '本居小铃',
      '奥野田美宵',
      '铃瑚',
      '清兰',
      '冴月麟',
      '朱鹭子',
      '雏森',
      '月永爱',
      '菲娅'
    ],
    subLocations: ['龙神广场', '观光缆车', '鲵吞亭', '寺子屋', '稗田邸', '铃奈庵'],
    subLocationDetails: {
      龙神广场:
        '村落最繁华的中心地带，矗立着巨大的龙神石像。这里商铺林立，是居民们交换情报与日常社交的核心。',
      观光缆车:
        '现代技术与魔法结合的产物，可从村里直达妖怪之山。透过车窗可以俯瞰整个人间之里的全景，是极佳的观光项目。',
      鲵吞亭:
        '一家充满人情味的老字号酒馆。在奥野田美宵的打理下，无论是人类还是微服出巡的妖怪，都能在这里找到慰藉心灵的美酒与佳肴。',
      寺子屋:
        '书声琅琅的学堂，上白泽慧音在此倾注心血教导孩子们。这里不仅是知识的殿堂，也是传承幻想乡历史的重要场所。',
      稗田邸:
        '历史悠久的稗田家宅邸，保存着幻想乡最完整的文献记录。稗田阿求在此代代编撰《幻想乡缘起》，记录着这片土地的点点滴滴。',
      铃奈庵:
        '藏书丰富的租书屋，本居小铃对这里的每一本书都如数家珍。除了普通的读物，这里偶尔也会出现一些蕴含神奇力量的“妖魔本”。'
    },
    collabCharacters: ['雏森', '月永爱', '菲娅'],
    collabCharacterDetails: {
      雏森: '在寺子屋打杂的半人半妖少女，性格要强且心思缜密。为了筹集母亲的医药费而努力工作，在干练的外表下隐藏着渴望关爱的内心。',
      月永爱:
        '来自外界的见习魔术师，总是元气满满。她擅长塔罗占卜，梦想在人间之里举办大型魔术秀，自称能感知到不凡的命运轨迹。',
      菲娅: '流亡至幻想乡的异世界小公主，性格柔软胆小。她对这个陌生的世界充满好奇与畏惧，目前正处于玩家的庇护之下，努力适应新生活。'
    }
  },
  {
    id: 'hakurei-shrine',
    name: '博丽神社',
    x: 79.3,
    y: 39.8,
    type: 'shrine',
    description:
      '坐落于幻想乡极东边境、博丽大结界之上的神社。它是维持大结界的核心，也是灵梦的住处。虽然参拜客稀少，但由于巫女的宽容态度，这里成为了妖怪们经常聚集的社交场所。',
    characters: ['博丽灵梦', '伊吹萃香', '比那名居天子', '针妙丸'],
    subLocations: ['本殿', '赛钱箱', '庭院', '间歇泉', '守矢神社分社'],
    subLocationDetails: {
      本殿: '古朴而宁静的建筑，博丽巫女日常生活与修行的核心。尽管装饰简单，却透着一股不容侵犯的威严与平和。',
      赛钱箱:
        '神社庭院中那个略显寂寞的木箱。虽然它总是在等待着香客的慷慨，但更多时候只是作为灵梦叹息时的背景。',
      庭院: '视野开阔的空地，是举办宴会、清扫落叶以及偶尔进行弹幕对决的舞台。从这里可以远眺幻想乡的群山。',
      间歇泉:
        '伴随着巨大的轰鸣声从地下喷薄而出的泉眼。水汽中夹杂着地底的炙热气息，是通往旧地狱世界的秘密门户。',
      守矢神社分社:
        '两家神社友好竞争与合作的象征。这座分社不仅分流了信仰，也成为了博丽神社与妖怪之山之间便捷的沟通枢纽。'
    }
  },
  {
    id: 'sunflower-field',
    name: '太阳花田',
    x: 23.8,
    y: 76.7,
    type: 'forest',
    description:
      '遍布向日葵的广阔草原，由风见幽香管理。这里寄宿着数众多的妖精，夏季夜晚甚至会举办盛大的演唱会。花田深处还隐藏着生长有毒铃兰花的无名之丘。',
    characters: ['风见幽香', '梅蒂欣', '莉莉霍瓦特'],
    subLocations: ['风见幽香的住所', '无名之丘'],
    subLocationDetails: {
      风见幽香的住所:
        '掩映在万花丛中的精致木屋，处处透着主人对植物的热爱。若非主人的威名在外，这里本该是幻想乡最迷人的度假胜地。',
      无名之丘:
        '一片被紫色铃兰覆盖的寂静山丘。虽然美得凄凉，但空气中弥漫的剧毒花粉提醒着外人：这里是属于人偶梅蒂欣的领地。'
    }
  },
  {
    id: 'magic-forest',
    name: '魔法森林',
    x: 31.7,
    y: 61.4,
    type: 'forest',
    description:
      '幻想乡中最大、湿度最高的原始森林，充斥着能产生幻觉的瘴气。这种环境虽然危险，却有助于魔法使提升魔力，因此吸引了魔理沙和爱丽丝等魔法使在此定居。',
    characters: ['雾雨魔理沙', '爱丽丝', '露米娅', '莉格露', '森近霖之助'],
    subLocations: ['雾雨魔法店', '香霖堂', '爱丽丝的宅邸', '无缘冢'],
    subLocationDetails: {
      雾雨魔法店:
        '虽然门口挂着营业的招牌，但推门进去多半只能看到堆积如山的奇妙杂物。这里是魔理沙研制新型弹幕与存放“借来”物品的基地。',
      香霖堂:
        '位于森林边缘的一座静谧古董店。店主森近霖之助收集了许多来自外界的奇妙物品，每一件器物背后都隐藏着不为人知的故事。',
      爱丽丝的宅邸:
        '森林中一座精致的西式洋馆。屋内摆满了各式各样栩栩如生的人偶，在爱丽丝精妙的丝线操控下，这些家务人偶能让屋子始终保持一尘不染。',
      无缘冢:
        '幻想乡中最为阴郁的地带之一，是结界薄弱、彼岸花盛开的地方。这里埋葬着无数无名的遗骨，空气中弥漫着淡淡的哀愁。'
    }
  },
  {
    id: 'bamboo-forest',
    name: '迷途竹林',
    x: 76,
    y: 79.6,
    type: 'forest',
    description:
      '位于人间之里东南侧的广阔竹林，以极易迷路而闻名。林中常年弥漫着雾气，竹子生长极快且形状诡异。深处隐藏着古老的宅邸“永远亭”，是月之民隐居的地方。',
    characters: ['蓬莱山辉夜', '八意永琳', '铃仙', '因幡帝', '藤原妹红', '米斯蒂娅'],
    subLocations: ['永远亭', '夜雀食堂', '藤原小屋'],
    subLocationDetails: {
      永远亭:
        '隐匿在竹林深处的辉煌建筑，充满了超越时代的古老气息。这里是月之民的避风港，内部的空间感被永琳的术法扭曲，常人难窥其全貌。',
      夜雀食堂:
        '竹林深处唯一的暖光。米斯蒂娅在此支起摊位，为迷途的行人或深夜出没的妖怪提供热气腾腾的小吃，歌声伴随着炭火味在竹林间回荡。',
      藤原小屋:
        '藤原妹红在竹林中的简朴居所。虽然简陋，却承载着这位不死之人漫长岁月中难得的片刻安宁。'
    }
  },
  {
    id: 'shimmy-castle',
    name: '辉针城',
    x: 55.9,
    y: 26,
    type: 'castle',
    description:
      '悬浮在幻想乡上空的倒悬城池，城内展现出日式传统美景。它是利用万宝槌魔力建起的奇迹建筑，虽曾因魔力逆转而被幽闭，如今仍是幻想乡天空中一道独特的风景。',
    characters: ['少名针妙丸', '鬼人正邪', '今泉影狼', '崛川雷鼓'],
    subLocations: ['逆针阁'],
    subLocationDetails: {
      逆针阁:
        '辉针城中最核心的倒悬大厅。精美的浮世绘与传统的日式结构在这里被重力反转，展现出一种荒诞而华丽的视觉冲击力。'
    }
  },
  {
    id: 'sdm',
    name: '红魔馆',
    x: 18.1,
    y: 44.7,
    type: 'mansion',
    description:
      '坐落于雾之湖北岸的哥特式洋馆，散发着深红色的妖气。这座由吸血鬼蕾米莉亚从外界整体迁入的奢华居所，拥有幻想乡最大的地下图书馆，生活风格华丽且充满了西洋气息。',
    characters: ['蕾米莉亚', '芙兰朵露', '十六夜咲夜', '帕秋莉', '红美铃', '小恶魔', '俊达萌'],
    subLocations: ['大图书馆', '地下室', '大厅', '俊达萌'],
    subLocationDetails: {
      大图书馆:
        '由帕秋莉管理的巨大书库，空气中弥漫着古老羊皮纸与魔法药水的味道。这里收藏了无数禁忌的魔导书，是魔法使梦寐以求的圣地。',
      地下室:
        '位于馆内最深处的阴冷空间，长期以来一直是二小姐芙兰朵露的活动区域。复杂的防御魔法和压抑的气氛让人不寒而栗。',
      大厅: '红魔馆的门面所在，铺着华贵的深红地毯。门卫红美铃常在此尽职（或是在打瞌睡）地守卫着这座洋馆的威严。',
      俊达萌:
        '穿越而来的异世界虚拟歌手，以“毛豆妖精”的形态实体化。现作为红魔馆的临时外勤女仆，主要负责雾之湖周边的采集与传讯，虽然笨拙但非常勤快。'
    }
  },
  {
    id: 'youkai-mountain',
    name: '妖怪之山',
    x: 31.9,
    y: 22.3,
    type: 'mountain',
    description:
      '幻想乡的科技与文明中心，居住着天狗和河童等高度发达的妖怪社会。山中拥有工厂、报社等现代化设施，管理极其严格。山顶的风神之湖旁坐落着从外界迁入的守矢神社。',
    characters: [
      '射命丸文',
      '犬走椛',
      '河城荷取',
      '姬海棠果',
      '键山雏',
      '东风谷早苗',
      '八坂神奈子',
      '洩矢诹访子'
    ],
    subLocations: [
      '守矢神社',
      '九天瀑布',
      '河童机械工厂',
      '虹龙洞',
      '月虹市场',
      '妖怪的树海',
      '黑暗风穴',
      '大蛤蟆之池',
      '秘天崖',
      '伪天棚',
      '中有之道',
      '三途之川',
      '玄云海',
      '媒体中心'
    ],
    subLocationDetails: {
      守矢神社:
        '矗立在山顶云端的神社，供奉着从外界迁入的强大神明。这里不仅是信仰的源泉，也通过先进的科学技术影响着整座大山的运作。',
      九天瀑布:
        '从绝壁上奔流而下的壮丽瀑布，水汽氤氲中常能见到白狼天狗巡逻队矫健的身影，是妖怪之山的天然防线。',
      河童机械工厂:
        '充满了齿轮啮合声与蒸汽轰鸣的地下工坊。河童们在这里发挥惊人的创造力，制造出各种超越幻想乡常识的精密机械. ',
      虹龙洞:
        '由人工开凿、蜿蜒曲折的矿坑。洞壁上镶嵌着色彩斑斓的龙珠，在黑暗中散发出迷人的幽光，吸引着无数寻宝者。',
      月虹市场:
        '位于山腰处的繁华集市，是能力卡牌交易的核心场所。每当市场开启，来自幻想乡各地的妖怪都会在此汇聚，热闹非凡。',
      妖怪的树海:
        '山脚下一片茂密而幽深的原始森林。这里的树木高耸入云，遮天蔽日，是许多隐居妖怪的天然庇护所。',
      黑暗风穴:
        '一个通向地底世界的神秘入口。洞口不断吹出冰冷刺骨的寒风，仿佛能将闯入者的灵魂冻结。',
      大蛤蟆之池:
        '半山腰的一处清幽水潭，传说中是进行某种神圣仪式的必经之地。平静的水面下似乎潜伏着古老而强大的气息。',
      秘天崖:
        '怪石嶙峋的险峻山崖，是山童们建立聚居地的地方。这里的岩石形态各异，仿佛是自然界鬼斧神工的艺术品. ',
      伪天棚:
        '位于高海拔地区的开阔草甸，视野极佳。在这里开设的地下赌场是某些妖怪发泄精力的秘密场所。',
      中有之道:
        '一条引导生灵走向彼岸的长廊。两侧开满了彼岸花，走在这里的人会感到一种时空错位的虚幻感。',
      三途之川:
        '生死两界的分水岭。河面上常年雾气昭昭，唯有死神的小船在平静的水面上划出一道道涟漪。',
      玄云海:
        '层峦叠嶂之上的金色云海，是通往至高天界的必经之路。金色的光芒穿透云层，呈现出一种神圣不可侵犯的美。',
      媒体中心:
        '由鸦天狗运营的现代化新闻中心。在这里，射命丸文和姬海棠果为了抢占头条新闻而展开激烈的“文笔之战”。'
    }
  },
  {
    id: 'former-hell',
    name: '旧地狱',
    x: 57.3,
    y: 91.4,
    type: 'underground',
    description:
      '位于地底深处的广阔地下世界，曾是地狱的一部分。现由鬼族接管并建立了热闹的街道和温泉街。地灵殿的主人古明地觉负责管理下方的灼热地狱遗址，是地底妖怪的权力核心。',
    characters: ['古明地觉', '古明地恋', '星熊勇仪', '水桥帕露西', '火焰猫燐', '灵乌路空'],
    subLocations: ['地灵殿', '旧地狱街道', '旧地狱温泉街', '灼热地狱遗址'],
    subLocationDetails: {
      地灵殿:
        '地底最宏伟的宫殿，整体风格充满了维多利亚时代的精致与压抑。宫殿主人古明地觉在此读取着每一个造访者的心声。',
      旧地狱街道:
        '热闹非凡的地底商业街。在鬼族的治理下，这里充满了江湖气息，江户风格的建筑在昏暗的火光下显得格外亲切。',
      旧地狱温泉街:
        '著名的地底疗养圣地。在这里，灼热地狱的余热被转化为舒适的温泉水，是妖怪们在战斗之余放松身心的最佳选择。',
      灼热地狱遗址:
        '位于地底最深处的禁忌之地。滚烫的岩浆在此翻滚，为地底世界提供着源源不断的能源，由灵乌路空负责监管。'
    }
  }
]);

function handleLocationClick(loc: LocationInfo) {
  if (isDragging.value) return;
  selectedLocation.value = loc;
  selectedSubLocationName.value = null; // 重置子地点
  isChatOpen.value = false; // 切换地点时关闭聊天
  chatMessages.value = []; // 清空之前的对话内容
}

function handleSubLocationClick(subName: string, type: 'sub' | 'collab') {
  selectedSubLocationName.value = subName;
  selectedDetailType.value = type;
  // 进入子地点或角色详情时不一定要关闭聊天，可以让 AI 继续回答
}

function backToLocation() {
  selectedSubLocationName.value = null;
}

function handleClose() {
  emit('close');
  zoom.value = 1;
  position.value = { x: 0, y: 0 };
  selectedLocation.value = null;
  isChatOpen.value = false;
  chatMessages.value = [];
}

function handleZoom(delta: number) {
  zoom.value = Math.max(0.5, Math.min(3, zoom.value + delta));
}

function resetZoom() {
  zoom.value = 1;
  position.value = { x: 0, y: 0 };
}

// AI 问答逻辑
function handleAIAssistantClick() {
  isChatOpen.value = !isChatOpen.value;
  if (isChatOpen.value && chatMessages.value.length === 0) {
    // 初始欢迎语
    chatMessages.value.push({
      role: 'assistant',
      content: `您好！我能为您答疑解惑。关于 ${selectedLocation.value?.name || '这个地方'}，您有什么想了解的吗？`
    });
  }
}

async function scrollToBottom() {
  await nextTick();
  if (chatScrollContainer.value) {
    chatScrollContainer.value.scrollTop = chatScrollContainer.value.scrollHeight;
  }
}

async function sendMessage() {
  if (!userInput.value.trim() || isLoading.value) return;

  const message = userInput.value.trim();
  userInput.value = '';
  chatMessages.value.push({ role: 'user', content: message });
  isLoading.value = true;
  await scrollToBottom();

  try {
    // 组装上下文提示词
    let locationContext = selectedLocation.value
      ? `
当前地点：${selectedLocation.value.name}
地点描述：${selectedLocation.value.description}
相关人物：${selectedLocation.value.characters.join('、')}
${selectedLocation.value.subLocations ? `主要区域：${selectedLocation.value.subLocations.join('、')}` : ''}
${selectedLocation.value.collabCharacters ? `乱入角色：${selectedLocation.value.collabCharacters.join('、')}` : ''}
`.trim()
      : '目前没有选定具体地点。';

    // 如果当前选中了子地点或联动角色，添加更具体的上下文
    if (selectedSubLocationName.value) {
      const detail = (
        selectedDetailType.value === 'collab'
          ? selectedLocation.value?.collabCharacterDetails
          : selectedLocation.value?.subLocationDetails
      )?.[selectedSubLocationName.value];

      if (detail) {
        locationContext += `\n\n当前正在查看的具体${selectedDetailType.value === 'collab' ? '角色' : '区域'}：${selectedSubLocationName.value}\n具体描述：${detail}`;
      }
    }

    const systemPrompt = `你是一名温柔、博学且充满亲和力的《东方Project》科普引导者。
你的任务是为用户解答关于幻想乡地理、人物和相关背景的问题。
你的语气应该像一个真实的人，而不是冷冰冰的 AI。你可以适当地使用一些语气词（如“呢”、“哦”、“呀”），表现出对幻想乡的热爱。

当前背景信息：
${locationContext}

请根据以上背景信息和你的知识储备，回答用户的问题。如果问题超出了当前地点的范围，你也可以根据《东方Project》的设定进行回答，但要保持引导者的身份。`;

    let assistantMessage = { role: 'assistant' as const, content: '' };
    chatMessages.value.push(assistantMessage);

    const response = await generateCompletion({
      modelType: selectedModelType.value,
      messages: [{ role: 'user', content: message }],
      systemPrompt: systemPrompt,
      stream: true,
      onStream: (token: string) => {
        assistantMessage.content += token;
        scrollToBottom();
      }
    });

    if (!response && !assistantMessage.content) {
      assistantMessage.content = '抱歉，我现在有点走神了，请稍后再试。';
    }
  } catch (error) {
    console.error('AI Chat Error:', error);
    chatMessages.value.push({
      role: 'assistant',
      content: '（哎呀，好像出了一点小意外... 没法连接到博丽大结界外的思念了呢。）'
    });
  } finally {
    isLoading.value = false;
    await scrollToBottom();
  }
}

function startDrag(e: MouseEvent) {
  if (zoom.value <= 1) return;
  isDragging.value = true;
  startPos.value = { x: e.clientX - position.value.x, y: e.clientY - position.value.y };
}

function onDrag(e: MouseEvent) {
  if (!isDragging.value) return;
  position.value = {
    x: e.clientX - startPos.value.x,
    y: e.clientY - startPos.value.y
  };
}

function stopDrag() {
  isDragging.value = false;
}

// Touch event handlers for mobile
const touchId = ref<number | null>(null);

function handleTouchStart(e: TouchEvent) {
  const touch = e.touches[0];
  if (!touch) return;
  touchId.value = touch.identifier;
  isDragging.value = true;
  startPos.value = { x: touch.clientX - position.value.x, y: touch.clientY - position.value.y };
}

function handleTouchMove(e: TouchEvent) {
  if (!isDragging.value || touchId.value === null) return;
  const touch = Array.from(e.touches).find((t) => t.identifier === touchId.value);
  if (!touch) return;
  e.preventDefault();
  position.value = {
    x: touch.clientX - startPos.value.x,
    y: touch.clientY - startPos.value.y
  };
}

function handleTouchEnd() {
  touchId.value = null;
  isDragging.value = false;
}
</script>

<template>
  <Transition name="fade">
    <div v-if="isOpen" class="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-8">
      <!-- Backdrop -->
      <div class="absolute inset-0 bg-izakaya-wood/80 backdrop-blur-sm" @click="handleClose"></div>

      <!-- Content Container (fullscreen with padding) -->
      <div
        class="relative w-full h-full max-w-[95vw] max-h-[90vh] bg-stone-950 rounded-lg shadow-[0_0_50px_rgba(0,0,0,0.5)] overflow-hidden flex flex-col animate-in zoom-in-95 duration-300 border border-white/10"
      >
        <!-- Map Viewer (Full Surface) -->
        <div
          class="relative w-full h-full overflow-hidden flex items-center justify-center cursor-grab active:cursor-grabbing touch-none"
          @mousedown="startDrag"
          @mousemove="onDrag"
          @mouseup="stopDrag"
          @mouseleave="stopDrag"
          @touchstart.passive="handleTouchStart"
          @touchmove="handleTouchMove"
          @touchend="handleTouchEnd"
        >
          <div
            class="transition-transform duration-200 ease-out"
            :style="{
              transform: `scale(${zoom}) translate(${position.x / zoom}px, ${position.y / zoom}px)`
            }"
          >
            <!-- Image container with relative positioning for markers -->
            <div class="relative">
              <img
                src="@/assets/images/map/幻想乡地图.webp"
                alt="幻想乡地图"
                class="block pointer-events-none select-none max-w-none h-[90vh]"
              />

              <!-- Location Markers (positioned relative to image) -->
              <div
                v-for="loc in locations"
                :key="loc.id"
                class="absolute group/marker cursor-pointer"
                :style="{
                  left: `${loc.x}%`,
                  top: `${loc.y}%`,
                  transform: `translate(-50%, -50%) scale(${1 / Math.sqrt(zoom)})`
                }"
                @click.stop="handleLocationClick(loc)"
              >
                <!-- Ripple Effect -->
                <div
                  class="absolute inset-0 w-10 h-10 -m-5 border-2 border-white/30 rounded-full animate-ripple"
                ></div>
                <div
                  class="absolute inset-0 w-10 h-10 -m-5 border border-white/20 rounded-full animate-ripple"
                  style="animation-delay: 1.5s"
                ></div>

                <!-- Marker Icon (Spirit Orb Style) -->
                <div
                  class="relative w-5 h-5 bg-white/20 backdrop-blur-[2px] border border-white/40 rounded-full shadow-[0_0_15px_rgba(255,255,255,0.3)] transition-all duration-300 group-hover/marker:scale-125 group-hover/marker:bg-white/40 group-hover/marker:border-white/60 flex items-center justify-center overflow-hidden"
                >
                  <!-- Inner Core -->
                  <div
                    class="w-2 h-2 bg-white/60 rounded-full animate-pulse shadow-[0_0_8px_white]"
                  ></div>
                  <!-- Shimmer Effect -->
                  <div
                    class="absolute inset-0 bg-gradient-to-tr from-transparent via-white/10 to-transparent -translate-x-full group-hover/marker:translate-x-full transition-transform duration-1000"
                  ></div>
                </div>

                <!-- Label -->
                <div
                  class="absolute top-full left-1/2 -translate-x-1/2 mt-2 px-2 py-0.5 bg-black/60 backdrop-blur-sm rounded text-[10px] text-white whitespace-nowrap opacity-0 group-hover/marker:opacity-100 transition-opacity pointer-events-none"
                >
                  {{ loc.name }}
                </div>
              </div>
            </div>
          </div>

          <!-- Location Detail Card (Overlay on the whole container) -->
          <Transition name="slide-fade">
            <div
              v-if="selectedLocation"
              class="absolute right-2 md:right-6 top-16 md:top-24 bottom-16 md:bottom-24 left-2 md:left-auto w-auto md:w-80 z-30 pointer-events-auto"
              @touchstart.stop
              @touchmove.stop
              @mousedown.stop
            >
              <div
                class="h-full bg-izakaya-paper/95 backdrop-blur-xl rounded-2xl shadow-2xl border-2 border-izakaya-wood/20 overflow-hidden flex flex-col relative"
              >
                <!-- Card Texture -->
                <div
                  class="absolute inset-0 pointer-events-none opacity-20 bg-texture-rice-paper mix-blend-multiply"
                ></div>

                <!-- Close Button -->
                <button
                  @click="selectedLocation = null"
                  class="absolute top-4 right-4 p-1.5 hover:bg-touhou-red/10 rounded-full transition-colors text-izakaya-wood/40 hover:text-touhou-red z-20"
                >
                  <X class="w-4 h-4" />
                </button>

                <!-- Back Button (for sub-locations) -->
                <button
                  v-if="selectedSubLocationName"
                  @click="backToLocation"
                  class="absolute top-4 left-4 px-2 py-1 hover:bg-izakaya-wood/10 rounded-lg transition-colors text-izakaya-wood/60 hover:text-izakaya-wood z-20 flex items-center gap-1 text-[11px] font-bold"
                >
                  <ArrowLeft class="w-3.5 h-3.5" />
                  <span>返回</span>
                </button>

                <!-- Card Content -->
                <div
                  class="relative z-0 pt-14 px-6 pb-6 flex-1 overflow-y-auto custom-scrollbar space-y-6 overscroll-contain"
                  style="-webkit-overflow-scrolling: touch"
                >
                  <!-- Main Location Content -->
                  <div
                    v-if="!selectedSubLocationName"
                    class="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300"
                  >
                    <!-- Header -->
                    <div>
                      <div
                        class="text-[10px] font-bold text-touhou-red/60 uppercase tracking-widest mb-1"
                      >
                        {{ typeMap[selectedLocation.type || ''] || '地点' }}
                      </div>
                      <h3 class="text-2xl font-display font-bold text-izakaya-wood">
                        {{ selectedLocation.name }}
                      </h3>
                      <div class="h-1 w-12 bg-touhou-red mt-2"></div>
                    </div>

                    <!-- Description -->
                    <div class="space-y-2">
                      <div class="flex items-center gap-2 text-izakaya-wood/40 text-xs">
                        <Info class="w-3 h-3" />
                        <span>地点简介</span>
                      </div>
                      <p class="text-sm text-izakaya-wood/80 leading-relaxed font-serif">
                        {{ selectedLocation.description }}
                      </p>
                    </div>

                    <!-- Characters -->
                    <div class="space-y-3">
                      <div class="flex items-center gap-2 text-izakaya-wood/40 text-xs">
                        <Users class="w-3 h-3" />
                        <span>相关人物</span>
                      </div>
                      <div class="flex flex-wrap gap-2">
                        <span
                          v-for="char in selectedLocation.characters"
                          :key="char"
                          class="px-2 py-1 bg-izakaya-wood/5 border border-izakaya-wood/10 rounded text-xs text-izakaya-wood/70 hover:bg-touhou-red/5 hover:border-touhou-red/20 transition-colors cursor-default"
                        >
                          {{ char }}
                        </span>
                      </div>
                    </div>

                    <!-- Sub-locations -->
                    <div v-if="selectedLocation.subLocations" class="space-y-3">
                      <div class="flex items-center gap-2 text-izakaya-wood/40 text-xs">
                        <MapPin class="w-3 h-3" />
                        <span>主要区域</span>
                      </div>
                      <div class="grid grid-cols-1 gap-1.5">
                        <div
                          v-for="sub in selectedLocation.subLocations"
                          :key="sub"
                          @click="handleSubLocationClick(sub, 'sub')"
                          class="flex items-center justify-between p-2 bg-white/40 rounded border border-izakaya-wood/5 text-xs text-izakaya-wood/60 group/sub cursor-pointer hover:bg-white/60 hover:border-touhou-red/20 transition-all"
                        >
                          <span>{{ sub }}</span>
                          <ChevronRight
                            class="w-3 h-3 opacity-0 group-hover/sub:opacity-100 transition-opacity text-touhou-red"
                          />
                        </div>
                      </div>
                    </div>

                    <!-- Collab Characters -->
                    <div v-if="selectedLocation.collabCharacters" class="space-y-3 mt-6">
                      <div class="flex items-center gap-2 text-izakaya-wood/40 text-xs">
                        <Users class="w-3 h-3" />
                        <span>乱入角色</span>
                      </div>
                      <div class="grid grid-cols-1 gap-1.5">
                        <div
                          v-for="char in selectedLocation.collabCharacters"
                          :key="char"
                          @click="handleSubLocationClick(char, 'collab')"
                          class="flex items-center justify-between p-2 bg-izakaya-wood/5 rounded border border-izakaya-wood/10 text-xs text-izakaya-wood/60 group/sub cursor-pointer hover:bg-white/60 hover:border-touhou-red/20 transition-all"
                        >
                          <div class="flex items-center gap-2">
                            <span class="w-1.5 h-1.5 bg-touhou-red/40 rounded-full"></span>
                            <span>{{ char }}</span>
                          </div>
                          <ChevronRight
                            class="w-3 h-3 opacity-0 group-hover/sub:opacity-100 transition-opacity text-touhou-red"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  <!-- Sub-Location Detail Content -->
                  <div
                    v-else
                    class="space-y-6 animate-in fade-in slide-in-from-left-4 duration-300"
                  >
                    <div>
                      <div
                        class="text-[10px] font-bold text-izakaya-wood/40 uppercase tracking-widest mb-1"
                      >
                        {{ selectedLocation.name }} ·
                        {{ selectedDetailType === 'collab' ? '角色设定' : '区域说明' }}
                      </div>
                      <h3 class="text-xl font-display font-bold text-izakaya-wood">
                        {{ selectedSubLocationName }}
                      </h3>
                      <div class="h-1 w-8 bg-izakaya-wood/20 mt-2"></div>
                    </div>

                    <div class="space-y-2">
                      <div class="flex items-center gap-2 text-izakaya-wood/40 text-xs">
                        <Info v-if="selectedDetailType === 'sub'" class="w-3 h-3" />
                        <Users v-else class="w-3 h-3" />
                        <span>{{ selectedDetailType === 'collab' ? '角色背景' : '区域说明' }}</span>
                      </div>
                      <p class="text-sm text-izakaya-wood/80 leading-relaxed font-serif">
                        {{
                          (selectedDetailType === 'collab'
                            ? selectedLocation.collabCharacterDetails
                            : selectedLocation.subLocationDetails)?.[selectedSubLocationName!] ||
                          '暂无详细说明。'
                        }}
                      </p>
                    </div>

                    <div class="p-4 bg-izakaya-wood/5 rounded-xl border border-izakaya-wood/10">
                      <p class="text-[10px] text-izakaya-wood/40 italic">
                        {{
                          selectedDetailType === 'collab'
                            ? `这位角色常出现在 ${selectedLocation.name} 区域。`
                            : `该区域位于 ${selectedLocation.name} 范围内。`
                        }}
                        你可以点击左上角的“返回”查看整体介绍。
                      </p>
                    </div>
                  </div>
                </div>

                <!-- Footer Action -->
                <div class="p-4 bg-izakaya-wood/5 border-t border-izakaya-wood/10 relative z-10">
                  <button
                    @click="handleAIAssistantClick"
                    class="w-full py-2 bg-izakaya-wood text-white text-xs rounded-lg hover:bg-touhou-red transition-colors shadow-md font-display tracking-widest flex items-center justify-center gap-2"
                  >
                    <MessageSquare class="w-3.5 h-3.5" />
                    {{ isChatOpen ? '关闭笔录' : '求闻笔录' }}
                  </button>
                </div>

                <!-- AI Chat Overlay -->
                <Transition name="fade">
                  <div
                    v-if="isChatOpen"
                    class="absolute inset-0 z-50 bg-izakaya-paper flex flex-col"
                  >
                    <!-- Chat Header -->
                    <div
                      class="p-4 border-b border-izakaya-wood/10 flex flex-col gap-3 bg-izakaya-wood/5"
                    >
                      <div class="flex items-center justify-between">
                        <div class="flex items-center gap-2">
                          <div
                            class="w-6 h-6 bg-touhou-red rounded-full flex items-center justify-center"
                          >
                            <MessageSquare class="w-3 h-3 text-white" />
                          </div>
                          <span class="text-sm font-bold text-izakaya-wood font-display"
                            >求闻笔录</span
                          >
                        </div>
                        <button
                          @click="isChatOpen = false"
                          class="p-1 hover:bg-izakaya-wood/10 rounded-full transition-colors"
                        >
                          <X class="w-4 h-4 text-izakaya-wood/40" />
                        </button>
                      </div>

                      <!-- Model Selector -->
                      <div class="flex items-center gap-2">
                        <span
                          class="text-[10px] text-izakaya-wood/40 font-bold uppercase tracking-tighter"
                          >模型配置:</span
                        >
                        <select
                          v-model="selectedModelType"
                          class="bg-white/60 border border-izakaya-wood/10 rounded px-2 py-0.5 text-[10px] text-izakaya-wood/60 focus:outline-none focus:border-touhou-red/40 transition-colors cursor-pointer"
                        >
                          <option v-for="opt in modelOptions" :key="opt.id" :value="opt.id">
                            {{ opt.name }}
                          </option>
                        </select>
                      </div>
                    </div>

                    <!-- Chat Messages -->
                    <div
                      ref="chatScrollContainer"
                      class="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar"
                    >
                      <div
                        v-for="(msg, index) in chatMessages"
                        :key="index"
                        :class="['flex', msg.role === 'user' ? 'justify-end' : 'justify-start']"
                      >
                        <div
                          :class="[
                            'max-w-[85%] p-3 rounded-2xl text-sm shadow-sm',
                            msg.role === 'user'
                              ? 'bg-izakaya-wood text-white rounded-tr-none'
                              : 'bg-white/60 text-izakaya-wood border border-izakaya-wood/10 rounded-tl-none'
                          ]"
                        >
                          <p class="leading-relaxed font-serif whitespace-pre-wrap">
                            {{ msg.content }}
                          </p>
                        </div>
                      </div>
                      <div v-if="isLoading" class="flex justify-start">
                        <div
                          class="bg-white/60 p-3 rounded-2xl rounded-tl-none border border-izakaya-wood/10 shadow-sm"
                        >
                          <Loader2 class="w-4 h-4 animate-spin text-touhou-red" />
                        </div>
                      </div>
                    </div>

                    <!-- Chat Input -->
                    <div class="p-4 border-t border-izakaya-wood/10 bg-white/40">
                      <div class="relative flex items-center">
                        <input
                          v-model="userInput"
                          @keyup.enter="sendMessage"
                          placeholder="求闻..."
                          class="w-full bg-white/60 border border-izakaya-wood/20 rounded-full py-2 pl-4 pr-10 text-xs focus:outline-none focus:border-touhou-red transition-colors font-serif"
                          :disabled="isLoading"
                        />
                        <button
                          @click="sendMessage"
                          :disabled="isLoading || !userInput.trim()"
                          class="absolute right-1 p-1.5 bg-izakaya-wood text-white rounded-full hover:bg-touhou-red disabled:opacity-50 disabled:hover:bg-izakaya-wood transition-all"
                        >
                          <Send class="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                </Transition>
              </div>
            </div>
          </Transition>

          <!-- Floating Header (Overlay on top of map) -->
          <div
            class="absolute top-0 left-0 right-0 z-20 flex items-center justify-between p-6 bg-gradient-to-b from-black/60 to-transparent pointer-events-none"
          >
            <div class="flex items-center gap-4 pointer-events-auto">
              <div
                class="w-10 h-10 rounded-full bg-touhou-red flex items-center justify-center shadow-lg"
              >
                <span class="text-white text-2xl">🗺️</span>
              </div>
              <div class="drop-shadow-md">
                <h2 class="text-2xl font-display font-bold text-white leading-none tracking-widest">
                  幻想乡全图
                </h2>
                <p class="text-xs text-white/60 font-serif mt-1 uppercase tracking-tighter">
                  Gensokyo Map · 21:9 Cinema Scope
                </p>
              </div>
            </div>

            <div class="flex items-center gap-3 pointer-events-auto">
              <!-- Glassmorphism Controls -->
              <div
                class="flex items-center bg-black/40 backdrop-blur-md rounded-full border border-white/20 p-1 px-2 shadow-xl"
              >
                <button
                  @click="handleZoom(0.2)"
                  class="p-2 hover:bg-white/20 rounded-full transition-colors text-white/80"
                  title="放大"
                >
                  <ZoomIn class="w-5 h-5" />
                </button>
                <div class="w-px h-4 bg-white/10 mx-1"></div>
                <button
                  @click="handleZoom(-0.2)"
                  class="p-2 hover:bg-white/20 rounded-full transition-colors text-white/80"
                  title="缩小"
                >
                  <ZoomOut class="w-5 h-5" />
                </button>
                <div class="w-px h-4 bg-white/10 mx-1"></div>
                <button
                  @click="resetZoom"
                  class="p-2 hover:bg-white/20 rounded-full transition-colors text-white/80"
                  title="重置"
                >
                  <Maximize2 class="w-5 h-5" />
                </button>
              </div>

              <button
                @click="handleClose"
                class="p-2.5 bg-black/40 backdrop-blur-md hover:bg-touhou-red/80 border border-white/20 rounded-full transition-all text-white shadow-xl group"
              >
                <X class="w-6 h-6 group-hover:rotate-90 transition-transform duration-300" />
              </button>
            </div>
          </div>

          <!-- Floating Helper Text -->
          <div
            class="absolute bottom-6 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 z-20 pointer-events-none"
          >
            <div
              class="px-6 py-2 bg-black/40 backdrop-blur-md border border-white/10 rounded-full text-white/90 text-sm shadow-2xl tracking-wide"
            >
              {{ zoom > 1 ? '按住鼠标左键自由拖动' : '幻想乡全图' }}
            </div>
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.slide-fade-enter-active {
  transition: all 0.4s ease-out;
}
.slide-fade-leave-active {
  transition: all 0.3s ease-in;
}
.slide-fade-enter-from,
.slide-fade-leave-to {
  transform: translateX(30px);
  opacity: 0;
}

@keyframes ripple-pulse {
  0% {
    transform: scale(0.8);
    opacity: 0.8;
  }
  100% {
    transform: scale(2.2);
    opacity: 0;
  }
}

.animate-ripple {
  animation: ripple-pulse 3s cubic-bezier(0.23, 1, 0.32, 1) infinite;
}
</style>
