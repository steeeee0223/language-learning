# JSON Lesson Content Design

## Goal

Replace agent-authored lesson MDX with schema-validated JSON and render lessons through application-owned React components. Generation must produce a usable lesson even when the model returns invalid or incomplete content.

## Motivation

Generated MDX varies in node order, heading names, JSX attributes, and section structure. The current validator rejects otherwise useful lessons when those presentation details differ from the contract. Presentation is deterministic application behavior and should not be delegated to the model.

The new boundary is:

- The model generates structured pedagogical data.
- Zod parses, validates, normalizes, and repairs that data.
- React owns all lesson presentation.

## Lesson schema

The application exports one Zod schema as the source of truth for runtime parsing and the inferred `LessonContent` TypeScript type.

```ts
type LessonContent = {
  schemaVersion: 1
  video: {
    id: string
    title: string
    translatedTitle: string
  }
  lesson: {
    targetLanguage: 'en' | 'zh'
    cefrLevels: CefrLevel[]
    transcriptSource: string
    focus: string
  }
  transcripts: Array<{
    time: string
    source: string
    translation: string
  }>
  vocabs: Partial<Record<CefrLevel, Array<{
    source: string
    translation: string
    usage: string
  }>>>
  grammars: Partial<Record<CefrLevel, Array<{
    title: string
    explanation: string
    examples: Array<{
      source: string
      translation: string
    }>
  }>>>
  spokenUsage: Array<{
    title: string
    explanation: string
    examples: Array<{
      source: string
      translation: string
    }>
  }>
}
```

Objects use Zod object schemas that strip unknown properties. Collection members use field-level catches so a malformed entry or section does not invalidate unrelated content. The top-level parse also has a catch that returns a complete fallback lesson.

Zod is responsible for definition, validation, parsing, unknown-key stripping, fallback behavior, and TypeScript inference. There will be no parallel handwritten content validator.

## Trusted task normalization

Generation parsing is task-aware. The task is the trusted source for:

- video ID and original title;
- target language;
- requested CEFR levels in canonical order;
- transcript source;
- original transcript segments and timestamps.

Agent values for these fields are overwritten after parsing. A missing translated title falls back to the original title. A missing transcript translation falls back to its source text. Missing pedagogical sections become empty collections and render a localized no-content state.

Malformed JSON is caught before Zod receives it and is converted to the same task-derived fallback object. Therefore invalid lesson content is normalized rather than classified as a generation failure.

## Generation and persistence

The generation flow becomes:

1. Build a prompt that requests one JSON object matching the lesson contract.
2. Receive the model's raw response.
3. Parse JSON, catching JSON syntax errors.
4. Parse and normalize through the Zod schema and task-derived fallback.
5. Apply trusted task fields.
6. Serialize the normalized content as indented JSON with a trailing newline.
7. Atomically create `.local/lessons/<slug>.json` without overwriting an existing lesson.

Task metadata changes its output format and path from `mdx`/`.mdx` to `json`/`.json`. Generation responses return the JSON lesson path. Diagnostic attempts save the raw model response as `generated.json`.

Content-shape errors no longer fail generation. Runtime, authentication, model availability, usage limit, timeout, concurrency, and filesystem errors retain their existing failure behavior.

## Rendering

`readLesson` discovers and reads only `.json` files. Markdown and MDX are not legacy fallbacks. It parses stored files with the exported lesson schema and returns typed content.

`<Lesson content={lesson.content} />` owns:

- the YouTube embed;
- translated lesson title and lesson information;
- the sentence-by-sentence translation table;
- vocabulary and grammar sections for each requested CEFR level in canonical order;
- spoken-usage sections;
- localized headings and empty-state messages.

The lesson page no longer compiles model-generated MDX. Its table of contents is derived from structured content. React escaping handles generated strings as text, so generated content cannot introduce executable JSX or HTML.

Lesson listing reads the translated title from JSON. Notion export converts `LessonContent` to deterministic plain text instead of slicing Markdown source.

## Migration

This is a hard cutover, not a compatibility layer.

- Convert every current `.local/lessons/*.md` and `.local/lessons/*.mdx` example to the new JSON representation.
- Replace the skill's canonical `example-lesson.mdx` with `example-lesson.json`.
- Remove MD/MDX lesson discovery and rendering support.
- Remove the generated-MDX validator, compiler options, fixtures, and code that exists only for generated lesson MDX.
- Keep unrelated documentation MDX support unchanged.

The generating-lesson skill and runtime prompt must require JSON only, without Markdown, an outer code fence, commands, browsing, or file edits. The skill contract describes semantic content requirements rather than presentation syntax.

## Testing

Active tests cover:

- valid Zod parsing and inferred content shape;
- unknown-key stripping;
- field-level and whole-document fallbacks;
- malformed raw JSON fallback;
- task-derived trusted-field overrides;
- CEFR-keyed vocabulary and grammar records;
- generation succeeding with invalid or partially malformed content;
- JSON serialization and atomic no-overwrite persistence;
- symlink and path traversal protections;
- JSON-only lesson discovery and reading;
- `.json` diagnostic output paths and contents.

Rendering tests are added only as skipped `it.skip(...)` suites. They document intended canonical ordering, localization, fallback states, and safe text rendering without becoming active coverage in this change.

No skill or prompt tests are added. Existing MDX-specific skill/prompt assertions are removed or adjusted only where required to keep the test suite valid.

## Non-goals

- Supporting old lesson Markdown or MDX at runtime.
- Preserving arbitrary Markdown formatting inside generated fields.
- Building a generic document block AST.
- Adding rich-text editing.
- Changing the transcript ingestion workflow.
- Changing documentation MDX or Fumadocs content outside generated lessons.
