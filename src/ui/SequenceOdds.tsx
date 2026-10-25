import { useEffect, useMemo, useState } from 'react';
import GearGrid from './GearGrid';
import { ammoFor, type Equip, type GearSet, type Slot } from '../sim/gear';
import { defaultStyleIndex, stylesForCategory } from '../sim/attackStyles';
import type { Monster } from '../sim/types';
import type { SequenceAttack, SequenceResult } from '../sim/sequence';
import type { SpecDef } from '../sim/specs';
import { gearToRefs, refsToGear, type ItemRef } from './setups';
import { simulateSequence } from '../sim/sequence';

interface SpecAttack {
  id: string;
  def: SpecDef;
}

interface AttackStep {
  id: string;
  specId: string | null;
  /** null means inherit the Speedrun page's independent default setup. */
  gearOverride: GearSet | null;
  styleIndex: number | null;
  editing: boolean;
}

interface Props {
  monster: Monster | null;
  baseGear: GearSet;
  baseStyleIndex: number;
  itemsBySlot: Map<Slot, Equip[]>;
  equipment: Equip[];
  specs: SpecAttack[];
  specOptions: Record<string, boolean>;
  startEnergy: number;
  lightbearer: boolean;
  buildAttack: (gear: GearSet, styleIndex: number, specId: string | null) => SequenceAttack | null;
}

interface StoredAttackStep {
  id: string;
  specId: string | null;
  gearOverride: Partial<Record<Slot, ItemRef>> | null;
  styleIndex: number | null;
  editing: boolean;
}

interface SavedStrategy {
  steps: StoredAttackStep[];
  trials: number;
  targetSeconds: number;
  downtimeSeconds: number;
}

interface LoadedStrategy extends Partial<Omit<SavedStrategy, 'steps'>> {
  steps?: AttackStep[];
}

const STORAGE_KEY = 'specscape.speedrun.strategy.v1';
const MAX_ATTACKS = 30;
const newStep = (): AttackStep => ({ id: crypto.randomUUID(), specId: null, gearOverride: null, styleIndex: null, editing: false });

const readStrategy = (equipment: Equip[]): LoadedStrategy | null => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as Partial<SavedStrategy>;
    if (!Array.isArray(saved.steps)) return null;
    const steps = saved.steps.slice(0, MAX_ATTACKS).map((step) => ({
      ...step,
      gearOverride: step.gearOverride ? refsToGear(step.gearOverride, equipment) : null,
      editing: false,
    }));
    return { ...saved, steps: steps.length ? steps as AttackStep[] : [newStep()] };
  } catch {
    return null;
  }
};

const chance = (value: number) => `${(value * 100).toFixed(value < 0.01 && value > 0 ? 3 : 1)}%`;
const seconds = (ticks: number | null, downtime = 0) => ticks === null ? 'No kills' : `${(ticks * 0.6 + downtime).toFixed(2)}s`;

export default function SequenceOdds({
  monster, baseGear, baseStyleIndex, itemsBySlot, equipment, specs,
  specOptions, startEnergy, lightbearer, buildAttack,
}: Props) {
  const saved = useMemo(() => readStrategy(equipment), [equipment]);
  const [actions, setActions] = useState<AttackStep[]>(() => saved?.steps as AttackStep[] ?? Array.from({ length: 5 }, newStep));
  const [trials, setTrials] = useState(saved?.trials ?? 20000);
  const [targetSeconds, setTargetSeconds] = useState(saved?.targetSeconds ?? 0);
  const [downtimeSeconds, setDowntimeSeconds] = useState(saved?.downtimeSeconds ?? 0);
  const [result, setResult] = useState<SequenceResult | null>(null);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    try {
      const strategy: SavedStrategy = {
        steps: actions.map((step) => ({
          ...step,
          gearOverride: step.gearOverride ? gearToRefs(step.gearOverride) : null,
        })),
        trials,
        targetSeconds,
        downtimeSeconds,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(strategy));
    } catch {
      // The simulator remains usable when browser storage is unavailable.
    }
  }, [actions, trials, targetSeconds, downtimeSeconds]);

  const resolved = actions.map((step) => buildAttack(
    step.gearOverride ?? baseGear,
    step.styleIndex ?? baseStyleIndex,
    step.specId,
  )).filter((attack): attack is SequenceAttack => !!attack);
  const energyRequired = resolved.reduce((sum, attack) => sum + (attack.spec?.cost ?? 0), 0);

  const updateStep = (index: number, update: Partial<AttackStep>) => {
    setActions((current) => current.map((step, i) => i === index ? { ...step, ...update } : step));
    setResult(null);
  };

  const setAttackCount = (count: number) => {
    const bounded = Math.max(1, Math.min(MAX_ATTACKS, Math.floor(count) || 1));
    setActions((current) => current.length === bounded
      ? current
      : current.length > bounded
        ? current.slice(0, bounded)
        : [...current, ...Array.from({ length: bounded - current.length }, newStep)]);
    setResult(null);
  };

  const run = () => {
    if (!monster || !resolved.length || running) return;
    setRunning(true);
    window.setTimeout(() => {
      setResult(simulateSequence({
        monster, actions: resolved, trials, startEnergy, lightbearer,
        specOptions, targetSeconds, downtimeSeconds,
      }));
      setRunning(false);
    }, 0);
  };

  return (
    <section className="panel sequence-odds">
      <div className="sequence-heading">
        <div>
          <h2>Speedrun odds</h2>
          <p className="help-text">Choose the attack count, special attacks, and gear switches for {monster?.name ?? 'the selected boss'}.</p>
        </div>
        <span className="fact">{actions.length} attacks · {energyRequired}% total spec cost</span>
      </div>

      {!monster && <div className="warn">Choose a boss in SpecScape to simulate a sequence.</div>}

      <div className="sequence-actions">
        {actions.map((step, index) => {
          const attackGear = step.gearOverride ?? baseGear;
          const styleOptions = stylesForCategory(attackGear.weapon?.category);
          const styleIndex = Math.min(step.styleIndex ?? baseStyleIndex, styleOptions.length - 1);
          const attack = buildAttack(attackGear, styleIndex, step.specId);
          const customItems = new Map(itemsBySlot);
          customItems.set('ammo', ammoFor(attackGear.weapon, itemsBySlot.get('ammo') ?? []));

          return (
            <div className="sequence-action-card" key={step.id}>
              <div className="sequence-action">
                <div className="sequence-action-main">
                  <b>{String(index + 1).padStart(2, '0')}</b>
                  <label className="sequence-spec-toggle">
                    <input
                      type="checkbox"
                      checked={step.specId !== null}
                      onChange={(event) => updateStep(index, {
                        specId: event.target.checked ? step.specId ?? specs[0]?.id ?? null : null,
                      })}
                    />
                    Use spec
                  </label>
                  {step.specId ? (
                    <select aria-label={`Special attack for attack ${index + 1}`} value={step.specId} onChange={(event) => updateStep(index, { specId: event.target.value })}>
                      {specs.map((spec) => <option key={spec.id} value={spec.id}>{spec.def.name} ({spec.def.cost}%)</option>)}
                    </select>
                  ) : <span className="sequence-regular">Regular attack</span>}
                  <span className="sequence-detail">{attack?.load.maxHit ?? 0} max · {attack?.load.speed ?? 0} ticks</span>
                </div>
                <div className="sequence-action-buttons">
                  <button className="mini" title={step.gearOverride ? 'Edit this attack setup' : 'Set a gear switch for this attack'} onClick={() => {
                    const baseStyles = stylesForCategory(baseGear.weapon?.category);
                    updateStep(index, {
                      editing: !step.editing,
                      gearOverride: step.gearOverride ?? { ...baseGear },
                      styleIndex: step.styleIndex ?? Math.min(baseStyleIndex, baseStyles.length - 1),
                    });
                  }}>{step.gearOverride ? 'Edit setup' : 'Gear switch'}</button>
                  <button className="mini" title="Move earlier" disabled={index === 0} onClick={() => {
                    setActions((current) => { const next = [...current]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; return next; }); setResult(null);
                  }}>↑</button>
                  <button className="mini" title="Move later" disabled={index === actions.length - 1} onClick={() => {
                    setActions((current) => { const next = [...current]; [next[index + 1], next[index]] = [next[index], next[index + 1]]; return next; }); setResult(null);
                  }}>↓</button>
                  <button className="mini" title="Remove attack" disabled={actions.length <= 1} onClick={() => setAttackCount(actions.length - 1)}>×</button>
                </div>
              </div>

              {step.editing && step.gearOverride && (
                <div className="sequence-setup-panel">
                  <div className="sequence-setup-heading">
                    <strong>Attack {index + 1} gear setup</strong>
                    <button className="mini" onClick={() => updateStep(index, { gearOverride: null, styleIndex: null, editing: false })}>Use Speedrun default</button>
                  </div>
                  <label className="sequence-style-select">
                    <span>Attack style</span>
                    <select value={styleIndex} onChange={(event) => updateStep(index, { styleIndex: Number(event.target.value) })}>
                      {styleOptions.map((style, styleOptionIndex) => <option key={`${style.name}-${styleOptionIndex}`} value={styleOptionIndex}>{style.name} ({style.stance})</option>)}
                    </select>
                  </label>
                  <GearGrid
                    gear={step.gearOverride}
                    itemsBySlot={customItems}
                    onChange={(slot, item) => {
                      const nextGear = { ...step.gearOverride!, [slot]: item };
                      const nextStyles = stylesForCategory(nextGear.weapon?.category);
                      updateStep(index, {
                        gearOverride: nextGear,
                        styleIndex: slot === 'weapon' ? defaultStyleIndex(nextStyles) : styleIndex,
                      });
                    }}
                    attackType={attack?.load.type ?? 'melee'}
                    targetAttributes={monster?.attributes ?? []}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="sequence-controls">
        <label className="sequence-count-control">
          <span>Number of attacks</span>
          <input type="number" min={1} max={MAX_ATTACKS} value={actions.length} onChange={(event) => setAttackCount(Number(event.target.value))} />
        </label>
        <label>
          <span>Trials</span>
          <select value={trials} onChange={(event) => setTrials(Number(event.target.value))}>
            <option value={5000}>5,000</option><option value={20000}>20,000</option><option value={100000}>100,000</option>
          </select>
        </label>
        <label>
          <span>Record target (seconds, optional)</span>
          <input type="number" min={0} max={600} step={0.1} value={targetSeconds} onChange={(event) => setTargetSeconds(Math.max(0, Number(event.target.value) || 0))} />
        </label>
        <label>
          <span title="Fixed time added for phase transitions, death animation, and other pauses">Total downtime (seconds)</span>
          <input type="number" min={0} max={600} step={0.1} value={downtimeSeconds} onChange={(event) => setDowntimeSeconds(Math.max(0, Number(event.target.value) || 0))} />
        </label>
        <button className="primary sequence-run" disabled={!monster || !actions.length || running} onClick={run}>{running ? 'Simulating…' : 'Simulate sequence'}</button>
      </div>

      {result && <div className="sequence-results">
        <div className="sequence-result-primary"><span>Kill chance</span><strong>{chance(result.killChance)}</strong><small>{result.kills.toLocaleString()} / {result.trials.toLocaleString()} trials</small></div>
        {result.targetChance !== null && <div className="sequence-result-primary"><span>At or under {result.targetSeconds.toFixed(1)}s</span><strong>{chance(result.targetChance)}</strong><small>all trials, including failed kills</small></div>}
        <div><span>Mean run time</span><b>{seconds(result.meanKillTicks, result.downtimeSeconds)}</b><small>successful runs, downtime included</small></div>
        <div><span>Median / 90th percentile</span><b>{seconds(result.medianKillTicks, result.downtimeSeconds)} / {seconds(result.p90KillTicks, result.downtimeSeconds)}</b><small>successful runs, downtime included</small></div>
        <div><span>Full script time</span><b>{seconds(result.sequenceTicks, result.downtimeSeconds)}</b><small>including total downtime</small></div>
        <p className="help-text sequence-caveat">Each attack uses its selected special attack and gear setup. Regular attacks use standard accuracy and uniform damage rolls; specs account for accuracy, damage, defence drains, and energy costs. Total downtime is added to each run and record-target check. Boss phases, special main-weapon procs, movement, and incoming damage are not modeled.</p>
      </div>}
    </section>
  );
}
