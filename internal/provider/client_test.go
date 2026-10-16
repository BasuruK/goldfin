package provider

import (
	"context"
	"errors"
	"net"
	"net/http"
	"net/http/httptest"
	"net/netip"
	"net/url"
	"strings"
	"syscall"
	"testing"
	"time"
)

func TestBlockedAddr(t *testing.T) {
	for _, tc := range []struct {
		address string
		blocked bool
	}{
		{"", true}, {"0.1.2.3", true}, {"10.1.2.3", true},
		{"100.64.0.1", true}, {"127.0.0.1", true}, {"169.254.169.254", true},
		{"172.16.0.1", true}, {"192.0.0.1", true}, {"192.0.2.1", true},
		{"192.168.1.1", true}, {"198.18.0.1", true}, {"198.51.100.1", true},
		{"203.0.113.1", true}, {"224.0.0.1", true}, {"240.0.0.1", true},
		{"255.255.255.255", true}, {"::", true}, {"::1", true},
		{"::ffff:127.0.0.1", true}, {"::ffff:10.1.2.3", true},
		{"64:ff9b::a00:1", true}, {"2001:db8::1", true},
		{"::a00:1", true}, {"64:ff9b:1::a00:1", true},
		{"100::1", true}, {"100:0:0:1::1", true}, {"2001::1", true},
		{"2001:2::1", true}, {"2002:a00:1::1", true},
		{"3fff::1", true}, {"5f00::1", true}, {"fec0::1", true},
		{"192.88.99.1", true},
		{"fc00::1", true}, {"fe80::1", true}, {"ff02::1", true},
		{"1.1.1.1", false}, {"8.8.8.8", false},
		{"::ffff:8.8.8.8", false}, {"2001:4860:4860::8888", false},
	} {
		var addr netip.Addr
		if tc.address != "" {
			addr = netip.MustParseAddr(tc.address)
		}
		if got := blockedAddr(addr); got != tc.blocked {
			t.Errorf("%q: blocked=%v, want %v", tc.address, got, tc.blocked)
		}
	}
}

func TestDialPublicBoundsDetachedConnectionWork(t *testing.T) {
	controlled := false
	dialer := &net.Dialer{ControlContext: func(ctx context.Context, _, _ string, _ syscall.RawConn) error {
		controlled = true
		deadline, ok := ctx.Deadline()
		if !ok || time.Until(deadline) > 10*time.Second {
			t.Error("DNS and connection attempts need their own total dial deadline")
		}
		return errors.New("fixture stops before any external connection")
	}}
	_, err := dialPublic(context.WithoutCancel(t.Context()), dialer, "tcp", "8.8.8.8:443")
	if err == nil || !controlled {
		t.Fatalf("socket fixture not reached: %v", err)
	}
}

func TestDefaultHTTPClientRedirectPolicy(t *testing.T) {
	sink := httptest.NewServer(http.HandlerFunc(func(_ http.ResponseWriter, _ *http.Request) {
		t.Error("redirect sent a request to a different origin")
	}))
	t.Cleanup(sink.Close)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/same":
			http.Redirect(w, r, "/done", http.StatusTemporaryRedirect)
		case "/cross":
			http.Redirect(w, r, sink.URL, http.StatusTemporaryRedirect)
		case "/loop":
			http.Redirect(w, r, "/loop", http.StatusTemporaryRedirect)
		case "/done":
			if r.Header.Get("Authorization") != "Bearer test-credential" {
				t.Error("same-origin redirect lost its Credential")
			}
			w.WriteHeader(http.StatusNoContent)
		}
	}))
	t.Cleanup(server.Close)
	policy := DefaultHTTPClient()
	t.Cleanup(policy.CloseIdleConnections)
	client := server.Client()
	client.CheckRedirect = policy.CheckRedirect
	for _, tc := range []struct {
		path string
		ok   bool
	}{{"same", true}, {"cross", false}, {"loop", false}} {
		endpoint, err := url.Parse(server.URL)
		if err != nil {
			t.Fatal(err)
		}
		finding, err := CheckWebRequest(t.Context(), client, endpoint.JoinPath(tc.path).String(), "test-credential")
		if tc.ok != (err == nil) || (tc.ok && finding.Kind != "reachable") {
			t.Errorf("%s: finding=%+v, error=%v", tc.path, finding, err)
		}
	}
}

func TestDefaultHTTPClientBlocksLocalAddressesAndProxy(t *testing.T) {
	proxy := httptest.NewServer(http.HandlerFunc(func(_ http.ResponseWriter, _ *http.Request) {
		t.Error("environment proxy bypassed destination checks")
	}))
	t.Cleanup(proxy.Close)
	t.Setenv("HTTP_PROXY", proxy.URL)
	t.Setenv("HTTPS_PROXY", proxy.URL)
	client := DefaultHTTPClient()
	t.Cleanup(client.CloseIdleConnections)
	for _, target := range []string{"http://127.0.0.1/", "https://127.0.0.1/", "https://[::1]/", "http://192.0.2.1/", "https://192.0.2.1/"} {
		req, err := http.NewRequestWithContext(t.Context(), http.MethodHead, target, nil)
		if err != nil {
			t.Fatal(err)
		}
		res, err := client.Do(req)
		if err == nil {
			_ = res.Body.Close()
			t.Errorf("local address allowed: %s", target)
		} else if !strings.Contains(err.Error(), "blocked destination") {
			t.Errorf("destination was not rejected by policy: %v", err)
		}
	}
}
