#!/usr/bin/env bash
set -euo pipefail

IMAGE_TAG="${IMAGE_TAG:-exposurenexus:container-build-check}"
DOCKER="${DOCKER:-docker}"

"${DOCKER}" build --target production --tag "${IMAGE_TAG}" .
