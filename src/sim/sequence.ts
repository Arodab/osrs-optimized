import { accuracy } from './combat';
import { mulberry32, randInt } from './rng';
import type { SpecCtx, SpecDef } from './specs';
import type { Loadout, Monster, MonsterState } from './types';

export interface SequenceAttack {
  id: string;
  label: string;
  load: Loadout;
  spec?: SpecDef;
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
}

const freshState = (monster: Monster): MonsterState => ({
  hp: monster.hp,
  def: monster.def,
  magic: monster.magic,
  baseDef: monster.def,
  baseAtk: 0,
  baseStr: 0,
});

const percentile = (values: number[], p: number): number | null => {
  if (!values.length) return null;
  return values[Math.min(values.length - 1, Math.ceil(values.length * p) - 1)];
};

/** Monte Carlo odds for one ordered attack script against one boss. */
export const simulateSequence = (args: {
  monster: Monster;
  actions: SequenceAttack[];
  trials: number;
  seed?: number;
  startEnergy?: number;
  lightbearer?: boolean;
  specOptions?: Record<string, boolean>;
  targetSeconds?: number;
  downtimeSeconds?: number;
}): SequenceResult => {
  const { monster, actions } = args;
  const trials = Math.max(1, Math.floor(args.trials));
  const startEnergy = Math.max(0, Math.min(100, args.startEnergy ?? 100));
  const energyRequired = actions.reduce((sum, a) => sum + (a.spec?.cost ?? 0), 0);
  const sequenceTicks = actions.reduce((sum, a) => sum + a.load.speed, 0);
  const targetSeconds = Math.max(0, args.targetSeconds ?? 0);
  const downtimeSeconds = Math.max(0, args.downtimeSeconds ?? 0);
  const rng = mulberry32(args.seed ?? 712367);
  const killTicks: number[] = [];
  let targetKills = 0;

  for (let trial = 0; trial < trials; trial++) {
    const state = freshState(monster);
    let energy = startEnergy;
    let regenCounter = args.lightbearer ? 25 : 50;
    let elapsed = 0;
    let killed = false;

    for (const action of actions) {
      const spec = action.spec;
      if (spec && energy < spec.cost) break;
      if (spec) energy -= spec.cost;

      if (!spec) {
        const chance = accuracy(action.load, monster, state);
        if (rng() < chance) state.hp -= Math.min(state.hp, randInt(rng, 0, action.load.maxHit));
      } else {
        const acc = spec.guaranteed ? 1 : accuracy(action.load, monster, state, {
          styleOverride: spec.defStyle,
          accuracyMultiplier: spec.accMult,
        });
        const ctx: SpecCtx = {
          load: action.load,
          acc,
          rng,
          state,
          monsterName: monster.name,
          isDemon: monster.attributes.includes('demon'),
          options: args.specOptions ?? {},
        };
        const maxHit = spec.maxHit(action.load.maxHit);
        for (const damage of spec.hits(ctx, maxHit)) {
          if (state.hp <= 0) break;
          state.hp -= Math.min(state.hp, damage);
        }
      }

      if (state.hp <= 0) {
        elapsed += action.load.speed;
        killed = true;
        break;
      }

      for (let tick = 0; tick < action.load.speed; tick++) {
        elapsed++;
        if (energy < 100 && --regenCounter <= 0) {
          energy = Math.min(100, energy + 10);
          regenCounter = args.lightbearer ? 25 : 50;
        }
      }
    }

    if (killed) {
      killTicks.push(elapsed);
      if (targetSeconds > 0 && elapsed * 0.6 + downtimeSeconds <= targetSeconds) targetKills++;
    }
  }

  killTicks.sort((a, b) => a - b);
  return {
    trials,
    kills: killTicks.length,
    killChance: killTicks.length / trials,
    targetChance: targetSeconds > 0 ? targetKills / trials : null,
    targetSeconds,
    meanKillTicks: killTicks.length ? killTicks.reduce((a, b) => a + b, 0) / killTicks.length : null,
    medianKillTicks: percentile(killTicks, 0.5),
    p90KillTicks: percentile(killTicks, 0.9),
    sequenceTicks,
    energyRequired,
    downtimeSeconds,
  };
};
