#!/bin/sh
# stripe/setup.sh
#
# One-shot: validates the API key, runs stripe-catalog.sh to create/reconcile
# all products and prices, writes everything to /stripe-env/stripe.env and
# /host-env/.env, then exits 0.

set -e

STRIPE_ENV_DIR="/stripe-env"
STRIPE_ENV_FILE="$STRIPE_ENV_DIR/stripe.env"

mkdir -p "$STRIPE_ENV_DIR"

# ── Validate key ─────────────────────────────────────────────────────────────
if [ -z "$STRIPE_SECRET_KEY" ]; then
  echo "[stripe-setup] ERROR: STRIPE_SECRET_KEY is not set." >&2
  echo "[stripe-setup] Add it to your .env file: STRIPE_SECRET_KEY=sk_test_..." >&2
  exit 1
fi

# Quick auth check — will exit non-zero if the key is invalid.
echo "[stripe-setup] Validating API key..."
stripe get /v1/balance --api-key "$STRIPE_SECRET_KEY" > /dev/null
echo "[stripe-setup] Auth OK."

# ── Run catalog ───────────────────────────────────────────────────────────────
# Export the key so stripe-catalog.sh can pass it to every stripe command.
export STRIPE_SECRET_KEY
export STRIPE_ENV_DIR

. /scripts/stripe-catalog.sh

echo ""
echo "[stripe-setup] stripe.env contents:"
echo "──────────────────────────────────────────────────────────"
cat "$STRIPE_ENV_FILE"
echo "──────────────────────────────────────────────────────────"
