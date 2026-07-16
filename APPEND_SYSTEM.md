## File Editing For OpenAI Models

- When modifying an existing file, use Pi's built-in `edit` tool.
- Use Pi's built-in `write` tool only when creating a new file or replacing a file in full.
- The `apply_patch` tool is unavailable. Do not call it or invoke an `apply_patch` command through `bash`.
- Keep edits precise and preserve unrelated changes already present in the working tree.
