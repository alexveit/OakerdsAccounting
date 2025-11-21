WITH t1 AS (
  INSERT INTO transactions (date, description, created_at)
  VALUES ('2025-1-31', 'Meals for Jan', now())
  RETURNING id
),
tl1 AS (
  INSERT INTO transaction_lines (
    transaction_id,
    account_id,
    amount,
    purpose,
    is_cleared
  )
  SELECT
    t1.id,
    (SELECT id FROM accounts WHERE code = '5120'),
    1306.23,
    'business',
    true
  FROM t1
  UNION ALL
  SELECT
    t1.id,
    (SELECT id FROM accounts WHERE name = 'Business Checking - 7609'),
    -1306.23,
    'business',
    true
  FROM t1
)

SELECT 'done';