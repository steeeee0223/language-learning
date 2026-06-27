# Fumadocs Lessons UI Updates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Important:** Do not use test-driven development for this plan. These are direct UI and rendering updates. Implement the UI changes first, then verify with lint/build, existing tests, and browser review. Run typecheck once, as the final gate after every task is complete.

**Goal:** Move generated lessons into the Fumadocs docs experience, use shadcn/base-ui-style primitives for controls, render generated lessons as MDX with reliable tables and ToC, and ensure target-language instructions are correct for generated content.

**Architecture:** Keep local task and lesson APIs as the file-system boundary, but change the output contract from Markdown to MDX. Reuse Fumadocs `DocsLayout`, `DocsPage`, `DocsBody`, and generated ToC behavior for lessons instead of the current custom two-column lesson shell. Keep direct UI components small and local to the lesson/get-started surfaces unless reuse is immediate.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 6, Fumadocs UI/MDX, TanStack Query, Tailwind CSS 4, lucide-react, `next-mdx-remote/rsc`, local file-system APIs.

---

## File Structure

- Modify: `package.json`
  - Add `next-mdx-remote` for runtime rendering of generated `.mdx` files outside the static Fumadocs collection.
- Modify: `src/lib/server/tasks.ts`
  - Emit `.mdx` output paths, `format: "mdx"`, an MDX-focused suggested command, YouTube embed requirement, GFM table requirement, and target-language instructions.
- Modify: `src/lib/server/lessons.ts`
  - List/read `.mdx` lesson files first, with optional `.md` migration support.
- Modify: `src/components/mdx.tsx`
  - Register `YouTubeEmbed` and table-related components for MDX rendering.
- Create: `src/components/youtube-embed.tsx`
  - Render responsive YouTube iframe embeds for lesson headers.
- Create: `src/lib/lesson-toc.ts`
  - Extract a Fumadocs-compatible table of contents from generated MDX headings.
- Create: `src/lib/lesson-mdx.tsx`
  - Compile/render generated lesson MDX content with app MDX components.
- Create: `src/lib/lessons-page-tree.ts`
  - Build the Fumadocs page tree with sidebar tabs for Get Started and Generated Lessons.
- Modify: `src/components/lessons-client.tsx`
  - Replace the custom rendered card shell with a Fumadocs-compatible lesson content client and shadcn/base-ui-style controls.
- Modify: `src/app/lessons/page.tsx`
  - Render generated lessons inside `DocsLayout` with a page tree containing Get Started and Generated Lessons.
- Modify: `src/app/lessons/[slug]/page.tsx`
  - Read the lesson server-side, derive ToC, and pass content to a Fumadocs `DocsPage`.
- Modify: `src/app/get-started/get-started-client.tsx`
  - Update output copy from Markdown to MDX and ensure UI primitives are consistent.
- Modify: `src/app/api/lessons/route.ts`
  - Return `.mdx` lesson metadata from updated server helper.
- Modify: `src/app/api/lessons/[slug]/route.ts`
  - Return `.mdx` lesson detail from updated server helper.
- Modify: `src/app/api/tasks/route.ts`
  - Return updated MDX task path and suggested command.
- Optional delete after migration: `src/components/markdown-renderer.tsx`
  - Remove only after generated MDX rendering no longer depends on it.

### Task 1: Update Task Output Contract to MDX

**Files:**
- Modify: `src/lib/server/tasks.ts`
- Modify: `src/app/get-started/get-started-client.tsx`

- [ ] **Step 1: Change generated lesson extension and format**

In `src/lib/server/tasks.ts`, change:

```ts
const outputPath = `.local/lessons/${basename}.md`;
```

to:

```ts
const outputPath = `.local/lessons/${basename}.mdx`;
```

Change:

```ts
output: {
  format: 'markdown',
  path: outputPath,
},
```

to:

```ts
output: {
  format: 'mdx',
  path: outputPath,
},
```

- [ ] **Step 2: Add explicit generation instructions**

In `src/lib/server/tasks.ts`, keep `requiredSections`, then add constants near it:

```ts
const mdxRequirements = [
  'Start the lesson body with <YouTubeEmbed videoId="{video.id}" title="{video.title}" />.',
  'Use MDX-compatible syntax.',
  'Use GitHub Flavored Markdown tables only when the renderer supports them; otherwise use simple MDX table markup.',
  'Visible headings, table labels, explanations, vocabulary notes, grammar notes, and metadata labels must be written in learningSettings.targetLanguage.',
  'Source transcript quotes, proper nouns, URLs, video IDs, and code-like values may remain in their original language.',
];
```

Add it to `instructions`:

```ts
instructions: {
  requiredSections,
  mdxRequirements,
},
```

- [ ] **Step 3: Update suggested command copy**

In `src/lib/server/tasks.ts`, change:

```ts
suggestedCommand: `codex "Generate the lesson markdown from ${taskPath}"`,
```

to:

```ts
suggestedCommand: `codex "Generate the lesson MDX from ${taskPath}"`,
```

- [ ] **Step 4: Update Get Started page copy**

In `src/app/get-started/get-started-client.tsx`, replace user-facing references to `markdown lesson` with `MDX lesson`.

Expected visible copy includes:

```tsx
Create a local task from a YouTube transcript, then run the suggested Codex command to produce the MDX lesson.
```

- [ ] **Step 5: Verify task output manually**

Run:

```bash
pnpm test
```

Expected:

```txt
tests pass
```

### Task 2: Support `.mdx` Lessons in Local Lesson APIs

**Files:**
- Modify: `src/lib/server/lessons.ts`
- Modify: `tests/local-domain.test.ts`
- Modify: `tests/api-routes.test.ts`

- [ ] **Step 1: List `.mdx` files first**

In `src/lib/server/lessons.ts`, replace the `.md`-only filter with support for `.mdx` and migration `.md` files:

```ts
const LESSON_EXTENSIONS = ['.mdx', '.md'] as const;

function getLessonExtension(filename: string) {
  return LESSON_EXTENSIONS.find((extension) => filename.endsWith(extension));
}
```

Use it in `listLessons`:

```ts
.filter((entry) => entry.isFile() && getLessonExtension(entry.name))
.map(async (entry) => {
  const extension = getLessonExtension(entry.name);
  if (!extension) {
    throw new Error('Unsupported lesson file.');
  }

  const slug = entry.name.slice(0, -extension.length);
```

- [ ] **Step 2: Read `.mdx` before `.md`**

In `readLesson`, resolve candidate paths in order:

```ts
const candidates = LESSON_EXTENSIONS.map((extension) => ({
  extension,
  absolutePath: resolve(paths.lessonsDir, `${options.slug}${extension}`),
}));

const match = candidates.find(({ absolutePath }) => absolutePath.startsWith(`${lessonsDir}/`));
if (!match) {
  throw new Error('Invalid lesson slug.');
}
```

Then read the first existing candidate. If neither exists, let the final read/stat throw a typed not-found error from the route, or explicitly throw:

```ts
throw new Error('Lesson not found.');
```

- [ ] **Step 3: Update existing tests directly**

Update fixtures/assertions in `tests/local-domain.test.ts` and `tests/api-routes.test.ts` from `.md` to `.mdx` for the default expected path. Keep one `.md` fixture only if validating migration support.

- [ ] **Step 4: Verify**

Run:

```bash
pnpm test
```

Expected:

```txt
tests pass
```

### Task 3: Add MDX Lesson Rendering Components

**Files:**
- Modify: `package.json`
- Create: `src/components/youtube-embed.tsx`
- Modify: `src/components/mdx.tsx`
- Create: `src/lib/lesson-toc.ts`
- Create: `src/lib/lesson-mdx.tsx`
- Optional delete: `src/components/markdown-renderer.tsx`

- [ ] **Step 1: Add runtime MDX dependency**

Install:

```bash
pnpm add next-mdx-remote
```

Expected `package.json` dependency entry:

```json
"next-mdx-remote": "^5.0.0"
```

- [ ] **Step 2: Create YouTube embed component**

Create `src/components/youtube-embed.tsx`:

```tsx
type YouTubeEmbedProps = {
  videoId: string;
  title: string;
};

export function YouTubeEmbed({ videoId, title }: YouTubeEmbedProps) {
  return (
    <div className="mb-8 overflow-hidden rounded-lg border bg-black">
      <iframe
        className="aspect-video w-full"
        src={`https://www.youtube.com/embed/${encodeURIComponent(videoId)}`}
        title={title}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
      />
    </div>
  );
}
```

- [ ] **Step 3: Register MDX components**

In `src/components/mdx.tsx`, import the component:

```ts
import { YouTubeEmbed } from './youtube-embed';
```

Add it to `getMDXComponents` before the spread:

```ts
YouTubeEmbed,
table: (props) => (
  <div className="my-6 overflow-x-auto">
    <table {...props} className="w-full border-collapse text-sm" />
  </div>
),
th: (props) => <th {...props} className="border px-3 py-2 text-left font-semibold" />,
td: (props) => <td {...props} className="border px-3 py-2 align-top" />,
```

- [ ] **Step 4: Add heading ToC extraction**

Create `src/lib/lesson-toc.ts`:

```ts
import type { TOCItemType } from 'fumadocs-core/toc';

const headingPattern = /^(#{2,4})\s+(.+)$/gm;

export function slugifyHeading(value: string) {
  return value
    .toLowerCase()
    .replace(/<[^>]+>/g, '')
    .replace(/[^\p{Letter}\p{Number}\s-]/gu, '')
    .trim()
    .replace(/\s+/g, '-');
}

export function extractLessonToc(content: string): TOCItemType[] {
  return [...content.matchAll(headingPattern)].map((match) => {
    const depth = match[1].length;
    const title = match[2].trim();

    return {
      title,
      url: `#${slugifyHeading(title)}`,
      depth,
    };
  });
}
```

- [ ] **Step 5: Add generated MDX renderer**

Create `src/lib/lesson-mdx.tsx`:

```tsx
import { getMDXComponents } from '@/components/mdx';
import { MDXRemote } from 'next-mdx-remote/rsc';

type LessonMdxProps = {
  content: string;
};

export function LessonMdx({ content }: LessonMdxProps) {
  return <MDXRemote source={content} components={getMDXComponents()} />;
}
```

- [ ] **Step 6: Remove old renderer when unused**

After `LessonsClient` no longer imports `MarkdownRenderer`, delete `src/components/markdown-renderer.tsx`.

- [ ] **Step 7: Verify**

Run:

```bash
pnpm lint
```

Expected:

```txt
lint passes
```

### Task 4: Move Lessons Into Fumadocs Docs Layout

**Files:**
- Modify: `src/app/lessons/page.tsx`
- Modify: `src/app/lessons/[slug]/page.tsx`
- Modify: `src/components/lessons-client.tsx`
- Modify: `src/lib/layout.shared.tsx`
- Create: `src/lib/lessons-page-tree.ts`

- [ ] **Step 1: Build a lessons page tree**

Create `src/lib/lessons-page-tree.ts`:

```ts
import type { Root } from 'fumadocs-core/page-tree';

import type { LessonListItem } from './server/lessons';

export function createLessonsPageTree(lessons: LessonListItem[]): Root {
  return {
    type: 'root',
    name: 'Language Learning',
    children: [
      {
        type: 'folder',
        name: 'Get Started',
        root: true,
        defaultOpen: true,
        index: {
          type: 'page',
          name: 'Get Started',
          url: '/get-started',
        },
        children: [],
      },
      {
        type: 'folder',
        name: 'Generated Lessons',
        root: true,
        defaultOpen: true,
        index: {
          type: 'page',
          name: 'All Lessons',
          url: '/lessons',
        },
        children: lessons.map((lesson) => ({
          type: 'page',
          name: lesson.title,
          url: `/lessons/${lesson.slug}`,
        })),
      },
    ],
  };
}
```

- [ ] **Step 2: Use Fumadocs sidebar tabs**

In both lesson pages, pass generated tabs to `DocsLayout`:

```tsx
<DocsLayout
  tree={lessonsTree}
  sidebar={{ tabs: { transform: (tab) => tab } }}
  tabMode="sidebar"
  {...baseOptions()}
>
  {children}
</DocsLayout>
```

Expected sidebar tabs:

```txt
Get Started
Generated Lessons
```

- [ ] **Step 3: Wrap lesson index with `DocsLayout`**

Use these imports in `src/app/lessons/page.tsx`:

```tsx
import { createLessonsPageTree } from '@/lib/lessons-page-tree';
import { listLessons } from '@/lib/server/lessons';
import { baseOptions } from '@/lib/layout.shared';
import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import { DocsBody, DocsPage, DocsTitle } from 'fumadocs-ui/layouts/docs/page';
```

Render:

```tsx
export default async function LessonsPage() {
  const lessons = await listLessons();
  const lessonsTree = createLessonsPageTree(lessons);

  return (
    <DocsLayout tree={lessonsTree} sidebar={{ tabs: { transform: (tab) => tab } }} tabMode="sidebar" {...baseOptions()}>
      <DocsPage toc={[]}>
        <DocsTitle>Generated Lessons</DocsTitle>
        <DocsBody>
          {lessons.length === 0 ? (
            <p>Generated MDX files will appear here after your local agent writes them to .local/lessons.</p>
          ) : (
            <ul>
              {lessons.map((lesson) => (
                <li key={lesson.slug}>
                  <a href={`/lessons/${lesson.slug}`}>{lesson.title}</a>
                </li>
              ))}
            </ul>
          )}
        </DocsBody>
      </DocsPage>
    </DocsLayout>
  );
}
```

- [ ] **Step 4: Render selected lesson with Fumadocs ToC**

Use these imports in `src/app/lessons/[slug]/page.tsx`:

```tsx
import { LessonActions } from '@/components/lessons-client';
import { LessonMdx } from '@/lib/lesson-mdx';
import { extractLessonToc } from '@/lib/lesson-toc';
import { createLessonsPageTree } from '@/lib/lessons-page-tree';
import { baseOptions } from '@/lib/layout.shared';
import { listLessons, readLesson } from '@/lib/server/lessons';
import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import { DocsBody, DocsPage, DocsTitle } from 'fumadocs-ui/layouts/docs/page';
```

Render:

```tsx
export default async function LessonDetailPage(props: LessonDetailPageProps) {
  const params = await props.params;
  const [lessons, lesson] = await Promise.all([listLessons(), readLesson({ slug: params.slug })]);
  const lessonsTree = createLessonsPageTree(lessons);
  const toc = extractLessonToc(lesson.content);

  return (
    <DocsLayout tree={lessonsTree} sidebar={{ tabs: { transform: (tab) => tab } }} tabMode="sidebar" {...baseOptions()}>
      <DocsPage toc={toc}>
        <DocsTitle>{lesson.title}</DocsTitle>
        <LessonActions slug={lesson.slug} />
        <DocsBody>
          <LessonMdx content={lesson.content} />
        </DocsBody>
      </DocsPage>
    </DocsLayout>
  );
}
```

- [ ] **Step 5: Reduce `LessonsClient` to interactive controls**

Replace `LessonsClient` in `src/components/lessons-client.tsx` with:

```tsx
'use client';

import { useMutation } from '@tanstack/react-query';
import { Download, ExternalLink, Loader2 } from 'lucide-react';

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error ?? 'Request failed.');
  }

  return payload;
}

export function LessonActions({ slug }: { slug: string }) {
  const notionMutation = useMutation({
    mutationFn: () => postJson<{ url: string }>('/api/exports/notion', { slug }),
  });

  return (
    <div className="mb-6 flex flex-wrap items-center gap-2 border-b pb-4 print:hidden">
      <button className="inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm" type="button" onClick={() => window.print()}>
        <Download className="size-4" aria-hidden />
        Save as PDF
      </button>
      <button
        className="inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm disabled:cursor-not-allowed disabled:opacity-60"
        type="button"
        onClick={() => notionMutation.mutate()}
        disabled={notionMutation.isPending}
      >
        {notionMutation.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <ExternalLink className="size-4" aria-hidden />}
        Import to Notion
      </button>
      <button className="inline-flex h-9 cursor-not-allowed items-center rounded-md border px-3 text-sm opacity-60" type="button" disabled>
        Google Drive
      </button>
      {notionMutation.error && <p className="basis-full text-sm text-amber-700">{notionMutation.error.message}</p>}
      {notionMutation.data && <p className="basis-full text-sm text-emerald-700">Notion page created: {notionMutation.data.url}</p>}
    </div>
  );
}
```

Do not keep the old custom `<main className="mx-auto grid ...">` shell after `DocsLayout` owns the page.

- [ ] **Step 6: Verify visually**

Run:

```bash
pnpm dev
```

Open:

```txt
http://localhost:3000/lessons
http://localhost:3000/lessons/<existing-slug>
```

Expected:

```txt
left Fumadocs sidebar shows Get Started and Generated Lessons tabs
right On this page rail appears for lesson headings
lesson body is centered in the docs layout
export actions remain available
```

### Task 5: Apply shadcn/base-ui-Style Primitives to Controls

**Files:**
- Modify: `src/app/get-started/get-started-client.tsx`
- Modify: `src/components/lessons-client.tsx`
- Create: `src/components/ui/button.tsx`
- Create: `src/components/ui/input.tsx`
- Create: `src/components/ui/field-option.tsx`

- [ ] **Step 1: Create local primitive wrappers**

Create `src/components/ui/button.tsx`:

```tsx
import type { ButtonHTMLAttributes } from 'react';

import { cn } from '@/lib/cn';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'icon';
};

const variants = {
  primary: 'bg-zinc-950 text-white hover:bg-zinc-800',
  secondary: 'border border-zinc-200 bg-white text-zinc-900 hover:bg-zinc-50',
  danger: 'border border-red-200 bg-red-50 text-red-700 hover:bg-red-100',
  ghost: 'text-zinc-700 hover:bg-zinc-100',
};

const sizes = {
  sm: 'h-9 px-3 text-sm',
  md: 'h-10 px-4 text-sm',
  icon: 'size-9 p-0',
};

export function Button({ className, variant = 'secondary', size = 'md', ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-md font-medium outline-none transition focus-visible:ring-2 focus-visible:ring-zinc-950 disabled:cursor-not-allowed disabled:opacity-60',
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  );
}
```

Create `src/components/ui/input.tsx`:

```tsx
import type { InputHTMLAttributes } from 'react';

import { cn } from '@/lib/cn';

type InputProps = InputHTMLAttributes<HTMLInputElement>;

export function Input({ className, ...props }: InputProps) {
  return (
    <input
      className={cn(
        'h-11 w-full rounded-md border border-zinc-300 px-3 text-sm outline-none transition focus:border-zinc-950 focus-visible:ring-2 focus-visible:ring-zinc-950 disabled:cursor-not-allowed disabled:opacity-60',
        className,
      )}
      {...props}
    />
  );
}
```

Create `src/components/ui/field-option.tsx`:

```tsx
import type { LabelHTMLAttributes, ReactNode } from 'react';

import { cn } from '@/lib/cn';

type FieldOptionProps = LabelHTMLAttributes<HTMLLabelElement> & {
  control: ReactNode;
};

export function FieldOption({ className, control, children, ...props }: FieldOptionProps) {
  return (
    <label className={cn('flex h-10 items-center gap-2 rounded-md border border-zinc-200 px-3 text-sm text-zinc-800', className)} {...props}>
      {control}
      {children}
    </label>
  );
}
```

- [ ] **Step 2: Replace raw buttons and inputs**

Replace repeated raw class strings in `get-started-client.tsx` and `lessons-client.tsx` with `Button`, `Input`, and `FieldOption`.

Controls to replace:

```txt
YouTube URL input
Fetch Transcript button
target language radios
CEFR checkboxes
Create Local Task button
Save as PDF action
Import to Notion action
disabled Google Drive action
```

- [ ] **Step 3: Preserve accessibility**

Verify every primitive still has:

```txt
labels for form controls
aria-label for icon-only buttons
aria-expanded and aria-haspopup for menus
disabled states for pending/unavailable actions
keyboard focus styles
```

- [ ] **Step 4: Verify**

Run:

```bash
pnpm lint
```

Expected:

```txt
lint passes
```

### Task 6: Final UI and Regression Verification

**Files:**
- Verify: all files modified by Tasks 1-5

- [ ] **Step 1: Create or place a sample generated MDX lesson**

Create a local ignored file manually:

```txt
.local/lessons/2026-06-27-sample.mdx
```

Use this content:

```mdx
<YouTubeEmbed videoId="jNQXAC9IVRw" title="Sample Video" />

# 範例課程

## 中繼資料

| 欄位 | 內容 |
| --- | --- |
| 影片 | Sample Video |
| 等級 | A2, B1 |

## 逐句翻譯

- Hello world. - 哈囉，世界。

## A2 詞彙

| 詞彙 | 說明 |
| --- | --- |
| hello | 問候語 |

## B1 文法

這裡放文法說明。
```

- [ ] **Step 2: Run full local checks**

Run:

```bash
pnpm test
pnpm lint
pnpm build
```

Expected:

```txt
tests pass
lint passes
production build completes
```

- [ ] **Step 3: Browser-check the main flow**

Run:

```bash
pnpm dev
```

Review:

```txt
http://localhost:3000/get-started
http://localhost:3000/lessons
http://localhost:3000/lessons/2026-06-27-sample
```

Expected:

```txt
Get Started copy says MDX lesson
task result path ends in .mdx
lessons sidebar includes Get Started and Generated Lessons
sample lesson renders the YouTube iframe first
sample lesson table renders as a table, not plain pipe text
right-side On this page includes the lesson headings
Chinese sample headings and labels are preserved
print action opens browser print
Notion action still reports configured success or missing-config error
```

- [ ] **Step 4: Remove manual sample if it is not needed locally**

Because `.local` is gitignored, this is a local cleanup only:

```bash
rm .local/lessons/2026-06-27-sample.mdx
```

- [ ] **Step 5: Run typecheck as the final gate**

Run this only after Tasks 1-5 and all preceding Task 6 verification steps are complete:

```bash
pnpm types:check
```

Expected:

```txt
typecheck completes without TypeScript errors
```

## Self-Review

- Spec coverage: Tasks cover shadcn/base-ui primitives, Fumadocs docs layout/sidebar, Get Started and Generated Lessons navigation, `.mdx` output, table rendering, lesson ToC, YouTube embed header, and target-language generation instructions.
- TDD exclusion: The plan intentionally does not use failing-test-first workflow. Existing tests are updated after contract changes, and verification is performed after direct implementation.
- Verification order: Typecheck runs once as the final gate after all implementation and UI verification tasks are complete.
- Placeholder scan: no placeholder steps remain.
- Type consistency: The contract uses `.mdx`, `format: "mdx"`, `YouTubeEmbed`, `extractLessonToc`, and Fumadocs `DocsLayout` consistently.
