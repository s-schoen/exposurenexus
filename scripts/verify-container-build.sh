#!/usr/bin/env sh
set -eu

IMAGE_TAG="${IMAGE_TAG:-exposurenexus:container-build-check}"
DOCKER="${DOCKER:-docker}"

"${DOCKER}" build --target production --tag "${IMAGE_TAG}" .
