import { publicAssetUrl } from "@/lib/tokenSprites";

export const ITEM_TOKEN_SPRITES: Record<string, string> = {
  chest: "/tokens/pixel/items/item-chest.svg",
  "chest-gold": "/tokens/pixel/items/item-chest-gold.svg",
  "chest-mimic": "/tokens/pixel/items/item-chest-mimic.svg",
  "potion-red": "/tokens/pixel/items/item-potion-red.svg",
  "potion-blue": "/tokens/pixel/items/item-potion-blue.svg",
  "potion-green": "/tokens/pixel/items/item-potion-green.svg",
  scroll: "/tokens/pixel/items/item-scroll.svg",
  tome: "/tokens/pixel/items/item-tome.svg",
  sword: "/tokens/pixel/items/item-sword.svg",
  axe: "/tokens/pixel/items/item-axe.svg",
  bow: "/tokens/pixel/items/item-bow.svg",
  staff: "/tokens/pixel/items/item-staff.svg",
  wand: "/tokens/pixel/items/item-wand.svg",
  shield: "/tokens/pixel/items/item-shield.svg",
  armor: "/tokens/pixel/items/item-armor.svg",
  helmet: "/tokens/pixel/items/item-helmet.svg",
  ring: "/tokens/pixel/items/item-ring.svg",
  amulet: "/tokens/pixel/items/item-amulet.svg",
  gem: "/tokens/pixel/items/item-gem.svg",
  "gold-pile": "/tokens/pixel/items/item-gold-pile.svg",
  key: "/tokens/pixel/items/item-key.svg",
  lantern: "/tokens/pixel/items/item-lantern.svg",
  torch: "/tokens/pixel/items/item-torch.svg",
  rope: "/tokens/pixel/items/item-rope.svg",
  "trap-spike": "/tokens/pixel/items/item-trap-spike.svg",
  "trap-net": "/tokens/pixel/items/item-trap-net.svg",
  "trap-arrow": "/tokens/pixel/items/item-trap-arrow.svg",
  "trap-alarm": "/tokens/pixel/items/item-trap-alarm.svg",
  barrel: "/tokens/pixel/items/item-barrel.svg",
  altar: "/tokens/pixel/items/item-altar.svg",
};

const DEFAULT_ITEM = "/tokens/pixel/items/item-chest.svg";

export function itemTokenSprite(key: string | null | undefined): string {
  const k = (key ?? "").trim().toLowerCase();
  if (!k) return publicAssetUrl(DEFAULT_ITEM);
  return publicAssetUrl(ITEM_TOKEN_SPRITES[k] ?? DEFAULT_ITEM);
}
