# Design QA — Agent Bus voice entry

## Evidence

- Source visual truth path: conversation attachment `Image #1` (approved idle composer), with the
  earlier conversation attachment `Image #2` as the listening-state reference. The attachments
  are session-local and have no filesystem path.
- Implementation screenshot path: Chrome browser capture for tab `63702231`,
  `http://127.0.0.1:7790/mdhouse/README.md` (session-local browser evidence; no filesystem path).
- Viewport: 1585 × 1280 CSS px, device scale 1.
- Source dimensions: idle attachment 520 × 248 px; active reference 225 × 59 px, both presented at
  1× density in the conversation.
- Implementation dimensions: full capture 1585 × 1280 px; focused Agent Bus composer 440 CSS px
  wide, normalized at 1× density.
- States compared: idle, keyboard-focus tooltip, listening, cancel, accept.

## Findings

- No actionable P0/P1/P2 differences remain.
- Fonts and typography: existing mdhouse system font, 13 px textarea text, 11.5 px tooltip and
  monospace shortcut chip match the surrounding panel.
- Spacing and layout rhythm: MIC is inset 7 px at the textarea's lower-right; listening replaces
  the textarea and action grid with a 58 px strip, preserving the panel width and composer padding.
- Colors and visual tokens: all surfaces use existing mdhouse background, border, accent, danger,
  and success tokens in light mode.
- Image and icon fidelity: microphone, cancel, and accept use the existing mdhouse 16 px outline
  icon system; no raster assets are involved.
- Copy and content: `Voice input`, `Ctrl Shift Space`, cancel and accept labels match the approved
  prototype and expose full accessible names.

## Interaction and accessibility verification

- Chrome: MIC focus, tooltip, `Ctrl+Shift+Space` start, repeated shortcut accept, and `Esc` cancel
  verified in the production component on the scratch server.
- `aria-keyshortcuts="Control+Shift+Space"`, live status text, focus restoration, and reduced-motion
  handling verified.
- Browser console checked: no mdhouse errors or warnings. The only warnings came from an unrelated
  Chrome extension content script.
- TypeScript and the full 307-test suite pass.

## Comparison history

1. P2: the keyboard-focus tooltip did not paint reliably through `:focus-within` in the production
   panel. Fixed with a direct focus-visible sibling selector; the post-fix Chrome capture shows the
   tooltip above the MIC button.
2. P2: two artificially immediate shortcut events could both observe the pre-render state. Fixed by
   using the live recognition instance as the toggle authority; post-fix start and accept states were
   verified separately.

## Follow-up polish

- P3: test actual dictated text in Safari and Edge in addition to the Chrome interaction pass.

final result: passed
