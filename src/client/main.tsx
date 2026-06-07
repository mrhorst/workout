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
        const response = await fetch(`/api/summary?ts=${Date.now()}`, {
          cache: 'no-store',
        })
        if (!response.ok) {
          throw new Error(`Dashboard API returned ${response.status}.`)
        }

        const summary = normalizeDashboardSummary(await response.json())
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

type DashboardSection = 'family' | 'exercises' | 'tonnage' | 'daily' | 'recent'
type SortOrder = 'highest' | 'lowest'

const dashboardSections: Array<{ id: DashboardSection; label: string }> = [
  { id: 'family', label: 'Muscles' },
  { id: 'exercises', label: 'Exercises' },
  { id: 'tonnage', label: 'Tonnage' },
  { id: 'daily', label: 'Daily' },
  { id: 'recent', label: 'Recent' },
]

function Dashboard({ summary }: { summary: DashboardSummary }) {
  const [displayUnit, setDisplayUnit] = useState<Unit>('lb')
  const [activeSection, setActiveSection] = useState<DashboardSection>('family')
  const [sortOrder, setSortOrder] = useState<SortOrder>('highest')
  const exerciseVolume = useMemo(
    () => sortByValue(aggregateVolume(summary.exerciseVolume, 'exercise_name', displayUnit), 'volume', sortOrder),
    [displayUnit, sortOrder, summary.exerciseVolume],
  )
  const dailyVolume = useMemo(
    () => sortByValue(aggregateVolume(summary.dailyVolume, 'performed_at', displayUnit), 'volume', sortOrder),
    [displayUnit, sortOrder, summary.dailyVolume],
  )
  const maxExerciseVolume = useMemo(
    () => Math.max(1, ...exerciseVolume.map((row) => row.volume)),
    [exerciseVolume],
  )
  const maxDailyVolume = useMemo(
    () => Math.max(1, ...dailyVolume.map((row) => row.volume)),
    [dailyVolume],
  )
  const muscleSetVolume = useMemo(
    () => sortByValue(aggregateSets(summary.familySetVolume, 'body_area'), 'sets', sortOrder),
    [sortOrder, summary.familySetVolume],
  )
  const exerciseSetVolume = useMemo(
    () => sortByValue(
      summary.exerciseSetVolume.map((row) => ({ label: row.exercise_name ?? row.family, sets: row.sets, detail: row.family })),
      'sets',
      sortOrder,
    ),
    [sortOrder, summary.exerciseSetVolume],
  )
  const maxMuscleSets = useMemo(() => Math.max(1, ...muscleSetVolume.map((row) => row.sets)), [muscleSetVolume])
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

      <nav className="section-tabs" aria-label="Dashboard charts">
        {dashboardSections.map((section) => (
          <button
            key={section.id}
            type="button"
            className={activeSection === section.id ? 'active' : ''}
            aria-current={activeSection === section.id ? 'page' : undefined}
            onClick={() => setActiveSection(section.id)}
          >
            {section.label}
          </button>
        ))}
      </nav>

      <SortToolbar sortOrder={sortOrder} onChange={setSortOrder} />

      <section className="dashboard-grid">
        {activeSection === 'family' ? (
          <Panel title="Hard Sets by Muscle" note="Primary volume view. Exercises and variants roll up into the muscles they trained.">
            {muscleSetVolume.length === 0 ? (
              <EmptyState />
            ) : (
              muscleSetVolume.map((row) => (
                <SetBarRow
                  key={row.label}
                  label={row.label}
                  sets={row.sets}
                  maxSets={maxMuscleSets}
                />
              ))
            )}
          </Panel>
        ) : null}

        {activeSection === 'exercises' ? (
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
        ) : null}

        {activeSection === 'tonnage' ? (
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
        ) : null}

        {activeSection === 'daily' ? (
          <Panel title="Daily Volume">
            {dailyVolume.length === 0 ? (
              <EmptyState />
            ) : (
              dailyVolume.map((row) => (
                <DailyVolumeRow
                  key={row.label}
                  date={row.label}
                  value={row.volume}
                  maxValue={maxDailyVolume}
                  unit={displayUnit}
                />
              ))
            )}
          </Panel>
        ) : null}

        {activeSection === 'recent' ? (
          <Panel title="Recent Sets" wide>
            {summary.recentSets.length === 0 ? (
              <EmptyState />
            ) : (
              <RecentSets sets={summary.recentSets} />
            )}
          </Panel>
        ) : null}
      </section>
    </Shell>
  )
}

function normalizeDashboardSummary(value: unknown): DashboardSummary {
  const input = value as Partial<DashboardSummary>
  return {
    sessions: Number(input.sessions ?? 0),
    sets: Number(input.sets ?? 0),
    volume: input.volume ?? { lb: 0, kg: 0 },
    exerciseVolume: Array.isArray(input.exerciseVolume) ? input.exerciseVolume : [],
    familySetVolume: Array.isArray(input.familySetVolume) ? input.familySetVolume : [],
    exerciseSetVolume: Array.isArray(input.exerciseSetVolume) ? input.exerciseSetVolume : [],
    dailyVolume: Array.isArray(input.dailyVolume) ? input.dailyVolume : [],
    recentSets: Array.isArray(input.recentSets) ? input.recentSets : [],
  }
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
  detail?: string
  sets: number
  maxSets: number
  tone?: 'cool' | 'warm'
}) {
  const width = Math.max(3, Math.round((sets / maxSets) * 100))

  return (
    <div className="bar-row">
      <span><strong>{label}</strong>{detail ? <small>{detail}</small> : null}</span>
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

function DailyVolumeRow({
  date,
  value,
  maxValue,
  unit,
}: {
  date: string
  value: number
  maxValue: number
  unit: Unit
}) {
  const width = Math.max(3, Math.round((value / maxValue) * 100))

  return (
    <div className="daily-volume-row">
      <span title={date}>{formatShortDate(date)}</span>
      <div className="bar-track">
        <div className="bar bar-warm" style={{ width: `${width}%` }} />
      </div>
      <strong>
        {formatNumber(value)} {unit}
      </strong>
    </div>
  )
}

function SortToolbar({
  sortOrder,
  onChange,
}: {
  sortOrder: SortOrder
  onChange: (sortOrder: SortOrder) => void
}) {
  return (
    <div className="sort-toolbar" aria-label="Sort chart data">
      <span>Sort</span>
      <div role="group" aria-label="Sort order">
        <button
          type="button"
          className={sortOrder === 'highest' ? 'active' : ''}
          aria-pressed={sortOrder === 'highest'}
          onClick={() => onChange('highest')}
        >
          Highest
        </button>
        <button
          type="button"
          className={sortOrder === 'lowest' ? 'active' : ''}
          aria-pressed={sortOrder === 'lowest'}
          onClick={() => onChange('lowest')}
        >
          Lowest
        </button>
      </div>
    </div>
  )
}

function RecentSets({ sets }: { sets: RecentSet[] }) {
  const setsByDay = useMemo(() => groupRecentSetsByDay(sets), [sets])
  const [selectedDay, setSelectedDay] = useState(() => setsByDay[0]?.day ?? '')
  const activeDay = setsByDay.some((group) => group.day === selectedDay)
    ? selectedDay
    : setsByDay[0]?.day ?? ''
  const activeSets = setsByDay.find((group) => group.day === activeDay)?.sets ?? []

  return (
    <div className="recent-section">
      <div className="day-tabs" aria-label="Recent workout days">
        {setsByDay.map((group) => (
          <button
            key={group.day}
            type="button"
            className={group.day === activeDay ? 'active' : ''}
            aria-pressed={group.day === activeDay}
            onClick={() => setSelectedDay(group.day)}
          >
            <strong>{formatShortDate(group.day)}</strong>
            <span>{group.sets.length} sets</span>
          </button>
        ))}
      </div>

      <div className="recent-card-list">
        {activeSets.map((set, index) => (
          <article className="recent-card" key={`${set.performed_at}-${set.exercise_name}-${index}`}>
            <div>
              <strong>{set.exercise_name}</strong>
              <span>Set {set.set_number}</span>
            </div>
            <div className="recent-work">
              <strong>{set.reps} × {formatNumber(set.weight)} {set.unit}</strong>
              {set.rpe === null ? null : <span>RPE {set.rpe}</span>}
            </div>
          </article>
        ))}
      </div>
    </div>
  )
}

function EmptyState() {
  return <p className="empty">No workout data logged yet.</p>
}

function groupRecentSetsByDay(sets: RecentSet[]): Array<{ day: string; sets: RecentSet[] }> {
  const groups = new Map<string, RecentSet[]>()

  for (const set of sets) {
    const daySets = groups.get(set.performed_at) ?? []
    daySets.push(set)
    groups.set(set.performed_at, daySets)
  }

  return [...groups.entries()].map(([day, daySets]) => ({ day, sets: daySets }))
}

function formatShortDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  return match ? `${Number(match[2])}/${Number(match[3])}` : value
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
}

function aggregateSets<T extends 'body_area'>(
  rows: Array<Record<T, string> & { sets: number }>,
  labelKey: T,
): Array<{ label: string; sets: number }> {
  const totals = new Map<string, number>()

  for (const row of rows) {
    const label = row[labelKey]
    totals.set(label, (totals.get(label) ?? 0) + row.sets)
  }

  return [...totals.entries()].map(([label, sets]) => ({ label, sets }))
}

function sortByValue<T, K extends keyof T>(rows: T[], key: K, order: SortOrder): T[] {
  return [...rows].sort((a, b) => {
    const left = Number(a[key])
    const right = Number(b[key])
    return order === 'highest' ? right - left : left - right
  })
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
