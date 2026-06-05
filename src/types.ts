export type Unit = 'lb' | 'kg'

export type BodyArea = 'chest' | 'back' | 'legs' | 'shoulders' | 'arms' | 'core'

export type ExerciseDefinition = {
  id: string
  name: string
  bodyAreas: BodyArea[]
}

export type WorkoutSet = {
  setNumber: number
  reps: number
  weight: number
  unit: Unit
  rpe?: number
  notes?: string
  sourceEntryId?: string
}

export type WorkoutExercise = {
  exerciseId: string
  name: string
  bodyAreas: BodyArea[]
  sets: WorkoutSet[]
}

export type WorkoutSession = {
  id: string
  performedAt: string
  notes?: string
  exercises: WorkoutExercise[]
}

export type VolumeByUnit = Record<Unit, number>
