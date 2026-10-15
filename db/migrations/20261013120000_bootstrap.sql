-- Pipeline tracer: proves migrate runs end to end. The first real table replaces it.
-- +goose Up
SELECT 1;

-- +goose Down
SELECT 1;
