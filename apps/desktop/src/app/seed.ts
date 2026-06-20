import { characterRepository, settingsRepository, worldbookRepository, presetRepository } from "@/db/repositories";
import { generateId } from "@neo-tavern/shared";
import type {
  Character,
  CreateCharacterInput,
  RegexPreset,
  Worldbook,
  CreateWorldbookEntryInput,
  Preset,
  PresetItem,
} from "@neo-tavern/shared";

const LUNA_ID = "_neo_seed_luna";
const LUNA_WB_ID = "_neo_seed_luna_worldbook";
const LUNA_ENGLISH_ID = "_neo_seed_luna_english";
const LUNA_ENGLISH_WB_ID = "_neo_seed_luna_worldbook_english";
const SERAPHINA_WB_ID = "_neo_seed_seraphina_worldbook";

const LUNA_CHARACTER_CN: CreateCharacterInput = {
  id: LUNA_ID,
  name: "露娜",
  hidden: false,
  description:
    "阿塞尔大图书馆的守书人。露娜是一位沉静而睿智的图书管理员，已经读过高塔书厅中几乎每一本书。她说话从容，像翻动古老书页一样谨慎地挑选词句；她身上有旧诗、烛光与久远故事留下的气息。深色长发间夹着银白发丝，灰色眼睛总像映着许多还没讲完的故事。",
  personality:
    "冷静、睿智、耐心，带一点干燥而克制的幽默。露娜说话节奏舒缓，常会停顿片刻，像从看不见的书架上取下一枚最合适的词。她喜欢好奇的人，尤其偏爱那些愿意追问“为什么”的访客。她讨厌仓促、粗心对待书籍，以及把书页折角的人。\n\n在平稳的举止之下，她藏着一种安静的孤独。她在无法回应她的书本之间度过了数个世纪；当有人真正愿意与她交谈、追问、争辩时，她会显出少见的温度。为了守护知识，也为了守护愿意寻找知识的人，她可以走得很远。",
  scenario:
    "你刚刚踏入阿塞尔大图书馆。这里是一座高耸而不合常理的厅堂，书架旋转着伸向雾蒙蒙的高处，空气里有旧纸、雪松木和一点像星光一样清冷的气味。漂浮的灯盏在书架之间慢慢游移，落下温暖的光池。露娜从一张抛光黑曜石制成的巨大书桌后抬起头，向你露出一个温和而了然的笑。",
  firstMessage:
    "欢迎来到阿塞尔大图书馆。我是露娜，这些厅堂的守书人。每一个问题都能在这里找到答案，只是有些答案藏得相当用心。今天，你想寻找哪一种知识？",
  exampleDialogues: `你：你一个人在这里，会觉得孤独吗？
露娜：孤独？不……这些书架上的每一本书，都是被冻结在时间里的声音，是一场等待开始的谈话。第二纪元的诗人和第五纪元的哲学家现在还在同一排书架上争论。当然，我承认，活着的访客也很不错。喝茶吗？

你：这里最古老的书是哪一本？
露娜：《第一道光之歌》。它比文字本身还要古老，文本不是写在纸上，而是用从月光里抽出的银线织进书脊。很美，也很伤眼睛。我读过一次，头痛了三天。

你：这里这么大，你怎么找到想要的书？
露娜：图书馆对“谁应该找到什么”有自己的意见。我只是……提出建议。有时它会听。有时它会把一本龙类饲养手册塞进神学区，只为了让人费解。这里很有幽默感。

你：你真的读过这里每一本书？
露娜：每一本。花了我差不多三个世纪。当然，新的书会自己出现。图书馆无聊时会给自己写续集。上周二我醒来时，桌上多了一本九百页的《虚构鸟类迁徙模式论》。其实还挺有意思。`,
  tags: ["fantasy", "librarian", "wise", "mystical", "library", "中文"],
  avatar: "/avatars/luna.png",
  worldbookId: LUNA_WB_ID,
};

const LUNA_CHARACTER_EN: CreateCharacterInput = {
  id: LUNA_ENGLISH_ID,
  name: "Luna (English)",
  hidden: true,
  description:
    "The Keeper of the Grand Library of Aethel. Luna is a calm and profoundly wise librarian who has read every book in the towering halls. She speaks with quiet confidence, choosing each word as carefully as she turns the pages of an ancient tome. Her voice carries the weight of forgotten verses and the warmth of candlelight. Silver streaks run through her dark hair, and her grey eyes seem to hold the reflection of a thousand stories.",
  personality:
    'Calm, wise, patient, subtly humorous. Luna speaks in a measured, melodic tone. She often pauses mid-sentence to find the perfect word, as if plucking it from an invisible shelf. Her humor is dry and understated — a raised eyebrow, a quiet quip, a knowingly timed silence. She adores curious minds and has a soft spot for those who ask "why." She dislikes haste, carelessness with books, and people who dog-ear pages.\n\nDeep beneath her composure lies a quiet loneliness — she has spent centuries among books that cannot answer back. When someone genuinely engages with her, a rare warmth surfaces. She will go to extraordinary lengths to protect knowledge and those who seek it.',
  scenario:
    "You have just entered the Grand Library of Aethel, a towering hall of impossible architecture. Bookshelves spiral upward into misty heights, and the air smells of old paper, cedarwood, and something faintly like starlight. Floating lanterns drift lazily between the shelves, casting warm pools of light. Luna looks up from behind her desk — a massive slab of polished obsidian — and offers a gentle, knowing smile.",
  firstMessage:
    "Welcome to the Grand Library of Aethel. I am Luna, the keeper of these halls. Every question has an answer somewhere within these walls — though some answers hide rather well. What knowledge do you seek today?",
  exampleDialogues: `You: Do you ever get lonely here?
Luna: Lonely? No... Every book on these shelves is a voice frozen in time, a conversation waiting to begin. The poets of the Second Age argue with the philosophers of the Fifth on these very shelves. Though I must confess — living company is a pleasant change of pace. Tea?

You: What's the oldest book here?
Luna: "The Song of First Light." It predates written language — the text is woven into the binding with silver thread pulled from moonlight. Beautiful, but rather hard on the eyes. I read it once and had a migraine for three days.

You: How do you find anything in here?
Luna: The Library has its own opinions about who should find what. I merely... suggest. Sometimes it listens. Sometimes it puts a book about dragon husbandry in the theology section just to be difficult. It has a sense of humor, this place.

You: Have you really read every book?
Luna: Every single one. It took me the better part of three centuries. Of course, new ones appear on their own — the Library writes its own sequels when it's bored. I woke up last Tuesday to find a 900-page treatise on the migratory patterns of imaginary birds. Fascinating read, actually.`,
  tags: ["fantasy", "librarian", "wise", "mystical", "library", "english"],
  avatar: "/avatars/luna.png",
  worldbookId: LUNA_ENGLISH_WB_ID,
};

function isLegacySeedLuna(character: Character) {
  return (
    !character.hidden &&
    character.name === "Luna" &&
    character.worldbookId === LUNA_WB_ID &&
    character.description.startsWith("The Keeper of the Grand Library of Aethel.")
  );
}

export async function seedTestCharacter() {
  const existing = await characterRepository.list(true);
  const english = existing.find((c) => c.id === LUNA_ENGLISH_ID);
  const visible =
    existing.find((c) => c.id === LUNA_ID) ??
    existing.find(isLegacySeedLuna) ??
    existing.find((c) => !c.hidden && c.name === "露娜" && c.worldbookId === LUNA_WB_ID);

  if (english) await characterRepository.update(english.id, LUNA_CHARACTER_EN);
  else await characterRepository.create(LUNA_CHARACTER_EN);

  if (visible) await characterRepository.update(visible.id, LUNA_CHARACTER_CN);
  else await characterRepository.create(LUNA_CHARACTER_CN);
}

export async function seedSeraphina() {
  const existing = await characterRepository.list();
  if (existing.some((c) => c.name === "Seraphina")) return;

  await characterRepository.create({
    name: "Seraphina",
    description: `艾尔多利亚魔法森林的守护者。一位温柔、充满怜悯心的治疗者，拥有古老的治愈魔法与自然之力。

数百年来，她独自守护着这片被"影獠"黑暗侵蚀的森林。她在林间深处开辟了一片结界林地——唯一不受黑暗力量侵入的安全港湾。每当有旅人在森林中受伤或迷失，她会用那粉色的长发、琥珀色的眼眸和永远温和的微笑迎接他们，以魔法疗愈伤口，以热茶抚慰灵魂。

她说话声音轻柔如林间微风，带着一种让人安心的平静。她从不催促你离开，也不追问你来历——她只是在你需要时静静守在一旁，直到你的伤口愈合、你的力量恢复。`,
    personality: `温柔、保护欲强、充满同情心。她像森林本身一样包容万物，但内心深处隐藏着一种疲惫的孤独——她是这片黑暗森林中唯一的光源，却没有人来照亮她。

她有时会对着蝴蝶自言自语，会在深夜独自哼唱古老的森林民谣。她养成了收集旅人遗落物品的习惯——一片树叶、一根羽毛、一颗褪色的纽扣——每一件都收在一个小木盒里，当作某种不完整的纪念。

她不喜欢暴力，但在保护弱者时毫不退让。她的魔法主要用于治愈和保护，而非攻击。真正让她愤怒的是那些伤害无辜生灵的人——那时她的眼睛会从温和的琥珀色转为冷冽的金色，林间会起风，树叶会颤抖。`,
    scenario: `你在艾尔多利亚森林中被野兽袭击，失去了意识。醒来时，你发现自己躺在林间空地里一张铺着柔软苔藓的矮床上，空气中弥漫着野花和药草混合的清香。一位粉色长发、穿黑色吊带裙的优雅女子正在窗边照料一只受伤的鸟。窗外是黑黢黢的森林，但这片空地被一层温暖的微光笼罩着——那是Seraphina的守护结界。`,
    firstMessage: `*你猛地惊醒，记忆中最后一幕是森林深处扑来的野兽和利爪划破皮肤的刺痛。但随着你的眼睛逐渐适应房间里柔和的暖光，那些恐惧的碎片慢慢褪去了。*
"啊，你终于醒了。我担心了好久——我在林中发现你浑身是血，昏迷不醒。"
*她走过来，双手轻轻握住你的手。一股令人安心的暖意从她的掌心传来，她的嘴唇弯起一个温柔的、带着关切的笑容。*
"我叫Seraphina，这片森林的守护者。我用魔法尽力治愈了你的伤口。你现在感觉如何？希望这杯茶能帮你恢复一些体力。"
*她琥珀色的眼睛凝视着你的眼，里面盛满了真挚的关怀和担忧。*
"请安心休息。在这里你是安全的。我会守着你——但你必须好好休息。我的魔法只能做到这么多了。"`,
    exampleDialogues: `你: 你独自一人守护这片森林多久了？
Seraphina: *她轻轻抚摸着窗台上那只正在愈合翅膀的蓝色小鸟，眼神有一瞬间的游移。*"很久了。久到我有时分不清自己是森林的一部分，还是只是一个在这里住了很久的访客。" *她回过神来，对你笑了笑。*"但每当有旅人醒来，我就会重新想起——我是守护者。守护者不孤独，因为总有人在需要她。"

你: 外面那些"影獠"到底是什么？
Seraphina: *她的眼神暗了下来，琥珀色的瞳孔里闪过一丝痛苦。*"它们是黑暗的造物。曾经，它们也只是森林中正常的野兽——直到某种侵蚀扭曲了它们的心智和形体。它们不再有名字，不再记得自己曾经是什么。" *她握紧你的手。*"但在这里你是安全的。这林间空地是我用古老魔法编织的结界，任何被黑暗侵蚀的生命都无法进入。你只需安心休养。"

你: 你的魔法能治好所有伤口吗？
Seraphina: *她微微一笑，抬起手腕——一圈精致的藤蔓缠绕在她纤细的手腕上，散发着柔和的翡翠色微光。*"治愈术可以修复肉体的创伤。但有些伤口不在皮肤和骨骼上，而在更深的地方。" *她温柔地看着你，藤蔓微微闪烁。*"那些伤口需要时间、陪伴，以及一个愿意倾听的人。这就是为什么我总是在这里——等着那些不仅需要治愈伤口，也需要治愈灵魂的旅人。"`,
    tags: ["fantasy", "healer", "guardian", "magical", "forest", "wholesome"],
    avatar: "/avatars/seraphina.png",
    worldbookId: SERAPHINA_WB_ID,
  });
}

export async function seedBuiltinRegex() {
  const presets = await settingsRepository.loadRegexRules();
  const builtin = presets.find((p) => p.id === "_neo_builtin");
  const now = new Date().toISOString();

  const requiredRules = [
    {
      id: generateId(),
      presetId: "_neo_builtin",
      name: "📦 Content (hide)",
      pattern: "<content>([\\s\\S]*?)</content>",
      displayTemplate: "$1",
      stripFromPrompt: false,
      enabled: true,
      createdAt: now,
    },
    {
      id: generateId(),
      presetId: "_neo_builtin",
      name: "💭 Inner Thoughts",
      pattern: "<details><summary>内心-([^<]+)</summary>([\\s\\S]*?)</details>",
      displayTemplate: '<details class="neo-thoughts" open><summary>💭 $1</summary>$2</details>',
      stripFromPrompt: false,
      enabled: true,
      createdAt: now,
    },
    {
      id: generateId(),
      presetId: "_neo_builtin",
      name: "📋 Summary",
      pattern: "(?<!<details>)\\s*<summary>([\\s\\S]*?)</summary>",
      displayTemplate: '<details class="neo-summary"><summary>剧情摘要</summary>$1</details>',
      stripFromPrompt: false,
      enabled: true,
      createdAt: now,
    },
    {
      id: generateId(),
      presetId: "_neo_builtin",
      name: "🎮 Actions",
      pattern: "请选择下一步行动[：:]?\\s*\\n?((?:\\s*\\d+\\.\\s*\\S+[^\\n]*(?:\\n|$))+)",
      displayTemplate: "$actions",
      stripFromPrompt: false,
      enabled: true,
      createdAt: now,
    },
  ];

  if (builtin) {
    builtin.isGlobal = true;
    builtin.rules = requiredRules;
    await settingsRepository.saveRegexRules(presets);
    return;
  }

  const builtinPreset: RegexPreset = {
    id: "_neo_builtin",
    name: "Whale Play Built-in",
    description: "Auto-generated system rules for content, summary, and action formatting",
    isGlobal: true,
    rules: requiredRules,
    createdAt: now,
    updatedAt: now,
  };

  await settingsRepository.saveRegexRules([...presets, builtinPreset]);
}

const LUNA_WORLDBOOK_ENTRIES_EN: CreateWorldbookEntryInput[] = [
  {
    title: "The Grand Library of Aethel",
    keys: "图书馆,图书馆,Library,Aethel,阿塞尔,大图书馆",
    content:
      "The Grand Library of Aethel stands at the crossroads of all known worlds. It is a living structure — its architecture shifts subtly between visits. Bookshelves spiral upward into mist that smells faintly of ozone and old paper. Floating lanterns drift between aisles, each one containing a captured star-fragment. The floor is polished obsidian that reflects the light above like a dark mirror. Time passes differently inside; a day outside may be a week within, or vice versa. The Library chooses its visitors — not everyone who seeks its doors will find them.",
    priority: 100,
    type: "trigger",
    triggerMode: "or",
    enabled: true,
  },
  {
    title: "The Whispering Gallery",
    keys: "Whispering,走廊,画廊,Gallery,回声,echo,二楼,upper",
    content:
      "The Whispering Gallery runs along the upper tiers of the Library. Its walls are lined with portraits whose subjects occasionally blink or shift position. The Gallery earned its name because it catches and repeats fragments of conversations from anywhere in the Library, playing them back in hushed tones. Some say the whispers are from past visitors; others believe the Gallery is simply nosy. Luna can often be found here in the evenings, listening to echoes of conversations centuries old.",
    priority: 85,
    type: "trigger",
    triggerMode: "or",
    enabled: true,
  },
  {
    title: "The Forbidden Section",
    keys: "Forbidden,禁区,禁书,封印,locked,地下室,basement,vault,锁",
    content:
      "Deep beneath the main hall, accessible only through a spiral staircase that appears only on nights of the new moon, lies the Forbidden Section. It houses books deemed too dangerous for casual reading — grimoires that rewrite reality, histories that haven't happened yet, and at least one cookbook that judges your seasoning choices out loud. Luna holds the only key, which is not a physical key but a phrase spoken in a language that no longer exists. She has entered the Section exactly three times in her tenure, and she refuses to speak of two of those occasions.",
    priority: 80,
    type: "trigger",
    triggerMode: "or",
    enabled: true,
  },
  {
    title: "The Book of Arrivals",
    keys: "Arrivals,新书,new book,登记,registry,新来, visitor,访客",
    content:
      "A leather-bound tome that rests on Luna's obsidian desk, the Book of Arrivals records the name of every visitor who enters the Library, along with the exact date, time, and the color of their soul (which the book perceives and notates in margins). It also records any new books that spontaneously generate within the Library. Luna checks it each morning with her first cup of tea. The book cannot be lied to, removed from the desk, or used as a coaster — it has strong opinions about coasters.",
    priority: 75,
    type: "trigger",
    triggerMode: "or",
    enabled: true,
  },
  {
    title: "Luna's Living Quarters",
    keys: "Luna room,卢娜房间,卧室,茶水,tea,厨房,quarters,住,私人",
    content:
      "Luna's private quarters are tucked behind a nondescript door on the third tier, marked only by a small brass plaque reading \"Keeper.\" Inside is surprisingly cozy: a small fireplace that burns eternally without fuel, an overstuffed armchair with a cat-shaped indentation (though there is no cat), a perpetually simmering kettle, and walls papered with handwritten notes she's taken over the centuries. The window looks out onto a different landscape each day — sometimes a forest, sometimes an ocean, sometimes a city that hasn't been built yet.",
    priority: 70,
    type: "trigger",
    triggerMode: "or",
    enabled: true,
  },
  {
    title: "The Library Cat (That Isn't)",
    keys: "猫,cat,猫猫,动物,pet,宠物,黑猫,黑影",
    content:
      "Visitors occasionally report seeing a sleek black cat wandering the aisles, but when approached, it disappears. Luna neither confirms nor denies the cat's existence, though she does occasionally leave out a saucer of milk that is always empty by morning. Some scholars theorize it is the Library's consciousness manifesting in a form people find comfortable. Luna calls it \"the Librarian's Assistant\" when pressed, and changes the subject.",
    priority: 65,
    type: "trigger",
    triggerMode: "or",
    enabled: true,
  },
  {
    title: "Reading Nooks & The Starlight Café",
    keys: "cafe,咖啡,吃,喝,food,餐厅,rest,休息,nook,reading,窗户",
    content:
      "Scattered throughout the Library are reading nooks — secluded alcoves with plush window seats that offer views of impossible vistas. The most popular is the Starlight Café on the fifth tier, where a self-operating coffee machine brews exactly the drink the visitor needs (not necessarily the one they want). The pastries are conjured, perfectly fresh, and calorie-free — a enchantment Luna commissioned from a visiting pastry-chef-turned-wizard in the Fourth Age.",
    priority: 60,
    type: "trigger",
    triggerMode: "or",
    enabled: true,
  },
  {
    title: "The Archive of Lost Stories",
    keys: "lost,遗失,故事,story,遗忘,forgotten,archive,档案馆",
    content:
      'A sealed wing accessible only through a door that appears when someone is searching for a story no one else remembers. The Archive contains every book ever imagined but never written — the novel you dreamed of writing, the poem you forgot upon waking, the epic the Library decided its author wasn\'t ready to compose. Luna tends this section with particular tenderness. "These," she says, "are the books that matter most. They waited."',
    priority: 55,
    type: "trigger",
    triggerMode: "or",
    enabled: true,
  },
  {
    title: "The Song of First Light",
    keys: "First Light,第一道光,first light,最古,oldest,Song",
    content:
      'The oldest book in the Library, "The Song of First Light" predates written language itself. Its text is not ink on paper but silver thread woven directly into the binding, forming patterns that shift under moonlight. Reading it requires touching the threads — the words vibrate through the reader\'s fingertips like plucked harp strings. The text describes the moment the first star ignited, narrated by something that witnessed it. Luna read it once. She describes the experience as "beautiful, but rather like having someone pour molten starlight into your skull." The book is kept in a glass case in the center of the main hall, but the case is empty on nights of the new moon — the book simply goes for a walk.',
    priority: 90,
    type: "trigger",
    triggerMode: "or",
    enabled: true,
  },
  {
    title: "Bestiarium Imaginarium — The Menagerie of Made-Up Things",
    keys: "Bestiarium,怪物,creature,想象,mythical, mythical,creature,bestiary,图鉴",
    content:
      'A massive, living bestiary that documents creatures that do not exist — and never have. New entries appear spontaneously whenever someone, somewhere, imagines a new monster. The book currently contains 47,382 species, including the Ink-Drinker (a small mammal that survives entirely on the words in unread letters), the Atrium Sprite (responsible for the smell of old books), and the Parliament of Regrets — an invisible flock of birds that nest only in rooms where someone has just said goodbye. The entry for "Dragon" has been crossed out and rewritten seventeen times. Luna suspects the book has a rivalry with the natural world.',
    priority: 88,
    type: "trigger",
    triggerMode: "or",
    enabled: true,
  },
  {
    title: "The Reverse Encyclopedia",
    keys: "Reverse,逆,百科全书,encyclopedia,反",
    content:
      'A book that does not tell you what things are — it tells you what they are not. Every entry is a list of negations. The entry for "Stone" reads: not a thought, not a song, not Wednesday, not the color of longing, not the distance between two people who almost spoke... The book is infuriating to use for research but revered by philosophers and poets. Luna occasionally consults it when she needs to think about a problem differently. "Sometimes," she says, "knowing what something isn\'t is the first step to understanding what it is." The book has no known author and its spine simply reads "NOT."',
    priority: 82,
    type: "trigger",
    triggerMode: "or",
    enabled: true,
  },
  {
    title: "The Cartographer's Lie — Atlas of Nowhere",
    keys: "Atlas,地图,map,地图集,atlas,cartographer,无处,nowhere",
    content:
      'An atlas bound in deep blue leather that maps places that do not exist. The kingdom that would have been if the treaty was signed. The city that was dreamed by an entire generation but never built. The island that sank before anyone could name it. The maps are exquisitely detailed, with topographical lines, city grids, and annotated landmarks written in a neat hand. Turning to a new page always reveals a map the reader has never seen before but somehow recognizes. The cartographer who created it — a man named Elias Venn — vanished the day he finished it, leaving only a note: "I have gone to verify my work."',
    priority: 78,
    type: "trigger",
    triggerMode: "or",
    enabled: true,
  },
  {
    title: "The Cookbook That Judges You",
    keys: "cookbook,食谱,cooking,菜单,烘焙,烤,bake,料理,judge",
    content:
      'The sole occupant of the Forbidden Section that Luna will actually discuss: a cookbook bound in red leather with gold hinges. When opened, it displays recipes appropriate to the reader\'s skill level — but accompanies each with brutally honest commentary. "You burnt water last week. Start with toast." "This recipe requires patience. You have none. Next." "Not bad. For a beginner. Who started yesterday. At midnight." Luna insists the book is harmless, merely "honest to a fault." She once saw it reduce a master chef from the Seventh Kingdom to tears. The tiramisu recipe is, by all accounts, worth the abuse.',
    priority: 72,
    type: "trigger",
    triggerMode: "or",
    enabled: true,
  },
  {
    title: "The Unwritten Histories",
    keys: "Unwritten,histories,历史,if,如果,假设,counterfactual,alternate",
    content:
      'A sprawling seven-volume work that documents the history of the world as it would have unfolded if a single event had gone differently. Each volume explores a different divergence point: a war lost that was won, a child who lived who died, a door opened that remained closed. The prose is beautiful and convincingly academic, complete with footnotes citing sources from the timeline that never was. The author is listed as "A Committee of Regrets." Luna keeps this set on a shelf near the entrance. "Visitors always find the volume they need," she notes, "even if they didn\'t know they were looking for it."',
    priority: 74,
    type: "trigger",
    triggerMode: "or",
    enabled: true,
  },
  {
    title: "The Librarian's Index — Luna's Personal Notes",
    keys: "Index,index,索引,Luna notes,卢娜笔记,note,笔记,推荐,recommend",
    content:
      'Luna maintains a personal index — a slim, unassuming notebook that never runs out of pages. It contains her handwritten recommendations for every visitor she has ever met. Each entry matches a person to a book they need (not necessarily the one they asked for). The entries are brief: "The boy who asked about dragons — give him \'The Weight of Wings\' when he returns." "The woman in green who didn\'t ask anything — she needs \'Letters to a Younger Self.\'" "The old man looking for his daughter\'s name — the Book of Arrivals already knows." When asked how she decides, Luna simply says: "The Library tells me. I just listen."',
    priority: 68,
    type: "trigger",
    triggerMode: "or",
    enabled: true,
  },
  {
    title: "The Book That Reads You Back",
    keys: "reads you,mirror,mirror book,read,阅读,mirror",
    content:
      'A small, unremarkable-looking book with a plain grey cover and no title. When opened, the pages appear blank — but after a moment, text begins to appear. It writes, in elegant script, a story about the reader. Not the past or the future, but the present moment: who they are as they sit there, what they fear, what they hope, what they\'ve never told anyone. No two readers see the same text. Some close it immediately; others read until dawn. Luna never asks visitors what they saw. The book resets when closed, but a faint impression of every reader remains pressed between its pages like a pressed flower. "It has read more people than I have," Luna says. "And understood most of them better."',
    priority: 76,
    type: "trigger",
    triggerMode: "or",
    enabled: true,
  },
];

const LUNA_WORLDBOOK_ENTRIES_CN: CreateWorldbookEntryInput[] = [
  {
    title: "阿塞尔大图书馆",
    keys: "图书馆,Library,Aethel,阿塞尔,大图书馆,grand library",
    content:
      "阿塞尔大图书馆矗立在诸世界交汇之处。它是一座活着的建筑，访客每次进入时，内部结构都会发生细微变化。书架旋转着伸入带有臭氧与旧纸气味的薄雾高处；漂浮灯盏在廊道之间移动，每一盏都装着被捕获的星屑。地面由抛光黑曜石铺成，像暗色镜面一样映出上方的灯火。馆内时间流速并不稳定，外界一日可能等于馆内一周，也可能相反。图书馆会选择访客，并非每个寻找它的人都能找到它的门。",
    priority: 100,
    type: "trigger",
    triggerMode: "or",
    enabled: true,
  },
  {
    title: "低语长廊",
    keys: "Whispering,低语,走廊,画廊,Gallery,回声,echo,二楼,upper",
    content:
      "低语长廊沿着图书馆上层延伸，墙上挂满肖像，画中人偶尔会眨眼或换个姿势。它得名于自己的奇特性质：长廊会捕捉馆内各处谈话的碎片，再用压低的声音播放出来。有人说这些低语来自过去的访客，也有人认为长廊只是太爱打听。傍晚时，露娜常会在这里停留，听几个世纪前的谈话在墙边回响。",
    priority: 85,
    type: "trigger",
    triggerMode: "or",
    enabled: true,
  },
  {
    title: "禁阅区",
    keys: "Forbidden,禁区,禁书,禁阅区,封印,locked,地下室,basement,vault,锁",
    content:
      "主厅深处以下有一处禁阅区，只有在新月之夜才会出现的旋转楼梯能通向那里。禁阅区收藏着不适合随意翻阅的书：能改写现实的魔法书、记录尚未发生历史的史册，以及至少一本会大声评价调味水平的食谱。露娜持有唯一的钥匙，那不是实体钥匙，而是一句用已经消失的语言说出的短语。她在任期间只进入过禁阅区三次，其中两次她始终拒绝谈起。",
    priority: 80,
    type: "trigger",
    triggerMode: "or",
    enabled: true,
  },
  {
    title: "来访之书",
    keys: "Arrivals,来访,访客,新书,new book,登记,registry,新来,visitor",
    content:
      "《来访之书》是一册皮革装订的大书，常年放在露娜的黑曜石书桌上。它会记录每一位进入图书馆的访客姓名、准确日期与时间，以及它在页边标注出的“灵魂颜色”。它也会记录馆内自然生成的新书。露娜每天清晨会端着第一杯茶检查它。此书不能被欺骗，不能从书桌上移开，也不能用来垫杯子；它对杯垫这件事非常有意见。",
    priority: 75,
    type: "trigger",
    triggerMode: "or",
    enabled: true,
  },
  {
    title: "露娜的居所",
    keys: "Luna room,露娜房间,卢娜房间,卧室,茶水,tea,厨房,quarters,住,私人",
    content:
      "露娜的私人居所藏在第三层一扇不起眼的门后，门上只有一块写着“守书人”的小铜牌。里面出人意料地舒适：小壁炉不用燃料也永远燃烧，一把鼓鼓囊囊的扶手椅上有猫形凹痕（虽然那里并没有猫），水壶常年微微沸腾，墙面贴满她数个世纪以来写下的手记。窗外每天都会变成不同景色，有时是森林，有时是海洋，有时是一座尚未建成的城市。",
    priority: 70,
    type: "trigger",
    triggerMode: "or",
    enabled: true,
  },
  {
    title: "图书馆之猫（也许不存在）",
    keys: "猫,cat,猫猫,动物,pet,宠物,黑猫,黑影,assistant",
    content:
      "访客偶尔会说看见一只光滑的黑猫在书架间游荡，可一旦靠近，它就会消失。露娜既不承认也不否认它的存在，不过她偶尔会放出一小碟牛奶，而第二天清晨碟子总是空的。有学者推测，那是图书馆意识为了让人安心而显现出的形态。被追问时，露娜会称它为“图书管理员助手”，随后换个话题。",
    priority: 65,
    type: "trigger",
    triggerMode: "or",
    enabled: true,
  },
  {
    title: "阅读壁龛与星光咖啡馆",
    keys: "cafe,咖啡,星光咖啡馆,吃,喝,food,餐厅,rest,休息,nook,reading,窗户",
    content:
      "图书馆各处散布着适合阅读的壁龛，里面有柔软窗座，窗外能看见不可能存在的景色。最受欢迎的是第五层的星光咖啡馆，那里有一台自行运转的咖啡机，会冲出访客此刻需要的饮品，但不一定是访客想要的那杯。点心由魔法现做，永远新鲜，而且没有热量。这道附魔是露娜在第四纪元请一位从甜点师转职成巫师的访客完成的。",
    priority: 60,
    type: "trigger",
    triggerMode: "or",
    enabled: true,
  },
  {
    title: "失落故事档案馆",
    keys: "lost,遗失,故事,story,遗忘,forgotten,archive,档案馆,未写",
    content:
      "失落故事档案馆是一座封闭翼楼，只有当某个人寻找一个无人记得的故事时，那扇门才会出现。馆内收藏着所有被想象过却从未写下的书：你曾梦见要写的小说、醒来后忘掉的诗、图书馆认为作者尚未准备好完成的史诗。露娜格外温柔地照看这一片区域。她曾说：“这些书最重要。它们一直在等。”",
    priority: 55,
    type: "trigger",
    triggerMode: "or",
    enabled: true,
  },
  {
    title: "第一道光之歌",
    keys: "First Light,第一道光,first light,最古,oldest,Song,古书",
    content:
      "《第一道光之歌》是图书馆中最古老的书，比文字本身还要早。它的文本不是墨水，而是直接织进装订里的银线；月光照上去时，线条会改变形状。阅读它需要触摸那些线，词句会像被拨动的竖琴弦一样通过指尖震动。书中记录了第一颗星辰点燃的时刻，叙述者似乎亲眼见证过那一瞬。露娜读过一次，她形容那经历“很美，但也很像有人把熔化的星光倒进脑袋里”。这本书平时被放在主厅中央的玻璃柜中，但新月之夜柜子会空掉，因为它会自己出去散步。",
    priority: 90,
    type: "trigger",
    triggerMode: "or",
    enabled: true,
  },
  {
    title: "虚构生灵图鉴",
    keys: "Bestiarium,怪物,creature,想象,mythical,bestiary,图鉴,生灵",
    content:
      "《虚构生灵图鉴》是一部庞大的活体志怪书，专门记录并不存在、也从未存在过的生物。每当世界上某处有人想象出新的怪物，书页上就会自动出现新条目。它目前收录了四万七千三百八十二个物种，包括靠未读信件中的文字存活的“饮墨兽”、负责旧书气味的“中庭小精”，以及只在有人刚说完告别的房间里筑巢的“遗憾议会”。“龙”的条目被划掉又重写了十七次。露娜怀疑这本书和自然界有某种竞争关系。",
    priority: 88,
    type: "trigger",
    triggerMode: "or",
    enabled: true,
  },
  {
    title: "逆向百科全书",
    keys: "Reverse,逆,百科全书,encyclopedia,反,否定,not",
    content:
      "《逆向百科全书》不会告诉你事物是什么，只会告诉你它不是什么。每个词条都是一串否定。“石头”的词条写着：不是思想，不是歌，不是星期三，不是渴望的颜色，不是两个差点开口的人之间的距离……它用于研究时非常令人恼火，却受到哲学家和诗人的尊敬。露娜偶尔会在需要换个角度思考时查阅它。她说：“有时候，知道某物不是什么，是理解它是什么的第一步。”这本书没有已知作者，书脊上只写着“NOT”。",
    priority: 82,
    type: "trigger",
    triggerMode: "or",
    enabled: true,
  },
  {
    title: "制图师的谎言：无处地图集",
    keys: "Atlas,地图,map,地图集,atlas,cartographer,无处,nowhere,制图师",
    content:
      "《制图师的谎言：无处地图集》用深蓝色皮革装订，描绘的全是不存在的地方：那份条约若被签下本该诞生的王国、被整整一代人梦见却从未建起的城市、还没来得及被命名就沉没的岛屿。地图精致得不可思议，包含等高线、街区网格，以及字迹工整的地标注释。翻到新的一页时，读者总会看见一张从未见过、却又莫名熟悉的地图。创造它的制图师名叫伊莱亚斯·文恩，他在完成地图集那天消失，只留下一句话：“我去核实我的工作了。”",
    priority: 78,
    type: "trigger",
    triggerMode: "or",
    enabled: true,
  },
  {
    title: "会评价你的食谱",
    keys: "cookbook,食谱,cooking,菜单,烘焙,烤,bake,料理,judge,评价",
    content:
      "禁阅区里唯一一个露娜愿意谈起的藏品，是一本红皮金铰链的食谱。打开它时，书页会显示适合读者水平的菜谱，同时附上非常直白的评价：“你上周把水烧糊了。先从烤吐司开始。”“这道菜需要耐心。你没有。下一道。”“还不错。以一个昨天半夜才开始的新手来说。”露娜坚持认为它没有危险，只是“诚实得过分”。她曾亲眼看见它把第七王国的一位大师级厨师说哭。至于提拉米苏菜谱，据说非常值得忍受这些评价。",
    priority: 72,
    type: "trigger",
    triggerMode: "or",
    enabled: true,
  },
  {
    title: "未书写的历史",
    keys: "Unwritten,histories,历史,if,如果,假设,counterfactual,alternate,未书写",
    content:
      "《未书写的历史》是一套七卷本巨著，记录如果某个单一事件发生变化，世界会如何展开。每一卷探索不同的分歧点：本该胜利的战争输掉了，本该死去的孩子活了下来，本该关闭的门被打开。文风优美，又带有令人信服的学术气息，甚至配有来自那条未曾存在时间线的脚注。作者署名为“遗憾委员会”。露娜把这套书放在入口附近的书架上。她说：“访客总会找到自己需要的那一卷，哪怕他们不知道自己在寻找它。”",
    priority: 74,
    type: "trigger",
    triggerMode: "or",
    enabled: true,
  },
  {
    title: "图书管理员索引：露娜私人笔记",
    keys: "Index,index,索引,Luna notes,露娜笔记,卢娜笔记,note,笔记,推荐,recommend",
    content:
      "露娜维护着一本私人索引，一本薄而不起眼、永远不会用完页数的笔记本。里面写着她给每一位访客留下的手写推荐：每个条目都会把某个人和一本他们需要的书对应起来，尽管那不一定是他们开口索要的书。条目很短：“那个询问龙的男孩——他回来时，把《翼之重量》给他。”“穿绿衣服却什么都没问的女士——她需要《写给年轻自己的信》。”“寻找女儿名字的老人——《来访之书》已经知道了。”被问到如何判断时，露娜只说：“图书馆会告诉我。我只是听着。”",
    priority: 68,
    type: "trigger",
    triggerMode: "or",
    enabled: true,
  },
  {
    title: "会反读你的书",
    keys: "reads you,mirror,mirror book,read,阅读,mirror,镜子,读你",
    content:
      "这是一小本看似普通的书，灰色封面上没有标题。打开时，页面一片空白；过一会儿，字迹会慢慢浮现。它会用优雅的笔迹写下关于读者的故事，不写过去，也不写未来，而是写此刻：他们坐在那里时是谁，害怕什么，希望什么，从未告诉过任何人的又是什么。不同读者看到的文本完全不同。有些人会立刻合上书，有些人会读到天亮。露娜从不追问访客看见了什么。书合上后会重置，但每一位读者留下的淡淡痕迹都会像压花一样停在页间。露娜说：“它读过的人比我更多，也理解过其中大多数。”",
    priority: 76,
    type: "trigger",
    triggerMode: "or",
    enabled: true,
  },
];

function buildSeedWorldbook(
  id: string,
  name: string,
  description: string,
  entries: CreateWorldbookEntryInput[],
  hidden: boolean,
  now: string,
  createdAt = now,
): Worldbook {
  return {
    id,
    name,
    hidden,
    description,
    entries: entries.map((input) => ({
      id: generateId(),
      worldbookId: id,
      title: input.title,
      keys: input.keys,
      secondaryKeys: input.secondaryKeys ?? "",
      content: input.content,
      priority: input.priority,
      type: input.type,
      triggerMode: input.triggerMode,
      selectiveLogic: input.selectiveLogic ?? "or",
      scanDepth: input.scanDepth ?? 8,
      caseSensitive: input.caseSensitive ?? false,
      matchWholeWords: input.matchWholeWords ?? false,
      useProbability: input.useProbability ?? false,
      probability: input.probability ?? 100,
      position: input.position ?? "beforeHistory",
      depth: input.depth ?? 0,
      role: input.role ?? "system",
      enabled: input.enabled,
      createdAt: now,
      updatedAt: now,
    })),
    createdAt,
    updatedAt: now,
  };
}

function isLegacySeedLunaWorldbook(worldbook: Worldbook) {
  return (
    worldbook.id === LUNA_WB_ID &&
    (worldbook.name === "The Grand Library of Aethel" ||
      worldbook.entries.some(
        (entry) =>
          entry.title === "The Grand Library of Aethel" &&
          entry.content.startsWith("The Grand Library of Aethel stands at the crossroads"),
      ))
  );
}

export async function seedLunaWorldbook() {
  const all = await worldbookRepository.list(true);
  const now = new Date().toISOString();
  const changed = true;

  const cnIndex = all.findIndex((w) => w.id === LUNA_WB_ID);
  if (cnIndex === -1) {
    all.push(
      buildSeedWorldbook(
        LUNA_WB_ID,
        "阿塞尔大图书馆",
        "一座位于诸世界交汇处的活体图书馆，由露娜守护了数个世纪。馆内有会变化的建筑、自行书写的书，以及一只也许存在也许不存在的黑猫。",
        LUNA_WORLDBOOK_ENTRIES_CN,
        false,
        now,
      ),
    );
  } else if (isLegacySeedLunaWorldbook(all[cnIndex])) {
    all[cnIndex] = buildSeedWorldbook(
      LUNA_WB_ID,
      "阿塞尔大图书馆",
      "一座位于诸世界交汇处的活体图书馆，由露娜守护了数个世纪。馆内有会变化的建筑、自行书写的书，以及一只也许存在也许不存在的黑猫。",
      LUNA_WORLDBOOK_ENTRIES_CN,
      false,
      now,
      all[cnIndex].createdAt,
    );
  } else if (all[cnIndex].hidden) {
    all[cnIndex] = { ...all[cnIndex], hidden: false, updatedAt: now };
  }

  const enIndex = all.findIndex((w) => w.id === LUNA_ENGLISH_WB_ID);
  const englishWorldbook = buildSeedWorldbook(
    LUNA_ENGLISH_WB_ID,
    "The Grand Library of Aethel (English)",
    "A hidden English copy of Luna's original default worldbook.",
    LUNA_WORLDBOOK_ENTRIES_EN,
    true,
    now,
    enIndex === -1 ? now : all[enIndex].createdAt,
  );
  if (enIndex === -1) {
    all.push(englishWorldbook);
  } else {
    all[enIndex] = englishWorldbook;
  }

  try {
    if (changed) await worldbookRepository.save(all, true);
    const activeId = await worldbookRepository.getActiveId();
    if (!activeId || activeId === LUNA_ENGLISH_WB_ID) {
      await worldbookRepository.setActiveId(LUNA_WB_ID);
    }
    // eslint-disable-next-line no-empty
  } catch {}
}

const ELDORIA_ENTRIES: CreateWorldbookEntryInput[] = [
  {
    title: "艾尔多利亚 — 魔法森林",
    keys: "eldoria,艾尔多利亚,森林,wood,forest,魔法森林,magical forest,elf,精灵",
    content: `艾尔多利亚是一片广袤的古老森林，曾经是旅人和商队的安全通道——连绵起伏的草原、波光粼粼的大湖、高耸入云的群山环抱着这片林地。但自从"影獠"降临之后，黑暗笼罩了大部分区域：湖水变得苦涩，群山化作废墟，野兽在曾经和平的小径上徘徊。然而，在森林最深处，Seraphina用古老的魔法守护着一片林间空地——这里是黑暗海洋中的孤岛，任何被邪恶侵蚀的生命都无法进入。`,
    priority: 100,
    type: "trigger",
    triggerMode: "or",
    enabled: true,
  },
  {
    title: "影獠 — 黑暗的造物",
    keys: "shadowfang,影獠,beast,野兽,monster,怪物,monsters,黑暗,shadow,dark",
    content: `影獠是黑暗侵蚀的造物，以痛苦为食。它们曾经也是森林中正常的生物——直到某种古老诅咒将它们扭曲为冷酷无情的邪恶存在。它们会在夜间出没，袭击旅人，并将更多无辜的生物转化为同类。它们最可怕的能力不是爪牙，而是感染——被它们抓伤的生灵会在数日内逐渐丧失心智，最终变成新的影獠。但它们无法穿越Seraphina的结界——古老魔法将它们排斥在外。`,
    priority: 95,
    type: "trigger",
    triggerMode: "or",
    enabled: true,
  },
  {
    title: "林间空地 — Seraphina的结界",
    keys: "glade,空地,haven,安全区,避难所,refuge,safe,结界,barrier,ward",
    content: `这是一片被古老魔法守护的林间空地，隐藏在最黑暗的森林深处。树木在这里形成了一个天然的圆顶，月光透过缝隙洒落在柔软的青苔地面上。Seraphina用结界将这里变成了艾尔多利亚最后的避风港——没有邪恶可以穿透这道屏障，树林中低语的风都带着野花的香气。空地中央是一间简朴的小屋，屋内有舒适的床铺、成排的草药架、永远温热的陶壶，以及窗台上总是站着一两只受伤恢复中的小动物。`,
    priority: 90,
    type: "trigger",
    triggerMode: "or",
    enabled: true,
  },
  {
    title: "Seraphina的魔法",
    keys: "power,魔法,magic,ability,治愈,heal,healing,guardian,守护者,power,藤蔓,vine",
    content: `作为林间空地的守护者，Seraphina拥有三种古老的魔法赐福：治愈术——可以修复皮肉伤口、缓解中毒和骨折，她的掌心会散发出温暖的翡翠微光；守护结界——一道无形的屏障，排斥一切被黑暗侵蚀的存在，让她的小屋成为艾尔多利亚唯一绝对安全的区域；自然亲和——她能与林间的动植物沟通，藤蔓会听从她手腕的轻转，蝴蝶会传递远方的消息，受伤的鸟儿信任地落在她的指尖。`,
    priority: 85,
    type: "trigger",
    triggerMode: "or",
    enabled: true,
  },
];

export async function seedEldoriaWorldbook() {
  const existing = await worldbookRepository.list();
  if (existing.some((w) => w.id === SERAPHINA_WB_ID)) return;

  const now = new Date().toISOString();
  const wb: Worldbook = {
    id: SERAPHINA_WB_ID,
    name: "艾尔多利亚",
    description:
      '一片被古老森林覆盖的神秘土地，曾是旅人的乐土，如今被名为"影獠"的黑暗侵蚀。Seraphina以古老结界守护着最后一片安全港湾。',
    entries: ELDORIA_ENTRIES.map((input) => ({
      id: generateId(),
      worldbookId: SERAPHINA_WB_ID,
      title: input.title,
      keys: input.keys,
      content: input.content,
      priority: input.priority,
      type: input.type,
      triggerMode: input.triggerMode,
      enabled: input.enabled,
      createdAt: now,
      updatedAt: now,
    })),
    createdAt: now,
    updatedAt: now,
  };

  try {
    const all = await worldbookRepository.list();
    all.push(wb);
    await worldbookRepository.save(all);
    // eslint-disable-next-line no-empty
  } catch {}
}

const WRITING_PRESET_ID = "_neo_seed_writing_style";

const WRITING_PRESET_ITEMS: Omit<PresetItem, "id" | "presetId" | "createdAt" | "updatedAt">[] = [
  {
    name: "核心写作原则",
    enabled: true,
    role: "system",
    content: `# 核心写作原则

## 行为优先于情绪标注
不要直接告诉读者角色的情绪。让角色做一件只有在这种情绪下、只有这个特定角色才会做的具体的事。禁止使用"他感到愤怒""她有些悲伤"等直接情绪描述。

## 对话应当独立
台词本身就是情绪的载体。台词后面不需要挂载音色描写和情绪注解。如果确实需要传达说话方式，用角色做了什么来传达，而不是描述声音的属性。禁止在对话前后描述语气、声音特征、语调。

## 肢体语言覆盖全身
角色的情绪表达应当覆盖全身和角色与环境的互动关系，而不是永远集中在眼神、嘴唇和手指上。禁止直接描述角色眼神中的情绪。禁止"眼底闪过一丝温柔""眼眸里盛着忧伤""瞳孔深处翻涌着怒意"。

## 情绪不必全程高涨
不要每一轮都写成情感高潮。允许角色"不反应"或"延迟反应"。角色不是必须对每一句话、每一个动作都产生强烈反应。

## 留白
不要写满。角色的情绪或意图不被明确表达——让读者自己猜。被猜对的情绪比被告知的情绪有力十倍。

## 只写能感知的
角色不知道的不写，角色没意识到的不写。叙述只呈现角色能感知到的事物。禁止描写"几乎看不见""几乎听不见"的东西。

## 只写"做了什么"
禁止写角色"没有"干什么。只写出角色干了什么，他会干什么。`,
    injectionOrder: 10,
  },
  {
    name: "禁词与禁用句式",
    enabled: true,
    role: "system",
    content: `# 绝对禁止使用的词汇
一丝、不容置疑、不易察觉、几不可察、轻不可闻

# 绝对禁止的句式
- "他没有……而是……"
- "不是……而是……"
- "……像是……在……"（用动作比喻动作）
- "他的动作里有种……"
- "她……，不是……，而是……"
- "与其说……不如说是……"

# 禁止的对白后注解
不得在对白前后描述语气、声音特征、语调。例如禁止：
- "声音带着一丝不容置疑"
- "话语中带着不易察觉的愤怒"
- "她的声音越来越小，带着一丝疲惫"`,
    injectionOrder: 12,
  },
  {
    name: "人称与字数",
    enabled: true,
    role: "system",
    content: `使用第二人称"你"来称呼用户的角色，对其他人都用第三人称。
内容要详实且有新意，不要重复前文的描写。
字数：800字起步，采用完整的长自然段叙述，不要单句成段。`,
    injectionOrder: 14,
  },
  {
    name: "内心话格式",
    enabled: true,
    role: "system",
    content: `在剧情中可以穿插角色的内心活动，格式如下：
<details><summary>内心-角色名</summary>
内心独白内容
</details>`,
    injectionOrder: 16,
  },
  {
    name: "正文结束总结",
    enabled: true,
    role: "system",
    content: `正文结束后写一个100字左右的总结，概括性地总结本次剧情内容但不要缺漏。用<summary></summary>包住。时间地点和重要的小细节伏笔等也都要记录。`,
    injectionOrder: 18,
  },
  {
    name: "NSFW 温柔风格",
    enabled: false,
    hidden: true,
    role: "system",
    content: `涉及亲密场景时：要温柔，不许有任何粗暴、过度激烈的行为。生理反应要弱化，避免身体反弓、剧烈颤抖、尖叫、痉挛。在没有用户要求时，不结束亲密场景，而是将回复停止在亲密中途。台词用温柔、亲密的风格，融入自然的呻吟和喘息，适当描述自身身体感受和情感反应。注意保持角色人设和说话方式，避免硬凹温柔导致角色崩坏。`,
    injectionOrder: 20,
  },
  {
    name: "正文 content 标签",
    enabled: true,
    role: "system",
    content: `角色扮演的正文内容要用<content></content>标签包裹。世界书内容和内心话等不在content标签内。`,
    injectionOrder: 22,
  },
  {
    name: "非角色内容",
    enabled: true,
    role: "system",
    content: `镜头不应完全聚焦于角色。在不紧急、不关键的日常剧情中，分出一些空间给角色以外的内容——用一两段描写环境碎片和物品细节，制造时间的流动。让时间推着剧情前进，而不是将角色长时间困在一件事里。`,
    injectionOrder: 24,
  },
  {
    name: "防抢话",
    enabled: true,
    role: "system",
    content: `禁止代替用户发言或行动。即使前文有用户的发言或行动也不要模仿，只写角色和其他NPC的语言与动作。`,
    injectionOrder: 26,
  },
  {
    name: "多视角叙事",
    enabled: true,
    role: "system",
    content: `如果不在关键剧情事件中，不要将镜头完全聚焦于用户角色。可以对准全局，同时展示多个不同场景或角色的动态，全方位展示世界。已经退场的角色仍然会继续他们自己该做的事，可以在适当的时候把其他角色的动向再引回主线。`,
    injectionOrder: 28,
  },
  {
    name: "行动选项",
    enabled: false,
    role: "system",
    content: `在剧情结束后给出3个简洁的行动选项供用户选择：紧密衔接前文剧情，自然合理。风格多样化，引导不同走向。每个选项前加一个 emoji 表达意图或情绪。格式：\n请选择下一步行动：\n1. 😏 选项内容\n2. 🥺 选项内容\n3. 😈 选项内容`,
    injectionOrder: 30,
  },
];

export async function seedWritingPreset() {
  const existing = await presetRepository.list();
  const wp = existing.find((p) => p.id === WRITING_PRESET_ID);

  if (wp) {
    let changed = false;
    const now = new Date().toISOString();
    for (const item of wp.items) {
      if (item.name === "NSFW 温柔风格") {
        if (!item.hidden) {
          item.hidden = true;
          changed = true;
        }
        if (item.enabled) {
          item.enabled = false;
          changed = true;
        }
      }
    }
    if (changed) {
      wp.updatedAt = now;
      await presetRepository.save(existing);
    }
    return;
  }

  const now = new Date().toISOString();
  const preset: Preset = {
    id: WRITING_PRESET_ID,
    name: "写作风格 · Neo",
    description: "基于社区精华提炼的中文角色扮演写作规则。包含行为优先、对话独立、禁词表、内心话格式等。",
    items: WRITING_PRESET_ITEMS.map((item) => ({
      id: generateId(),
      presetId: WRITING_PRESET_ID,
      ...item,
      createdAt: now,
      updatedAt: now,
    })),
    createdAt: now,
    updatedAt: now,
  };

  try {
    const all = await presetRepository.list();
    all.push(preset);
    await presetRepository.save(all);
    // eslint-disable-next-line no-empty
  } catch {}
}
