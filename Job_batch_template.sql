WITH j AS (
  INSERT INTO jobs (name, address, status, created_at, lead_source_id)
  VALUES ('Debra & Scott Evers', NULL, 'open', now(),
	(SELECT id FROM lead_sources WHERE nick_name = 'DigRef'))
  RETURNING id
),

-- FOR INCOME ONLY
income1 AS (
  INSERT INTO transactions (date, description, created_at)
  VALUES ('2025-08-20', 'Full pay', now())
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
  -- Category side
  SELECT
    income1.id,
    (SELECT id FROM accounts WHERE name = 'Flooring Income'),
    -7630.66,          -- negative
    j.id,
    NULL::integer,
    NULL::integer,
    'business',
    true
  FROM j, income1
  UNION ALL
  -- Cash side
  SELECT
    income1.id,
    (SELECT id FROM accounts WHERE name = 'Business Checking - 7609'),
    7630.66,         -- positive
    j.id,
    NULL::integer,
    NULL::integer,
    'business',
    true
  FROM j, income1
),

-- FOR INSTALLER EXPENSES
installer1 AS (
  INSERT INTO transactions (date, description, created_at)
  VALUES ('2025-08-20', 'install & finish', now())
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
  -- Category side (e.g. Flooring Income)
  SELECT
    installer1.id,
    (SELECT id FROM accounts WHERE name = 'Installer Labor Expense'),
    2775,          -- positive
    j.id,
    (SELECT id FROM installers WHERE first_name = 'Amauri'),
    NULL::integer,
    'business',
    true
  FROM j, installer1
  UNION ALL
  -- Cash side (e.g. Business Checking - 7609)
  SELECT
    installer1.id,
    (SELECT id FROM accounts WHERE name = 'Business Checking - 7609'),
    -2775,         -- negative
    j.id,
    NULL::integer,
    NULL::integer,
    'business',
    true
  FROM j, installer1
),

-- FOR VENDORS EXPENSES
vendor1 AS (
  INSERT INTO transactions (date, description, created_at)
  VALUES ('2025-08-12', 'plastic & prep', now())
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
  -- Category side
  SELECT
    vendor1.id,
    (SELECT id FROM accounts WHERE name = 'Materials Expense'),
    133.41,          -- positive
    j.id,
    NULL::integer,
    (SELECT id FROM vendors WHERE nick_name = 'Lowes'),
    'business',
    true
  FROM j, vendor1
  UNION ALL
  -- Cash side
  SELECT
    vendor1.id,
    (SELECT id FROM accounts WHERE name = 'Business Checking - 7609'),
    -133.41,         -- negative
    j.id,
		NULL::integer,
    NULL::integer,
    'business',
    true
  FROM j, vendor1
),

vendor2 AS (
  INSERT INTO transactions (date, description, created_at)
  VALUES ('2025-08-14', 'DOMO & trim', now())
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
  -- Category side
  SELECT
    vendor2.id,
    (SELECT id FROM accounts WHERE name = 'Materials Expense'),
    328.24,          -- positive
    j.id,
    NULL::integer,
    (SELECT id FROM vendors WHERE nick_name = 'GAPRO'),
    'business',
    true
  FROM j, vendor2
  UNION ALL
  -- Cash side
  SELECT
    vendor2.id,
    (SELECT id FROM accounts WHERE name = 'Business Checking - 7609'),
    -328.24,         -- negative
    j.id,
		NULL::integer,
    NULL::integer,
    'business',
    true
  FROM j, vendor2
),

vendor3 AS (
  INSERT INTO transactions (date, description, created_at)
  VALUES ('2025-08-5', 'DOMO & trim', now())
  RETURNING id
),
vendorL3 AS (
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
    vendor3.id,
    (SELECT id FROM accounts WHERE name = 'Materials Expense'),
    832.12,          -- positive
    j.id,
    NULL::integer,
    (SELECT id FROM vendors WHERE nick_name = 'YPF'),
    'business',
    true
  FROM j, vendor3
  UNION ALL
  -- Cash side
  SELECT
    vendor3.id,
    (SELECT id FROM accounts WHERE name = 'Business Checking - 7609'),
    -832.12,         -- negative
    j.id,
		NULL::integer,
    NULL::integer,
    'business',
    true
  FROM j, vendor3
)

SELECT 'done';
