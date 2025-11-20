WITH j AS (
  INSERT INTO jobs (name, address, status, created_at, lead_source_id)
  VALUES ('Dina Chou', NULL, 'open', now(),
	(SELECT id FROM lead_sources WHERE nick_name = 'Rachael'))
  RETURNING id
),

/* ===================== INCOME ===================== */

income1 AS (
  INSERT INTO transactions (date, description, created_at)
  VALUES ('2025-01-10', 'Deposit', now())
  RETURNING id
),
incomeL1 AS (
  INSERT INTO transaction_lines (
    transaction_id,
    account_id,
    amount,
    job_id,
    installer_id,
    vendor_id,
    purpose,
    is_cleared
  )
  -- Category side (Flooring Income)
  SELECT
    income1.id,
    (SELECT id FROM accounts WHERE name = 'Flooring Income'),
    -2848.88,
    j.id,
    NULL::integer,
    NULL::integer,
    'business',
    true
  FROM j, income1
  UNION ALL
  -- Cash side (Business Checking)
  SELECT
    income1.id,
    (SELECT id FROM accounts WHERE name = 'Business Checking - 7609'),
    2848.88,
    j.id,
    NULL::integer,
    NULL::integer,
    'business',
    true
  FROM j, income1
),

income2 AS (
  INSERT INTO transactions (date, description, created_at)
  VALUES ('2025-01-23', 'Balance', now())
  RETURNING id
),
incomeL2 AS (
  INSERT INTO transaction_lines (
    transaction_id,
    account_id,
    amount,
    job_id,
    installer_id,
    vendor_id,
    purpose,
    is_cleared
  )
  -- Category side (Flooring Income)
  SELECT
    income2.id,
    (SELECT id FROM accounts WHERE name = 'Flooring Income'),
    -5290.77,
    j.id,
    NULL::integer,
    NULL::integer,
    'business',
    true
  FROM j, income2
  UNION ALL
  -- Cash side (Business Checking)
  SELECT
    income2.id,
    (SELECT id FROM accounts WHERE name = 'Business Checking - 7609'),
    5290.77,
    j.id,
    NULL::integer,
    NULL::integer,
    'business',
    true
  FROM j, income2
),

/* ===================== INSTALLER LABOR ===================== */

installer1 AS (
  INSERT INTO transactions (date, description, created_at)
  VALUES ('2025-01-16', 'Cleidvaldo partial', now())
  RETURNING id
),
installerL1 AS (
  INSERT INTO transaction_lines (
    transaction_id,
    account_id,
    amount,
    job_id,
    installer_id,
    vendor_id,
    purpose,
    is_cleared
  )
  -- Category side (Installer Labor Expense)
  SELECT
    installer1.id,
    (SELECT id FROM accounts WHERE name = 'Installer Labor Expense'),
    200.00,
    j.id,
    (SELECT id FROM installers WHERE first_name = 'Cleivaldo'),
    NULL::integer,
    'business',
    true
  FROM j, installer1
  UNION ALL
  -- Cash side (Business Checking)
  SELECT
    installer1.id,
    (SELECT id FROM accounts WHERE name = 'Business Checking - 7609'),
    -200.00,
    j.id,
    NULL::integer,
    NULL::integer,
    'business',
    true
  FROM j, installer1
),

installer2 AS (
  INSERT INTO transactions (date, description, created_at)
  VALUES ('2025-01-21', 'Cleidvaldo partial', now())
  RETURNING id
),
installerL2 AS (
  INSERT INTO transaction_lines (
    transaction_id,
    account_id,
    amount,
    job_id,
    installer_id,
    vendor_id,
    purpose,
    is_cleared
  )
  -- Category side
  SELECT
    installer2.id,
    (SELECT id FROM accounts WHERE name = 'Installer Labor Expense'),
    500.00,
    j.id,
    (SELECT id FROM installers WHERE first_name = 'Cleivaldo'),
    NULL::integer,
    'business',
    true
  FROM j, installer2
  UNION ALL
  -- Cash side
  SELECT
    installer2.id,
    (SELECT id FROM accounts WHERE name = 'Business Checking - 7609'),
    -500.00,
    j.id,
    NULL::integer,
    NULL::integer,
    'business',
    true
  FROM j, installer2
),

installer3 AS (
  INSERT INTO transactions (date, description, created_at)
  VALUES ('2025-01-22', 'Misa install carpet', now())
  RETURNING id
),
installerL3 AS (
  INSERT INTO transaction_lines (
    transaction_id,
    account_id,
    amount,
    job_id,
    installer_id,
    vendor_id,
    purpose,
    is_cleared
  )
  -- Category side
  SELECT
    installer3.id,
    (SELECT id FROM accounts WHERE name = 'Installer Labor Expense'),
    288.75,
    j.id,
    (SELECT id FROM installers WHERE first_name = 'Misa'),
    NULL::integer,
    'business',
    true
  FROM j, installer3
  UNION ALL
  -- Cash side
  SELECT
    installer3.id,
    (SELECT id FROM accounts WHERE name = 'Business Checking - 7609'),
    -288.75,
    j.id,
    NULL::integer,
    NULL::integer,
    'business',
    true
  FROM j, installer3
),

installer4 AS (
  INSERT INTO transactions (date, description, created_at)
  VALUES ('2025-01-22', 'Cleidvaldo balance', now())
  RETURNING id
),
installerL4 AS (
  INSERT INTO transaction_lines (
    transaction_id,
    account_id,
    amount,
    job_id,
    installer_id,
    vendor_id,
    purpose,
    is_cleared
  )
  -- Category side
  SELECT
    installer4.id,
    (SELECT id FROM accounts WHERE name = 'Installer Labor Expense'),
    1660.26,
    j.id,
    (SELECT id FROM installers WHERE first_name = 'Cleivaldo'),
    NULL::integer,
    'business',
    true
  FROM j, installer4
  UNION ALL
  -- Cash side
  SELECT
    installer4.id,
    (SELECT id FROM accounts WHERE name = 'Business Checking - 7609'),
    -1660.26,
    j.id,
    NULL::integer,
    NULL::integer,
    'business',
    true
  FROM j, installer4
),

/* ===================== MATERIALS / VENDORS ===================== */

vendor1 AS (
  INSERT INTO transactions (date, description, created_at)
  VALUES ('2025-01-17', 'BCC Relative DW Cape Code Chrome', now())
  RETURNING id
),
vendorL1 AS (
  INSERT INTO transaction_lines (
    transaction_id,
    account_id,
    amount,
    job_id,
    installer_id,
    vendor_id,
    purpose,
    is_cleared
  )
  -- Category side (Materials Expense, Relative)
  SELECT
    vendor1.id,
    (SELECT id FROM accounts WHERE name = 'Materials Expense'),
    628.26,
    j.id,
    NULL::integer,
    (SELECT id FROM vendors WHERE nick_name = 'Relative'),
    'business',
    true
  FROM j, vendor1
  UNION ALL
  -- Cash side (Business Checking)
  SELECT
    vendor1.id,
    (SELECT id FROM accounts WHERE name = 'Business Checking - 7609'),
    -628.26,
    j.id,
    NULL::integer,
    NULL::integer,
    'business',
    true
  FROM j, vendor1
),

vendor2 AS (
  INSERT INTO transactions (date, description, created_at)
  VALUES ('2025-01-17', 'BCC FAF Materials for installer', now())
  RETURNING id
),
vendorL2 AS (
  INSERT INTO transaction_lines (
    transaction_id,
    account_id,
    amount,
    job_id,
    installer_id,
    vendor_id,
    purpose,
    is_cleared
  )
  -- Category side (Materials Expense, Relative)
  SELECT
    vendor2.id,
    (SELECT id FROM accounts WHERE name = 'Materials Expense'),
    665.74,
    j.id,
    NULL::integer,
    (SELECT id FROM vendors WHERE nick_name = 'FAF'),
    'business',
    true
  FROM j, vendor2
  UNION ALL
  -- Cash side (Business Checking)
  SELECT
    vendor2.id,
    (SELECT id FROM accounts WHERE name = 'Business Checking - 7609'),
    -665.74,
    j.id,
    NULL::integer,
    NULL::integer,
    'business',
    true
  FROM j, vendor2
)

SELECT 'done';
