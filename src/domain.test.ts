import assert from "node:assert/strict";
import test from "node:test";

import {
  addSetToSession,
  calculateExerciseVolumeByUnit,
  calculateSessionVolumeByUnit,
  createWorkoutSession,
} from "./domain.js";
import { type ExerciseDefinition, type WorkoutSet } from "./types.js";

const benchPress: ExerciseDefinition = {
  id: "bench-press",
  name: "Bench Press",
  bodyAreas: ["chest", "shoulders", "arms"],
};

const squat: ExerciseDefinition = {
  id: "squat",
  name: "Squat",
  bodyAreas: ["legs", "core"],
};

const deadlift: ExerciseDefinition = {
  id: "deadlift",
  name: "Deadlift",
  bodyAreas: ["back", "legs", "core"],
};

const gobletSquat: ExerciseDefinition = {
  id: "goblet-squat",
  name: "Goblet Squat",
  bodyAreas: ["legs", "core"],
};

test("a workout session can contain multiple exercises with sets", () => {
  const session = createWorkoutSession({
    id: "session-1",
    performedAt: "2026-06-03",
  });

  const withBench = addSetToSession(session, benchPress, {
    setNumber: 1,
    reps: 8,
    weight: 135,
    unit: "lb",
  });

  const withSquat = addSetToSession(withBench, squat, {
    setNumber: 1,
    reps: 5,
    weight: 185,
    unit: "lb",
  });

  assert.equal(withSquat.exercises.length, 2);
  assert.equal(withSquat.exercises[0]?.name, "Bench Press");
  assert.deepEqual(withSquat.exercises[0]?.bodyAreas, [
    "chest",
    "shoulders",
    "arms",
  ]);
  assert.equal(withSquat.exercises[1]?.name, "Squat");
});

test("sets preserve reps, weight, unit, rpe, and notes", () => {
  const session = createWorkoutSession({
    id: "session-1",
    performedAt: "2026-06-03",
  });

  const loggedSet: WorkoutSet = {
    setNumber: 1,
    reps: 10,
    weight: 70,
    unit: "kg",
    rpe: 8,
    notes: "Felt strong.",
  };

  const updated = addSetToSession(session, deadlift, loggedSet);

  assert.deepEqual(updated.exercises[0]?.sets[0], loggedSet);
});

test("volume is calculated by unit instead of mixing lb and kg", () => {
  const session = createWorkoutSession({
    id: "session-1",
    performedAt: "2026-06-03",
  });

  const updated = [
    {
      exercise: benchPress,
      set: { setNumber: 1, reps: 8, weight: 135, unit: "lb" as const },
    },
    {
      exercise: benchPress,
      set: { setNumber: 2, reps: 8, weight: 135, unit: "lb" as const },
    },
    {
      exercise: gobletSquat,
      set: { setNumber: 1, reps: 10, weight: 24, unit: "kg" as const },
    },
  ].reduce(
    (currentSession, entry) =>
      addSetToSession(currentSession, entry.exercise, entry.set),
    session,
  );

  assert.deepEqual(calculateSessionVolumeByUnit(updated), {
    lb: 2160,
    kg: 240,
  });
});

test("exercise volume is calculated from reps times weight", () => {
  const session = createWorkoutSession({
    id: "session-1",
    performedAt: "2026-06-03",
  });

  const updated = addSetToSession(session, benchPress, {
    setNumber: 1,
    reps: 8,
    weight: 135,
    unit: "lb",
  });

  const sessionExercise = updated.exercises[0];

  assert.ok(sessionExercise);
  assert.deepEqual(calculateExerciseVolumeByUnit(sessionExercise), {
    lb: 1080,
    kg: 0,
  });
});

test("duplicate natural-language updates do not create duplicate sets", () => {
  const session = createWorkoutSession({
    id: "session-1",
    performedAt: "2026-06-03",
  });

  const firstUpdate = addSetToSession(session, benchPress, {
    setNumber: 1,
    reps: 8,
    weight: 135,
    unit: "lb",
    sourceEntryId: "chat-message-123",
  });

  const repeatedUpdate = addSetToSession(firstUpdate, benchPress, {
    setNumber: 1,
    reps: 8,
    weight: 135,
    unit: "lb",
    sourceEntryId: "chat-message-123",
  });

  assert.equal(repeatedUpdate.exercises.length, 1);
  assert.equal(repeatedUpdate.exercises[0]?.sets.length, 1);
});

test("same set details without a source id are also treated as duplicates", () => {
  const session = createWorkoutSession({
    id: "session-1",
    performedAt: "2026-06-03",
  });

  const firstUpdate = addSetToSession(session, benchPress, {
    setNumber: 1,
    reps: 8,
    weight: 135,
    unit: "lb",
  });

  const repeatedUpdate = addSetToSession(firstUpdate, benchPress, {
    setNumber: 1,
    reps: 8,
    weight: 135,
    unit: "lb",
  });

  assert.equal(repeatedUpdate.exercises[0]?.sets.length, 1);
});

test("invalid set input is rejected at the domain boundary", () => {
  const session = createWorkoutSession({
    id: "session-1",
    performedAt: "2026-06-03",
  });

  assert.throws(
    () =>
      addSetToSession(session, benchPress, {
        setNumber: 1,
        reps: 0,
        weight: 135,
        unit: "lb",
      }),
    /Reps must be a positive integer/,
  );
});
