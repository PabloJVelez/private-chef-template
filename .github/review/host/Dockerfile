FROM node:24.22.1-bookworm-slim@sha256:be8204d4bd327363357f532187b752ff62759c31bedf98e9e18fc08c9cbd605c
RUN apt-get update && apt-get install -y --no-install-recommends python3 git ca-certificates \
    && rm -rf /var/lib/apt/lists/*
ENV PYTHONDONTWRITEBYTECODE=1
WORKDIR /opt/reviewer
# Only trusted transport code is in the image. The installed private skill and
# OpenClaw installation are mounted read-only by the operator, never published.
COPY review.py runner.py /opt/reviewer/
COPY host/openclaw.json /opt/reviewer/openclaw.json
ENTRYPOINT ["python3", "-I", "/opt/reviewer/runner.py"]
