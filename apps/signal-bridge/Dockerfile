# Rokki Signal bridge — Node service + signal-cli (Java). Deploys standalone
# (Fly.io). Build context is this directory; run `pnpm build` first locally OR
# let the image build it. signal-cli is a Java app from AsamK/signal-cli.

FROM node:22-bookworm-slim

# Java 25 runtime for signal-cli + tools to fetch it. signal-cli 0.14.x is
# compiled for Java 25, but Debian bookworm only ships Java 17 — so pull the
# JRE from Eclipse Temurin (Adoptium) instead of default-jre-headless.
RUN apt-get update \
  && apt-get install -y --no-install-recommends wget gnupg ca-certificates \
  && mkdir -p /etc/apt/keyrings \
  && wget -qO - https://packages.adoptium.net/artifactory/api/gpg/key/public \
       | gpg --dearmor -o /etc/apt/keyrings/adoptium.gpg \
  && echo "deb [signed-by=/etc/apt/keyrings/adoptium.gpg] https://packages.adoptium.net/artifactory/deb bookworm main" \
       > /etc/apt/sources.list.d/adoptium.list \
  && apt-get update \
  && apt-get install -y --no-install-recommends temurin-25-jre \
  && rm -rf /var/lib/apt/lists/*

# Pin signal-cli. Keep current — Signal breaks old clients server-side (an
# outdated version fails provisioning with HTTP 499). Bump as releases land.
ARG SIGNAL_CLI_VERSION=0.14.5
RUN wget -q "https://github.com/AsamK/signal-cli/releases/download/v${SIGNAL_CLI_VERSION}/signal-cli-${SIGNAL_CLI_VERSION}.tar.gz" \
  && tar xf "signal-cli-${SIGNAL_CLI_VERSION}.tar.gz" -C /opt \
  && ln -sf "/opt/signal-cli-${SIGNAL_CLI_VERSION}/bin/signal-cli" /usr/local/bin/signal-cli \
  && rm "signal-cli-${SIGNAL_CLI_VERSION}.tar.gz"

WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate

# Copy this package's manifests + source. (For a monorepo build you may prefer
# to build dist/ in CI and COPY it in; this self-contained path keeps Phase-0
# deploys simple.)
COPY package.json tsconfig.json ./
RUN pnpm install --no-frozen-lockfile
COPY src ./src
RUN pnpm build

ENV PORT=8080
EXPOSE 8080
CMD ["node", "dist/index.js"]
