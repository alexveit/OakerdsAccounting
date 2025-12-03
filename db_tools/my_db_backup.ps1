# ============================
# OAKERDS DB DEV SNAPSHOT SCRIPT
# Root → db_debug/<timestamp>/
# ============================

# Determine script root directory (project root)
$ROOT = Split-Path -Parent $MyInvocation.MyCommand.Definition

# Load DB password from local file (NOT committed to git)
$PasswordFile = Join-Path $ROOT "pg_password.txt"
if (!(Test-Path $PasswordFile)) {
    Write-Error "pg_password.txt not found at $PasswordFile. Create it with your DB password (one line)."
    exit 1
}

$env:PGSSLMODE  = "require"
$env:PGPASSWORD = (Get-Content $PasswordFile -Raw).Trim()

# Path to pg_dump.exe
$PG_DUMP = "C:\Program Files\PostgreSQL\18\bin\pg_dump.exe"

# Database connection
$PGHOST = "db.jiooyrootyjzutnwxlxm.supabase.co"
$PGPORT = "5432"
$PGDB   = "postgres"
$PGUSER = "postgres"

# Output folder: sibling to this script, inside db_tools
$DATE   = Get-Date -Format "yyyyMMdd_HHmmss"
$OUTDIR = Join-Path $ROOT "oakerds_dev_dump_$DATE"

# Create timestamp folder directly under db_tools
New-Item -ItemType Directory -Force -Path $OUTDIR | Out-Null

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
# 3. Sample Data (all core tables in one pg_dump call)
# ----------------------------
Write-Host "3. Dumping sample data..."

& $PG_DUMP `
  -h $PGHOST -p $PGPORT -U $PGUSER -d $PGDB `
  --data-only `
  -t public.account_types `
  -t public.accounts `
  -t public.lead_sources `
  -t public.vendors `
  -t public.installers `
  -t public.jobs `
  -t public.real_estate_deals `
  -t public.transactions `
  -t public.transaction_lines `
  > "$OUTDIR/sample_data.sql"

Write-Host ""
Write-Host "=============================="
Write-Host " DEV SNAPSHOT COMPLETE"
Write-Host " Stored in:"
Write-Host " $OUTDIR"
Write-Host "=============================="
