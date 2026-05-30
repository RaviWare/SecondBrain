# ── SecondBrain · Hermes agent sandbox image ──────────────────────────────────
# One container per user. Pre-installs Hermes (Nous Research), the SecondBrain
# brain connector, gstack + GBrain skill packs, and an idle-stop watchdog.
#
# SECURITY: runs as a non-root user, drops all Linux capabilities at runtime
# (set by the provisioner), no host docker socket. BYO LLM key + scoped brain
# token arrive as env vars at `docker run` time — never baked into the image.
FROM python:3.11-slim AS base

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    HOME=/home/agent

# System deps Hermes needs: git (skill packs), ripgrep (search), ffmpeg (voice),
# curl (installer + health), tini (proper PID-1 signal handling).
RUN apt-get update && apt-get install -y --no-install-recommends \
      git curl ca-certificates ripgrep ffmpeg tini \
    && rm -rf /var/lib/apt/lists/*

# uv (Hermes' Python package manager) + Node (gstack browse tooling).
RUN curl -LsSf https://astral.sh/uv/install.sh | sh \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

# Non-root agent user.
RUN useradd --create-home --uid 10001 --shell /bin/bash agent
USER agent
WORKDIR /home/agent
ENV PATH="/home/agent/.local/bin:/home/agent/.cargo/bin:${PATH}"

# ── Hermes Agent (Nous Research) ──────────────────────────────────────────────
# Installed via the official installer at build time so the image is self-contained.
RUN curl -fsSL https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.sh | bash || true

# ── gstack skill pack (host=hermes) ───────────────────────────────────────────
RUN git clone --single-branch --depth 1 https://github.com/garrytan/gstack.git /home/agent/.gstack-src \
    && /home/agent/.gstack-src/setup --host hermes --no-prefix < /dev/null || true

# ── GBrain skill pack (markdown skills; brain-first patterns) ─────────────────
RUN git clone --single-branch --depth 1 https://github.com/garrytan/gbrain.git /home/agent/.gbrain-src || true

# ── SecondBrain brain connector + entrypoint ──────────────────────────────────
COPY --chown=agent:agent connector/ /home/agent/secondbrain/
COPY --chown=agent:agent entrypoint.sh /home/agent/entrypoint.sh
COPY --chown=agent:agent idle-watchdog.sh /home/agent/idle-watchdog.sh

# tini reaps zombies + forwards signals so `docker stop` is clean.
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["/bin/bash", "/home/agent/entrypoint.sh"]
