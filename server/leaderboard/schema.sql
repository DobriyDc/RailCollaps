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

-- The request limit: one row per player, the current window and its counter.
CREATE TABLE IF NOT EXISTS rate (
    user_id INTEGER PRIMARY KEY,
    win     INTEGER NOT NULL,
    hits    INTEGER NOT NULL
);
