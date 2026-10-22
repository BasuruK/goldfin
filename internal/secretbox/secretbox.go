// Package secretbox encrypts Credentials at rest. The API encrypts and never decrypts (ADR 0013).
package secretbox

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"errors"
)

// Box owns AES-256-GCM state; construct it with New.
type Box struct{ aead cipher.AEAD }

// New requires a 32-byte encryption key supplied by the application owner.
func New(key []byte) (*Box, error) {
	if len(key) != 32 {
		return nil, errors.New("encrypt Credential: a 32-byte key is required")
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	aead, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	return &Box{aead: aead}, nil
}

// Encrypt prepends a fresh nonce and authenticates the value.
func (b *Box) Encrypt(plain []byte) ([]byte, error) {
	nonce := make([]byte, b.aead.NonceSize())
	if _, err := rand.Read(nonce); err != nil {
		return nil, err
	}
	return b.aead.Seal(nonce, nonce, plain, nil), nil
}

// Decrypt authenticates before returning plaintext; only the code that makes the outbound call may use it.
func (b *Box) Decrypt(encrypted []byte) ([]byte, error) {
	nonceSize := b.aead.NonceSize()
	if len(encrypted) < nonceSize {
		return nil, errors.New("decrypt Credential: invalid ciphertext")
	}
	plain, err := b.aead.Open(nil, encrypted[:nonceSize], encrypted[nonceSize:], nil)
	if err != nil {
		return nil, errors.New("decrypt Credential: invalid ciphertext")
	}
	return plain, nil
}
