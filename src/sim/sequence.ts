import { accuracy } from './combat';
import { mulberry32, randInt } from './rng';
import type { SpecCtx, SpecDef } from './specs';
import type { Loadout, Monster, MonsterState } from './types';

export interface SequenceAttack {
  id: string;
  label: string;
  load: Loadout;
  weaponName?: string;
  spec?: SpecDef;
  downtimeAfterTicks?: number;
}

export interface SequenceResult {
  trials: number;
  kills: number;
  killChance: number;
  targetChance: number | null;
  targetSeconds: number;
  meanKillTicks: number | null;
  medianKillTicks: number | null;
  p90KillTicks: number | null;
  sequenceTicks: number;
  energyRequired: number;
  downtimeSeconds: number;
  resetSeconds: number;
  optimalResetAfterAttack: number | null;
  expectedKillSeconds: number | null;
  resetOptions: { afterAttack: number; chance: number; expectedSeconds: number | null }[];
  mathematicallyImpossible: boolean;
}

const freshState = (monster: Monster): MonsterState => ({
  hp: monster.hp, def: monster.def, magic: monster.magic, baseDef: monster.def, baseAtk: 0, baseStr: 0,
});
const percentile = (values: number[], p: number): number | null => values.length
  ? values[Math.min(values.length - 1, Math.ceil(values.length * p) - 1)] : null;

/** Zulrah rerolls each hitsplat above 50 into the 45–50 range. */
const applyDamageCap = (damage: number, monster: Monster, rng: () => number): number =>
  monster.name === 'Zulrah' && damage > 50 ? randInt(rng, 45, 50) : damage;

/** Run one attempt, stopping at the chosen reset point if the boss survives. */
const attempt = (args: {
  monster: Monster; actions: SequenceAttack[]; cutoff: number; rng: () => number;
  startEnergy: number; lightbearer: boolean; specOptions: Record<string, boolean>;
}): { killed: boolean; ticks: number } => {
  const { monster, actions, cutoff, rng } = args;
  const state = freshState(monster);
  let energy = args.startEnergy;
  let regenCounter = args.lightbearer ? 25 : 50;
  let elapsed = 0;
  let zoryaEmpoweredAttacks = 0;
  for (let i = 0; i < Math.min(cutoff, actions.length); i++) {
    const action = actions[i];
    const spec = action.spec;
    if (spec && energy < spec.cost) break;
    if (spec) energy -= spec.cost;
    const zoryaEmpowered = zoryaEmpoweredAttacks > 0 && action.weaponName === "Zorya's tome";
    if (zoryaEmpowered) zoryaEmpoweredAttacks--;
    const attackSpeed = zoryaEmpowered ? 2 : action.load.speed;
    if (!spec) {
      const hitLoad = zoryaEmpowered ? { ...action.load, maxHit: Math.floor(action.load.maxHit * 1.6) } : action.load;
      if (rng() < accuracy(hitLoad, monster, state, zoryaEmpowered ? { accuracyMultiplier: 2.5 } : {})) {
        const damage = applyDamageCap(randInt(rng, 0, hitLoad.maxHit), monster, rng);
        state.hp -= Math.min(state.hp, damage);
      }
    } else {
      let specHit = false;
      const acc = spec.guaranteed ? 1 : accuracy(action.load, monster, state, { styleOverride: spec.defStyle, accuracyMultiplier: spec.accMult });
      const ctx: SpecCtx = { load: action.load, acc, rng, state, monsterName: monster.name,
        isDemon: monster.attributes.includes('demon'), options: args.specOptions, onHit: () => { specHit = true; } };
      for (const damage of spec.hits(ctx, spec.maxHit(action.load.maxHit))) {
        if (state.hp <= 0) break;
        state.hp -= Math.min(state.hp, applyDamageCap(damage, monster, rng));
      }
      if (spec.id === 'zorya_tome' && specHit) zoryaEmpoweredAttacks = 3;
    }
    elapsed += attackSpeed;
    if (state.hp <= 0) return { killed: true, ticks: elapsed };
    const pause = i + 1 < Math.min(cutoff, actions.length)
      ? Math.max(0, Math.floor(action.downtimeAfterTicks ?? 0)) : 0;
    for (let tick = 0; tick < pause; tick++) {
      elapsed++;
      if (energy < 100 && --regenCounter <= 0) {
        energy = Math.min(100, energy + 10);
        regenCounter = args.lightbearer ? 25 : 50;
      }
    }
    for (let tick = 0; tick < attackSpeed; tick++) {
      if (energy < 100 && --regenCounter <= 0) {
        energy = Math.min(100, energy + 10);
        regenCounter = args.lightbearer ? 25 : 50;
      }
    }
  }
  return { killed: false, ticks: elapsed };
};

/** Monte Carlo odds plus expected clear time under retry-after-prefix policies. */
export const simulateSequence = (args: {
  monster: Monster; actions: SequenceAttack[]; trials: number; seed?: number;
  startEnergy?: number; lightbearer?: boolean; specOptions?: Record<string, boolean>;
  targetSeconds?: number; downtimeSeconds?: number; resetSeconds?: number;
}): SequenceResult => {
  const { monster, actions } = args;
  const trials = Math.max(1, Math.floor(args.trials));
  const startEnergy = Math.max(0, Math.min(100, args.startEnergy ?? 100));
  const specOptions = args.specOptions ?? {};
  const energyRequired = actions.reduce((sum, a) => sum + (a.spec?.cost ?? 0), 0);
  // Best-case plan duration: every Zorya spec lands and its next three Tome
  // attacks use the empowered 2-tick speed. The Monte Carlo result below still
  // branches on whether each spec actually hits.
  let tomeEmpoweredAttacks = 0;
  const sequenceTicks = actions.reduce((sum, action) => {
    const isTome = action.weaponName === "Zorya's tome";
    const speed = isTome && tomeEmpoweredAttacks > 0 ? 2 : action.load.speed;
    if (isTome && tomeEmpoweredAttacks > 0) tomeEmpoweredAttacks--;
    if (action.spec?.id === 'zorya_tome') tomeEmpoweredAttacks = 3;
    return sum + speed + Math.max(0, action.downtimeAfterTicks ?? 0);
  }, 0);
  const targetSeconds = Math.max(0, args.targetSeconds ?? 0);
  const downtimeSeconds = Math.max(0, args.downtimeSeconds ?? 0);
  const resetSeconds = Math.max(0, args.resetSeconds ?? 0);
  const killTicks: number[] = [];
  let targetKills = 0;
  let maximumDamage = 0;
  // Four maximum hits is a deliberately generous upper bound for every spec;
  // this check must never call a possible kill impossible due to undercounting.
  const maximumPerHit = (damage: number) => monster.name === 'Zulrah' ? Math.min(50, damage) : damage;
  for (const action of actions) maximumDamage += action.spec
    ? maximumPerHit(action.spec.maxHit(action.load.maxHit)) * 4
    : maximumPerHit(action.load.maxHit);

  const resetOptions: SequenceResult['resetOptions'] = [];
  let optimalResetAfterAttack: number | null = null;
  let expectedKillSeconds: number | null = null;
  let best = Infinity;
  for (let cutoff = 1; cutoff <= actions.length; cutoff++) {
    let kills = 0;
    let timeSum = 0;
    const sampleRng = mulberry32((args.seed ?? 712367) + cutoff * 104729);
    for (let trial = 0; trial < trials; trial++) {
      const outcome = attempt({ monster, actions, cutoff, rng: sampleRng, startEnergy,
        lightbearer: !!args.lightbearer, specOptions });
      if (outcome.killed) {
        kills++;
        timeSum += outcome.ticks * 0.6 + downtimeSeconds;
      } else timeSum += outcome.ticks * 0.6;
    }
    const p = kills / trials;
    const expected = p > 0 ? (timeSum / trials + (1 - p) * resetSeconds) / p : null;
    resetOptions.push({ afterAttack: cutoff, chance: p, expectedSeconds: expected });
    if (expected !== null && expected < best) {
      best = expected; expectedKillSeconds = expected; optimalResetAfterAttack = cutoff;
    }
    if (cutoff === actions.length) {
      // Independent sample for the ordinary single-attempt distribution.
      const fullRng = mulberry32(args.seed ?? 712367);
      for (let trial = 0; trial < trials; trial++) {
        const outcome = attempt({ monster, actions, cutoff, rng: fullRng, startEnergy,
          lightbearer: !!args.lightbearer, specOptions });
        if (outcome.killed) {
          killTicks.push(outcome.ticks);
          if (targetSeconds > 0 && outcome.ticks * 0.6 + downtimeSeconds <= targetSeconds) targetKills++;
        }
      }
    }
  }
  killTicks.sort((a, b) => a - b);
  return {
    trials, kills: killTicks.length, killChance: killTicks.length / trials,
    targetChance: targetSeconds > 0 ? targetKills / trials : null, targetSeconds,
    meanKillTicks: killTicks.length ? killTicks.reduce((a, b) => a + b, 0) / killTicks.length : null,
    medianKillTicks: percentile(killTicks, .5), p90KillTicks: percentile(killTicks, .9),
    sequenceTicks, energyRequired, downtimeSeconds, resetSeconds,
    optimalResetAfterAttack, expectedKillSeconds, resetOptions,
    mathematicallyImpossible: maximumDamage < monster.hp,
  };
};
