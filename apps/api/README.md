# ExposureNexus API

Hono API server for ExposureNexus.

See [Development](../../docs/development.md) for local setup and workspace commands.

The [import API](../../docs/import-sources.md) registers metadata, accepts a one-shot
raw upload, and atomically submits an ingestion/outbox job. The API owns the single
publication relay; the worker processes stored input through backend capabilities
into observations and findings. Both roles require
matching [storage configuration](../../docs/deployment.md#api-and-worker-storage-configuration).
The UI import page remains disabled.
