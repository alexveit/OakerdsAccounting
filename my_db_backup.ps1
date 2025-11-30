# ============================
# OAKERDS DB DEV SNAPSHOT SCRIPT
# Root → db_debug/<timestamp>/
# ============================

$env:PGSSLMODE = "require"

# Path to pg_dump.exe
$PG_DUMP = "C:\Program Files\PostgreSQL\18\bin\pg_dump.exe"

# Database connection
$PGHOST = "db.jiooyrootyjzutnwxlxm.supabase.co"
$PGPORT = "5432"
$PGDB   = "postgres"
$PGUSER = "postgres"

# Determine script root directory
$ROOT = Split-Path -Parent $MyInvocation.MyCommand.Definition

# Output folder inside project
$DATE        = Get-Date -Format "yyyyMMdd_HHmmss"
$DEBUG_ROOT  = Join-Path $ROOT "db_debug"
$OUTDIR      = Join-Path $DEBUG_ROOT "oakerds_dev_dump_$DATE"

# Ensure db_debug exists
if (!(Test-Path $DEBUG_ROOT)) {
    New-Item -ItemType Directory -Force -Path $DEBUG_ROOT | Out-Null
}

# Create timestamp folder
New-Item -ItemType Directory -Force -Path $OUTDIR | Out-Null

Write-Host "Dev snapshot starting..."
Write-Host "Output folder: $OUTDIR"
Write-Host ""

# ----------------------------
# 1. CORE Schema Dump (your main tables only)
# ----------------------------
Write-Host "1. Dumping CORE schema (public core tables)..."
& $PG_DUMP `
  -h $PGHOST -p $PGPORT -U $PGUSER -d $PGDB `
  --schema-only `
  -t public.account_types `
  -t public.accounts `
  -t public.lead_sources `
  -t public.vendors `
  -t public.installers `
  -t public.jobs `
  -t public.real_estate_deals `
  -t public.transactions `
  -t public.transaction_lines `
  > "$OUTDIR/schema_core.sql"

# ----------------------------
# 2. App Logic (public schema only: your views, functions, triggers)
# ----------------------------
Write-Host "2. Dumping app logic (public schema only)..."
& $PG_DUMP `
  -h $PGHOST -p $PGPORT -U $PGUSER -d $PGDB `
  --schema-only `
  -n public `
  --section=pre-data --section=post-data `
  > "$OUTDIR/logic_app_public.sql"

# ----------------------------
# 3. Sample Data (full tables for now)
# ----------------------------
Write-Host "3. Dumping sample data..."

$tables = @(
  "account_types",
  "accounts",
  "lead_sources",
  "vendors",
  "installers",
  "jobs",
  "real_estate_deals",
  "transactions",
  "transaction_lines"
)

foreach ($t in $tables) {
    Write-Host "   - $t"
    & $PG_DUMP `
      -h $PGHOST -p $PGPORT -U $PGUSER -d $PGDB `
      --data-only `
      --table=$t `
      >> "$OUTDIR/sample_data.sql"
}

Write-Host ""
Write-Host "=============================="
Write-Host " DEV SNAPSHOT COMPLETE"
Write-Host " Stored in:"
Write-Host " $OUTDIR"
Write-Host "=============================="
