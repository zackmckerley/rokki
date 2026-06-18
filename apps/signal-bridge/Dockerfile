# Rokki Signal bridge — Node service + signal-cli (Java). Deploys standalone
# (Fly.io). Build context is this directory; run `pnpm build` first locally OR
# let the image build it. signal-cli is a Java app from AsamK/signal-cli.

FROM node:22-bookworm-slim

# Java runtime for signal-cli + tools to fetch it.
RUN apt-get update \
  && apt-get install -y --no-install-recommends default-jre-headless ca-certificates wget \
  && rm -rf /var/lib/apt/lists/*

# Pin signal-cli. Bump as new releases land (it tracks the Signal protocol).
ARG SIGNAL_CLI_VERSION=0.13.18
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
