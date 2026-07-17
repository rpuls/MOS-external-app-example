# Base images must be pinned by immutable digest. A floating tag such as
# `node:22-alpine` would let the image change under a package version that
# claims to be unchanged, so MOS packages never use one.
#
# This digest is the multi-architecture index for node:22-alpine, which
# publishes both linux/amd64 and linux/arm64 — the two architectures declared
# in manifest.json.
FROM node:22-alpine@sha256:16e22a550f3863206a3f701448c45f7912c6896a62de43add43bb9c86130c3e2

WORKDIR /app

# The application is dependency-free on purpose: an example package should build
# without reaching a package registry at image build time.
COPY server.js ./

# /data is the mount point for the named volume declared in manifest.json.
# Creating and chowning it here means the volume is initialized with ownership
# the unprivileged runtime user can actually write to.
RUN mkdir -p /data && chown -R node:node /data /app

USER node

EXPOSE 8080

CMD ["node", "server.js"]
