#!/bin/sh
# stripe/stripe-catalog.sh
#
# Creates Stripe products/prices and writes IDs to:
#   - /stripe-env/stripe.env   (shared volume)
#   - /host-env/.env           (workspace root bind-mount, if present)
#
# All Stripe API parameters are passed with -d flags per the official CLI docs:
#   https://docs.stripe.com/api/prices/create?lang=cli
#
# Auth: --api-key passed to every command. No login or config needed.
#
# Idempotency: each price tagged with -d "metadata[env_key]"=ENV_KEY.
# On each run: query active prices, filter by that metadata, reuse if found.

STRIPE_ENV_FILE="${STRIPE_ENV_DIR}/stripe.env"
HOST_ENV_FILE="/host-env/.env"
KEY="$STRIPE_SECRET_KEY"

if [ -z "$KEY" ]; then
  echo "[stripe-catalog] ERROR: STRIPE_SECRET_KEY is empty." >&2
  exit 1
fi
if ! command -v jq >/dev/null 2>&1; then
  echo "[stripe-catalog] ERROR: jq not found." >&2
  exit 1
fi

# ── Helpers ───────────────────────────────────────────────────────────────────

upsert_env_file() {
  _file="$1" _k="$2" _v="$3"
  [ -f "$_file" ] || touch "$_file"
  grep -v "^${_k}=" "$_file" > "${_file}.tmp" 2>/dev/null || true
  mv "${_file}.tmp" "$_file"
  printf '%s=%s\n' "$_k" "$_v" >> "$_file"
}

write_price_id() {
  upsert_env_file "$STRIPE_ENV_FILE" "$1" "$2"
  [ -d "/host-env" ] && upsert_env_file "$HOST_ENV_FILE" "$1" "$2"
}

# create_price <ENV_KEY> <PRODUCT_NAME> <AMOUNT_CENTS> <CURRENCY> <INTERVAL>
# INTERVAL: "month" | "year" | "one_time"
create_price() {
  _env_key="$1"
  _name="$2"
  _amount="$3"
  _currency="$4"
  _interval="$5"

  printf '[stripe-catalog] %-52s' "$_env_key"

  # ── Lookup: active prices filtered by metadata[env_key] ──────────────────
  _list_json=$(stripe get /v1/prices \
    --api-key "$KEY" \
    -d "active=true" \
    -d "limit=100")

  _existing=$(printf '%s' "$_list_json" \
    | jq -r --arg k "$_env_key" \
        '.data[]? | select(.metadata.env_key == $k) | .id' \
    | head -1)

  if [ -n "$_existing" ]; then
    printf 'reused   %s\n' "$_existing"
    write_price_id "$_env_key" "$_existing"
    return 0
  fi

  # ── Create product ────────────────────────────────────────────────────────
  _prod_json=$(stripe post /v1/products \
    --api-key "$KEY" \
    -d "name=$_name" \
    -d "metadata[env_key]=$_env_key")

  _prod_id=$(printf '%s' "$_prod_json" | jq -r '.id // empty')

  if [ -z "$_prod_id" ]; then
    _err=$(printf '%s' "$_prod_json" | jq -r '.error.message // "no detail"' 2>/dev/null)
    printf 'FAILED (product): %s\n' "$_err" >&2
    return 1
  fi

  # ── Create price ──────────────────────────────────────────────────────────
  if [ "$_interval" = "one_time" ]; then
    _price_json=$(stripe post /v1/prices \
      --api-key "$KEY" \
      -d "product=$_prod_id" \
      -d "unit_amount=$_amount" \
      -d "currency=$_currency" \
      -d "metadata[env_key]=$_env_key")
  else
    _price_json=$(stripe post /v1/prices \
      --api-key "$KEY" \
      -d "product=$_prod_id" \
      -d "unit_amount=$_amount" \
      -d "currency=$_currency" \
      -d "recurring[interval]=$_interval" \
      -d "metadata[env_key]=$_env_key")
  fi

  _price_id=$(printf '%s' "$_price_json" | jq -r '.id // empty')

  if [ -z "$_price_id" ]; then
    _err=$(printf '%s' "$_price_json" | jq -r '.error.message // "no detail"' 2>/dev/null)
    printf 'FAILED (price): %s\n' "$_err" >&2
    # Deactivate orphaned product
    stripe post /v1/products/"$_prod_id" --api-key "$KEY" -d "active=false" >/dev/null 2>&1 || true
    return 1
  fi

  printf 'created  %s\n' "$_price_id"
  write_price_id "$_env_key" "$_price_id"
}

# ── Seed key into both env files ──────────────────────────────────────────────
upsert_env_file "$STRIPE_ENV_FILE" "STRIPE_SECRET_KEY" "$KEY"
[ -d "/host-env" ] && upsert_env_file "$HOST_ENV_FILE" "STRIPE_SECRET_KEY" "$KEY"

echo "[stripe-catalog] Reconciling Stripe catalog..."
echo ""

# ── Subscription plan prices (monthly recurring) ─────────────────────────────
create_price "STRIPE_PLAN_TRIAL_PRICE_ID"    "Trial Plan"    0     "usd"  "month"
create_price "STRIPE_PLAN_STARTER_PRICE_ID"  "Starter Plan"  2900  "usd"  "month"
create_price "STRIPE_PLAN_GROWTH_PRICE_ID"   "Growth Plan"   7900  "usd"  "month"
create_price "STRIPE_PLAN_PREMIUM_PRICE_ID"  "Premium Plan"  14900 "usd"  "month"

# ── Credit package prices (one-time) ─────────────────────────────────────────
create_price "STRIPE_CREDIT_PKG_10_PRICE_ID"  "10 Credits"  500  "usd"  "one_time"
create_price "STRIPE_CREDIT_PKG_50_PRICE_ID"  "50 Credits"  2000 "usd"  "one_time"
create_price "STRIPE_CREDIT_PKG_100_PRICE_ID" "100 Credits" 3500 "usd"  "one_time"

# ── TX top-up addon prices (one-time) ────────────────────────────────────────
create_price "STRIPE_TX_ADDON_500_PRICE_ID"  "500 TX Addon"  1000 "usd"  "one_time"
create_price "STRIPE_TX_ADDON_1000_PRICE_ID" "1000 TX Addon" 1800 "usd"  "one_time"
create_price "STRIPE_TX_ADDON_5000_PRICE_ID" "5000 TX Addon" 7500 "usd"  "one_time"

# ── Monthly recurring addon prices ───────────────────────────────────────────
create_price "STRIPE_ADDON_ANALYTICS_PRICE_ID"         "Analytics Addon"          1900 "usd"  "month"
create_price "STRIPE_ADDON_API_PRICE_ID"               "API Access Addon"         2900 "usd"  "month"
create_price "STRIPE_ADDON_BRANCH_PRICE_ID"            "Branch Addon"             1500 "usd"  "month"
create_price "STRIPE_ADDON_EMPLOYEE_PRICE_ID"          "Employee Addon"           1000 "usd"  "month"
create_price "STRIPE_ADDON_TX_RECURRING_500_PRICE_ID"  "500 TX Recurring Addon"    900 "usd"  "month"
create_price "STRIPE_ADDON_TX_RECURRING_1000_PRICE_ID" "1000 TX Recurring Addon"  1600 "usd"  "month"
create_price "STRIPE_ADDON_TX_RECURRING_5000_PRICE_ID" "5000 TX Recurring Addon"  6500 "usd"  "month"

echo ""
echo "[stripe-catalog] Done."
