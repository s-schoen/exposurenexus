# syntax=docker/dockerfile:1.7

# Shared Node and pnpm setup for build-only stages.
FROM node:24-trixie-slim AS pnpm-base
ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"
WORKDIR /workspace
RUN corepack enable

# Install all workspace dependencies from manifests for better source-change caching.
FROM pnpm-base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/ui/package.json apps/ui/package.json
COPY packages/types/package.json packages/types/package.json
RUN pnpm install --frozen-lockfile

# Compile shared types, UI assets, and API output using the cached dependencies.
FROM deps AS build
COPY . .
RUN pnpm --filter @exposurenexus/types build \
  && pnpm --filter @exposurenexus/ui build \
  && pnpm --filter @exposurenexus/api build \
  && mkdir -p /runtime/apps/api /runtime/packages/types \
  && printf '{"name":"@exposurenexus/api","type":"module"}\n' > /runtime/apps/api/package.json \
  && printf '{"name":"@exposurenexus/types","type":"module","exports":{"./api":{"import":"./dist/api/index.js"},"./model/asset":{"import":"./dist/model/asset.js"},"./model/finding":{"import":"./dist/model/finding.js"},"./model/date":{"import":"./dist/model/date.js"},"./model/vulnerability":{"import":"./dist/model/vulnerability.js"},"./model/user":{"import":"./dist/model/user.js"},"./model/rbac":{"import":"./dist/model/rbac.js"}}}\n' > /runtime/packages/types/package.json

# Install only API runtime dependencies for the final image.
FROM pnpm-base AS prod-deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY packages/types/package.json packages/types/package.json
RUN pnpm install --frozen-lockfile --prod --filter @exposurenexus/api... \
  && rm -rf node_modules/.pnpm/typescript@* node_modules/typescript apps/api/node_modules/typescript packages/types/node_modules/typescript

# Minimal non-root runtime containing only built artifacts and production deps.
FROM gcr.io/distroless/nodejs24-debian13:nonroot AS production
ENV NODE_ENV=production
ENV PORT=3001
ENV STATIC_DIR=/app/public
WORKDIR /app/apps/api

COPY --from=prod-deps --chown=65532:65532 /workspace/node_modules /app/node_modules
COPY --from=prod-deps --chown=65532:65532 /workspace/apps/api/node_modules /app/apps/api/node_modules
COPY --from=prod-deps --chown=65532:65532 /workspace/packages/types/node_modules /app/packages/types/node_modules
COPY --from=build --chown=65532:65532 /runtime/apps/api/package.json /app/apps/api/package.json
COPY --from=build --chown=65532:65532 /runtime/packages/types/package.json /app/packages/types/package.json
COPY --from=build --chown=65532:65532 /workspace/apps/api/dist /app/apps/api/dist
COPY --from=build --chown=65532:65532 /workspace/packages/types/dist /app/packages/types/dist
COPY --from=build --chown=65532:65532 /workspace/apps/ui/dist /app/public

EXPOSE 3001
USER 65532:65532
CMD ["dist/src/index.js"]
