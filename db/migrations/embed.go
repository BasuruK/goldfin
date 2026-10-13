package migrations

import "embed"

// FS holds goose SQL migrations so `goldfin migrate` does not depend on cwd.
//
//go:embed *.sql
var FS embed.FS
