# MW.5e — Create a Markdown file from the breadcrumb <a id="MW.5e"></a>

[Workspaces TODO](TODO.md#MW.5e) · [Markdown editor](README.md#full-markdown-editor)

- Add a **New Markdown file** icon beside the folder's V1/V2 actions on the document breadcrumb.
  Reveal it in the same area on hover and keyboard focus, with a usable touch entry. Use the
  containing folder, or the project root for a document at the top level.
- Clicking the icon asks for a filename and shows the destination folder. Default to `.md` for a
  name without a Markdown suffix. Cancel returns focus and creates nothing. Successful creation
  opens the new file in the dedicated editor in the current tab.
- Use a document-write route with same-origin, admission, Viewer, root and Team write checks.
  Resolve the existing directory and validate the filename in the registry. Create the empty
  Markdown file exclusively within that directory. Preserve existing files on collisions,
  including concurrent creates. Enforce the existing path, visibility and Team project boundaries.
  Keep the entered filename available to correct on error.

## Acceptance

- [ ] Create from a nested breadcrumb and a root breadcrumb, verify the editor and save a first
  edit. Check keyboard focus, touch, cancel, invalid name, collision and a server refusal.
- [ ] Cover input validation, exclusive creation, stale authorization and the Personal/Team jail
  boundaries with focused tests. Run the combined test/type gate and bounded browser checks.
- [ ] Obtain independent review on the exact revision, integrate and record evidence.
