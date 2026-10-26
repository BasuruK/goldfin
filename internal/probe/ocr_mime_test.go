package probe

import (
	"strings"
	"testing"
)

func TestNormalizeDocumentMIME(t *testing.T) {
	pdfHeader := strings.Repeat(" ", 600) + "%PDF-1.4\n"
	jpeg := []byte{0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10}

	for _, tc := range []struct {
		name   string
		header string
		body   []byte
		want   string
	}{
		{"plain_text_as_pdf", "application/pdf", []byte("not a pdf"), ""},
		{"jpeg_labelled_pdf", "application/pdf", jpeg, ""},
		{"pdf_beyond_sniff_window", "application/pdf", []byte(pdfHeader), "application/pdf"},
		{"jpeg_declared", "image/jpeg", jpeg, "image/jpeg"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if got := normalizeDocumentMIME(tc.header, tc.body); got != tc.want {
				t.Fatalf("normalizeDocumentMIME: got %q want %q", got, tc.want)
			}
		})
	}
}
