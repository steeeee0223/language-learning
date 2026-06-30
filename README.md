# Language Learning Notes

Local-first Next.js + Fumadocs app for turning short YouTube videos into structured language-learning lessons.

## Prerequisites

- Node.js 24.11.1 and pnpm 11.0.8
- A ChatGPT/Codex account with available Codex usage
- A `youtube-transcript.io` API key for transcript fetching

## Workflow

1. Install dependencies:

   ```bash
   pnpm install
   ```

2. Sign in to Codex:

   ```bash
   pnpm exec codex login
   ```

   Choose the ChatGPT sign-in option (recommended). The bundled Codex CLI handles and refreshes its own credentials in the normal user-level credential store or cache; the application code does not open or copy credential files.

3. Start the app:

   ```bash
   pnpm dev
   ```

4. Open **Get Started**, paste a YouTube URL, and fetch the transcript.
5. Choose the target language and CEFR levels, then select **Prepare Lesson**.
6. Choose **Auto**, **Fast**, or **Best quality**, then select **Generate Lesson**.
7. Review the generated lesson in the app, print it to PDF, or export it to Notion when configured.

With the recommended ChatGPT sign-in, each OS user uses their own Codex account and usage allowance, with no API key required. The project does not ship or configure a shared `OPENAI_API_KEY`, Vercel AI Gateway key, or other shared AI key. Generation uses whatever local Codex authentication belongs to the OS account running the app.

For generation, the app explicitly invokes the repository's `.agents/skills/generating-lesson` skill so the JSON output contract stays consistent. The Codex agent runs in a read-only sandbox; sandboxed network access and web search are disabled, though it may use read-only tools to inspect the repository and skill files. Codex still sends the prompt and transcript to OpenAI's Codex service under the local account. The app then validates the returned JSON and writes the lesson itself.

## Environment

Create `.env.local` from the committed template:

```bash
cp .env.example .env.local
```

Then fill in the values you need:

```bash
YOUTUBE_TRANSCRIPT_API_KEY=...
NOTION_API_KEY=...
NOTION_PARENT_PAGE_ID=...
LOCAL_DATA_ROOT=
```

`YOUTUBE_TRANSCRIPT_API_KEY` is required for transcript fetching. `NOTION_API_KEY` and `NOTION_PARENT_PAGE_ID` are optional unless you use Notion export. `LOCAL_DATA_ROOT` is optional and defaults to the project root.

## Local Files

Generated local artifacts are intentionally gitignored:

```txt
.local/
  tasks/
  lessons/
  errors/
```

`.local/tasks` contains local task JSON, and `.local/lessons` contains generated lesson JSON. A failed generation with no returned content is written to `.local/errors/<task-id>.json`. When a failure occurs after Codex returns content, such as a publication failure, the attempt is written to `.local/errors/<task-id>/<attempt>/` with `error.json` and `generated.json`. Codex credentials are not stored under `.local`.

For tests or isolated local runs, set `LOCAL_DATA_ROOT` to another directory.

## Development

```bash
pnpm dev
pnpm test
pnpm lint
pnpm types:check
pnpm build
```

`pnpm build` uses `next build --webpack` because the current Fumadocs MDX setup builds reliably through webpack in this workspace.
