// Shop items. Effects are expressed as additive stat modifiers ("mods") that
// stats.js folds together each frame.
export const ITEMS = [
  { id: 'vgem', name: 'Vitality Gem', cost: 400, icon: 'heart', color: '#ff5a6a',
    desc: '+150 maximum health.', mods: { hp: 150 } },
  { id: 'prism', name: 'Mana Prism', cost: 350, icon: 'gem', color: '#5aa8ff',
    desc: '+100 maximum mana and +35% mana regeneration.', mods: { mana: 100, regenPct: 35 } },
  { id: 'wraps', name: "Brawler's Wraps", cost: 500, icon: 'fist', color: '#ff9a4a',
    desc: '+12% physical damage.', mods: { phys: 12 } },
  { id: 'codex', name: 'Arcane Codex', cost: 550, icon: 'book', color: '#b78cff',
    desc: '+15% magic damage.', mods: { mag: 15 } },
  { id: 'vest', name: 'Plated Vest', cost: 500, icon: 'shield', color: '#c9d1dc',
    desc: '-15% physical damage taken.', mods: { armor: 15 } },
  { id: 'cloak', name: 'Wardweave Cloak', cost: 500, icon: 'cloak', color: '#6fe0d0',
    desc: '-18% magic damage taken. Chip damage halved.', mods: { mr: 18, chip: -50 } },
  { id: 'boots', name: 'Swiftstride Boots', cost: 450, icon: 'boot', color: '#ffe066',
    desc: '+12% movement speed. Backdash gains 3 extra invulnerable frames.', mods: { speed: 12, bdInv: 3 } },
  { id: 'fang', name: 'Bloodthirst Fang', cost: 900, icon: 'fang', color: '#e0334a',
    desc: 'Heal for 15% of physical damage dealt.', mods: { steal: 15 } },
  { id: 'glass', name: 'Chronos Hourglass', cost: 950, icon: 'hourglass', color: '#7fd4ff',
    desc: 'Ability cooldowns recharge 25% faster.', mods: { cdr: 25 } },
  { id: 'mark', name: "Executioner's Mark", cost: 1000, icon: 'skull', color: '#d6d6d6',
    desc: 'Counter and punish hits deal +35% damage and cause +4 frames of hitstun.', mods: { chDmg: 35, chStun: 4 } },
  { id: 'sigil', name: 'Last Stand Sigil', cost: 1150, icon: 'sigil', color: '#ffd36b',
    desc: 'Once per round, dropping below 25% health grants a 220 HP barrier for 4 seconds.', mods: { sigil: 1 } },
  { id: 'phase', name: 'Phasewalk Treads', cost: 1100, icon: 'phase', color: '#c38bff',
    desc: 'Your forward dash becomes an invulnerable blink that passes through enemies. +8% speed.', mods: { blink: 1, speed: 8 } },
];

export const ITEM_BY_ID = Object.fromEntries(ITEMS.map((it, i) => [it.id, Object.assign(it, { idx: i })]));

export const RUNES = {
  fury:    { name: 'Rune of Fury',    color: '#ff4a3d', desc: '+30% damage for 8s' },
  haste:   { name: 'Rune of Haste',   color: '#ffe14a', desc: '+35% movement speed for 8s' },
  renewal: { name: 'Rune of Renewal', color: '#46e07a', desc: 'Restore 20% health and 50 mana' },
  insight: { name: 'Rune of Insight', color: '#4aa8ff', desc: '+60 mana, cooldowns recharge twice as fast for 8s' },
  fortune: { name: 'Rune of Fortune', color: '#ffb347', desc: '+250 gold and +150 experience' },
};
export const RUNE_KINDS = Object.keys(RUNES);
