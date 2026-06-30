# Domain Context

## Story

A story is reusable source material for one YouTube video. Its stable identity is the
YouTube video ID. It contains video metadata and one fetched transcript. Fetching the
same video again reuses the existing story instead of creating a duplicate or fetching
another transcript.

A story never stores user generation selections.

## Task

A task is one immutable request to generate a lesson from a story. It contains:

- the story ID;
- selected CEFR levels;
- the target translation language; and
- the model-performance preset.

A task owns one generation outcome. A successful task owns a lesson JSON file. A failed
task owns its error JSON or diagnostic files.

Regenerating either a successful or failed task creates a new task with copied
selections. The original task and its outcome remain unchanged.

Deleting a successful task removes its task JSON and generated lesson JSON. Deleting a
failed task removes its task JSON and all associated error or diagnostic files. Deleting
a task never deletes its story, so the story remains available for new tasks.
