# ExposureNexus

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Test Coverage](https://codecov.io/gh/s-schoen/exposurenexus/branch/master/graph/badge.svg)](https://codecov.io/gh/s-schoen/exposurenexus)

ExposureNexus is an open-source continuous threat exposure management (CTEM) platform for importing scanner findings, normalizing them around assets and vulnerabilities, and tracking triage through remediation.

## Project Status

ExposureNexus is in early development. The current setup is intended for local evaluation and development, not as a production deployment guide. The first supported external finding source is Nuclei JSONL.

![ExposureNexus dashboard showing finding severity, status, affected assets, and source breakdowns](docs/assets/readme-dashboard.png)

## Key Features

- Import Nuclei JSONL findings and normalize them into assets, vulnerabilities, and findings.
- Review active findings in a triage queue grouped around affected assets.
- Track finding status from discovery through confirmation, mitigation, accepted risk, false positive, duplicate, or out-of-scope.
- Assign findings, set due dates, and manage remediation follow-up.
- Manage asset inventory, owners, and asset-specific custom fields.
- Browse the vulnerability catalog behind observed findings.
- Use role-based access control for viewer, editor, and admin workflows.

## How It Works

ExposureNexus models scanner output around three core objects:

- **Assets** are the systems or components affected by findings.
- **Vulnerabilities** are catalog entries describing reusable weaknesses.
- **Findings** are concrete occurrences of vulnerabilities on assets.

Imports map external scanner records into that model so teams can deduplicate, triage, assign, and track remediation over time.

## Quickstart

```bash
pnpm install
pnpm dev:api
pnpm dev:ui
```

The API and UI need local environment configuration before they can run successfully. See [Development](docs/development.md) for PostgreSQL, environment variables, and workspace commands.

## Development

For local environment setup, PostgreSQL configuration, workspace commands, and project structure, see [Development](docs/development.md).

## License

MIT
