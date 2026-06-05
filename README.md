# Workout

Local-first workout logging for Hermes-entered training sessions.

## Current Slice

The app is local-first:

- Hermes or a human can write training data through the `workout` CLI
- a local SQLite database stores sessions, exercise definitions, and sets
- an Express server serves a React dashboard from that database
- the server binds to `0.0.0.0` for Tailscale or Docker port access
- the dashboard is responsive for iPhone and desktop

The domain model still owns the workout rules:

- workout sessions
- exercise definitions
- sets
- units
- volume calculation
- duplicate-set protection

## Concepts

### Domain Model

The domain model is the part of the app that represents the real-world rules. For this app, that means things like:

- a workout session has exercises
- an exercise has sets
- a set has reps, weight, and unit
- volume is `reps * weight`
- `lb` and `kg` should not be mixed into one fake total
- repeated chat/tool calls should not silently duplicate the same set

### Framework Layer

A framework layer is the delivery mechanism around the domain:

- CLI command
- API route
- React/Next.js screen
- Rails controller
- Hermes/MCP tool

Those layers should call the domain model. They should not be where the core workout math and duplicate rules live.

## Install

```bash
npm install
npm run build
npm install -g .
workout help
```

## Developer Commands

```bash
npm test
npm run typecheck
npm run build
npm run cli -- help
```

## Local Workflow

Initialize the local database:

```bash
workout init
```

Add exercise definitions once. Body areas belong to the exercise definition,
not to each set that gets logged.

```bash
workout add-exercise --name "Bench Press" --areas chest,shoulders,arms
workout add-exercise --name "Squat" --areas legs,core
```

Start a workout session:

```bash
workout start-session --id today --date 2026-06-05
```

Add sets. This is the command shape Hermes should call while you are working
out:

```bash
workout add-set --session today --exercise "Bench Press" --set 1 --reps 8 --weight 135 --unit lb --source-entry-id hermes-message-001
```

Read a JSON summary:

```bash
workout summary
```

Serve the dashboard:

```bash
workout serve --host 0.0.0.0 --port 4321
```

By default, the dashboard listens on `0.0.0.0:4321`, which makes it reachable
from an iPhone over Tailscale if the Mac or container network allows that port.

By default, the database is stored at:

```text
~/.workout/training-log.sqlite
```

You can override the port, host, or database path:

```bash
WORKOUT_DB=/data/workout.sqlite workout serve --host 0.0.0.0 --port 4321
workout summary --db /data/workout.sqlite
```

For Docker, publish the port and mount a persistent database directory, then set
`WORKOUT_DB` to the mounted SQLite file path.
