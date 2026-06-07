import { StrictMode, useEffect, useMemo, useState, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'

import './styles.css'

type Unit = 'lb' | 'kg'

type VolumeByUnit = Record<Unit, number>

type ExerciseVolume = {
  exercise_name: string
  family: string
  movement_pattern: string | null
  unit: Unit
  volume: number
  sets: number
}

type SetVolume = {
  exercise_name?: string
  family: string
  movement_pattern: string | null
  body_area: string
  sets: number
}

type DailyVolume = {
  performed_at: string
  unit: Unit
  volume: number
}

type RecentSet = {
  performed_at: string
  exercise_name: string
  set_number: number
  reps: number
  weight: number
  unit: Unit
  rpe: number | null
}

type DashboardSummary = {
  sessions: number
  sets: number
  volume: VolumeByUnit
  exerciseVolume: ExerciseVolume[]
  familySetVolume: SetVolume[]
  exerciseSetVolume: SetVolume[]
  dailyVolume: DailyVolume[]
  recentSets: RecentSet[]
}

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; summary: DashboardSummary }
  | { status: 'error'; message: string }

function App() {
  const [state, setState] = useState<LoadState>({ status: 'loading' })

  useEffect(() => {
    let isActive = true

    async function loadSummary() {
      try {
        const response = await fetch('/api/summary')
        if (!response.ok) {
          throw new Error(`Dashboard API returned ${response.status}.`)
        }

        const summary = (await response.json()) as DashboardSummary
        if (isActive) setState({ status: 'ready', summary })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        if (isActive) setState({ status: 'error', message })
      }
    }

    void loadSummary()
    const intervalId = window.setInterval(loadSummary, 30_000)

    return () => {
      isActive = false
      window.clearInterval(intervalId)
    }
  }, [])

  if (state.status === 'loading') return <Shell>Loading workout data...</Shell>
  if (state.status === 'error') return <Shell>{state.message}</Shell>

  return <Dashboard summary={state.summary} />
}

function Dashboard({ summary }: { summary: DashboardSummary }) {
  const [displayUnit, setDisplayUnit] = useState<Unit>('lb')
  const exerciseVolume = useMemo(
    () => aggregateVolume(summary.exerciseVolume, 'exercise_name', displayUnit),
    [displayUnit, summary.exerciseVolume],
  )
  const dailyVolume = useMemo(
    () => aggregateVolume(summary.dailyVolume, 'performed_at', displayUnit),
    [displayUnit, summary.dailyVolume],
  )
  const maxExerciseVolume = useMemo(
    () => Math.max(1, ...exerciseVolume.map((row) => row.volume)),
    [exerciseVolume],
  )
  const maxDailyVolume = useMemo(
    () => Math.max(1, ...dailyVolume.map((row) => row.volume)),
    [dailyVolume],
  )
  const familySetVolume = useMemo(
    () => summary.familySetVolume.map((row) => ({ label: `${row.body_area} / ${row.family}`, sets: row.sets, detail: row.movement_pattern ?? 'movement family' })),
    [summary.familySetVolume],
  )
  const exerciseSetVolume = useMemo(
    () => summary.exerciseSetVolume.map((row) => ({ label: row.exercise_name ?? row.family, sets: row.sets, detail: row.family })),
    [summary.exerciseSetVolume],
  )
  const maxFamilySets = useMemo(() => Math.max(1, ...familySetVolume.map((row) => row.sets)), [familySetVolume])
  const maxExerciseSets = useMemo(() => Math.max(1, ...exerciseSetVolume.map((row) => row.sets)), [exerciseSetVolume])

  return (
    <Shell>
      <section className="metrics" aria-label="Workout metrics">
        <Metric label="Sessions" value={summary.sessions} />
        <Metric label="Hard Sets" value={summary.sets} />
        <Metric
          label={`Raw Load Volume ${displayUnit}`}
          value={formatNumber(summary.volume[displayUnit])}
        />
        <UnitSwitcher unit={displayUnit} onChange={setDisplayUnit} />
      </section>

      <section className="dashboard-grid">
        <Panel title="Hard Sets by Muscle / Family" note="Primary volume view. Variants combine here because sets near effort transfer better than fake work math.">
          {familySetVolume.length === 0 ? (
            <EmptyState />
          ) : (
            familySetVolume.map((row) => (
              <SetBarRow
                key={`${row.label}-${row.detail}`}
                label={row.label}
                detail={row.detail}
                sets={row.sets}
                maxSets={maxFamilySets}
              />
            ))
          )}
        </Panel>

        <Panel title="Hard Sets by Exact Exercise" note="Use this to see variant exposure without mixing strength progression.">
          {exerciseSetVolume.length === 0 ? (
            <EmptyState />
          ) : (
            exerciseSetVolume.map((row) => (
              <SetBarRow
                key={row.label}
                label={row.label}
                detail={row.detail}
                sets={row.sets}
                maxSets={maxExerciseSets}
                tone="warm"
              />
            ))
          )}
        </Panel>

        <Panel title="Raw Load Volume by Exact Exercise" note="Tonnage is exact-exercise only; do not compare across machines.">
          {exerciseVolume.length === 0 ? (
            <EmptyState />
          ) : (
            exerciseVolume.map((row) => (
              <BarRow
                key={row.label}
                label={row.label}
                value={row.volume}
                maxValue={maxExerciseVolume}
                unit={displayUnit}
              />
            ))
          )}
        </Panel>

        <Panel title="Daily Volume">
          {dailyVolume.length === 0 ? (
            <EmptyState />
          ) : (
            dailyVolume.map((row) => (
              <BarRow
                key={row.label}
                label={row.label}
                value={row.volume}
                maxValue={maxDailyVolume}
                tone="warm"
                unit={displayUnit}
              />
            ))
          )}
        </Panel>

        <Panel title="Recent Sets" wide>
          {summary.recentSets.length === 0 ? (
            <EmptyState />
          ) : (
            <RecentSets sets={summary.recentSets} />
          )}
        </Panel>
      </section>
    </Shell>
  )
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <main>
      <header className="app-header">
        <div>
          <h1>Workout</h1>
          <p>Local training log for Hermes-entered sessions.</p>
        </div>
        <span>{new Date().toLocaleDateString()}</span>
      </header>
      {children}
    </main>
  )
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <article className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  )
}

function UnitSwitcher({
  unit,
  onChange,
}: {
  unit: Unit
  onChange: (unit: Unit) => void
}) {
  return (
    <article className="metric unit-switcher" aria-label="Volume unit">
      <span>Display</span>
      <div className="unit-toggle" role="group" aria-label="Volume unit">
        {(['lb', 'kg'] as const).map((candidate) => (
          <button
            key={candidate}
            type="button"
            className={candidate === unit ? 'active' : ''}
            aria-pressed={candidate === unit}
            onClick={() => onChange(candidate)}
          >
            {candidate}
          </button>
        ))}
      </div>
    </article>
  )
}

function Panel({
  title,
  children,
  wide = false,
  note,
}: {
  title: string
  children: ReactNode
  wide?: boolean
  note?: string
}) {
  return (
    <section className={wide ? 'panel panel-wide' : 'panel'}>
      <h2>{title}</h2>
      {note ? <p className="panel-note">{note}</p> : null}
      {children}
    </section>
  )
}

function BarRow({
  label,
  value,
  maxValue,
  unit,
  tone = 'cool',
}: {
  label: string
  value: number
  maxValue: number
  unit: Unit
  tone?: 'cool' | 'warm'
}) {
  const width = Math.max(3, Math.round((value / maxValue) * 100))

  return (
    <div className="bar-row">
      <span>{label}</span>
      <div className="bar-track">
        <div
          className={tone === 'warm' ? 'bar bar-warm' : 'bar'}
          style={{ width: `${width}%` }}
        />
      </div>
      <strong>
        {formatNumber(value)} {unit}
      </strong>
    </div>
  )
}

function SetBarRow({
  label,
  detail,
  sets,
  maxSets,
  tone = 'cool',
}: {
  label: string
  detail: string
  sets: number
  maxSets: number
  tone?: 'cool' | 'warm'
}) {
  const width = Math.max(3, Math.round((sets / maxSets) * 100))

  return (
    <div className="bar-row">
      <span><strong>{label}</strong><small>{detail}</small></span>
      <div className="bar-track">
        <div
          className={tone === 'warm' ? 'bar bar-warm' : 'bar'}
          style={{ width: `${width}%` }}
        />
      </div>
      <strong>{sets} sets</strong>
    </div>
  )
}

function RecentSets({ sets }: { sets: RecentSet[] }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Exercise</th>
            <th>Set</th>
            <th>Work</th>
            <th>RPE</th>
          </tr>
        </thead>
        <tbody>
          {sets.map((set, index) => (
            <tr key={`${set.performed_at}-${set.exercise_name}-${index}`}>
              <td>{set.performed_at}</td>
              <td>{set.exercise_name}</td>
              <td>{set.set_number}</td>
              <td>
                {set.reps} x {formatNumber(set.weight)} {set.unit}
              </td>
              <td>{set.rpe ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function EmptyState() {
  return <p className="empty">No workout data logged yet.</p>
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 1,
  }).format(value)
}

function aggregateVolume<T extends 'exercise_name' | 'performed_at'>(
  rows: Array<Record<T, string> & { unit: Unit; volume: number }>,
  labelKey: T,
  displayUnit: Unit,
): Array<{ label: string; volume: number }> {
  const totals = new Map<string, number>()

  for (const row of rows) {
    const label = row[labelKey]
    totals.set(
      label,
      (totals.get(label) ?? 0) + convertVolume(row.volume, row.unit, displayUnit),
    )
  }

  return [...totals.entries()]
    .map(([label, volume]) => ({ label, volume }))
    .sort((a, b) => b.volume - a.volume)
}

function convertVolume(value: number, from: Unit, to: Unit): number {
  if (from === to) return value
  return from === 'lb' ? value * 0.45359237 : value / 0.45359237
}

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
