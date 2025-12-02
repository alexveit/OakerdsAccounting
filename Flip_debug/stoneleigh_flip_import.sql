-- ============================================================================
-- STONELEIGH FLIP IMPORT SCRIPT v2
-- 1437 Stoneleigh Hill Rd, Lithonia, GA 30058
-- Deal ID: 3
-- ============================================================================
-- 
-- This script uses arrays so you can review/modify data before committing.
-- Each transaction creates proper double-entry accounting lines.
--
-- REFERENCE MAPPINGS:
-- -------------------
-- Cash Accounts:
--   3 = Checking Holdings - 4112 (BANKT)
--   4 = Corp Credit - 2989
--   5 = Corp Credit - 9271
--   6 = Corp Credit - 6370
--   7 = Corp Credit - 2908
--   8 = Personal Credit - 3946
--   9 = Personal Credit - 4441
--  91 = RE – Hard Money 1437 Stoneleigh
--  92 = RE – HELOC (Lancelot)
--
-- Expense Accounts:
--  82 = RE – Flip Rehab Materials
--  83 = RE – Flip Rehab Labor
--  80 = RE – Mortgage Interest (for HOLD interest items)
--  79 = RE – Taxes & Insurance
--
-- Rehab Category IDs:
--   1=IDEM, 2=ETRH, 3=FDRP, 4=CMAS, 5=WPRO, 6=ROOF, 7=WIND, 8=ESTR, 9=EXPT,
--  10=GUSO, 11=CRFR, 12=HVRF, 13=PLRF, 14=ELRF, 15=INSU, 16=DRYW, 17=TDHW,
--  18=TILE, 19=CAVN, 20=CNTP, 21=FLOR, 22=PAIN, 23=CRPT, 24=HVTO, 25=PLTO,
--  26=ELTO, 27=APPL, 28=DRSD, 29=DECK, 30=LAND, 31=POCL, 32=PENG, 33=OTHR,
--  34=HOLD, 35=CLSE, 36=CRED
--
-- Installer IDs:
--  1=Amauri, 2=Cleidvaldo, 5=Marcus, 6=Maria, 8=Jhonatha, 10=Warley,
--  14=Bruno, 17=Adriano, 21=Basil, 22=Collin, 23=Eric, 24=Willyan,
--  25=Javier, 26=Jesus, 27=Victor, 28=Andrew, 29=Jael, 30=Monty
--
-- Vendor IDs:
--  3=GAPRO, 4=HD, 7=F&D, 11=B2B, 21=Still Lumber, 22=Randall Brothers,
--  23=Builders Surplus, 24=UPVIEW, 25=Amazon, 26=Vine Disposal, 27=Fiverr,
--  28=Macon E Gooch, 29=Steve & Judd, 30=Silliman, 31=Cedarcrest,
--  32=GENA Trust, 33=CBR, 34=First Tech FCU, 35=Georgia Power, 36=Kendall
--
-- Cost Types: L=Labor, M=Material, S=Service/Other
-- ============================================================================

BEGIN;

DO $$
DECLARE
  v_deal_id CONSTANT INT := 3;
  v_tx_id INT;
  i INT;
  
  -- Expense account mappings
  v_materials_account CONSTANT INT := 82;  -- RE – Flip Rehab Materials
  v_labor_account CONSTANT INT := 83;      -- RE – Flip Rehab Labor
  v_interest_account CONSTANT INT := 80;   -- RE – Mortgage Interest
  v_insurance_account CONSTANT INT := 79;  -- RE – Taxes & Insurance
  
  -- Cash account mappings
  v_bankt CONSTANT INT := 3;   -- Checking Holdings - 4112
  v_cc_2989 CONSTANT INT := 4;
  v_cc_9271 CONSTANT INT := 5;
  v_cc_6370 CONSTANT INT := 6;
  v_cc_2908 CONSTANT INT := 7;
  v_cc_3946 CONSTANT INT := 8;
  v_cc_4441 CONSTANT INT := 9;
  v_hard_money CONSTANT INT := 91;
  v_heloc CONSTANT INT := 92;
  
  -- =========================================================================
  -- TRANSACTION DATA ARRAYS
  -- Format: Each position aligns across all arrays
  -- =========================================================================
  
  -- Dates (YYYY-MM-DD format)
  v_dates TEXT[] := ARRAY[
    -- CLOSING TRANSACTIONS (CLSE) 1-24
    '2025-02-27', '2025-02-28', '2025-03-03', '2025-03-13', '2025-03-13',
    '2025-03-13', '2025-03-13', '2025-03-13', '2025-03-13', '2025-03-13',
    '2025-03-13', '2025-03-13', '2025-03-13', '2025-03-13', '2025-03-13',
    '2025-03-13', '2025-03-13', '2025-03-13', '2025-03-13', '2025-03-13',
    '2025-03-13', '2025-03-13', '2025-03-13', '2025-03-13',
    
    -- DEMO & SITE PREP (IDEM/ETRH) 25-38
    '2025-03-21', '2025-04-07', '2025-04-07', '2025-04-07', '2025-04-07',
    '2025-04-07', '2025-04-30', '2025-05-05', '2025-06-06', '2025-07-04',
    '2025-07-04', '2025-07-07', '2025-07-18', '2025-09-18',
    
    -- PERMITS & ENGINEERING (PENG) 39-42
    '2025-03-21', '2025-03-28', '2025-03-28', '2025-07-17',
    
    -- CARPENTRY/FRAMING (CRFR) 43-62
    '2025-03-20', '2025-05-19', '2025-05-19', '2025-05-19', '2025-05-19',
    '2025-05-20', '2025-05-21', '2025-05-21', '2025-05-21', '2025-05-21',
    '2025-05-23', '2025-05-26', '2025-05-27', '2025-06-02', '2025-06-05',
    '2025-06-06', '2025-06-11', '2025-06-20', '2025-06-28', '2025-07-03',
    
    -- ROOF (ROOF) 63-66
    '2025-05-15', '2025-05-15', '2025-05-15', '2025-05-19',
    
    -- WINDOWS (WIND) 67-69
    '2025-05-23', '2025-06-04', '2025-06-06',
    
    -- EXTERIOR SIDING/TRIM (ESTR) 70-73
    '2025-06-09', '2025-06-09', '2025-06-13', '2025-06-16',
    
    -- GUTTERS/SOFFIT (GUSO) 74-79
    '2025-06-05', '2025-06-06', '2025-06-06', '2025-06-11', '2025-06-11', '2025-06-11',
    
    -- HVAC (HVRF) 80-81
    '2025-06-03', '2025-06-23',
    
    -- PLUMBING ROUGH (PLRF) 82-89
    '2025-05-29', '2025-05-29', '2025-06-03', '2025-06-03', '2025-06-03',
    '2025-06-04', '2025-06-04', '2025-06-11',
    
    -- ELECTRICAL ROUGH (ELRF) 90-92
    '2025-05-20', '2025-05-21', '2025-06-04',
    
    -- DRYWALL (DRYW) 93-97
    '2025-06-03', '2025-06-06', '2025-06-16', '2025-06-23', '2025-07-14',
    
    -- TRIM/DOORS/HARDWARE (TDHW) 98-116
    '2025-06-09', '2025-06-16', '2025-06-16', '2025-06-24', '2025-06-25',
    '2025-06-26', '2025-06-28', '2025-06-30', '2025-07-04', '2025-07-07',
    '2025-07-11', '2025-07-14', '2025-07-14', '2025-07-15', '2025-07-18',
    '2025-07-28', '2025-07-30', '2025-08-01', '2025-08-01',
    
    -- TILE (TILE) 117-137
    '2025-06-06', '2025-06-04', '2025-06-16', '2025-06-19', '2025-06-19',
    '2025-06-23', '2025-06-16', '2025-06-23', '2025-06-25', '2025-06-30',
    '2025-07-01', '2025-07-01', '2025-07-02', '2025-07-03', '2025-07-05',
    '2025-07-07', '2025-07-07', '2025-07-28', '2025-08-18', '2025-08-20',
    '2025-08-21',
    
    -- CABINETS/VANITIES (CAVN) 138-140
    '2025-06-06', '2025-07-08', '2025-07-30',
    
    -- COUNTERTOPS (CNTP) 141-144
    '2025-07-28', '2025-07-28', '2025-07-29', '2025-08-04',
    
    -- FLOORING (FLOR) 145-148
    '2025-08-06', '2025-09-01', '2025-09-02', '2025-09-12',
    
    -- PAINTING (PAIN) 149-154
    '2025-06-23', '2025-06-28', '2025-07-05', '2025-07-14', '2025-07-21', '2025-08-01',
    
    -- PLUMBING TRIM OUT (PLTO) 155-165
    '2025-07-01', '2025-07-05', '2025-07-07', '2025-07-07', '2025-07-09',
    '2025-07-09', '2025-07-21', '2025-07-23', '2025-07-28', '2025-07-28', '2025-08-05',
    
    -- ELECTRICAL TRIM OUT (ELTO) 166-184
    '2025-06-27', '2025-07-11', '2025-07-11', '2025-07-25', '2025-07-25',
    '2025-07-28', '2025-07-28', '2025-07-30', '2025-07-31', '2025-08-11',
    '2025-08-21', '2025-08-21', '2025-08-21', '2025-08-27', '2025-08-27',
    '2025-08-27', '2025-08-27', '2025-08-27', '2025-09-02',
    
    -- APPLIANCES (APPL) 185
    '2025-08-04',
    
    -- DECK (DECK) 186-191
    '2025-06-23', '2025-06-23', '2025-06-23', '2025-06-23', '2025-06-23', '2025-06-23',
    
    -- LANDSCAPING (LAND) 192-198
    '2025-07-28', '2025-07-29', '2025-08-01', '2025-08-01', '2025-08-01',
    '2025-08-01', '2025-08-04',
    
    -- PUNCHOUT & CLEANING (POCL) 199-202
    '2025-09-12', '2025-09-19', '2025-09-22', '2025-10-06',
    
    -- OTHER (OTHR) 203-211
    '2025-09-09', '2025-09-09', '2025-09-11', '2025-09-11', '2025-09-13',
    '2025-09-22', '2025-09-22', '2025-09-23', '2025-10-02',
    
    -- HOLDING COSTS (HOLD) 212-267
    '2025-04-07', '2025-04-25', '2025-04-28', '2025-05-01', '2025-05-05',
    '2025-05-09', '2025-05-12', '2025-05-12', '2025-05-30', '2025-05-30',
    '2025-06-02', '2025-06-04', '2025-06-06', '2025-06-06', '2025-06-09',
    '2025-06-11', '2025-06-11', '2025-06-11', '2025-06-25', '2025-07-01',
    '2025-07-03', '2025-07-08', '2025-07-09', '2025-07-09', '2025-07-21',
    '2025-07-28', '2025-07-28', '2025-07-29', '2025-07-31', '2025-08-01',
    '2025-08-04', '2025-08-07', '2025-08-08', '2025-08-08', '2025-08-09',
    '2025-08-11', '2025-08-12', '2025-09-02', '2025-09-08', '2025-09-10',
    '2025-09-11', '2025-09-11', '2025-09-12', '2025-09-12', '2025-09-12',
    '2025-09-15', '2025-09-18', '2025-09-18', '2025-10-01', '2025-10-08',
    '2025-10-10', '2025-10-10', '2025-10-10', '2025-10-15', '2025-10-28', '2025-11-03',
    
    -- CREDITS/FUNDING (CRED) 268-274
    '2025-03-03', '2025-03-13', '2025-05-30', '2025-06-25', '2025-06-28',
    '2025-07-31', '2025-09-25'
  ];
  
  -- Descriptions
  v_descriptions TEXT[] := ARRAY[
    -- CLOSING (1-24)
    'EMD', 'Appraisal', 'HELOC Draw', 'HM Flood Certification', 'HM Doc Prep',
    'HM Wire fee', 'HM Origination', 'HM Processing', 'HM Prepaid Interest',
    'Gov Recording', 'Gov Transfer Tax', 'Title Corp Res', 'Title CPL (Lender)',
    'Title Document Storage', 'Title Lenders Title policy', 'Title Settlement',
    'Title Title & Tax Search', 'Title Commitment', 'Title Split Closing',
    'Title Owners Title Policy', 'Title Closing credit', 'Insurance', 'Down Payment', 'Wire transfer',
    
    -- DEMO (25-38)
    'Cleidvaldo demo', 'Victor scrape ceiling material', 'Victor scrape ceiling', 'Dumpster',
    'Cleidvaldo demo', 'Dumpster', 'Warley demo', 'Dumpster', 'Dumpster Vine disposal',
    'Vine Disposal dumpster', 'Vine Disposal dumpster', 'Vine Disposal dumpster', 'Dumpster',
    'Dumpster Vine disposal',
    
    -- PERMITS (39-42)
    'Monty frame quote fee', 'Macon E Gooch Engineer', 'Steve & Judd permits', 'WIX.com',
    
    -- CRFR (43-62)
    'Fiverr plans', 'Warley joist install', 'HD joist materials', 'HD material credit',
    'HD framing material', 'Still Lumber LVL', 'HD OSB Subfloor',
    'Still Lumber LVL', 'HD framing material', 'HD Willyan framing',
    'Willyan framing balance', 'HD framing material OSB', 'Warley subfloor labor',
    'Marcus subfloor labor', 'HD 2x4', 'Warley framing', 'HD 2x10', 'OSB',
    'HD 2x4 and shims', 'HD Fireplace lumber frame',
    
    -- ROOF (63-66)
    'HD roof material', 'HD roof material', 'HD roof material credit', 'Eric roofing labor',
    
    -- WIND (67-69)
    'UPVIEW Window', 'UPVIEW Window', 'Warley Window install',
    
    -- ESTR (70-73)
    'Randall Brothers siding', 'HD siding', 'Randall Brothers siding', 'Warley siding',
    
    -- GUSO (74-79)
    'Randall Brothers Soffit Fascia', 'Warley Soffit Fascia', 'Warley Soffit Fascia',
    'Jesus gutters', 'Jesus gutters', 'Jesus gutters',
    
    -- HVRF (80-81)
    'HVAC', 'HVAC balance',
    
    -- PLRF (82-89)
    'HD Free Stand tub & faucet', 'Basil Plumbing', 'plumbing hall tub',
    'plumbing hall shower fixtures', 'plumbing Master shower fixture', 'Basil Plumbing partial',
    'Basil Plumbing partial', 'Plumbing materials',
    
    -- ELRF (90-92)
    'HD Electric supplies', 'Collin electric', 'Collin Electric partial',
    
    -- DRYW (93-97)
    'Drywall materials', '2x4 & insulation', 'Bruno Drywall deposit', 'Bruno Drywall Partial',
    'Bruno repair vento holes',
    
    -- TDHW (98-116)
    'Builders Surplus Front door', 'HD front door lock', 'Builder Surplus interior doors',
    'Warley doors install hold', 'Warley doors install hold credit', 'Kendall Door delivery',
    'HD door trims', 'Builder Surplus interior door', 'HD door trim materials',
    'Builder Surplus extra interior door', 'HD extra door trim materials',
    'Bruno install interior doors', 'HD random', 'Amazon hinges', 'HD extra door knob',
    'Bathroom hardware and racks', 'Closet & pantry racks', 'Maria hardware labor', 'racks hardware material',
    
    -- TILE (117-137)
    'HD Tile materials', 'F&D Tile material', 'F&D Tile material', 'F&D Tile material',
    'F&D Tile material', 'HD Tile material', 'Marcus tile install hall', 'Marcus Tile labor suite',
    'HD Tile material', 'HD Tile material', 'Jael Shower glass enclosure', 'Marcus master tile install',
    'Jael Shower glass hold credit', 'F&D Tile material', 'F&D Tile material',
    'HD Tile material', 'Marcus master tile fireplace', 'Jael Shower glass balance',
    'F&D backsplash material', 'F&D backsplash material', 'Marcus install back splash',
    
    -- CAVN (138-140)
    'Bathroom Vanities', 'B2B Cabinets', 'Javier install cabinets',
    
    -- CNTP (141-144)
    'Adriano countertop', 'Adriano countertop', 'Adriano countertop hold credit', 'Adriano Countertop balance',
    
    -- FLOR (145-148)
    'Hardwood floors', 'GAPRO DOMO and baseboards', 'Amauri Hardwood floors install', 'Amauri Hardwood finish',
    
    -- PAIN (149-154)
    'Bruno ext Paint Partial', 'Bruno Paint interior deposit', 'Bruno Paint interior Balance',
    'Bruno exterior paint partial', 'Bruno exterior partial', 'Bruno exterior balance',
    
    -- PLTO (155-165)
    'Jhonatha Plumbing Lancelot', 'HD toilets', 'Basil bathroom materials', 'HD water heater & sups',
    'HD water heater pan', 'Basil fireplace', 'Basil partial', 'Basil partial hold back credit',
    'Garbage disposal', 'Kitchen faucet', 'Basil balance',
    
    -- ELTO (166-184)
    'Amazon recessed lights', 'Amazon electrical outlets', 'Amazon electrical outlets',
    'Fart Fan Duct', 'Bathroom & exterior lights', 'Lights and fans',
    'Fart Fans', 'Master Fan', 'Collin electrical trim out partial', 'Amazon electrical materials',
    'Amazon electrical materials', 'appliance install credit', 'HD Light bulbs', 'HD Light bulbs',
    'Amazon misc', 'Invoice2Go', 'HD credit', 'Amazon credit', 'Collin balance',
    
    -- APPL (185)
    'Microwave dish washer',
    
    -- DECK (186-191)
    'Deck lumber', 'Deck lumber', 'Deck lumber', 'Deck concrete', 'Deck lumber', 'Warley Deck labor',
    
    -- LAND (192-198)
    'Bruno Landscaping', 'Bruno Landscape hold credit', 'Bruno Landscape', 'HD Landscaping materials fence',
    'HD Mulch', 'HD Fence', 'HD mail box',
    
    -- POCL (199-202)
    'Bruno labor', 'HD punchout materials', 'Bruno labor punch out', 'HD materials',
    
    -- OTHR (203-211)
    'Pictures', 'Insurance', 'Pictures', 'Pictures', 'HD materials', 'staging', 'notary', 'appraisal', 'Andrew fix dryer vent',
    
    -- HOLD (212-267)
    'proc fee', 'First Tech FCU payment', 'Credit card Fee', 'Hard Money MTG', 'proc fee',
    'Credit card Interest', 'Credit card Fee Payment', 'FINANCE CHARGE ADJUSTMENT', 'HardMoney Fee',
    'Transfer to Oakerds LLC', 'Hard Money MTG', 'proc fee', 'proc fee', 'proc fee', 'Lyft proc fee',
    'First Tech FCU payment', 'proc fee', 'interest', 'HardMoney Fee', 'proc fee', 'Hard Money MTG',
    'proc fee', 'interest', 'proc fee', 'proc fee', 'Notary', 'proc fee', 'First Tech FCU payment',
    'HardMoney Fee', 'Hard Money MTG', 'Uber eats discord', 'Late fee', 'Late fee', 'Late fee',
    'Late fee', 'CC interest', 'Interest', 'Hard Money MTG', 'Late fee', 'Interest', 'Interest',
    'payment credit', 'First Tech FCU payment', 'payment credit', 'ccinterest', 'GA Power',
    'Payment from Oakerds LLC credit', 'ccinterest', 'Hard Money MTG', 'Interest', 'Interest',
    'Interest', 'Interest', 'Georgia power bill', 'First Tech FCU payment', 'Hard Money MTG',
    
    -- CRED (268-274)
    'HELOC Draw', 'Down Payment', 'HardMoney Draw', 'HardMoney Draw', 'HELOC Draw',
    'HardMoney Draw', 'HardMoney Draw'
  ];
  
  -- Amounts (positive values - we handle signs in the logic)
  v_amounts NUMERIC[] := ARRAY[
    -- CLOSING (1-24)
    2024.00, 759.00, 44850.00, 33.00, 500.00, 55.00, 6492.69, 750.00, 1239.24,
    50.00, 146.00, 75.00, 50.00, 40.00, 785.00, 850.00, 250.00, 75.00, 150.00,
    564.00, 46.10, 5131.00, 30964.07, 30.00,
    
    -- DEMO (25-38)
    1120.00, 107.04, 1500.00, 380.00, 500.00, 380.00, 650.00, 380.00, 616.97,
    495.37, 121.60, 324.76, 380.00, 1005.28,
    
    -- PERMITS (39-42)
    75.00, 545.00, 6179.20, 89.00,
    
    -- CRFR (43-62)
    87.24, 1853.76, 708.13, 205.11, 1356.57, 313.29, 368.27, 234.97, 273.60,
    3500.00, 1526.41, 434.95, 700.00, 330.00, 65.21, 250.00, 100.88, 81.28,
    54.92, 178.18,
    
    -- ROOF (63-66)
    6145.44, 4312.70, 4145.14, 3130.79,
    
    -- WIND (67-69)
    1759.50, 2421.90, 660.00,
    
    -- ESTR (70-73)
    5519.21, 157.06, 1373.41, 2574.66,
    
    -- GUSO (74-79)
    824.35, 130.36, 1344.64, 348.82, 1269.96, 81.22,
    
    -- HVRF (80-81)
    7500.00, 2200.00,
    
    -- PLRF (82-89)
    1090.56, 3089.60, 322.92, 239.30, 326.25, 2059.73, 2574.67, 278.44,
    
    -- ELRF (90-92)
    1335.75, 1050.00, 2940.27,
    
    -- DRYW (93-97)
    1271.47, 318.73, 1969.62, 1998.97, 227.47,
    
    -- TDHW (98-116)
    1165.99, 157.94, 2619.10, 411.95, 400.00, 300.00, 288.62, 27.56, 302.25,
    122.95, 167.12, 1550.00, 17.24, 17.98, 35.61, 480.65, 405.48, 500.00, 40.73,
    
    -- TILE (117-137)
    679.30, 1001.83, 103.69, 518.51, 587.16, 522.04, 978.38, 1269.31, 214.71,
    449.53, 2400.00, 1557.50, 1200.00, 505.09, 182.32, 52.63, 1297.60, 1200.00,
    691.31, 224.95, 400.00,
    
    -- CAVN (138-140)
    4520.60, 4507.80, 1081.36,
    
    -- CNTP (141-144)
    2665.63, 164.37, 1415.00, 1485.00,
    
    -- FLOR (145-148)
    1808.84, 1784.13, 1812.56, 3081.36,
    
    -- PAIN (149-154)
    1000.00, 2445.93, 2445.93, 875.00, 600.00, 1275.00,
    
    -- PLTO (155-165)
    1235.84, 408.35, 839.52, 747.86, 39.79, 630.00, 3000.00, 500.00, 193.43,
    118.25, 500.00,
    
    -- ELTO (166-184)
    130.49, 235.76, 189.00, 21.59, 281.67, 474.73, 120.94, 68.84, 1544.80,
    158.60, 160.50, 140.81, 117.54, 68.37, 209.56, 9.99, 9.97, 63.58, 2523.17,
    
    -- APPL (185)
    888.96,
    
    -- DECK (186-191)
    1118.36, 129.56, 952.10, 129.17, 47.37, 5664.26,
    
    -- LAND (192-198)
    2600.00, 1600.00, 1800.00, 467.11, 149.44, 175.19, 155.88,
    
    -- POCL (199-202)
    600.00, 259.78, 1386.00, 631.35,
    
    -- OTHR (203-211)
    356.65, 1130.30, 202.25, 195.00, 189.22, 500.00, 10.00, 350.00, 150.00,
    
    -- HOLD (212-267)
    85.63, 343.97, 97.64, 1983.88, 5.56, 216.57, 348.82, 0.24, 240.00, 46.89,
    1983.88, 141.22, 71.29, 0.84, 9.99, 676.85, 99.59, 203.96, 240.00, 118.20,
    2043.13, 63.83, 495.37, 473.71, 107.52, 6.00, 183.77, 676.61, 240.00,
    1983.88, 130.38, 49.00, 49.00, 28.00, 309.63, 1663.20, 890.55, 1983.88,
    39.00, 314.47, 164.14, 128.76, 811.94, 487.23, 1786.57, 130.77, 1089.00,
    1089.00, 1983.88, 49.00, 444.67, 947.31, 294.97, 76.33, 382.19, 1983.88,
    
    -- CRED (268-274)
    44850.00, 30964.07, 25300.00, 18150.00, 7000.00, 25700.00, 19050.00
  ];
  
  -- Cash account IDs (which account the money comes from/goes to)
  -- 3=BANKT, 4=2989, 5=9271, 6=6370, 7=2908, 8=3946, 9=4441, 91=HM, 92=HELOC
  v_cash_accounts INT[] := ARRAY[
    -- CLOSING (1-24)
    3, 3, 92, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3,
    
    -- DEMO (25-38)
    3, 3, 3, 3, 3, 3, 3, 3, 7, 3, 7, 7, 3, 7,
    
    -- PERMITS (39-42)
    3, 3, 3, 3,
    
    -- CRFR (43-62)
    3, 3, 3, 3, 3, 3, 3, 3, 3, 7, 7, 7, 7, 7, 7, 7, 3, 3, 8, 8,
    
    -- ROOF (63-66)
    3, 3, 3, 3,
    
    -- WIND (67-69)
    7, 7, 7,
    
    -- ESTR (70-73)
    7, 3, 3, 3,
    
    -- GUSO (74-79)
    7, 7, 3, 7, 3, 3,
    
    -- HVRF (80-81)
    7, 7,
    
    -- PLRF (82-89)
    7, 7, 7, 7, 7, 7, 6, 3,
    
    -- ELRF (90-92)
    3, 7, 7,
    
    -- DRYW (93-97)
    7, 7, 3, 3, 3,
    
    -- TDHW (98-116)
    3, 3, 3, 3, 3, 8, 8, 8, 8, 8, 8, 3, 8, 3, 8, 3, 3, 3, 5,
    
    -- TILE (117-137)
    3, 7, 3, 3, 6, 3, 3, 7, 8, 8, 8, 8, 3, 8, 8, 8, 8, 3, 5, 5, 3,
    
    -- CAVN (138-140)
    7, 3, 3,
    
    -- CNTP (141-144)
    3, 8, 3, 3,
    
    -- FLOR (145-148)
    5, 5, 5, 3,
    
    -- PAIN (149-154)
    3, 8, 8, 3, 3, 3,
    
    -- PLTO (155-165)
    8, 8, 8, 8, 8, 3, 3, 3, 3, 3, 3,
    
    -- ELTO (166-184)
    8, 8, 3, 3, 3, 3, 8, 3, 5, 5, 5, 5, 5, 5, 5, 7, 8, 6, 5,
    
    -- APPL (185)
    5,
    
    -- DECK (186-191)
    6, 3, 3, 3, 3, 6,
    
    -- LAND (192-198)
    3, 3, 3, 5, 5, 5, 5,
    
    -- POCL (199-202)
    3, 3, 3, 8,
    
    -- OTHR (203-211)
    3, 5, 5, 3, 3, 3, 3, 3, 3,
    
    -- HOLD (212-267)
    3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 7, 7, 7, 7, 3, 3, 3, 3, 8,
    3, 8, 3, 8, 3, 3, 3, 3, 3, 3, 7, 6, 7, 8, 8, 3, 7, 3, 8,
    8, 5, 6, 3, 7, 3, 3, 8, 3, 3, 6, 5, 7, 8, 3, 3, 3,
    
    -- CRED (268-274)
    3, 3, 3, 3, 3, 3, 3
  ];
  
  -- Rehab category IDs
  v_categories INT[] := ARRAY[
    -- CLOSING (1-24) = 35 (CLSE) except 3 = CRED
    35, 35, 36, 35, 35, 35, 35, 35, 35, 35, 35, 35, 35, 35, 35, 35, 35, 35, 35, 35, 35, 35, 35, 35,
    
    -- DEMO (25-38) = 1 (IDEM) or 2 (ETRH)
    1, 1, 1, 1, 1, 1, 1, 1, 2, 1, 1, 1, 1, 2,
    
    -- PERMITS (39-42) = 32 (PENG) except 39-40 = 11 (CRFR)
    11, 11, 32, 32,
    
    -- CRFR (43-62) = 11
    11, 11, 11, 11, 11, 11, 11, 11, 11, 11, 11, 11, 11, 11, 11, 11, 11, 11, 11, 11,
    
    -- ROOF (63-66) = 6
    6, 6, 6, 6,
    
    -- WIND (67-69) = 7
    7, 7, 7,
    
    -- ESTR (70-73) = 8
    8, 8, 8, 8,
    
    -- GUSO (74-79) = 10
    10, 10, 10, 10, 10, 10,
    
    -- HVRF (80-81) = 12
    12, 12,
    
    -- PLRF (82-89) = 13
    13, 13, 13, 13, 13, 13, 13, 13,
    
    -- ELRF (90-92) = 14
    14, 14, 14,
    
    -- DRYW (93-97) = 16
    16, 16, 16, 16, 16,
    
    -- TDHW (98-116) = 17
    17, 17, 17, 17, 17, 17, 17, 17, 17, 17, 17, 17, 17, 17, 17, 17, 17, 17, 17,
    
    -- TILE (117-137) = 18
    18, 18, 18, 18, 18, 18, 18, 18, 18, 18, 18, 18, 18, 18, 18, 18, 18, 18, 18, 18, 18,
    
    -- CAVN (138-140) = 19
    19, 19, 19,
    
    -- CNTP (141-144) = 20
    20, 20, 20, 20,
    
    -- FLOR (145-148) = 21
    21, 21, 21, 21,
    
    -- PAIN (149-154) = 22
    22, 22, 22, 22, 22, 22,
    
    -- PLTO (155-165) = 25
    25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25,
    
    -- ELTO (166-184) = 26
    26, 26, 26, 26, 26, 26, 26, 26, 26, 26, 26, 26, 26, 26, 26, 26, 26, 26, 26,
    
    -- APPL (185) = 27
    27,
    
    -- DECK (186-191) = 29
    29, 29, 29, 29, 29, 29,
    
    -- LAND (192-198) = 30
    30, 30, 30, 30, 30, 30, 30,
    
    -- POCL (199-202) = 31
    31, 31, 31, 31,
    
    -- OTHR (203-211) = 33
    33, 33, 33, 33, 33, 33, 33, 33, 33,
    
    -- HOLD (212-267) = 34
    34, 34, 34, 34, 34, 34, 34, 34, 34, 34, 34, 34, 34, 34, 34, 34, 34, 34, 34, 34,
    34, 34, 34, 34, 34, 34, 34, 34, 34, 34, 34, 34, 34, 34, 34, 34, 34, 34, 34, 34,
    34, 34, 34, 34, 34, 34, 34, 34, 34, 34, 34, 34, 34, 34, 34, 34,
    
    -- CRED (268-274) = 36
    36, 36, 36, 36, 36, 36, 36
  ];
  
  -- Cost types: L=Labor, M=Material, S=Service/Other, NULL for non-rehab
  v_cost_types TEXT[] := ARRAY[
    -- CLOSING (1-24)
    NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
    NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
    
    -- DEMO (25-38)
    'L', 'M', 'L', 'S', 'L', 'S', 'L', 'S', 'S', 'S', 'S', 'S', 'S', 'S',
    
    -- PERMITS (39-42)
    'S', 'S', 'S', 'S',
    
    -- CRFR (43-62)
    'S', 'L', 'M', 'M', 'M', 'M', 'M', 'M', 'M', 'M', 'L', 'M', 'L', 'L', 'M', 'L', 'M', 'M', 'M', 'M',
    
    -- ROOF (63-66)
    'M', 'M', 'M', 'L',
    
    -- WIND (67-69)
    'M', 'M', 'L',
    
    -- ESTR (70-73)
    'M', 'M', 'M', 'L',
    
    -- GUSO (74-79)
    'M', 'L', 'L', 'L', 'L', 'L',
    
    -- HVRF (80-81)
    'L', 'L',
    
    -- PLRF (82-89)
    'M', 'L', 'M', 'M', 'M', 'L', 'L', 'M',
    
    -- ELRF (90-92)
    'M', 'L', 'L',
    
    -- DRYW (93-97)
    'M', 'M', 'L', 'L', 'S',
    
    -- TDHW (98-116)
    'M', 'M', 'M', 'L', 'L', 'S', 'M', 'M', 'M', 'M', 'M', 'L', 'M', 'M', 'M', 'M', 'M', 'L', 'M',
    
    -- TILE (117-137)
    'M', 'M', 'M', 'M', 'M', 'M', 'L', 'L', 'M', 'M', 'S', 'L', 'S', 'M', 'M', 'M', 'L', 'S', 'M', 'M', 'L',
    
    -- CAVN (138-140)
    'M', 'M', 'L',
    
    -- CNTP (141-144)
    'L', 'L', 'L', 'L',
    
    -- FLOR (145-148)
    'M', 'M', 'L', 'L',
    
    -- PAIN (149-154)
    'L', 'L', 'L', 'L', 'L', 'L',
    
    -- PLTO (155-165)
    'L', 'M', 'L', 'M', 'M', 'L', 'L', 'L', 'M', 'M', 'L',
    
    -- ELTO (166-184)
    'M', 'M', 'M', 'M', 'M', 'M', 'M', 'M', 'L', 'M', 'M', 'M', 'M', 'M', 'M', 'S', 'M', 'M', 'L',
    
    -- APPL (185)
    'M',
    
    -- DECK (186-191)
    'M', 'M', 'M', 'M', 'M', 'L',
    
    -- LAND (192-198)
    'L', 'L', 'L', 'M', 'M', 'M', 'M',
    
    -- POCL (199-202)
    'L', 'M', 'L', 'M',
    
    -- OTHR (203-211)
    'S', 'S', 'S', 'S', 'M', 'S', 'S', 'S', 'L',
    
    -- HOLD (212-267)
    'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S',
    'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S',
    'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S',
    
    -- CRED (268-274)
    NULL, NULL, NULL, NULL, NULL, NULL, NULL
  ];
  
  -- Transaction types: E=Expense, I=Income/Refund, C=Credit/Funding
  v_tx_types TEXT[] := ARRAY[
    -- CLOSING (1-24)
    'E', 'E', 'C', 'E', 'E', 'E', 'E', 'E', 'E', 'E', 'E', 'E', 'E', 'E', 'E', 'E', 'E', 'E', 'E', 'E', 'I', 'E', 'E', 'E',
    
    -- DEMO (25-38)
    'E', 'E', 'E', 'E', 'E', 'E', 'E', 'E', 'E', 'E', 'E', 'E', 'E', 'E',
    
    -- PERMITS (39-42)
    'E', 'E', 'E', 'E',
    
    -- CRFR (43-62)
    'E', 'E', 'E', 'I', 'E', 'E', 'E', 'E', 'E', 'E', 'E', 'E', 'E', 'E', 'E', 'E', 'E', 'E', 'E', 'E',
    
    -- ROOF (63-66)
    'E', 'E', 'I', 'E',
    
    -- WIND (67-69)
    'E', 'E', 'E',
    
    -- ESTR (70-73)
    'E', 'E', 'E', 'E',
    
    -- GUSO (74-79)
    'E', 'E', 'E', 'E', 'E', 'E',
    
    -- HVRF (80-81)
    'E', 'E',
    
    -- PLRF (82-89)
    'E', 'E', 'E', 'E', 'E', 'E', 'E', 'E',
    
    -- ELRF (90-92)
    'E', 'E', 'E',
    
    -- DRYW (93-97)
    'E', 'E', 'E', 'E', 'E',
    
    -- TDHW (98-116)
    'E', 'E', 'E', 'E', 'I', 'E', 'E', 'E', 'E', 'E', 'E', 'E', 'E', 'E', 'E', 'E', 'E', 'E', 'E',
    
    -- TILE (117-137)
    'E', 'E', 'E', 'E', 'E', 'E', 'E', 'E', 'E', 'E', 'E', 'E', 'I', 'E', 'E', 'E', 'E', 'E', 'E', 'E', 'E',
    
    -- CAVN (138-140)
    'E', 'E', 'E',
    
    -- CNTP (141-144)
    'E', 'E', 'I', 'E',
    
    -- FLOR (145-148)
    'E', 'E', 'E', 'E',
    
    -- PAIN (149-154)
    'E', 'E', 'E', 'E', 'E', 'E',
    
    -- PLTO (155-165)
    'E', 'E', 'E', 'E', 'E', 'E', 'E', 'I', 'E', 'E', 'E',
    
    -- ELTO (166-184)
    'E', 'E', 'E', 'E', 'E', 'E', 'E', 'E', 'E', 'E', 'E', 'I', 'E', 'E', 'E', 'E', 'I', 'I', 'E',
    
    -- APPL (185)
    'E',
    
    -- DECK (186-191)
    'E', 'E', 'E', 'E', 'E', 'E',
    
    -- LAND (192-198)
    'E', 'I', 'E', 'E', 'E', 'E', 'E',
    
    -- POCL (199-202)
    'E', 'E', 'E', 'E',
    
    -- OTHR (203-211)
    'E', 'E', 'E', 'E', 'E', 'E', 'E', 'E', 'E',
    
    -- HOLD (212-267)
    'E', 'E', 'E', 'E', 'E', 'E', 'E', 'I', 'E', 'E', 'E', 'E', 'E', 'E', 'E', 'E', 'E', 'E', 'E', 'E',
    'E', 'E', 'E', 'E', 'E', 'E', 'E', 'E', 'E', 'E', 'E', 'E', 'E', 'E', 'E', 'E', 'E', 'E', 'E', 'E',
    'E', 'I', 'E', 'I', 'E', 'E', 'I', 'E', 'E', 'E', 'E', 'E', 'E', 'E', 'E', 'E',
    
    -- CRED (268-274)
    'C', 'E', 'C', 'C', 'C', 'C', 'C'
  ];
  
  -- Vendor IDs (NULL if no vendor)
  v_vendor_ids INT[] := ARRAY[
    -- CLOSING (1-24)
    NULL, NULL, NULL, 30, 30, 30, 30, 30, 30, NULL, NULL, 31, 31, 31, 31, 31, 31, 31, 31, 31, 31, 32, NULL, NULL,
    
    -- DEMO (25-38)
    NULL, NULL, NULL, 26, NULL, 26, NULL, 26, 26, 26, 26, 26, 26, 26,
    
    -- PERMITS (39-42)
    NULL, 28, 29, NULL,
    
    -- CRFR (43-62)
    27, NULL, 4, 4, 4, 21, 4, 21, 4, 4, NULL, 4, NULL, NULL, 4, NULL, 4, NULL, 4, 4,
    
    -- ROOF (63-66)
    4, 4, 4, NULL,
    
    -- WIND (67-69)
    24, 24, NULL,
    
    -- ESTR (70-73)
    22, 4, 22, NULL,
    
    -- GUSO (74-79)
    22, NULL, NULL, NULL, NULL, NULL,
    
    -- HVRF (80-81)
    NULL, NULL,
    
    -- PLRF (82-89)
    4, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
    
    -- ELRF (90-92)
    4, NULL, NULL,
    
    -- DRYW (93-97)
    NULL, NULL, NULL, NULL, NULL,
    
    -- TDHW (98-116)
    23, 4, 23, NULL, NULL, 36, 4, 23, 4, 23, 4, NULL, 4, 25, 4, NULL, NULL, NULL, NULL,
    
    -- TILE (117-137)
    4, 7, 7, 7, 7, 4, NULL, NULL, 4, 4, NULL, NULL, NULL, 7, 7, 4, NULL, NULL, 7, 7, NULL,
    
    -- CAVN (138-140)
    NULL, 11, NULL,
    
    -- CNTP (141-144)
    NULL, NULL, NULL, NULL,
    
    -- FLOR (145-148)
    NULL, 3, NULL, NULL,
    
    -- PAIN (149-154)
    NULL, NULL, NULL, NULL, NULL, NULL,
    
    -- PLTO (155-165)
    NULL, 4, NULL, 4, 4, NULL, NULL, NULL, NULL, NULL, NULL,
    
    -- ELTO (166-184)
    25, 25, 25, NULL, NULL, NULL, NULL, NULL, NULL, 25, 25, NULL, 4, 4, 25, NULL, 4, 25, NULL,
    
    -- APPL (185)
    NULL,
    
    -- DECK (186-191)
    NULL, NULL, NULL, NULL, NULL, NULL,
    
    -- LAND (192-198)
    NULL, NULL, NULL, 4, 4, 4, 4,
    
    -- POCL (199-202)
    NULL, 4, NULL, 4,
    
    -- OTHR (203-211)
    NULL, NULL, NULL, NULL, 4, NULL, NULL, NULL, NULL,
    
    -- HOLD (212-267)
    NULL, 34, NULL, 30, NULL, NULL, NULL, NULL, 30, NULL, 30, NULL, NULL, NULL, NULL, 34, NULL, NULL, 30, NULL,
    30, NULL, NULL, NULL, NULL, NULL, NULL, 34, 30, 30, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 30, NULL, NULL,
    NULL, NULL, 34, NULL, NULL, 35, NULL, NULL, 30, NULL, NULL, NULL, NULL, 35, 34, 30,
    
    -- CRED (268-274)
    NULL, NULL, 30, 30, NULL, 30, 30
  ];
  
  -- Installer IDs (NULL if no installer)
  v_installer_ids INT[] := ARRAY[
    -- CLOSING (1-24)
    NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
    
    -- DEMO (25-38)
    2, 27, 27, NULL, 2, NULL, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
    
    -- PERMITS (39-42)
    30, NULL, NULL, NULL,
    
    -- CRFR (43-62)
    NULL, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 24, 24, NULL, 10, 5, NULL, 10, NULL, NULL, NULL, NULL,
    
    -- ROOF (63-66)
    NULL, NULL, NULL, 23,
    
    -- WIND (67-69)
    NULL, NULL, 10,
    
    -- ESTR (70-73)
    NULL, NULL, NULL, 10,
    
    -- GUSO (74-79)
    NULL, 10, 10, 26, 26, 26,
    
    -- HVRF (80-81)
    NULL, NULL,
    
    -- PLRF (82-89)
    NULL, 21, NULL, NULL, NULL, 21, 21, NULL,
    
    -- ELRF (90-92)
    NULL, 22, 22,
    
    -- DRYW (93-97)
    NULL, NULL, 14, 14, 14,
    
    -- TDHW (98-116)
    NULL, NULL, NULL, 10, 10, NULL, NULL, NULL, NULL, NULL, NULL, 14, NULL, NULL, NULL, NULL, NULL, 6, NULL,
    
    -- TILE (117-137)
    NULL, NULL, NULL, NULL, NULL, NULL, 5, 5, NULL, NULL, 29, 5, 29, NULL, NULL, NULL, 5, 29, NULL, NULL, 5,
    
    -- CAVN (138-140)
    NULL, NULL, 25,
    
    -- CNTP (141-144)
    17, 17, 17, 17,
    
    -- FLOR (145-148)
    NULL, NULL, 1, 1,
    
    -- PAIN (149-154)
    14, 14, 14, 14, 14, 14,
    
    -- PLTO (155-165)
    8, NULL, 21, NULL, NULL, 21, 21, 21, NULL, NULL, 21,
    
    -- ELTO (166-184)
    NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 22, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 22,
    
    -- APPL (185)
    NULL,
    
    -- DECK (186-191)
    NULL, NULL, NULL, NULL, NULL, 10,
    
    -- LAND (192-198)
    14, 14, 14, NULL, NULL, NULL, NULL,
    
    -- POCL (199-202)
    14, NULL, 14, NULL,
    
    -- OTHR (203-211)
    NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 28,
    
    -- HOLD (212-267)
    NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
    NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
    NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
    
    -- CRED (268-274)
    NULL, NULL, NULL, NULL, NULL, NULL, NULL
  ];
  
  -- Funding source for CRED transactions (91=HM, 92=HELOC)
  v_funding_sources INT[] := ARRAY[92, 3, 91, 91, 92, 91, 91];
  v_funding_idx INT := 0;

  v_expense_account INT;
  v_amount NUMERIC;
  v_cash_account INT;
  v_funding_source INT;
  
BEGIN
  RAISE NOTICE 'Starting Stoneleigh flip import...';
  RAISE NOTICE 'Total transactions to import: %', array_length(v_dates, 1);
  
  FOR i IN 1..array_length(v_dates, 1) LOOP
    v_amount := v_amounts[i];
    v_cash_account := v_cash_accounts[i];
    
    -- Determine expense account based on cost type
    IF v_cost_types[i] = 'L' THEN
      v_expense_account := v_labor_account;
    ELSIF v_cost_types[i] = 'M' THEN
      v_expense_account := v_materials_account;
    ELSE
      v_expense_account := v_materials_account;  -- Default for S/NULL
    END IF;
    
    -- Special handling for HOLD interest items
    IF v_categories[i] = 34 AND (v_descriptions[i] ILIKE '%interest%' OR v_descriptions[i] ILIKE '%MTG%') THEN
      v_expense_account := v_interest_account;
    END IF;
    
    -- Create transaction
    INSERT INTO transactions (date, description)
    VALUES (v_dates[i]::date, v_descriptions[i])
    RETURNING id INTO v_tx_id;
    
    -- Handle different transaction types
    IF v_tx_types[i] = 'E' THEN
      -- EXPENSE: Debit expense, Credit cash
      INSERT INTO transaction_lines (
        transaction_id, account_id, amount, real_estate_deal_id, 
        rehab_category_id, cost_type, vendor_id, installer_id, purpose, is_cleared
      ) VALUES (
        v_tx_id, v_expense_account, v_amount, v_deal_id,
        v_categories[i], v_cost_types[i], v_vendor_ids[i], v_installer_ids[i], 'business', true
      );
      
      INSERT INTO transaction_lines (
        transaction_id, account_id, amount, real_estate_deal_id,
        rehab_category_id, cost_type, vendor_id, installer_id, purpose, is_cleared
      ) VALUES (
        v_tx_id, v_cash_account, -v_amount, v_deal_id,
        v_categories[i], v_cost_types[i], v_vendor_ids[i], v_installer_ids[i], 'business', true
      );
      
    ELSIF v_tx_types[i] = 'I' THEN
      -- INCOME/REFUND: Debit cash, Credit expense (negative expense)
      INSERT INTO transaction_lines (
        transaction_id, account_id, amount, real_estate_deal_id,
        rehab_category_id, cost_type, vendor_id, installer_id, purpose, is_cleared
      ) VALUES (
        v_tx_id, v_cash_account, v_amount, v_deal_id,
        v_categories[i], v_cost_types[i], v_vendor_ids[i], v_installer_ids[i], 'business', true
      );
      
      INSERT INTO transaction_lines (
        transaction_id, account_id, amount, real_estate_deal_id,
        rehab_category_id, cost_type, vendor_id, installer_id, purpose, is_cleared
      ) VALUES (
        v_tx_id, v_expense_account, -v_amount, v_deal_id,
        v_categories[i], v_cost_types[i], v_vendor_ids[i], v_installer_ids[i], 'business', true
      );
      
    ELSIF v_tx_types[i] = 'C' THEN
      -- CREDIT/FUNDING: Debit bank, Credit liability (loan/HELOC)
      v_funding_idx := v_funding_idx + 1;
      v_funding_source := v_funding_sources[v_funding_idx];
      
      -- Debit bank (money coming in)
      INSERT INTO transaction_lines (
        transaction_id, account_id, amount, real_estate_deal_id,
        rehab_category_id, vendor_id, purpose, is_cleared
      ) VALUES (
        v_tx_id, v_bankt, v_amount, v_deal_id,
        v_categories[i], v_vendor_ids[i], 'business', true
      );
      
      -- Credit liability (loan balance increases)
      INSERT INTO transaction_lines (
        transaction_id, account_id, amount, real_estate_deal_id,
        rehab_category_id, vendor_id, purpose, is_cleared
      ) VALUES (
        v_tx_id, v_funding_source, -v_amount, v_deal_id,
        v_categories[i], v_vendor_ids[i], 'business', true
      );
    END IF;
    
    IF i % 50 = 0 THEN
      RAISE NOTICE 'Processed % transactions...', i;
    END IF;
  END LOOP;
  
  RAISE NOTICE 'Import complete! Total transactions created: %', array_length(v_dates, 1);
END $$;
