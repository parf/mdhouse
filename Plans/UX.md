# UX Golden Set

## Core laws

| Law | Rule | Apply as |
|---|---|---|
| **Jakob** | Users expect your app to work like the apps they already use | Use standard patterns. Don't reinvent tables, search, or nav. |
| **Hick** | Decision time grows with the number of options | ≤7 primary actions per view. Push the rest into menus or progressive disclosure. |
| **Fitts** | Big, close targets are faster to hit | Primary CTA is large and near the cursor. Touch targets ≥44px. |
| **Doherty** | Users stay engaged when the system answers in <400ms | Optimistic UI, skeletons, instant local filtering. |
| **Tesler** | Complexity can't be removed, only moved | The system absorbs it through defaults, inference and autofill, not the user. |
| **Miller** | Working memory holds about 4–7 chunks | Chunk numbers (`$12.4M`, not `12400000`) and group fields. |
| **Peak-End** | Users judge an experience by its peak and its end | Polish success states and the completion moment. |
| **Postel** | Be liberal in what you accept | Parse `12m`, `12,000,000` and `$12M` as the same value. |

## Heuristics (Nielsen, condensed)

1. **Visible status.** Every action gets feedback within 100ms.
2. **Speak the user's language.** Use domain terms (NOI, cap rate), not DB column names.
3. **Undo over confirm.** Support undo where possible. Destructive actions always require confirmation.
4. **Consistency.** Same thing, same name, same place, same color.
5. **Prevent errors.** Constrain inputs and disable invalid actions, with a tooltip saying why.
6. **Recognition over recall.** Show recent items, saved filters and inline hints.
7. **Accelerators.** Keyboard shortcuts, ⌘K palette, bulk actions.
8. **Minimalism.** Every element earns its pixels. Data-ink ratio counts.
9. **Error messages.** Say what happened, why, and how to fix it. No codes alone.
10. **Help in context.** Put it at the point of need, not in a docs page.

## Practical rules

| Area | Rule |
|---|---|
| Hierarchy | Each screen has one primary action, visually dominant. |
| Spacing | Use a 4/8px grid. Proximity means relatedness. |
| Type | Use at most 2 families and 5–6 sizes. Body text ≥14px. Numbers in tabular figures. |
| Tables | Right-align numbers, left-align text. Sticky header. Sortable. Density toggle. |
| Forms | One column, label above field, inline validation on blur. Mark optional fields, not required ones. |
| Empty states | Explain why it's empty and give the next action. |
| Loading | Under 1s, show nothing. 1–3s, show a skeleton. Over 3s, show progress plus a way to cancel. |
| Destructive actions | Ideally hide behind an expandable "Danger zone", shown only when clicked. Always require confirmation. Red, never the default button, need an explicit verb ("Delete 12 deals"), and support undo where possible. |
| Multiple options | Always use expand-like elements when several options are available. |
| State | URL reflects filters and view, so every view is shareable and bookmarkable. |

## Color coding

| Role | Meaning | Light | Dark | Use for |
|---|---|---|---|---|
| **Primary** | Brand / main action | `#2563EB` blue-600 | `#3B82F6` | Primary CTA, links, active nav, focus ring |
| **Neutral** | Structure | `#0F172A`→`#F8FAFC` slate scale | inverted | Text, borders, surfaces, secondary buttons |
| **Success** | Done / positive | `#16A34A` green-600 | `#22C55E` | Saved, completed, positive delta |
| **Warning** | Needs attention | `#D97706` amber-600 | `#F59E0B` | Stale data, approaching limits, pending |
| **Danger** | Error / destructive | `#DC2626` red-600 | `#EF4444` | Validation errors, delete, failed, negative delta |
| **Info** | Neutral notice | `#0891B2` cyan-600 | `#06B6D4` | Tips, system notices, "new" |
| **Disabled** | Unavailable | slate-400 at 50% opacity | slate-600 | Inactive controls (keep a tooltip explaining why) |
| **Selection** | Current focus | primary at 10% fill | primary at 20% | Selected rows, hover |

### Color rules

- **Never use color alone.** Pair it with an icon, text or shape (▲▼, ✓, ⚠). About 8% of men are color-blind.
- **Contrast.** Text needs ≥4.5:1, large text and UI elements ≥3:1 (WCAG AA).
- **Semantic colors are reserved.** Red means danger only, never decoration.
- **One accent.** Primary blue marks interactivity. If it's blue, it's clickable.
- **Use 60/30/10.** That's 60% neutral surface, 30% secondary, 10% accent.
- **Deltas follow context.** For cap rate or vacancy, up is bad, so invert the green/red.
- **Data viz.** Use a categorical palette distinct from the semantic colors, sequential for magnitude, and diverging for deviation from a baseline.
- **Status badges.** Use a light tint background with dark text of the same hue, not saturated fills.

I can put this into a doc or a Design System artifact (tokens, components) for the Realmo team.
