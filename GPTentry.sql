DO $$
DECLARE
  -- Category expense account IDs
  catAcctIds integer[] := ARRAY[
    42,  -- Grocery
    45,  -- VINS
    39,  -- Donation
    44,  -- Cable
    47,  -- Utility
    49,  -- Personal
    48,  -- Drift
    38   -- TWHM
  ];

  -- Purpose per category
  linePurpose text[] := ARRAY[
    'personal',  -- Grocery
    'business',  -- VINS
    'personal',  -- Donation
    'personal',  -- Cable
    'personal',  -- Utility
    'personal',  -- Personal
    'personal',  -- Drift
    'personal'   -- TWHM
  ];

  -- Description prefixes
  catDescPrefix text[] := ARRAY[
    'Grocery – ',
    'VINS – ',
    'Donation – ',
    'Cable – ',
    'Utility – ',
    'Personal – ',
    'Drift – ',
    'TWHM – '
  ];

  -- Totals per category × month
  myTotals numeric[][] := ARRAY[

    -- 1) Grocery
    ARRAY[
      119.51, 477.47, 338.43, 625.19, 539.35,
      436.02, 327.45, 411.47, 724.45, 245.92,
      121.14
    ],

    -- 2) VINS
    ARRAY[
      163.96, 203.38, 183.67, 183.64, 241.64,
      241.76, 241.76, 241.76, 241.76, 241.74,
      249.82
    ],

    -- 3) Donation
    ARRAY[
      2501.99, 1601.99, 2601.99, 3136.73, 3303.98,
      3808.00, 3800.00, 3105.99, 2943.98, 471.99,
      60.00
    ],

    -- 4) Cable
    ARRAY[
      212.93, 208.93, 247.81, 227.92, 231.91,
      291.20, 275.30, 302.91, 248.31, 275.89,
      419.05
    ],

    -- 5) Utility
    ARRAY[
      39.95, 39.95, 79.44, 0, 36.94,
      44.36, 85.36, 96.80, 72.25, 76.67,
      57.62
    ],

    -- 6) Personal
    ARRAY[
      13.83, 72.49, 15.85, 15.85, 15.85,
      15.85, 15.85, 15.85, 15.85, 26.44,
      85.84
    ],

    -- 7) Drift
    ARRAY[
      35.60, 13.62, 13.62, 111.46, 19.07,
      154.35, 20.13, 19.07, 29.06, 91.29,
      9.80
    ],

    -- 8) TWHM
    ARRAY[
      2279.57, 3355.30, 3403.39, 5807.18, -2260.57,
      3222.13, 3022.13, 5481.72, 5686.33, 3955.65,
      2862.06
    ]
  ];

  -- Dates for Jan–Nov
  myDateList date[] := ARRAY[
    DATE '2025-01-31',
    DATE '2025-02-28',
    DATE '2025-03-31',
    DATE '2025-04-30',
    DATE '2025-05-31',
    DATE '2025-06-30',
    DATE '2025-07-31',
    DATE '2025-08-31',
    DATE '2025-09-30',
    DATE '2025-10-31',
    DATE '2025-11-01'
  ];

  -- Month names
  myMonthName text[] := ARRAY[
    'Jan','Feb','Mar','Apr','May','Jun',
    'Jul','Aug','Sep','Oct','Nov'
  ];

  bankAcctId integer := 1;

  c integer;
  m integer;
  amt numeric;
BEGIN
  FOR c IN 1..array_length(catAcctIds, 1) LOOP
    FOR m IN 1..array_length(myDateList, 1) LOOP
      amt := myTotals[c][m];

      -- Skip empty or zero values
      IF amt IS NULL OR amt = 0 THEN
        CONTINUE;
      END IF;

      WITH t1 AS (
        INSERT INTO transactions (date, description, created_at)
        VALUES (
          myDateList[m],
          catDescPrefix[c] || myMonthName[m],  -- <-- ★ clean description
          now()
        )
        RETURNING id
      )
      INSERT INTO transaction_lines (
        transaction_id,
        account_id,
        amount,
        purpose,
        is_cleared
      )
      SELECT
        id,
        catAcctIds[c],
        amt,
        linePurpose[c],
        true
      FROM t1
      UNION ALL
      SELECT
        id,
        bankAcctId,
        -amt,
        linePurpose[c],
        true
      FROM t1;

    END LOOP;
  END LOOP;
END $$;
