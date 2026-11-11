# Inbox And Campaigns: design system and screen plan

## Principles

1. **One primary action per screen.** Every screen answers "what does the user do next?" with one obvious, thumb-reachable control (Reply, Send campaign, Save).
2. **Inbox first.** The app opens on the shared WhatsApp inbox; a contact's chat is one tap from any list row.
3. **Show what matters, not data.** Rows show name, label chips and the one most useful line (last message, number). Everything else is one tap away.
4. **Calm surfaces, brand moments.** Neutral canvas and white cards for work; the indigo gradient only for headers and hero cards.
5. **Forgiving.** Destructive actions confirm, saves show progress, empty states teach the next step, errors say what to do.
6. **Thumb zone.** Primary buttons sit at the bottom; headers hold navigation and low-frequency actions.

## Foundations

| Token | Value |
| --- | --- |
| Brand gradient | `#2E1FB8 → #6D5BFF` (hero headers, app icon, primary hero cards) |
| Primary | `#4F3FE0` light / `#8B83FF` dark |
| Canvas | `#F4F5FA` light / `#0B0B14` dark |
| Radius | 12 / 16 / 22 / 28 (inputs / cards / sheets / heroes) |
| Type | Display 34/800, H1 28/800, H2 20/700, Body 15, Caption 13, Micro 11 |
| Spacing | 4-pt grid; screen gutter 16; card padding 16 |
| Option colours | Each dropdown option gets a steady colour from the palette (primary, accent, success, warning, danger, teal), hashed from its text |

## Components

- **Hero** — gradient header with title, subtitle, round glass buttons, optional content that overlaps the bottom edge.
- **FloatingTabBar** — Inbox · Contacts · Boards · Campaigns · More, flat bar with an unread badge on Inbox.
- **ListRow** — avatar, title, one meta line, label chips, trailing slot (WhatsApp button / chevron / time).
- **StatTile** — big number + label + icon, used in grids of 2 or 4.
- **SectionHeader** — small caps label with optional action.
- **SearchField** — filled, rounded, with clear button.
- **Tabs** — horizontal scrollable text tabs with count badges and an underline indicator.
- **Sheet** — bottom sheet with grabber, title, pinned footer.
- **EmptyState** — gradient icon disc, one-line title, one-line body, one action.
- **Button** — pill-shaped; primary (gradient), secondary (tinted), ghost, danger.

## Screens

| Screen | Layout |
| --- | --- |
| Login / Signup / Forgot / OTP | Gradient top third with the Inbox And Campaigns logo (chat bubble + megaphone badge); form in a white card that rises over it; single full-width primary button; captcha inside the card. |
| Account picker | Hero + list of workspace rows (initial avatar, role, current tick). |
| **Inbox (home)** | Hero with live status and search; view chips (All, Unread, Mine, Open, Archived) and filter buttons in one sideways row; chat rows with label chips and unread badges. Long-press to multi-select. |
| Chat | WhatsApp-style thread, composer with media, voice notes, quick replies and templates; ⋯ menu for transfer, tags, bot, automation, archive, block. |
| **Contacts** | Hero with title + count, search overlapping. Tabs by the first board's options. Rows: avatar, name, number, label chips and tags, WhatsApp button. |
| Contact detail | Gradient hero: avatar, name, number (tap to copy), one chip per board (tap to move), WhatsApp and Send template buttons. Tabs: Details (every field with a value) and Notes. |
| Contact form | Name, phone, tags, then an input for every workspace field by its type, with pinned Save. |
| **Boards** | List of board fields; a board is horizontal columns per option with cards that move between columns. |
| **Campaigns** | List with state pills; new campaign: channel, template, variables, audience, send now / schedule / draft. |
| **More** | Profile hero card. Grouped list (Accounts, Contact data, WhatsApp, Preferences, Workspace) with coloured icon squares. |
| Import | Choose file → map columns to name, phone and workspace fields → tag → import with progress. |
| Settings pages | Consistent grouped-list pages using the same row component. |
