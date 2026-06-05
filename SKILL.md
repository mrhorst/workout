# Workout CLI Skill

Use this skill when Hermes needs to record or inspect workout data through the
installed `workout` command.

## Purpose

`workout` is a local-first training log. Hermes writes sessions, exercise
definitions, and sets through the CLI. The dashboard reads the same local
SQLite database through an Express server.

## Install

From a cloned repo:

```bash
npm install
npm run build
npm install -g .
```

After global install, the command is:

```bash
workout help
```

## Database

Default database:

```text
~/.workout/training-log.sqlite
```

Override it for Docker, tests, or a shared local mount:

```bash
WORKOUT_DB=/data/workout.sqlite workout summary
workout summary --db /data/workout.sqlite
```

Prefer `WORKOUT_DB` for long-running dashboard/server processes. Prefer `--db`
for one-off explicit CLI calls. When using `--db`, put the command first.

## Commands Hermes Should Call

Initialize the database:

```bash
workout init
```

Create or update an exercise definition:

```bash
workout add-exercise --name "Bench Press" --areas chest,shoulders,arms
```

Allowed body areas:

```text
chest, back, legs, shoulders, arms, core
```

Start or update a workout session:

```bash
workout start-session --id today --date 2026-06-05
```

Use a stable session id when Hermes is operating during one workout. `today` is
acceptable for a single daily workout. Use a more specific id if multiple
sessions happen on the same day.

Add a set:

```bash
workout add-set --session today --exercise "Bench Press" --set 1 --reps 8 --weight 135 --unit lb --source-entry-id hermes-message-001
```

Hermes should always pass `--source-entry-id` when it can. Use the id of the
message, voice transcript, tool call, or event that caused the write. Repeating
the same command with the same source entry id is safe and should not duplicate
the set.

Read dashboard JSON:

```bash
workout summary
```

Serve the dashboard:

```bash
workout serve --host 0.0.0.0 --port 4321
```

Use `0.0.0.0` when the dashboard must be reachable from an iPhone through
Tailscale or through a Docker-published port.

## Error Handling

If `add-set` fails with an unknown exercise, call `add-exercise` first, then
retry the set.

If `add-set` fails with an unknown session, call `start-session` first, then
retry the set.

If a repeated `add-set` returns `"inserted": false`, treat it as success. It
means the set was already logged.
