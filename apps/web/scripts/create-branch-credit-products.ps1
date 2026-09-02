# create-branch-credit-products.ps1
# Creates branch credit packages in Stripe

$ErrorActionPreference = "Stop"

if (-not $env:STRIPE_SECRET_KEY) {
    Write-Host "ERROR: STRIPE_SECRET_KEY not set" -ForegroundColor Red
    exit 1
}

$KEY = $env:STRIPE_SECRET_KEY

$packages = @(
    @{ id="STRIPE_BRANCH_CREDIT_10_PRICE_ID"; name="10 Branch Credits"; amount=500; currency="php" }
    @{ id="STRIPE_BRANCH_CREDIT_50_PRICE_ID"; name="50 Branch Credits"; amount=2000; currency="php" }
    @{ id="STRIPE_BRANCH_CREDIT_100_PRICE_ID"; name="100 Branch Credits"; amount=3500; currency="php" }
    @{ id="STRIPE_BRANCH_CREDIT_500_PRICE_ID"; name="500 Branch Credits"; amount=15000; currency="php" }
    @{ id="STRIPE_BRANCH_CREDIT_1000_PRICE_ID"; name="1000 Branch Credits"; amount=25000; currency="php" }
)

Write-Host "`nCreating branch credit packages..." -ForegroundColor Cyan
$envUpdates = @()

foreach ($pkg in $packages) {
    Write-Host "Processing: $($pkg.name)" -ForegroundColor Yellow
    
    # Create product
    $productJson = stripe post /v1/products --api-key $KEY -d "name=$($pkg.name)" -d "metadata[env_key]=$($pkg.id)"
    $product = $productJson | ConvertFrom-Json
    
    if ($product.id) {
        # Create price
        $priceJson = stripe post /v1/prices --api-key $KEY -d "product=$($product.id)" -d "unit_amount=$($pkg.amount)" -d "currency=$($pkg.currency)" -d "metadata[env_key]=$($pkg.id)"
        $price = $priceJson | ConvertFrom-Json
        
        if ($price.id) {
            Write-Host "  Created: $($price.id)" -ForegroundColor Green
            $envUpdates += "$($pkg.id)=$($price.id)"
        } else {
            Write-Host "  Error creating price" -ForegroundColor Red
        }
    } else {
        Write-Host "  Error creating product" -ForegroundColor Red
    }
}

Write-Host "`nAdd these to .env:" -ForegroundColor Cyan
foreach ($update in $envUpdates) {
    Write-Host $update
}
