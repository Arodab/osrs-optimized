import { useMemo, useState } from 'react';
import type { Loadout, Monster } from '../sim/types';
import type { SequenceAttack, SequenceResult } from '../sim/sequence';
import { simulateSequence } from '../sim/sequence';

interface SpecAttack {
  id: string;
  load: Loadout;
  def: import('../sim/specs').SpecDef;
}

interface Props {
  monster: Monster | null;
  main: Loadout;
  specs: SpecAttack[];
  specOptions: Record<string, boolean>;
  startEnergy: number;
  lightbearer: boolean;
}

const chance = (value: number) => `${(value * 100).toFixed(value < 0.01 && value > 0 ? 3 : 1)}%`;
const seconds = (ticks: number | null, downtime = 0) => ticks === null ? 'No kills' : `${(ticks * 0.6 + downtime).toFixed(2)}s`;

export default function SequenceOdds({ monster, main, specs, specOptions, startEnergy, lightbearer }: Props) {
  const attackOptions = useMemo<SequenceAttack[]>(() => [
    { id: 'main', label: `Main weapon (${main.name})`, load: main },
    ...specs.map((s) => ({ id: s.id, label: `${s.def.name} spec (${s.def.cost}%)`, load: s.load, spec: s.def })),
  ], [main, specs]);
  const [actions, setActions] = useState<string[]>(['main', 'main', 'main', 'main', 'main']);
  const [pending, setPending] = useState('main');
  const [trials, setTrials] = useState(20000);
  const [targetSeconds, setTargetSeconds] = useState(0);
  const [downtimeSeconds, setDowntimeSeconds] = useState(0);
  const [result, setResult] = useState<SequenceResult | null>(null);
  const [running, setRunning] = useState(false);

  const resolved = actions.map((id) => attackOptions.find((a) => a.id === id)).filter((a): a is SequenceAttack => !!a);
  const energyRequired = resolved.reduce((sum, a) => sum + (a.spec?.cost ?? 0), 0);

  const run = () => {
    if (!monster || !resolved.length || running) return;
    setRunning(true);
    // Let the button update before the bounded local simulation runs.
    window.setTimeout(() => {
      setResult(simulateSequence({
        monster,
        actions: resolved,
        trials,
        startEnergy,
        lightbearer,
        specOptions,
        targetSeconds,
          downtimeSeconds,
      }));
      setRunning(false);
    }, 0);
  };

  return (
    <section className="panel sequence-odds">
      <div className="sequence-heading">
        <div>
          <h2>Speedrun odds</h2>
          <p className="help-text">Build an attack order and estimate kill odds and run time for {monster?.name ?? 'the selected boss'}.</p>
        </div>
        <span className="fact">{actions.length} attacks · {energyRequired}% total spec cost</span>
      </div>

      {!monster && <div className="warn">Choose a boss in the encounter panel to simulate a sequence.</div>}

      <div className="sequence-actions">
        {actions.map((id, index) => {
          const current = attackOptions.find((a) => a.id === id);
          return (
            <div className="sequence-action" key={`${index}-${id}`}>
              <b>{String(index + 1).padStart(2, '0')}</b>
              <select aria-label={`Attack ${index + 1}`} value={id} onChange={(e) => {
                const next = [...actions]; next[index] = e.target.value; setActions(next); setResult(null);
              }}>
                {attackOptions.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
              </select>
              <span className="sequence-detail">{current?.load.maxHit ?? 0} max · {current?.load.speed ?? 0} ticks</span>
              <button className="mini" title="Move earlier" disabled={index === 0} onClick={() => {
                const next = [...actions]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; setActions(next); setResult(null);
              }}>↑</button>
              <button className="mini" title="Move later" disabled={index === actions.length - 1} onClick={() => {
                const next = [...actions]; [next[index + 1], next[index]] = [next[index], next[index + 1]]; setActions(next); setResult(null);
              }}>↓</button>
              <button className="mini" title="Remove attack" onClick={() => { setActions(actions.filter((_, i) => i !== index)); setResult(null); }}>×</button>
            </div>
          );
        })}
      </div>

      <div className="sequence-controls">
        <div className="sequence-add">
          <select aria-label="Attack to add" value={pending} onChange={(e) => setPending(e.target.value)}>
            {attackOptions.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
          </select>
          <button className="mini" disabled={actions.length >= 30} onClick={() => { setActions([...actions, pending]); setResult(null); }}>+ Add attack</button>
        </div>
        <label>
          <span>Trials</span>
          <select value={trials} onChange={(e) => setTrials(Number(e.target.value))}>
            <option value={5000}>5,000</option><option value={20000}>20,000</option><option value={100000}>100,000</option>
          </select>
        </label>
        <label>
          <span>Record target (seconds, optional)</span>
          <input type="number" min={0} max={600} step={0.1} value={targetSeconds} onChange={(e) => setTargetSeconds(Math.max(0, Number(e.target.value) || 0))} />
        </label>
        <label>
          <span title="Fixed time added for phase transitions, death animation, and other pauses">Total downtime (seconds)</span>
          <input type="number" min={0} max={600} step={0.1} value={downtimeSeconds} onChange={(e) => setDowntimeSeconds(Math.max(0, Number(e.target.value) || 0))} />
        </label>
        <button className="primary sequence-run" disabled={!monster || !actions.length || running} onClick={run}>{running ? 'Simulating…' : 'Simulate sequence'}</button>
      </div>

      {result && <div className="sequence-results">
        <div className="sequence-result-primary"><span>Kill chance</span><strong>{chance(result.killChance)}</strong><small>{result.kills.toLocaleString()} / {result.trials.toLocaleString()} trials</small></div>
        {result.targetChance !== null && <div className="sequence-result-primary"><span>At or under {result.targetSeconds.toFixed(1)}s</span><strong>{chance(result.targetChance)}</strong><small>all trials, including failed kills</small></div>}
        <div><span>Mean run time</span><b>{seconds(result.meanKillTicks, result.downtimeSeconds)}</b><small>successful runs, downtime included</small></div>
        <div><span>Median / 90th percentile</span><b>{seconds(result.medianKillTicks, result.downtimeSeconds)} / {seconds(result.p90KillTicks, result.downtimeSeconds)}</b><small>successful runs, downtime included</small></div>
        <div><span>Full script time</span><b>{seconds(result.sequenceTicks, result.downtimeSeconds)}</b><small>including total downtime</small></div>
        <p className="help-text sequence-caveat">Uses the current boss and loadout, with spec accuracy, damage rolls, defence drains, and energy costs. Regular attacks use the standard accuracy and uniform damage roll. Your total downtime is added to each run and record-target check. Boss phases, special main-weapon procs, movement, and incoming damage are not modeled; treat record-target odds as a strategy estimate.</p>
      </div>}
    </section>
  );
}
