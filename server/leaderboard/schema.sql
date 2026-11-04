-- The leaderboard of Rail Link: Collapse (D1). Stored about a player: the Telegram id, the name to
-- show, the meters, the season (COLLAPSE_RULES_VERSION), the date (unix seconds). A new season leaves
-- the old rows where they are.
CREATE TABLE IF NOT EXISTS scores (
    season  INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    name    TEXT    NOT NULL,
    meters  INTEGER NOT NULL,
    at      INTEGER NOT NULL,
    PRIMARY KEY (season, user_id)
);
CREATE INDEX IF NOT EXISTS scores_top ON scores (season, meters DESC, at ASC, user_id ASC);

-- The daily run: one track a day for everyone (CollapseDaily in js/CollapseStationRules.js), the player's best
-- of the day. A run of that day's seed also counts in its season above.
CREATE TABLE IF NOT EXISTS daily (
    day     INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    name    TEXT    NOT NULL,
    meters  INTEGER NOT NULL,
    at      INTEGER NOT NULL,
    PRIMARY KEY (day, user_id)
);
CREATE INDEX IF NOT EXISTS daily_top ON daily (day, meters DESC, at ASC, user_id ASC);

-- The shop: one row per train a player owns, written only from Telegram's report of a payment. The charge
-- id is what a refund needs; a refund removes the row.
CREATE TABLE IF NOT EXISTS purchases (
    user_id   INTEGER NOT NULL,
    item      TEXT    NOT NULL,
    charge_id TEXT    NOT NULL,
    stars     INTEGER NOT NULL,
    at        INTEGER NOT NULL,
    PRIMARY KEY (user_id, item)
);
CREATE INDEX IF NOT EXISTS purchases_charge ON purchases (charge_id);

-- Donations: one row per payment, the sum the player chose. They buy nothing; a refund removes the row.
CREATE TABLE IF NOT EXISTS donations (
    charge_id TEXT    PRIMARY KEY,
    user_id   INTEGER NOT NULL,
    stars     INTEGER NOT NULL,
    at        INTEGER NOT NULL
);

-- The request limit: one row per player, the current window and its counter.
CREATE TABLE IF NOT EXISTS rate (
    user_id INTEGER PRIMARY KEY,
    win     INTEGER NOT NULL,
    hits    INTEGER NOT NULL
);
