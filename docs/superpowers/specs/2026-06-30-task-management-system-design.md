# Task Management System Design

## Summary

Replace the lesson index with a task-management page organized by reusable stories.
Normalize local persistence so a fetched YouTube video and transcript are stored once,
while each combination of CEFR levels, target language, and model-performance preset is
stored as an independent task. Combine the current Learning settings and Generate lesson
steps into one form and one generation action.

## Goals

- Reuse a fetched transcript whenever the same YouTube video is selected again.
- Generate multiple lessons from one story using different learning settings.
- Present all generation tasks in story-grouped, collapsible tables.
- Allow successful and failed tasks to be regenerated without changing the originals.
- Delete a task together with its generated lesson or failure diagnostics.
- Reduce Get Started from three sections and two submission actions to two sections and
  one generation action.
- Preserve valid existing local stories, tasks, lessons, and lesson URLs during migration.

## Non-Goals

- Editing the transcript or video metadata of an existing story.
- Refreshing a story's transcript after it has been stored.
- Keeping multiple generation attempts inside one task.
- Automatically deleting stories that have no tasks.
- Bulk task selection, bulk deletion, filtering, sorting controls, or pagination.
- Background queues, cross-device synchronization, or cloud persistence.
- Changing lesson content, export behavior, or the Codex generation contract.

## Terminology

### Story

A story is reusable source material identified by its YouTube video ID. It stores the
video metadata, fetched transcript, schema version, and creation time. It does not store
CEFR levels, target language, a model preset, or any other user generation selection.

Submitting a URL for an existing video ID returns the stored story without calling the
transcript provider again. Transcript refresh is outside this feature's scope.

### Task

A task is one immutable lesson-generation request. It references one story and stores
the selected CEFR levels, target language, model-performance preset, timestamps, status,
and minimal generation metadata. Its status is `pending`, `succeeded`, or `failed`.

Each task owns one outcome:

- a successful task owns one lesson JSON file; or
- a failed task owns its error JSON or diagnostic files.

Regeneration creates a new task with copied selections and a new ID. The source task and
its outcome are not modified.

## Persistence Model

Use normalized local files:

```text
.local/
  stories/<video-id>.json
  tasks/<task-id>.json
  lessons/<task-id>.json
  errors/<task-id>/...
```

Story IDs use the validated YouTube video ID. Task IDs are safe, unique local slugs that
do not depend on the story ID or date alone, so repeated generation cannot collide.
Lesson slugs continue to equal task IDs, preserving the existing
`/lessons/<task-id>` relationship.

The story schema contains:

- schema version;
- story ID;
- creation time;
- video metadata; and
- normalized transcript.

The task schema contains:

- schema version;
- task ID;
- story ID;
- creation time;
- immutable learning settings;
- immutable model-performance preset;
- output format and path; and
- generation status and metadata.

Task creation writes the validated task atomically. Generation updates only generation
metadata and writes the lesson or error artifacts through the existing safe local-path
and atomic-write boundaries.

## Legacy Migration

Existing schema-version-3 task files embed both source material and user selections.
Add an idempotent migration that runs before story or task listing and before a legacy
task is loaded for generation.

For each legacy task:

1. Validate it with the legacy schema.
2. Create the story file from its video metadata and transcript if that story does not
   already exist.
3. Convert the task to the normalized schema using the existing task slug as its task ID.
4. Keep the existing lesson filename and output path unchanged.
5. Normalize existing task-associated error artifacts into the task error location when
   needed.
6. Write new files atomically before replacing the legacy task file.

If several legacy tasks use one video ID, they converge on one story. If their stored
source data differs, the oldest valid story is retained and migration reports the
conflict rather than silently overwriting it. A migration failure leaves the legacy task
readable and reports an actionable local error; it does not delete source or outcome
files.

## Server Boundaries

Keep source-material and generation-request responsibilities separate:

- `story-schema` defines story persistence contracts.
- `story-store` reads, creates, reuses, and lists stories.
- `task-schema` defines normalized task persistence contracts.
- `task-store` creates, reads, updates, lists, and deletes tasks.
- `task-migration` converts legacy task files idempotently.
- the generation coordinator joins a task to its story before building the prompt.
- a task-list query returns UI projections grouped by story without exposing transcripts.

These modules communicate through Zod-validated domain objects. Browser responses do
not include transcripts, absolute paths, raw SDK errors, credentials, or model traces.

## API Design

### `POST /api/stories`

Accept a YouTube URL. Parse and validate its video ID before any file access. Return the
existing story summary when present. Otherwise fetch the transcript, validate it, write
the story, and return the same summary shape.

Concurrent requests for the same video ID use a story-level operation lock and converge
on one stored story.

### `GET /api/tasks`

Return story summaries grouped with task summaries. Stories are ordered newest first;
tasks within each story are ordered newest first. A summary includes only fields needed
by the Tasks page.

### `POST /api/tasks`

Accept a story ID, at least one CEFR level, target language, and model-performance
preset. Validate that the story exists, create a unique pending task, and return its ID.

### `POST /api/tasks/[id]/generate`

Generate from the task's stored selections; the browser no longer supplies a model
preset to this route. Join the task to its story, invoke the existing generation
coordinator, and persist a lesson or typed failure diagnostics.

### `POST /api/tasks/[id]/regenerate`

Reject a source task that is currently pending under an active operation lock. Otherwise
create a unique pending task with the same story ID and selections, then generate it.
The original task is unchanged. The response identifies the new task and, on success,
its lesson.

### `DELETE /api/tasks/[id]`

Reject deletion while that task is under an active generation operation. For a
successful task, delete its lesson JSON and then its task JSON. For a failed task, delete
all associated error and diagnostic artifacts and then its task JSON. A pending task
without an active generation may be deleted with its partial diagnostics, if any.

Deletion is idempotent. Outcome cleanup completes before task removal. If cleanup fails,
the task stays visible and the API reports the failure so the user can retry. The story
is never deleted by this operation.

## Get Started Flow

Get Started becomes a two-section flow.

### 1. Fetch or reuse story

The user enters a YouTube URL. Submission calls `POST /api/stories`. An existing video ID
reuses its stored transcript; a new video fetches and stores a transcript. Both paths
show the same story-ready summary.

Opening Get Started from a story's **New task** action supplies the story ID and skips
the URL-fetch form while still showing the story summary.

### 2. Configure and generate lesson

One section contains:

- target translation language;
- CEFR level checkboxes;
- model-performance selection;
- Codex readiness and recovery guidance;
- the privacy and usage notice; and
- one **Generate lesson** button.

Submission creates the task and immediately starts generation. Controls remain disabled
while generation is active. Success navigates to `/lessons/<task-id>`. Failure is shown
inline and remains persisted on the Tasks page for regeneration or deletion. The
intermediate **Prepare Lesson** action and task-path preview are removed.

## Tasks Page

Replace **All lessons** in navigation with **Tasks** at `/tasks`. Keep lesson detail
routes at `/lessons/<task-id>`.

The page groups tasks by story. Each story is a collapsible section whose header shows:

- video title;
- video ID;
- task count; and
- a **New task** action.

Expanded content uses a restrained table based on the supplied visual reference:
horizontal separators, muted column headers, generous row spacing, minimal container
chrome, and a right-aligned ellipsis menu. Columns are Status, CEFR levels, Target
language, Model, Created, and Actions. Narrow screens may horizontally scroll the table
rather than collapsing labels into ambiguous cards.

Successful rows link to their lesson. Their menu contains **Re-generate** and
**Delete lesson**. Failed rows are not lesson links; their menu contains **Re-generate**
and **Delete task**. Pending rows expose no destructive or regeneration action while an
operation is active.

Regeneration creates a new row. It never changes the original row. Delete actions use a
confirmation dialog, disable themselves while pending, and refresh the grouped list only
after the server confirms cleanup.

## Error and Recovery Behavior

- Story-fetch failure does not create a story or task.
- Task-creation failure does not start Codex generation.
- Generation failure preserves the failed task and its diagnostics.
- Regeneration failure creates a new failed task and preserves the source task.
- A missing story referenced by a task is reported as corrupted local state; generation
  does not proceed.
- A successful task with a missing or invalid lesson is reported as corrupted local
  state rather than silently treated as failed.
- A failed task with missing diagnostics remains deletable and regenerable.
- Concurrent generation, regeneration, and deletion use operation locks and return
  stable conflict errors.
- UI mutations display actionable errors and do not optimistically remove rows before
  server confirmation.

## Testing Strategy

Use the repository's existing Node test runner and add focused contract, service, and UI
logic tests for:

- story schema validation and reuse without another transcript-provider call;
- concurrent creation converging on one story;
- multiple tasks referencing one story;
- task schema validation and immutable selections;
- unique task IDs across repeated identical configurations;
- regeneration copying selections while preserving the source task;
- successful deletion removing lesson and task JSON files;
- failed deletion removing diagnostics and task JSON files;
- cleanup failure retaining a retryable task record;
- generation, regeneration, and deletion conflicts;
- idempotent legacy migration and preserved lesson URLs;
- migration conflict behavior for differing source data;
- grouped task-list ordering and response projection;
- combined Get Started submission behavior;
- status-aware row links and ellipsis actions; and
- confirmation and error states for destructive actions.

Run type checking, linting, the full test suite, and a production build. Visually verify
the two-step Get Started flow, story reuse, grouped task tables, menus, confirmation
states, generation navigation, responsive overflow, and both deletion paths in the local
browser.

## Security and Privacy

- Continue validating all external and persisted data with Zod.
- Keep transcript content out of task-list responses.
- Retain strict safe-slug checks, child-path checks, and no-follow file access where
  applicable.
- Never expose Codex credentials, registry authentication, raw SDK traces, or absolute
  local paths.
- Require explicit confirmation for task and outcome deletion.
- Keep Codex generation read-only; application code remains the only writer of local
  story, task, lesson, and error files.
