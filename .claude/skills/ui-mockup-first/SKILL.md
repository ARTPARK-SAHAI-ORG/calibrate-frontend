---
name: ui-mockup-first
description: Before writing any code for a feature or change that adds or changes anything on screen in the Calibrate frontend, build a clickable design mockup (a Claude Design artifact) that matches the real app, share it, and iterate on it until the user approves. Use for every feature request with a UI change, including new pages, new buttons, changed copy, new filters, new settings and new states. Skip only for changes nobody sees (backend-only, tests, refactors with no visual change).
---

# Mockup first, code second

Any request that changes what someone sees in the app gets a design mockup
before any code. The user reviews it, asks for changes, and approves it. Only
then does building start. Writing code while the screens are still being
decided wastes the code, so no branch, commit or push for the UI part until
the user says the mockup is approved ("build it", "go ahead"). Backend or
library work the design does not affect may start earlier only if the user
says so.

## 1. Read the real screens before drawing anything

The mockup has to look exactly like the app, or the feedback is about the
wrong thing. For every screen the change touches:

- Open the real component in `src/` and copy its layout, sizes, colours,
  font sizes, spacing, borders, button styles and copy. Do not draw from
  memory. Examples that went wrong when drawn from memory: the Copy link
  button colour (it is amber in `ShareButton`), the selection bar above the
  traces table (`TracesTabContent`), the evaluator verdict card
  (`EvaluatorVerdictCard`), and the workspace settings General tab.
- Reuse what exists. A share toggle is the existing `ShareButton` look, a
  verdict is the existing verdict card, a setting is the existing card style
  on that tab. Never invent a new design for something the app already has.
- Buttons next to each other each keep their own colour. Check every button
  near a new one and pick a colour none of them uses.
- Follow `.cursor/rules/design.md` and the "Writing UI copy" rules in
  `CLAUDE.md` for every word on screen.

## 2. Build it as a Claude Design artifact

Use the Artifact tool's Design type (`action: "quickstart"`, `intent:
"design"`), then lay the screens out on its canvas.

- **One screen per state.** Never put two states side by side on one screen
  with explanation boxes. Each state of each page is its own screen: empty,
  typing, waiting, the result, every error, hover text shown, a dialog open.
- **Flows in click order.** One row per flow, left to right in the order
  someone clicks through it, with a row title saying what the flow is. Each
  screen's title says what was clicked to get there ("After clicking Share").
- **Clickable.** Link the button that moves the flow on to the next screen so
  the user can press Play and click through.
- **Monitoring and list pages start plain.** The first screen of a list is
  the list with nothing filtered or open, then the filter, the result, and so
  on.
- Show hover text as it would appear when hovered, on its own screen if it
  matters.
- Put shared pieces (the agent page, the chat page, a settings tab) in
  building-block files on a separate page of the canvas, and make each screen
  import one with the state it shows. A change to the shared piece then
  updates every screen.
- Use real-looking example content from the product's domain, never lorem
  ipsum.
- No questions on the canvas: no sticky notes of open questions, no notes
  asking for decisions. The mockup shows screens only. Decide anything with
  an obvious answer yourself, and ask the few real questions in chat.

## 3. Share it and iterate

- Give the user the link and say it is private until they share it from the
  page's Share menu.
- When the user points at something, change exactly that, then check whether
  the same thing appears on other screens and change it there too (renamed
  labels, wording, colours). List anything similar you did not change and ask.
- Answer questions about how a state works plainly. If a question shows the
  design is missing a state, add the screen.
- Keep a running list of decisions that change the build plan (field names,
  backend behaviour, limits), and repeat them when building starts.

## 4. Build only after approval

When the user approves, build from the mockup: every screen in it is part of
the scope, and the code must match it. Point each building session or agent at
the mockup link and the list of decisions.
