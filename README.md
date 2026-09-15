# ExposureNexus

[![CI](https://github.com/s-schoen/exposurenexus/actions/workflows/ci.yml/badge.svg?branch=master)](https://github.com/s-schoen/exposurenexus/actions/workflows/ci.yml)
[![Test Coverage](https://codecov.io/gh/s-schoen/exposurenexus/branch/master/graph/badge.svg)](https://codecov.io/gh/s-schoen/exposurenexus)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

ExposureNexus is an open-source continuous threat exposure management (CTEM) platform for organizing security
observations into asset-centered findings and tracking triage through remediation.

## Project Status

ExposureNexus is in early development. The current setup is intended for local evaluation and development, not as a
production deployment guide. Automated scanner import is work in progress; the import API registers scan-upload
metadata and returns an import-source ID. Byte upload, submission, and scan processing remain unavailable.

![ExposureNexus dashboard showing finding severity, status, affected assets, and source breakdowns](docs/assets/readme-dashboard.png)

## Key Features

- Create findings manually and attach manual observations as supporting evidence.
- Review active findings in a triage queue grouped around affected assets.
- Track finding status from discovery through confirmation, mitigation, accepted risk, false positive, duplicate, or
  out-of-scope.
- Assign findings, set due dates, and manage remediation follow-up.
- Manage asset inventory, owners, and asset-specific custom fields.
- Browse the vulnerability catalog behind observed findings.
- Use role-based access control for viewer, editor, and admin workflows.

## How It Works

ExposureNexus models exposure-management work around four core objects:

- **Assets** are the systems or components affected by findings.
- **Findings** are human-facing workflow cases on assets.
- **Observations** are manual or scanner detection records attached to findings.
- **Vulnerabilities** are optional catalog entries linked to findings.

Teams can currently create and triage findings manually. Automated import into the observation-based model is planned but
not yet available.

## Quickstart

```bash
pnpm install
```

Before running applications, follow [Development](docs/development.md) to configure credentials and API object storage,
start PostgreSQL and RabbitMQ, and verify one-shot initialization. Then run `pnpm dev:api`, `pnpm dev:worker`, and `pnpm dev:ui`
in separate terminals, waiting for API startup before starting the worker. The worker is initially connected but idle;
queued jobs accumulate until real ingestion handlers ship.

## Deployment

See [Deployment](docs/deployment.md) for the reference Compose stack with PostgreSQL, RabbitMQ, private object storage, one-shot provisioning,
and API/worker roles from one image, including single-API updates, worker scaling, and graceful shutdown.

## Development

For local environment setup, PostgreSQL configuration, workspace commands, and project structure,
see [Development](docs/development.md).

## Security

Please report suspected vulnerabilities through GitHub private vulnerability reporting. See [SECURITY.md](SECURITY.md).

## License

MIT
