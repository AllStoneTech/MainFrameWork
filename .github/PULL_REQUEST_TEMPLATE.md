## What does this change, and why?

## How was this tested?

(This project has no automated test suite yet — most changes are verified
against real hardware, or via `npm run dev` for UI-only changes. Say which.)

## Checklist

- [ ] `npm run build` (in `MainFrame/`) passes
- [ ] `cargo build` (in `MainFrame/src-tauri/`) passes
- [ ] If this touches an unconfirmed hardware protocol detail, I've said so
      in a comment rather than presenting a guess as fact (see
      [CONTRIBUTING.md](../CONTRIBUTING.md#hardware-claims--be-honest-about-whats-confirmed))
- [ ] If this touches `persistence.rs`, the CSP, or anything affecting the
      app's local-only/zero-network posture, I've called it out below and
      read [SECURITY.md](../SECURITY.md)
