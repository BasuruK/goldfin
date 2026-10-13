package provider

import (
	"net"
	"net/http"
	"strings"
	"testing"
	"time"
)

func TestBlockedIP(t *testing.T) {
	blocked := []string{
		"127.0.0.1", "10.1.2.3", "172.16.0.1", "192.168.1.1", "169.254.169.254",
		"100.64.0.1", "198.18.0.1", "240.0.0.1",
		"0.0.0.0", "::", "::ffff:0.0.0.0",
		"::1", "fe80::1", "fc00::1", "::ffff:127.0.0.1",
	}
	for _, raw := range blocked {
		if !blockedIP(net.ParseIP(raw)) {
			t.Errorf("%s should be blocked", raw)
		}
	}
	for _, raw := range []string{"1.1.1.1", "8.8.8.8", "2001:4860:4860::8888"} {
		if blockedIP(net.ParseIP(raw)) {
			t.Errorf("%s should be allowed", raw)
		}
	}
}

func TestDefaultHTTPClientRejectsInsecureAndLocalDestinations(t *testing.T) {
	client := DefaultHTTPClient()
	client.Timeout = 2 * time.Second
	for _, target := range []string{"http://example.com/v1/models", "https://127.0.0.1/", "https://localhost/"} {
		req, err := http.NewRequest(http.MethodGet, target, nil)
		if err != nil {
			t.Fatal(err)
		}
		_, err = client.Do(req)
		if err == nil {
			t.Fatalf("%s: expected rejection", target)
		}
		if !strings.Contains(err.Error(), "https required") && !strings.Contains(err.Error(), "blocked destination") {
			t.Fatalf("%s: %v", target, err)
		}
	}
}
