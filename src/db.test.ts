import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import {
  addExerciseDefinition,
  addWorkoutSet,
  getDashboardSummary,
  initializeDatabase,
  loadWorkoutSession,
  openDatabase,
  startWorkoutSession,
} from "./db.js";

test("workout data can be stored in sqlite and read back for the dashboard", () => {
  const dbPath = join(mkdtempSync(join(tmpdir(), "training-log-")), "test.sqlite");
  const db = openDatabase(dbPath);
  initializeDatabase(db);

  addExerciseDefinition(db, {
    name: "Bench Press",
    bodyAreas: ["chest", "shoulders", "arms"],
  });

  startWorkoutSession(db, {
    id: "session-1",
    performedAt: "2026-06-05",
  });

  const firstWrite = addWorkoutSet(db, {
    sessionId: "session-1",
    exerciseName: "bench press",
    workoutSet: {
      setNumber: 1,
      reps: 8,
      weight: 135,
      unit: "lb",
      sourceEntryId: "hermes-entry-1",
    },
  });

  const duplicateWrite = addWorkoutSet(db, {
    sessionId: "session-1",
    exerciseName: "Bench Press",
    workoutSet: {
      setNumber: 1,
      reps: 8,
      weight: 135,
      unit: "lb",
      sourceEntryId: "hermes-entry-1",
    },
  });

  const session = loadWorkoutSession(db, "session-1");
  const summary = getDashboardSummary(db);

  assert.equal(firstWrite.inserted, true);
  assert.equal(duplicateWrite.inserted, false);
  assert.equal(session?.exercises[0]?.sets.length, 1);
  assert.equal(summary.volume.lb, 1080);
  assert.equal(Number(summary.volume.kg.toFixed(1)), 489.9);
  assert.equal(summary.sessions, 1);
  assert.equal(summary.sets, 1);
});

test("dashboard volume totals convert between lb and kg", () => {
  const dbPath = join(mkdtempSync(join(tmpdir(), "training-log-")), "test.sqlite");
  const db = openDatabase(dbPath);
  initializeDatabase(db);

  addExerciseDefinition(db, {
    name: "Deadlift",
    bodyAreas: ["back", "legs"],
  });

  startWorkoutSession(db, {
    id: "session-kg",
    performedAt: "2026-06-06",
  });

  addWorkoutSet(db, {
    sessionId: "session-kg",
    exerciseName: "Deadlift",
    workoutSet: {
      setNumber: 1,
      reps: 10,
      weight: 100,
      unit: "kg",
      sourceEntryId: "hermes-entry-kg",
    },
  });

  const summary = getDashboardSummary(db);

  assert.equal(summary.volume.kg, 1000);
  assert.equal(Number(summary.volume.lb.toFixed(1)), 2204.6);
});
