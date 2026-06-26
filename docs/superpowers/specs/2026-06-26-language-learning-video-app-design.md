# Language Learning Video App Design

## Summary

Build a local-first web app for language learners who want to turn short YouTube videos, roughly five minutes long, into structured language-learning notes.

The MVP accepts a YouTube URL, fetches the video's original transcript through `youtube-transcript.io`, lets the user choose learning settings, writes a local JSON task file for Codex CLI or another local agent, and displays generated markdown lessons from a gitignored local folder.

The app UI is English. Generated learning content can target Chinese or English.

## Goals

- Provide a simple landing page and a Get Started flow.
- Accept a YouTube video URL.
- Fetch the original transcript using `youtube-transcript.io`.
- Fetch the video title using YouTube oEmbed.
- Let the user choose:
  - Target translation language: Chinese or English.
  - CEFR levels: `A1`, `A2`, `B1`, `B2`, `C1`, `C2`, with multiple selections allowed.
- Create a local JSON task file for Codex CLI or another local agent.
- Store generated markdown lessons under a gitignored local folder.
- Render local markdown lesson files in the app.
- Show a sidebar of generated lesson files.
- Export the currently rendered markdown lesson as PDF using browser print.
- Export a lesson to Notion when Notion environment variables are configured.

## Non-Goals for MVP

- Running Codex CLI or another local agent directly from the app.
- Generating the final markdown lesson inside the web app.
- Transcribing videos that do not already have available transcripts.
- `faster-whisper` fallback.
- Google Drive export.
- Google OAuth or Better Auth integration.
- Full Notion OAuth.
- User accounts or cloud sync.

## Architecture

Use Next.js with Fumadocs for the app shell and documentation-style navigation.

The UI should be client-first:

- Use Client Components for the interactive app experience.
- Use TanStack Query for all queries and mutations.
- Do not use Server Actions.
- Do not rely on SSR for app state.

The app still needs local API routes because browser-only code cannot safely hold API keys or write local files. These API routes are ordinary HTTP endpoints, not Server Actions.

Server-only local API routes handle:

- Parsing YouTube URLs into video IDs.
- Fetching transcripts from `youtube-transcript.io`.
- Fetching video titles through YouTube oEmbed.
- Writing task JSON files into `.local/tasks`.
- Listing markdown files from `.local/lessons`.
- Reading selected markdown lesson files.
- Exporting selected markdown lessons to Notion.

Secrets stay server-side:

- `YOUTUBE_TRANSCRIPT_API_KEY`
- `NOTION_API_KEY`
- `NOTION_PARENT_PAGE_ID`

## Pages and UI Areas

### Landing Page

The landing page is a simple English page with a primary "Get Started" call to action.

It should explain the core workflow briefly: paste a YouTube link, choose learning goals, generate a local task, then review the produced markdown lesson.

### Get Started Page

The Get Started page has two steps.

Step 1: YouTube URL form

- User enters a YouTube video link.
- Client validates the URL before API calls.
- Client uses a TanStack Query mutation to call the local transcript API.
- The API parses the video ID, fetches oEmbed metadata, and fetches the transcript from `youtube-transcript.io`.
- The UI displays:
  - Video title.
  - Video ID.
  - Transcript status.
  - Transcript preview.

Step 2: Learning settings form

- Target translation language:
  - Chinese.
  - English.
- CEFR levels:
  - `A1`
  - `A2`
  - `B1`
  - `B2`
  - `C1`
  - `C2`
- CEFR levels are checkboxes and can be selected together.
- Submitting the form creates a JSON task file in `.local/tasks`.
- The UI displays:
  - Generated task path.
  - Expected markdown output path.
  - A suggested Codex CLI command.

Suggested command shape:

```bash
codex "Generate the lesson markdown from .local/tasks/2026-06-26-video-title.json"
```

### Lesson Sidebar

The sidebar lists files from `.local/lessons/*.md`.

Each item should display:

- Filename or derived title.
- Last modified time when available.

If no lessons exist, show an empty state explaining that generated markdown files will appear after the user runs the local agent command.

Include a refresh control so the user can refresh the lesson list after Codex CLI writes a new markdown file.

### Lesson Detail Page

The lesson detail page renders the selected markdown file.

It includes an export dropdown with:

- Save as PDF.
- Import to Notion.
- Import to Google Drive, shown as unavailable or future enhancement.

Save as PDF calls `window.print()` and relies on print CSS to format the current lesson page.

Import to Notion calls a local API route. If Notion env vars are missing, the UI shows setup requirements instead of failing silently.

## API Routes

Use local API routes as the boundary between client UI and privileged local operations.

Proposed endpoints:

```txt
POST /api/transcripts
POST /api/tasks
GET  /api/lessons
GET  /api/lessons/[slug]
POST /api/exports/notion
```

`POST /api/transcripts`

- Input: YouTube URL.
- Validates and parses the video ID.
- Calls YouTube oEmbed for title metadata.
- Calls `youtube-transcript.io`.
- Returns normalized video metadata and transcript segments.

`POST /api/tasks`

- Input: normalized video metadata, transcript segments, and learning settings.
- Writes a JSON task file to `.local/tasks`.
- Returns task path, output markdown path, and suggested Codex CLI command.

`GET /api/lessons`

- Lists `.local/lessons/*.md`.
- Returns stable slugs, display titles, paths, and modified times.

`GET /api/lessons/[slug]`

- Reads a selected markdown file from `.local/lessons`.
- Prevents path traversal by resolving only known lesson slugs or validating the resolved path remains inside `.local/lessons`.

`POST /api/exports/notion`

- Input: selected lesson slug.
- Reads the markdown file server-side.
- Creates a Notion page under `NOTION_PARENT_PAGE_ID` using `NOTION_API_KEY`.
- Returns the Notion page URL or a typed configuration/API error.

## Transcript Source

Use `youtube-transcript.io` for MVP transcript fetching.

Expected integration:

- Endpoint: `POST https://www.youtube-transcript.io/api/transcripts`
- Header:
  - `Authorization: Basic <api-token>`
  - `Content-Type: application/json`
- Body:

```json
{
  "ids": ["jNQXAC9IVRw"]
}
```

The app accepts YouTube URLs, not raw IDs. The server parses the ID before calling the API.

The MVP automatically uses the original transcript returned by the API. It does not expose transcript language selection.

## Local Files

Generated files live under `.local`, which must be gitignored:

```txt
.local/
  tasks/
    2026-06-26-video-title.json
  lessons/
    2026-06-26-video-title.md
```

The app should create `.local/tasks` and `.local/lessons` if missing.

Task and lesson filenames use:

- Current date.
- Slugified video title.
- Fallback to video ID when the title is unavailable.

## Task JSON Contract

Task files are JSON so they are easy for the app to write and easy for a local agent to read.

Shape:

```json
{
  "schemaVersion": 1,
  "createdAt": "2026-06-26T12:00:00.000Z",
  "video": {
    "url": "https://www.youtube.com/watch?v=...",
    "id": "abc123",
    "title": "Video Title"
  },
  "transcript": {
    "source": "youtube-transcript.io",
    "segments": [
      {
        "text": "Example caption text",
        "start": 0.32,
        "duration": 2.48
      }
    ]
  },
  "learningSettings": {
    "targetLanguage": "zh",
    "cefrLevels": ["A2", "B1"]
  },
  "output": {
    "format": "markdown",
    "path": ".local/lessons/2026-06-26-video-title.md"
  },
  "instructions": {
    "requiredSections": [
      "metadata",
      "sentence-by-sentence translation",
      "vocabulary by CEFR level",
      "grammar by CEFR level",
      "spoken usage"
    ]
  }
}
```

The transcript preserves timestamp segments from the API. The app does not merge or re-sentence the transcript. Codex CLI handles sentence grouping and translation when generating the lesson.

## Markdown Output Contract

Codex CLI or another local agent writes the final markdown file to the task's `output.path`.

Required markdown sections:

```md
# Video Title

## Metadata

## Sentence-by-Sentence Translation

## Vocabulary - A2

## Grammar - A2

## Vocabulary - B1

## Grammar - B1

## Spoken Usage
```

Vocabulary and grammar sections are grouped by selected CEFR level. If the user selects `A1`, `B1`, and `C1`, the markdown should include vocabulary and grammar sections for each selected level.

The spoken usage section lists conversational expressions, idioms, reductions, filler phrases, discourse markers, or casual turns of phrase from the transcript when present.

## TanStack Query Usage

Queries:

- `lessonsQuery`: lists generated lessons.
- `lessonQuery(slug)`: reads one markdown lesson.

Mutations:

- `fetchTranscriptMutation`: fetches video metadata and transcript.
- `createTaskMutation`: writes the task JSON file.
- `exportNotionMutation`: exports a selected lesson to Notion.

After task creation, the lesson list should not refresh automatically because the markdown file does not exist until the local agent writes it.

After Notion export, no local lesson invalidation is required.

## Error Handling

Invalid YouTube URL:

- Show inline validation before calling the API.

Missing `YOUTUBE_TRANSCRIPT_API_KEY`:

- Return a typed configuration error from the local API.
- Show a clear setup message in the UI.

Transcript unavailable:

- Explain that MVP only supports videos with available transcripts.
- Do not attempt fallback transcription.

Rate limited:

- If the transcript API returns `429`, surface the retry wait when available from `Retry-After`.

oEmbed title failure:

- Continue with video ID as title and filename fallback.

File write failure:

- Show the failed path and suggest checking local filesystem permissions.

Missing Notion config:

- Explain that `NOTION_API_KEY` and `NOTION_PARENT_PAGE_ID` are required.

Notion API failure:

- Show a concise error state.
- Keep the local markdown file untouched.

## Exports

### PDF

PDF export uses browser print:

- User chooses "Save as PDF".
- The app calls `window.print()`.
- Print CSS hides navigation and controls.
- Print CSS formats the markdown content for paper/PDF output.

### Notion

Notion export is included in MVP with environment-variable configuration.

Configuration:

- `NOTION_API_KEY`
- `NOTION_PARENT_PAGE_ID`

The user must manually:

- Create a Notion integration.
- Share the destination Notion page with that integration.
- Set the env vars locally.

The app does not implement Notion OAuth in MVP.

### Google Drive

Google Drive export is a future enhancement. The UI may show it as unavailable.

Future implementation should use:

- Better Auth Google OAuth.
- Google Drive `drive.file` scope.
- A backend upload route using the user's Google access token.

## Future Enhancements

### `faster-whisper` Fallback

When a video has no available transcript, a future version can support local speech-to-text:

- Download or extract the video audio.
- Run local transcription with `faster-whisper`.
- Normalize the output into the same transcript segment shape used by the MVP.
- Store fallback source metadata in the task JSON.

This is intentionally excluded from MVP because it adds model installation, audio handling, processing time, and hardware variability.

### Google Drive Export

Future Drive export can use Better Auth for Google OAuth:

- Add Better Auth.
- Configure Google provider.
- Request `https://www.googleapis.com/auth/drive.file`.
- Store or retrieve the access token safely.
- Upload the selected markdown or generated PDF through the Drive API.

This is excluded from MVP because the app does not otherwise need user accounts or OAuth.

### Automatic Local Agent Execution

A future version can execute Codex CLI directly from the app and stream progress back to the UI.

This is excluded from MVP because it requires process management, permission handling, progress reporting, and failure recovery.

## Testing Strategy

Unit tests:

- YouTube URL parsing.
- Filename slug generation.
- Task JSON creation.
- Transcript segment normalization.
- Path traversal protection helpers.

API route tests:

- Transcript success and error mapping.
- Missing transcript API key.
- Rate limit response mapping.
- Task file creation.
- Lesson list and lesson read behavior.
- Notion missing-config response.

UI tests:

- Get Started happy path with mocked API responses.
- YouTube URL validation.
- CEFR checkbox behavior.
- Task creation result display.
- Sidebar empty and populated states.
- Lesson detail markdown rendering.
- Export dropdown states.

Manual verification:

- Create a task from a real YouTube URL with available transcript.
- Run the displayed Codex CLI command.
- Confirm the generated markdown appears in the sidebar after refresh.
- Open the generated lesson page.
- Save as PDF through browser print.
- Export to Notion when Notion env vars are configured.

## Open Decisions Resolved

- App framework: Next.js + Fumadocs.
- UI language: English.
- App data fetching: TanStack Query.
- Server Actions: not used.
- SSR for app state: not used.
- Transcript source: `youtube-transcript.io`.
- Transcript fallback: none in MVP.
- `faster-whisper`: future enhancement.
- Local agent integration: task JSON plus displayed command.
- Task file format: JSON.
- Local storage folder: `.local`.
- Markdown lesson grouping: vocabulary and grammar grouped by CEFR level.
- PDF export: browser print.
- Notion export: MVP with env vars.
- Google Drive export: future enhancement with Better Auth.
