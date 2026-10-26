package azureocr

import "embed"

//go:embed testdata/*
var fixtureFS embed.FS

// ponytail: move fixtures to a test-only package if the embedded set grows.
// OpenFixture returns recorded provider fixtures for tests.
func OpenFixture(name string) ([]byte, error) {
	return fixtureFS.ReadFile("testdata/" + name)
}
