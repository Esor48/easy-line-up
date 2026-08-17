# Privacy & Analytics

This app can send anonymous, aggregate usage statistics to help the
developer understand how many people use it and where — useful for
improving the app and for demonstrating reach to advertisers/sponsors.

**How you decide:** if you installed via the Windows installer, you already
saw this notice and agreed to it as part of Setup - no separate in-app
prompt appears. If you got the app another way (dev mode, a non-Windows
build, etc.), a short one-time screen appears on first launch instead, with
Agree / No Thanks buttons. Either way, your choice is permanent and there's
no ongoing checkbox to manage.

## What is collected

| Data | How | Notes |
|---|---|---|
| App installed | One-time event on first launch ever | Detected locally, not tied to your Steam/CS2 account |
| App opened / closed | Each time you start/quit the app | Used to calculate session duration |
| Session duration | Calculated from open → close timestamps | |
| Anonymous install ID | A random ID generated on first launch, stored only on your device | Not your name, email, Steam ID, or any other personal identifier |
| Country | Derived server-side by the analytics provider (PostHog) from your IP address at the moment of the request | We never see or store your raw IP address ourselves |
| Language | Your OS's locale setting (e.g. `en-US`) | Not your typed/spoken language, just a system setting |
| App version, OS platform | Standard app diagnostics | |

## What is NOT collected

- Your name, email, Steam ID, or CS2 in-game identity
- Your IP address (the analytics provider discards it after deriving country)
- Anything about your gameplay, aim, position, or in-match behavior
- Any of your lineup content, notes, or images
- Anything typed into the app

## Where it goes

Events are sent to [PostHog](https://posthog.com), a third-party analytics
service, over HTTPS. Their own privacy policy governs how they handle data
in transit and at rest: https://posthog.com/privacy

## Your responsibility if you distribute this app

If you're releasing this app publicly (especially in the EU under GDPR, or
California under CCPA), you are the data controller and should:

- Make this disclosure easy to find (e.g. link it from your download page).
- Consider defaulting analytics to **off** for EU users, or showing a clear
  consent prompt on first launch, rather than relying on opt-out alone.
- Publish your own privacy policy / contact information if you plan to
  monetize with ads, since ad networks typically require one.

This file is a technical description of what the code does, not legal
advice — consult a professional if you're distributing this at scale.
