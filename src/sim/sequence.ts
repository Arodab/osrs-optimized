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
  plannedSpecCount: number;
  affordableSpecCount: number;
  downtimeSeconds: number;
  resetSeconds: number;
  optimalResetAfterAttack: number | null;
  optimalResetMinDamage: number;
  expectedKillSeconds: number | null;
  resetOptions: { afterAttack: number; minDamageToContinue: number; chance: number; expectedSeconds: number | null }[];
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

interface AttemptTrace {
  killed: boolean;
  killAttack: number | null;
  killTicks: number | null;
  ticks: number;
  damageByAttack: number[];
  ticksByAttack: number[];
}

/** Simulate a full sequence and retain damage/time checkpoints for reset rules. */
const attempt = (args: {
  monster: Monster; actions: SequenceAttack[]; rng: () => number;
  lightbearer: boolean; specOptions: Record<string, boolean>;
}): AttemptTrace => {
  const { monster, actions, rng } = args;
  const state = freshState(monster);
  let energy = 100;
  const regenInterval = args.lightbearer ? 25 : 50;
  let regenCounter = regenInterval;
  let elapsed = 0;
  let totalDamage = 0;
  let zoryaEmpoweredAttacks = 0;
  const damageByAttack: number[] = [];
  const ticksByAttack: number[] = [];
  const advanceTicks = (ticks: number) => {
    for (let tick = 0; tick < ticks; tick++) {
      elapsed++;
      if (energy < 100 && --regenCounter <= 0) {
        energy = Math.min(100, energy + 10);
        regenCounter = args.lightbearer ? 25 : 50;
      }
    }
  };
  for (let i = 0; i < actions.length; i++) {
    const action = actions[i];
    const spec = action.spec;
    const useSpec = !!spec && energy >= spec.cost;
    if (useSpec) energy -= spec!.cost;
    const zoryaEmpowered = zoryaEmpoweredAttacks > 0 && action.weaponName === "Zorya's tome";
    if (zoryaEmpowered) zoryaEmpoweredAttacks--;
    const attackSpeed = zoryaEmpowered ? 2 : action.load.speed;
    if (!useSpec) {
      const hitLoad = zoryaEmpowered ? { ...action.load, maxHit: Math.floor(action.load.maxHit * 1.6) } : action.load;
      if (rng() < accuracy(hitLoad, monster, state, zoryaEmpowered ? { accuracyMultiplier: 2.5 } : {})) {
        const damage = applyDamageCap(randInt(rng, 0, hitLoad.maxHit), monster, rng);
        const dealt = Math.min(state.hp, damage);
        state.hp -= dealt;
        totalDamage += dealt;
      }
    } else {
      let specHit = false;
      const acc = spec!.guaranteed ? 1 : accuracy(action.load, monster, state, { styleOverride: spec!.defStyle, accuracyMultiplier: spec!.accMult });
      const ctx: SpecCtx = { load: action.load, acc, rng, state, monsterName: monster.name,
        isDemon: monster.attributes.includes('demon'), options: args.specOptions, onHit: () => { specHit = true; } };
      for (const damage of spec!.hits(ctx, spec!.maxHit(action.load.maxHit))) {
        if (state.hp <= 0) break;
        const dealt = Math.min(state.hp, applyDamageCap(damage, monster, rng));
        state.hp -= dealt;
        totalDamage += dealt;
      }
      if (spec!.id === 'zorya_tome' && specHit) zoryaEmpoweredAttacks = 3;
    }
    damageByAttack.push(totalDamage);
    ticksByAttack.push(elapsed + attackSpeed);
    if (state.hp <= 0) return { killed: true, killAttack: i + 1, killTicks: elapsed + attackSpeed,
      ticks: elapsed + attackSpeed, damageByAttack, ticksByAttack };
    const pause = i + 1 < actions.length
      ? Math.max(0, Math.floor(action.downtimeAfterTicks ?? 0)) : 0;
    advanceTicks(pause + attackSpeed);
  }
  return { killed: false, killAttack: null, killTicks: null, ticks: elapsed, damageByAttack, ticksByAttack };
};

/** Conservative feasibility: start at 100% and assume successful Tome specs accelerate follow-up attacks. */
export const affordableSpecCount = (actions: SequenceAttack[], lightbearer: boolean): number => {
  let energy = 100;
  const interval = lightbearer ? 25 : 50;
  let regenCounter = interval;
  let empoweredAttacks = 0;
  let affordable = 0;
  const advance = (ticks: number) => {
    for (let i = 0; i < ticks; i++) {
      if (energy < 100 && --regenCounter <= 0) {
        energy = Math.min(100, energy + 10);
        regenCounter = interval;
      }
    }
  };
  actions.forEach((action, index) => {
    const useSpec = !!action.spec && energy >= action.spec.cost;
    if (useSpec) { energy -= action.spec!.cost; affordable++; }
    const empowered = empoweredAttacks > 0 && action.weaponName === "Zorya's tome";
    if (empowered) empoweredAttacks--;
    if (useSpec && action.spec!.id === 'zorya_tome') empoweredAttacks = 3;
    const speed = empowered ? 2 : action.load.speed;
    const pause = index + 1 < actions.length ? Math.max(0, Math.floor(action.downtimeAfterTicks ?? 0)) : 0;
    advance(speed + pause);
  });
  return affordable;
};

/** Monte Carlo odds plus expected clear time under retry-after-prefix policies. */
export const simulateSequence = (args: {
  monster: Monster; actions: SequenceAttack[]; trials: number; seed?: number;
  lightbearer?: boolean; specOptions?: Record<string, boolean>;
  targetSeconds?: number; downtimeSeconds?: number; resetSeconds?: number;
}): SequenceResult => {
  const { monster, actions } = args;
  const trials = Math.max(1, Math.floor(args.trials));
  const specOptions = args.specOptions ?? {};
  const energyRequired = actions.reduce((sum, a) => sum + (a.spec?.cost ?? 0), 0);
  const plannedSpecCount = actions.filter((action) => action.spec).length;
  const affordableSpecs = affordableSpecCount(actions, !!args.lightbearer);
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
  const sampleRng = mulberry32(args.seed ?? 712367);
  const traces = Array.from({ length: trials }, () => attempt({ monster, actions, rng: sampleRng,
    lightbearer: !!args.lightbearer, specOptions }));
  const killTicks = traces.flatMap((trace) => trace.killed && trace.killTicks !== null ? [trace.killTicks] : []);
  const resultKills = killTicks.length;
  let targetKills = 0;
  let maximumDamage = 0;
  // Four maximum hits is a deliberately generous upper bound for every spec;
  // this check must never call a possible kill impossible due to undercounting.
  const maximumPerHit = (damage: number) => monster.name === 'Zulrah' ? Math.min(50, damage) : damage;
  for (const action of actions) maximumDamage += action.spec
    ? maximumPerHit(action.spec.maxHit(action.load.maxHit)) * 4
    : maximumPerHit(action.load.maxHit);

  for (const trace of traces) {
    if (trace.killed && trace.killTicks !== null && targetSeconds > 0
      && trace.killTicks * .6 + downtimeSeconds <= targetSeconds) targetKills++;
  }

  const baselineTime = traces.reduce((sum, trace) => sum + (trace.killed
    ? (trace.killTicks ?? 0) * .6 + downtimeSeconds
    : trace.ticks * .6 + resetSeconds), 0);
  const makeOption = (afterAttack: number, minDamageToContinue: number, kills: number, timeSum: number) => ({
    afterAttack, minDamageToContinue, chance: kills / trials,
    expectedSeconds: kills > 0 ? timeSum / kills : null,
  });
  const candidates: SequenceResult['resetOptions'] = [makeOption(0, 0, resultKills, baselineTime)];

  // Evaluate damage-conditioned reset rules with sorted damage groups and prefix sums.
  // This avoids rerunning combat for every possible damage threshold.
  for (let attackIndex = 1; attackIndex <= actions.length; attackIndex++) {
    const aliveAtCheckpoint = traces.filter((trace) => !trace.killed || (trace.killAttack ?? 0) > attackIndex)
      .map((trace) => ({
        damage: trace.damageByAttack[attackIndex - 1] ?? 0,
        continueTime: trace.killed
          ? (trace.killTicks ?? 0) * .6 + downtimeSeconds
          : trace.ticks * .6 + resetSeconds,
        earlyResetTime: (trace.ticksByAttack[attackIndex - 1] ?? trace.ticks) * .6 + resetSeconds,
        continuesToKill: trace.killed,
      })).sort((a, b) => a.damage - b.damage);
    let removedContinueTime = 0;
    let replacedEarlyTime = 0;
    let removedKills = 0;
    for (let i = 0; i < aliveAtCheckpoint.length;) {
      const damage = aliveAtCheckpoint[i].damage;
      let j = i;
      while (j < aliveAtCheckpoint.length && aliveAtCheckpoint[j].damage === damage) {
        const row = aliveAtCheckpoint[j];
        removedContinueTime += row.continueTime;
        replacedEarlyTime += row.earlyResetTime;
        if (row.continuesToKill) removedKills++;
        j++;
      }
      candidates.push(makeOption(attackIndex, damage + 1, resultKills - removedKills,
        baselineTime - removedContinueTime + replacedEarlyTime));
      i = j;
    }
  }

  const resetOptions = candidates
    .sort((a, b) => (a.expectedSeconds ?? Infinity) - (b.expectedSeconds ?? Infinity))
    .slice(0, 8);
  const bestOption = resetOptions[0];
  const optimalResetAfterAttack = bestOption && bestOption.minDamageToContinue > 0 ? bestOption.afterAttack : null;
  const optimalResetMinDamage = bestOption?.minDamageToContinue ?? 0;
  const expectedKillSeconds = bestOption?.expectedSeconds ?? null;
  killTicks.sort((a, b) => a - b);
  return {
    trials, kills: resultKills, killChance: resultKills / trials,
    targetChance: targetSeconds > 0 ? targetKills / trials : null, targetSeconds,
    meanKillTicks: killTicks.length ? killTicks.reduce((a, b) => a + b, 0) / killTicks.length : null,
    medianKillTicks: percentile(killTicks, .5), p90KillTicks: percentile(killTicks, .9),
    sequenceTicks, energyRequired, plannedSpecCount, affordableSpecCount: affordableSpecs, downtimeSeconds, resetSeconds,
    optimalResetAfterAttack, optimalResetMinDamage, expectedKillSeconds, resetOptions,
    mathematicallyImpossible: maximumDamage < monster.hp,
  };
};
