# Language Learning Notes

Local-first Next.js + Fumadocs app for turning short YouTube videos into structured language-learning lesson tasks.

## Workflow

1. Open the app and choose **Get Started**.
2. Paste a YouTube URL.
3. Fetch the original transcript through `youtube-transcript.io`.
4. Choose a target translation language and CEFR levels.
5. Create a local JSON task in `.local/tasks`.
6. Run the suggested Codex command to generate markdown into `.local/lessons`.
7. Review lessons in the app, print to PDF, or export to Notion when configured.

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
```

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
