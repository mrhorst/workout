#!/usr/bin/env node

import {
  addExerciseDefinition,
  addWorkoutSet,
  defaultDatabasePath,
  getDashboardSummary,
  initializeDatabase,
  listExercises,
  openDatabase,
  parseBodyAreaList,
  startWorkoutSession,
} from './db.js'
import { startServer } from './server.js'
import { type Unit, type WorkoutSet } from './types.js'

type CommandResult = Record<string, unknown>

const [command = 'help', ...rawArgs] = process.argv.slice(2)

try {
  const result = runCommand(command, parseFlags(rawArgs))
  if (result) {
    console.log(JSON.stringify(result, null, 2))
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  console.error(message)
  process.exitCode = 1
}

function runCommand(
  commandName: string,
  flags: Map<string, string | boolean>,
): CommandResult | undefined {
  if (commandName === 'help') {
    console.log(helpText())
    return undefined
  }

  const dbPath = optionalString(flags, 'db') ?? defaultDatabasePath
  const db = openDatabase(dbPath)
  initializeDatabase(db)

  try {
    if (commandName === 'init') {
      return { ok: true, dbPath }
    }

    if (commandName === 'add-exercise') {
      const optionalId = optionalString(flags, 'id')
      const exercise = addExerciseDefinition(db, {
        ...(optionalId === undefined ? {} : { id: optionalId }),
        name: requiredString(flags, 'name'),
        bodyAreas: parseBodyAreaList(requiredString(flags, 'areas')),
      })

      return { ok: true, exercise }
    }

    if (commandName === 'list-exercises') {
      return { exercises: listExercises(db) }
    }

    if (commandName === 'start-session') {
      const optionalId = optionalString(flags, 'id')
      const optionalDate = optionalString(flags, 'date')
      const optionalNotes = optionalString(flags, 'notes')
      const session = startWorkoutSession(db, {
        ...(optionalId === undefined ? {} : { id: optionalId }),
        ...(optionalDate === undefined ? {} : { performedAt: optionalDate }),
        ...(optionalNotes === undefined ? {} : { notes: optionalNotes }),
      })

      return { ok: true, session }
    }

    if (commandName === 'add-set') {
      const optionalRpe = optionalNumber(flags, 'rpe')
      const optionalNotes = optionalString(flags, 'notes')
      const optionalSourceEntryId = optionalString(flags, 'source-entry-id')
      const workoutSet = compactWorkoutSet({
        setNumber: requiredInteger(flags, 'set'),
        reps: requiredInteger(flags, 'reps'),
        weight: requiredNumber(flags, 'weight'),
        unit: requiredUnit(flags, 'unit'),
        ...(optionalRpe === undefined ? {} : { rpe: optionalRpe }),
        ...(optionalNotes === undefined ? {} : { notes: optionalNotes }),
        ...(optionalSourceEntryId === undefined
          ? {}
          : { sourceEntryId: optionalSourceEntryId }),
      })

      const result = addWorkoutSet(db, {
        sessionId: requiredString(flags, 'session'),
        exerciseName: requiredString(flags, 'exercise'),
        workoutSet,
      })

      return {
        ok: true,
        inserted: result.inserted,
        session: result.session,
      }
    }

    if (commandName === 'summary') {
      return getDashboardSummary(db)
    }

    if (commandName === 'serve') {
      const port = optionalNumber(flags, 'port') ?? Number(process.env.PORT ?? 4321)
      const host = optionalString(flags, 'host') ?? process.env.HOST ?? '0.0.0.0'
      startServer({ dbPath, host, port })
      return undefined
    }
  } finally {
    if (commandName !== 'serve') db.close()
  }

  throw new Error(`Unknown command "${commandName}". Run: npm run cli -- help`)
}

function parseFlags(args: string[]): Map<string, string | boolean> {
  const flags = new Map<string, string | boolean>()

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (!arg?.startsWith('--')) {
      throw new Error(`Unexpected argument "${arg}". Use --key value flags.`)
    }

    const key = arg.slice(2)
    const next = args[index + 1]
    if (!next || next.startsWith('--')) {
      flags.set(key, true)
      continue
    }

    flags.set(key, next)
    index += 1
  }

  return flags
}

function compactWorkoutSet(input: {
  setNumber: number
  reps: number
  weight: number
  unit: Unit
  rpe?: number
  notes?: string
  sourceEntryId?: string
}): WorkoutSet {
  return {
    setNumber: input.setNumber,
    reps: input.reps,
    weight: input.weight,
    unit: input.unit,
    ...(input.rpe === undefined ? {} : { rpe: input.rpe }),
    ...(input.notes === undefined ? {} : { notes: input.notes }),
    ...(input.sourceEntryId === undefined
      ? {}
      : { sourceEntryId: input.sourceEntryId }),
  }
}

function requiredString(
  flags: Map<string, string | boolean>,
  key: string,
): string {
  const value = optionalString(flags, key)
  if (value === undefined || value.trim() === '') {
    throw new Error(`Missing required flag --${key}.`)
  }

  return value
}

function optionalString(
  flags: Map<string, string | boolean>,
  key: string,
): string | undefined {
  const value = flags.get(key)
  if (typeof value !== 'string') return undefined
  return value
}

function requiredInteger(
  flags: Map<string, string | boolean>,
  key: string,
): number {
  const value = requiredNumber(flags, key)
  if (!Number.isInteger(value)) {
    throw new Error(`--${key} must be an integer.`)
  }

  return value
}

function requiredNumber(
  flags: Map<string, string | boolean>,
  key: string,
): number {
  const rawValue = requiredString(flags, key)
  const value = Number(rawValue)
  if (!Number.isFinite(value)) {
    throw new Error(`--${key} must be a number.`)
  }

  return value
}

function optionalNumber(
  flags: Map<string, string | boolean>,
  key: string,
): number | undefined {
  const rawValue = optionalString(flags, key)
  if (rawValue === undefined) return undefined

  const value = Number(rawValue)
  if (!Number.isFinite(value)) {
    throw new Error(`--${key} must be a number.`)
  }

  return value
}

function requiredUnit(flags: Map<string, string | boolean>, key: string): Unit {
  const value = requiredString(flags, key)
  if (value !== 'lb' && value !== 'kg') {
    throw new Error(`--${key} must be "lb" or "kg".`)
  }

  return value
}

function helpText(): string {
  return `
Workout CLI

Commands:
  init
  add-exercise --name "Bench Press" --areas chest,shoulders,arms
  list-exercises
  start-session --id today --date 2026-06-05
  add-set --session today --exercise "Bench Press" --set 1 --reps 8 --weight 135 --unit lb
  summary
  serve --host 0.0.0.0 --port 4321

Shared flag:
  --db path/to/training-log.sqlite
`.trim()
}
