# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Added
- Nothing yet.

### Changed
- Nothing yet.

### Deprecated
- Nothing yet.

### Removed
- Nothing yet.

### Fixed
- Nothing yet.

### Security
- Nothing yet.

---

## [0.0.10] - 2026-08-28

### Added
- Final UI polish for mobile
- Keyboard-aware input that stays above mobile keyboard
- Scroll-to-bottom button with smooth scrolling
- Safe-area-inset for notched phones
- Viewport-fit=cover for full screen usage
- Compact font sizes and spacing for mobile
- Reduced animation durations for faster feel

### Changed
- Condensed header and model selector for mobile
- Optimized touch targets for small screens

### Fixed
- UI no longer cramped on small screens
- Input bar now properly rises with keyboard

---

## [0.0.9] - 2026-08-27

### Added
- Mobile-first CSS rewrite
- Hamburger menu for mobile
- Collapsible sidebar with transform-based animation
- Sidebar overlay for touch dismissal
- Three responsive breakpoints (<768px, >=768px, <480px)

### Changed
- Completely rewrote CSS for mobile-first approach
- Sidebar now uses fixed positioning with slide animation

### Fixed
- Sidebar now properly works on mobile devices
- Touch interactions now work reliably

---

## [0.0.8] - 2026-08-26

### Added
- Per-message version history with messageVersions object
- Regeneration on any assistant message (not just last)
- Arrow navigation (←/→) for each message independently
- New timeline creation from regenerated point
- Messages after regenerated message are deleted (new timeline)

### Changed
- Completely rewrote regeneration system
- Version history changed from global to per-message

### Fixed
- Regeneration now properly creates new timeline
- Arrow navigation now works correctly
- Regenerating older message no longer breaks conversation

---

## [0.0.7] - 2026-08-25

### Added
- Comprehensive README documentation
- API endpoint documentation
- Testing checklist with 15 test cases
- Architecture diagram
- Troubleshooting guide
- Development log

### Changed
- None.

### Fixed
- None.

---

## [0.0.6] - 2026-08-24

### Added
- Neuron dashboard with visual progress bar
- Daily neuron usage tracking (10,000 limit)
- Used/remaining neuron counters
- Color-coded progress bar (green/yellow/red)
- Daily limit enforcement before AI requests

### Changed
- None.

### Fixed
- None.

---

## [0.0.5] - 2026-08-23

### Added
- Server-side prompt validation (2,000 character limit)
- Server-side model allowlist enforcement
- Temperature and max_tokens clamping
- Prepared SQL statements for security

### Changed
- None.

### Fixed
- None.

### Security
- Added server-side validation to prevent UI bypass
- Added model allowlist to prevent unauthorized usage

---

## [0.0.4] - 2026-08-22

### Added
- Regenerate button on assistant messages
- In-place message replacement
- Version navigation with arrows and counter
- Version history tracking in memory

### Changed
- None.

### Fixed
- None.

---

## [0.0.3] - 2026-08-21

### Added
- Custom modal dialogs (new/rename/delete)
- Markdown table support
- Conversation sidebar with create/rename/delete actions
- Three additional AI models (Gemma 4, GLM 4.7, Qwen 3.8)

### Removed
- DeepSeek V4 Flash (not on Free tier)
- Kimi 2.7 Code (not on Free tier)

### Fixed
- GPT-OSS 120B response parsing

---

## [0.0.2] - 2026-08-20

### Added
- D1 database with conversations and messages tables
- Persistent conversation storage
- Basic markdown rendering (headers, lists, code blocks, blockquotes)
- HTML UI with sidebar and chat interface
- Two AI models (Llama 4 Scout, GPT-OSS 120B)

### Changed
- None.

### Fixed
- None.

---

## [0.0.1] - 2026-08-19

### Added
- Initial Cloudflare Worker project setup
- Single-file architecture
- Basic AI integration with env.AI.run()
- Server-side model allowlist

### Changed
- None.

### Fixed
- None.

---

## Version History

| Version | Date | Type | Description |
|---------|------|------|-------------|
| 0.0.10 | 2026-08-28 | Release | Final mobile UI polish |
| 0.0.9 | 2026-08-27 | Release | Complete mobile rewrite |
| 0.0.8 | 2026-08-26 | Release | Regeneration system rewrite |
| 0.0.7 | 2026-08-25 | Release | Documentation |
| 0.0.6 | 2026-08-24 | Release | Neuron tracking |
| 0.0.5 | 2026-08-23 | Release | Security audit |
| 0.0.4 | 2026-08-22 | Release | Initial regeneration |
| 0.0.3 | 2026-08-21 | Release | UI and models |
| 0.0.2 | 2026-08-20 | Release | Database and storage |
| 0.0.1 | 2026-08-19 | Release | Initial setup |

---

## Team

- **Team:** WhiteDragon-dev
- **Lead Developer:** WhiteDragon-one

---

## Hosting

- **AI Models:** Cloudflare Workers AI
- **Database:** Cloudflare D1
- **Hosting:** Cloudflare Workers
- **Plan:** Free Tier

---

**End of Changelog**
