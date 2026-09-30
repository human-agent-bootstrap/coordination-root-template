# Orchestration UI design contract

## 0. Research log

- Repository workflow: `RUNBOOK.md`, `AGENTS.md`, `change-create.mjs`, `bootstrap.mjs`, and
  `verify-registry.mjs` define the product vocabulary and approval boundaries.
- Interaction references: Jira contributes issue/subtask familiarity; Notion contributes a
  calm document-first meeting surface. No third-party visual assets or brand styling are used.
- Direction reference: OMH frontend taste foundations and design-system contract were reviewed
  before component work.

## 1. Atmosphere and identity

- Direction: operational.
- Qualities: calm, explicit, trustworthy.
- Audience: Korean-speaking coordinators facilitating multi-repository planning meetings.
- Signature element: a persistent meeting progress rail that translates governance into plain
  Korean stages and shows the single next decision.
- Avoid: dashboard card grids, decorative gradients, glass effects, oversized marketing copy,
  and status badges that confuse local validation with human approval.

## 2. Color

- `--canvas`: `#F4F5F7`
- `--surface`: `#FFFFFF`
- `--surface-subtle`: `#EEF1F4`
- `--ink`: `#18212B`
- `--ink-muted`: `#5C6977`
- `--border`: `#CBD2DA`
- `--accent`: `#176B5B`; reserve for the current step and primary action.
- `--accent-soft`: `#DCEFEA`
- `--success`: `#16734A`
- `--warning`: `#9A5A00`
- `--danger`: `#B42318`
- `--focus`: `#1C64F2`
- Surfaces follow a 60/30/10 proportion. Text and controls target WCAG AA contrast.

## 3. Typography

- Stack: `-apple-system, BlinkMacSystemFont, "Segoe UI", "Apple SD Gothic Neo", "Noto Sans KR", sans-serif`.
- Scale: 14px caption, 16px body, 20px section title, 28px page title.
- Korean body text never renders below 14px; body line-height is 1.6.
- Use `word-break: keep-all` for prose and `overflow-wrap: anywhere` for identifiers.

## 4. Spacing and layout

- Base unit: 4px; scale: 4, 8, 12, 16, 24, 32, 48.
- Maximum content width: 1280px.
- Desktop: 260px progress rail plus one flexible decision/document pane.
- Tablet/mobile: progress becomes a horizontal step strip above the content; the document pane
  owns vertical scrolling.
- Controls retain stable dimensions between default, loading, and error states.

## 5. Components

- Buttons: primary, secondary, and quiet; all include hover, focus-visible, active, disabled,
  and loading states.
- Fields: label, optional guidance, control, and reserved error region.
- Step rail: complete, current, pending, and blocked states; no decorative icons.
- Work Unit rows: compact summary first, technical fields in an explicit details disclosure.
- Review list: ready, needs attention, and blocking groups with links back to the field.
- File preview: accessible tabs and a monospace preformatted panel.
- Empty states state the next action rather than using placeholder decoration.

## 6. Motion and interaction

- Durations: 120ms control feedback, 180ms panel transitions; ease-out only.
- Motion communicates step or validation state changes and is disabled with
  `prefers-reduced-motion: reduce`.
- Validation never runs silently after a changed input; the prior result becomes visibly stale.

## 7. Depth and surface

- Flat surfaces with 1px borders. Only the sticky action bar receives a subtle shadow to show
  that it overlays scrolling content. No blanket card shadows or blur.

## 8. Accessibility constraints and accepted debt

- Native form controls and landmarks; explicit labels, fieldsets, live validation summary,
  keyboard-reachable step navigation, and visible focus rings.
- Status is communicated by text as well as color.
- The MVP does not claim screen-reader or WCAG conformance until browser and assistive-technology
  evidence is recorded; keyboard and semantic behavior remain required implementation targets.
