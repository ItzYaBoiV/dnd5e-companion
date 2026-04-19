/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/exhaustive-deps */
import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { computeCellSize } from "@/lib/computeCellSize";
import { buildAsciiMapLegend } from "@/lib/dungeonAsciiMap";
import { renderDungeonToCanvas } from "@/lib/dungeonTileRenderer";
import { DEFAULT_PALETTE, ENTITY_PALETTE, LOCATION_PALETTE } from "@/lib/dungeonTilePalettes";
import { DungeonMapCanvas } from "@/components/dungeon-forge/DungeonMapCanvas";
import { DungeonLegend } from "@/components/dungeon-forge/DungeonLegend";
import { openForgePrintPacket } from "@/lib/forgePrintPacket";
import { MonsterStatCard } from "@/components/dungeon-forge/MonsterStatCard";
import { useSessionStore } from "@/store/sessionStore";
import { DUNGEON_T as T } from "@/lib/dungeonForgeConstants";
import { buildRenderGrid } from "@/lib/dungeonForgeRenderGrid";
import {
  computeVisibleCellsForPlayer,
  inferStartingRoomId,
  isOpenFloorLocation,
  maxFogHopsForLocationType,
} from "@/lib/dungeonForgeFog";
import { broadcastPlayerMapState } from "@/lib/playerMapBroadcast";
import { pickReferenceLootItem } from "@/lib/forgeLootFromReference";
import { pickGoofyRiddle } from "@/lib/forgeRiddles";

/* ═══════════════════════════════════════════════════════════════════════
   D&D 5e DUNGEON FORGE v3 — Location-Aware Procedural Map Generator
   ═══════════════════════════════════════════════════════════════════════ */

// ── RNG ──────────────────────────────────────────────────────────────
function seededRNG(seed) { let s=seed; return()=>{s=(s*16807)%2147483647;return(s-1)/2147483646;}; }
function pick(a,r){return a[Math.floor(r()*a.length)];}
function rI(a,b,r){return Math.floor(r()*(b-a+1))+a;}

// ── Monsters / Traps / Items ─────────────────────────────────────────
const MONSTERS={0:["Rat","Bat","Spider","Frog"],0.125:["Bandit","Kobold","Skeleton","Zombie","Cultist"],0.25:["Goblin","Wolf","Acolyte"],0.5:["Orc","Gnoll","Shadow","Hobgoblin","Scout"],1:["Ghoul","Bugbear","Giant Spider","Specter"],2:["Ghast","Mimic","Ogre","Gargoyle","Wererat"],3:["Minotaur","Mummy","Owlbear","Werewolf","Hell Hound"],4:["Banshee","Ghost","Flameskull","Ettin"],5:["Troll","Wraith","Umber Hulk","Flesh Golem"],6:["Medusa","Drider","Chimera","Young White Dragon"],7:["Mind Flayer","Stone Giant","Young Black Dragon"],8:["Hydra","Frost Giant","Young Green Dragon","Assassin"],9:["Young Blue Dragon","Fire Giant","Bone Devil"],10:["Young Red Dragon","Aboleth","Stone Golem"],13:["Beholder","Vampire","Adult White Dragon","Rakshasa"],15:["Adult Green Dragon","Purple Worm"],17:["Adult Blue Dragon","Death Knight"],20:["Ancient White Dragon","Pit Fiend"]};
const TRAPS = [
  { name:"Pit Trap", minLv:1, dmg:"2d10 bludgeoning", detectDC:15, saveDC:12, saveType:"DEX", effect:"Fall 10ft into pit. DEX save or take damage." },
  { name:"Poison Darts", minLv:1, dmg:"1d10 piercing + poison", detectDC:17, saveDC:13, saveType:"CON", effect:"CON save or poisoned 1 hour." },
  { name:"Swinging Blade", minLv:2, dmg:"3d10 slashing", detectDC:15, saveDC:14, saveType:"DEX", effect:"DEX save or take full damage." },
  { name:"Fire Jet", minLv:3, dmg:"4d10 fire", detectDC:18, saveDC:14, saveType:"DEX", effect:"15ft line. DEX save for half." },
  { name:"Collapsing Ceiling", minLv:4, dmg:"4d10 bludgeoning", detectDC:19, saveDC:15, saveType:"DEX", effect:"10ft radius. DEX save or buried (restrained)." },
  { name:"Acid Pool", minLv:5, dmg:"6d6 acid", detectDC:18, saveDC:14, saveType:"DEX", effect:"Hidden floor panel. DEX save or submerged." },
  { name:"Lightning Rune", minLv:6, dmg:"8d6 lightning", detectDC:20, saveDC:16, saveType:"CON", effect:"Rune triggers on touch. 30ft chain. CON save for half." },
  { name:"Spike Pit", minLv:2, dmg:"4d10 piercing", detectDC:16, saveDC:13, saveType:"DEX", effect:"Spikes deal extra 2d10 on failed save." },
  { name:"Gas Cloud", minLv:4, dmg:"3d8 poison", detectDC:17, saveDC:15, saveType:"CON", effect:"20ft radius cloud. CON save or incapacitated until leaving." },
  { name:"Crushing Wall", minLv:3, dmg:"5d10 bludgeoning", detectDC:18, saveDC:15, saveType:"STR", effect:"STR save or pushed into corner and restrained." },
  { name:"Symbol of Death", minLv:13, dmg:"10d10 necrotic", detectDC:22, saveDC:18, saveType:"CON", effect:"Triggers on reading. 60ft radius. CON save or drop to 0." },
  { name:"Net Trap", minLv:1, dmg:"none", detectDC:14, saveDC:13, saveType:"STR", effect:"STR save or restrained until DC13 STR check to break free." },
  { name:"Teleport Trap", minLv:5, dmg:"none", detectDC:20, saveDC:16, saveType:"WIS", effect:"WIS save or teleported to random room in dungeon." },
  { name:"Alarm Bell", minLv:1, dmg:"none", detectDC:12, saveDC:0, saveType:"", effect:"Triggers monster encounter in 1d4 rounds." },
  { name:"Freezing Floor", minLv:4, dmg:"4d8 cold", detectDC:17, saveDC:15, saveType:"CON", effect:"CON save or speed reduced to 0 until end of next turn." },
];
const ITEMS=[{name:"Healing Potion",r:"common",minLv:1},{name:"Gold (2d6x10)",r:"common",minLv:1},{name:"Scroll",r:"common",minLv:1},{name:"+1 Weapon",r:"uncommon",minLv:2},{name:"Bag of Holding",r:"uncommon",minLv:3},{name:"Cloak of Protection",r:"uncommon",minLv:3},{name:"Ring of Protection",r:"rare",minLv:5},{name:"+2 Weapon",r:"rare",minLv:6},{name:"Flame Tongue",r:"rare",minLv:7},{name:"Staff of Power",r:"vr",minLv:10},{name:"+3 Weapon",r:"vr",minLv:12},{name:"Vorpal Sword",r:"legendary",minLv:15},{name:"Staff of the Magi",r:"legendary",minLv:17},{name:"Gold (4d6x100)",r:"rare",minLv:5},{name:"Gem (500gp)",r:"rare",minLv:7}];

const SECRET_HINTS=[
  "Loose mortar — a cold draft when you tap the third brick from the corner.",
  "The tapestry hides a hollow sound, like Wi‑Fi from another dimension.",
  "One flagstone wobbles. Extremely legal. Extremely suspicious.",
];

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
  grave1:{rows:[" _ ","|+|","|_|"],fg:"#777",n:"Gravestone"},
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
  iron_gate:{rows:["|T|","|+|","|_|"],fg:"#888",n:"Iron gate"},
};

// ── Location visuals (floor/corridor flavor) + room-type bias ─────────
const LOCATION_GLYPHS={
  dungeon:{floor:"·",wall:"#",corr:"·",water:"~",road:":",stairsU:"<",stairsD:">",voidCh:" "},
  town:{floor:"·",wall:"#",corr:":",water:"~",road:"·",stairsU:"<",stairsD:">",voidCh:" "},
  castle:{floor:"·",wall:"█",corr:"·",water:"~",road:":",stairsU:"<",stairsD:">",voidCh:" "},
  graveyard:{floor:",",wall:"†",corr:",",water:"~",road:",",stairsU:"<",stairsD:">",voidCh:" "},
  swamp:{floor:"·",wall:"≈",corr:"~",water:"░",road:"·",stairsU:"<",stairsD:">",voidCh:" "},
  cave:{floor:".",wall:"#",corr:"·",water:"~",road:"·",stairsU:"<",stairsD:">",voidCh:" "},
  temple:{floor:":",wall:"║",corr:"·",water:"~",road:":",stairsU:"<",stairsD:">",voidCh:" "},
  sewer:{floor:"·",wall:"=",corr:"·",water:"≈",road:"·",stairsU:"<",stairsD:">",voidCh:" "},
  road:{floor:",",wall:"†",corr:",",water:"~",road:":",stairsU:"<",stairsD:">",voidCh:" "},
  volcanic_lair:{floor:".",wall:"*",corr:"·",water:"≈",road:"·",stairsU:"<",stairsD:">",voidCh:" "},
  fey_forest:{floor:",",wall:"#",corr:"'",water:"~",road:",",stairsU:"<",stairsD:">",voidCh:" "},
};

const LOCATION_DESCRIPTIONS={
  dungeon:"Classic stone halls — chambers, crypts, traps",
  town:"Road grid, scattered lots with multiple buildings per block",
  castle:"Thick walls, towers, keep, battlements",
  graveyard:"Open yard, mausoleums, catacombs, gate",
  swamp:"Waterlogged islands connected by bridges",
  cave:"Organic caverns with stalagmites and lakes",
  temple:"Symmetrical sanctuary with pillar colonnades",
  sewer:"Trunk channels, cisterns, smuggler dens",
  road:"Open track between settlements — camps, bridges, and roadside hazards",
  volcanic_lair:"Magma tubes, obsidian bridges, ashen vents and lava lakes",
  fey_forest:"Moss rings, mushroom glades, thorn arches and moonlit pools",
};

const ROOM_LABEL={
  dungeon:"Rooms",
  town:"City blocks",
  castle:"Rooms",
  graveyard:"Structures",
  swamp:"Islands",
  cave:"Caverns",
  temple:"Chambers",
  sewer:"Sections",
  road:"Stops",
  volcanic_lair:"Chambers",
  fey_forest:"Groves",
};

/** Merge into STY[style] for floor/wall/water accents per location. */
const LOCATION_STYLE_OVERRIDE = {
  dungeon:   { wallFg:"#6a6058", floorFg:"#2a2520", doorFg:"#b8900a", roadFg:"#3a3530" },
  cave:      { wallFg:"#9eb0c0", floorFg:"#243540", waterFg:"#2a8aaa", doorFg:"#6ab090" },
  graveyard: { floorFg:"#4a4d52", wallFg:"#5a5d6a", doorFg:"#7a8090", waterFg:"#2a3040" },
  swamp:     { floorFg:"#2a3a1a", waterFg:"#2a5a48", wallFg:"#223218", doorFg:"#3a5a2a", roadFg:"#4a5a40" },
  temple:    { floorFg:"#6a6050", wallFg:"#9a8860", doorFg:"#d4a820", waterFg:"#3a5a8a" },
  sewer:     { floorFg:"#2e4235", waterFg:"#0a5545", wallFg:"#3a4a3a", doorFg:"#5a8060" },
  castle:    { wallFg:"#8a8278", floorFg:"#a89880", doorFg:"#7a5a20", roadFg:"#6a6050" },
  town:      { floorFg:"#7a6a50", wallFg:"#5a4a38", roadFg:"#8a7a5a", doorFg:"#a07020" },
  road:      { floorFg:"#3a4a30", wallFg:"#2a3828", waterFg:"#1a4060", doorFg:"#a87830", roadFg:"#4a5838" },
  volcano:   { floorFg:"#6a2010", waterFg:"#cc3300", wallFg:"#4a1808", doorFg:"#aa4400" },
  feyforest: { floorFg:"#1a4a20", wallFg:"#0a2a10", waterFg:"#1a6a4a", doorFg:"#8844cc" },
  // Keep canonical internal keys mapped too.
  volcanic_lair: { floorFg:"#6a2010", waterFg:"#cc3300", wallFg:"#4a1808", doorFg:"#aa4400" },
  fey_forest: { floorFg:"#1a4a20", wallFg:"#0a2a10", waterFg:"#1a6a4a", doorFg:"#8844cc" },
};

function applyLocationSpecialFeatures(grid,rooms,locationType,rng,W,H){
  if(locationType==="cave"){
    for(let y=1;y<H-1;y++){
      for(let x=1;x<W-1;x++){
        if(grid[y][x]===T.F&&rng()<0.04) grid[y][x]=T.P;
      }
    }
  }
  if(locationType==="swamp"){
    for(let y=1;y<H-1;y++){
      for(let x=1;x<W-1;x++){
        if(grid[y][x]!==T.F) continue;
        const adj=[[0,1],[0,-1],[1,0],[-1,0]].filter(([dy,dx])=>grid[y+dy]?.[x+dx]===T.WA).length;
        if(adj>=4&&rng()<0.02) grid[y][x]=T.WA;
      }
    }
  }
  if(locationType==="sewer"){
    for(let y=1;y<H-1;y++){
      for(let x=1;x<W-1;x++){
        if(grid[y][x]===T.C&&rng()<0.25) grid[y][x]=T.WA;
      }
    }
  }
  if(locationType==="temple"){
    for(const rm of rooms){
      if(rm.w>=8&&rm.h>=6&&rng()<0.7){
        const px1=rm.x+2,px2=rm.x+rm.w-3;
        const py=rm.y+Math.floor(rm.h/2);
        if(grid[py]?.[px1]===T.F) grid[py][px1]=T.P;
        if(grid[py]?.[px2]===T.F) grid[py][px2]=T.P;
      }
    }
  }
  if(locationType==="castle"){
    const battleRow=4;
    for(let x=battleRow;x<W-battleRow;x+=4){
      if(grid[battleRow]?.[x]===T.F) grid[battleRow][x]=T.P;
      if(grid[H-battleRow-1]?.[x]===T.F) grid[H-battleRow-1][x]=T.P;
    }
    for(let y=battleRow;y<H-battleRow;y+=4){
      if(grid[y]?.[battleRow]===T.F) grid[y][battleRow]=T.P;
      if(grid[y]?.[W-battleRow-1]===T.F) grid[y][W-battleRow-1]=T.P;
    }
  }
  if(locationType==="volcanic_lair"){
    for(let y=1;y<H-1;y++){
      for(let x=1;x<W-1;x++){
        if(grid[y][x]===T.F&&rng()<0.045) grid[y][x]=T.WA;
        if(grid[y][x]===T.F&&rng()<0.035) grid[y][x]=T.P;
      }
    }
    for(let y=1;y<H-1;y++){
      for(let x=1;x<W-1;x++){
        if(grid[y][x]===T.WA&&rng()<0.52) grid[y][x]=T.LAVA;
      }
    }
  }
  if(locationType==="fey_forest"){
    for(let y=1;y<H-1;y++){
      for(let x=1;x<W-1;x++){
        if(grid[y][x]===T.F&&rng()<0.05) grid[y][x]=T.P;
      }
    }
  }
  placeNarrowWaterBridges(grid,locationType,rng,W,H);
}

/** Convert narrow water crossings into bridges where it reads as a plank span (skip graveyards / towns). */
function placeNarrowWaterBridges(grid,locationType,rng,W,H){
  if(locationType==="graveyard"||locationType==="town") return;
  const ok=["swamp","sewer","volcanic_lair","road","fey_forest","cave","dungeon","castle","temple"];
  if(!ok.includes(locationType)) return;
  for(let y=1;y<H-1;y++){
    for(let x=1;x<W-1;x++){
      if(grid[y][x]!==T.WA) continue;
      const h=grid[y][x-1]===T.F&&grid[y][x+1]===T.F;
      const v=grid[y-1]?.[x]===T.F&&grid[y+1]?.[x]===T.F;
      if((h||v)&&rng()<0.38) grid[y][x]=T.BRIDGE;
    }
  }
}

/** Flavor lever props by doors (DM hint — not a full door machine yet). */
function scatterLeversNearDoors(grid,decoOverlay,W,H,rng){
  const dirs=[[0,-1],[0,1],[-1,0],[1,0]];
  const purposeForDoorFromLever=(dx,dy)=>{
    const towardX=-dx,towardY=-dy;
    let bearing="this doorway";
    if(towardY<0)bearing="the door to the north";
    else if(towardY>0)bearing="the door to the south";
    else if(towardX<0)bearing="the door to the west";
    else if(towardX>0)bearing="the door to the east";
    const templates=[
      `Controls ${bearing} — latch / bar / winch (DM: when pulled, toggle that door’s open state on the map).`,
      `Wired to ${bearing} — releases a bolt or counterweight (DM: fiction for the adjacent door tile).`,
      `Mechanism for ${bearing} — may also trip a distant portcullis if you want drama (same door line).`,
      `Heavy lever for ${bearing} — obvious “something moves” when used (DM: pair with the marked door).`,
    ];
    return pick(templates,rng);
  };
  for(let y=1;y<H-1;y++){
    for(let x=1;x<W-1;x++){
      if(grid[y][x]!==T.D||rng()>0.14) continue;
      const order=[...dirs].sort(()=>rng()-0.5);
      for(const [dx,dy] of order){
        const nx=x+dx, ny=y+dy;
        if(grid[ny]?.[nx]===T.F){
          const purpose=purposeForDoorFromLever(dx,dy);
          decoOverlay.push({
            x:nx,y:ny,ch:"⚙",fg:"#a62",name:"Lever",roomId:null,decoKey:"lever_icon",
            purpose,
            doorGx:x,doorGy:y,
          });
          break;
        }
      }
    }
  }
}

function pickRoomType(loc,locationType,rng){
  if(loc.usesRoads)return pick(loc.rooms,rng);
  const skew={
    dungeon:["Crypt","Torture Room","Prison Cell","Lair","Treasury","Armory","Laboratory","Chapel","Arena","Arcane Vault","Smuggler Tunnel","Collapsed Hall","Cell Block","Antechamber"],
    swamp:["Bog Pool","Witch Den","Hollow Tree","Sunken Ruin","Ruins","Nest","Fungal Chamber","Serpent Nest","Willow Den"],
    graveyard:["Crypt","Mausoleum","Open Graves","Ossuary","Tomb","Catacomb","Graveyard","Charnel Pit","Bone Yard","Mortuary"],
    sewer:["Overflow","Fungal Chamber","Collapsed Section","Rat Nest","Cistern","Drain Room","Pump Station","Black Market","Grate Shaft"],
    cave:["Crystal Chamber","Underground Lake","Lava Chamber","Dragon Lair","Nest","Shaft","Echo Pit","Ore Vein","Collapsed Tunnel"],
    temple:["Catacombs","Inner Sanctum","Reliquary","Sanctuary","Altar Room","Narthex","Vestry","Lamp Room"],
    castle:["Dungeon Cell","Vault","Armory","Treasury","War Room","Gatehouse","Wine Cellar","Murder Hole","Watchtower"],
    town:["Tavern","Market","Temple","Docks","Warehouse","Guild Hall","Jeweler"],
    volcanic_lair:["Magma Vent","Obsidian Hall","Ash Tomb","Fire Shrine","Ember Pit","Scoria Bridge","Lava Tube","Cinder Nest"],
    fey_forest:["Moss Ring","Mushroom Circle","Thorn Arch","Moon Pool","Hollow Oak","Pixie Dell","Glimmer Grove","Fey Crossing"],
    road:["Wayside Inn","Merchant Camp","Bridge","Crossroads","Watch Post","Bandit Lair","Roadside Shrine"],
  };
  const pref=skew[locationType];
  if(pref&&pref.length&&rng()<0.7){
    const ok=pref.filter((t)=>loc.rooms.includes(t));
    if(ok.length)return pick(ok,rng);
  }
  return pick(loc.rooms,rng);
}

// ── Location Types ───────────────────────────────────────────────────
const LOCATIONS = {
  dungeon: {
    name: "Dungeon", genName: genDungeonName,
    rooms: ["Chamber","Crypt","Prison Cell","Torture Room","Laboratory","Treasury","Guard Room","Armory","Barracks","Storage","Chapel","Lair","Throne Room","Portal Room","Arena","Antechamber","Cell Block","Brewery","Workshop","Collapsed Hall","Smuggler Tunnel","Arcane Vault","Jailer's Office","Midden Pit","Kennel","Gas Room","Flooded Passage","Observation Post","Quiver Alcove"],
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
      "Antechamber":["pillar_f","torch_w","rug","statue","bench","weapon_rack"],
      "Cell Block":["chains","cage","cage","bones","skull","bench","torch_w"],
      "Brewery":["barrel_row","barrel","cauldron","table_h","crate","crate_stack"],
      "Workshop":["anvil","table_lg","weapon_rack","crate","bench","barrel"],
      "Collapsed Hall":["rubble","rubble","bones","pillar_f","web","torch_w"],
      "Smuggler Tunnel":["crate","crate_stack","barrel","chains","chest","torch_w"],
      "Arcane Vault":["crystal","crystal","bookshelf","altar","chest","pillar_f"],
      "Jailer's Office":["table_h","chair","bookshelf","chains","torch_w","crate"],
      "Midden Pit":["bones","bone_heap","splatter","deadbody","rubble","blood_sm"],
      "Kennel":["chains","crate","bones","barrel","bench","torch_w"],
      "Gas Room":["cauldron","barrel","crate","web","bones","blood_sm"],
      "Flooded Passage":["pool","rubble","bones","web","torch_w","pillar_f"],
      "Observation Post":["weapon_rack","bench","torch_w","crate","table_h","banner"],
      "Quiver Alcove":["weapon_rack","crate","barrel","bench","torch_w"],
    },
  },
  town: {
    name: "Town", usesRoads: true, genName: genTownName,
    rooms: ["Tavern","Blacksmith","Market","Temple","House","Town Hall","Stable","Inn","Apothecary","General Store","Barracks","Library","Bakery","Well Square","Guard Tower","Docks","Warehouse","Guild Hall","Jeweler","Butcher","Fletcher","Chantry"],
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
      "Docks":["crate_stack","barrel_row","cart","crate","sign_post","chains"],
      "Warehouse":["crate_stack","crate_stack","barrel_row","crate","barrel","table_h"],
      "Guild Hall":["table_lg","banner","banner","bench","bookshelf","statue"],
      "Jeweler":["table_h","chest","chair","bookshelf","torch_w","crate"],
      "Butcher":["table_h","barrel","crate","barrel_row","sign_post"],
      "Fletcher":["weapon_rack","crate","table_h","barrel","bench"],
      "Chantry":["altar","bench","banner","bookshelf","statue","torch_w"],
    },
  },
  castle: {
    name: "Castle",
    rooms: ["Throne Room","Great Hall","Barracks","Armory","Chapel","Kitchen","Dungeon Cell","Tower Room","Courtyard","Treasury","Library","War Room","Servant Quarters","Gallery","Vault","Gatehouse","Wine Cellar","Pantry","Smithery","Watchtower","Murder Hole","Barbican"],
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
      "Gatehouse":["weapon_rack","bench","torch_w","crate","barrel","table_h"],
      "Wine Cellar":["barrel_row","barrel","barrel","crate","crate_stack"],
      "Pantry":["barrel","crate","table_h","crate_stack","bench"],
      "Smithery":["anvil","forge","weapon_rack","barrel","bench","crate"],
      "Watchtower":["weapon_rack","torch_w","crate","bench","banner"],
      "Murder Hole":["bones","skull","chains","rubble","blood_sm"],
      "Barbican":["weapon_rack","bench","torch_w","banner","crate"],
    },
  },
  graveyard: {
    name: "Graveyard", genName: (r)=>"The "+pick(["Forgotten","Silent","Weeping","Hollow","Cursed","Ancient","Blighted","Restless"],r)+" "+pick(["Cemetery","Graveyard","Burial Ground","Necropolis","Boneyard"],r),
    rooms: ["Graveyard","Mausoleum","Crypt","Open Graves","Chapel","Caretaker Hut","Ossuary","Tomb","Catacomb","Gate House","Charnel Pit","Bone Yard","Iron Gate","Mortuary","Lichyard"],
    decos: {
      "Graveyard":["grave2","grave3","grave3","grave1","deadbody","bones","skull","bush"],
      "Mausoleum":["coffin","coffin","skull","bones","blood_sm","web","statue"],
      "Crypt":["coffin","skeleton","bones","skull","blood_sm","web","rubble"],
      "Open Graves":["grave2","grave2","grave3","deadbody","bones","blood_lg","skull","skeleton"],
      "Chapel":["altar","bench","bench","bookshelf","banner","statue"],
      "Caretaker Hut":["bed","table_h","crate","barrel","torch_w","chair"],
      "Ossuary":["skull","skull","bones","bones","skeleton","skeleton","blood_sm"],
      "Tomb":["coffin","coffin","grave2","statue","blood_sm","chest","web"],
      "Catacomb":["bones","bones","skull","skeleton","web","rubble","blood_sm"],
      "Gate House":["bench","torch_w","weapon_rack","crate","barrel"],
      "Charnel Pit":["bones","bone_heap","skull","splatter","blood_lg","deadbody"],
      "Bone Yard":["bones","bones","skull","grave2","grave3","rubble"],
      "Iron Gate":["iron_gate","chains","bench","torch_w","weapon_rack"],
      "Mortuary":["coffin","table_h","skull","bones","bookshelf","altar"],
      "Lichyard":["grave2","grave3","coffin","web","bones","statue"],
    },
  },
  swamp: {
    name: "Swamp", genName: (r)=>pick(["Blackmire","Rotfen","Boghollow","Murkveil","Grimmarsh","Deadwater","Gloomfen","Mistveil","Dankroot","Witchwater"],r)+" "+pick(["Swamp","Marsh","Bog","Fen","Mire"],r),
    rooms: ["Hut","Clearing","Ruins","Bog Pool","Witch Den","Hollow Tree","Camp","Shrine","Nest","Sunken Ruin","Serpent Nest","Willow Den","Mudslide","Gator Bank"],
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
      "Serpent Nest":["bones","skull","vine","swamp_pool","deadbody","web"],
      "Willow Den":["vine","vine","log","mushroom","swamp_pool","bush"],
      "Mudslide":["rubble","rubble","log","boulder","bones","swamp_pool"],
      "Gator Bank":["log","swamp_pool","bush","bones","mushroom","vine"],
    },
  },
  cave: {
    name: "Cave", genName: (r)=>pick(["Crystal","Shadow","Echo","Deep","Howling","Granite","Obsidian","Dripping","Forgotten","Abyssal"],r)+" "+pick(["Caves","Caverns","Tunnels","Depths","Hollows"],r),
    rooms: ["Cavern","Crystal Chamber","Underground Lake","Nest","Shaft","Tunnel Junction","Mushroom Grove","Mining Camp","Lava Chamber","Dragon Lair","Echo Pit","Ore Vein","Collapsed Tunnel","Fungal Farm","Hidden Grotto"],
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
      "Echo Pit":["stalagmite","boulder","rubble","pool","bones","torch_w"],
      "Ore Vein":["crystal","crate","weapon_rack","barrel","rubble","stalagmite"],
      "Collapsed Tunnel":["rubble","rubble","bones","web","crate","boulder"],
      "Fungal Farm":["mushroom","mushroom","mushroom","log","vine","pool"],
      "Hidden Grotto":["pool","crystal","mushroom","stalagmite","bones","vine"],
    },
  },
  temple: {
    name: "Temple", genName: (r)=>"Temple of "+pick(["the Sun","the Moon","Shadow","Light","the Forgotten","the Eternal","the Void","the Radiant","the Storm","the Deep"],r),
    rooms: ["Sanctuary","Altar Room","Library","Meditation","Reliquary","Cloister","Scriptorium","Bell Tower","Catacombs","Inner Sanctum","Narthex","Vestry","Lamp Room","Pilgrim Dorms","Offering Hall"],
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
      "Narthex":["bench","bench","pillar_f","banner","fountain","torch_w"],
      "Vestry":["bookshelf","table_h","chest","altar","chair","torch_w"],
      "Lamp Room":["torch_w","torch_w","bench","table_h","rug","bookshelf"],
      "Pilgrim Dorms":["bed","bed","bench","crate","barrel","table_h"],
      "Offering Hall":["altar","altar","rug","statue","banner","pillar_f"],
    },
  },
  sewer: {
    name: "Sewer", genName: (r)=>pick(["The Undercity","The Depths Below","The Ratways","The Drains","The Dark Below","The Cisterns","The Warrens","The Gutters"],r),
    rooms: ["Junction","Drain Room","Cistern","Smuggler Den","Rat Nest","Overflow","Fungal Chamber","Collapsed Section","Hideout","Outflow","Pump Station","Grate Shaft","Black Market","Sluice Gate","Bone Sump"],
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
      "Pump Station":["crate","barrel","chains","pool","rubble","torch_w"],
      "Grate Shaft":["chains","rubble","web","bones","pool","pillar_f"],
      "Black Market":["chest","table_h","crate_stack","barrel","torch_w","rug"],
      "Sluice Gate":["iron_gate","pool","rubble","chains","torch_w"],
      "Bone Sump":["bones","bone_heap","skull","pool","rubble","deadbody"],
    },
  },
  road: {
    name: "Wilderness Road",
    genName: (r)=>pick(["The Old","The King's","The Pilgrim","The Coast","The Highland"],r)+" "+pick(["Road","Track","Way","March"],r),
    rooms: ["Wayside Inn","Merchant Camp","Bridge","Crossroads","Watch Post","Ruined Tower","Roadside Shrine","Bandit Lair","Ferry Landing","Toll Station"],
    decos: {
      "Wayside Inn":["bed","table_h","bench","barrel","crate","torch_w","sign_post"],
      "Merchant Camp":["cart","stall","crate","chest","rug","bench"],
      "Bridge":["rubble","crate","sign_post"],
      "Crossroads":["sign_post","bench","well","cart"],
      "Watch Post":["weapon_rack","barrel","bench","torch_w"],
      "Ruined Tower":["rubble","pillar_f","bones","web"],
      "Roadside Shrine":["altar","bench","statue","bones"],
      "Bandit Lair":["chest","cage","chains","deadbody","crate"],
      "Ferry Landing":["barrel","crate","sign_post"],
      "Toll Station":["crate","iron_gate","sign_post","chest"],
    },
  },
  volcanic_lair: {
    name: "Volcanic Lair",
    genName: (r)=>pick(["Obsidian","Ashen","Cinder","Scoria","Magma","Ember","Pyre"],r)+" "+pick(["Caldera","Lair","Pit","Caverns","Depths","Chamber","Rift"],r),
    rooms: ["Magma Vent","Obsidian Hall","Ash Tomb","Fire Shrine","Ember Pit","Scoria Bridge","Lava Tube","Cinder Nest","Basalt Gallery","Sulfur Cave","Glass Lake","Forge Depths"],
    decos: {
      "Magma Vent":["cauldron","boulder","stalagmite","rubble","skull","bones"],
      "Obsidian Hall":["crystal","pillar_f","rubble","boulder","torch_w","statue"],
      "Ash Tomb":["coffin","bones","skull","rubble","web","blood_sm"],
      "Fire Shrine":["altar","altar","banner","torch_w","statue","rug"],
      "Ember Pit":["campfire","bones","rubble","boulder","skull","splatter"],
      "Scoria Bridge":["rubble","boulder","stalagmite","chains","pillar_f"],
      "Lava Tube":["stalagmite","boulder","rubble","pool","bones","web"],
      "Cinder Nest":["bones","splatter","skull","rubble","deadbody","blood_lg"],
      "Basalt Gallery":["pillar_f","pillar_f","statue","rubble","torch_w","banner"],
      "Sulfur Cave":["pool","mushroom","rubble","bones","vine","stalagmite"],
      "Glass Lake":["pool","crystal","crystal","rubble","stalagmite"],
      "Forge Depths":["anvil","forge","crate","weapon_rack","barrel","bench"],
    },
  },
  fey_forest: {
    name: "Fey Forest",
    genName: (r)=>pick(["Moonwhisper","Thornglass","Elder","Glimmer","Whisper","Silverbark"],r)+" "+pick(["Grove","Glade","Ring","Moot","Thicket","Canopy","Hollow"],r),
    rooms: ["Moss Ring","Mushroom Circle","Thorn Arch","Moon Pool","Hollow Oak","Pixie Dell","Glimmer Grove","Fey Crossing","Root Maze","Willow Walk","Fungal Vale","Dreamspring"],
    decos: {
      "Moss Ring":["mushroom","vine","vine","bush","log","pool"],
      "Mushroom Circle":["mushroom","mushroom","mushroom","mushroom","log","vine"],
      "Thorn Arch":["vine","vine","web","bush","statue","altar"],
      "Moon Pool":["pool","pool","mushroom","vine","log","fountain"],
      "Hollow Oak":["tree","log","mushroom","vine","bones","web"],
      "Pixie Dell":["mushroom","bush","campfire","log","sign_post","bench"],
      "Glimmer Grove":["crystal","mushroom","vine","pool","tree","bush"],
      "Fey Crossing":["log","bush","sign_post","bench","well","fountain"],
      "Root Maze":["vine","vine","log","rubble","mushroom","web"],
      "Willow Walk":["tree","bush","pool","vine","bench","log"],
      "Fungal Vale":["mushroom","mushroom","swamp_pool","log","vine","bones"],
      "Dreamspring":["fountain","pool","altar","statue","mushroom","crystal"],
    },
  },
};

function getCR(lv){if(lv<=2)return 1;if(lv<=4)return 3;if(lv<=6)return 5;if(lv<=8)return 7;if(lv<=10)return 9;if(lv<=12)return 11;if(lv<=14)return 13;if(lv<=16)return 15;if(lv<=18)return 17;return 20;}

function clamp(n,min,max){return Math.max(min,Math.min(max,n));}

function findRoomAt(rooms,x,y){
  return rooms.find(r=>x>=r.x&&x<r.x+r.w&&y>=r.y&&y<r.y+r.h) || null;
}

function nearestRoom(rooms,x,y){
  if(!rooms.length) return null;
  let best=rooms[0], bd=Infinity;
  for(const r of rooms){
    const d=Math.abs(r.cx-x)+Math.abs(r.cy-y);
    if(d<bd){bd=d;best=r;}
  }
  return best;
}

function pickFloorCellInRoom(grid,rm,rng){
  // For organic rooms (caves) the bounding box may include void tiles.
  for(let i=0;i<40;i++){
    const x=rI(rm.x,rm.x+rm.w-1,rng);
    const y=rI(rm.y,rm.y+rm.h-1,rng);
    const t=grid[y]?.[x];
    if(t===T.F||t===T.C||t===T.WA||t===T.ROAD||t===T.BRIDGE||t===T.LAVA) return {x,y};
  }
  return {x:Math.floor(rm.x+rm.w/2), y:Math.floor(rm.y+rm.h/2)};
}

function placeStairsOnGrid({grid,rooms,stairUp,stairDown,stairUpTo,stairDownTo,rng}){
  if(stairUp){
    const rm=findRoomAt(rooms,stairUp.x,stairUp.y) || nearestRoom(rooms,stairUp.x,stairUp.y);
    if(rm){
      const minX=rm.x+1, maxX=rm.x+rm.w-2;
      const minY=rm.y+1, maxY=rm.y+rm.h-2;
      let sx=clamp(stairUp.x, minX, maxX);
      let sy=clamp(stairUp.y, minY, maxY);
      const ok=t=>t===T.F||t===T.C||t===T.WA||t===T.ROAD||t===T.BRIDGE||t===T.LAVA;
      if(!ok(grid[sy]?.[sx])){
        const p=pickFloorCellInRoom(grid,rm,rng); sx=p.x; sy=p.y;
      }
      grid[sy][sx]=T.SU;
      rm.stairUpTo=stairUpTo;
    }
  }
  if(stairDown){
    const rm=findRoomAt(rooms,stairDown.x,stairDown.y) || nearestRoom(rooms,stairDown.x,stairDown.y);
    if(rm){
      const minX=rm.x+1, maxX=rm.x+rm.w-2;
      const minY=rm.y+1, maxY=rm.y+rm.h-2;
      let sx=clamp(stairDown.x, minX, maxX);
      let sy=clamp(stairDown.y, minY, maxY);
      const ok=t=>t===T.F||t===T.C||t===T.WA||t===T.ROAD||t===T.BRIDGE||t===T.LAVA;
      if(!ok(grid[sy]?.[sx])){
        const p=pickFloorCellInRoom(grid,rm,rng); sx=p.x; sy=p.y;
      }
      grid[sy][sx]=T.SD;
      rm.stairDownTo=stairDownTo;
    }
  }
}

function rectsOverlapPad(a,b,gap){
  return !(a.x+a.w+gap<=b.x||b.x+b.w+gap<=a.x||a.y+a.h+gap<=b.y||b.y+b.h+gap<=a.y);
}

/** 1–3 non-overlapping building footprints inside a town lot (leaves yard = open floor). */
function layoutTownBuildingsInLot(lot,n,rng){
  const {rx,ry,rw,rh}=lot;
  const rects=[];
  const gap=1;
  const cap=rw>=12&&rh>=10?3:rw>=9&&rh>=8?2:1;
  const target=Math.min(n,cap,rI(1,Math.min(cap,n),rng));
  let tries=0;
  while(rects.length<target&&tries<target*140){
    tries++;
    const maxBw=Math.min(11,Math.max(4,Math.floor(rw/2)-gap));
    const maxBh=Math.min(9,Math.max(3,Math.floor(rh/2)-gap));
    const brw=rI(4,maxBw,rng);
    const brh=rI(3,maxBh,rng);
    const bxMin=rx+1;
    const bxMax=rx+rw-brw-2;
    const byMin=ry+1;
    const byMax=ry+rh-brh-2;
    if(bxMax<bxMin||byMax<byMin) break;
    const bx=rI(bxMin,bxMax,rng);
    const by=rI(byMin,byMax,rng);
    const cand={x:bx,y:by,w:brw,h:brh};
    if(rects.some((r)=>rectsOverlapPad(cand,r,gap))) continue;
    rects.push(cand);
  }
  if(rects.length===0&&rw>=5&&rh>=5){
    const brw=Math.max(4,Math.min(rw-4,Math.floor(rw*0.52)));
    const brh=Math.max(3,Math.min(rh-4,Math.floor(rh*0.52)));
    const bx=rx+Math.max(1,Math.floor((rw-brw)/2));
    const by=ry+Math.max(1,Math.floor((rh-brh)/2));
    rects.push({x:bx,y:by,w:brw,h:brh});
  }
  return rects;
}

function placeTownDoorOnBuilding(grid,rx,ry,rw,rh,W,H,rng){
  const cands=[];
  const tryWall=(wx,wy)=>{
    if(grid[wy]?.[wx]!==T.W) return;
    for(const[dy,dx] of [[-1,0],[1,0],[0,-1],[0,1]]){
      const ny=wy+dy,nx=wx+dx;
      if(ny>=0&&ny<H&&nx>=0&&nx<W&&grid[ny][nx]===T.ROAD){ cands.push({x:wx,y:wy}); return; }
    }
  };
  for(let x=rx;x<rx+rw;x++){ tryWall(x,ry-1); tryWall(x,ry+rh); }
  for(let y=ry;y<ry+rh;y++){ tryWall(rx-1,y); tryWall(rx+rw,y); }
  if(cands.length){
    const p=pick(cands,rng);
    grid[p.y][p.x]=T.D;
    return;
  }
  const mx=rx+Math.floor(rw/2), my=ry+Math.floor(rh/2);
  if(grid[ry+rh]?.[mx]===T.W) grid[ry+rh][mx]=T.D;
  else if(grid[ry-1]?.[mx]===T.W) grid[ry-1][mx]=T.D;
  else if(grid[my]?.[rx+rw]===T.W) grid[my][rx+rw]=T.D;
  else if(grid[my]?.[rx-1]===T.W) grid[my][rx-1]=T.D;
}

function stampTownBuilding(grid,rect,W,H,rng){
  const rx=rect.x, ry=rect.y, rw=rect.w, rh=rect.h;
  for(let y=ry;y<ry+rh;y++) for(let x=rx;x<rx+rw;x++){
    if(y>=0&&y<H&&x>=0&&x<W) grid[y][x]=T.F;
  }
  for(let y=ry-1;y<=ry+rh;y++){
    for(let x=rx-1;x<=rx+rw;x++){
      if(y>=0&&y<H&&x>=0&&x<W && grid[y][x]===T.F) grid[y][x]=T.W;
    }
  }
  for(let y=ry;y<ry+rh;y++) for(let x=rx;x<rx+rw;x++){
    if(y>=0&&y<H&&x>=0&&x<W) grid[y][x]=T.F;
  }
  placeTownDoorOnBuilding(grid,rx,ry,rw,rh,W,H,rng);
}

function generateTownLayout(cfg,rng){
  const {width:W,height:H,roomCount}=cfg;
  const grid=Array.from({length:H},()=>Array(W).fill(T.V));
  const rooms=[];
  const ROAD_W=3,BLOCK=16,STRIDE=ROAD_W+BLOCK;
  const vX=[],hY=[];
  for(let x=0;x+ROAD_W<=W;x+=STRIDE) vX.push(x);
  for(let y=0;y+ROAD_W<=H;y+=STRIDE) hY.push(y);
  for(const rx of vX) for(let y=0;y<H;y++) for(let d=0;d<ROAD_W;d++) grid[y][rx+d]=T.ROAD;
  for(const ry of hY) for(let x=0;x<W;x++) for(let d=0;d<ROAD_W;d++) grid[ry+d][x]=T.ROAD;

  const blocks=[];
  const cxIdx=(vX.length-1)/2, cyIdx=(hY.length-1)/2;
  for(let ci=0;ci<vX.length-1;ci++){
    for(let ri=0;ri<hY.length-1;ri++){
      const bx=vX[ci]+ROAD_W, by=hY[ri]+ROAD_W;
      const bw=(vX[ci+1]??W)-bx, bh=(hY[ri+1]??H)-by;
      if(bw<5||bh<5) continue;
      const rx=bx+1, ry=by+1, rw=bw-2, rh=bh-2;
      if(rw<5||rh<5) continue;
      const dist=Math.abs(ci-cxIdx)+Math.abs(ri-cyIdx);
      blocks.push({rx,ry,rw,rh,dist});
    }
  }
  blocks.sort((a,b)=>a.dist-b.dist);

  for(const b of blocks){
    for(let y=b.ry;y<b.ry+b.rh;y++) for(let x=b.rx;x<b.rx+b.rw;x++){
      if(y>=0&&y<H&&x>=0&&x<W) grid[y][x]=T.F;
    }
  }

  const typeQ=['Well Square','Tavern','Blacksmith','Market','Temple','Town Hall','Stable','Inn','Apothecary','General Store','Barracks','Library','Bakery','Guard Tower','House'];
  let ti=0;
  for(const b of blocks){
    if(rooms.length>=roomCount) break;
    const remaining=roomCount-rooms.length;
    const want=Math.min(remaining,rI(1,Math.min(3,remaining),rng));
    const sub=layoutTownBuildingsInLot(b,want,rng);
    for(const rect of sub){
      if(rooms.length>=roomCount) break;
      stampTownBuilding(grid,rect,W,H,rng);
      const roomType=typeQ[ti%typeQ.length];
      ti++;
      const label=roomType==='Tavern'?genTavernName(rng):roomType;
      rooms.push({
        id:rooms.length+1,
        x:rect.x,y:rect.y,w:rect.w,h:rect.h,
        cx:Math.floor(rect.x+rect.w/2),cy:Math.floor(rect.y+rect.h/2),
        type:roomType,label,
      });
    }
  }
  if(rooms.length===0&&blocks[0]){
    const b=blocks[0];
    const rect={x:b.rx+2,y:b.ry+2,w:Math.max(4,b.rw-4),h:Math.max(3,b.rh-4)};
    stampTownBuilding(grid,rect,W,H,rng);
    rooms.push({id:1,x:rect.x,y:rect.y,w:rect.w,h:rect.h,cx:Math.floor(rect.x+rect.w/2),cy:Math.floor(rect.y+rect.h/2),type:'Well Square',label:'Well Square'});
  }
  return {grid,rooms};
}

function placeOrganicRoom(grid,cx,cy,minR,maxR,W,H,rng){
  const cells=[];
  const bf=Math.ceil(maxR)+2;
  for(let dy=-bf;dy<=bf;dy++){
    for(let dx=-bf;dx<=bf;dx++){
      const nx=cx+dx, ny=cy+dy;
      if(nx<=1||nx>=W-2||ny<=1||ny>=H-2) continue;
      const d=Math.sqrt(dx*dx+dy*dy);
      const wobble=(rng()-0.5)*1.8;
      const thresh=minR+rng()*(maxR-minR)+wobble;
      if(d<=thresh){
        if(grid[ny][nx]!==T.F){
          grid[ny][nx]=T.F;
          cells.push({x:nx,y:ny});
        }
      }
    }
  }
  if(!cells.length) return null;
  const xs=cells.map(c=>c.x), ys=cells.map(c=>c.y);
  const x=Math.min(...xs), y=Math.min(...ys);
  const w=Math.max(...xs)-x+1, h=Math.max(...ys)-y+1;
  return {x,y,w,h,cx,cy};
}

function placeWaterBlob(grid,cx,cy,rng){
  const radius=rI(2,4,rng);
  const bf=radius+3;
  const H=grid.length, W=grid[0].length;
  for(let dy=-bf;dy<=bf;dy++){
    for(let dx=-bf;dx<=bf;dx++){
      const nx=cx+dx, ny=cy+dy;
      if(ny<1||ny>=H-1||nx<1||nx>=W-1) continue;
      const d=Math.sqrt(dx*dx+dy*dy);
      const thresh=radius+(rng()-0.5)*1.2;
      if(d<=thresh && grid[ny][nx]===T.F) grid[ny][nx]=T.WA;
    }
  }
}

function carveWindingCorridor(grid,a,b,W,H,rng,widthTiles){
  let x=a.cx,y=a.cy;
  const tx=b.cx, ty=b.cy;
  const maxSteps=W*H;
  const rad=Math.max(0,Math.floor(widthTiles-1)); // width=2 => rad=1 => 3x3 brush
  for(let steps=0;steps<maxSteps;steps++){
    const dx=tx-x, dy=ty-y;
    if(Math.abs(dx)+Math.abs(dy)<=1) break;
    const preferX=Math.abs(dx)>=Math.abs(dy);
    let sx=0, sy=0;
    if(preferX){
      sx=dx===0?0:(dx>0?1:-1);
      sy=rng()<0.25 ? (dy>0?1:-1) : 0;
    }else{
      sy=dy===0?0:(dy>0?1:-1);
      sx=rng()<0.25 ? (dx>0?1:-1) : 0;
    }
    x=clamp(x+sx,1,W-2); y=clamp(y+sy,1,H-2);
    for(let oy=-rad;oy<=rad;oy++){
      for(let ox=-rad;ox<=rad;ox++){
        const nx=x+ox, ny=y+oy;
        if(ny<0||ny>=H||nx<0||nx>=W) continue;
        const t=grid[ny][nx];
        if(t===T.V || t===T.W || t===T.F) grid[ny][nx]=T.C;
      }
    }
  }
}

function generateCaveLayout(cfg,rng){
  const {width:W,height:H,roomCount,locationType}=cfg;
  const grid=Array.from({length:H},()=>Array(W).fill(T.V));
  const rooms=[];
  const centers=[];
  const minR=3,maxR=7;

  let att=0;
  while(rooms.length<roomCount && att<roomCount*200){
    att++;
    const cx=rI(4,W-5,rng), cy=rI(4,H-5,rng);
    let ok=true;
    for(const c of centers){
      const d=Math.abs(c.x-cx)+Math.abs(c.y-cy);
      if(d<minR*2){ok=false;break;}
    }
    if(!ok) continue;
    const rm=placeOrganicRoom(grid,cx,cy,minR,maxR,W,H,rng);
    if(!rm) continue;
    const locBlock=locationType==="volcanic_lair"?LOCATIONS.volcanic_lair:locationType==="fey_forest"?LOCATIONS.fey_forest:LOCATIONS.cave;
    const roomType=pickRoomType(locBlock,locationType,rng);
    rooms.push({id:rooms.length+1,x:rm.x,y:rm.y,w:rm.w,h:rm.h,cx:rm.cx,cy:rm.cy,type:roomType,label:roomType});
    centers.push({x:cx,y:cy});
    const wantsLakeBlob=locationType==="cave"&&(roomType==="Underground Lake"||roomType==="Crystal Chamber");
    const wantsVolcBlob=locationType==="volcanic_lair"&&(roomType==="Lava Tube"||roomType==="Glass Lake"||roomType==="Magma Vent");
    const wantsFeyBlob=locationType==="fey_forest"&&(roomType==="Moon Pool"||roomType==="Dreamspring"||roomType==="Glimmer Grove");
    if(wantsLakeBlob||wantsVolcBlob||wantsFeyBlob) placeWaterBlob(grid,cx,cy,rng);
  }

  if(rooms.length>1){
    const conn=new Set([0]);const unconn=new Set(rooms.map((_,i)=>i).filter(i=>i>0));
    while(unconn.size>0){
      let bd=Infinity,ba=-1,bb=-1;
      for(const a of conn)for(const b of unconn){
        const d=Math.abs(rooms[a].cx-rooms[b].cx)+Math.abs(rooms[a].cy-rooms[b].cy);
        if(d<bd){bd=d;ba=a;bb=b;}
      }
      if(ba<0) break;
      carveWindingCorridor(grid,rooms[ba],rooms[bb],W,H,rng,2);
      conn.add(bb);unconn.delete(bb);
    }
  }

  // Ring floors so void becomes walls.
  for(let y=0;y<H;y++){
    for(let x=0;x<W;x++){
      const t=grid[y][x];
      if(t!==T.F && t!==T.C && t!==T.WA) continue;
      for(const[dy,dx] of [[-1,0],[1,0],[0,-1],[0,1]]){
        const ny=y+dy,nx=x+dx;
        if(ny>=0&&ny<H&&nx>=0&&nx<W && grid[ny][nx]===T.V) grid[ny][nx]=T.W;
      }
    }
  }
  return {grid,rooms};
}

function generateGraveyardLayout(cfg,rng){
  const {width:W,height:H,roomCount,locationType}=cfg;
  const grid=Array.from({length:H},()=>Array(W).fill(T.V));
  const rooms=[];
  // Open yard (interior floor), fenced borders.
  for(let y=0;y<H;y++){
    for(let x=0;x<W;x++){
      if(x===0||x===W-1||y===0||y===H-1) grid[y][x]=T.W;
      else grid[y][x]=T.F;
    }
  }
  // Entrance gate (2 tiles) on south perimeter wall.
  const gcx=Math.floor(W/2);
  grid[H-1][gcx]=T.D;
  if(gcx+1<W) grid[H-1][gcx+1]=T.D;

  const mausMinR=7, mausMaxR=12;
  const mausMinH=5, mausMaxH=9;
  let att=0;
  while(rooms.length<roomCount && att<roomCount*140){
    att++;
    const rw=rI(mausMinR,mausMaxR,rng);
    const rh=rI(mausMinH,mausMaxH,rng);
    const rx=rI(2,W-rw-3,rng), ry=rI(2,H-rh-3,rng);
    let overlap=false;
    for(const r of rooms){
      if(rx<r.x+r.w+2&&rx+rw+2>r.x&&ry<r.y+r.h+2&&ry+rh+2>r.y){overlap=true;break;}
    }
    if(overlap) continue;

    const roomType=pickRoomType(LOCATIONS.graveyard,locationType,rng);
    const room={id:rooms.length+1,x:rx,y:ry,w:rw,h:rh,cx:Math.floor(rx+rw/2),cy:Math.floor(ry+rh/2),type:roomType,label:roomType};
    rooms.push(room);

    // Ring mausoleum walls around interior.
    for(let y=ry;y<ry+rh;y++) for(let x=rx;x<rx+rw;x++) grid[y][x]=T.F;
    for(let y=ry-1;y<=ry+rh;y++){
      for(let x=rx-1;x<=rx+rw;x++){
        if(y>=0&&y<H&&x>=0&&x<W && grid[y][x]===T.F) grid[y][x]=T.W;
      }
    }
    // Restore interior after ring.
    for(let y=ry;y<ry+rh;y++) for(let x=rx;x<rx+rw;x++) grid[y][x]=T.F;

    // Door on one wall side, facing the yard.
    const sides=["N","S","W","E"];
    const s=pick(sides,rng);
    const dX=rx+Math.floor(rw/2), dY=ry+Math.floor(rh/2);
    if(s==="N" && grid[ry-1]?.[dX]===T.W) grid[ry-1][dX]=T.D;
    if(s==="S" && grid[ry+rh]?.[dX]===T.W) grid[ry+rh][dX]=T.D;
    if(s==="W" && grid[dY]?.[rx-1]===T.W) grid[dY][rx-1]=T.D;
    if(s==="E" && grid[dY]?.[rx+rw]===T.W) grid[dY][rx+rw]=T.D;
  }

  // Graveyard is open yard: no carved corridors. The T.F interior connects every
  // mausoleum door to the south gate directly. (Corridor tiles would read as dark "roads".)

  return {grid,rooms};
}

function generateCastleLayout(cfg,rng){
  const {width:W,height:H,roomCount}=cfg;
  const grid=Array.from({length:H},()=>Array(W).fill(T.V));
  const rooms=[];
  const WALL=3;
  // Outer thick wall; inner courtyard.
  for(let y=0;y<H;y++){
    for(let x=0;x<W;x++){
      if(x<WALL||x>=W-WALL||y<WALL||y>=H-WALL) grid[y][x]=T.W;
      else grid[y][x]=T.F;
    }
  }
  // South gate opening (5 tiles).
  const gX=Math.floor(W/2)-2;
  for(let dx=0;dx<5;dx++){
    for(let dy=0;dy<WALL;dy++){
      const yy=H-WALL+dy;
      grid[yy][gX+dx]=T.D;
    }
  }

  const addRoom=(rx,ry,rw,rh,type,label)=>{
    for(let y=ry;y<ry+rh;y++) for(let x=rx;x<rx+rw;x++) grid[y][x]=T.F;
    for(let y=ry-1;y<=ry+rh;y++){
      for(let x=rx-1;x<=rx+rw;x++){
        if(y>=0&&y<H&&x>=0&&x<W) grid[y][x]=T.W;
      }
    }
    // Restore interior.
    for(let y=ry;y<ry+rh;y++) for(let x=rx;x<rx+rw;x++) grid[y][x]=T.F;
    rooms.push({id:rooms.length+1,x:rx,y:ry,w:rw,h:rh,cx:Math.floor(rx+rw/2),cy:Math.floor(ry+rh/2),type,label:label||type});
  };

  // Corner towers.
  addRoom(WALL,WALL,5,5,'Tower Room','NW Tower');
  addRoom(W-WALL-5,WALL,5,5,'Tower Room','NE Tower');
  addRoom(WALL,H-WALL-5,5,5,'Tower Room','SW Tower');
  addRoom(W-WALL-5,H-WALL-5,5,5,'Tower Room','SE Tower');

  // Gatehouse.
  addRoom(Math.floor(W/2)-4,H-WALL-7,9,6,'Guard Room','Gatehouse');
  // Keep.
  addRoom(Math.floor(W/2)-7,Math.floor(H/2)-5,14,10,'Throne Room','The Keep');

  // Side rooms in wings.
  const sideTypes=['Armory','Chapel','Kitchen','Barracks','Library','War Room','Servant Quarters','Gallery','Vault'];
  let placed=rooms.length;
  let att=0;
  while(placed<Math.max(roomCount,rooms.length) && att<roomCount*180){
    att++;
    const wing=rng()<0.5?'L':'R';
    const rw=rI(6,10,rng), rh=rI(5,8,rng);
    const rx=wing==='L'
      ? rI(WALL+1,Math.floor(W/2)-rw-2,rng)
      : rI(Math.floor(W/2)+2,W-WALL-rw-1,rng);
    const ry=rI(WALL+1,H-WALL-rh-3,rng);
    let overlap=false;
    for(const r of rooms){
      if(rx<r.x+r.w+2&&rx+rw+2>r.x&&ry<r.y+r.h+2&&ry+rh+2>r.y){overlap=true;break;}
    }
    if(overlap) continue;
    const type=pick(sideTypes,rng);
    addRoom(rx,ry,rw,rh,type,type);
    placed++;
  }

  // Connect rooms with corridors.
  if(rooms.length>1){
    const conn=new Set([0]);const unconn=new Set(rooms.map((_,i)=>i).filter(i=>i>0));
    while(unconn.size>0){
      let bd=Infinity,ba=-1,bb=-1;
      for(const a of conn)for(const b of unconn){
        const d=Math.abs(rooms[a].cx-rooms[b].cx)+Math.abs(rooms[a].cy-rooms[b].cy);
        if(d<bd){bd=d;ba=a;bb=b;}
      }
      if(ba<0) break;
      carvePath(grid,rooms[ba],rooms[bb],W,H,rng,false);
      conn.add(bb);unconn.delete(bb);
    }
  }

  return {grid,rooms};
}

function generateSewerLayout(cfg,rng){
  const {width:W,height:H,roomCount,locationType}=cfg;
  const grid=Array.from({length:H},()=>Array(W).fill(T.V));
  const rooms=[];
  const hTrunks=[
    Math.max(2,Math.min(H-3,Math.floor(H/3 + (rng()-0.5)*H*0.08))),
    Math.max(2,Math.min(H-3,Math.floor(2*H/3 + (rng()-0.5)*H*0.08))),
  ];
  const vTrunks=[
    Math.max(2,Math.min(W-3,Math.floor(W/4 + (rng()-0.5)*W*0.08))),
    Math.max(2,Math.min(W-3,Math.floor(W/2 + (rng()-0.5)*W*0.08))),
    Math.max(2,Math.min(W-3,Math.floor(3*W/4 + (rng()-0.5)*W*0.08))),
  ];

  // Trunks: top walkway (F), center channel (WA), bottom walkway (F).
  for(const ty of hTrunks){
    for(let x=2;x<W-2;x++){
      grid[ty-1][x]=T.F;
      grid[ty][x]=T.WA;
      grid[ty+1][x]=T.F;
    }
  }
  for(const tx of vTrunks){
    for(let y=2;y<H-2;y++){
      grid[y][tx-1]=T.F;
      grid[y][tx]=T.WA;
      grid[y][tx+1]=T.F;
    }
  }
  for(let i=0;i<rI(2,3,rng);i++){
    const a={cx:pick(vTrunks,rng),cy:pick(hTrunks,rng)};
    const b={cx:Math.max(2,Math.min(W-3,pick(vTrunks,rng)+rI(-3,3,rng))),cy:Math.max(2,Math.min(H-3,pick(hTrunks,rng)+rI(-2,2,rng)))};
    carveWindingCorridor(grid,a,b,W,H,rng,1);
  }

  // Junction rooms 8x8 at intersections (use floor, not water in center).
  const junctions=[];
  for(const ty of hTrunks) for(const tx of vTrunks) junctions.push({tx,ty});
  junctions.sort((a,b)=>Math.abs(a.tx-W/2)+Math.abs(a.ty-H/2)- (Math.abs(b.tx-W/2)+Math.abs(b.ty-H/2)));
  const maxJ=Math.min(roomCount, junctions.length);
  for(let i=0;i<maxJ;i++){
    const {tx,ty}=junctions[i];
    const rx=tx-4, ry=ty-4;
    if(rx<1||ry<1||rx+8>=W-1||ry+8>=H-1) continue;
    for(let y=ry;y<ry+8;y++) for(let x=rx;x<rx+8;x++) grid[y][x]=T.F;
    rooms.push({id:rooms.length+1,x:rx,y:ry,w:8,h:8,cx:tx,cy:ty,type:"Junction",label:"Junction"});
  }

  // Side rooms.
  const sideTypes=["Cistern","Rat Nest","Smuggler Den","Overflow","Drain Room","Fungal Chamber"];
  let att=0;
  while(rooms.length<roomCount && att<roomCount*220){
    att++;
    const isH=rng()<0.5;
    const roomType=sideTypes[rooms.length%sideTypes.length];
    const rw=8,rh=6;
    if(isH){
      const ty=pick(hTrunks,rng);
      const y=ty + (rng()<0.5 ? -rh-2 : 2);
      const x=rI(2,W-rw-3,rng);
      let overlap=false;
      for(const r of rooms){
        if(x<r.x+r.w+2&&x+rw+2>r.x&&y<r.y+r.h+2&&y+rh+2>r.y){overlap=true;break;}
      }
      if(overlap||y<1||y+rh>=H-1||x<1||x+rw>=W-1) continue;
      for(let yy=y;yy<y+rh;yy++) for(let xx=x;xx<x+rw;xx++) grid[yy][xx]=T.F;
      rooms.push({id:rooms.length+1,x,y,w:rw,h:rh,cx:x+Math.floor(rw/2),cy:y+Math.floor(rh/2),type:roomType,label:roomType});
    }else{
      const tx=pick(vTrunks,rng);
      const x=tx + (rng()<0.5 ? -rw-2 : 2);
      const y=rI(2,H-rh-3,rng);
      let overlap=false;
      for(const r of rooms){
        if(x<r.x+r.w+2&&x+rw+2>r.x&&y<r.y+r.h+2&&y+rh+2>r.y){overlap=true;break;}
      }
      if(overlap||x<1||x+rw>=W-1||y<1||y+rh>=H-1) continue;
      for(let yy=y;yy<y+rh;yy++) for(let xx=x;xx<x+rw;xx++) grid[yy][xx]=T.F;
      rooms.push({id:rooms.length+1,x,y,w:rw,h:rh,cx:x+Math.floor(rw/2),cy:y+Math.floor(rh/2),type:roomType,label:roomType});
    }
  }

  // Wall all void tiles adjacent to floor or water.
  for(let y=1;y<H-1;y++){
    for(let x=1;x<W-1;x++){
      if(grid[y][x]!==T.V) continue;
      for(const[dy,dx] of [[-1,0],[1,0],[0,-1],[0,1]]){
        const t=grid[y+dy][x+dx];
        if(t===T.F || t===T.WA){grid[y][x]=T.W;break;}
      }
    }
  }

  return {grid,rooms};
}

function generateSwampLayout(cfg,rng){
  const {width:W,height:H,roomCount,locationType}=cfg;
  const grid=Array.from({length:H},()=>Array(W).fill(T.WA));
  const rooms=[];

  let att=0;
  while(rooms.length<roomCount && att<roomCount*200){
    att++;
    const rw=rI(7,14,rng), rh=rI(5,11,rng);
    const rx=rI(2,W-rw-3,rng), ry=rI(2,H-rh-3,rng);
    let overlap=false;
    for(const r of rooms){
      if(rx<r.x+r.w+2&&rx+rw+2>r.x&&ry<r.y+r.h+2&&ry+rh+2>r.y){overlap=true;break;}
    }
    if(overlap) continue;

    for(let y=ry;y<ry+rh;y++) for(let x=rx;x<rx+rw;x++) grid[y][x]=T.F;
    // Shoreline reeds: water => wall around island.
    for(let y=ry-1;y<=ry+rh;y++){
      for(let x=rx-1;x<=rx+rw;x++){
        if(y>=0&&y<H&&x>=0&&x<W && grid[y][x]===T.WA) grid[y][x]=T.W;
      }
    }
    // Ensure interior is floor.
    for(let y=ry;y<ry+rh;y++) for(let x=rx;x<rx+rw;x++) grid[y][x]=T.F;

    const roomType=pickRoomType(LOCATIONS.swamp,locationType,rng);
    rooms.push({id:rooms.length+1,x:rx,y:ry,w:rw,h:rh,cx:Math.floor(rx+rw/2),cy:Math.floor(ry+rh/2),type:roomType,label:roomType});

    // Small interior pools on large islands only (keep most land readable).
    if(rw*rh>48 && rng()<0.28){
      const poolW=rI(2,3,rng), poolH=rI(1,2,rng);
      const px=rx+1+rI(0,Math.max(0,rw-poolW-2),rng);
      const py=ry+1+rI(0,Math.max(0,rh-poolH-2),rng);
      for(let y=py;y<py+poolH;y++) for(let x=px;x<px+poolW;x++) grid[y][x]=T.WA;
    }
  }

  // Bridges: carve T.F paths through water.
  const carveBridge=(a,b)=>{
    let x=a.cx,y=a.cy;
    const tx=b.cx,ty=b.cy;
    const maxSteps=W*H;
    for(let steps=0;steps<maxSteps;steps++){
      const dx=tx-x, dy=ty-y;
      if(Math.abs(dx)+Math.abs(dy)<=1) break;
      const preferX=Math.abs(dx)>=Math.abs(dy);
      let nx=x, ny=y;
      if(preferX) nx=x + (dx>0?1:-1);
      else ny=y + (dy>0?1:-1);
      if(rng()<0.2){ // detour
        if(preferX) ny=y + (rng()<0.5?(dy>0?1:-1):0);
        else nx=x + (rng()<0.5?(dx>0?1:-1):0);
      }
      x=clamp(nx,1,W-2); y=clamp(ny,1,H-2);
      if(grid[y][x]===T.WA) grid[y][x]=T.BRIDGE;
      // Surround bridge tile with shoreline walls where adjacent is water.
      for(const[dy2,dx2] of [[-1,0],[1,0],[0,-1],[0,1]]){
        const ay=y+dy2, ax=x+dx2;
        if(ay>=0&&ay<H&&ax>=0&&ax<W && grid[ay][ax]===T.WA) grid[ay][ax]=T.W;
      }
    }
  };

  if(rooms.length>1){
    const conn=new Set([0]);const unconn=new Set(rooms.map((_,i)=>i).filter(i=>i>0));
    while(unconn.size>0){
      let bd=Infinity,ba=-1,bb=-1;
      for(const a of conn)for(const b of unconn){
        const d=Math.abs(rooms[a].cx-rooms[b].cx)+Math.abs(rooms[a].cy-rooms[b].cy);
        if(d<bd){bd=d;ba=a;bb=b;}
      }
      if(ba<0) break;
      carveBridge(rooms[ba],rooms[bb]);
      conn.add(bb);unconn.delete(bb);
    }
  }

  return {grid,rooms};
}

/** Linear road spine with roadside lots — session travel / encounter strips. */
function generateRoadLayout(cfg,rng){
  const {width:W,height:H,roomCount}=cfg;
  const grid=Array.from({length:H},()=>Array(W).fill(T.V));
  const mid=Math.floor(H/2);
  const hubLoc=LOCATIONS.road;
  const rooms=[];
  for(let x=2;x<W-2;x++){
    grid[mid][x]=T.ROAD;
    if(mid-1>=0) grid[mid-1][x]=T.F;
    if(mid+1<H) grid[mid+1][x]=T.F;
  }
  const n=Math.min(roomCount,Math.max(2,Math.floor(W/22)));
  for(let i=0;i<n;i++){
    const cx=8+Math.floor(((i+1)/(n+1))*(W-16));
    const rw=rI(6,10,rng), rh=rI(4,7,rng);
    const rx=clamp(cx-Math.floor(rw/2),3,W-rw-3);
    const north=rng()<0.5;
    const ry=north?mid-rh-2:mid+2;
    if(ry<2||ry+rh>=H-2) continue;
    let bad=false;
    for(const r of rooms){
      if(rx<r.x+r.w+3&&rx+rw+3>r.x&&ry<r.y+r.h+3&&ry+rh+3>r.y){bad=true;break;}
    }
    if(bad) continue;
    for(let y=ry;y<ry+rh;y++)for(let x=rx;x<rx+rw;x++) grid[y][x]=T.F;
    for(let y=ry-1;y<=ry+rh;y++)for(let x=rx-1;x<=rx+rw;x++){
      if(y>=0&&y<H&&x>=0&&x<W&&grid[y][x]===T.V) grid[y][x]=T.W;
    }
    for(let y=ry;y<ry+rh;y++)for(let x=rx;x<rx+rw;x++) grid[y][x]=T.F;
    const roomType=pickRoomType(hubLoc,"road",rng);
    const rm={id:rooms.length+1,x:rx,y:ry,w:rw,h:rh,cx:Math.floor(rx+rw/2),cy:Math.floor(ry+rh/2),type:roomType,label:roomType};
    rooms.push(rm);
    const linkCy=north?mid+1:mid-1;
    carvePath(grid,rm,{cx:rm.cx,cy:linkCy},W,H,rng,false);
    if(rooms.length>1) carvePath(grid,rooms[rooms.length-2],rm,W,H,rng,false);
  }
  if(rooms.length===0){
    const rw=12,rh=6;
    const rx=Math.floor((W-rw)/2), ry=mid-rh-3;
    for(let y=ry;y<ry+rh;y++)for(let x=rx;x<rx+rw;x++) if(y>1&&y<H-2&&x>1&&x<W-2) grid[y][x]=T.F;
    for(let y=ry-1;y<=ry+rh;y++)for(let x=rx-1;x<=rx+rw;x++) if(y>=0&&y<H&&x>=0&&x<W&&grid[y][x]===T.V) grid[y][x]=T.W;
    for(let y=ry;y<ry+rh;y++)for(let x=rx;x<rx+rw;x++) grid[y][x]=T.F;
    rooms.push({id:1,x:rx,y:ry,w:rw,h:rh,cx:Math.floor(rx+rw/2),cy:Math.floor(ry+rh/2),type:"Crossroads",label:"Crossroads"});
    carvePath(grid,rooms[0],{cx:rooms[0].cx,cy:mid+1},W,H,rng,false);
  }
  for(let y=1;y<H-1;y++){
    for(let x=1;x<W-1;x++){
      if(grid[y][x]!==T.V) continue;
      for(const[dy,dx] of [[-1,0],[1,0],[0,-1],[0,1]]){
        const t=grid[y+dy]?.[x+dx];
        if(t===T.F||t===T.ROAD||t===T.WA){ grid[y][x]=T.W; break; }
      }
    }
  }
  return {grid,rooms};
}

// ── Generation ───────────────────────────────────────────────────────
function generateMap(cfg) {
  const {width:W,height:H,roomCount,depth,level,trapsOn,itemsOn,monstersOn,rng,locationType,stairDown,stairUp,stairDownTo,stairUpTo,itemCatalog=null,avgPartyLevel:avgPartyLevelIn}=cfg;
  const avgPartyLevel=typeof avgPartyLevelIn==="number"?avgPartyLevelIn:level;
  const loc=LOCATIONS[locationType];
  let grid=Array.from({length:H},()=>Array(W).fill(T.V));
  let rooms=[];const entities=[];const decoOverlay=[];
  const mapName=loc?.genName?loc.genName(rng):null;
  const tavernName=loc?.usesRoads?genTavernName(rng):null;

  const useCustomLayout=(locationType==="town"||locationType==="cave"||locationType==="graveyard"||locationType==="castle"||locationType==="sewer"||locationType==="swamp"||locationType==="road"||locationType==="volcanic_lair"||locationType==="fey_forest");
  if(useCustomLayout){
    if(locationType==="town") ({grid,rooms}=generateTownLayout(cfg,rng));
    else if(locationType==="cave") ({grid,rooms}=generateCaveLayout(cfg,rng));
    else if(locationType==="graveyard") ({grid,rooms}=generateGraveyardLayout(cfg,rng));
    else if(locationType==="castle") ({grid,rooms}=generateCastleLayout(cfg,rng));
    else if(locationType==="sewer") ({grid,rooms}=generateSewerLayout(cfg,rng));
    else if(locationType==="swamp") ({grid,rooms}=generateSwampLayout(cfg,rng));
    else if(locationType==="road") ({grid,rooms}=generateRoadLayout(cfg,rng));
    else if(locationType==="volcanic_lair"||locationType==="fey_forest") ({grid,rooms}=generateCaveLayout(cfg,rng));
  }
  if(!useCustomLayout){
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
  }

  // Town already has a full road grid + building lots; carving paths would cut through walls.
  if(rooms.length>1 && !loc.usesRoads){
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

  if(!useCustomLayout&&!loc.usesRoads){
    for(const room of rooms){
      const edges=[];
      for(let x=room.x;x<room.x+room.w;x++){edges.push({x,y:room.y-1});edges.push({x,y:room.y+room.h});}
      for(let y=room.y;y<room.y+room.h;y++){edges.push({x:room.x-1,y});edges.push({x:room.x+room.w,y});}
      for(const e of edges)
        if(e.y>=0&&e.y<H&&e.x>=0&&e.x<W&&grid[e.y][e.x]===T.C&&rng()<0.5) grid[e.y][e.x]=T.D;
    }
  }

  // Place stairs (MF1) using pre-computed anchors.
  placeStairsOnGrid({grid,rooms,stairUp,stairDown,stairUpTo,stairDownTo,rng});
  applyLocationSpecialFeatures(grid,rooms,locationType,rng,W,H);

  // Place decorations (optional)
  const usedCells=new Set();
  if(cfg.showDecos){
    for(const room of rooms){
      let decoPool=loc.decos[room.type]||loc.decos[loc.rooms[0]]||["rubble","barrel","crate"];
      if(locationType==="dungeon"||locationType==="graveyard"||locationType==="sewer"||locationType==="volcanic_lair"){
        decoPool=[...decoPool,"bones","skull","blood_sm","deadbody","corpse_beast","splatter","bone_heap","web","rubble"];
      }
      if(locationType==="volcanic_lair")decoPool=[...decoPool,"crystal","stalagmite","boulder","campfire","torch_w"];
      if(locationType==="swamp")decoPool=[...decoPool,"deadbody","bones","mushroom","vine","swamp_pool","blood_sm"];
      if(locationType==="temple")decoPool=[...decoPool,"bones","coffin","statue","blood_sm","altar"];
      if(locationType==="fey_forest")decoPool=[...decoPool,"mushroom","vine","pool","log","bush","tree","web","fountain","campfire"];
      if(locationType==="road")decoPool=[...decoPool,"cart","sign_post","bench","well","splatter","deadbody","barrel_row"];
      const numDecos=rI(1,Math.min(5,Math.floor((room.w*room.h)/14)+2),rng);
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
              if(ch&&String(ch).trim()!==""){
                const xx=px+dx, yy=py+dy;
                const k=`${xx},${yy}`;
                if(usedCells.has(k)||grid[yy]?.[xx]!==T.F) ok=false;
              }
            }
          }
          if(ok){
            for(let dy=0;dy<sh;dy++){
              for(let dx=0;dx<stamp.rows[dy].length;dx++){
                const ch=stamp.rows[dy][dx];
                if(ch&&String(ch).trim()!==""){
                  const xx=px+dx, yy=py+dy;
                  const k=`${xx},${yy}`;
                  usedCells.add(k);
                  decoOverlay.push({x:xx,y:yy,ch,fg:stamp.fg,name:stamp.n,roomId:room.id,decoKey});
                }
              }
            }
            placed=true;
          }
        }
      }
    }

    // Yard grave clusters (LG3): not room-scoped.
    if(locationType==="graveyard"){
      const graveKeys=["grave1","grave2","grave3"];
      const isInRoom=(x,y)=>rooms.some(r=>x>=r.x&&x<r.x+r.w&&y>=r.y&&y<r.y+r.h);
      for(let ry=1;ry<H-1;ry+=6){
        for(let rx=1;rx<W-1;rx+=8){
          if(rng()<0.65) continue;
          const kCount=rI(1,3,rng);
          for(let i=0;i<kCount;i++){
            const decoKey=pick(graveKeys,rng);
            const stamp=S_[decoKey];if(!stamp)continue;
            const sw=Math.max(...stamp.rows.map(r=>r.length));
            const sh=stamp.rows.length;
            if(sw+2>8||sh+2>6) continue;

            let placed=false;
            for(let tryN=0;tryN<20&&!placed;tryN++){
              const px=rI(rx,Math.min(rx+8,W-sw-2),rng);
              const py=rI(ry,Math.min(ry+6,H-sh-2),rng);
              let ok=true;
              for(let dy=0;dy<sh&&ok;dy++){
                for(let dx=0;dx<sw&&ok;dx++){
                  const ch=stamp.rows[dy]?.[dx];
                  if(ch&&String(ch).trim()!==""){
                    const xx=px+dx, yy=py+dy;
                    const tile=grid[yy]?.[xx];
                    if(tile!==T.F) ok=false;
                    if(isInRoom(xx,yy)) ok=false;
                    if(usedCells.has(`${xx},${yy}`)) ok=false;
                  }
                }
              }
              if(ok){
                for(let dy=0;dy<sh;dy++){
                  for(let dx=0;dx<stamp.rows[dy].length;dx++){
                    const ch=stamp.rows[dy][dx];
                    if(ch&&String(ch).trim()!==""){
                      const xx=px+dx, yy=py+dy;
                      usedCells.add(`${xx},${yy}`);
                      decoOverlay.push({x:xx,y:yy,ch,fg:stamp.fg,name:stamp.n,roomId:null,decoKey});
                    }
                  }
                }
                placed=true;
              }
            }
          }
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
      let it=null;
      if(itemCatalog&&itemCatalog.length){
        const ref=pickReferenceLootItem(rng, itemCatalog, avgPartyLevel);
        if(ref) it={name:ref.name, slug:ref.slug, r:"ref", minLv:1};
      }
      if(!it){
        const av=ITEMS.filter(i=>i.minLv<=level);
        if(av.length) it=pick(av,rng);
      }
      if(it){
        let ix,iy,tries=0;
        do{ix=rI(room.x+1,room.x+room.w-2,rng);iy=rI(room.y+1,room.y+room.h-2,rng);tries++;}
        while(usedCells.has(`${ix},${iy}`)&&tries<15);
        entities.push({type:"item",...it,x:ix,y:iy,roomId:room.id});
      }
    }
  }

  const riddles=[];
  let riddleSeq=0;
  for(const room of rooms){
    if(room.id<=1||rng()>0.18) continue;
    const rr=pickGoofyRiddle(rng);
    let rx,ry,tries=0;
    do{rx=rI(room.x+1,room.x+room.w-2,rng);ry=rI(room.y+1,room.y+room.h-2,rng);tries++;}
    while(usedCells.has(`${rx},${ry}`)&&tries<18);
    if(tries>=18) continue;
    usedCells.add(`${rx},${ry}`);
    let reward=null;
    if(itemCatalog&&itemCatalog.length){
      reward=pickReferenceLootItem(rng, itemCatalog, avgPartyLevel);
    }
    if(!reward){
      const av=ITEMS.filter(i=>i.minLv<=level);
      if(av.length){
        const it=pick(av,rng);
        reward={slug:null,name:it.name};
      }
    }
    riddleSeq+=1;
    const row={
      id:riddleSeq,
      roomId:room.id,
      prompt:rr.prompt,
      answer:rr.answer,
      solved:false,
      rewardSlug:reward?.slug,
      rewardName:reward?.name,
    };
    riddles.push(row);
    entities.push({
      type:"riddle",
      riddleId:row.id,
      prompt:row.prompt,
      answer:row.answer,
      solved:false,
      rewardSlug:row.rewardSlug,
      rewardName:row.rewardName,
      x:rx,
      y:ry,
      roomId:room.id,
      name:"Riddle",
    });
  }

  if(cfg.showDecos!==false){
    scatterLeversNearDoors(grid,decoOverlay,W,H,rng);
  }

  const roomsMeta=enrichForgeRoomMeta(rooms,rng,locationType);
  return {grid,rooms:roomsMeta,entities,decoOverlay,riddles,width:W,height:H,mapName,locationType,glyphs:LOCATION_GLYPHS[locationType]||LOCATION_GLYPHS.dungeon};
}

function forgeRoomsToDungeonMapRooms(dg){
  if(!dg||!dg.rooms)return[];
  return dg.rooms.map((r)=>({
    layoutId:String(r.id),
    id:String(r.id),
    name:r.namedRoom||r.label||String(r.type||"room"),
    playerLabel:String(r.label||""),
    type:String(r.type||"chamber"),
    theme:r.theme,
    themeTag:r.theme,
    x:r.x,y:r.y,width:r.w,height:r.h,
    monsters:dg.entities.filter((e)=>e.roomId===r.id&&e.type==="monster").map((e)=>({monsterSlug:e.slug||"",count:e.count||1,notes:String(e.name)})),
    treasures:{gold:0,items:dg.entities.filter((e)=>e.roomId===r.id&&e.type==="item").map((e)=>String(e.name))},
    features:{layoutMeta:{themeTag:r.theme,depth:r.depth,namedRoom:r.namedRoom||null}},
    themeTag:r.theme,
    depth:r.depth,
    namedRoom:r.namedRoom,
  }));
}

function enrichForgeRoomMeta(rooms,rng,locationType){
  const r0=rooms.find(r=>r.id===1)??rooms[0];
  if(!r0)return rooms;
  const maxD=Math.max(1,...rooms.map(r=>Math.abs(r.cx-r0.cx)+Math.abs(r.cy-r0.cy)));
  return rooms.map((r)=>{
    const man=Math.abs(r.cx-r0.cx)+Math.abs(r.cy-r0.cy);
    const depth=Math.min(12,Math.round((man/maxD)*8));
    let theme="guard";
    if(r.id===1)theme="entrance";
    else if(String(r.type||"").toLowerCase().includes("boss"))theme="boss";
    else if(/throne|vault|cache|shrine|reliquary|sanctum|moon pool|dreamspring|black market|forge depths|breached hull|inner sanctum/i.test(String(r.label||"")))theme=pick(["treasure","lore","puzzle"],rng);
    else if(locationType==="volcanic_lair"&&/magma|ember|lava|volcanic|scoria|cinder|sulfur|glass lake|ash tomb|fire shrine/i.test(String(r.type||"")))theme=pick(["boss","trap","treasure"],rng);
    else if(locationType==="fey_forest"&&/fey|pixie|glimmer|willow|moss ring|thorn|grove|dell|moon pool|dreamspring|fungal vale/i.test(String(r.type||"")))theme=pick(["lore","puzzle","rest","treasure"],rng);
    else if(locationType==="road"&&/inn|camp|bridge|crossroads|watch|shrine|bandit|ferry|toll|merchant/i.test(String(r.type||"")))theme=pick(["guard","trap","lore","treasure"],rng);
    else if(depth>=6)theme=pick(["guard","trap","treasure","boss"],rng);
    else theme=pick(["guard","lore","puzzle","rest","treasure","trap"],rng);
    const namedRoom=rng()<0.38?`${pick(["Ash","Tallow","Salt","Raven","Iron","Hollow"],rng)} ${pick(["Hall","Vault","Den","Sanctum","Gallery","Pit"],rng)}`:null;
    const secretHint=r.id>1&&rng()<0.09?pick(SECRET_HINTS,rng):null;
    const labelBlob=`${String(r.label||"")} ${String(r.type||"")}`;
    const looksHidden=/smuggler|murder hole|black market|collapsed tunnel|smuggler tunnel|cache|hidden|secret passage|catacomb|ossuary|inner sanctum|arcane vault|reliquary|antechamber|overflow|rat nest|cistern|drain room|breached|hollow|pixie dell|moon pool/i.test(labelBlob);
    const isSecretRoom=Boolean(secretHint)||(r.id>1&&looksHidden&&rng()<0.62)||(r.id>1&&theme==="treasure"&&depth>=5&&rng()<0.12);
    return{...r,depth,theme,namedRoom,locationType,secretHint,isSecretRoom};
  });
}

function carvePath(grid,a,b,W,H,rng,isRoad){
  let x=a.cx,y=a.cy;const goH=rng()<0.5;const tileType=isRoad?T.ROAD:T.C;
  const canCarve=(t)=>t===T.V||t===T.W||t===T.F;
  const carve=(cx,cy)=>{
    if(cy>=0&&cy<H&&cx>=0&&cx<W){
      if(canCarve(grid[cy][cx])) grid[cy][cx]=tileType;
      if(isRoad){for(const d of[-1,1]){if(cy+d>=0&&cy+d<H&&canCarve(grid[cy+d][cx]))grid[cy+d][cx]=tileType;if(cx+d>=0&&cx+d<W&&canCarve(grid[cy][cx+d]))grid[cy][cx+d]=tileType;}}
      for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const ny=cy+dy,nx=cx+dx;if(ny>=0&&ny<H&&nx>=0&&nx<W&&grid[ny][nx]===T.V)grid[ny][nx]=T.W;}
    }
  };
  if(goH){while(x!==b.cx){carve(x,y);x+=x<b.cx?1:-1;}carve(x,y);while(y!==b.cy){carve(x,y);y+=y<b.cy?1:-1;}carve(x,y);}
  else{while(y!==b.cy){carve(x,y);y+=y<b.cy?1:-1;}carve(x,y);while(x!==b.cx){carve(x,y);x+=x<b.cx?1:-1;}carve(x,y);}
}

const STY={
  terminal:{bg:"#000",void:"#000",wallFg:"#555",floorFg:"#1a1a1a",doorFg:"#cc0",stairsFg:"#0f0",waterFg:"#06f",pillarFg:"#555",monsterFg:"#f22",trapFg:"#f80",itemFg:"#f0f",labelFg:"#0c0",roadFg:"#444",panelBg:"#000",panelBorder:"#222",textColor:"#ccc",dimText:"#444",accent:"#0c0",accentAlt:"#f22",inputBg:"#0a0a0a",inputBorder:"#333",inputFg:"#0f0",btnBorder:"#0a0",btnFg:"#0f0",headerBg:"#000",selectedBg:"#0a1a0a",floorBg:"#000",wallBg:"#000",labelBg:"#000",doorBg:"#000",stairsBg:"#000",roadBg:"#000"},
  rogue:{bg:"#08081a",void:"#0d0d1a",wallFg:"#555570",floorFg:"#333350",doorFg:"#c8a020",stairsFg:"#0d0",waterFg:"#26c",pillarFg:"#668",monsterFg:"#f33",trapFg:"#f80",itemFg:"#4af",labelFg:"#aad",roadFg:"#444466",panelBg:"#0a0a1f",panelBorder:"#1a1a33",textColor:"#c8c8e0",dimText:"#456",accent:"#a8f",accentAlt:"#f44",inputBg:"#151530",inputBorder:"#2a2a44",inputFg:"#b9f",btnBorder:"#43b",btnFg:"#ddd",headerBg:"#0c0c22",selectedBg:"#1a1a55",floorBg:"#1a1a2e",wallBg:"#2a2a3a",labelBg:"#1a1a2e",doorBg:"#1a1a2e",stairsBg:"#1a1a2e",roadBg:"#1a1a2e"},
  grid:{bg:"#6b6560",void:"#8a8680",wallFg:"#5a5647",floorFg:"#c8c0b0",doorFg:"#5c4400",stairsFg:"#2d8b2d",waterFg:"#3a7ca5",pillarFg:"#6b6358",monsterFg:"#c22",trapFg:"#c80",itemFg:"#24c",labelFg:"#333",roadFg:"#a09888",panelBg:"#5e5955",panelBorder:"#4a4540",textColor:"#f0e8d8",dimText:"#aa9",accent:"#f0e8d8",accentAlt:"#c22",inputBg:"#e8e4dc",inputBorder:"#8a8580",inputFg:"#333",btnBorder:"#8a6820",btnFg:"#fff",headerBg:"#5a5550",selectedBg:"#e8e0c0",floorBg:"#f5f0e6",wallBg:"#d4d0c8",labelBg:"#f5f0e6",doorBg:"#8b6914",stairsBg:"#f5f0e6",roadBg:"#e8e0d0"},
};
const RM={common:"#aaa",uncommon:"#0f0",rare:"#44f",vr:"#c4f",legendary:"#fa0"};
const RMG={common:"#888",uncommon:"#282",rare:"#24c",vr:"#82c",legendary:"#c80"};

/** Deco keys hidden on player print export (containers & obvious searchable props). */
const PLAYER_PRINT_HIDE_DECO_KEYS=new Set(["chest","crate","crate_stack","bookshelf","weapon_rack","crystal","lever_icon"]);

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
  if(dg.riddles&&dg.riddles.length){
    lines.push("RIDDLES — DM only (do not read aloud)");
    lines.push("─".repeat(44));
    for(const r of dg.riddles){
      lines.push("#"+r.id+" Room "+r.roomId+": "+r.prompt);
      lines.push("  Answer: "+r.answer+(r.rewardName?"  Loot: "+r.rewardName+(r.rewardSlug?" ["+r.rewardSlug+"]":""):""));
    }
    lines.push("");
  }
  for(const r of rooms){
    lines.push("Room "+r.id+": "+(r.label||r.type));
    const dnames=[...new Set(dg.decoOverlay.filter(d=>d.roomId===r.id).map(d=>d.name))];
    if(dnames.length)lines.push("  Scenery: "+dnames.join(", "));
    const re=dg.entities.filter(e=>e.roomId===r.id);
    if(re.length===0&&!dnames.length)lines.push("  (no notes)");
    for(const e of re){
      if(e.type==="monster")lines.push("  [M] "+e.name+" x"+e.count+" (CR "+e.cr+")");
      else if(e.type==="trap")lines.push("  [T] "+e.name+" — spot DC "+(e.detectDC??"?")+", "+(e.saveType||"?")+" DC "+(e.saveDC??"?")+" — "+(e.dmg||""));
      else if(e.type==="item")lines.push("  [I] "+e.name+(e.slug?" ["+e.slug+"]":"")+" ("+(e.r||"?")+")");
      else if(e.type==="riddle")lines.push("  [?] Riddle — see RIDDLES section");
    }
    lines.push("");
  }
  return lines;
}

function cellColor(cell,style,ov={}){
  const s={...STY[style],...ov};const isG=style==="grid";const bg0=s.bg;
  if(cell.eType==="monster")return{bg:isG?s.floorBg:bg0,fg:s.monsterFg};
  if(cell.eType==="trap")return{bg:isG?s.floorBg:bg0,fg:s.trapFg};
  if(cell.eType==="item")return{bg:isG?s.floorBg:bg0,fg:(isG?RMG:RM)[cell.extra?.r]||s.itemFg};
  if(cell.eType==="riddle")return{bg:isG?s.floorBg:bg0,fg:"#daf"};
  if(cell.eType==="deco")return{bg:isG?s.floorBg:bg0,fg:cell.fg||s.floorFg};
  if(cell.eType==="theme")return{bg:isG?s.floorBg:bg0,fg:s.accent};
  if(cell.eType==="label")return{bg:s.labelBg,fg:s.labelFg};
  switch(cell.tile){
    case T.V:return{bg:s.void,fg:s.void};
    case T.W:return{bg:isG?s.wallBg:bg0,fg:s.wallFg};
    case T.F:return{bg:isG?s.floorBg:bg0,fg:s.floorFg};
    case T.C:return{bg:isG?s.floorBg:bg0,fg:s.corrFg??s.floorFg};
    case T.D:return{bg:isG?s.doorBg:bg0,fg:s.doorFg};
    case T.SU:
    case T.SD:return{bg:isG?s.stairsBg:bg0,fg:s.stairsFg};
    case T.WA:return{bg:isG?"#a8d4e6":(style==="terminal"?"#000008":"#0a1428"),fg:s.waterFg};
    case T.P:return{bg:isG?"#b8b0a0":bg0,fg:s.pillarFg};
    case T.ROAD:return{bg:isG?s.roadBg:bg0,fg:s.roadFg};
    case T.BRIDGE:return{bg:isG?s.floorBg:bg0,fg:s.corrFg??s.floorFg};
    case T.LAVA:return{bg:isG?"#4a1808":bg0,fg:s.waterFg};
    default:return{bg:s.void,fg:s.void};
  }
}

/** Map a hex color to grayscale (luminance) for ink-saving exports that still follow the map’s structure. */
function hexToGray(hex){
  if(typeof hex!=="string"||!hex.startsWith("#"))return hex;
  let h=hex.slice(1);
  if(h.length===3)h=h.split("").map((x)=>x+x).join("");
  if(h.length!==6)return hex;
  const r=parseInt(h.slice(0,2),16),g=parseInt(h.slice(2,4),16),b=parseInt(h.slice(4,6),16);
  const y=Math.round(0.2126*r+0.7152*g+0.0722*b);
  const v=Math.min(255,Math.max(0,y));
  const t=v.toString(16).padStart(2,"0");
  return `#${t}${t}${t}`;
}

/** High-contrast palette for PNG export (printer-friendly). */
function cellColorPrint(cell){
  if(cell.eType==="monster")return{bg:"#ffffff",fg:"#000000"};
  if(cell.eType==="trap")return{bg:"#ffffff",fg:"#222222"};
  if(cell.eType==="item")return{bg:"#ffffff",fg:"#000000"};
  if(cell.eType==="deco")return{bg:"#ffffff",fg:"#1a1a1a"};
  if(cell.eType==="theme")return{bg:"#ffffff",fg:"#000000"};
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
    case T.BRIDGE:return{bg:"#ffffff",fg:"#444444"};
    case T.LAVA:return{bg:"#fff0e8",fg:"#aa2200"};
    default:return{bg:"#f5f5f5",fg:"#d0d0d0"};
  }
}

function renderCanvas(dg,style,options={}){
  const showEnts=options.showEnts!==false;
  const revArr=options.revArr!=null?options.revArr:null;
  const rawFogCells=options.fogCells;
  const fogCells=rawFogCells!=null?(rawFogCells instanceof Set?rawFogCells:new Set(Array.isArray(rawFogCells)?rawFogCells:[...rawFogCells])):null;
  const scale=options.scale??1;
  const printExport=!!options.print;
  const dmSidebar=!!options.dmSidebar;
  const playerSanitize=!!options.playerSanitizeDecos;
  /** Match on-screen Forge colors (theme + location); false = legacy high-contrast print only. */
  const screenMatch=options.screenMatch!==false;
  const inkSaver=!!options.inkSaver;
  const forgeCfg=options.forgeCfg||{};
  const locOv=LOCATION_STYLE_OVERRIDE[forgeCfg.locationType]||{};
  const S0={...STY[style],...locOv};
  const rg=buildRenderGrid(dg,forgeCfg);
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
  let pageBg=S0.bg;
  if(printExport){
    if(screenMatch&&!inkSaver)pageBg=S0.bg;
    else if(inkSaver)pageBg="#f5f5f5";
    else pageBg="#ffffff";
  }
  ctx.fillStyle=pageBg;
  ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.fillStyle=printExport&&(screenMatch||inkSaver)?(S0.accent||s.accent||"#ccc"):(printExport?"#000000":s.dimText);
  ctx.font=`bold ${fontPx}px monospace`;
  let title=(showEnts?"DM PRINT":"PLAYER PRINT")+" | Floor "+(dg.floor||1)+" | Seed "+(dg.seed||"");
  if(dg.mapName)title=dg.mapName+" | "+title;
  if(inkSaver)title+=" | Ink save";
  ctx.fillText(title,4*scale,14*scale);
  const fogSet=!showEnts&&revArr!=null?new Set(Array.isArray(revArr)?revArr:[...revArr]):null;
  const yO=28*scale;
  ctx.font=`${fontPx}px monospace`;ctx.textBaseline="top";
  const floorBgBase=style==="grid"?S0.floorBg:S0.bg;
  for(let y=0;y<dg.height;y++){for(let x=0;x<dg.width;x++){
    const cell=rg[y][x];
    if(!showEnts&&fogCells){
      if(!fogCells.has(`${x},${y}`)){ctx.fillStyle=screenMatch||inkSaver?S0.void:(printExport?"#f5f5f5":s.void);ctx.fillRect(x*cW+2*scale,yO+y*cH,cW,cH);continue;}
    }else if(!showEnts&&fogSet){
      const rm=dg.rooms.find(r=>x>=r.x-1&&x<=r.x+r.w&&y>=r.y-1&&y<=r.y+r.h);
      const inC=cell.tile===T.C||cell.tile===T.D||cell.tile===T.ROAD;
      if(rm&&!fogSet.has(rm.id)&&!inC){ctx.fillStyle=screenMatch||inkSaver?S0.void:(printExport?"#f5f5f5":s.void);ctx.fillRect(x*cW+2*scale,yO+y*cH,cW,cH);continue;}
    }
    let hide=!showEnts&&(cell.eType==="monster"||cell.eType==="trap"||cell.eType==="item");
    const hideLabel=!showEnts&&playerSanitize&&cell.eType==="label";
    const hideDeco=!showEnts&&playerSanitize&&cell.eType==="deco"&&cell.extra&&PLAYER_PRINT_HIDE_DECO_KEYS.has(cell.extra.decoKey);
    if(hideLabel||hideDeco)hide=true;
    let c=(printExport&&!screenMatch)?cellColorPrint(cell):cellColor(cell,style,locOv);
    if(printExport&&inkSaver){
      c={bg:hexToGray(c.bg),fg:hexToGray(c.fg)};
    }
    const floorBg=printExport&&!screenMatch?"#ffffff":floorBgBase;
    const floorFg=printExport&&!screenMatch?"#333333":S0.floorFg;
    ctx.fillStyle=hide?floorBg:c.bg;
    ctx.fillRect(x*cW+2*scale,yO+y*cH,cW,cH);
    ctx.fillStyle=hide?floorFg:c.fg;
    const ch=hide?".":(cell.ch.length>1?cell.ch[0]:cell.ch);
    if(ch!==" ")ctx.fillText(ch,x*cW+4*scale,yO+y*cH+2*scale);
  }}
  if(sidebarW&&sidebarLines.length){
    const sx=mapW+8*scale;
    ctx.fillStyle=inkSaver?"#f0f0f0":"#ffffff";
    ctx.fillRect(sx-4*scale,0,sidebarW+8*scale,canvas.height);
    ctx.strokeStyle=inkSaver?"#999":"#cccccc";
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

/** Cropped hi-res canvas for one room (+2 cell pad). DM palette; no fog. */
function renderRoomCanvas(dg, roomId, _styleName, locationType, forgeCfg, opts = {}) {
  const cellPx = opts.cellPx ?? 32;
  const dpr = opts.dpr ?? 2;
  const rm = dg.rooms.find((r) => r.id === roomId);
  if (!rm) {
    const empty = document.createElement("canvas");
    empty.width = 4;
    empty.height = 4;
    return empty;
  }
  const rg = buildRenderGrid(dg, forgeCfg || {});
  const pad = 2;
  const x0 = Math.max(0, rm.x - pad);
  const y0 = Math.max(0, rm.y - pad);
  const x1 = Math.min(dg.width, rm.x + rm.w + pad);
  const y1 = Math.min(dg.height, rm.y + rm.h + pad);
  const gw = Math.max(1, x1 - x0);
  const gh = Math.max(1, y1 - y0);
  const sub = [];
  for (let y = 0; y < gh; y++) {
    const row = [];
    for (let x = 0; x < gw; x++) row.push(rg[y0 + y][x0 + x]);
    sub.push(row);
  }
  const canvas = document.createElement("canvas");
  renderDungeonToCanvas(canvas, sub, {
    palette: LOCATION_PALETTE[locationType] ?? DEFAULT_PALETTE,
    entities: ENTITY_PALETTE,
    cellPx,
    dpr,
    showEnts: true,
    playerSanitize: false,
    inkSaver: false,
  });
  return canvas;
}

// ── Component ────────────────────────────────────────────────────────
export default function DungeonForge(){
  const FORGE_CFG_KEY="forge.config.v2";
  /** Locked display behavior — no sidebar toggles (tiny cells, fill viewport, 2× PNG, scenery). */
  const FIXED_FORGE_DISPLAY={showDecos:true,showThemes:false};
  const [cfg,setCfg]=useState(()=>{
    const base={roomCount:8,depth:1,level:3,width:80,height:52,trapsOn:true,itemsOn:true,monstersOn:true,style:"terminal",seed:Math.floor(Math.random()*999999),locationType:"dungeon",...FIXED_FORGE_DISPLAY,cellPx:18,exportCellPx:32,autoSync:false};
    try{
      const raw=localStorage.getItem(FORGE_CFG_KEY);
      if(raw){
        const p=JSON.parse(raw);
        delete p.asciiDensity;delete p.asciiFontPx;delete p.hiRes;delete p.hiResExport;delete p.tinyMode;delete p.compactCells;delete p.density;
        return{...base,...p,...FIXED_FORGE_DISPLAY};
      }
    }catch(_){/* ignore */}
    return base;
  });
  const [dg,setDg]=useState(null);const [selRoom,setSelRoom]=useState(null);const [curFloor,setCurFloor]=useState(1);
  const [floors,setFloors]=useState([]);const [hovered,setHovered]=useState(null);const [legend,setLegend]=useState(false);
  const [view,setView]=useState("dm");const [revealed,setRevealed]=useState(()=>new Set());
  const [statCard,setStatCard]=useState(null);
  const [forgeInspect,setForgeInspect]=useState(null);
  const cfgSaveTimer=useRef(null);
  const mapViewportRef=useRef(null);const mapPanRef=useRef(null);
  const draggingRef=useRef(null);
  const hoverRafRef=useRef(0);
  const pendingHoverRef=useRef(null);
  const fogCellsForHoverRef=useRef(null);
  const lastAppliedHoverSigRef=useRef("");
  const [vpSize,setVpSize]=useState({w:0,h:0});
  const [zoom,setZoom]=useState(1);const [pan,setPan]=useState({x:0,y:0});const [dragging,setDragging]=useState(null);
  const [tvRoom,setTvRoom]=useState(null);
  const [coarsePointer,setCoarsePointer]=useState(false);
  const [saveLibraryMsg,setSaveLibraryMsg]=useState(null);
  const [mapHoverTip,setMapHoverTip]=useState(null);
  const [giveItemTarget,setGiveItemTarget]=useState(null);
  const [selectedSessionId,setSelectedSessionId]=useState("");
  const [sendMsg,setSendMsg]=useState(null);
  const [doorOpen,setDoorOpen]=useState(()=>new Set());
  const [animPhase,setAnimPhase]=useState(0);
  const { partyCharacters, sessions, activeSession, loadSessions } = useSessionStore();
  useEffect(()=>{
    const id=window.setInterval(()=>setAnimPhase((p)=>(p+0.04)%1),380);
    return()=>clearInterval(id);
  },[]);
  useEffect(()=>{
    const el=mapViewportRef.current;
    if(!el)return;
    let raf=0;
    const ro=new ResizeObserver(()=>{
      cancelAnimationFrame(raf);
      raf=requestAnimationFrame(()=>{
        setVpSize({w:el.clientWidth,h:el.clientHeight});
      });
    });
    ro.observe(el);
    setVpSize({w:el.clientWidth,h:el.clientHeight});
    return()=>{
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  },[]);
  useEffect(()=>{
    const mq=window.matchMedia("(hover: none)");
    const apply=()=>setCoarsePointer(!!mq.matches);
    apply();
    if("addEventListener" in mq) mq.addEventListener("change",apply);
    else mq.addListener(apply);
    return()=>{
      if("removeEventListener" in mq) mq.removeEventListener("change",apply);
      else mq.removeListener(apply);
    };
  },[]);

  useEffect(()=>{
    const sp=new URLSearchParams(window.location.search);
    const seed=sp.get("seed");
    const loc=sp.get("loc");
    const level=sp.get("level");
    if(seed||loc||level){
      setCfg((c)=>({
        ...c,
        ...(seed?{seed:parseInt(seed,10)||c.seed}:{}),
        ...(loc?{locationType:loc}:{}),
        ...(level?{level:Math.max(1,Math.min(20,parseInt(level,10)||c.level))}:{}),
      }));
      window.history.replaceState({}, "", window.location.pathname);
    }
  },[]);

  useEffect(()=>{
    if(cfgSaveTimer.current)clearTimeout(cfgSaveTimer.current);
    cfgSaveTimer.current=setTimeout(()=>{
      try{localStorage.setItem(FORGE_CFG_KEY,JSON.stringify(cfg));}catch(_){/* ignore */}
    },400);
    return()=>{if(cfgSaveTimer.current)clearTimeout(cfgSaveTimer.current);};
  },[cfg]);
  useEffect(()=>{void loadSessions();},[loadSessions]);
  useEffect(()=>{
    if(!selectedSessionId&&activeSession?.id)setSelectedSessionId(activeSession.id);
  },[activeSession,selectedSessionId]);

  const generate=useCallback(async()=>{
    let itemCatalog=null;
    try{
      const res=await fetch("/api/reference/items");
      if(res.ok) itemCatalog=await res.json();
    }catch(_){/* offline */}
    const avgPartyLevel=partyCharacters.length
      ? Math.round(partyCharacters.reduce((s,c)=>s+(c.level||1),0)/partyCharacters.length)
      : cfg.level;
    const anchorRng=seededRNG(cfg.seed+99991);
    const anchors=Array.from({length:Math.max(0,cfg.depth-1)},()=>({
      x:rI(Math.floor(cfg.width*0.2),Math.floor(cfg.width*0.8),anchorRng),
      y:rI(Math.floor(cfg.height*0.2),Math.floor(cfg.height*0.8),anchorRng),
    }));
    const all=[];
    for(let f=0;f<cfg.depth;f++){
      const rng=seededRNG(cfg.seed+f*7919);
      const stairDown=f<cfg.depth-1 ? anchors[f] : null;
      const stairUp=f>0 ? anchors[f-1] : null;
      const d=generateMap({...cfg,rng,stairDown,stairUp,stairDownTo:f+2,stairUpTo:f,itemCatalog,avgPartyLevel});
      d.floor=f+1;d.seed=cfg.seed;all.push(d);
    }
    const names=new Set();
    all.forEach(d=>d.entities.filter(e=>e.type==="monster").forEach(e=>names.add(e.name)));
    let byKey=new Map();
    if(names.size){
      try{
        const res=await fetch("/api/monsters/resolve",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({names:[...names]})});
        if(res.ok){
          const arr=await res.json();
          byKey=new Map(arr.map(m=>[String(m.name).toLowerCase(),m]));
        }
      }catch(_){/* offline */}
    }
    const tag=(nm)=>{const m=byKey.get(String(nm).toLowerCase());const slugFallback=String(nm).toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"")||"unknown";return{slug:m?.slug??slugFallback,unresolved:!!m?.unresolved};};
    all.forEach(d=>{
      d.entities=d.entities.map(e=>{
        if(e.type!=="monster")return e;
        const t=tag(e.name);
        return{...e,slug:t.slug,unresolved:t.unresolved};
      });
    });
    const d0=all?.[0];
    const startId=(d0&&inferStartingRoomId(d0))??d0?.rooms?.[0]?.id??1;
    setFloors(all);setDg(all[0]);setCurFloor(1);setSelRoom(null);setTvRoom(null);setForgeInspect(null);setRevealed(new Set([startId]));setDoorOpen(new Set());
  },[cfg, partyCharacters]);

  useEffect(()=>{void generate();},[generate]);

  const u=(k,v)=>setCfg(c=>({...c,[k]:v}));
  useEffect(()=>{
    const onKey=(e)=>{
      if((e.ctrlKey||e.metaKey)&&String(e.key).toLowerCase()==="g"){
        e.preventDefault();
        setCfg((c)=>({...c,seed:Math.floor(Math.random()*999999)}));
      }
    };
    window.addEventListener("keydown",onKey);
    return()=>window.removeEventListener("keydown",onKey);
  },[]);
  const isP=view==="player";
  const forgeGridCfg={...cfg,showThemes:!!cfg.showThemes&&!isP};
  const rg=dg?buildRenderGrid(dg,forgeGridCfg):null;const S=STY[cfg.style];
  const Wm=dg?dg.width:1;const Hm=dg?dg.height:1;
  const cs=useMemo(()=>{
    const n=computeCellSize({
      vpW:vpSize.w,
      vpH:vpSize.h,
      gridW:Wm,
      gridH:Hm,
      cellPx:cfg.cellPx??18,
      pad:12,
    });
    if(import.meta.env.DEV&&n<=0){
      console.warn("[DungeonForge] cell size collapsed",{vpSize,Wm,Hm,cfg});
    }
    return n;
  },[vpSize.w,vpSize.h,Wm,Hm,cfg.cellPx]);
  const rooms=dg?dg.rooms:[];const ents=dg?dg.entities:[];const decos=dg?dg.decoOverlay:[];
  const fogOpenFloor=useMemo(()=>isOpenFloorLocation(cfg.locationType),[cfg.locationType]);
  const mapFogCells=useMemo(()=>{
    if(!isP||!dg||!revealed)return null;
    return computeVisibleCellsForPlayer(revealed,dg,doorOpen,null,{
      openFloor:fogOpenFloor,
      maxFogHops:maxFogHopsForLocationType(cfg.locationType),
    });
  },[isP,dg,revealed,doorOpen,fogOpenFloor,cfg.locationType]);
  useEffect(()=>{fogCellsForHoverRef.current=mapFogCells;},[mapFogCells]);
  useEffect(()=>{lastAppliedHoverSigRef.current="";},[dg]);
  const highlightRoom=useMemo(()=>{
    if(selRoom==null||!dg)return null;
    const rm=dg.rooms.find(r=>r.id===selRoom);
    return rm?{x:rm.x,y:rm.y,w:rm.w,h:rm.h}:null;
  },[selRoom,dg]);
  const revealableDoors=useMemo(()=>{
    if(!isP||!dg||!mapFogCells)return[];
    const result=[];
    for(let y=0;y<dg.height;y++){
      for(let x=0;x<dg.width;x++){
        if(dg.grid[y][x]!==T.D)continue;
        const k=`${x},${y}`;
        if(!mapFogCells.has(k))continue;
        const adj=dg.rooms.filter((r)=>x>=r.x-1&&x<=r.x+r.w&&y>=r.y-1&&y<=r.y+r.h);
        if(adj.some((r)=>!revealed.has(r.id))) result.push({x,y});
      }
    }
    return result;
  },[isP,dg,mapFogCells,revealed]);
  const loc=LOCATIONS[cfg.locationType];
  const asciiExport=useMemo(()=>{
    if(!dg)return null;
    const rg=buildRenderGrid(dg,{showThemes:!!cfg.showThemes});
    const rawLines=[];
    for(let y=0;y<dg.height;y++){
      let row="";
      for(let x=0;x<dg.width;x++){
        const ch=String(rg[y][x]?.ch??" ");
        row+=Array.from(ch)[0]??" ";
      }
      rawLines.push(row);
    }
    const mapOnly=rawLines.join("\n");
    const legend=buildAsciiMapLegend(forgeRoomsToDungeonMapRooms(dg),{mode:isP?"player":"dm",footer:"forge"});
    const text=`${mapOnly}\n\n${legend}`;
    return{text,mapOnly,legend,width:rawLines[0]?[...rawLines[0]].length:0,height:rawLines.length};
  },[dg,isP,cfg.showThemes]);

  const tvForgeCfg=useMemo(()=>({showThemes:!!cfg.showThemes}),[cfg.showThemes]);
  const tvPreviewUrl=useMemo(()=>{
    if(tvRoom==null||!dg)return"";
    return renderRoomCanvas(dg,tvRoom,cfg.style,cfg.locationType,tvForgeCfg,{cellPx:32,dpr:2,fontPx:24}).toDataURL("image/png");
  },[tvRoom,dg,cfg.style,cfg.locationType,tvForgeCfg]);

  useEffect(()=>{
    setZoom(1);setPan({x:0,y:0});
    try{mapPanRef.current?.style.removeProperty("transform");}catch(_){/* noop */}
  },[cfg.cellPx]);

  useEffect(()=>{
    const el=mapViewportRef.current;
    if(!el||!dg)return;
    const onWheel=(e)=>{
      e.preventDefault();
      const rect=el.getBoundingClientRect();
      const mx=e.clientX-rect.left;
      const my=e.clientY-rect.top;
      const delta=e.deltaY>0?0.85:1.18;
      setZoom((zPrev)=>{
        const zNew=Math.max(0.3,Math.min(8,zPrev*delta));
        const ratio=zNew/zPrev;
        setPan((p)=>({x:mx-ratio*(mx-p.x),y:my-ratio*(my-p.y)}));
        return zNew;
      });
    };
    el.addEventListener("wheel",onWheel,{passive:false});
    return()=>el.removeEventListener("wheel",onWheel);
  },[dg]);

  useEffect(()=>{
    const onKey=(e)=>{
      if(e.key!=="Escape")return;
      if(tvRoom!=null){e.preventDefault();setTvRoom(null);return;}
      if(selRoom!=null){e.preventDefault();setSelRoom(null);}
    };
    window.addEventListener("keydown",onKey);
    return()=>window.removeEventListener("keydown",onKey);
  },[tvRoom,selRoom]);

  const flushHoverRaf=useCallback(()=>{
    hoverRafRef.current=0;
    const p=pendingHoverRef.current;
    pendingHoverRef.current=null;
    if(!p)return;
    if(p.sig===lastAppliedHoverSigRef.current)return;
    lastAppliedHoverSigRef.current=p.sig;
    setHovered(p.hovered);
    setMapHoverTip(p.tip);
  },[]);
  const scheduleHover=useCallback((payload)=>{
    pendingHoverRef.current=payload;
    if(hoverRafRef.current!==0)return;
    hoverRafRef.current=requestAnimationFrame(flushHoverRaf);
  },[flushHoverRaf]);
  useEffect(()=>()=>{if(hoverRafRef.current)cancelAnimationFrame(hoverRafRef.current);},[]);

  const onCanvasPointerDown=(e)=>{
    e.currentTarget.setPointerCapture(e.pointerId);
    const ax=e.clientX-pan.x,ay=e.clientY-pan.y;
    draggingRef.current={ax,ay};
    setDragging({x:ax,y:ay});
  };
  const onCanvasPointerMove=(e)=>{
    const d=draggingRef.current;
    if(d){
      const nx=e.clientX-d.ax;
      const ny=e.clientY-d.ay;
      const pel=mapPanRef.current;
      if(pel)pel.style.transform=`translate(${nx}px,${ny}px) scale(${zoom})`;
      return;
    }
    if(!rg||!dg)return;
    const rect=mapViewportRef.current?.getBoundingClientRect();
    if(!rect)return;
    const relX=e.clientX-rect.left-pan.x;
    const relY=e.clientY-rect.top-pan.y;
    const gx=Math.floor(relX/zoom/cs);
    const gy=Math.floor(relY/zoom/cs);
    if(gx<0||gy<0||gx>=dg.width||gy>=dg.height){
      const fullSig="__oob__";
      if(fullSig===lastAppliedHoverSigRef.current)return;
      scheduleHover({sig:fullSig,hovered:null,tip:null});
      return;
    }
    const cell=rg[gy][gx];
    const fogCells=fogCellsForHoverRef.current;
    if(isP&&revealed&&fogCells&&!fogCells.has(`${gx},${gy}`)){
      const fullSig=`fog:${gx},${gy}`;
      if(fullSig===lastAppliedHoverSigRef.current)return;
      scheduleHover({sig:fullSig,hovered:null,tip:null});
      return;
    }
    const hoveredNext=cell.extra&&cell.eType!=="deco"&&!isP?cell.extra:null;
    const ex=cell.extra;
    const nm=cell.eName??(ex&&typeof ex==="object"&&"name" in ex?ex.name:null);
    let tip=null;
    if(nm||cell.eType==="deco"){
      const detail=ex&&typeof ex==="object"&&"cr" in ex&&ex.cr!=null?` (CR ${ex.cr})`:ex&&ex.dmg?` — ${ex.dmg}`:ex&&ex.r?` [${ex.r}]`:"";
      tip=nm?`${nm}${detail}`:cell.eName?`${cell.eName}`:null;
      if(ex&&typeof ex==="object"&&ex.decoKey==="lever_icon"&&ex.purpose){
        tip=`Lever — ${ex.purpose}`;
      }
    }
    const slug=hoveredNext&&typeof hoveredNext==="object"&&"slug" in hoveredNext?String(hoveredNext.slug??""):"";
    const fullSig=`${gx},${gy}|${tip??""}|${slug}`;
    if(fullSig===lastAppliedHoverSigRef.current)return;
    scheduleHover({sig:fullSig,hovered:hoveredNext,tip});
  };
  const onCanvasPointerUp=(e)=>{
    const d=draggingRef.current;
    if(d){
      const nx=e.clientX-d.ax;
      const ny=e.clientY-d.ay;
      setPan({x:nx,y:ny});
      try{mapPanRef.current?.style.removeProperty("transform");}catch(_){/* noop */}
    }
    draggingRef.current=null;
    setDragging(null);
    try{e.currentTarget.releasePointerCapture(e.pointerId);}catch(_){/* noop */}
  };
  const handleMapCellClick=(gx,gy,cell)=>{
    if(!dg||!rg)return;
    if(gx<0||gy<0||gx>=dg.width||gy>=dg.height)return;
    const tile=dg.grid?.[gy]?.[gx];
    const key=`${gx},${gy}`;
    if(!isP){
      if(cell.eType==="riddle"&&cell.extra&&typeof cell.extra==="object"){
        setForgeInspect({kind:"riddle",ent:cell.extra});
        return;
      }
      if(cell.eType==="deco"&&cell.extra&&cell.extra.decoKey==="lever_icon"){
        setForgeInspect({kind:"lever",deco:cell.extra,gx,gy});
        return;
      }
    }
    if(!isP&&cell.extra?.type==="monster"&&cell.extra.slug){setStatCard({slug:cell.extra.slug,view:"dm"});return;}
    if(tile===T.D){
      if(!isP){
        setDoorOpen((prev)=>{const next=new Set(prev);if(next.has(key))next.delete(key);else next.add(key);return next;});
        return;
      }
      if(mapFogCells?.has(key)){
        setDoorOpen((p)=>new Set(p).add(key));
        const adj=dg.rooms.filter((r)=>gx>=r.x-1&&gx<=r.x+r.w&&gy>=r.y-1&&gy<=r.y+r.h);
        if(adj.length){
          setRevealed((prev)=>{const n=new Set(prev);adj.forEach((r)=>n.add(r.id));return n;});
        }
        return;
      }
      return;
    }
    const rm=dg.rooms.find((r)=>gx>=r.x&&gx<r.x+r.w&&gy>=r.y&&gy<r.y+r.h);
    if(!rm)return;
    if(isP){
      if(!revealed.has(rm.id)){
        setSelRoom(rm.id);
        return;
      }
      setSelRoom(selRoom===rm.id?null:rm.id);
      return;
    }
    setSelRoom(selRoom===rm.id?null:rm.id);
  };
  const onMapContextMenu=(e)=>{
    if(!dg||!rg||isP)return;
    const rect=mapViewportRef.current?.getBoundingClientRect();
    if(!rect)return;
    const relX=e.clientX-rect.left-pan.x;
    const relY=e.clientY-rect.top-pan.y;
    const gx=Math.floor(relX/zoom/cs);
    const gy=Math.floor(relY/zoom/cs);
    if(gx<0||gy<0||gx>=dg.width||gy>=dg.height)return;
    const cell=rg[gy][gx];
    if(cell.extra?.type==="monster"&&cell.extra.slug){e.preventDefault();setStatCard({slug:cell.extra.slug,view:"player"});}
  };

  const pushToPlayerScreen=useCallback((overrides={})=>{
    if(!dg)return;
    const mergedRevealed=overrides.revealed!=null?new Set(overrides.revealed):revealed;
    const mergedDoorOpen=overrides.doorOpen!=null?new Set(overrides.doorOpen):doorOpen;
    const locT=dg.locationType??cfg.locationType;
    const revealedCells=[...computeVisibleCellsForPlayer(mergedRevealed,dg,mergedDoorOpen,null,{
      openFloor:isOpenFloorLocation(locT),
      maxFogHops:maxFogHopsForLocationType(locT),
    })];
    const state={
      dungeonData:{
        grid:dg.grid,
        rooms:dg.rooms,
        width:dg.width,
        height:dg.height,
        mapName:dg.mapName,
        entities:dg.entities??[],
        decoOverlay:dg.decoOverlay??[],
        locationType:dg.locationType??cfg.locationType,
        floor:dg.floor,
        glyphs:dg.glyphs,
      },
      revealed:[...mergedRevealed],
      revealedCells,
      doorOpen:[...mergedDoorOpen],
      selectedRoomId:overrides.selectedRoomId!==undefined?overrides.selectedRoomId:selRoom,
      fogColor:overrides.fogColor??"#000000",
    };
    broadcastPlayerMapState(state);
  },[dg,revealed,doorOpen,selRoom,cfg.locationType]);
  useEffect(()=>{
    if(cfg.autoSync&&dg)pushToPlayerScreen();
  },[cfg.autoSync,dg,pushToPlayerScreen]);

  const exportPNG=(mode,{ink=false}={})=>{
    if(!dg)return;
    const isDm=mode==="dm";
    const locT2=dg.locationType??cfg.locationType;
    const fogCells=!isDm?computeVisibleCellsForPlayer(revealed,dg,doorOpen,null,{
      openFloor:isOpenFloorLocation(locT2),
      maxFogHops:maxFogHopsForLocationType(locT2),
    }):null;
    const cellPx=Math.max(cfg.exportCellPx??32,cfg.cellPx??18);
    const dpr=ink?1:2;
    const fc={...cfg,showThemes:!!cfg.showThemes&&isDm};
    const gridEx=buildRenderGrid(dg,fc);
    const mapCanvas=document.createElement("canvas");
    renderDungeonToCanvas(mapCanvas,gridEx,{
      palette:LOCATION_PALETTE[dg.locationType]??DEFAULT_PALETTE,
      entities:ENTITY_PALETTE,
      cellPx,
      dpr,
      fogCells,
      doorOpen:!isDm?doorOpen:null,
      showEnts:isDm,
      playerSanitize:!isDm,
      hideDecoKeys:PLAYER_PRINT_HIDE_DECO_KEYS,
      inkSaver:ink,
    });
    let out=mapCanvas;
    if(isDm){
      const sidebarRaw=buildDmExportSidebarLines(dg);
      const sidebarLines=[];
      for(const ln of sidebarRaw)sidebarLines.push(...wrapTextLine(ln,50));
      const fontPx=11*dpr;
      const lineH=Math.round(13*dpr);
      const maxChars=sidebarLines.reduce((m,l)=>Math.max(m,l.length),36);
      const sidebarW=Math.min(520*dpr,Math.max(280*dpr,Math.ceil(maxChars*7*dpr+24*dpr)));
      const S0={...STY[cfg.style],...(LOCATION_STYLE_OVERRIDE[cfg.locationType]||{})};
      const padTop=28*dpr;
      const full=document.createElement("canvas");
      full.width=mapCanvas.width+sidebarW+16*dpr;
      full.height=padTop+Math.max(mapCanvas.height,sidebarLines.length*lineH+16*dpr);
      const fctx=full.getContext("2d");
      if(fctx){
        fctx.fillStyle=ink?hexToGray(S0.bg):S0.bg;
        fctx.fillRect(0,0,full.width,full.height);
        fctx.fillStyle=ink?hexToGray(S0.accent||"#ccc"):S0.accent||"#ccc";
        fctx.font=`bold ${11*dpr}px monospace`;
        fctx.fillText(`${dg.mapName||"Map"} | DM PRINT | Floor ${dg.floor||1} | Seed ${dg.seed??""}`,4*dpr,18*dpr);
        fctx.drawImage(mapCanvas,0,padTop);
        fctx.fillStyle=ink?"#111":S0.textColor;
        fctx.font=`${fontPx}px monospace`;
        let ly=padTop+8*dpr;
        const sx=mapCanvas.width+12*dpr;
        for(const line of sidebarLines){
          fctx.fillText(line,sx,ly);
          ly+=lineH;
        }
      }
      out=full;
    }
    const a=document.createElement("a");
    const inkTag=ink?"-ink":"";
    a.download=`${(dg.mapName||cfg.locationType).replace(/\s/g,"_")}_f${curFloor}_${mode}${inkTag}_${cfg.seed}.png`;
    a.href=out.toDataURL("image/png");
    a.click();
  };

  return(
    <div
      className="forge-layout"
      style={{
        display:"flex",
        flexDirection:"column",
        width:"100%",
        height:"100%",
        minHeight:0,
        minWidth:0,
        paddingInline:"var(--forge-pad)",
        paddingBlock:"var(--forge-pad)",
        boxSizing:"border-box",
        background:S.bg,
        color:S.textColor,
        fontFamily:"'Courier New',monospace",
        fontSize:13,
        ["--forge-border"]:S.panelBorder,
        ["--forge-bg"]:S.bg,
      }}
    >
      <style>{`@keyframes forge-pulse { 0%,100%{opacity:0.35;} 50%{opacity:1;} }`}</style>
      <div style={{padding:"7px 12px",borderBottom:`1px solid ${S.panelBorder}`,background:S.headerBg,display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:4}}>
        <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
          <span style={{fontSize:17,fontWeight:"bold",color:S.accent,letterSpacing:3}}>DUNGEON FORGE</span>
          {dg?.mapName&&<span style={{fontSize:14,color:S.accent,fontStyle:"italic"}}>— {dg.mapName}{floors.length>1?` (Floor ${curFloor}/${floors.length})`:""}</span>}
        </div>
        <div style={{display:"flex",gap:2}}>
          {[["terminal","TERM"],["rogue","DARK"],["grid","LIGHT"]].map(([k,l])=>(
            <button key={k} onClick={()=>u("style",k)} style={{padding:"3px 10px",fontSize:12,letterSpacing:1,fontFamily:"'Courier New',monospace",background:cfg.style===k?"rgba(255,255,255,0.08)":"transparent",color:cfg.style===k?S.accent:S.dimText,border:cfg.style===k?`1px solid ${S.accent}`:"1px solid transparent",borderRadius:2,cursor:"pointer"}}>{l}</button>
          ))}
        </div>
      </div>
      <div className="forge-layout-row">
        <div
          className="forge-sidebar-left"
          style={{
            width:258,
            boxSizing:"border-box",
            minWidth:0,
            padding:"8px 10px",
            background:S.panelBg,
            display:"flex",
            flexDirection:"column",
            gap:6,
            overflowY:"auto",
            overflowX:"hidden",
          }}
        >
          <LB S={S}>LOCATION</LB>
          <select value={cfg.locationType} onChange={e=>u("locationType",e.target.value)} style={{padding:"4px 6px",fontSize:13,fontFamily:"'Courier New',monospace",background:S.inputBg,color:S.inputFg,border:`1px solid ${S.inputBorder}`,borderRadius:2,width:"100%"}}>
            {Object.entries(LOCATIONS).map(([k,v])=><option key={k} value={k}>{v.name}</option>)}
          </select>
          {LOCATION_DESCRIPTIONS[cfg.locationType]&&<div style={{fontSize:11,color:S.dimText,fontStyle:"italic",lineHeight:1.35}}>{LOCATION_DESCRIPTIONS[cfg.locationType]}</div>}
          <LB S={S}>CONFIG</LB>
          <NI l={ROOM_LABEL[cfg.locationType]??"Rooms"} v={cfg.roomCount} mn={3} mx={22} S={S} set={v=>u("roomCount",v)}/>
          <NI l="Floors" v={cfg.depth} mn={1} mx={10} S={S} set={v=>u("depth",v)}/>
          <NI l="Party Lv" v={cfg.level} mn={1} mx={20} S={S} set={v=>u("level",v)}/>
          <NI l="Width" v={cfg.width} mn={40} mx={140} S={S} set={v=>u("width",v)}/>
          <NI l="Height" v={cfg.height} mn={30} mx={90} S={S} set={v=>u("height",v)}/>
          <LB S={S}>ENCOUNTERS</LB>
          <Tg l="Monsters" on={cfg.monstersOn} S={S} f={()=>u("monstersOn",!cfg.monstersOn)}/>
          <Tg l="Traps" on={cfg.trapsOn} S={S} f={()=>u("trapsOn",!cfg.trapsOn)}/>
          <Tg l="Items" on={cfg.itemsOn} S={S} f={()=>u("itemsOn",!cfg.itemsOn)}/>
          <LB S={S}>MAP ZOOM</LB>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <button type="button" className="btn-secondary" style={{padding:"4px 10px",fontSize:12,fontFamily:"'Courier New',monospace",background:S.inputBg,color:S.accent,border:`1px solid ${S.inputBorder}`,borderRadius:2,cursor:"pointer",minHeight:0}}
              onClick={()=>setCfg((c)=>({...c,cellPx:Math.max(8,(c.cellPx??18)-4)}))}>−</button>
            <span style={{fontSize:13,fontFamily:"'Courier New',monospace",color:S.textColor,width:52,textAlign:"center"}}>{cfg.cellPx??18}px</span>
            <button type="button" className="btn-secondary" style={{padding:"4px 10px",fontSize:12,fontFamily:"'Courier New',monospace",background:S.inputBg,color:S.accent,border:`1px solid ${S.inputBorder}`,borderRadius:2,cursor:"pointer",minHeight:0}}
              onClick={()=>setCfg((c)=>({...c,cellPx:Math.min(48,(c.cellPx??18)+4)}))}>+</button>
          </div>
          <div style={{fontSize:10,color:S.dimText,marginTop:4,lineHeight:1.35}}>Live map uses this size; the canvas may shrink to fit the panel.</div>
          <LB S={S}>PNG EXPORT SCALE</LB>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <button type="button" className="btn-secondary" style={{padding:"4px 10px",fontSize:12,fontFamily:"'Courier New',monospace",background:S.inputBg,color:S.accent,border:`1px solid ${S.inputBorder}`,borderRadius:2,cursor:"pointer",minHeight:0}}
              onClick={()=>setCfg((c)=>({...c,exportCellPx:Math.max(16,(c.exportCellPx??32)-4)}))}>−</button>
            <span style={{fontSize:13,fontFamily:"'Courier New',monospace",color:S.textColor,width:52,textAlign:"center"}}>{cfg.exportCellPx??32}px</span>
            <button type="button" className="btn-secondary" style={{padding:"4px 10px",fontSize:12,fontFamily:"'Courier New',monospace",background:S.inputBg,color:S.accent,border:`1px solid ${S.inputBorder}`,borderRadius:2,cursor:"pointer",minHeight:0}}
              onClick={()=>setCfg((c)=>({...c,exportCellPx:Math.min(64,(c.exportCellPx??32)+4)}))}>+</button>
          </div>
          <div style={{fontSize:10,color:S.dimText,marginTop:2,lineHeight:1.35}}>Same pixel renderer as the live map; larger cells for sharper PNGs (DM/Player buttons use max of this and map zoom).</div>
          <LB S={S}>ASCII COPY</LB>
          <div style={{fontSize:11,color:S.dimText,lineHeight:1.35}}>Plain text grid (same topology as the map).</div>
          <button type="button" onClick={()=>{const u=new URL(window.location.href);u.searchParams.set("seed",String(cfg.seed));u.searchParams.set("loc",cfg.locationType);u.searchParams.set("level",String(cfg.level));void navigator.clipboard.writeText(u.toString());}} style={{padding:"4px 0",fontSize:12,fontFamily:"'Courier New',monospace",background:S.inputBg,color:S.dimText,border:`1px solid ${S.inputBorder}`,borderRadius:2,cursor:"pointer",width:"100%"}}>COPY SHARE URL</button>
          <button type="button" disabled={!dg||!asciiExport?.text} onClick={()=>{if(!dg||!asciiExport)return;const cellPx=Math.max(24,cfg.exportCellPx??32);const gridDm=buildRenderGrid(dg,{...cfg,showThemes:!!cfg.showThemes});const dmEl=document.createElement("canvas");renderDungeonToCanvas(dmEl,gridDm,{palette:LOCATION_PALETTE[dg.locationType]??DEFAULT_PALETTE,entities:ENTITY_PALETTE,cellPx,dpr:2,showEnts:true,playerSanitize:false,inkSaver:false});const dm=dmEl.toDataURL("image/png");const lines=dg.rooms.map(r=>`Room ${r.id}: ${r.isSecretRoom?"[SECRET] ":""}${r.namedRoom||r.label||r.type} (depth ${r.depth??"?"}, theme ${r.theme||"?"})`);openForgePrintPacket({title:`${dg.mapName||"Forge"} seed ${cfg.seed}`,asciiText:asciiExport.text,dmMapDataUrl:dm,roomLines:lines});}} style={{padding:"4px 0",fontSize:12,fontFamily:"'Courier New',monospace",background:S.inputBg,color:S.dimText,border:`1px solid ${S.inputBorder}`,borderRadius:2,cursor:"pointer",width:"100%"}}>PRINT DM PACKET</button>
          <LB S={S}>SEED</LB>
          <div style={{display:"flex",gap:2}}>
            <input type="number" value={cfg.seed} onChange={e=>u("seed",parseInt(e.target.value)||0)} style={{flex:1,padding:"2px 3px",fontSize:16,fontFamily:"'Courier New',monospace",background:S.inputBg,color:S.inputFg,border:`1px solid ${S.inputBorder}`,borderRadius:2,width:30}}/>
            <button onClick={()=>u("seed",Math.floor(Math.random()*999999))} style={{padding:"2px 5px",fontSize:14,fontFamily:"'Courier New',monospace",background:S.inputBg,color:S.dimText,border:`1px solid ${S.inputBorder}`,borderRadius:2,cursor:"pointer"}}>RNG</button>
          </div>
          <button onClick={()=>u("seed",Math.floor(Math.random()*999999))} style={{marginTop:3,padding:"6px 0",fontSize:16,fontWeight:"bold",fontFamily:"'Courier New',monospace",letterSpacing:2,background:S.inputBg,color:S.btnFg,border:`1px solid ${S.btnBorder}`,borderRadius:2,cursor:"pointer"}}>NEW MAP [Ctrl+G]</button>
          <button onClick={()=>void generate()} style={{marginTop:3,padding:"6px 0",fontSize:16,fontWeight:"bold",fontFamily:"'Courier New',monospace",letterSpacing:2,background:S.inputBg,color:S.dimText,border:`1px solid ${S.inputBorder}`,borderRadius:2,cursor:"pointer"}}>RE-RUN</button>
          <LB S={S}>VIEW</LB>
          <div style={{display:"flex",gap:2}}>
            {[["dm","DM"],["player","PLAYER"]].map(([k,l])=>(
              <button key={k} onClick={()=>setView(k)} style={{flex:1,padding:"2px 0",fontSize:14,fontFamily:"'Courier New',monospace",background:view===k?"rgba(255,255,255,0.06)":"transparent",color:view===k?S.accent:S.dimText,border:`1px solid ${view===k?S.accent:S.panelBorder}`,borderRadius:2,cursor:"pointer"}}>{l}</button>
            ))}
          </div>
          {isP&&<div style={{fontSize:14,color:S.dimText}}>
            <div style={{marginBottom:2}}>Fog uses revealed rooms + open doors. On the DM map, click a door to open or close it (gold = open, braced = closed).</div>
            <div style={{display:"flex",gap:2}}>
              <button onClick={()=>setRevealed(new Set(rooms.map(r=>r.id)))} style={{flex:1,padding:"1px",fontSize:16,fontFamily:"'Courier New',monospace",background:S.inputBg,color:S.accent,border:`1px solid ${S.inputBorder}`,borderRadius:2,cursor:"pointer"}}>Reveal All</button>
              <button onClick={()=>{const id=dg?inferStartingRoomId(dg):null;setRevealed(new Set([id??rooms[0]?.id??1]));setDoorOpen(new Set());}} style={{flex:1,padding:"1px",fontSize:16,fontFamily:"'Courier New',monospace",background:S.inputBg,color:S.accentAlt,border:`1px solid ${S.inputBorder}`,borderRadius:2,cursor:"pointer"}}>Reset</button>
            </div>
          </div>}
          <LB S={S}>EXPORT PNG</LB>
          <div style={{fontSize:11,color:S.dimText,lineHeight:1.35,marginBottom:4}}>Color exports match the header theme (TERM / DARK / LIGHT) and location tints. DM includes the room key column. Player hides secrets. Ink uses grayscale from the same map (saves toner, not blocky).</div>
          <div style={{display:"flex",gap:2,flexWrap:"wrap"}}>
            <button type="button" onClick={()=>exportPNG("dm")} style={{flex:1,minWidth:100,padding:"4px",fontSize:14,fontFamily:"'Courier New',monospace",background:S.inputBg,color:S.accent,border:`1px solid ${S.inputBorder}`,borderRadius:2,cursor:"pointer"}}>DM · color</button>
            <button type="button" onClick={()=>exportPNG("player")} style={{flex:1,minWidth:100,padding:"4px",fontSize:14,fontFamily:"'Courier New',monospace",background:S.inputBg,color:S.accent,border:`1px solid ${S.inputBorder}`,borderRadius:2,cursor:"pointer"}}>Player · color</button>
          </div>
          <div style={{display:"flex",gap:2,flexWrap:"wrap",marginTop:4}}>
            <button type="button" onClick={()=>exportPNG("dm",{ink:true})} style={{flex:1,minWidth:100,padding:"4px",fontSize:14,fontFamily:"'Courier New',monospace",background:S.inputBg,color:S.dimText,border:`1px solid ${S.inputBorder}`,borderRadius:2,cursor:"pointer"}}>DM · ink</button>
            <button type="button" onClick={()=>exportPNG("player",{ink:true})} style={{flex:1,minWidth:100,padding:"4px",fontSize:14,fontFamily:"'Courier New',monospace",background:S.inputBg,color:S.dimText,border:`1px solid ${S.inputBorder}`,borderRadius:2,cursor:"pointer"}}>Player · ink</button>
          </div>
          <LB S={S}>LIBRARY</LB>
          <button type="button" onClick={async()=>{
            if(!dg) return;
            setSaveLibraryMsg(null);
            try{
              const res=await fetch("/api/generate/dungeons/save-forge",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({seed:cfg.seed,locationType:cfg.locationType,levelMin:1,levelMax:cfg.level,mapName:dg.mapName||cfg.locationType,rooms:dg.rooms,width:dg.width,height:dg.height})});
              const data=await res.json().catch(()=>({}));
              if(!res.ok) throw new Error(typeof data.error==="string"?data.error:`HTTP ${res.status}`);
              setSaveLibraryMsg("Saved to Dungeons library.");
              setTimeout(()=>setSaveLibraryMsg(null),5000);
            }catch(err){ setSaveLibraryMsg(String(err)); }
          }} style={{padding:"6px 0",fontSize:14,fontWeight:"bold",fontFamily:"'Courier New',monospace",letterSpacing:1,background:S.inputBg,color:S.accentAlt,border:`1px solid ${S.inputBorder}`,borderRadius:2,cursor:"pointer"}}>SAVE TO LIBRARY</button>
          {saveLibraryMsg&&<div style={{fontSize:12,color:saveLibraryMsg.startsWith("Saved")?S.accent:S.accentAlt}}>{saveLibraryMsg}</div>}
          <LB S={S}>ACTIVE SESSION</LB>
          <select
            value={selectedSessionId}
            onChange={e=>setSelectedSessionId(e.target.value)}
            style={{padding:"4px 6px",fontSize:13,fontFamily:"'Courier New',monospace",background:S.inputBg,color:S.inputFg,border:`1px solid ${S.inputBorder}`,borderRadius:2,width:"100%"}}
          >
            <option value="">Select session...</option>
            {sessions.map(s=><option key={s.id} value={s.id}>{s.name}{s.status==="active"?" (active)":""}</option>)}
          </select>
          <button
            disabled={!dg||!selectedSessionId}
            onClick={async()=>{
              if(!dg||!selectedSessionId)return;
              const payload={
                dungeonSeed:cfg.seed,
                locationType:cfg.locationType,
                mapName:dg.mapName,
                rooms:dg.rooms,
                entities:dg.entities,
                decoOverlay:dg.decoOverlay??[],
                glyphs:dg.glyphs,
                width:dg.width,
                height:dg.height,
                floor:curFloor,
                grid:dg.grid,
              };
              await fetch(`/api/sessions/${selectedSessionId}/dungeon`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
              try{window.postMessage({type:"forge:session-dungeon-saved",sessionId:selectedSessionId},"*");}catch(_){/* noop */}
              setSendMsg("Sent to session!");
              setTimeout(()=>setSendMsg(null),3000);
            }}
            style={{marginTop:3,padding:"6px 0",fontSize:14,fontWeight:"bold",fontFamily:"'Courier New',monospace",letterSpacing:2,background:S.inputBg,color:S.accent,border:`1px solid ${S.btnBorder}`,borderRadius:2,cursor:"pointer",width:"100%"}}
          >
            SEND TO SESSION
          </button>
          {sendMsg&&<div style={{color:S.accent,fontSize:11}}>{sendMsg}</div>}
          <LB S={S}>PLAYER SCREEN</LB>
          <button type="button" onClick={()=>window.open("/dungeons/player","_blank","noopener")} style={{padding:"6px 0",fontSize:12,fontFamily:"'Courier New',monospace",background:S.inputBg,color:S.accent,border:`1px solid ${S.inputBorder}`,borderRadius:2,cursor:"pointer",width:"100%"}}>OPEN PLAYER SCREEN ↗</button>
          <button type="button" onClick={()=>pushToPlayerScreen()} disabled={!dg} style={{padding:"6px 0",fontSize:12,fontFamily:"'Courier New',monospace",background:S.inputBg,color:S.accent,border:`1px solid ${S.inputBorder}`,borderRadius:2,cursor:"pointer",width:"100%"}}>PUSH MAP TO SCREEN</button>
          <button type="button" onClick={()=>pushToPlayerScreen({revealed:[...revealed],doorOpen:[...doorOpen],selectedRoomId:selRoom})} disabled={!dg} style={{padding:"6px 0",fontSize:12,fontFamily:"'Courier New',monospace",background:S.inputBg,color:S.accent,border:`1px solid ${S.inputBorder}`,borderRadius:2,cursor:"pointer",width:"100%"}}>PUSH WITH FOG STATE</button>
          <Tg l="Auto-sync fog on change" on={!!cfg.autoSync} S={S} f={()=>u("autoSync",!cfg.autoSync)}/>
          {floors.length>1&&<><LB S={S}>FLOOR</LB><div style={{display:"flex",gap:2,flexWrap:"wrap"}}>
            {floors.map((_,i)=>(<button key={i} onClick={()=>{setCurFloor(i+1);setDg(floors[i]);setSelRoom(null);setTvRoom(null);setForgeInspect(null);setDoorOpen(new Set());}} style={{padding:"1px 5px",fontSize:14,fontFamily:"'Courier New',monospace",background:curFloor===i+1?"rgba(255,255,255,0.08)":"transparent",color:curFloor===i+1?S.accent:S.dimText,border:`1px solid ${curFloor===i+1?S.accent:S.panelBorder}`,borderRadius:2,cursor:"pointer"}}>{i+1}</button>))}
          </div></>}
          <div style={{marginTop:1}}><button onClick={()=>setLegend(!legend)} style={{background:"none",border:"none",cursor:"pointer",padding:0,color:S.dimText,fontSize:14,fontFamily:"'Courier New',monospace"}}>{legend?"[-]":"[+]"} LEGEND</button>
            {legend&&<div style={{marginTop:2,fontSize:14,lineHeight:1.7,color:S.textColor}}>
              {[["#","Wall",S.wallFg],[".","Floor",S.floorFg],["+","Door",S.doorFg],[":","Road",S.roadFg],["<","Up",S.stairsFg],[">","Down",S.stairsFg],["A-Z","Monster",S.monsterFg],["^","Trap",S.trapFg],["!","Item",S.itemFg],["var","Decor","#f80"]].map(([c,d,f],i)=>(
                <div key={i} style={{display:"flex",alignItems:"center",gap:5}}><span style={{color:f,fontWeight:"bold",minWidth:22,textAlign:"center"}}>{c}</span><span>{d}</span></div>))}
            </div>}
          </div>
          {asciiExport?.mapOnly&&(
            <div style={{marginTop:4}}>
              <div style={{fontSize:10,color:S.dimText,marginBottom:2}}>ASCII preview</div>
              <pre style={{margin:0,maxHeight:180,overflow:"auto",padding:6,background:S.bg,border:`1px solid ${S.panelBorder}`,fontFamily:"JetBrains Mono, Fira Code, ui-monospace, Menlo, monospace",fontSize:12,lineHeight:1,letterSpacing:0,fontVariantLigatures:"none",color:S.textColor,whiteSpace:"pre"}}>{asciiExport.mapOnly}</pre>
            </div>
          )}
        </div>

        <div className="forge-main-row">
          <div style={{flex:"1 1 0",minHeight:0,minWidth:0,display:"flex",flexDirection:"column",width:"100%"}}>
          <div
            ref={mapViewportRef}
            style={{
              flex:1,
              minHeight:0,
              minWidth:0,
              overflow:"hidden",
              position:"relative",
              width:"100%",
              background:"var(--forge-bg, transparent)",
              contain:"layout paint",
            }}
          >
            {rg&&dg&&(
              <>
                <div
                  onPointerDown={onCanvasPointerDown}
                  onPointerMove={onCanvasPointerMove}
                  onPointerUp={onCanvasPointerUp}
                  onPointerCancel={onCanvasPointerUp}
                  onContextMenu={onMapContextMenu}
                  style={{
                    position:"absolute",
                    inset:0,
                    overflow:"hidden",
                    cursor:dragging?"grabbing":zoom>1?"grab":"default",
                    touchAction:"none",
                  }}
                >
                  <div
                    ref={mapPanRef}
                    style={{
                      position:"absolute",
                      left:0,
                      top:0,
                      transform:`translate(${pan.x}px,${pan.y}px) scale(${zoom})`,
                      transformOrigin:"0 0",
                      willChange:"transform",
                    }}
                  >
                    <div style={{position:"relative",display:"inline-block",verticalAlign:"top"}}>
                      <DungeonMapCanvas
                        grid={rg}
                        cellPx={cs}
                        palette={LOCATION_PALETTE[dg.locationType]??DEFAULT_PALETTE}
                        entities={ENTITY_PALETTE}
                        fogCells={mapFogCells}
                        doorOpen={doorOpen}
                        showEnts={!isP}
                        playerSanitize={false}
                        highlightRoom={highlightRoom}
                        animPhase={animPhase}
                        onCellClick={handleMapCellClick}
                      />
                      {isP&&revealableDoors.map(({x,y})=>(
                        <div
                          key={`rd-${x}-${y}`}
                          style={{
                            position:"absolute",
                            left:x*cs,
                            top:y*cs,
                            width:cs,
                            height:cs,
                            border:`2px solid ${S.accent}`,
                            boxShadow:`0 0 ${Math.max(4,cs/2)}px ${S.accent}`,
                            animation:"forge-pulse 1.4s ease-in-out infinite",
                            pointerEvents:"none",
                            borderRadius:2,
                            zIndex:2,
                          }}
                        />
                      ))}
                    </div>
                  </div>
                  {mapHoverTip&&(
                    <div
                      style={{
                        position:"absolute",
                        top:10,
                        left:10,
                        zIndex:5,
                        pointerEvents:"none",
                        background:"rgba(0,0,0,0.78)",
                        color:S.textColor,
                        fontSize:11,
                        padding:"4px 8px",
                        borderRadius:2,
                        border:`1px solid ${S.panelBorder}`,
                        maxWidth:280,
                      }}
                    >
                      {mapHoverTip}
                    </div>
                  )}
                </div>
                <div
                  style={{
                    position:"absolute",
                    top:8,
                    right:8,
                    display:"flex",
                    flexDirection:"column",
                    alignItems:"stretch",
                    gap:4,
                    zIndex:3,
                    pointerEvents:"auto",
                  }}
                >
                  <div style={{display:"flex",gap:4,justifyContent:"flex-end"}}>
                    {["+","-"].map((l,i)=>(
                      <button
                        key={l}
                        type="button"
                        onClick={()=>setZoom((z)=>Math.max(0.3,Math.min(8,z*(i===0?1.25:0.8))))}
                        style={{
                          padding:"4px 10px",
                          fontSize:12,
                          fontFamily:"'Courier New',monospace",
                          background:S.inputBg,
                          color:S.accent,
                          border:`1px solid ${S.inputBorder}`,
                          borderRadius:2,
                          cursor:"pointer",
                        }}
                      >
                        ZOOM {l}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={()=>{setZoom(1);setPan({x:0,y:0});}}
                    style={{
                      padding:"4px 8px",
                      fontSize:11,
                      fontFamily:"'Courier New',monospace",
                      background:S.inputBg,
                      color:S.dimText,
                      border:`1px solid ${S.inputBorder}`,
                      borderRadius:2,
                      cursor:"pointer",
                    }}
                  >
                    Reset view
                  </button>
                </div>
              </>
            )}
          </div>
          <DungeonLegend locationType={cfg.locationType} />
          </div>
          {hovered&&coarsePointer&&<div style={{position:"fixed",bottom:"max(10px, var(--safe-bottom, 0px))",left:"50%",transform:"translateX(-50%)",background:S.panelBg,color:S.textColor,border:`1px solid ${S.panelBorder}`,padding:"5px 14px",fontSize:13,fontFamily:"'Courier New',monospace",borderRadius:2,zIndex:100,pointerEvents:"none",maxWidth:"min(96vw,420px)",whiteSpace:"normal"}}>
            {hovered.type==="monster"&&<><b style={{color:S.monsterFg}}>{hovered.name}</b> x{hovered.count} (CR {hovered.cr})</>}
            {hovered.type==="trap"&&<><b style={{color:S.trapFg}}>{hovered.name}</b> — {hovered.dmg}</>}
            {hovered.type==="item"&&<><b style={{color:RM[hovered.r]||S.itemFg}}>{hovered.name}</b> ({hovered.r})</>}
            {hovered.type==="riddle"&&<><b style={{color:"#daf"}}>Riddle</b><div style={{fontSize:11,marginTop:4,color:S.dimText}}>{hovered.prompt}</div></>}
          </div>}
          <div
            className="forge-sidebar-right"
            style={{
              background:S.panelBg,
              padding:"8px 10px",
              overflowY:"auto",
              width:272,
              minWidth:0,
              boxSizing:"border-box",
            }}
          >
            {!coarsePointer&&hovered&&<div style={{position:"sticky",top:0,zIndex:5,marginBottom:6,background:S.panelBg,padding:"5px 10px",border:`1px solid ${S.panelBorder}`,borderRadius:2,whiteSpace: hovered.type==="riddle"?"normal":"nowrap"}}>
              {hovered.type==="monster"&&<><b style={{color:S.monsterFg}}>{hovered.name}</b> x{hovered.count} (CR {hovered.cr})</>}
              {hovered.type==="trap"&&<><b style={{color:S.trapFg}}>{hovered.name}</b> — {hovered.dmg}</>}
              {hovered.type==="item"&&<><b style={{color:RM[hovered.r]||S.itemFg}}>{hovered.name}</b> ({hovered.r})</>}
              {hovered.type==="riddle"&&<><b style={{color:"#daf"}}>Riddle</b><div style={{fontSize:10,marginTop:4,color:S.textColor,maxHeight:72,overflow:"auto"}}>{hovered.prompt}</div></>}
            </div>}
            {selRoom?(()=>{const rm=rooms.find(r=>r.id===selRoom);if(!rm)return null;const re=ents.filter(e=>e.roomId===selRoom);const rd=decos.filter(d=>d.roomId===selRoom);const decoNames=[...new Set(rd.map(d=>d.name))];
              return(<div>
                <div style={{fontSize:14,fontWeight:"bold",marginBottom:4,color:S.accent,display:"flex",alignItems:"center",gap:5,flexWrap:"wrap"}}>
                  <span>{rm.namedRoom||`Room ${rm.id}`}: {rm.label||rm.type}</span>
                  {!isP&&rm.isSecretRoom&&<span style={{fontSize:9,fontWeight:"bold",letterSpacing:0.5,color:"#9cf",border:"1px solid rgba(120,200,255,0.55)",padding:"1px 6px",borderRadius:3}}>SECRET ROOM</span>}
                  <span style={{fontSize:10,fontWeight:"normal",color:S.dimText}}>{rm.w}x{rm.h}</span>
                  {!isP&&rm.theme&&<span style={{fontSize:10,fontWeight:"normal",color:S.accentAlt}}>theme {rm.theme}</span>}
                  {!isP&&typeof rm.depth==="number"&&<span style={{fontSize:10,fontWeight:"normal",color:S.dimText}}>depth {rm.depth}</span>}
                  {isP&&<button onClick={()=>{const n=new Set(revealed);if(n.has(rm.id))n.delete(rm.id);else n.add(rm.id);setRevealed(n);}} style={{marginLeft:"auto",padding:"3px 8px",fontSize:10,fontFamily:"'Courier New',monospace",background:S.inputBg,color:revealed.has(rm.id)?S.accentAlt:S.accent,border:`1px solid ${S.inputBorder}`,borderRadius:2,cursor:"pointer"}}>{revealed.has(rm.id)?"HIDE":"REVEAL ROOM"}</button>}
                  <button type="button" onClick={()=>setSelRoom(null)} style={{padding:"3px 8px",fontSize:10,fontFamily:"'Courier New',monospace",background:S.inputBg,color:S.dimText,border:`1px solid ${S.inputBorder}`,borderRadius:2,cursor:"pointer"}}>✕ Clear</button>
                  {!isP&&<button type="button" onClick={()=>setRevealed(new Set([rm.id]))} style={{padding:"3px 8px",fontSize:10,fontFamily:"'Courier New',monospace",background:S.inputBg,color:S.accent,border:`1px solid ${S.inputBorder}`,borderRadius:2,cursor:"pointer"}}>Set as Start Room</button>}
                  <button type="button" onClick={()=>setTvRoom(rm.id)} style={{padding:"3px 8px",fontSize:10,fontFamily:"'Courier New',monospace",background:S.inputBg,color:S.accentAlt,border:`1px solid ${S.inputBorder}`,borderRadius:2,cursor:"pointer"}}>📺 TV</button>
                </div>
                {!isP&&rm.stairDownTo&&<div style={{fontSize:12,color:S.dimText,marginBottom:2}}>▼ Stair down → Floor {rm.stairDownTo}</div>}
                {!isP&&rm.stairUpTo&&<div style={{fontSize:12,color:S.dimText,marginBottom:2}}>▲ Stair up → Floor {rm.stairUpTo}</div>}
                {!isP&&decoNames.length>0&&<div style={{fontSize:12,color:S.dimText,marginBottom:2}}>Scenery: {decoNames.join(", ")}</div>}
                {!isP&&rm.secretHint&&<div style={{fontSize:11,color:"#9cf",marginBottom:4}}>Secret clue (DM): {rm.secretHint}</div>}
                {isP?<div style={{fontSize:12,fontStyle:"italic",color:S.dimText}}>Entities hidden in player view</div>:
                  re.length===0?<div style={{fontSize:12,fontStyle:"italic",color:S.dimText}}>No encounters</div>:
                  <div style={{display:"flex",flexDirection:"column",gap:2}}>
                    {re.map((e,i)=>(<div key={i} style={{display:"flex",alignItems:"center",gap:4,fontSize:12,padding:"1px 4px",background:"rgba(255,255,255,0.02)",borderRadius:2,border:`1px solid ${S.panelBorder}`}}>
                      {e.type==="trap"&&(
                        <div style={{background:"rgba(255,120,0,0.08)",border:`1px solid ${S.trapFg}`,borderRadius:3,padding:"6px 8px",fontSize:11,width:"100%"}}>
                          <div style={{fontWeight:"bold",color:S.trapFg}}>⚠ {e.name}</div>
                          <div style={{color:S.textColor,marginTop:2}}><b>Damage:</b> {e.dmg}</div>
                          {e.detectDC&&<div style={{color:S.dimText}}><b>Detection:</b> DC {e.detectDC} Perception</div>}
                          {e.saveDC>0&&<div style={{color:S.dimText}}><b>{e.saveType} Save:</b> DC {e.saveDC}</div>}
                          {e.effect&&<div style={{color:S.dimText,marginTop:2,fontStyle:"italic"}}>{e.effect}</div>}
                        </div>
                      )}
                      {e.type==="item"&&(
                        <div style={{fontSize:11,border:`1px solid ${S.panelBorder}`,borderRadius:3,padding:"5px 8px",width:"100%"}}>
                          <div style={{fontWeight:"bold",color:RM[e.r]||S.itemFg}}>
                            {e.name} <span style={{fontSize:9,color:S.dimText}}>({e.r})</span>
                          </div>
                          {partyCharacters.length>0&&(
                            <select
                              onChange={async(ev)=>{
                                const charId=ev.target.value;
                                if(!charId)return;
                                setGiveItemTarget(charId);
                                await fetch(`/api/characters/${charId}/inventory`,{
                                  method:"POST",
                                  headers:{"Content-Type":"application/json"},
                                  body:JSON.stringify({customName:e.name,quantity:1,notes:`Found in ${rm?.label||"room"} (${e.r} rarity)`}),
                                });
                                ev.target.value="";
                                setGiveItemTarget(null);
                              }}
                              value={giveItemTarget&&partyCharacters.some(c=>c.id===giveItemTarget)?giveItemTarget:""}
                              style={{marginTop:4,width:"100%",fontSize:10,padding:"2px",background:S.inputBg,color:S.inputFg,border:`1px solid ${S.inputBorder}`,borderRadius:2}}
                            >
                              <option value="">+ Give to player...</option>
                              {partyCharacters.map(c=>(<option key={c.id} value={c.id}>{c.name}</option>))}
                            </select>
                          )}
                        </div>
                      )}
                      {e.type==="monster"&&(
                        <>
                          <span style={{fontWeight:"bold",color:S.monsterFg,minWidth:16}}>[M]</span>
                          {e.slug?(
                            <button type="button" onClick={()=>setStatCard({slug:e.slug,view:"dm"})} onContextMenu={(ev)=>{ev.preventDefault();setStatCard({slug:e.slug,view:"player"});}} style={{background:"none",border:"none",padding:0,cursor:"pointer",color:S.textColor,textAlign:"left"}}>
                              <b>{e.name}</b>{e.unresolved&&<span style={{color:S.accentAlt}} title="Unresolved SRD match"> ●</span>}
                              <span> x{e.count} (CR {e.cr})</span>
                            </button>
                          ):(<><b>{e.name}</b><span> x{e.count} (CR {e.cr})</span></>)}
                        </>
                      )}
                      {e.type==="riddle"&&(
                        <div style={{background:"rgba(180,140,255,0.08)",border:"1px solid #86a",borderRadius:3,padding:"6px 8px",fontSize:11,width:"100%"}}>
                          <div style={{fontWeight:"bold",color:"#daf"}}>? Riddle</div>
                          <div style={{color:S.textColor,marginTop:4}}>{e.prompt}</div>
                          <div style={{color:S.dimText,marginTop:6,fontStyle:"italic"}}><b>DM answer:</b> {e.answer}</div>
                          {e.rewardName&&<div style={{fontSize:10,color:S.accentAlt,marginTop:4}}>Reward hook: {e.rewardName}</div>}
                        </div>
                      )}
                    </div>))}
                    {!isP&&re.some(e=>e.type==="monster")&&(
                      <div style={{marginTop:8}}>
                        <button
                          type="button"
                          disabled={!selectedSessionId}
                          onClick={async()=>{
                            const monsters=re.filter(e=>e.type==="monster");
                            if(monsters.length===0)return;
                            const payload={
                              v:2,
                              source:"dungeon-forge",
                              savedAt:new Date().toISOString(),
                              seed:cfg.seed,
                              locationType:cfg.locationType,
                              level:cfg.level,
                              sessionId:selectedSessionId||undefined,
                              rooms:dg.rooms.map(r=>({id:r.id,name:r.namedRoom||r.label,theme:r.theme,depth:r.depth,shape:r.shape,boundingBox:{x:r.x,y:r.y,w:r.w,h:r.h}})),
                              encounters:[{
                                roomId:rm.id,
                                difficulty:"medium",
                                xpBudget:0,
                                monsters:monsters.map(e=>({slug:e.slug||"",name:e.name,count:e.count,cr:e.cr})),
                              }],
                              treasure:[],
                              traps:[],
                              notes:"",
                            };
                            try{
                              const res=await fetch("/api/encounters/import-from-forge",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
                              const data=await res.json().catch(()=>({}));
                              if(!res.ok) throw new Error(typeof data.error==="string"?data.error:`HTTP ${res.status}`);
                              setSaveLibraryMsg(data.createdEncounterIds?.length?`Created ${data.createdEncounterIds.length} combat(s) in session.`:"Import completed.");
                              setTimeout(()=>setSaveLibraryMsg(null),6000);
                            }catch(err){ setSaveLibraryMsg(String(err)); }
                          }}
                          style={{padding:"6px 8px",fontSize:11,fontFamily:"'Courier New',monospace",background:S.inputBg,color:S.accent,border:`1px solid ${S.inputBorder}`,borderRadius:2,cursor:selectedSessionId?"pointer":"not-allowed",width:"100%",opacity:selectedSessionId?1:0.45}}
                        >
                          START COMBAT IN SESSION
                        </button>
                      </div>
                    )}
                  </div>}
                <div style={{marginTop:10}}>
                  <button type="button" onClick={()=>setTvRoom(rm.id)} style={{width:"100%",padding:"6px 8px",fontSize:12,fontFamily:"'Courier New',monospace",background:S.inputBg,color:S.accentAlt,border:`1px solid ${S.inputBorder}`,borderRadius:2,cursor:"pointer"}}>POP OUT ROOM</button>
                </div>
              </div>);})():(<div>
              {isP&&(
                <div style={{fontSize:11,marginBottom:4,color:S.accent}}>
                  Select a room on the map or list, then press REVEAL ROOM. Paths from rooms you already revealed stay visible.
                </div>
              )}
              <div style={{fontSize:12,marginBottom:2,color:S.dimText,fontStyle:"italic"}}>Click a room to inspect{isP?" / toggle fog":""}</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:2,alignItems:"center"}}>
                {rooms.map(r=>{const re=ents.filter(e=>e.roomId===r.id);const vis=revealed.has(r.id);
                  return(
                    <div key={r.id} style={{display:"flex",alignItems:"stretch",gap:2}}>
                      <button type="button" onClick={()=>setSelRoom((prev)=>prev===r.id?null:r.id)} style={{padding:"3px 6px",fontSize:10,fontFamily:"'Courier New',monospace",background:"rgba(255,255,255,0.03)",color:isP&&!vis?S.dimText:S.textColor,border:`1px solid ${S.panelBorder}`,borderRadius:2,cursor:"pointer",display:"flex",alignItems:"center",gap:3,opacity:isP&&!vis?0.4:1}}>
                        <b>{r.id}</b><span style={{fontSize:9}}>{r.label||r.type}</span>
                        {!isP&&re.some(e=>e.type==="monster")&&<span style={{color:S.monsterFg,fontSize:8}}>M</span>}
                        {!isP&&re.some(e=>e.type==="trap")&&<span style={{color:S.trapFg,fontSize:8}}>T</span>}
                        {!isP&&re.some(e=>e.type==="item")&&<span style={{color:S.itemFg,fontSize:8}}>I</span>}
                        {isP&&<span style={{fontSize:8,color:vis?S.accent:S.dimText}}>{vis?"vis":"fog"}</span>}
                      </button>
                      <button type="button" title="TV view" onClick={(ev)=>{ev.stopPropagation();setTvRoom(r.id);}} style={{padding:"2px 6px",fontSize:10,fontFamily:"'Courier New',monospace",background:S.inputBg,color:S.accentAlt,border:`1px solid ${S.inputBorder}`,borderRadius:2,cursor:"pointer"}}>📺 TV</button>
                    </div>
                  );})}
              </div></div>)}
          </div>
        </div>
      </div>
      {tvRoom!=null&&dg&&(()=>{
        const rm=dg.rooms.find(r=>r.id===tvRoom);
        if(!rm)return null;
        const re=ents.filter(e=>e.roomId===tvRoom);
        const rd=decos.filter(d=>d.roomId===tvRoom);
        const decoNames=[...new Set(rd.map(d=>d.name))];
        const mc=re.filter(e=>e.type==="monster").reduce((a,e)=>a+(e.count||1),0);
        const traps=re.filter(e=>e.type==="trap").length;
        const items=re.filter(e=>e.type==="item").length;
        const slug=(String(rm.label||rm.type||rm.id)).replace(/[^\w\-]+/g,"_").replace(/_+/g,"_").slice(0,48);
        return(
          <div style={{position:"fixed",top:0,left:0,width:"100vw",height:"100vh",zIndex:9999,background:"#000",display:"flex",flexDirection:"column",fontFamily:"'Courier New',ui-monospace,monospace"}}>
            <div style={{display:"flex",alignItems:"center",flexWrap:"wrap",gap:10,padding:"12px 16px",borderBottom:"1px solid #2a4a2a",color:"#cfc"}}>
              <span style={{fontSize:22,fontWeight:"bold",color:"#6f6",letterSpacing:1}}>{rm.namedRoom||`Room ${rm.id}`}</span>
              <span style={{fontSize:18,color:"#e8ffe8"}}>{rm.label||rm.type}</span>
              <span style={{fontSize:17,color:"#9f9",flex:"1 1 auto",textAlign:"right"}}>Monsters: {mc} · Traps: {traps} · Items: {items}</span>
              <button type="button" onClick={()=>setTvRoom(null)} style={{padding:"6px 12px",fontSize:16,fontFamily:"inherit",background:"#111",color:"#6f6",border:"1px solid #393",borderRadius:4,cursor:"pointer"}}>CLOSE [Esc]</button>
              <button type="button" onClick={()=>{
                const c=renderRoomCanvas(dg,tvRoom,cfg.style,cfg.locationType,tvForgeCfg,{cellPx:64,dpr:2,fontPx:Math.max(6,Math.round(64*0.72))});
                const a=document.createElement("a");
                a.download=`room_${rm.id}_${slug}_tv_${cfg.seed}.png`;
                a.href=c.toDataURL("image/png");
                a.click();
              }} style={{padding:"6px 12px",fontSize:16,fontFamily:"inherit",background:"#082008",color:"#afa",border:"1px solid #484",borderRadius:4,cursor:"pointer"}}>EXPORT PNG</button>
            </div>
            <div style={{flex:1,minHeight:0,display:"flex",alignItems:"center",justifyContent:"center",padding:12,background:"#020202"}}>
              {tvPreviewUrl?<img src={tvPreviewUrl} alt="" style={{maxWidth:"100%",maxHeight:"100%",objectFit:"contain",imageRendering:"pixelated"}}/>:null}
            </div>
            {!isP&&(
              <div style={{padding:"16px 22px",borderTop:"1px solid #2a4a2a",fontSize:24,lineHeight:1.5,color:"#f4fff4",maxHeight:"34vh",overflow:"auto",whiteSpace:"pre-wrap"}}>
                {decoNames.length>0&&<div style={{marginBottom:12}}><span style={{color:"#8f8",fontWeight:"bold"}}>Scenery</span>{"\n"}{decoNames.join(", ")}</div>}
                {re.length===0&&decoNames.length===0?<div style={{color:"#888"}}>(No room notes)</div>:
                  re.map((e,i)=>(<div key={i} style={{marginBottom:8}}>
                    {e.type==="monster"&&<><span style={{color:"#f88",fontWeight:"bold"}}>[M]</span> {e.name} ×{e.count} (CR {e.cr})</>}
                    {e.type==="trap"&&<><span style={{color:"#fa4",fontWeight:"bold"}}>[T]</span> {e.name} — {e.dmg}</>}
                    {e.type==="item"&&<><span style={{color:"#aaf",fontWeight:"bold"}}>[I]</span> {e.name} ({e.r})</>}
                  </div>))}
              </div>
            )}
          </div>
        );
      })()}
      {forgeInspect&&(
        <div
          role="presentation"
          style={{position:"fixed",inset:0,zIndex:190,background:"rgba(0,0,0,0.55)",display:"flex",alignItems:"center",justifyContent:"center",padding:16}}
          onClick={()=>setForgeInspect(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            style={{maxWidth:480,width:"100%",background:S.panelBg,border:`1px solid ${S.panelBorder}`,padding:16,borderRadius:4,boxSizing:"border-box"}}
            onClick={(ev)=>ev.stopPropagation()}
          >
            {forgeInspect.kind==="riddle"&&forgeInspect.ent&&(
              <>
                <div style={{fontSize:12,color:S.accent,marginBottom:8}}>Riddle (DM)</div>
                <p style={{fontSize:14,color:S.textColor,marginBottom:12,lineHeight:1.4}}>{forgeInspect.ent.prompt}</p>
                <div style={{fontSize:11,color:S.dimText,marginBottom:4}}>Answer</div>
                <p style={{fontSize:13,color:"#daf",fontStyle:"italic",lineHeight:1.4}}>{forgeInspect.ent.answer}</p>
                {forgeInspect.ent.rewardName&&<div style={{fontSize:11,color:S.accentAlt,marginTop:10}}>Loot hook: {forgeInspect.ent.rewardName}</div>}
              </>
            )}
            {forgeInspect.kind==="lever"&&forgeInspect.deco&&(
              <>
                <div style={{fontSize:12,color:S.accent,marginBottom:8}}>Lever (DM)</div>
                <p style={{fontSize:13,color:S.textColor,lineHeight:1.45}}>{forgeInspect.deco.purpose||"Mechanism tied to a nearby door."}</p>
                {forgeInspect.deco.doorGx!=null&&<div style={{fontSize:10,color:S.dimText,marginTop:10}}>Door cell ({forgeInspect.deco.doorGx},{forgeInspect.deco.doorGy}) · lever ({forgeInspect.gx},{forgeInspect.gy})</div>}
              </>
            )}
            <button
              type="button"
              onClick={()=>setForgeInspect(null)}
              style={{marginTop:14,padding:"6px 14px",fontSize:12,fontFamily:"'Courier New',monospace",background:S.inputBg,color:S.textColor,border:`1px solid ${S.inputBorder}`,borderRadius:2,cursor:"pointer"}}
            >
              Close
            </button>
          </div>
        </div>
      )}
      {statCard&&<MonsterStatCard slug={statCard.slug} initialView={statCard.view} onClose={()=>setStatCard(null)} />}
    </div>);
}

function LB({children,S}){return<div style={{fontSize:10,letterSpacing:2,fontWeight:"bold",color:S.dimText,borderBottom:`1px solid ${S.panelBorder}`,paddingBottom:3,fontFamily:"'Courier New',monospace"}}>{children}</div>;}
function NI({l,v,mn,mx,S,set}){const[lc,sL]=useState(String(v));useEffect(()=>sL(String(v)),[v]);const commit=()=>{let n=parseInt(lc);if(isNaN(n))n=mn;n=Math.max(mn,Math.min(mx,n));sL(String(n));set(n);};
  return(<div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:3}}>
    <span style={{fontSize:11,color:S.textColor,minWidth:52}}>{l}</span>
    <div style={{display:"flex",alignItems:"center",gap:2}}>
      <button onClick={()=>set(Math.max(mn,v-1))} style={{width:22,height:22,padding:0,fontSize:12,fontFamily:"'Courier New',monospace",background:S.inputBg,color:S.dimText,border:`1px solid ${S.inputBorder}`,borderRadius:2,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>-</button>
      <input type="text" value={lc} onChange={e=>sL(e.target.value)} onBlur={commit} onKeyDown={e=>{if(e.key==="Enter")commit();}}
        style={{width:34,padding:"2px 4px",fontSize:16,textAlign:"center",fontWeight:"bold",fontFamily:"'Courier New',monospace",background:S.inputBg,color:S.inputFg,border:`1px solid ${S.inputBorder}`,borderRadius:2}}/>
      <button onClick={()=>set(Math.min(mx,v+1))} style={{width:22,height:22,padding:0,fontSize:12,fontFamily:"'Courier New',monospace",background:S.inputBg,color:S.dimText,border:`1px solid ${S.inputBorder}`,borderRadius:2,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>+</button>
    </div>
  </div>);}
function Tg({l,on,S,f}){return(<div onClick={f} style={{display:"flex",alignItems:"center",gap:6,cursor:"pointer",fontSize:11,color:S.textColor}}><span style={{color:on?S.accent:S.dimText,fontWeight:"bold",minWidth:20,textAlign:"center"}}>{on?"[x]":"[ ]"}</span>{l}</div>);}
