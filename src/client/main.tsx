import { StrictMode, useEffect, useMemo, useState, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'

import './styles.css'

type Unit = 'lb' | 'kg'

type VolumeByUnit = Record<Unit, number>

type ExerciseVolume = {
  exercise_name: string
  unit: Unit
  volume: number
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
  const maxExerciseVolume = useMemo(
    () => Math.max(1, ...summary.exerciseVolume.map((row) => row.volume)),
    [summary.exerciseVolume],
  )
  const maxDailyVolume = useMemo(
    () => Math.max(1, ...summary.dailyVolume.map((row) => row.volume)),
    [summary.dailyVolume],
  )

  return (
    <Shell>
      <section className="metrics" aria-label="Workout metrics">
        <Metric label="Sessions" value={summary.sessions} />
        <Metric label="Sets" value={summary.sets} />
        <Metric label="Volume lb" value={formatNumber(summary.volume.lb)} />
        <Metric label="Volume kg" value={formatNumber(summary.volume.kg)} />
      </section>

      <section className="dashboard-grid">
        <Panel title="Volume by Exercise">
          {summary.exerciseVolume.length === 0 ? (
            <EmptyState />
          ) : (
            summary.exerciseVolume.map((row) => (
              <BarRow
                key={`${row.exercise_name}-${row.unit}`}
                label={`${row.exercise_name} (${row.unit})`}
                value={row.volume}
                maxValue={maxExerciseVolume}
              />
            ))
          )}
        </Panel>

        <Panel title="Daily Volume">
          {summary.dailyVolume.length === 0 ? (
            <EmptyState />
          ) : (
            summary.dailyVolume.map((row) => (
              <BarRow
                key={`${row.performed_at}-${row.unit}`}
                label={`${row.performed_at} (${row.unit})`}
                value={row.volume}
                maxValue={maxDailyVolume}
                tone="warm"
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

function Panel({
  title,
  children,
  wide = false,
}: {
  title: string
  children: ReactNode
  wide?: boolean
}) {
  return (
    <section className={wide ? 'panel panel-wide' : 'panel'}>
      <h2>{title}</h2>
      {children}
    </section>
  )
}

function BarRow({
  label,
  value,
  maxValue,
  tone = 'cool',
}: {
  label: string
  value: number
  maxValue: number
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
      <strong>{formatNumber(value)}</strong>
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

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
