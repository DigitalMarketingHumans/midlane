// Core simulation constants. The simulation is fully integer-based so that two
// browsers (even different engines) produce bit-identical results — required for
// rollback netcode. Positions are in "sub-pixels": 1 px = 100 sub.

export const FPS = 60;
export const SUB = 100;
export const px = (v) => Math.round(v * SUB);

// Stage / camera
export const STAGE_HALF = px(820);       // walls at ±820px
export const SCREEN_HALF = px(345);      // fighters can be at most ~690px apart
export const START_X = px(230);          // round start offset from centre

// Physics
export const GRAVITY = 88;               // sub / frame²
export const AIR_PUSH_LIFT = px(42);     // airborne pushbox starts this far above feet

// Inputs
export const BUFFER = 8;                 // input buffer frames
export const DASH_WINDOW = 12;           // double-tap window
export const THROW_WINDOW = 3;           // L+M simultaneity window

// Rounds
export const ROUND_TIME = 99 * FPS;
export const INTRO_FRAMES = 110;
export const KO_FRAMES = 80;             // slow-motion KO
export const ROUND_END_FRAMES = 140;
export const SHOP_FRAMES = 15 * FPS;
export const FIRST_SHOP_FRAMES = 20 * FPS;
export const ROUNDS_TO_WIN = 2;

// Combat
export const HITSTOP = { L: 7, M: 9, H: 12, S: 10, U: 14, T: 0 };
export const SCALING = [100, 100, 80, 70, 60, 52, 45, 40, 35, 32, 30];
export const ULT_MIN_SCALE = 50;
export const KD_FRAMES = 44;             // hard knockdown (invulnerable)
export const QUICK_RISE_FRAMES = 30;
export const THROW_INVULN = 4;           // after hit/blockstun & wakeup
export const THROW_RANGE = px(46);       // beyond pushbox contact
export const THROW_TECH = 10;            // frames victim has to tech
export const COUNTER_HITSTUN = 4;
export const PUNISH_HITSTUN = 6;
export const COUNTER_DMG = 120;          // percent
export const JUGGLE_MAX = 5;
export const CHIP_MAGIC = 25;            // % of magic damage dealt on block
export const PROX_GUARD = px(260);       // proximity guard distance

// Mana is stored in centi-mana (×100) so regen can be fractional.
export const MANA = 100;
export const DISPEL_COST = 50 * MANA;
export const DISPEL_CD = 9 * FPS;
export const RUSH_COST = 25 * MANA;

// MOBA progression
export const MAX_LEVEL = 6;
export const ULT_LEVEL = 4;
export const XP_TABLE = [0, 0, 380, 850, 1450, 2350, 3450]; // total XP to reach level i
export const START_GOLD = 600;
export const INVENTORY = 4;

// Runes
export const RUNE_FIRST = 14 * FPS;
export const RUNE_EVERY = 24 * FPS;
export const RUNE_LIFE = 12 * FPS;
export const RUNE_BUFF = 8 * FPS;
