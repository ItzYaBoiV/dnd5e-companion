/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/exhaustive-deps */
import { useState, useCallback, useEffect, useRef } from "react";

/* ═══════════════════════════════════════════════════════════════════════
   D&D 5e DUNGEON FORGE v3 — Location-Aware Procedural Map Generator
   ═══════════════════════════════════════════════════════════════════════ */

// ── RNG ──────────────────────────────────────────────────────────────
function seededRNG(seed) { let s=seed; return()=>{s=(s*16807)%2147483647;return(s-1)/2147483646;}; }
function pick(a,r){return a[Math.floor(r()*a.length)];}
function rI(a,b,r){return Math.floor(r()*(b-a+1))+a;}

// ── Monsters / Traps / Items ─────────────────────────────────────────
const MONSTERS={0:["Rat","Bat","Spider","Frog"],0.125:["Bandit","Kobold","Skeleton","Zombie","Cultist"],0.25:["Goblin","Wolf","Acolyte"],0.5:["Orc","Gnoll","Shadow","Hobgoblin","Scout"],1:["Ghoul","Bugbear","Giant Spider","Specter"],2:["Ghast","Mimic","Ogre","Gargoyle","Wererat"],3:["Minotaur","Mummy","Owlbear","Werewolf","Hell Hound"],4:["Banshee","Ghost","Flameskull","Ettin"],5:["Troll","Wraith","Umber Hulk","Flesh Golem"],6:["Medusa","Drider","Chimera","Young White Dragon"],7:["Mind Flayer","Stone Giant","Young Black Dragon"],8:["Hydra","Frost Giant","Young Green Dragon","Assassin"],9:["Young Blue Dragon","Fire Giant","Bone Devil"],10:["Young Red Dragon","Aboleth","Stone Golem"],13:["Beholder","Vampire","Adult White Dragon","Rakshasa"],15:["Adult Green Dragon","Purple Worm"],17:["Adult Blue Dragon","Death Knight"],20:["Ancient White Dragon","Pit Fiend"]};
const TRAPS=[{name:"Pit Trap",minLv:1,dmg:"2d10"},{name:"Poison Darts",minLv:1,dmg:"1d10+psn"},{name:"Swinging Blade",minLv:2,dmg:"3d10"},{name:"Fire Jet",minLv:3,dmg:"4d10"},{name:"Collapsing Ceiling",minLv:4,dmg:"4d10"},{name:"Acid Pool",minLv:5,dmg:"6d6 acid"},{name:"Lightning Rune",minLv:6,dmg:"8d6 ltng"},{name:"Spike Pit",minLv:2,dmg:"4d10"},{name:"Gas Cloud",minLv:4,dmg:"3d8 psn"},{name:"Crushing Wall",minLv:3,dmg:"5d10"},{name:"Symbol of Death",minLv:13,dmg:"10d10 nec"}];
const ITEMS=[{name:"Healing Potion",r:"common",minLv:1},{name:"Gold (2d6x10)",r:"common",minLv:1},{name:"Scroll",r:"common",minLv:1},{name:"+1 Weapon",r:"uncommon",minLv:2},{name:"Bag of Holding",r:"uncommon",minLv:3},{name:"Cloak of Protection",r:"uncommon",minLv:3},{name:"Ring of Protection",r:"rare",minLv:5},{name:"+2 Weapon",r:"rare",minLv:6},{name:"Flame Tongue",r:"rare",minLv:7},{name:"Staff of Power",r:"vr",minLv:10},{name:"+3 Weapon",r:"vr",minLv:12},{name:"Vorpal Sword",r:"legendary",minLv:15},{name:"Staff of the Magi",r:"legendary",minLv:17},{name:"Gold (4d6x100)",r:"rare",minLv:5},{name:"Gem (500gp)",r:"rare",minLv:7}];

// ── Name Generators ──────────────────────────────────────────────────
const NP=["Oak","Silver","Iron","Storm","Moon","Shadow","Golden","Raven","Wolf","Dragon","Crystal","Amber","Frost","Dark","Bright","Elder","Red","Black","White","Thorn","Cinder","Hollow","Ember","Stone","River"];
const NS=["haven","ford","bridge","shire","vale","watch","fell","hollow","wood","gate","keep","rest","moor","peak","cross","bury","ton","wick","mere","dale","hold","march","helm","crest","spire"];
const TA=["Rusty","Golden","Drunken","Prancing","Sleeping","Broken","Silver","Crimson","Leaky","Blind","Laughing","Wandering","Howling","Dancing","Weeping"];
const TN=["Tankard","Dragon","Pony","Giant","Sword","Crown","Barrel","Goblet","Stag","Hound","Goose","Jester","Serpent","Gryphon","Boar"];
function genTownName(r){return pick(NP,r)+pick(NS,r);}
function genTavernName(r){return"The "+pick(TA,r)+" "+pick(TN,r);}
const DUNGEON_NAMES=["The Abyss of","Caverns of","Depths of","Halls of","Pits of","Shadows of","Tombs of","Warrens of"];
const DN2=["Despair","Dread","Madness","Sorrow","the Damned","the Forgotten","Woe","Darkness","Agony","Torment"];
function genDungeonName(r){return pick(DUNGEON_NAMES,r)+" "+pick(DN2,r);}

// ── ASCII Decoration Stamps ──────────────────────────────────────────
const S_={
  grave1:{rows:[" _ ","|+|"],fg:"#777",n:"Gravestone"},
  grave2:{rows:["._.","|R|","|I|","|P|"],fg:"#888",n:"RIP Stone"},
  grave3:{rows:[" + "," | "],fg:"#777",n:"Cross"},
  skull:{rows:["_O_"," V "],fg:"#dd8",n:"Skull"},
  skeleton:{rows:[" O ","/|\\","/ \\"],fg:"#ddb",n:"Skeleton"},
  bones:{rows:["/  \\","\\ _/"],fg:"#cb9",n:"Bones"},
  deadbody:{rows:["___/"," o  "],fg:"#a66",n:"Dead Body"},
  blood_sm:{rows:[".,.",".,."],fg:"#811",n:"Blood Pool"},
  blood_lg:{rows:[" .; ",".;;."],fg:"#a11",n:"Blood Pool"},
  coffin:{rows:[".___.","| X |","|___|"],fg:"#653",n:"Coffin"},
  table_h:{rows:["|===|"],fg:"#a74",n:"Table"},
  table_lg:{rows:[".___.","| . |","|___|"],fg:"#a74",n:"Long Table"},
  bench:{rows:["[---]"],fg:"#864",n:"Bench"},
  chair:{rows:["._."," | "],fg:"#864",n:"Chair"},
  bed:{rows:["[===]","[===]"],fg:"#669",n:"Bed"},
  throne:{rows:["\\ /","[T]"],fg:"#da0",n:"Throne"},
  crate:{rows:["[##]"],fg:"#960",n:"Crate"},
  crate_stack:{rows:["[##]","[##]"],fg:"#960",n:"Crate Stack"},
  barrel:{rows:["(O)"],fg:"#864",n:"Barrel"},
  barrel_row:{rows:["(O)(O)"],fg:"#864",n:"Barrels"},
  chest:{rows:["[==]"],fg:"#da0",n:"Chest"},
  altar:{rows:[".___.","||A||"],fg:"#aac",n:"Altar"},
  bookshelf:{rows:["[|||]","[|||]"],fg:"#864",n:"Bookshelf"},
  cauldron:{rows:[" _ ","{~}"],fg:"#484",n:"Cauldron"},
  anvil:{rows:[" _ ","/V\\"],fg:"#888",n:"Anvil"},
  forge:{rows:["[*F*]"],fg:"#f80",n:"Forge"},
  weapon_rack:{rows:["|/|\\|"],fg:"#888",n:"Weapon Rack"},
  well:{rows:["/-\\","|o|","\\-/"],fg:"#68a",n:"Well"},
  fountain:{rows:[" |~| "," \\~/ "],fg:"#48c",n:"Fountain"},
  tree:{rows:[" # ","###"," | "],fg:"#4a4",n:"Tree"},
  bush:{rows:["*#*"],fg:"#4a4",n:"Bush"},
  mushroom:{rows:["oOo"],fg:"#a64",n:"Mushrooms"},
  pool:{rows:["~~~~","~~~~"],fg:"#48a",n:"Pool"},
  swamp_pool:{rows:["~;~;",";;~;"],fg:"#4a4",n:"Swamp Pool"},
  vine:{rows:["/|","\\|","/|"],fg:"#4a4",n:"Vines"},
  campfire:{rows:[" * ","*#*"],fg:"#f80",n:"Campfire"},
  log:{rows:["===="],fg:"#864",n:"Fallen Log"},
  boulder:{rows:[" _ ","(__)"],fg:"#888",n:"Boulder"},
  sign_post:{rows:["[>>]"," || "],fg:"#864",n:"Sign Post"},
  cart:{rows:["[==o]"],fg:"#864",n:"Cart"},
  stall:{rows:["=TT=","||||"],fg:"#a74",n:"Market Stall"},
  hay:{rows:["^/^/","////"],fg:"#cc4",n:"Hay Bales"},
  stable_rail:{rows:["=||="],fg:"#864",n:"Stable Rail"},
  chains:{rows:[" o "," | "," o "],fg:"#888",n:"Chains"},
  cage:{rows:["[|||]","[   ]","[|||]"],fg:"#888",n:"Cage"},
  rack:{rows:["-+X+-"],fg:"#864",n:"Torture Rack"},
  web:{rows:["///"," //","///"],fg:"#bbb",n:"Cobweb"},
  pillar_f:{rows:["(|)"],fg:"#999",n:"Pillar"},
  statue:{rows:[" A ","[|]"],fg:"#aaa",n:"Statue"},
  rubble:{rows:[",..,",".,.,"],fg:"#777",n:"Rubble"},
  crystal:{rows:["/\\/\\"],fg:"#a4f",n:"Crystals"},
  stalagmite:{rows:[" A "," | "],fg:"#886",n:"Stalagmite"},
  torch_w:{rows:["*|"],fg:"#fa0",n:"Wall Torch"},
  banner:{rows:["|||","|||"],fg:"#c44",n:"Banner"},
  rug:{rows:["~--~","~--~"],fg:"#a44",n:"Rug"},
  corpse_beast:{rows:["VvV",":::"," | "],fg:"#a55",n:"Dead beast"},
  corpse_human:{rows:[" o ","/|\\","/ \\"],fg:"#955",n:"Fallen body"},
  splatter:{rows:[",.,",".;,"],fg:"#811",n:"Blood"},
  bone_heap:{rows:["oOo","ooo"],fg:"#ba8",n:"Bone heap"},
  iron_gate:{rows:["|T|","| |","|_|"],fg:"#888",n:"Iron gate"},
};

// ── Location visuals (floor/corridor flavor) + room-type bias ─────────
const LOCATION_GLYPHS={
  dungeon:{floor:".",wall:"#",corr:".",water:"~",road:":"},
  town:{floor:".",wall:"#",corr:":",water:"~",road:":"},
  castle:{floor:".",wall:"#",corr:".",water:"~",road:":"},
  graveyard:{floor:",",wall:"#",corr:".",water:"~",road:":"},
  swamp:{floor:";",wall:"#",corr:"~",water:"~",road:"~"},
  cave:{floor:".",wall:"#",corr:".",water:"~",road:":"},
  temple:{floor:".",wall:"#",corr:".",water:"~",road:":"},
  sewer:{floor:".",wall:"#",corr:".",water:"=",road:":"},
};

function pickRoomType(loc,locationType,rng){
  if(loc.usesRoads)return pick(loc.rooms,rng);
  const skew={
    dungeon:["Crypt","Torture Room","Prison Cell","Lair","Treasury","Armory","Laboratory","Chapel","Arena"],
    swamp:["Bog Pool","Witch Den","Hollow Tree","Sunken Ruin","Ruins","Nest","Fungal Chamber"],
    graveyard:["Crypt","Mausoleum","Open Graves","Ossuary","Tomb","Catacomb","Graveyard"],
    sewer:["Overflow","Fungal Chamber","Collapsed Section","Rat Nest","Cistern","Drain Room"],
    cave:["Crystal Chamber","Underground Lake","Lava Chamber","Dragon Lair","Nest","Shaft"],
    temple:["Catacombs","Inner Sanctum","Reliquary","Sanctuary","Altar Room"],
    castle:["Dungeon Cell","Vault","Armory","Treasury","War Room"],
  };
  const pref=skew[locationType];
  if(pref&&pref.length&&rng()<0.7){
    const ok=pref.filter((t)=>loc.rooms.includes(t));
    if(ok.length)return pick(ok,rng);
  }
  return pick(loc.rooms,rng);
}

function monsterGlyph(name){
  const s=String(name||"M").toLowerCase();
  if(/spider|rat|scorpion/.test(s))return"8";
  if(/bat|bird|raven|crow/.test(s))return"v";
  if(/dragon|drake|wyrm|hydra/.test(s))return"D";
  if(/zombie|skeleton|ghoul|wraith|ghost|specter|banshee/.test(s))return"Z";
  if(/slime|ooze|jelly|mold/.test(s))return"%";
  if(/goblin|kobold|orc|gnoll|hobgoblin|bugbear/.test(s))return"g";
  if(/ogre|troll|giant|golem|minotaur|mummy/.test(s))return"&";
  if(/wolf|bear|boar|serpent|frog/.test(s))return"*";
  return String(name||"M")[0]||"M";
}

// ── Location Types ───────────────────────────────────────────────────
const LOCATIONS = {
  dungeon: {
    name: "Dungeon", genName: genDungeonName,
    rooms: ["Chamber","Crypt","Prison Cell","Torture Room","Laboratory","Treasury","Guard Room","Armory","Barracks","Storage","Chapel","Lair","Throne Room","Portal Room","Arena"],
    decos: {
      "Chamber":["rubble","barrel","crate","torch_w","bones","web","pillar_f"],
      "Crypt":["coffin","skull","bones","skeleton","blood_sm","web","grave3"],
      "Prison Cell":["chains","cage","bones","skull","blood_sm","deadbody"],
      "Torture Room":["rack","chains","blood_lg","skull","cage","deadbody","blood_sm"],
      "Laboratory":["cauldron","bookshelf","table_lg","barrel","crystal","mushroom"],
      "Treasury":["chest","chest","crate_stack","barrel_row","statue","rug"],
      "Guard Room":["weapon_rack","table_h","bench","barrel","crate","torch_w"],
      "Armory":["weapon_rack","weapon_rack","crate_stack","anvil","bench","banner"],
      "Barracks":["bed","bed","table_h","crate","torch_w","barrel"],
      "Storage":["crate_stack","barrel_row","barrel","crate","crate"],
      "Chapel":["altar","statue","bench","bench","banner","torch_w"],
      "Lair":["bones","skull","blood_lg","deadbody","rubble","web","skeleton"],
      "Throne Room":["throne","rug","banner","banner","statue","torch_w","pillar_f"],
      "Portal Room":["crystal","pillar_f","rubble","altar","statue"],
      "Arena":["blood_lg","bones","weapon_rack","skull","rubble","pillar_f"],
    },
  },
  town: {
    name: "Town", usesRoads: true, genName: genTownName,
    rooms: ["Tavern","Blacksmith","Market","Temple","House","Town Hall","Stable","Inn","Apothecary","General Store","Barracks","Library","Bakery","Well Square","Guard Tower"],
    decos: {
      "Tavern":["table_lg","table_h","barrel_row","bench","bench","barrel","chair"],
      "Blacksmith":["anvil","forge","barrel","weapon_rack","crate","bench"],
      "Market":["stall","stall","cart","crate_stack","barrel","sign_post"],
      "Temple":["altar","statue","bench","bench","bookshelf","banner","fountain"],
      "House":["bed","table_h","chair","chair","crate","barrel","bookshelf"],
      "Town Hall":["table_lg","bench","bench","banner","statue","bookshelf","rug"],
      "Stable":["hay","hay","stable_rail","barrel","crate"],
      "Inn":["bed","bed","table_h","barrel","bench","chair"],
      "Apothecary":["cauldron","bookshelf","mushroom","barrel","table_h"],
      "General Store":["crate_stack","barrel_row","crate","barrel","sign_post","table_h"],
      "Barracks":["bed","bed","weapon_rack","crate","bench","torch_w"],
      "Library":["bookshelf","bookshelf","bookshelf","table_lg","chair","bench"],
      "Bakery":["table_lg","barrel","crate","barrel"],
      "Well Square":["well","bench","bench","sign_post","bush"],
      "Guard Tower":["weapon_rack","crate","barrel","torch_w","bench"],
    },
  },
  castle: {
    name: "Castle",
    rooms: ["Throne Room","Great Hall","Barracks","Armory","Chapel","Kitchen","Dungeon Cell","Tower Room","Courtyard","Treasury","Library","War Room","Servant Quarters","Gallery","Vault"],
    decos: {
      "Throne Room":["throne","rug","banner","banner","pillar_f","pillar_f","statue","torch_w"],
      "Great Hall":["table_lg","table_lg","bench","bench","banner","torch_w","pillar_f","rug"],
      "Barracks":["bed","bed","bed","weapon_rack","crate","torch_w"],
      "Armory":["weapon_rack","weapon_rack","anvil","crate_stack","barrel","bench"],
      "Chapel":["altar","statue","bench","bench","banner","bookshelf"],
      "Kitchen":["table_lg","barrel_row","barrel","crate","cauldron"],
      "Dungeon Cell":["chains","cage","bones","skull","blood_sm","deadbody"],
      "Tower Room":["bookshelf","table_h","chair","bed","torch_w"],
      "Courtyard":["well","bush","bush","bench","sign_post","statue"],
      "Treasury":["chest","chest","crate_stack","barrel_row","statue"],
      "Library":["bookshelf","bookshelf","bookshelf","table_lg","chair","chair"],
      "War Room":["table_lg","banner","banner","torch_w","bookshelf","chair"],
      "Servant Quarters":["bed","bed","table_h","barrel","crate"],
      "Gallery":["statue","statue","banner","banner","rug","torch_w"],
      "Vault":["chest","chest","chest","crate_stack","barrel"],
    },
  },
  graveyard: {
    name: "Graveyard", genName: (r)=>"The "+pick(["Forgotten","Silent","Weeping","Hollow","Cursed","Ancient","Blighted","Restless"],r)+" "+pick(["Cemetery","Graveyard","Burial Ground","Necropolis","Boneyard"],r),
    rooms: ["Graveyard","Mausoleum","Crypt","Open Graves","Chapel","Caretaker Hut","Ossuary","Tomb","Catacomb","Gate House"],
    decos: {
      "Graveyard":["grave1","grave1","grave2","grave3","grave3","deadbody","bones","skull","bush"],
      "Mausoleum":["coffin","coffin","skull","bones","blood_sm","web","statue"],
      "Crypt":["coffin","skeleton","bones","skull","blood_sm","web","rubble"],
      "Open Graves":["grave1","grave2","grave3","deadbody","bones","blood_lg","skull","skeleton"],
      "Chapel":["altar","bench","bench","bookshelf","banner","statue"],
      "Caretaker Hut":["bed","table_h","crate","barrel","torch_w","chair"],
      "Ossuary":["skull","skull","bones","bones","skeleton","skeleton","blood_sm"],
      "Tomb":["coffin","coffin","grave2","statue","blood_sm","chest","web"],
      "Catacomb":["bones","bones","skull","skeleton","web","rubble","blood_sm"],
      "Gate House":["bench","torch_w","weapon_rack","crate","barrel"],
    },
  },
  swamp: {
    name: "Swamp", genName: (r)=>pick(["Blackmire","Rotfen","Boghollow","Murkveil","Grimmarsh","Deadwater","Gloomfen","Mistveil","Dankroot","Witchwater"],r)+" "+pick(["Swamp","Marsh","Bog","Fen","Mire"],r),
    rooms: ["Hut","Clearing","Ruins","Bog Pool","Witch Den","Hollow Tree","Camp","Shrine","Nest","Sunken Ruin"],
    decos: {
      "Hut":["cauldron","table_h","bed","mushroom","barrel","bones"],
      "Clearing":["campfire","log","bush","bush","boulder","mushroom"],
      "Ruins":["rubble","rubble","pillar_f","vine","web","bones","boulder"],
      "Bog Pool":["swamp_pool","swamp_pool","mushroom","log","vine","deadbody"],
      "Witch Den":["cauldron","bookshelf","skull","mushroom","crystal","bones","web"],
      "Hollow Tree":["mushroom","vine","vine","bones","web"],
      "Camp":["campfire","log","log","crate","barrel","bed"],
      "Shrine":["altar","statue","vine","mushroom","torch_w"],
      "Nest":["bones","bones","skull","deadbody","blood_lg","web"],
      "Sunken Ruin":["pool","rubble","pillar_f","vine","chest","boulder"],
    },
  },
  cave: {
    name: "Cave", genName: (r)=>pick(["Crystal","Shadow","Echo","Deep","Howling","Granite","Obsidian","Dripping","Forgotten","Abyssal"],r)+" "+pick(["Caves","Caverns","Tunnels","Depths","Hollows"],r),
    rooms: ["Cavern","Crystal Chamber","Underground Lake","Nest","Shaft","Tunnel Junction","Mushroom Grove","Mining Camp","Lava Chamber","Dragon Lair"],
    decos: {
      "Cavern":["stalagmite","stalagmite","boulder","rubble","mushroom","bones"],
      "Crystal Chamber":["crystal","crystal","crystal","stalagmite","pool","boulder"],
      "Underground Lake":["pool","pool","stalagmite","boulder","mushroom","bones"],
      "Nest":["bones","bones","skull","deadbody","blood_lg","skeleton"],
      "Shaft":["rubble","boulder","stalagmite","log","crate"],
      "Tunnel Junction":["rubble","stalagmite","boulder","mushroom","torch_w"],
      "Mushroom Grove":["mushroom","mushroom","mushroom","mushroom","pool","log","vine"],
      "Mining Camp":["crate_stack","barrel","campfire","log","anvil","table_h"],
      "Lava Chamber":["boulder","boulder","stalagmite","rubble","skull","bones"],
      "Dragon Lair":["chest","chest","bones","skull","blood_lg","skeleton","rubble","pillar_f"],
    },
  },
  temple: {
    name: "Temple", genName: (r)=>"Temple of "+pick(["the Sun","the Moon","Shadow","Light","the Forgotten","the Eternal","the Void","the Radiant","the Storm","the Deep"],r),
    rooms: ["Sanctuary","Altar Room","Library","Meditation","Reliquary","Cloister","Scriptorium","Bell Tower","Catacombs","Inner Sanctum"],
    decos: {
      "Sanctuary":["altar","statue","statue","banner","banner","bench","bench","pillar_f","pillar_f"],
      "Altar Room":["altar","altar","banner","torch_w","rug","statue"],
      "Library":["bookshelf","bookshelf","bookshelf","bookshelf","table_lg","chair"],
      "Meditation":["rug","rug","fountain","bush","statue","bench"],
      "Reliquary":["chest","chest","statue","banner","pillar_f","torch_w"],
      "Cloister":["pillar_f","pillar_f","bench","bush","fountain","vine"],
      "Scriptorium":["bookshelf","bookshelf","table_lg","table_h","chair","chair"],
      "Bell Tower":["rubble","web","chains","pillar_f","torch_w"],
      "Catacombs":["coffin","bones","skull","skeleton","web","blood_sm"],
      "Inner Sanctum":["altar","statue","crystal","rug","torch_w","torch_w","pillar_f"],
    },
  },
  sewer: {
    name: "Sewer", genName: (r)=>pick(["The Undercity","The Depths Below","The Ratways","The Drains","The Dark Below","The Cisterns","The Warrens","The Gutters"],r),
    rooms: ["Junction","Drain Room","Cistern","Smuggler Den","Rat Nest","Overflow","Fungal Chamber","Collapsed Section","Hideout","Outflow"],
    decos: {
      "Junction":["pool","rubble","barrel","bones","mushroom"],
      "Drain Room":["pool","pool","rubble","web","bones"],
      "Cistern":["pool","pool","pool","vine","rubble","mushroom"],
      "Smuggler Den":["crate_stack","barrel_row","chest","table_h","bed","torch_w"],
      "Rat Nest":["bones","bones","deadbody","blood_sm","mushroom","rubble"],
      "Overflow":["pool","pool","rubble","vine","mushroom","bones"],
      "Fungal Chamber":["mushroom","mushroom","mushroom","mushroom","pool","vine"],
      "Collapsed Section":["rubble","rubble","rubble","boulder","bones","web"],
      "Hideout":["bed","table_h","crate","barrel","weapon_rack","torch_w"],
      "Outflow":["pool","rubble","vine","mushroom","boulder"],
    },
  },
};

// ── Tile Types ───────────────────────────────────────────────────────
const T={V:0,F:1,W:2,D:3,C:4,SD:5,SU:6,WA:7,P:8,ROAD:9};

function getCR(lv){if(lv<=2)return 1;if(lv<=4)return 3;if(lv<=6)return 5;if(lv<=8)return 7;if(lv<=10)return 9;if(lv<=12)return 11;if(lv<=14)return 13;if(lv<=16)return 15;if(lv<=18)return 17;return 20;}

// ── Generation ───────────────────────────────────────────────────────
function generateMap(cfg) {
  const {width:W,height:H,roomCount,depth,level,trapsOn,itemsOn,monstersOn,rng,locationType}=cfg;
  const loc=LOCATIONS[locationType];
  const grid=Array.from({length:H},()=>Array(W).fill(T.V));
  const rooms=[];const entities=[];const decoOverlay=[];
  const mapName=loc.genName?loc.genName(rng):null;
  const tavernName=loc.usesRoads?genTavernName(rng):null;

  let att=0;
  while(rooms.length<roomCount&&att<roomCount*100){
    att++;
    const rw=rI(5,Math.min(14,Math.floor(W/3)),rng);
    const rh=rI(5,Math.min(12,Math.floor(H/3)),rng);
    const rx=rI(1,W-rw-1,rng), ry=rI(1,H-rh-1,rng);
    let overlap=false;
    for(const r of rooms){if(rx<r.x+r.w+2&&rx+rw+2>r.x&&ry<r.y+r.h+2&&ry+rh+2>r.y){overlap=true;break;}}
    if(overlap)continue;

    let roomType=pickRoomType(loc,locationType,rng);
    if(loc.usesRoads&&rooms.length===0) roomType="Well Square";
    const room={id:rooms.length+1,x:rx,y:ry,w:rw,h:rh,cx:Math.floor(rx+rw/2),cy:Math.floor(ry+rh/2),type:roomType,
      label:loc.usesRoads&&roomType==="Tavern"?tavernName:roomType};
    rooms.push(room);

    for(let y=ry;y<ry+rh;y++)for(let x=rx;x<rx+rw;x++) grid[y][x]=T.F;
    for(let y=ry-1;y<=ry+rh;y++)for(let x=rx-1;x<=rx+rw;x++)
      if(y>=0&&y<H&&x>=0&&x<W&&grid[y][x]===T.V) grid[y][x]=T.W;
  }

  if(rooms.length>1){
    const conn=new Set([0]);const unconn=new Set(rooms.map((_,i)=>i).filter(i=>i>0));
    while(unconn.size>0){
      let bd=Infinity,ba=-1,bb=-1;
      for(const a of conn)for(const b of unconn){const d=Math.abs(rooms[a].cx-rooms[b].cx)+Math.abs(rooms[a].cy-rooms[b].cy);if(d<bd){bd=d;ba=a;bb=b;}}
      if(ba<0)break;
      carvePath(grid,rooms[ba],rooms[bb],W,H,rng,loc.usesRoads);
      conn.add(bb);unconn.delete(bb);
    }
    for(let i=0;i<Math.floor(rooms.length*0.15);i++){
      const a=rI(0,rooms.length-1,rng),b=rI(0,rooms.length-1,rng);
      if(a!==b)carvePath(grid,rooms[a],rooms[b],W,H,rng,loc.usesRoads);
    }
  }

  if(!loc.usesRoads){
    for(const room of rooms){
      const edges=[];
      for(let x=room.x;x<room.x+room.w;x++){edges.push({x,y:room.y-1});edges.push({x,y:room.y+room.h});}
      for(let y=room.y;y<room.y+room.h;y++){edges.push({x:room.x-1,y});edges.push({x:room.x+room.w,y});}
      for(const e of edges)
        if(e.y>=0&&e.y<H&&e.x>=0&&e.x<W&&grid[e.y][e.x]===T.C&&rng()<0.5) grid[e.y][e.x]=T.D;
    }
  }

  if(rooms.length>=2){
    const en=rooms[0];
    const ex2=rI(en.x+1,en.x+en.w-2,rng),ey2=rI(en.y+1,en.y+en.h-2,rng);
    if(grid[ey2][ex2]===T.F) grid[ey2][ex2]=T.SU;
    if(depth>1&&rooms.length>=2){
      const ex=rooms[rooms.length-1];
      const sx=rI(ex.x+1,ex.x+ex.w-2,rng),sy=rI(ex.y+1,ex.y+ex.h-2,rng);
      if(grid[sy][sx]===T.F) grid[sy][sx]=T.SD;
    }
  }

  // Place decorations
  const usedCells=new Set();
  for(const room of rooms){
    let decoPool=loc.decos[room.type]||loc.decos[loc.rooms[0]]||["rubble","barrel","crate"];
    if(locationType==="dungeon"||locationType==="graveyard"||locationType==="sewer"){
      decoPool=[...decoPool,"bones","skull","blood_sm","deadbody","corpse_beast","splatter","bone_heap","web","rubble"];
    }
    if(locationType==="swamp")decoPool=[...decoPool,"deadbody","bones","mushroom","vine","swamp_pool","blood_sm"];
    if(locationType==="temple")decoPool=[...decoPool,"bones","coffin","statue","blood_sm","altar"];
    const numDecos=rI(4,Math.min(14,Math.floor((room.w*room.h)/6)+6),rng);
    const chosen=[];for(let i=0;i<numDecos;i++) chosen.push(pick(decoPool,rng));

    for(const decoKey of chosen){
      const stamp=S_[decoKey];if(!stamp)continue;
      const sw=Math.max(...stamp.rows.map(r=>r.length));
      const sh=stamp.rows.length;
      if(sw+2>room.w||sh+2>room.h)continue;

      let placed=false;
      for(let tryN=0;tryN<20&&!placed;tryN++){
        const px=rI(room.x+1,room.x+room.w-sw-1,rng);
        const py=rI(room.y+1,room.y+room.h-sh-1,rng);
        let ok=true;
        for(let dy=0;dy<sh&&ok;dy++){
          for(let dx=0;dx<sw&&ok;dx++){
            const ch=stamp.rows[dy]?.[dx];
            if(ch&&ch!==" "){
              const k=`${px+dx},${py+dy}`;
              if(usedCells.has(k)||grid[py+dy]?.[px+dx]!==T.F) ok=false;
            }
          }
        }
        if(ok){
          for(let dy=0;dy<sh;dy++){
            for(let dx=0;dx<stamp.rows[dy].length;dx++){
              const ch=stamp.rows[dy][dx];
              if(ch&&ch!==" "){
                const k=`${px+dx},${py+dy}`;
                usedCells.add(k);
                decoOverlay.push({x:px+dx,y:py+dy,ch,fg:stamp.fg,name:stamp.n,roomId:room.id,decoKey});
              }
            }
          }
          placed=true;
        }
      }
    }
  }

  // Entities
  const maxCR=getCR(level);
  const avCRs=Object.keys(MONSTERS).map(Number).filter(c=>c<=maxCR);
  for(const room of rooms){
    if(monstersOn&&rng()<0.55&&room.id>1){
      const cr=pick(avCRs,rng);const mn=pick(MONSTERS[cr],rng);
      const cnt=cr<1?rI(2,5,rng):cr<3?rI(1,3,rng):1;
      let mx,my,tries=0;
      do{mx=rI(room.x+1,room.x+room.w-2,rng);my=rI(room.y+1,room.y+room.h-2,rng);tries++;}
      while(usedCells.has(`${mx},${my}`)&&tries<15);
      entities.push({type:"monster",name:mn,count:cnt,cr,x:mx,y:my,roomId:room.id});
    }
    if(trapsOn&&rng()<0.3){
      const av=TRAPS.filter(t=>t.minLv<=level);
      if(av.length){const t=pick(av,rng);let tx,ty,tries=0;
        do{tx=rI(room.x+1,room.x+room.w-2,rng);ty=rI(room.y+1,room.y+room.h-2,rng);tries++;}
        while(usedCells.has(`${tx},${ty}`)&&tries<15);
        entities.push({type:"trap",...t,x:tx,y:ty,roomId:room.id});}
    }
    if(itemsOn&&rng()<0.4){
      const av=ITEMS.filter(i=>i.minLv<=level);
      if(av.length){const it=pick(av,rng);let ix,iy,tries=0;
        do{ix=rI(room.x+1,room.x+room.w-2,rng);iy=rI(room.y+1,room.y+room.h-2,rng);tries++;}
        while(usedCells.has(`${ix},${iy}`)&&tries<15);
        entities.push({type:"item",...it,x:ix,y:iy,roomId:room.id});}
    }
  }

  return {grid,rooms,entities,decoOverlay,width:W,height:H,mapName,locationType,glyphs:LOCATION_GLYPHS[locationType]||LOCATION_GLYPHS.dungeon};
}

function carvePath(grid,a,b,W,H,rng,isRoad){
  let x=a.cx,y=a.cy;const goH=rng()<0.5;const tileType=isRoad?T.ROAD:T.C;
  const carve=(cx,cy)=>{
    if(cy>=0&&cy<H&&cx>=0&&cx<W){
      if(grid[cy][cx]===T.V||grid[cy][cx]===T.W) grid[cy][cx]=tileType;
      if(isRoad){for(const d of[-1,1]){if(cy+d>=0&&cy+d<H&&grid[cy+d][cx]===T.V)grid[cy+d][cx]=tileType;if(cx+d>=0&&cx+d<W&&grid[cy][cx+d]===T.V)grid[cy][cx+d]=tileType;}}
      for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const ny=cy+dy,nx=cx+dx;if(ny>=0&&ny<H&&nx>=0&&nx<W&&grid[ny][nx]===T.V)grid[ny][nx]=T.W;}
    }
  };
  if(goH){while(x!==b.cx){carve(x,y);x+=x<b.cx?1:-1;}carve(x,y);while(y!==b.cy){carve(x,y);y+=y<b.cy?1:-1;}carve(x,y);}
  else{while(y!==b.cy){carve(x,y);y+=y<b.cy?1:-1;}carve(x,y);while(x!==b.cx){carve(x,y);x+=x<b.cx?1:-1;}carve(x,y);}
}

// ── Rendering ────────────────────────────────────────────────────────
function buildRenderGrid(dg){
  const {grid,rooms,entities,decoOverlay,width:W,height:H,glyphs:rawG={}}=dg;
  const G={floor:".",wall:"#",door:"+",corr:".",voidCh:" ",water:"~",pillar:"O",road:":",stairsU:"<",stairsD:">",...rawG};
  const eMap={};entities.forEach(e=>{eMap[`${e.x},${e.y}`]=e;});
  const dMap={};decoOverlay.forEach(d=>{dMap[`${d.x},${d.y}`]=d;});
  const labelMap={};rooms.forEach(r=>{labelMap[`${r.cx},${r.y}`]=r;});
  const out=[];
  for(let y=0;y<H;y++){const row=[];for(let x=0;x<W;x++){
    const k=`${x},${y}`;const ent=eMap[k];const deco=dMap[k];const label=labelMap[k];const tile=grid[y][x];
    let ch,eType=null,fg=null,eName=null,extra=null;
    if(ent){ch=ent.type==="monster"?monsterGlyph(ent.name):ent.type==="trap"?"^":"!";eType=ent.type;extra=ent;}
    else if(deco){ch=deco.ch;fg=deco.fg;eType="deco";eName=deco.name;extra=deco;}
    else if(label){ch=String(label.id);eType="label";}
    else{switch(tile){case T.V:ch=G.voidCh;break;case T.F:ch=G.floor;break;case T.W:ch=G.wall;break;case T.D:ch=G.door;break;case T.C:ch=G.corr;break;case T.SU:ch=G.stairsU;break;case T.SD:ch=G.stairsD;break;case T.WA:ch=G.water;break;case T.P:ch=G.pillar;break;case T.ROAD:ch=G.road;break;default:ch=G.voidCh;}}
    row.push({ch,tile,eType,fg,eName,extra});
  }out.push(row);}return out;
}

const STY={
  terminal:{bg:"#000",void:"#000",wallFg:"#666",floorFg:"#222",doorFg:"#cc0",stairsFg:"#0f0",waterFg:"#06f",pillarFg:"#555",monsterFg:"#f22",trapFg:"#f80",itemFg:"#f0f",labelFg:"#0c0",roadFg:"#444",panelBg:"#000",panelBorder:"#222",textColor:"#ccc",dimText:"#444",accent:"#0c0",accentAlt:"#f22",inputBg:"#0a0a0a",inputBorder:"#333",inputFg:"#0f0",btnBorder:"#0a0",btnFg:"#0f0",headerBg:"#000",selectedBg:"#0a1a0a",floorBg:"#000",wallBg:"#000",labelBg:"#000",doorBg:"#000",stairsBg:"#000",roadBg:"#000"},
  rogue:{bg:"#08081a",void:"#0d0d1a",wallFg:"#555570",floorFg:"#333350",doorFg:"#c8a020",stairsFg:"#0d0",waterFg:"#26c",pillarFg:"#668",monsterFg:"#f33",trapFg:"#f80",itemFg:"#4af",labelFg:"#aad",roadFg:"#444466",panelBg:"#0a0a1f",panelBorder:"#1a1a33",textColor:"#c8c8e0",dimText:"#456",accent:"#a8f",accentAlt:"#f44",inputBg:"#151530",inputBorder:"#2a2a44",inputFg:"#b9f",btnBorder:"#43b",btnFg:"#ddd",headerBg:"#0c0c22",selectedBg:"#1a1a55",floorBg:"#1a1a2e",wallBg:"#2a2a3a",labelBg:"#1a1a2e",doorBg:"#1a1a2e",stairsBg:"#1a1a2e",roadBg:"#1a1a2e"},
  grid:{bg:"#6b6560",void:"#8a8680",wallFg:"#5a5647",floorFg:"#c8c0b0",doorFg:"#5c4400",stairsFg:"#2d8b2d",waterFg:"#3a7ca5",pillarFg:"#6b6358",monsterFg:"#c22",trapFg:"#c80",itemFg:"#24c",labelFg:"#333",roadFg:"#a09888",panelBg:"#5e5955",panelBorder:"#4a4540",textColor:"#f0e8d8",dimText:"#aa9",accent:"#f0e8d8",accentAlt:"#c22",inputBg:"#e8e4dc",inputBorder:"#8a8580",inputFg:"#333",btnBorder:"#8a6820",btnFg:"#fff",headerBg:"#5a5550",selectedBg:"#e8e0c0",floorBg:"#f5f0e6",wallBg:"#d4d0c8",labelBg:"#f5f0e6",doorBg:"#8b6914",stairsBg:"#f5f0e6",roadBg:"#e8e0d0"},
};
const RM={common:"#aaa",uncommon:"#0f0",rare:"#44f",vr:"#c4f",legendary:"#fa0"};
const RMG={common:"#888",uncommon:"#282",rare:"#24c",vr:"#82c",legendary:"#c80"};

/** Deco keys hidden on player print export (containers & obvious searchable props). */
const PLAYER_PRINT_HIDE_DECO_KEYS=new Set(["chest","crate","crate_stack","bookshelf","weapon_rack","crystal"]);

function wrapTextLine(s,maxLen){
  if(s.length<=maxLen)return[s];
  const out=[];let rest=s;
  while(rest.length>maxLen){
    let cut=rest.lastIndexOf(" ",maxLen);
    if(cut<maxLen/2)cut=maxLen;
    out.push(rest.slice(0,cut).trim());
    rest=rest.slice(cut).trim();
  }
  if(rest)out.push(rest);
  return out;
}

function buildDmExportSidebarLines(dg){
  const lines=[];
  lines.push("DM KEY — "+(dg.mapName||"Map")+" — Floor "+(dg.floor||1)+" — Seed "+(dg.seed??""));
  lines.push("─".repeat(44));
  lines.push("# wall   . floor   + door   : road   < > stairs");
  lines.push("^ trap   ! treasure/item   letter = monster");
  lines.push("─".repeat(44));
  const rooms=[...dg.rooms].sort((a,b)=>a.id-b.id);
  for(const r of rooms){
    lines.push("Room "+r.id+": "+(r.label||r.type));
    const dnames=[...new Set(dg.decoOverlay.filter(d=>d.roomId===r.id).map(d=>d.name))];
    if(dnames.length)lines.push("  Scenery: "+dnames.join(", "));
    const re=dg.entities.filter(e=>e.roomId===r.id);
    if(re.length===0&&!dnames.length)lines.push("  (no notes)");
    for(const e of re){
      if(e.type==="monster")lines.push("  [M] "+e.name+" x"+e.count+" (CR "+e.cr+")");
      else if(e.type==="trap")lines.push("  [T] "+e.name+" — "+e.dmg);
      else if(e.type==="item")lines.push("  [I] "+e.name+" ("+e.r+")");
    }
    lines.push("");
  }
  return lines;
}

function cellColor(cell,style){
  const s=STY[style];const isG=style==="grid";const bg0=s.bg;
  if(cell.eType==="monster")return{bg:isG?s.floorBg:bg0,fg:s.monsterFg};
  if(cell.eType==="trap")return{bg:isG?s.floorBg:bg0,fg:s.trapFg};
  if(cell.eType==="item")return{bg:isG?s.floorBg:bg0,fg:(isG?RMG:RM)[cell.extra?.r]||s.itemFg};
  if(cell.eType==="deco")return{bg:isG?s.floorBg:bg0,fg:cell.fg||s.floorFg};
  if(cell.eType==="label")return{bg:s.labelBg,fg:s.labelFg};
  switch(cell.tile){case T.V:return{bg:s.void,fg:s.void};case T.W:return{bg:isG?s.wallBg:bg0,fg:s.wallFg};case T.F:case T.C:return{bg:isG?s.floorBg:bg0,fg:s.floorFg};case T.D:return{bg:isG?s.doorBg:bg0,fg:s.doorFg};case T.SU:case T.SD:return{bg:isG?s.stairsBg:bg0,fg:s.stairsFg};case T.WA:return{bg:isG?"#a8d4e6":(style==="terminal"?"#000008":"#0a1428"),fg:s.waterFg};case T.P:return{bg:isG?"#b8b0a0":bg0,fg:s.pillarFg};case T.ROAD:return{bg:isG?s.roadBg:bg0,fg:s.roadFg};default:return{bg:s.void,fg:s.void};}
}

/** High-contrast palette for PNG export (printer-friendly). */
function cellColorPrint(cell){
  if(cell.eType==="monster")return{bg:"#ffffff",fg:"#000000"};
  if(cell.eType==="trap")return{bg:"#ffffff",fg:"#222222"};
  if(cell.eType==="item")return{bg:"#ffffff",fg:"#000000"};
  if(cell.eType==="deco")return{bg:"#ffffff",fg:"#1a1a1a"};
  if(cell.eType==="label")return{bg:"#f0f0f0",fg:"#000000"};
  switch(cell.tile){
    case T.V:return{bg:"#f5f5f5",fg:"#d0d0d0"};
    case T.W:return{bg:"#ffffff",fg:"#000000"};
    case T.F:
    case T.C:return{bg:"#ffffff",fg:"#333333"};
    case T.D:return{bg:"#ffffff",fg:"#000000"};
    case T.SU:
    case T.SD:return{bg:"#ffffff",fg:"#000000"};
    case T.WA:return{bg:"#e8f4fc",fg:"#003366"};
    case T.P:return{bg:"#ffffff",fg:"#444444"};
    case T.ROAD:return{bg:"#ffffff",fg:"#555555"};
    default:return{bg:"#f5f5f5",fg:"#d0d0d0"};
  }
}

function renderCanvas(dg,style,options={}){
  const showEnts=options.showEnts!==false;
  const revArr=options.revArr!=null?options.revArr:null;
  const scale=options.scale??1;
  const printExport=!!options.print;
  const dmSidebar=!!options.dmSidebar;
  const playerSanitize=!!options.playerSanitizeDecos;
  const rg=buildRenderGrid(dg);
  const cW=10*scale,cH=14*scale;
  const mapW=dg.width*cW+4*scale,mapH=dg.height*cH+32*scale;
  const fontPx=11*scale,lineH=Math.round(13*scale),sidebarColW=7*scale;
  let sidebarW=0,sidebarLines=[];
  if(printExport&&dmSidebar){
    const raw=buildDmExportSidebarLines(dg);
    sidebarLines=[];
    for(const ln of raw)sidebarLines.push(...wrapTextLine(ln,50));
    const maxChars=sidebarLines.reduce((m,l)=>Math.max(m,l.length),36);
    sidebarW=Math.min(520*scale,Math.max(280*scale,Math.ceil(maxChars*sidebarColW+24*scale)));
  }
  const sidebarTextH=sidebarLines.length>0?12*scale+sidebarLines.length*lineH+16*scale:0;
  const canvas=document.createElement("canvas");
  canvas.width=mapW+sidebarW+(sidebarW?12*scale:0);
  canvas.height=Math.max(mapH,sidebarTextH);
  const ctx=canvas.getContext("2d");
  const s=STY[style];
  const bg=printExport?"#ffffff":s.bg;
  ctx.fillStyle=bg;ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.fillStyle=printExport?"#000000":s.dimText;
  ctx.font=`bold ${fontPx}px monospace`;
  let title=(showEnts?"DM PRINT":"PLAYER PRINT")+" | Floor "+(dg.floor||1)+" | Seed "+(dg.seed||"");
  if(dg.mapName)title=dg.mapName+" | "+title;
  ctx.fillText(title,4*scale,14*scale);
  const fogSet=!showEnts&&revArr!=null?new Set(Array.isArray(revArr)?revArr:[...revArr]):null;
  const yO=28*scale;
  ctx.font=`${fontPx}px monospace`;ctx.textBaseline="top";
  for(let y=0;y<dg.height;y++){for(let x=0;x<dg.width;x++){
    const cell=rg[y][x];
    if(!showEnts&&fogSet){
      const rm=dg.rooms.find(r=>x>=r.x-1&&x<=r.x+r.w&&y>=r.y-1&&y<=r.y+r.h);
      const inC=cell.tile===T.C||cell.tile===T.D||cell.tile===T.ROAD;
      if(rm&&!fogSet.has(rm.id)&&!inC){ctx.fillStyle=printExport?"#f5f5f5":s.void;ctx.fillRect(x*cW+2*scale,yO+y*cH,cW,cH);continue;}
    }
    let hide=!showEnts&&(cell.eType==="monster"||cell.eType==="trap"||cell.eType==="item");
    const hideLabel=!showEnts&&playerSanitize&&cell.eType==="label";
    const hideDeco=!showEnts&&playerSanitize&&cell.eType==="deco"&&cell.extra&&PLAYER_PRINT_HIDE_DECO_KEYS.has(cell.extra.decoKey);
    if(hideLabel||hideDeco)hide=true;
    const c=printExport?cellColorPrint(cell):cellColor(cell,style);
    const floorBg=printExport?"#ffffff":(style==="grid"?s.floorBg:s.bg);
    const floorFg=printExport?"#333333":s.floorFg;
    ctx.fillStyle=hide?floorBg:c.bg;
    ctx.fillRect(x*cW+2*scale,yO+y*cH,cW,cH);
    ctx.fillStyle=hide?floorFg:c.fg;
    const ch=hide?".":(cell.ch.length>1?cell.ch[0]:cell.ch);
    if(ch!==" ")ctx.fillText(ch,x*cW+4*scale,yO+y*cH+2*scale);
  }}
  if(sidebarW&&sidebarLines.length){
    const sx=mapW+8*scale;
    ctx.fillStyle="#ffffff";
    ctx.fillRect(sx-4*scale,0,sidebarW+8*scale,canvas.height);
    ctx.strokeStyle="#cccccc";
    ctx.strokeRect(sx-4*scale,4*scale,sidebarW+8*scale,canvas.height-8*scale);
    ctx.fillStyle="#000000";
    ctx.font=`${fontPx}px monospace`;
    let ly=12*scale;
    for(const line of sidebarLines){
      ctx.fillText(line,sx,ly);
      ly+=lineH;
    }
  }
  return canvas;
}

// ── Component ────────────────────────────────────────────────────────
export default function DungeonForge(){
  const [cfg,setCfg]=useState({roomCount:8,depth:1,level:3,width:80,height:52,trapsOn:true,itemsOn:true,monstersOn:true,style:"terminal",seed:Math.floor(Math.random()*999999),locationType:"dungeon",hiRes:true,hiResExport:true});
  const [dg,setDg]=useState(null);const [selRoom,setSelRoom]=useState(null);const [curFloor,setCurFloor]=useState(1);
  const [floors,setFloors]=useState([]);const [hovered,setHovered]=useState(null);const [legend,setLegend]=useState(false);
  const [view,setView]=useState("dm");const [revealed,setRevealed]=useState(new Set([1]));
  const mapViewportRef=useRef(null);const [vpSize,setVpSize]=useState({w:0,h:0});
  useEffect(()=>{const el=mapViewportRef.current;if(!el)return;const ro=new ResizeObserver(()=>setVpSize({w:el.clientWidth,h:el.clientHeight}));ro.observe(el);setVpSize({w:el.clientWidth,h:el.clientHeight});return()=>ro.disconnect();},[]);

  const generate=useCallback(()=>{
    const all=[];for(let f=0;f<cfg.depth;f++){const rng=seededRNG(cfg.seed+f*7919);const d=generateMap({...cfg,rng});d.floor=f+1;d.seed=cfg.seed;all.push(d);}
    setFloors(all);setDg(all[0]);setCurFloor(1);setSelRoom(null);setRevealed(new Set([1]));
  },[cfg]);

  useEffect(() => { generate(); }, [generate]);

  const u=(k,v)=>setCfg(c=>({...c,[k]:v}));
  const rg=dg?buildRenderGrid(dg):null;const S=STY[cfg.style];const isP=view==="player";
  const Wm=dg?dg.width:1;const Hm=dg?dg.height:1;const pad=24;
  const baseCs=cfg.style==="terminal"?12:cfg.style==="rogue"?13:14;
  const maxCs=cfg.hiRes?56:36,minCell=cfg.hiRes?14:10;
  const fitCs=vpSize.w>48&&vpSize.h>48?Math.max(minCell,Math.min(maxCs,Math.floor(Math.min((vpSize.w-pad)/Wm,(vpSize.h-pad)/Hm)))):0;
  const cs=fitCs>0?fitCs:baseCs;
  const rooms=dg?dg.rooms:[];const ents=dg?dg.entities:[];const decos=dg?dg.decoOverlay:[];
  const loc=LOCATIONS[cfg.locationType];

  const exportPNG=(mode)=>{if(!dg)return;const scale=cfg.hiResExport?2:1;const isDm=mode==="dm";const c=renderCanvas(dg,cfg.style,{showEnts:isDm,revArr:null,scale,print:true,dmSidebar:isDm,playerSanitizeDecos:!isDm});const a=document.createElement("a");a.download=`${(dg.mapName||cfg.locationType).replace(/\s/g,"_")}_f${curFloor}_${mode}_print_${cfg.seed}.png`;a.href=c.toDataURL("image/png");a.click();};

  return(
    <div style={{minHeight:0,flex:1,display:"flex",flexDirection:"column",background:S.bg,color:S.textColor,fontFamily:"'Courier New',monospace",fontSize:13}}>
      <div style={{padding:"7px 12px",borderBottom:`1px solid ${S.panelBorder}`,background:S.headerBg,display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:4}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <span style={{fontSize:17,fontWeight:"bold",color:S.accent,letterSpacing:3}}>DUNGEON FORGE</span>
          {dg?.mapName&&<span style={{fontSize:14,color:S.accent,fontStyle:"italic"}}>— {dg.mapName}</span>}
        </div>
        <div style={{display:"flex",gap:2}}>
          {[["terminal","TERM"],["rogue","DARK"],["grid","LIGHT"]].map(([k,l])=>(
            <button key={k} onClick={()=>u("style",k)} style={{padding:"3px 10px",fontSize:12,letterSpacing:1,fontFamily:"'Courier New',monospace",background:cfg.style===k?"rgba(255,255,255,0.08)":"transparent",color:cfg.style===k?S.accent:S.dimText,border:cfg.style===k?`1px solid ${S.accent}`:"1px solid transparent",borderRadius:2,cursor:"pointer"}}>{l}</button>
          ))}
        </div>
      </div>
      <div style={{display:"flex",flexWrap:"wrap"}}>
        <div style={{width:258,minWidth:258,padding:"8px 10px",borderRight:`1px solid ${S.panelBorder}`,background:S.panelBg,display:"flex",flexDirection:"column",gap:6,maxHeight:"min(70vh, calc(100dvh - 200px))",overflowY:"auto"}}>
          <LB S={S}>LOCATION</LB>
          <select value={cfg.locationType} onChange={e=>u("locationType",e.target.value)} style={{padding:"4px 6px",fontSize:13,fontFamily:"'Courier New',monospace",background:S.inputBg,color:S.inputFg,border:`1px solid ${S.inputBorder}`,borderRadius:2,width:"100%"}}>
            {Object.entries(LOCATIONS).map(([k,v])=><option key={k} value={k}>{v.name}</option>)}
          </select>
          <LB S={S}>CONFIG</LB>
          <NI l="Rooms" v={cfg.roomCount} mn={3} mx={22} S={S} set={v=>u("roomCount",v)}/>
          <NI l="Floors" v={cfg.depth} mn={1} mx={10} S={S} set={v=>u("depth",v)}/>
          <NI l="Party Lv" v={cfg.level} mn={1} mx={20} S={S} set={v=>u("level",v)}/>
          <NI l="Width" v={cfg.width} mn={40} mx={140} S={S} set={v=>u("width",v)}/>
          <NI l="Height" v={cfg.height} mn={30} mx={90} S={S} set={v=>u("height",v)}/>
          <LB S={S}>ENCOUNTERS</LB>
          <Tg l="Monsters" on={cfg.monstersOn} S={S} f={()=>u("monstersOn",!cfg.monstersOn)}/>
          <Tg l="Traps" on={cfg.trapsOn} S={S} f={()=>u("trapsOn",!cfg.trapsOn)}/>
          <Tg l="Items" on={cfg.itemsOn} S={S} f={()=>u("itemsOn",!cfg.itemsOn)}/>
          <LB S={S}>DISPLAY</LB>
          <Tg l="Large cells (fill view)" on={cfg.hiRes} S={S} f={()=>u("hiRes",!cfg.hiRes)}/>
          <Tg l="2x PNG export" on={cfg.hiResExport} S={S} f={()=>u("hiResExport",!cfg.hiResExport)}/>
          <LB S={S}>SEED</LB>
          <div style={{display:"flex",gap:2}}>
            <input type="number" value={cfg.seed} onChange={e=>u("seed",parseInt(e.target.value)||0)} style={{flex:1,padding:"2px 3px",fontSize:16,fontFamily:"'Courier New',monospace",background:S.inputBg,color:S.inputFg,border:`1px solid ${S.inputBorder}`,borderRadius:2,width:30}}/>
            <button onClick={()=>u("seed",Math.floor(Math.random()*999999))} style={{padding:"2px 5px",fontSize:14,fontFamily:"'Courier New',monospace",background:S.inputBg,color:S.dimText,border:`1px solid ${S.inputBorder}`,borderRadius:2,cursor:"pointer"}}>RNG</button>
          </div>
          <button onClick={generate} style={{marginTop:3,padding:"6px 0",fontSize:16,fontWeight:"bold",fontFamily:"'Courier New',monospace",letterSpacing:2,background:S.inputBg,color:S.btnFg,border:`1px solid ${S.btnBorder}`,borderRadius:2,cursor:"pointer"}}>GENERATE</button>
          <LB S={S}>VIEW</LB>
          <div style={{display:"flex",gap:2}}>
            {[["dm","DM"],["player","PLAYER"]].map(([k,l])=>(
              <button key={k} onClick={()=>setView(k)} style={{flex:1,padding:"2px 0",fontSize:14,fontFamily:"'Courier New',monospace",background:view===k?"rgba(255,255,255,0.06)":"transparent",color:view===k?S.accent:S.dimText,border:`1px solid ${view===k?S.accent:S.panelBorder}`,borderRadius:2,cursor:"pointer"}}>{l}</button>
            ))}
          </div>
          {isP&&<div style={{fontSize:14,color:S.dimText}}>
            <div style={{marginBottom:2}}>Fog of war active.</div>
            <div style={{display:"flex",gap:2}}>
              <button onClick={()=>setRevealed(new Set(rooms.map(r=>r.id)))} style={{flex:1,padding:"1px",fontSize:16,fontFamily:"'Courier New',monospace",background:S.inputBg,color:S.accent,border:`1px solid ${S.inputBorder}`,borderRadius:2,cursor:"pointer"}}>Reveal All</button>
              <button onClick={()=>setRevealed(new Set([1]))} style={{flex:1,padding:"1px",fontSize:16,fontFamily:"'Courier New',monospace",background:S.inputBg,color:S.accentAlt,border:`1px solid ${S.inputBorder}`,borderRadius:2,cursor:"pointer"}}>Reset</button>
            </div>
          </div>}
          <LB S={S}>EXPORT PNG (PRINT)</LB>
          <div style={{fontSize:16,color:S.dimText,lineHeight:1.35,marginBottom:2}}>White background, black ink. DM = room key on the side. Player = no secrets, no room numbers.</div>
          <div style={{display:"flex",gap:2}}>
            <button onClick={()=>exportPNG("dm")} style={{flex:1,padding:"2px",fontSize:16,fontFamily:"'Courier New',monospace",background:S.inputBg,color:S.accent,border:`1px solid ${S.inputBorder}`,borderRadius:2,cursor:"pointer"}}>DM Map</button>
            <button onClick={()=>exportPNG("player")} style={{flex:1,padding:"2px",fontSize:16,fontFamily:"'Courier New',monospace",background:S.inputBg,color:S.accent,border:`1px solid ${S.inputBorder}`,borderRadius:2,cursor:"pointer"}}>Player Map</button>
          </div>
          {floors.length>1&&<><LB S={S}>FLOOR</LB><div style={{display:"flex",gap:2,flexWrap:"wrap"}}>
            {floors.map((_,i)=>(<button key={i} onClick={()=>{setCurFloor(i+1);setDg(floors[i]);setSelRoom(null);}} style={{padding:"1px 5px",fontSize:14,fontFamily:"'Courier New',monospace",background:curFloor===i+1?"rgba(255,255,255,0.08)":"transparent",color:curFloor===i+1?S.accent:S.dimText,border:`1px solid ${curFloor===i+1?S.accent:S.panelBorder}`,borderRadius:2,cursor:"pointer"}}>{i+1}</button>))}
          </div></>}
          <div style={{marginTop:1}}><button onClick={()=>setLegend(!legend)} style={{background:"none",border:"none",cursor:"pointer",padding:0,color:S.dimText,fontSize:14,fontFamily:"'Courier New',monospace"}}>{legend?"[-]":"[+]"} LEGEND</button>
            {legend&&<div style={{marginTop:2,fontSize:14,lineHeight:1.7,color:S.textColor}}>
              {[["#","Wall",S.wallFg],[".","Floor",S.floorFg],["+","Door",S.doorFg],[":","Road",S.roadFg],["<","Up",S.stairsFg],[">","Down",S.stairsFg],["A-Z","Monster",S.monsterFg],["^","Trap",S.trapFg],["!","Item",S.itemFg],["var","Decor","#f80"]].map(([c,d,f],i)=>(
                <div key={i} style={{display:"flex",alignItems:"center",gap:5}}><span style={{color:f,fontWeight:"bold",minWidth:22,textAlign:"center"}}>{c}</span><span>{d}</span></div>))}
            </div>}
          </div>
        </div>

        <div style={{flex:1,minWidth:0,minHeight:0,display:"flex",flexDirection:"column"}}>
          <div ref={mapViewportRef} style={{overflow:"auto",padding:4,flex:1,minHeight:0}}>
            {rg&&<div style={{display:"inline-block",border:`1px solid ${S.panelBorder}`,background:S.bg,padding:1,lineHeight:0}}>
              {rg.map((row,y)=>(<div key={y} style={{display:"flex",height:cs}}>
                {row.map((cell,x)=>{
                  const room=rooms.find(r=>x>=r.x&&x<r.x+r.w&&y>=r.y&&y<r.y+r.h);
                  if(isP){const wr=rooms.find(r=>x>=r.x-1&&x<=r.x+r.w&&y>=r.y-1&&y<=r.y+r.h);const inC=cell.tile===T.C||cell.tile===T.D||cell.tile===T.ROAD;if(wr&&!revealed.has(wr.id)&&!inC)return<span key={x} style={{display:"inline-block",width:cs,height:cs,background:S.void}}/>;}
                  const c=cellColor(cell,cfg.style);const hide=isP&&(cell.eType==="monster"||cell.eType==="trap"||cell.eType==="item");
                  const bg=room&&selRoom===room.id?S.selectedBg:(hide?(cfg.style==="grid"?S.floorBg:S.bg):c.bg);const fg=hide?S.floorFg:c.fg;
                  const tt=cell.eType==="deco"?cell.eName:(!isP&&cell.extra?.type==="monster")?`${cell.extra.name} x${cell.extra.count} (CR ${cell.extra.cr})`:(!isP&&cell.extra?.type==="trap")?`${cell.extra.name} - ${cell.extra.dmg}`:(!isP&&cell.extra?.type==="item")?`${cell.extra.name} (${cell.extra.r})`:room?`Room ${room.id}: ${room.label||room.type}`:"";
                  return(<span key={x} title={tt} onClick={()=>{if(room)setSelRoom(room.id===selRoom?null:room.id);}} onMouseEnter={()=>{if(cell.extra&&cell.eType!=="deco"&&!isP)setHovered(cell.extra);}} onMouseLeave={()=>setHovered(null)}
                    style={{display:"inline-block",width:cs,height:cs,backgroundColor:bg,color:fg,fontSize:Math.max(12,Math.min(30,cs-2)),fontFamily:"ui-monospace,'Cascadia Code','Courier New',monospace",fontWeight:(cell.eType&&cell.eType!=="label"&&cell.eType!=="deco")?"bold":"normal",textAlign:"center",lineHeight:`${cs}px`,cursor:room?"pointer":"default",imageRendering:"crisp-edges",borderRight:cfg.style==="grid"&&cell.tile!==T.V?"1px solid rgba(0,0,0,0.05)":"none",borderBottom:cfg.style==="grid"&&cell.tile!==T.V?"1px solid rgba(0,0,0,0.05)":"none"}}>
                    {hide?".":(cell.ch.length>1?cell.ch[0]:cell.ch)}</span>);
                })}</div>))}
            </div>}
          </div>
          {hovered&&<div style={{position:"fixed",bottom:10,left:"50%",transform:"translateX(-50%)",background:S.panelBg,color:S.textColor,border:`1px solid ${S.panelBorder}`,padding:"5px 14px",fontSize:13,fontFamily:"'Courier New',monospace",borderRadius:2,zIndex:100,pointerEvents:"none",whiteSpace:"nowrap"}}>
            {hovered.type==="monster"&&<><b style={{color:S.monsterFg}}>{hovered.name}</b> x{hovered.count} (CR {hovered.cr})</>}
            {hovered.type==="trap"&&<><b style={{color:S.trapFg}}>{hovered.name}</b> — {hovered.dmg}</>}
            {hovered.type==="item"&&<><b style={{color:RM[hovered.r]||S.itemFg}}>{hovered.name}</b> ({hovered.r})</>}
          </div>}
          <div style={{borderTop:`1px solid ${S.panelBorder}`,background:S.panelBg,padding:"8px 10px",maxHeight:240,overflowY:"auto"}}>
            {selRoom?(()=>{const rm=rooms.find(r=>r.id===selRoom);if(!rm)return null;const re=ents.filter(e=>e.roomId===selRoom);const rd=decos.filter(d=>d.roomId===selRoom);const decoNames=[...new Set(rd.map(d=>d.name))];
              return(<div>
                <div style={{fontSize:14,fontWeight:"bold",marginBottom:4,color:S.accent,display:"flex",alignItems:"center",gap:5}}>
                  Room {rm.id}: {rm.label||rm.type}<span style={{fontSize:10,fontWeight:"normal",color:S.dimText}}>{rm.w}x{rm.h}</span>
                  {isP&&<button onClick={()=>{const n=new Set(revealed);if(n.has(rm.id))n.delete(rm.id);else n.add(rm.id);setRevealed(n);}} style={{marginLeft:"auto",padding:"3px 8px",fontSize:10,fontFamily:"'Courier New',monospace",background:S.inputBg,color:revealed.has(rm.id)?S.accentAlt:S.accent,border:`1px solid ${S.inputBorder}`,borderRadius:2,cursor:"pointer"}}>{revealed.has(rm.id)?"HIDE":"REVEAL"}</button>}
                </div>
                {!isP&&decoNames.length>0&&<div style={{fontSize:12,color:S.dimText,marginBottom:2}}>Scenery: {decoNames.join(", ")}</div>}
                {isP?<div style={{fontSize:12,fontStyle:"italic",color:S.dimText}}>Entities hidden in player view</div>:
                  re.length===0?<div style={{fontSize:12,fontStyle:"italic",color:S.dimText}}>No encounters</div>:
                  <div style={{display:"flex",flexDirection:"column",gap:2}}>
                    {re.map((e,i)=>(<div key={i} style={{display:"flex",alignItems:"center",gap:4,fontSize:12,padding:"1px 4px",background:"rgba(255,255,255,0.02)",borderRadius:2,border:`1px solid ${S.panelBorder}`}}>
                      <span style={{fontWeight:"bold",color:e.type==="monster"?S.monsterFg:e.type==="trap"?S.trapFg:S.itemFg,minWidth:16}}>{e.type==="monster"?"[M]":e.type==="trap"?"[T]":"[I]"}</span>
                      <b>{e.name}</b>{e.type==="monster"&&<span> x{e.count} (CR {e.cr})</span>}{e.type==="trap"&&<span> — {e.dmg}</span>}{e.type==="item"&&<span style={{color:RM[e.r]||S.itemFg}}> ({e.r})</span>}
                    </div>))}
                  </div>}
              </div>);})():(<div>
              <div style={{fontSize:12,marginBottom:2,color:S.dimText,fontStyle:"italic"}}>Click a room to inspect{isP?" / toggle fog":""}</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:2}}>
                {rooms.map(r=>{const re=ents.filter(e=>e.roomId===r.id);const vis=revealed.has(r.id);
                  return(<button key={r.id} onClick={()=>setSelRoom(r.id)} style={{padding:"3px 6px",fontSize:10,fontFamily:"'Courier New',monospace",background:"rgba(255,255,255,0.03)",color:isP&&!vis?S.dimText:S.textColor,border:`1px solid ${S.panelBorder}`,borderRadius:2,cursor:"pointer",display:"flex",alignItems:"center",gap:3,opacity:isP&&!vis?0.4:1}}>
                    <b>{r.id}</b><span style={{fontSize:9}}>{r.label||r.type}</span>
                    {!isP&&re.some(e=>e.type==="monster")&&<span style={{color:S.monsterFg,fontSize:8}}>M</span>}
                    {!isP&&re.some(e=>e.type==="trap")&&<span style={{color:S.trapFg,fontSize:8}}>T</span>}
                    {!isP&&re.some(e=>e.type==="item")&&<span style={{color:S.itemFg,fontSize:8}}>I</span>}
                    {isP&&<span style={{fontSize:8,color:vis?S.accent:S.dimText}}>{vis?"vis":"fog"}</span>}
                  </button>);})}
              </div></div>)}
          </div>
        </div>
      </div>
    </div>);
}

function LB({children,S}){return<div style={{fontSize:10,letterSpacing:2,fontWeight:"bold",color:S.dimText,borderBottom:`1px solid ${S.panelBorder}`,paddingBottom:3,fontFamily:"'Courier New',monospace"}}>{children}</div>;}
function NI({l,v,mn,mx,S,set}){const[lc,sL]=useState(String(v));useEffect(()=>sL(String(v)),[v]);const commit=()=>{let n=parseInt(lc);if(isNaN(n))n=mn;n=Math.max(mn,Math.min(mx,n));sL(String(n));set(n);};
  return(<div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:3}}>
    <span style={{fontSize:11,color:S.textColor,minWidth:52}}>{l}</span>
    <div style={{display:"flex",alignItems:"center",gap:2}}>
      <button onClick={()=>set(Math.max(mn,v-1))} style={{width:22,height:22,padding:0,fontSize:12,fontFamily:"'Courier New',monospace",background:S.inputBg,color:S.dimText,border:`1px solid ${S.inputBorder}`,borderRadius:2,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>-</button>
      <input type="text" value={lc} onChange={e=>sL(e.target.value)} onBlur={commit} onKeyDown={e=>{if(e.key==="Enter")commit();}}
        style={{width:34,padding:"2px 4px",fontSize:12,textAlign:"center",fontWeight:"bold",fontFamily:"'Courier New',monospace",background:S.inputBg,color:S.inputFg,border:`1px solid ${S.inputBorder}`,borderRadius:2}}/>
      <button onClick={()=>set(Math.min(mx,v+1))} style={{width:22,height:22,padding:0,fontSize:12,fontFamily:"'Courier New',monospace",background:S.inputBg,color:S.dimText,border:`1px solid ${S.inputBorder}`,borderRadius:2,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>+</button>
    </div>
  </div>);}
function Tg({l,on,S,f}){return(<div onClick={f} style={{display:"flex",alignItems:"center",gap:6,cursor:"pointer",fontSize:11,color:S.textColor}}><span style={{color:on?S.accent:S.dimText,fontWeight:"bold",minWidth:20,textAlign:"center"}}>{on?"[x]":"[ ]"}</span>{l}</div>);}
