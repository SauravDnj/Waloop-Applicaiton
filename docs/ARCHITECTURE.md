# Inbox And Campaigns: architecture

A WhatsApp Business inbox and CRM on Expo (React Native 0.88, Expo SDK 58, Expo Router), for Android, iPhone and the web.

## The two SDKs and how they are used

| Concern | Package | How we use it |
| --- | --- | --- |
| Login, signup, 2FA, account picker, `/me`, the team list for chat transfer | `@ab-ecosystem/sso` | **Types only.** The package ships React DOM screens and exports no plain `login`/`signup` functions, so it cannot render in React Native. `src/services/sso/client.ts` is a thin fetch client against the same `/api/v1/projects/:projectId/...` endpoints. Its TypeScript types are imported with `import type`, which erases at build time. |
| Contacts, custom fields, tags, segments, notes, quick replies, channels, templates, campaigns, notifications, inbox | `@ab-ecosystem/cpaas` | **Used directly.** Two polyfills load first (`src/polyfills.ts`): `react-native-url-polyfill` and an `AbortSignal.timeout` shim. `origin` is set explicitly because React Native sends no `origin` header. The token is a resolver function reading the accounts store, so account switches never rebuild the client. |

## What the app creates on the workspace: nothing

The app provisions no custom fields, data stores, collections or cloud settings. Signing in only reads the workspace. Everything shown is what CPaaS already has:

| In the app | On CPaaS |
| --- | --- |
| A contact | A contact: `name`, `profile.whatsapp.identifier` (phone), `tags`, `custom_field_hash` |
| Contact fields (form, details, filters, import mapping, template variables) | The workspace's custom fields, by slug, rendered by `dataType` |
| Chips on contact and chat rows | Fields with `showAsLabel` |
| Boards | Dropdown fields with `isBoard`; each option is a column |
| Notes | Contact notes (`crm.contactNotes`) |
| Saved filters | Segments |
| Campaigns | Campaigns, audiences and campaign messages |

Users can still add, rename and delete their own fields, edit dropdown options, and mark a dropdown as a board, from Settings → Fields. Those are ordinary CPaaS custom-field writes the user makes; the app never adds fields on its own.

## Filters

`src/lib/filters.ts` turns the UI's choices (segment, tags, any dropdown field's values, created within N days) into the CPaaS contact-filter DSL. The DSL is flat with `and` binding tighter than `or`, so multi-value picks are distributed into `or`-separated runs; above the 50-condition limit a field narrows to its first value and is reported in `collapsed`. `resolveCondition` (in `src/services/crm/segments.ts`) copies a chosen segment's rules into one condition list for places that cannot reference a segment.

## Inbox

`src/services/inbox/manager.ts` keeps one live socket per signed-in account (`EXPO_PUBLIC_INBOX_URL`), across account switches, and reconnects on foreground and when the network returns. Sends go through `src/services/inbox/send.ts`, which shows a local bubble at once and replaces it with the stored message. Push (FCM) is registered with `crm.notifications` after sign-in; tapping a push opens that chat in its own account.

## Permissions

Team members, roles and invites are managed outside the app. The app reads the member's role from `/me` and, when the account enforces permissions, hides what the role lacks (`useCan(P.contacts.delete)` and so on, keys in `src/lib/permissions.ts`). The server refuses regardless.

## App structure

```
src/app                      Expo Router routes
  (auth)/access|login|otp|accounts|signup|forgot
  (app)/(tabs)/inbox|contacts|board|more        (_layout.web.tsx = sidebar shell for the browser)
  (app)/chat/[id] · lead/[id] · lead/new · board/[slug] · campaigns/* · channels/* · whatsapp/send|template-new
  (app)/import · search · trash · settings/profile|accounts|fields|tags|quick-replies|language|notifications|about
src/components/ui            design system (tokens in src/theme)
src/services/crm             client, fields, leads (contacts), notes, segments, channels, whatsapp (templates), campaigns, importLeads
src/services/inbox           socket manager, send, media, store
src/stores                   auth, accounts, settings, whatsapp (default channel), contactPanel
src/hooks/queries.ts         React Query hooks + cache keys
```

## Internationalisation and RTL

`src/i18n/index.ts` initialises i18next with bundled resources for 17 languages. The device locale is picked on first launch; Settings → Language persists the choice. Arabic and Urdu are RTL: `applyLanguage()` flips `I18nManager` on native (needs a reload) and `document.dir` on web. A Jest test asserts every locale has exactly the English key set.

## Captcha

The SSO `auth-config` names the provider (`recaptcha` v2/v3 or `hcaptcha`) and site key. `src/components/captcha/` renders it: on native a WebView loads a small page with `baseUrl = EXPO_PUBLIC_APP_ORIGIN` so the key's domain check passes; on web the provider script is injected directly.
