---
name: generating-lesson
description: Use when a prompt explicitly requests lesson MDX from a video transcript, target language, and CEFR levels.
---

# Generate a language lesson

## Workflow

1. Read [the lesson contract](references/lesson-contract.md) fully.
2. Read [the canonical example lesson](references/example-lesson.mdx) fully before drafting.
3. Follow the contract structure exactly. Do not substitute a generic lesson format, merge CEFR sections, use an iframe, or add frontmatter.
4. Use supplied video metadata only for the embed, title, and lesson-information fields. Derive teaching content only from the supplied transcript and settings.
5. Honor the target language and every requested CEFR level. For `zh`, write Traditional Chinese, never Simplified Chinese.
6. Before returning, verify the exact `YouTubeEmbed` casing, H2 order, required tables, grammar H3 subsections, spoken-usage H3 subsections, and complete sentence-by-sentence translation.
7. Return only the final MDX without an introduction, explanation, or code fence. Do not browse, execute commands, or edit files.

## Common mistakes

- Never replace `YouTubeEmbed` with frontmatter, `iframe`, or differently cased JSX.
- Never merge per-level vocabulary or grammar sections.
- Never interpret `zh` as Simplified Chinese.
