# Skills used for this interface and publishing pass

| Skill | Applied to |
|---|---|
| Ponytail (active session instructions) | Keep changes focused, reuse existing layers, test meaningful behavior |
| frontend-design | Visual direction, typography and critique |
| designing-frontend-interfaces | Theme tokens, layout, component states and visual verification |
| designing-user-experience | Direct upload, search, explicit submission, failure states and deletion flow |
| building-accessible-interfaces | Native controls/dialog, keyboard focus, labels, live feedback and reduced motion |
| ecc:security-review | Credential audit, publishing safeguards and dependency review |
| debugging-and-error-recovery (previously loaded) | Reproduce and repair build/runtime failures |

Also reviewed `motion-patterns` and `motion-foundations` for cleanup, performance and reduced-motion rules. The user's explicit GSAP preference takes precedence over those skills' Motion-library requirement. `motion-doctrine` is aimed at video and was not applied to web interactions.

The local inventory found 1,670 readable skill files across installed directories, including duplicate plugin versions and bundles that are not necessarily enabled for this session. Reading a skill file does not establish access to its external services. The session also exposes skills for API design, testing, code review, performance, Android, Figma, documents, video and deployment; those are not all needed for this change.

Skills supply instructions and workflows. They do not guarantee lower token cost. Relevant guidance is loaded as needed rather than loading every installed skill. No additional skill or MCP installation was required.

GSAP contexts and media-query listeners are reverted on navigation/unmount. Upload polling cancels timers on unmount. API keys are kept only in component state. This keeps animation, polling and credential lifetimes tied to the current interface.

The algorithmic-art skill was also inspected for the ASCII studies. Its p5.js artifact workflow is unnecessary for this React feature: a small native text renderer implements the requested art without another rendering library. ART_DIRECTION.md records the conceptual direction.

The follow-up also applied frontend-design, browser-qa and git-workflow-and-versioning. Current GSAP/FastEmbed APIs were checked with Context7. Browser inspection used Chrome DevTools for visual/a11y review and Playwright for repeatable route, breakpoint and injected-failure checks. Relevant tools were used; unrelated installed services were not activated. Subagents were stopped when the user requested no Astra subagents; subsequent work was performed directly.
