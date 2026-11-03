// In-match HUD (DOM). Built once per match; update() writes only what changed.
import { iconSVG } from './icons.js';
import { HEROES } from '../sim/heroes/index.js';
import { ITEMS, ITEM_BY_ID, RUNES } from '../sim/items.js';
import { MANA, ULT_LEVEL, XP_TABLE, MAX_LEVEL, DISPEL_COST, INVENTORY } from '../sim/const.js';
import { stats } from '../sim/stats.js';
import { h, clear } from './dom.js';

export const SIGIL = { aldric: 'sun', ysolde: 'moon', orren: 'star', brakka: 'anvil', kaida: 'snowflake', wren: 'leaf' };
export const ATTR_COLOR = { str: '#ff6a4d', agi: '#4ddc86', int: '#58aaff' };
export const ATTR_NAME = { str: 'Strength', agi: 'Agility', int: 'Intelligence' };

function shade(hex, k) {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = Math.round(((n >> 16) & 255) * k), g = Math.round(((n >> 8) & 255) * k), b = Math.round((n & 255) * k);
  return '#' + ((1 << 24) | (Math.min(255, r) << 16) | (Math.min(255, g) << 8) | Math.min(255, b)).toString(16).slice(1);
}
export function heroIconSVG(id, size = 64) {
  const H = HEROES[id];
  return iconSVG(SIGIL[id] || 'rune', { fg: H.color, bg: shade(H.color, 0.28), bg2: '#05060a', frame: ATTR_COLOR[H.attr], size });
}
export function abilityIconSVG(heroId, slot, size = 64) {
  const H = HEROES[heroId];
  const ab = slot === 'P' ? H.passive : H.abilities[slot];
  const ult = slot === 'R';
  return iconSVG(ab.icon || 'rune', { fg: ult ? '#fff6dc' : '#ffffff', bg: shade(H.color, ult ? 0.45 : 0.32), bg2: '#06070c', frame: ult ? '#ffd36b' : '#b89650', size });
}
export function itemIconSVG(id, size = 64) {
  const it = ITEM_BY_ID[id];
  return iconSVG(it.icon, { fg: it.color, bg: shade(it.color, 0.25), bg2: '#05060a', frame: '#8a7a55', size });
}
const html = (el, s) => { el.innerHTML = s; return el; };

export class HUD {
  // opts: { heroes, names, local: [bool,bool], keyLabels: [{Q,W,E,R},{...}], mode, net }
  constructor(root, opts) {
    this.root = root;
    this.o = opts;
    this.cache = new Map();
    this.combo = [null, null];
    this.dt = 1 / 60;
    this.build();
  }

  set(el, prop, v) {
    const k = el;
    let c = this.cache.get(k);
    if (!c) { c = {}; this.cache.set(k, c); }
    if (c[prop] === v) return;
    c[prop] = v;
    if (prop === 'text') el.textContent = v;
    else if (prop === 'class') el.className = v;
    else if (prop === 'html') el.innerHTML = v;
    else el.style[prop] = v;
  }

  build() {
    const R = this.root;
    clear(R);
    R.classList.remove('hidden');
    this.sides = [0, 1].map((i) => this.buildSide(i));
    const top = h('div', { class: 'hud-top' });
    this.timer = h('div', { class: 'timer' }, '99');
    this.roundLbl = h('div', { class: 'roundlbl' }, 'Round 1');
    this.pipEls = [h('div', { class: 'side' }), h('div', { class: 'side' })];
    this.netEl = h('div', { class: 'netinfo' });
    const center = h('div', { class: 'center-col' }, [this.roundLbl, this.timer, h('div', { class: 'pips' }, this.pipEls), this.netEl]);
    top.append(this.sides[0].root, center, this.sides[1].root);
    R.append(top);
    this.comboEls = [0, 1].map((i) => {
      const el = h('div', { class: `combo ${i === 0 ? 'left' : 'right'}`, style: 'opacity:0' }, [h('div', { class: 'ch' }), h('div', { class: 'cl' }, 'HITS'), h('div', { class: 'cd' })]);
      R.append(el);
      return el;
    });
    this.feeds = [h('div', { class: 'feed left' }), h('div', { class: 'feed right' })];
    R.append(...this.feeds);
    this.annEl = h('div', { class: 'announce' });
    R.append(this.annEl);
    this.layer = h('div', {});
    R.append(this.layer);
    this.shopEl = null;
    this.trainEl = null;
    this.pipsDrawn = '';
  }

  buildSide(i) {
    const id = this.o.heroes[i];
    const H = HEROES[id];
    const side = i === 0 ? 'left' : 'right';
    const root = h('div', { class: `pside ${side}` });
    const xp = h('div', { class: 'xp' });
    const lv = h('div', { class: 'lv' }, '1');
    const portrait = h('div', { class: 'portrait' }, [xp, html(h('div', { class: 'sig' }), heroIconSVG(id, 58)), lv]);
    const fill = h('div', { class: 'fill' }), chip = h('div', { class: 'chip' }), shield = h('div', { class: 'shield' });
    const hpn = h('div', { class: 'hpn' });
    const hp = h('div', { class: 'hpbar' }, [chip, fill, shield, hpn]);
    const mfill = h('div', { class: 'fill' }), mpn = h('div', { class: 'mpn' });
    const mp = h('div', { class: 'mpbar' }, [mfill, mpn]);
    const name = h('div', { class: 'nameline' }, [h('span', { class: 'nm' }, H.name), h('span', { class: 'pl' }, this.o.names[i] || (i === 0 ? 'P1' : 'P2'))]);
    const bars = h('div', { class: 'bars' }, [name, hp, mp]);
    root.append(h('div', { class: 'prow' }, [portrait, bars]));
    const abs = {};
    const abar = h('div', { class: 'abar' });
    const keys = (this.o.keyLabels && this.o.keyLabels[i]) || null;
    for (const s of ['Q', 'W', 'E', 'R']) {
      const cd = h('div', { class: 'cd' }), cdt = h('div', { class: 'cdt' }), lock = h('div', { class: 'lock' });
      const ab = H.abilities[s];
      const el = h('div', { class: 'ab' + (s === 'R' ? ' ult' : ''), title: ab ? ab.name : '' }, [
        html(h('div', { class: 'icon' }), abilityIconSVG(id, s, s === 'R' ? 52 : 44)), cd, cdt, lock,
        h('div', { class: 'cost' }, ab ? String(H.moves[s].cost / MANA) : ''),
      ]);
      if (keys && this.o.local[i]) el.append(h('div', { class: 'key' }, keys[s]));
      abs[s] = { el, cd, cdt, lock, ready: true };
      abar.append(el);
    }
    root.append(abar);
    const items = h('div', { class: 'items' });
    const gold = h('span', { class: 'gold' }, [html(h('span', { class: 'icon' }), iconSVG('gold', { fg: '#ffd36b', bg: 'transparent', frame: 'transparent', size: 18 })), h('span', {}, '0')]);
    const buffs = h('div', { class: 'buffs' });
    const dsp = h('span', { class: 'dispel-pip' }, 'DISPEL');
    root.append(h('div', { class: 'extras' }, [items, gold, buffs, dsp]));
    return { root, xp, lv, fill, chip, shield, hpn, mfill, mpn, abs, items, gold: gold.lastChild, buffs, dsp, H, id, lastHp: -1, itemsKey: '', buffsKey: '' };
  }

  update(G, net) {
    for (let i = 0; i < 2; i++) this.updateSide(G, i);
    const t = Math.max(0, Math.ceil(G.timer / 60));
    this.set(this.timer, 'text', G.cfg.training ? '∞' : String(t));
    this.set(this.timer, 'class', 'timer' + (t <= 10 && !G.cfg.training && G.phase === 'fight' ? ' low' : ''));
    const need = G.cfg.roundsToWin;
    const final = G.wins[0] === need - 1 && G.wins[1] === need - 1;
    this.set(this.roundLbl, 'text', G.cfg.training ? 'Training' : final ? 'Final Round' : `Round ${Math.max(1, G.round)}`);
    const pk = G.wins.join(',') + need;
    if (pk !== this.pipsDrawn && !G.cfg.training) {
      this.pipsDrawn = pk;
      for (let i = 0; i < 2; i++) {
        clear(this.pipEls[i]);
        for (let k = 0; k < need; k++) this.pipEls[i].append(h('i', { class: (i === 0 ? k < G.wins[0] : need - 1 - k < G.wins[1]) ? 'on' : '' }));
      }
    }
    if (net) this.set(this.netEl, 'text', `${net.ping} ms · rb ${net.avgRb}${net.desync >= 0 ? ' · DESYNC' : ''}`);
    // combo counters (shown on the attacker's side)
    for (let v = 0; v < 2; v++) {
      const F = G.fighters[v];
      const atkSide = 1 - v;
      const el = this.comboEls[atkSide];
      if (F.combo >= 2) {
        this.combo[atkSide] = { hits: F.combo, dmg: F.cdmg, t: 1.3 };
      }
      const c = this.combo[atkSide];
      if (c) {
        this.set(el.children[0], 'text', String(c.hits));
        this.set(el.children[2], 'text', `${c.dmg} dmg`);
        this.set(el, 'opacity', F.combo >= 2 ? '1' : c.t > 0 ? String(Math.min(1, c.t * 2)) : '0');
        if (c.lastHits !== c.hits) { c.lastHits = c.hits; el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); }
      }
    }
    if (G.phase === 'shop') this.renderShop(G); else if (this.shopEl) { this.shopEl.remove(); this.shopEl = null; }
  }

  tick(dt) {
    this.dt = dt;
    for (const c of this.combo) if (c && c.t > 0) c.t -= dt;
  }

  updateSide(G, i) {
    const S = this.sides[i];
    const F = G.fighters[i];
    const H = S.H;
    const st = stats(G, F);
    const hpP = Math.max(0, F.hp) / F.mhp * 100;
    this.set(S.fill, 'width', hpP.toFixed(2) + '%');
    // Delayed "damage chip" trail: holds briefly, then drains toward current health.
    if (S.chipV == null || hpP >= S.chipV) { S.chipV = hpP; S.chipHold = 0; }
    else if (F.hp < S.lastHp) S.chipHold = 0.35;
    else if (S.chipHold > 0) S.chipHold -= this.dt;
    else S.chipV = Math.max(hpP, S.chipV - Math.max(12, (S.chipV - hpP) * 3) * this.dt);
    this.set(S.chip, 'width', S.chipV.toFixed(2) + '%');
    S.lastHp = F.hp;
    this.set(S.fill, 'class', 'fill' + (hpP < 25 ? ' low' : ''));
    const shP = F.shield > 0 ? Math.min(100 - hpP, F.shield / F.mhp * 100) : 0;
    this.set(S.shield, 'width', shP.toFixed(2) + '%');
    this.set(S.shield, i === 0 ? 'left' : 'right', hpP.toFixed(2) + '%');
    this.set(S.hpn, 'text', String(Math.max(0, F.hp)));
    const maxM = st.mana * MANA;
    this.set(S.mfill, 'width', (F.mana / maxM * 100).toFixed(1) + '%');
    this.set(S.mpn, 'text', String(Math.floor(F.mana / MANA)));
    this.set(S.lv, 'text', String(F.lv));
    const lo = XP_TABLE[F.lv], hi = XP_TABLE[Math.min(MAX_LEVEL, F.lv + 1)];
    const xpP = F.lv >= MAX_LEVEL ? 1 : Math.max(0, Math.min(1, (F.xp - lo) / (hi - lo)));
    const xk = Math.round(xpP * 100);
    this.set(S.xp, 'html', `<svg viewBox="0 0 66 66"><circle cx="33" cy="33" r="31" fill="none" stroke="rgba(0,0,0,0.5)" stroke-width="3"/><circle cx="33" cy="33" r="31" fill="none" stroke="#ffd36b" stroke-width="3" stroke-dasharray="${(xk / 100 * 194.8).toFixed(1)} 300" transform="rotate(-90 33 33)" stroke-linecap="round"/></svg>`);
    // abilities
    const tr = G.cfg.training && G.cfg.tr;
    for (const s of ['Q', 'W', 'E', 'R']) {
      const A = S.abs[s];
      const ab = H.abilities[s];
      if (!ab) continue;
      const si = { Q: 0, W: 1, E: 2, R: 3 }[s];
      const cd = F.cd[si];
      const total = (ab.cd || 1) * 1000;
      const cost = H.moves[s].cost;
      const locked = s === 'R' && F.lv < ULT_LEVEL && !tr;
      let cls = 'ab' + (s === 'R' ? ' ult' : '');
      if (locked) cls += ' locked';
      else if (F.mana < cost) cls += ' nomana';
      if (A.flash) cls += ' ' + A.flash;
      this.set(A.el, 'class', cls);
      this.set(A.lock, 'text', locked ? `LV ${ULT_LEVEL}` : '');
      const pct = cd > 0 ? Math.ceil((cd / total) * 100) : 0;
      this.set(A.cd, 'background', pct > 0 ? `conic-gradient(rgba(4,5,10,0.78) ${pct}%, transparent ${pct}%)` : 'none');
      this.set(A.cdt, 'text', cd > 0 && !locked ? String(Math.ceil(cd / 60000)) : '');
      const ready = cd === 0;
      if (ready && !A.ready && !locked) this.flashAb(A, 'ready-flash');
      A.ready = ready;
    }
    // items
    const ik = F.items.join(',');
    if (ik !== S.itemsKey) {
      S.itemsKey = ik;
      clear(S.items);
      for (let k = 0; k < INVENTORY; k++) {
        const id = F.items[k];
        S.items.append(id ? html(h('span', { class: 'it icon', title: ITEM_BY_ID[id].name }), itemIconSVG(id, 22)) : h('span', { class: 'it empty' }));
      }
    }
    this.set(S.gold, 'text', String(F.gold));
    const bk = F.buffs.filter((b) => RUNES[b.k] || b.k === 'slow' || b.k === 'root' || b.k === 'burn').map((b) => b.k + Math.ceil(b.t / 60)).join(',');
    if (bk !== S.buffsKey) {
      S.buffsKey = bk;
      clear(S.buffs);
      for (const b of F.buffs) {
        const col = RUNES[b.k] ? RUNES[b.k].color : b.k === 'slow' ? '#9a7aff' : b.k === 'root' ? '#5ad070' : b.k === 'burn' ? '#ff7a2a' : null;
        if (!col) continue;
        S.buffs.append(h('span', { class: 'buff', style: `background: radial-gradient(circle, ${col}cc, ${col}33); box-shadow: 0 0 8px ${col}`, title: RUNES[b.k] ? RUNES[b.k].name : b.k }, String(Math.ceil(b.t / 60))));
      }
    }
    this.set(S.dsp, 'class', 'dispel-pip' + (F.dcd > 0 || (F.mana < DISPEL_COST && !tr) ? ' off' : ''));
  }

  flashAb(A, cls) {
    A.flash = cls;
    clearTimeout(A.ft);
    A.ft = setTimeout(() => { A.flash = null; }, cls === 'deny' ? 300 : 500);
  }

  // ---------------------------------------------------------------------------
  onEvent(e, G) {
    switch (e.t) {
      case 'round': {
        const need = G.cfg.roundsToWin;
        const final = G.wins[0] === need - 1 && G.wins[1] === need - 1;
        this.announce(final ? 'Final Round' : `Round ${e.n}`, '', 1.4);
        break;
      }
      case 'fight': this.announce('Fight!', '', 0.9); break;
      case 'ko': this.announce(e.double ? 'Double K.O.' : 'K.O.', e.perfect ? 'Perfect' : '', 1.6, true); break;
      case 'timeup': this.announce('Time', '', 1.4); break;
      case 'roundwin':
        if (e.p >= 0) setTimeout(() => this.announce(HEROES[G.fighters[e.p].h].name, 'takes the round', 1.6), 900);
        break;
      case 'firstblood': this.feed(e.p, 'FIRST BLOOD · +200 gold'); break;
      case 'ult': this.ultCut(e.p, G); break;
      case 'levelup': this.feed(e.p, e.lv === ULT_LEVEL ? `LEVEL ${e.lv} · ULTIMATE UNLOCKED` : `LEVEL ${e.lv}`); break;
      case 'rune_take': this.feed(e.p, RUNES[e.k].name.toUpperCase()); break;
      case 'gold':
        if (e.why === 'round' || e.why === 'comeback' || e.why === 'rune' || e.why === 'combo') this.feed(e.p, `+${e.amt} gold${e.why === 'comeback' ? ' (comeback)' : ''}`);
        break;
      case 'hit':
        if (e.ch) this.callout(e.p, e.ch === 1 ? 'Counter' : 'Punish', e.ch === 1 ? 'counter' : 'punish');
        break;
      case 'dispel': this.callout(e.p, 'Dispel', 'info'); break;
      case 'tech': this.callout(e.v, 'Throw Tech', 'info'); break;
      case 'rush': this.callout(e.p, 'Rush', 'info'); break;
      case 'sigil': this.feed(e.p, 'LAST STAND'); break;
      case 'notready':
        if (this.o.local[e.p] && e.s && this.sides[e.p].abs[e.s]) this.flashAb(this.sides[e.p].abs[e.s], 'deny');
        break;
    }
  }

  announce(big, sub = '', dur = 1.2, red = false) {
    clearTimeout(this.annT); clearTimeout(this.annT2);
    clear(this.annEl);
    this.annEl.className = 'announce';
    this.annEl.append(h('div', { class: 'big' + (red ? ' red' : '') }, big));
    if (sub) this.annEl.append(h('div', { class: 'sub' }, sub));
    this.annT = setTimeout(() => { this.annEl.classList.add('out'); }, dur * 1000);
    this.annT2 = setTimeout(() => { clear(this.annEl); }, dur * 1000 + 400);
  }

  ultCut(p, G) {
    const H = HEROES[G.fighters[p].h];
    const el = h('div', { class: 'ult-cut' + (p === 1 ? ' right' : '') }, [h('div', {}, [h('div', { class: 'uh' }, 'Ultimate'), h('div', { class: 'un', style: `color:${H.color}` }, H.abilities.R.name)])]);
    this.layer.append(el);
    setTimeout(() => el.remove(), 800);
  }

  callout(p, text, cls) {
    if (p !== 0 && p !== 1) return;
    const el = h('div', { class: `callout ${cls} ${p === 0 ? 'left' : 'right'}` }, text);
    this.layer.append(el);
    setTimeout(() => el.remove(), 950);
  }

  feed(p, text) {
    const f = this.feeds[p === 1 ? 1 : 0];
    const el = h('div', { class: 'fi' }, text);
    f.append(el);
    while (f.children.length > 4) f.firstChild.remove();
    setTimeout(() => el.remove(), 3200);
  }

  // ---------------------------------------------------------------------------
  renderShop(G) {
    if (!this.shopEl) {
      this.shopEl = h('div', { class: 'shop-wrap' });
      this.root.append(this.shopEl);
      this.shopKey = '';
    }
    const slots = [0, 1].filter((i) => this.o.local[i]);
    const key = JSON.stringify([G.pt > 0 ? Math.ceil(G.pt / 60) : 0, G.shop, G.fighters.map((f) => [f.gold, f.items])]);
    if (key === this.shopKey) return;
    this.shopKey = key;
    clear(this.shopEl);
    const first = G.round === 0;
    this.shopEl.append(h('div', { class: 'shop-timer' }, [
      h('div', { class: 'st' }, first ? 'Strategy Phase' : 'Shop'),
      h('div', { class: 'ss' }, `${Math.ceil(G.pt / 60)}s · ${first ? 'buy a starting item' : `next: round ${G.round + 1}`}`),
    ]));
    for (const i of slots) {
      const F = G.fighters[i];
      const S = G.shop[i];
      const grid = h('div', { class: 'shop-grid' });
      ITEMS.forEach((it, k) => {
        const owned = F.items.includes(it.id);
        const poor = !owned && F.gold < it.cost;
        grid.append(h('div', { class: `si${k === S.cur ? ' cur' : ''}${owned ? ' owned' : ''}${poor ? ' poor' : ''}` }, [
          html(h('div', { class: 'icon' }), itemIconSVG(it.id, 46)), h('div', { class: 'sp' }, String(it.cost)),
        ]));
      });
      const cur = ITEMS[S.cur];
      const inv = h('div', { class: 'inv' });
      for (let k = 0; k < INVENTORY; k++) {
        const id = F.items[k];
        inv.append(id ? html(h('span', { class: 'it icon' }), itemIconSVG(id, 30)) : h('span', { class: 'it empty' }));
      }
      const keys = (this.o.keyLabels && this.o.keyLabels[i]) || {};
      const other = G.shop[1 - i];
      this.shopEl.append(h('div', { class: `shop panel p${i + 1}` }, [
        h('div', { class: 'shop-head' }, [h('div', { class: 'sh' }, HEROES[F.h].name), h('div', { class: 'who' }, i === 0 ? 'Player 1' : 'Player 2'),
          h('div', { class: 'gold' }, [html(h('span', { class: 'icon' }), iconSVG('gold', { fg: '#ffd36b', bg: 'transparent', frame: 'transparent', size: 18 })), String(F.gold)])]),
        grid,
        h('div', { class: 'shop-desc' }, [h('div', { class: 'dn' }, `${cur.name} — ${cur.cost}g`), h('div', { class: 'dd' }, cur.desc)]),
        h('div', { class: 'shop-foot' }, [inv,
          h('span', {}, `${keys.L || 'L'} buy · ${keys.M || 'M'} sell · ${keys.H || 'H'} ready`),
          h('span', { class: 'shop-ready' + (S.ready ? ' on' : '') }, S.ready ? 'READY' : 'SHOPPING')]),
        !this.o.local[1 - i] ? h('div', { class: 'shop-opp' }, other.ready ? 'Opponent is ready.' : 'Opponent is shopping…') : null,
      ]));
    }
  }

  // Training overlay
  training(info) {
    if (!this.trainEl) {
      this.trainEl = h('div', { class: 'train-panel panel' });
      this.root.append(this.trainEl);
    }
    const adv = info.adv;
    const advCls = adv == null ? '' : adv > 0 ? ' pos' : adv < 0 ? ' neg' : '';
    const key = JSON.stringify(info);
    if (key === this.trainKey) return;
    this.trainKey = key;
    this.trainEl.innerHTML = '';
    const row = (k, v, c = '') => this.trainEl.append(h('div', { class: 'tr' }, [h('span', { class: 'muted' }, k), h('span', { class: 'tv' + c }, v)]));
    row('Last combo', `${info.hits} hits · ${info.dmg} dmg`);
    row('Frame advantage', adv == null ? '—' : (adv > 0 ? '+' : '') + adv, advCls);
    row('Last move', info.move || '—');
    row('Dummy', info.dummy);
    row('Pause for settings', 'Esc');
  }

  destroy() {
    clear(this.root);
    this.root.classList.add('hidden');
  }
}
