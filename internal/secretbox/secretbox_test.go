package secretbox_test

import (
	"bytes"
	"testing"

	"github.com/BasuruK/goldfin/internal/secretbox"
)

func TestCredentialBox(t *testing.T) {
	for _, size := range []int{0, 16, 24, 31, 33} {
		if _, err := secretbox.New(bytes.Repeat([]byte{1}, size)); err == nil {
			t.Errorf("accepted a %d-byte key", size)
		}
	}
	box, err := secretbox.New(bytes.Repeat([]byte{1}, 32))
	if err != nil {
		t.Fatal(err)
	}
	plain := []byte("fixture-Credential-plaintext")
	encrypted, err := box.Encrypt(plain)
	if err != nil {
		t.Fatal(err)
	}
	second, err := box.Encrypt(plain)
	if err != nil {
		t.Fatal(err)
	}
	if bytes.Contains(encrypted, plain) || bytes.Equal(encrypted, second) {
		t.Fatal("Credential must be encrypted with a fresh nonce")
	}
	decrypted, err := box.Decrypt(encrypted)
	if err != nil || !bytes.Equal(decrypted, plain) {
		t.Fatal("encrypted Credential did not round-trip")
	}
	other, err := secretbox.New(bytes.Repeat([]byte{2}, 32))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := other.Decrypt(encrypted); err == nil {
		t.Fatal("wrong key accepted")
	}
	tampered := bytes.Clone(encrypted)
	tampered[len(tampered)-1] ^= 1
	for _, invalid := range [][]byte{nil, encrypted[:5], tampered} {
		if result, err := box.Decrypt(invalid); err == nil || len(result) != 0 {
			t.Fatal("invalid ciphertext produced plaintext")
		}
	}
}
