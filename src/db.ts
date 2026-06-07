import { mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'

import { addSetToSession, createWorkoutSession } from './domain.js'
import {
  type BodyArea,
  type ExerciseDefinition,
  type Unit,
  type VolumeByUnit,
  type WorkoutSession,
  type WorkoutSet,
} from './types.js'

export const defaultDatabasePath = resolve(
  process.env.WORKOUT_DB ?? join(homedir(), '.workout', 'training-log.sqlite'),
)

type ExerciseRow = {
  id: string
  name: string
  body_areas: string
  family: string | null
  movement_pattern: string | null
}

type SessionRow = {
  id: string
  performed_at: string
  notes: string | null
}

type SetRow = {
  session_id: string
  performed_at: string
  exercise_id: string
  exercise_name: string
  body_areas: string
  family: string | null
  movement_pattern: string | null
  set_number: number
  reps: number
  weight: number
  unit: Unit
  rpe: number | null
  notes: string | null
  source_entry_id: string | null
}

type ExerciseVolumeRow = {
  exercise_name: string
  family: string
  movement_pattern: string | null
  unit: Unit
  volume: number
  sets: number
}

type SetVolumeRow = {
  exercise_name?: string
  family: string
  movement_pattern: string | null
  body_area: BodyArea
  sets: number
}

type DayVolumeRow = {
  performed_at: string
  unit: Unit
  volume: number
}

export type TrainingLogDatabase = DatabaseSync

export type DashboardSummary = {
  sessions: number
  sets: number
  volume: VolumeByUnit
  exerciseVolume: ExerciseVolumeRow[]
  familySetVolume: SetVolumeRow[]
  exerciseSetVolume: SetVolumeRow[]
  dailyVolume: DayVolumeRow[]
  recentSets: SetRow[]
}

export function openDatabase(path = defaultDatabasePath): TrainingLogDatabase {
  mkdirSync(dirname(path), { recursive: true })
  const db = new DatabaseSync(path)
  db.exec('PRAGMA foreign_keys = ON')
  return db
}

export function initializeDatabase(db: TrainingLogDatabase): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS exercise_definitions (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      normalized_name TEXT NOT NULL UNIQUE,
      body_areas TEXT NOT NULL,
      family TEXT,
      movement_pattern TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS workout_sessions (
      id TEXT PRIMARY KEY,
      performed_at TEXT NOT NULL,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS workout_sets (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES workout_sessions(id) ON DELETE CASCADE,
      exercise_id TEXT NOT NULL REFERENCES exercise_definitions(id),
      set_number INTEGER NOT NULL,
      reps INTEGER NOT NULL,
      weight REAL NOT NULL,
      unit TEXT NOT NULL CHECK (unit IN ('lb', 'kg')),
      rpe REAL,
      notes TEXT,
      source_entry_id TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_workout_sets_session
      ON workout_sets(session_id);

    CREATE INDEX IF NOT EXISTS idx_workout_sets_exercise
      ON workout_sets(exercise_id);

    CREATE UNIQUE INDEX IF NOT EXISTS idx_workout_sets_source_entry
      ON workout_sets(session_id, exercise_id, source_entry_id)
      WHERE source_entry_id IS NOT NULL;
  `)

  addColumnIfMissing(db, 'exercise_definitions', 'family', 'TEXT')
  addColumnIfMissing(db, 'exercise_definitions', 'movement_pattern', 'TEXT')
}

export function addExerciseDefinition(
  db: TrainingLogDatabase,
  input: { id?: string; name: string; bodyAreas: BodyArea[]; family?: string; movementPattern?: string },
): ExerciseDefinition {
  const name = input.name.trim()
  const movementPattern = normalizeOptionalLabel(input.movementPattern)
  const exercise: ExerciseDefinition = {
    id: input.id ?? makeId(input.name),
    name,
    bodyAreas: input.bodyAreas,
    family: normalizeOptionalLabel(input.family) ?? name,
    ...(movementPattern === undefined ? {} : { movementPattern }),
  }

  if (!exercise.name) {
    throw new Error('Exercise name is required.')
  }

  const normalizedName = normalizeName(exercise.name)
  db.prepare(`
    INSERT INTO exercise_definitions (id, name, normalized_name, body_areas, family, movement_pattern)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(normalized_name) DO UPDATE SET
      name = excluded.name,
      body_areas = excluded.body_areas,
      family = excluded.family,
      movement_pattern = excluded.movement_pattern
  `).run(
    exercise.id,
    exercise.name,
    normalizedName,
    JSON.stringify(exercise.bodyAreas),
    exercise.family ?? name,
    exercise.movementPattern ?? null,
  )

  return findExerciseByName(db, exercise.name) ?? exercise
}

export function startWorkoutSession(
  db: TrainingLogDatabase,
  input: { id?: string; performedAt?: string; notes?: string },
): WorkoutSession {
  const session = createWorkoutSession({
    id: input.id ?? randomUUID(),
    performedAt: input.performedAt ?? todayIsoDate(),
    ...(input.notes === undefined ? {} : { notes: input.notes }),
  })

  db.prepare(`
    INSERT INTO workout_sessions (id, performed_at, notes)
    VALUES (?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      performed_at = excluded.performed_at,
      notes = excluded.notes
  `).run(session.id, session.performedAt, session.notes ?? null)

  return session
}

export function findExerciseByName(
  db: TrainingLogDatabase,
  name: string,
): ExerciseDefinition | undefined {
  const row = db
    .prepare('SELECT id, name, body_areas, family, movement_pattern FROM exercise_definitions WHERE normalized_name = ?')
    .get(normalizeName(name)) as ExerciseRow | undefined

  if (!row) return undefined

  return exerciseFromRow(row)
}

export function listExercises(db: TrainingLogDatabase): ExerciseDefinition[] {
  const rows = db
    .prepare('SELECT id, name, body_areas, family, movement_pattern FROM exercise_definitions ORDER BY name')
    .all() as ExerciseRow[]

  return rows.map(exerciseFromRow)
}

export function addWorkoutSet(
  db: TrainingLogDatabase,
  input: {
    sessionId: string
    exerciseName: string
    workoutSet: WorkoutSet
  },
): { session: WorkoutSession; inserted: boolean } {
  const exercise = findExerciseByName(db, input.exerciseName)
  if (!exercise) {
    throw new Error(
      `Unknown exercise "${input.exerciseName}". Add it with add-exercise first.`,
    )
  }

  const session = loadWorkoutSession(db, input.sessionId)
  if (!session) {
    throw new Error(
      `Unknown session "${input.sessionId}". Create it with start-session first.`,
    )
  }

  const updatedSession = addSetToSession(session, exercise, input.workoutSet)
  if (updatedSession === session) {
    return { session, inserted: false }
  }

  db.prepare(`
    INSERT INTO workout_sets (
      id,
      session_id,
      exercise_id,
      set_number,
      reps,
      weight,
      unit,
      rpe,
      notes,
      source_entry_id
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    randomUUID(),
    input.sessionId,
    exercise.id,
    input.workoutSet.setNumber,
    input.workoutSet.reps,
    input.workoutSet.weight,
    input.workoutSet.unit,
    input.workoutSet.rpe ?? null,
    input.workoutSet.notes ?? null,
    input.workoutSet.sourceEntryId ?? null,
  )

  return { session: updatedSession, inserted: true }
}

export function loadWorkoutSession(
  db: TrainingLogDatabase,
  sessionId: string,
): WorkoutSession | undefined {
  const sessionRow = db
    .prepare('SELECT id, performed_at, notes FROM workout_sessions WHERE id = ?')
    .get(sessionId) as SessionRow | undefined

  if (!sessionRow) return undefined

  const session = createWorkoutSession({
    id: sessionRow.id,
    performedAt: sessionRow.performed_at,
    ...(sessionRow.notes === null ? {} : { notes: sessionRow.notes }),
  })

  const setRows = db
    .prepare(`
      SELECT
        ws.session_id,
        s.performed_at,
        e.id AS exercise_id,
        e.name AS exercise_name,
        e.body_areas,
        COALESCE(e.family, e.name) AS family,
        e.movement_pattern,
        ws.set_number,
        ws.reps,
        ws.weight,
        ws.unit,
        ws.rpe,
        ws.notes,
        ws.source_entry_id
      FROM workout_sets ws
      JOIN workout_sessions s ON s.id = ws.session_id
      JOIN exercise_definitions e ON e.id = ws.exercise_id
      WHERE ws.session_id = ?
      ORDER BY e.name, ws.set_number, ws.created_at
    `)
    .all(sessionId) as SetRow[]

  return setRows.reduce((currentSession, row) => {
    const exercise: ExerciseDefinition = {
      id: row.exercise_id,
      name: row.exercise_name,
      bodyAreas: parseBodyAreas(row.body_areas),
      family: row.family ?? row.exercise_name,
      ...(row.movement_pattern === null ? {} : { movementPattern: row.movement_pattern }),
    }

    return addSetToSession(currentSession, exercise, setFromRow(row))
  }, session)
}

export function getDashboardSummary(db: TrainingLogDatabase): DashboardSummary {
  const sessionCount = db
    .prepare('SELECT COUNT(*) AS count FROM workout_sessions')
    .get() as { count: number }

  const setCount = db
    .prepare('SELECT COUNT(*) AS count FROM workout_sets')
    .get() as { count: number }

  const exerciseVolume = db
    .prepare(`
      SELECT
        e.name AS exercise_name,
        COALESCE(e.family, e.name) AS family,
        e.movement_pattern,
        ws.unit,
        SUM(ws.reps * ws.weight) AS volume,
        COUNT(*) AS sets
      FROM workout_sets ws
      JOIN exercise_definitions e ON e.id = ws.exercise_id
      GROUP BY e.name, COALESCE(e.family, e.name), e.movement_pattern, ws.unit
      ORDER BY volume DESC
    `)
    .all() as ExerciseVolumeRow[]



  const familySetVolume = db
    .prepare(`
      SELECT
        COALESCE(e.family, e.name) AS family,
        e.movement_pattern,
        json_each.value AS body_area,
        COUNT(*) AS sets
      FROM workout_sets ws
      JOIN exercise_definitions e ON e.id = ws.exercise_id
      JOIN json_each(e.body_areas)
      GROUP BY COALESCE(e.family, e.name), e.movement_pattern, json_each.value
      ORDER BY sets DESC, family
    `)
    .all()
    .map(setVolumeFromRow)

  const exerciseSetVolume = db
    .prepare(`
      SELECT
        e.name AS exercise_name,
        COALESCE(e.family, e.name) AS family,
        e.movement_pattern,
        json_each.value AS body_area,
        COUNT(*) AS sets
      FROM workout_sets ws
      JOIN exercise_definitions e ON e.id = ws.exercise_id
      JOIN json_each(e.body_areas)
      GROUP BY e.name, COALESCE(e.family, e.name), e.movement_pattern, json_each.value
      ORDER BY e.name
    `)
    .all()
    .map(setVolumeFromRow)

  const dailyVolume = db
    .prepare(`
      SELECT
        s.performed_at,
        ws.unit,
        SUM(ws.reps * ws.weight) AS volume
      FROM workout_sets ws
      JOIN workout_sessions s ON s.id = ws.session_id
      GROUP BY s.performed_at, ws.unit
      ORDER BY s.performed_at
    `)
    .all() as DayVolumeRow[]

  const recentSets = db
    .prepare(`
      SELECT
        ws.session_id,
        s.performed_at,
        e.id AS exercise_id,
        e.name AS exercise_name,
        e.body_areas,
        COALESCE(e.family, e.name) AS family,
        e.movement_pattern,
        ws.set_number,
        ws.reps,
        ws.weight,
        ws.unit,
        ws.rpe,
        ws.notes,
        ws.source_entry_id
      FROM workout_sets ws
      JOIN workout_sessions s ON s.id = ws.session_id
      JOIN exercise_definitions e ON e.id = ws.exercise_id
      ORDER BY s.performed_at DESC, ws.created_at DESC
      LIMIT 200
    `)
    .all() as SetRow[]

  return {
    sessions: sessionCount.count,
    sets: setCount.count,
    volume: summarizeVolume(exerciseVolume),
    exerciseVolume,
    familySetVolume,
    exerciseSetVolume,
    dailyVolume,
    recentSets,
  }
}

function exerciseFromRow(row: ExerciseRow): ExerciseDefinition {
  return {
    id: row.id,
    name: row.name,
    bodyAreas: parseBodyAreas(row.body_areas),
    family: row.family ?? row.name,
    ...(row.movement_pattern === null ? {} : { movementPattern: row.movement_pattern }),
  }
}

function setVolumeFromRow(row: unknown): SetVolumeRow {
  const value = row as SetVolumeRow
  return {
    ...(value.exercise_name === undefined ? {} : { exercise_name: value.exercise_name }),
    family: value.family,
    movement_pattern: value.movement_pattern,
    body_area: value.body_area,
    sets: value.sets,
  }
}

function setFromRow(row: SetRow): WorkoutSet {
  return {
    setNumber: row.set_number,
    reps: row.reps,
    weight: row.weight,
    unit: row.unit,
    ...(row.rpe === null ? {} : { rpe: row.rpe }),
    ...(row.notes === null ? {} : { notes: row.notes }),
    ...(row.source_entry_id === null
      ? {}
      : { sourceEntryId: row.source_entry_id }),
  }
}

function addColumnIfMissing(
  db: TrainingLogDatabase,
  table: string,
  column: string,
  definition: string,
): void {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>
  if (!columns.some((row) => row.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
  }
}

function normalizeOptionalLabel(value: string | undefined): string | undefined {
  const normalized = value?.trim()
  return normalized ? normalized : undefined
}

function summarizeVolume(rows: ExerciseVolumeRow[]): VolumeByUnit {
  return rows.reduce(
    (volume, row) => {
      volume.lb += convertVolume(row.volume, row.unit, 'lb')
      volume.kg += convertVolume(row.volume, row.unit, 'kg')
      return volume
    },
    { lb: 0, kg: 0 },
  )
}

function convertVolume(value: number, from: Unit, to: Unit): number {
  if (from === to) return value
  return from === 'lb' ? value * 0.45359237 : value / 0.45359237
}

function parseBodyAreas(value: string): BodyArea[] {
  return JSON.parse(value) as BodyArea[]
}

export function parseBodyAreaList(value: string): BodyArea[] {
  const areas: BodyArea[] = []

  for (const rawArea of value.split(',')) {
    const area = rawArea.trim()
    if (!area) continue

    if (!isBodyArea(area)) {
      throw new Error(`Invalid body area "${area}".`)
    }

    areas.push(area)
  }

  return areas
}

export function normalizeName(name: string): string {
  return name.trim().toLowerCase()
}

function makeId(name: string): string {
  return normalizeName(name).replaceAll(/[^a-z0-9]+/g, '-').replaceAll(/^-|-$/g, '')
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10)
}

function isBodyArea(value: string): value is BodyArea {
  return ['chest', 'back', 'legs', 'shoulders', 'arms', 'core'].includes(value)
}
