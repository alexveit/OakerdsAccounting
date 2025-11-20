WITH j AS (
  INSERT INTO jobs (name, address, status, created_at, lead_source_id)
  VALUES (
    'Syed Hasnain',
    NULL,
    'open',
    now(),
    (SELECT id FROM lead_sources WHERE nick_name = 'DigRef')
  )
  RETURNING id
),

/* ========================== MATERIALS ========================== */

vendor1 AS (
  INSERT INTO transactions (date, description, created_at)
  VALUES ('2025-01-02', 'FAF treads bals glue', now())
  RETURNING id
),
vendorL1 AS (
  INSERT INTO transaction_lines (
    transaction_id, account_id, amount, job_id,
    installer_id, vendor_id, purpose, is_cleared
  )
  SELECT vendor1.id,
    (SELECT id FROM accounts WHERE name = 'Materials Expense'),
    1007.16,
    j.id,
    NULL::integer,
    (SELECT id FROM vendors WHERE nick_name = 'FAF'),
    'business',
    true
  FROM j, vendor1
  UNION ALL
  SELECT vendor1.id,
    (SELECT id FROM accounts WHERE name = 'Business Checking - 7609'),
    -1007.16,
    j.id,
    NULL::integer,
    NULL::integer,
    'business',
    true
  FROM j, vendor1
),

vendor2 AS (
  INSERT INTO transactions (date, description, created_at)
  VALUES ('2025-01-03', 'FAF tread replace', now())
  RETURNING id
),
vendorL2 AS (
  SELECT vendor2.id,
    (SELECT id FROM accounts WHERE name = 'Materials Expense'),
    77.62,
    j.id,
    NULL::integer,
    (SELECT id FROM vendors WHERE nick_name = 'FAF'),
    'business',
    true
  FROM j, vendor2
  UNION ALL
  SELECT vendor2.id,
    (SELECT id FROM accounts WHERE name = 'Business Checking - 7609'),
    -77.62,
    j.id,
    NULL::integer,
    NULL::integer,
    'business',
    true
  FROM j, vendor2
),

vendor3 AS (
  INSERT INTO transactions (date, description, created_at)
  VALUES ('2025-01-07', 'FAF rails & posts', now())
  RETURNING id
),
vendorL3 AS (
  SELECT vendor3.id,
    (SELECT id FROM accounts WHERE name = 'Materials Expense'),
    2371.46,
    j.id,
    NULL::integer,
    (SELECT id FROM vendors WHERE nick_name = 'FAF'),
    'business',
    true
  FROM j, vendor3
  UNION ALL
  SELECT vendor3.id,
    (SELECT id FROM accounts WHERE name = 'Business Checking - 7609'),
    -2371.46,
    j.id,
    NULL::integer,
    NULL::integer,
    'business',
    true
  FROM j, vendor3
),

vendor4 AS (
  INSERT INTO transactions (date, description, created_at)
  VALUES ('2025-01-07', 'FAF materials', now())
  RETURNING id
),
vendorL4 AS (
  SELECT vendor4.id,
    (SELECT id FROM accounts WHERE name = 'Materials Expense'),
    128.27,
    j.id,
    NULL::integer,
    (SELECT id FROM vendors WHERE nick_name = 'FAF'),
    'business',
    true
  FROM j, vendor4
  UNION ALL
  SELECT vendor4.id,
    (SELECT id FROM accounts WHERE name = 'Business Checking - 7609'),
    -128.27,
    j.id,
    NULL::integer,
    NULL::integer,
    'business',
    true
  FROM j, vendor4
),

vendor5 AS (
  INSERT INTO transactions (date, description, created_at)
  VALUES ('2025-01-09', 'FAF extra rail', now())
  RETURNING id
),
vendorL5 AS (
  SELECT vendor5.id,
    (SELECT id FROM accounts WHERE name = 'Materials Expense'),
    131.44,
    j.id,
    NULL::integer,
    (SELECT id FROM vendors WHERE nick_name = 'FAF'),
    'business',
    true
  FROM j, vendor5
  UNION ALL
  SELECT vendor5.id,
    (SELECT id FROM accounts WHERE name = 'Business Checking - 7609'),
    -131.44,
    j.id,
    NULL::integer,
    NULL::integer,
    'business',
    true
  FROM j, vendor5
),

installer1 AS (
  INSERT INTO transactions (date, description, created_at)
  VALUES ('2025-01-13', 'Amauri partial', now())
  RETURNING id
),
installerL1 AS (
  SELECT installer1.id,
    (SELECT id FROM accounts WHERE name = 'Installer Labor Expense'),
    1500.00,
    j.id,
    (SELECT id FROM installers WHERE first_name = 'Amauri'),
    NULL::integer,
    'business',
    true
  FROM j, installer1
  UNION ALL
  SELECT installer1.id,
    (SELECT id FROM accounts WHERE name = 'Business Checking - 7609'),
    -1500.00,
    j.id,
    NULL::integer,
    NULL::integer,
    'business',
    true
  FROM j, installer1
),

vendor6 AS (
  INSERT INTO transactions (date, description, created_at)
  VALUES ('2025-02-11', 'F&D wood', now())
  RETURNING id
),
vendorL6 AS (
  SELECT vendor6.id,
    (SELECT id FROM accounts WHERE name = 'Materials Expense'),
    936.09,
    j.id,
    NULL::integer,
    (SELECT id FROM vendors WHERE nick_name = 'F&D'),
    'business',
    true
  FROM j, vendor6
  UNION ALL
  SELECT vendor6.id,
    (SELECT id FROM accounts WHERE name = 'Business Checking - 7609'),
    -936.09,
    j.id,
    NULL::integer,
    NULL::integer,
    'business',
    true
  FROM j, vendor6
),

vendor7 AS (
  INSERT INTO transactions (date, description, created_at)
  VALUES ('2025-02-17', 'HD materials', now())
  RETURNING id
),
vendorL7 AS (
  SELECT vendor7.id,
    (SELECT id FROM accounts WHERE name = 'Materials Expense'),
    107.07,
    j.id,
    NULL::integer,
    (SELECT id FROM vendors WHERE nick_name = 'HD'),
    'business',
    true
  FROM j, vendor7
  UNION ALL
  SELECT vendor7.id,
    (SELECT id FROM accounts WHERE name = 'Business Checking - 7609'),
    -107.07,
    j.id,
    NULL::integer,
    NULL::integer,
    'business',
    true
  FROM j, vendor7
),

vendor8 AS (
  INSERT INTO transactions (date, description, created_at)
  VALUES ('2025-02-17', 'FAF extra post', now())
  RETURNING id
),
vendorL8 AS (
  SELECT vendor8.id,
    (SELECT id FROM accounts WHERE name = 'Materials Expense'),
    62.83,
    j.id,
    NULL::integer,
    (SELECT id FROM vendors WHERE nick_name = 'FAF'),
    'business',
    true
  FROM j, vendor8
  UNION ALL
  SELECT vendor8.id,
    (SELECT id FROM accounts WHERE name = 'Business Checking - 7609'),
    -62.83,
    j.id,
    NULL::integer,
    NULL::integer,
    'business',
    true
  FROM j, vendor8
),

vendor9 AS (
  INSERT INTO transactions (date, description, created_at)
  VALUES ('2025-02-18', 'FAF mini threshold', now())
  RETURNING id
),
vendorL9 AS (
  SELECT vendor9.id,
    (SELECT id FROM accounts WHERE name = 'Materials Expense'),
    145.64,
    j.id,
    NULL::integer,
    (SELECT id FROM vendors WHERE nick_name = 'FAF'),
    'business',
    true
  FROM j, vendor9
  UNION ALL
  SELECT vendor9.id,
    (SELECT id FROM accounts WHERE name = 'Business Checking - 7609'),
    -145.64,
    j.id,
    NULL::integer,
    NULL::integer,
    'business',
    true
  FROM j, vendor9
),

/* ========================== LABOR ========================== */

installer2 AS (
  INSERT INTO transactions (date, description, created_at)
  VALUES ('2025-02-24', 'Amauri balance', now())
  RETURNING id
),
installerL2 AS (
  SELECT installer2.id,
    (SELECT id FROM accounts WHERE name = 'Installer Labor Expense'),
    1915.00,
    j.id,
    (SELECT id FROM installers WHERE first_name = 'Amauri'),
    NULL::integer,
    'business',
    true
  FROM j, installer2
  UNION ALL
  SELECT installer2.id,
    (SELECT id FROM accounts WHERE name = 'Business Checking - 7609'),
    -1915.00,
    j.id,
    NULL::integer,
    NULL::integer,
    'business',
    true
  FROM j, installer2
),

installer3 AS (
  INSERT INTO transactions (date, description, created_at)
  VALUES ('2025-02-24', 'Maria paint', now())
  RETURNING id
),
installerL3 AS (
  SELECT installer3.id,
    (SELECT id FROM accounts WHERE name = 'Installer Labor Expense'),
    650.00,
    j.id,
    (SELECT id FROM installers WHERE first_name = 'Maria'),
    NULL::integer,
    'business',
    true
  FROM j, installer3
  UNION ALL
  SELECT installer3.id,
    (SELECT id FROM accounts WHERE name = 'Business Checking - 7609'),
    -650.00,
    j.id,
    NULL::integer,
    NULL::integer,
    'business',
    true
  FROM j, installer3
),

/* ========================== INCOME ========================== */

income1 AS (
  INSERT INTO transactions (date, description, created_at)
  VALUES ('2025-01-02', 'Deposit', now())
  RETURNING id
),
incomeL1 AS (
  SELECT income1.id,
    (SELECT id FROM accounts WHERE name = 'Flooring Income'),
    -2227.14,
    j.id,
    NULL::integer,
    NULL::integer,
    'business',
    true
  FROM j, income1
  UNION ALL
  SELECT income1.id,
    (SELECT id FROM accounts WHERE name = 'Business Checking - 7609'),
    2227.14,
    j.id,
    NULL::integer,
    NULL::integer,
    'business',
    true
  FROM j, income1
),

income2 AS (
  INSERT INTO transactions (date, description, created_at)
  VALUES ('2025-02-24', 'Balance', now())
  RETURNING id
),
incomeL2 AS (
  SELECT income2.id,
    (SELECT id FROM accounts WHERE name = 'Flooring Income'),
    -8330.83,
    j.id,
    NULL::integer,
    NULL::integer,
    'business',
    true
  FROM j, income2
  UNION ALL
  SELECT income2.id,
    (SELECT id FROM accounts WHERE name = 'Business Checking - 7609'),
    8330.83,
    j.id,
    NULL::integer,
    NULL::integer,
    'business',
    true
  FROM j, income2
)

SELECT 'done';
