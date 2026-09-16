# ExposureNexus API

Hono API server for ExposureNexus.

See [Development](../../docs/development.md) for local setup and workspace commands.

The [import API](../../docs/import-sources.md) registers metadata, accepts a one-shot
raw upload, and atomically submits an ingestion/outbox job. The API owns the single
publication relay; the worker reads stored input through backend capabilities and
logs shell completion, without parsing or creating observations. Both roles require
matching [storage configuration](../../docs/deployment.md#api-and-worker-storage-configuration).
The UI import page remains disabled.
