import {
  type ExerciseDefinition,
  type WorkoutSession,
  type WorkoutSet,
  type WorkoutExercise,
  type VolumeByUnit,
} from './types.js'

export function createWorkoutSession(input: {
  id: string
  performedAt: string
  notes?: string
}): WorkoutSession {
  return {
    ...input,
    exercises: [],
  }
}

export function addSetToSession(
  session: WorkoutSession,
  exercise: ExerciseDefinition,
  workoutSet: WorkoutSet,
): WorkoutSession {
  assertValidSet(workoutSet)

  const existingExercise = session.exercises.find(
    (sessionExercise) => sessionExercise.exerciseId === exercise.id,
  )

  if (existingExercise && hasDuplicateSet(existingExercise, workoutSet)) {
    return session
  }

  if (!existingExercise) {
    return {
      ...session,
      exercises: [
        ...session.exercises,
        {
          exerciseId: exercise.id,
          name: exercise.name,
          bodyAreas: exercise.bodyAreas,
          sets: [workoutSet],
        },
      ],
    }
  }

  return {
    ...session,
    exercises: session.exercises.map((sessionExercise) => {
      if (sessionExercise.exerciseId !== exercise.id) return sessionExercise

      return {
        ...sessionExercise,
        sets: [...sessionExercise.sets, workoutSet],
      }
    }),
  }
}

export function calculateSetVolume(workoutSet: WorkoutSet): number {
  return workoutSet.reps * workoutSet.weight
}

export function calculateExerciseVolumeByUnit(
  exercise: WorkoutExercise,
): VolumeByUnit {
  return exercise.sets.reduce(
    (volume, workoutSet) => {
      volume[workoutSet.unit] += calculateSetVolume(workoutSet)
      return volume
    },
    { lb: 0, kg: 0 },
  )
}

export function calculateSessionVolumeByUnit(
  session: WorkoutSession,
): VolumeByUnit {
  return session.exercises.reduce(
    (volume, exercise) => {
      const exerciseVolume = calculateExerciseVolumeByUnit(exercise)
      volume.lb += exerciseVolume.lb
      volume.kg += exerciseVolume.kg
      return volume
    },
    { lb: 0, kg: 0 },
  )
}

function hasDuplicateSet(
  exercise: WorkoutExercise,
  candidate: WorkoutSet,
): boolean {
  return exercise.sets.some((existingSet) => {
    if (existingSet.sourceEntryId && candidate.sourceEntryId) {
      return existingSet.sourceEntryId === candidate.sourceEntryId
    }

    return (
      existingSet.setNumber === candidate.setNumber &&
      existingSet.reps === candidate.reps &&
      existingSet.weight === candidate.weight &&
      existingSet.unit === candidate.unit
    )
  })
}

function assertValidSet(workoutSet: WorkoutSet): void {
  if (!Number.isInteger(workoutSet.setNumber) || workoutSet.setNumber < 1) {
    throw new Error('Set number must be a positive integer.')
  }

  if (!Number.isInteger(workoutSet.reps) || workoutSet.reps < 1) {
    throw new Error('Reps must be a positive integer.')
  }

  if (workoutSet.weight < 0) {
    throw new Error('Weight cannot be negative.')
  }

  if (
    workoutSet.rpe !== undefined &&
    (workoutSet.rpe < 1 || workoutSet.rpe > 10)
  ) {
    throw new Error('RPE must be between 1 and 10.')
  }
}
