# Safe Markdown Rendering for App Content

ExposureNexus renders user-entered and scanner-imported rich text through a
single UI Markdown component that sanitizes the rendered tree before it reaches
the DOM. Stored values remain unchanged so evidence and imported source material
keep their original text, but rendered Markdown uses an explicit allowlist:
Markdown/GFM output plus a small raw HTML layout set for current needs, such as
`details`, `summary`, and `br`. Future rich-text fields should use this shared
renderer instead of defining per-field Markdown policies unless a distinct
threat model justifies a separate decision.
