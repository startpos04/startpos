# stripe/Dockerfile
# Minimal image: official Stripe CLI + setup scripts.

FROM debian:bookworm-slim

# Install Stripe CLI via the official apt repo
RUN apt-get update && apt-get install -y --no-install-recommends \
      curl \
      gnupg \
      ca-certificates \
      grep \
      jq \
    && curl -fsSL https://packages.stripe.dev/api/security/keypair/stripe-cli-gpg/public \
         | gpg --dearmor -o /usr/share/keyrings/stripe.gpg \
    && echo "deb [signed-by=/usr/share/keyrings/stripe.gpg] https://packages.stripe.dev/stripe-cli-debian-local stable main" \
         > /etc/apt/sources.list.d/stripe.list \
    && apt-get update && apt-get install -y --no-install-recommends stripe \
    && rm -rf /var/lib/apt/lists/*

# Copy scripts into the image
COPY setup.sh          /scripts/setup.sh
COPY webhook.sh        /scripts/webhook.sh
COPY stripe-catalog.sh /scripts/stripe-catalog.sh
RUN chmod +x /scripts/setup.sh /scripts/webhook.sh /scripts/stripe-catalog.sh

# Default entrypoint — overridden per-service in docker-compose.yml
ENTRYPOINT ["/bin/sh"]
