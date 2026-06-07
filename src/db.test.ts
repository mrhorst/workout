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

test("dashboard groups variants by family for hard-set volume while keeping exact load volume separate", () => {
  const dbPath = join(mkdtempSync(join(tmpdir(), "training-log-")), "test.sqlite");
  const db = openDatabase(dbPath);
  initializeDatabase(db);

  addExerciseDefinition(db, {
    name: "Seated Leg Curl",
    bodyAreas: ["legs"],
    family: "Leg Curl",
    movementPattern: "Knee Flexion",
  });
  addExerciseDefinition(db, {
    name: "Seated Leg Curl - ROC-IT",
    bodyAreas: ["legs"],
    family: "Leg Curl",
    movementPattern: "Knee Flexion",
  });

  startWorkoutSession(db, {
    id: "session-leg-curl",
    performedAt: "2026-06-07",
  });

  for (const [exerciseName, weight] of [["Seated Leg Curl", 140], ["Seated Leg Curl - ROC-IT", 160]] as const) {
    for (const setNumber of [1, 2, 3]) {
      addWorkoutSet(db, {
        sessionId: "session-leg-curl",
        exerciseName,
        workoutSet: {
          setNumber,
          reps: 10,
          weight,
          unit: "lb",
          sourceEntryId: `${exerciseName}-${setNumber}`,
        },
      });
    }
  }

  const summary = getDashboardSummary(db);

  assert.deepEqual(summary.familySetVolume, [
    { family: "Leg Curl", movement_pattern: "Knee Flexion", body_area: "legs", sets: 6 },
  ]);
  assert.deepEqual(summary.exerciseSetVolume, [
    { exercise_name: "Seated Leg Curl", family: "Leg Curl", movement_pattern: "Knee Flexion", body_area: "legs", sets: 3 },
    { exercise_name: "Seated Leg Curl - ROC-IT", family: "Leg Curl", movement_pattern: "Knee Flexion", body_area: "legs", sets: 3 },
  ]);
  assert.equal(summary.exerciseVolume.length, 2);
  assert.equal(summary.exerciseVolume[0]?.exercise_name, "Seated Leg Curl - ROC-IT");
  assert.equal(summary.exerciseVolume[0]?.volume, 4800);
  assert.equal(summary.exerciseVolume[1]?.exercise_name, "Seated Leg Curl");
  assert.equal(summary.exerciseVolume[1]?.volume, 4200);
});
