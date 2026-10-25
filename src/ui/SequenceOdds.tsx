import { useEffect, useRef, useState } from 'react';
import GearGrid, { ItemIcon } from './GearGrid';
import { ammoFor, type Equip, type GearSet, type Slot } from '../sim/gear';
import { defaultStyleIndex, stylesForCategory } from '../sim/attackStyles';
import type { Monster } from '../sim/types';
import type { SequenceAttack, SequenceResult } from '../sim/sequence';
import type { SpecDef } from '../sim/specs';
import { gearToRefs, refsToGear, type ItemRef } from './setups';
import { simulateSequence } from '../sim/sequence';

export interface SequenceSetup {
  gear: GearSet;
  styleIndex: number;
  prayerKey: string;
  potionId: string;
  spellName: string;
}
interface SpecAttack { id: string; def: SpecDef }
interface AttackGroup {
  id: string; count: number; useSpec: boolean; setup: SequenceSetup | null;
  downtimeSeconds: number; editing: boolean;
}
interface Props {
  monster: Monster | null; baseGear: GearSet;
  baseSetup: SequenceSetup;
  itemsBySlot: Map<Slot, Equip[]>; equipment: Equip[]; specs: SpecAttack[];
  specOptions: Record<string, boolean>; startEnergy: number; lightbearer: boolean;
  buildAttack: (setup: SequenceSetup, useSpec: boolean) => SequenceAttack | null;
  makePreset: (id: string) => SequenceSetup;
}
interface StoredGroup extends Omit<AttackGroup, 'setup'> {
  setup: (Omit<SequenceSetup, 'gear'> & { gear: Partial<Record<Slot, ItemRef>> }) | null;
}
interface SavedStrategy {
  groups: StoredGroup[]; trials: number; targetSeconds: number;
  killOverheadSeconds: number; resetSeconds: number;
}
interface LoadedStrategy extends Partial<Omit<SavedStrategy, 'groups'>> { groups?: AttackGroup[] }
const STORAGE_KEY = 'specscape.speedrun.strategy.v1';
const MAX_ATTACKS = 30;
const freshGroup = (): AttackGroup => ({ id: crypto.randomUUID(), count: 1, useSpec: false, setup: null, downtimeSeconds: 0, editing: false });
const chance = (value: number) => `${(value * 100).toFixed(value < .01 && value > 0 ? 3 : 1)}%`;
const specForWeapon = (weaponName: string | undefined, specs: SpecAttack[]): SpecAttack | undefined =>
  weaponName ? specs.find((spec) => weaponName === spec.def.item || weaponName.startsWith(`${spec.def.item} (`)) : undefined;
const downloadJson = (name: string, data: unknown) => {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = name; anchor.click(); URL.revokeObjectURL(url);
};
const readStrategy = (equipment: Equip[]): LoadedStrategy | null => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as Partial<SavedStrategy> & { steps?: StoredGroup[] };
    const rawGroups = saved.groups ?? saved.steps ?? [];
    if (!Array.isArray(rawGroups)) return null;
    const groups = rawGroups.slice(0, MAX_ATTACKS).map((group) => {
      const legacy = group as StoredGroup & { specId?: string | null; gearOverride?: Partial<Record<Slot, ItemRef>> | null; styleIndex?: number | null };
      const setup = legacy.setup
        ? { ...legacy.setup, gear: refsToGear(legacy.setup.gear, equipment) }
        : legacy.gearOverride ? { gear: refsToGear(legacy.gearOverride, equipment), styleIndex: legacy.styleIndex ?? 0, prayerKey: 'piety', potionId: 'super_combat', spellName: '' } : null;
      return { ...group, useSpec: legacy.useSpec ?? !!legacy.specId, count: Math.max(1, group.count ?? 1), setup,
        downtimeSeconds: group.downtimeSeconds ?? 0, editing: false } as AttackGroup;
    });
    return { ...saved, killOverheadSeconds: saved.killOverheadSeconds ?? (saved as Partial<SavedStrategy> & { downtimeSeconds?: number }).downtimeSeconds,
      groups: groups.length ? groups : [freshGroup()] };
  } catch { return null; }
};

export default function SequenceOdds({ monster, baseGear, baseSetup, itemsBySlot, equipment, specs,
  specOptions, startEnergy, lightbearer, buildAttack, makePreset }: Props) {
  const [groups, setGroups] = useState<AttackGroup[]>([]);
  const [trials, setTrials] = useState(20000);
  const [targetSeconds, setTargetSeconds] = useState(0);
  const [killOverheadSeconds, setKillOverheadSeconds] = useState(0);
  const [resetSeconds, setResetSeconds] = useState(10);
  const [result, setResult] = useState<SequenceResult | null>(null);
  const [running, setRunning] = useState(false);
  const initialized = useRef(false);
  useEffect(() => {
    if (!equipment.length || initialized.current) return;
    const saved = readStrategy(equipment);
    const isOldBlankDefault = saved?.groups?.length === 5 && saved.groups.every((g) => !g.useSpec && !g.setup && g.count === 1);
    const isOldZulrahDefault = saved?.groups?.length === 2
      && saved.groups[0].count === 2 && saved.groups[0].useSpec
      && saved.groups[0].setup?.gear.weapon?.name === "Zorya's tome"
      && saved.groups[1].count === 1 && saved.groups[1].useSpec
      && saved.groups[1].setup?.gear.weapon?.name?.startsWith('Crystal halberd');
    if (!saved || isOldBlankDefault) {
      const mage = makePreset('max_magic_shadow');
      const tome = equipment.find((item) => item.name === "Zorya's tome" && item.slot === 'weapon');
      const melee = makePreset('max_melee_scythe');
      const halberd = equipment.find((item) => item.name === 'Crystal halberd' && item.slot === 'weapon');
      if (tome) mage.gear.weapon = tome;
      if (halberd) melee.gear.weapon = halberd;
      mage.styleIndex = defaultStyleIndex(stylesForCategory(mage.gear.weapon?.category));
      melee.styleIndex = defaultStyleIndex(stylesForCategory(melee.gear.weapon?.category));
      setGroups([
        { ...freshGroup(), count: 2, useSpec: true, setup: mage },
        { ...freshGroup(), useSpec: true, setup: melee },
      ]);
    } else if (isOldZulrahDefault) {
      setGroups(saved.groups!.map((group, index) => ({ ...group, setup: group.setup ? {
        ...group.setup,
        prayerKey: index === 1 ? 'zeal' : group.setup.prayerKey,
        potionId: 'smelling_salts',
      } : null })));
    } else setGroups(saved.groups ?? [freshGroup()]);
    if (saved && !isOldBlankDefault) {
      setTrials(saved.trials ?? 20000);
      setTargetSeconds(saved.targetSeconds ?? 0);
      setKillOverheadSeconds(saved.killOverheadSeconds ?? 0);
      setResetSeconds(saved.resetSeconds ?? 10);
    }
    initialized.current = true;
  }, [equipment, makePreset]);
  const attackCount = groups.reduce((sum, group) => sum + group.count, 0);

  useEffect(() => {
    try {
      const strategy: SavedStrategy = { groups: groups.map((group) => ({ ...group,
        setup: group.setup ? { ...group.setup, gear: gearToRefs(group.setup.gear) } : null,
      })), trials, targetSeconds, killOverheadSeconds, resetSeconds };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(strategy));
    } catch { /* browser storage is optional */ }
  }, [groups, trials, targetSeconds, killOverheadSeconds, resetSeconds]);

  const resolved: SequenceAttack[] = [];
  let generatedIndex = 0;
  groups.forEach((group) => {
    const setup = group.setup ?? baseSetup;
    for (let index = 0; index < group.count; index++) {
      const attack = buildAttack(setup, group.useSpec);
      if (attack) resolved.push({ ...attack, id: `${group.id}-${index}`,
        downtimeAfterTicks: generatedIndex === attackCount - 1 ? 0 : Math.round(group.downtimeSeconds / .6) });
      generatedIndex++;
    }
  });
  const energyRequired = resolved.reduce((sum, attack) => sum + (attack.spec?.cost ?? 0), 0);
  const updateGroup = (index: number, update: Partial<AttackGroup>) => {
    setGroups((current) => current.map((group, i) => i === index ? { ...group, ...update } : group)); setResult(null);
  };
  const setCount = (index: number, count: number) => {
    const others = groups.reduce((sum, g, i) => sum + (i === index ? 0 : g.count), 0);
    updateGroup(index, { count: Math.max(1, Math.min(MAX_ATTACKS - others, Math.floor(count) || 1)) });
  };
  const reorder = (from: number, to: number) => {
    if (from === to || to < 0 || to >= groups.length) return;
    setGroups((current) => { const next = [...current]; const [moved] = next.splice(from, 1); next.splice(to, 0, moved); return next; }); setResult(null);
  };
  const run = () => {
    if (!monster || !resolved.length || running) return;
    setRunning(true);
    window.setTimeout(() => {
      setResult(simulateSequence({ monster, actions: resolved, trials, startEnergy, lightbearer, specOptions,
        targetSeconds, downtimeSeconds: killOverheadSeconds, resetSeconds })); setRunning(false);
    }, 0);
  };

  return <section className="panel sequence-odds">
    <div className="sequence-heading"><div><h2>Speedrun odds</h2>
      <p className="help-text">Build a repeatable attack sequence for {monster?.name ?? 'the selected boss'}.</p>
      </div>
      <div className="sequence-heading-actions"><span className="fact">{attackCount} attacks · {energyRequired}% total spec cost</span>
        <button className="mini" onClick={() => downloadJson('speedrun-loadout.json', {
          schema: 'specscape.speedrun-loadout.v1', exportedAt: new Date().toISOString(),
          boss: monster ? { name: monster.name, version: monster.version } : null,
          baseLoadout: { gear: gearToRefs(baseSetup.gear), styleIndex: baseSetup.styleIndex,
            prayerKey: baseSetup.prayerKey, potionId: baseSetup.potionId, spellName: baseSetup.spellName },
          strategy: groups.map((group) => ({ count: group.count, useSpec: group.useSpec,
            setup: group.setup ? { ...group.setup, gear: gearToRefs(group.setup.gear) } : null,
            downtimeSeconds: group.downtimeSeconds })),
          trials, targetSeconds, killOverheadSeconds, resetSeconds,
        })}>Export Speedrun loadout</button>
      </div></div>
    {!monster && <div className="warn">Choose a boss above to simulate a sequence.</div>}

    <div className="sequence-presets"><span>Quick add:</span>
      <button className="mini" disabled={attackCount >= MAX_ATTACKS} onClick={() => { setGroups((g) => [...g, { ...freshGroup(), setup: makePreset('max_melee_scythe') }]); setResult(null); }}>Max melee</button>
      <button className="mini" disabled={attackCount >= MAX_ATTACKS} onClick={() => { setGroups((g) => [...g, { ...freshGroup(), setup: makePreset('max_ranged_tbow') }]); setResult(null); }}>Max ranged</button>
      <button className="mini" disabled={attackCount >= MAX_ATTACKS} onClick={() => { setGroups((g) => [...g, { ...freshGroup(), setup: makePreset('max_magic_shadow') }]); setResult(null); }}>Max mage</button>
    </div>

    <div className="sequence-actions">
      {groups.map((group, index) => {
        const setup = group.setup ?? baseSetup;
        const gear = setup.gear;
        const styles = stylesForCategory(gear.weapon?.category);
        const styleIndex = Math.min(setup.styleIndex, styles.length - 1);
        const attack = buildAttack(setup, group.useSpec);
        const weaponSpec = specForWeapon(gear.weapon?.name, specs);
        const customItems = new Map(itemsBySlot); customItems.set('ammo', ammoFor(gear.weapon, itemsBySlot.get('ammo') ?? []));
        const drag = { index };
        return <div className="sequence-action-card" key={group.id} draggable onDragStart={(event) => { event.dataTransfer.setData('text/plain', String(index)); event.dataTransfer.effectAllowed = 'move'; }}
          onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); reorder(Number(event.dataTransfer.getData('text/plain')), drag.index); }}>
          <div className="sequence-action">
            <div className="sequence-action-main">
              <span className="sequence-drag" title="Drag to reorder">⠿</span><b>{String(index + 1).padStart(2, '0')}</b>
              <span className="sequence-weapon" title={gear.weapon?.name ?? 'Unarmed'}>
                {gear.weapon && <ItemIcon item={gear.weapon} size={24} />}
                <span>{gear.weapon?.name ?? 'Unarmed'}</span>
              </span>
              <label className="sequence-count-control"><span>Attacks</span><input type="number" min={1} max={MAX_ATTACKS} value={group.count} onChange={(event) => setCount(index, Number(event.target.value))} /></label>
              <label className="sequence-spec-toggle" title={weaponSpec ? `Use ${weaponSpec.def.name} special` : 'No modeled special attack for this weapon'}><input type="checkbox" role="switch" aria-label="Use special attack" checked={group.useSpec} disabled={!weaponSpec}
                onChange={(event) => updateGroup(index, { useSpec: event.target.checked })} /><span>Use spec</span></label>
              {!group.useSpec && <span className="sequence-regular">Regular attack</span>}
              <span className="sequence-detail">
                {attack?.load.maxHit ?? 0} max · {group.useSpec && weaponSpec?.def.id === 'zorya_tome'
                  ? '9 ticks total on hit' : `${attack?.load.speed ?? 0} ticks`}
              </span>
            </div>
            <div className="sequence-action-buttons">
              <button className="mini" title="Edit gear and attack style" onClick={() => updateGroup(index, { editing: !group.editing, setup: group.setup ?? { ...baseSetup, gear: { ...baseGear } } })}>{group.setup ? 'Edit setup' : 'Gear switch'}</button>
              <button className="mini" title="Move earlier" disabled={index === 0} onClick={() => reorder(index, index - 1)}>↑</button>
              <button className="mini" title="Move later" disabled={index === groups.length - 1} onClick={() => reorder(index, index + 1)}>↓</button>
              <button className="mini" title="Remove loadout" disabled={groups.length <= 1} onClick={() => { setGroups((g) => g.filter((_, i) => i !== index)); setResult(null); }}>×</button>
            </div>
          </div>
          <div className="sequence-row-subcontrols">
            <label><span>Downtime after each attack (s)</span><input type="number" min={0} max={120} step={.1} value={group.downtimeSeconds} onChange={(event) => updateGroup(index, { downtimeSeconds: Math.max(0, Number(event.target.value) || 0) })} /></label>
          </div>
          {group.editing && group.setup && <div className="sequence-setup-panel">
            <div className="sequence-setup-heading"><strong>Loadout {index + 1} · {gear.weapon?.name ?? 'Unarmed'}</strong>
              <button className="mini" onClick={() => updateGroup(index, { setup: null, editing: false })}>Use Speedrun default</button></div>
            <label className="sequence-style-select"><span>Attack style</span><div className="speedrun-icon-select">
              <img className="speedrun-game-icon" src="https://oldschool.runescape.wiki/images/Attack_style_icon.png" alt="" />
              <select value={styleIndex} onChange={(event) => updateGroup(index, { setup: { ...group.setup!, styleIndex: Number(event.target.value) } })}>
                {styles.map((style, i) => <option key={`${style.name}-${i}`} value={i}>{style.name} ({style.stance})</option>)}</select></div></label>
            <GearGrid gear={gear} itemsBySlot={customItems} onChange={(slot, item) => {
              const nextGear = { ...gear, [slot]: item }; const nextStyles = stylesForCategory(nextGear.weapon?.category);
              const weaponHasSpec = !!specForWeapon(nextGear.weapon?.name, specs);
              updateGroup(index, { setup: { ...setup, gear: nextGear, styleIndex: slot === 'weapon' ? defaultStyleIndex(nextStyles) : styleIndex },
                ...(slot === 'weapon' && !weaponHasSpec ? { useSpec: false } : {}) });
            }} attackType={attack?.load.type ?? 'melee'} targetAttributes={monster?.attributes ?? []} />
          </div>}
        </div>;
      })}
    </div>
    <button className="mini sequence-add" disabled={attackCount >= MAX_ATTACKS} onClick={() => { setGroups((g) => [...g, freshGroup()]); setResult(null); }}>+ Add loadout line</button>

    <div className="sequence-controls">
      <label><span>Trials</span><select value={trials} onChange={(event) => setTrials(Number(event.target.value))}><option value={5000}>5,000</option><option value={20000}>20,000</option><option value={100000}>100,000</option></select></label>
      <label><span>Record target (seconds, optional)</span><input type="number" min={0} max={600} step={.1} value={targetSeconds} onChange={(event) => setTargetSeconds(Math.max(0, Number(event.target.value) || 0))} /></label>
      <label><span title="Time added for phase transitions, death animation, etc.">Kill overhead (seconds)</span><input type="number" min={0} max={600} step={.1} value={killOverheadSeconds} onChange={(event) => setKillOverheadSeconds(Math.max(0, Number(event.target.value) || 0))} /></label>
      <label><span title="Time spent resetting before retrying">Reset time (seconds)</span><input type="number" min={0} max={600} step={.1} value={resetSeconds} onChange={(event) => setResetSeconds(Math.max(0, Number(event.target.value) || 0))} /></label>
      <button className="primary sequence-run" disabled={!monster || !resolved.length || running} onClick={run}>{running ? 'Simulating…' : 'Simulate sequence'}</button>
    </div>
    {result && <div className="sequence-results">
      <div className="sequence-result-primary"><span>Kill chance per attempt</span><strong>{chance(result.killChance)}</strong><small>{result.kills.toLocaleString()} / {result.trials.toLocaleString()} trials</small></div>
      <div className="sequence-result-primary"><span>Best reset point</span><strong>{result.optimalResetAfterAttack === null ? 'None' : `After attack ${result.optimalResetAfterAttack}`}</strong><small>{result.expectedKillSeconds === null ? 'No kills observed at any cutoff' : `${result.expectedKillSeconds.toFixed(2)}s expected per kill with retries`}</small></div>
      {result.targetChance !== null && <div className="sequence-result-primary"><span>At or under {result.targetSeconds.toFixed(1)}s</span><strong>{chance(result.targetChance)}</strong><small>single-attempt kill chance</small></div>}
      <div><span>Sequence length if Tome specs hit</span><b>{result.sequenceTicks} ticks · {(result.sequenceTicks * .6).toFixed(2)}s</b><small>includes the 2-tick empowered Tome attacks and configured pauses</small></div>
      <div><span>Mean / median kill time</span><b>{result.meanKillTicks === null ? 'No kills' : `${(result.meanKillTicks * .6 + result.downtimeSeconds).toFixed(2)}s / ${((result.medianKillTicks ?? 0) * .6 + result.downtimeSeconds).toFixed(2)}s`}</b><small>successful attempts including kill overhead</small></div>
      <div className="sequence-reset-options"><span>Reset strategy comparison</span>{result.resetOptions.map((option) => <small key={option.afterAttack}>After {option.afterAttack}: {chance(option.chance)} · {option.expectedSeconds === null ? 'no sampled kills' : `${option.expectedSeconds.toFixed(2)}s expected`}</small>)}</div>
      {result.mathematicallyImpossible && <p className="warn sequence-caveat">This sequence is mathematically unable to deal enough maximum damage to defeat this boss, even if every hit reaches its maximum.</p>}
      <p className="help-text sequence-caveat">The reset estimate assumes each retry starts with the same spec energy. Damage and accuracy are simulated; pauses between attacks, kill overhead, and reset time are included. Boss phases, weapon procs, movement, and incoming damage are not modeled.</p>
    </div>}
  </section>;
}
