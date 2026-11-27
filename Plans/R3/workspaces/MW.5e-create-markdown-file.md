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

- [x] Create from a nested breadcrumb and a root breadcrumb, verify the editor and save a first
  edit. Check keyboard focus, touch, cancel, invalid name, collision and a server refusal.
- [x] Cover input validation, exclusive creation, stale authorization and the Personal/Team jail
  boundaries with focused tests. Run the combined test/type gate and bounded browser checks.
- [x] Obtain independent review on the exact revision, integrate and record evidence.

## Result

- ✅ Integrated on `main` at `bbcee7c`: W1 server `eb1467d`, `9245659`, `1932704`; W2 UI `38eb13c`, `2faf648`, `75568c4`.
- ✅ Independent review PASS bound to `d692ece` and to `bbcee7c` (revocation-while-open fix); combined gate 1754/0 + tsc.
- ✅ Real-server scratch browser 30/30 (nested/root create + first save, 400/409/403, live revocation, 390 dark, `e`/`x`); W1 mutations 7 killed.
- ⚪ Team-without-write icon hiding verified by code and `serve()` tests, not in a browser. Residual create races are recorded in [README](../../README.md).
