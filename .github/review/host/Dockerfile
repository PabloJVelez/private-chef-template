FROM node:26.13.1-bookworm-slim@sha256:5df79989ed685e09f0a98019db4cebfb22fb9df1a53c0161664a011f7ff6b0f1
RUN apt-get update && apt-get install -y --no-install-recommends python3 git ca-certificates \
    && rm -rf /var/lib/apt/lists/*
ENV PYTHONDONTWRITEBYTECODE=1
WORKDIR /opt/reviewer
# Only trusted transport code is in the image. The installed private skill and
# OpenClaw installation are mounted read-only by the operator, never published.
COPY review.py runner.py /opt/reviewer/
COPY host/openclaw.json /opt/reviewer/openclaw.json
ENTRYPOINT ["python3", "-I", "/opt/reviewer/runner.py"]
