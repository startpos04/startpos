#!/bin/sh
# stripe/webhook.sh
#
# Long-running service: starts `stripe listen`, forwards events to the app,
# captures the webhook signing secret on startup, and writes it to both
# /stripe-env/stripe.env and /host-env/.env.

set -e

STRIPE_ENV_DIR="/stripe-env"
STRIPE_ENV_FILE="$STRIPE_ENV_DIR/stripe.env"
HOST_ENV_FILE="/host-env/.env"

mkdir -p "$STRIPE_ENV_DIR"

# ── Helpers ───────────────────────────────────────────────────────────────────
upsert_env_file() {
  _file="$1" _k="$2" _v="$3"
  [ -f "$_file" ] || touch "$_file"
  grep -v "^${_k}=" "$_file" > "${_file}.tmp" 2>/dev/null || true
  mv "${_file}.tmp" "$_file"
  printf '%s=%s\n' "$_k" "$_v" >> "$_file"
}

# ── Resolve API key ───────────────────────────────────────────────────────────
# Prefer the env var; fall back to the key written by stripe-setup.
if [ -z "$STRIPE_SECRET_KEY" ] && [ -f "$STRIPE_ENV_FILE" ]; then
  STRIPE_SECRET_KEY=$(grep "^STRIPE_SECRET_KEY=" "$STRIPE_ENV_FILE" | cut -d= -f2-)
fi

if [ -z "$STRIPE_SECRET_KEY" ]; then
  echo "[stripe-webhook] ERROR: STRIPE_SECRET_KEY not found." >&2
  echo "[stripe-webhook] Run 'pnpm stripe:setup' first or set STRIPE_SECRET_KEY in .env" >&2
  exit 1
fi

echo "[stripe-webhook] Auth OK."

# ── Start listener ────────────────────────────────────────────────────────────
WEBHOOK_FORWARD_URL="${STRIPE_WEBHOOK_FORWARD_URL:-http://app:3000/api/stripe/webhook}"

echo "[stripe-webhook] Forwarding → $WEBHOOK_FORWARD_URL"
echo "[stripe-webhook] Waiting for signing secret..."

# Note: `set -e` interacts badly with the pipe + while loop below.
# We disable it here so a single bad line doesn't kill the listener.
set +e

stripe listen \
  --api-key "$STRIPE_SECRET_KEY" \
  --forward-to "$WEBHOOK_FORWARD_URL" \
  --events "customer.subscription.created,customer.subscription.updated,customer.subscription.deleted,invoice.payment_succeeded,invoice.payment_failed,checkout.session.completed,payment_intent.succeeded,payment_intent.payment_failed" \
  2>&1 | while IFS= read -r line; do
    echo "[stripe-webhook] $line"

    # Capture the signing secret printed once on startup:
    #   "Your webhook signing secret is whsec_xxxxxxxx (^C to quit)"
    case "$line" in
      *whsec_*)
        SECRET=$(echo "$line" | grep -oE 'whsec_[A-Za-z0-9]+')
        if [ -n "$SECRET" ]; then
          upsert_env_file "$STRIPE_ENV_FILE" "STRIPE_WEBHOOK_SECRET" "$SECRET"
          echo "[stripe-webhook] ✓ STRIPE_WEBHOOK_SECRET → $STRIPE_ENV_FILE"
          if [ -d "/host-env" ]; then
            upsert_env_file "$HOST_ENV_FILE" "STRIPE_WEBHOOK_SECRET" "$SECRET"
            echo "[stripe-webhook] ✓ STRIPE_WEBHOOK_SECRET → .env.local"
          fi
        fi
        ;;
    esac
  done
