package provider

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"
)

func TestCheckWebRequestSendsHEAD(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodHead || r.RequestURI != "/check?probe=1" {
			t.Errorf("request: %s %s", r.Method, r.RequestURI)
		}
		if got := r.Header.Get("Authorization"); got != "Bearer test-credential" {
			t.Errorf("Authorization: %q", got)
		}
		w.WriteHeader(http.StatusNoContent)
	}))
	t.Cleanup(server.Close)
	endpoint, err := url.Parse(server.URL)
	if err != nil {
		t.Fatal(err)
	}
	endpoint = endpoint.JoinPath("check")
	endpoint.RawQuery = "probe=1"
	finding, err := (&Client{http: server.Client()}).CheckWebRequest(t.Context(), endpoint.String(), "test-credential")
	if err != nil {
		t.Fatal(err)
	}
	if finding.Kind != "reachable" || finding.HTTPStatus != http.StatusNoContent || finding.Latency <= 0 {
		t.Fatalf("finding: %+v", finding)
	}
}

func TestNewClientAlwaysEnforcesDestinationPolicy(t *testing.T) {
	client := NewClient()
	t.Cleanup(client.CloseIdleConnections)
	finding, err := client.CheckWebRequest(t.Context(), "http://127.0.0.1/", "")
	if err == nil || finding.Kind != "" {
		t.Fatalf("unsafe destination accepted: %+v, %v", finding, err)
	}
}

func TestCheckWebRequestRejectsUnsafeRequests(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(_ http.ResponseWriter, _ *http.Request) {
		t.Error("unsafe request reached the endpoint")
	}))
	t.Cleanup(server.Close)
	for _, tc := range []struct{ endpoint, credential string }{
		{"http://[credential-canary", ""},
		{"/relative/credential-canary", ""},
		{"ftp://credential-canary.invalid/", ""},
		{"https://user:credential-canary@host.invalid/", ""},
		{server.URL, "credential-canary\r\nInjected: yes"},
	} {
		finding, err := (&Client{http: server.Client()}).CheckWebRequest(t.Context(), tc.endpoint, tc.credential)
		if err == nil || finding.Kind != "" {
			t.Errorf("unsafe request accepted: %+v, %v", finding, err)
			continue
		}
		if strings.Contains(err.Error(), "credential-canary") || strings.Contains(err.Error(), server.URL) {
			t.Errorf("unsafe error: %v", err)
		}
	}
}

func TestCheckWebRequestCancellationAndDeadline(t *testing.T) {
	started := make(chan struct{})
	server := httptest.NewServer(http.HandlerFunc(func(_ http.ResponseWriter, r *http.Request) {
		close(started)
		<-r.Context().Done()
	}))
	t.Cleanup(server.Close)
	ctx, cancel := context.WithCancel(t.Context())
	t.Cleanup(cancel)
	finished := make(chan error, 1)
	go func() {
		finding, err := (&Client{http: server.Client()}).CheckWebRequest(ctx, server.URL, "")
		if finding.Kind != "" {
			t.Errorf("cancelled request produced finding: %+v", finding)
		}
		finished <- err
	}()
	select {
	case <-started:
	case <-time.After(time.Second):
		t.Fatal("HEAD did not reach the fixture")
	}
	cancel()
	select {
	case err := <-finished:
		if !errors.Is(err, context.Canceled) {
			t.Fatalf("cancellation: %v", err)
		}
	case <-time.After(time.Second):
		t.Fatal("request did not stop after cancellation")
	}
	deadline, stop := context.WithDeadline(t.Context(), time.Now().Add(-time.Second))
	defer stop()
	if finding, err := (&Client{http: server.Client()}).CheckWebRequest(deadline, server.URL, ""); !errors.Is(err, context.DeadlineExceeded) || finding.Kind != "" {
		t.Fatalf("deadline: %+v, %v", finding, err)
	}
}

func TestCheckWebRequestRejectsFailedStatus(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusServiceUnavailable)
	}))
	t.Cleanup(server.Close)
	finding, err := (&Client{http: server.Client()}).CheckWebRequest(t.Context(), server.URL, "credential-canary")
	if err == nil || finding.Kind != "" || finding.HTTPStatus != http.StatusServiceUnavailable {
		t.Fatalf("failed HEAD: finding=%+v, error=%v", finding, err)
	}
	if strings.Contains(err.Error(), "credential-canary") || strings.Contains(err.Error(), server.URL) {
		t.Fatalf("unsafe error: %v", err)
	}
}

func TestCheckWebRequestOmitsAbsentCredential(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if got := r.Header.Get("Authorization"); got != "" {
			t.Errorf("unexpected Authorization: %q", got)
		}
		w.WriteHeader(http.StatusOK)
	}))
	t.Cleanup(server.Close)
	if _, err := (&Client{http: server.Client()}).CheckWebRequest(t.Context(), server.URL, ""); err != nil {
		t.Fatal(err)
	}
}

type roundTripFunc func(*http.Request) (*http.Response, error)

func (f roundTripFunc) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }

func TestCheckWebRequestBoundsWholeRequest(t *testing.T) {
	client := &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
		deadline, ok := r.Context().Deadline()
		if !ok || time.Until(deadline) > 30*time.Second {
			t.Error("HEAD must have a total deadline of at most 30 seconds")
		}
		return &http.Response{StatusCode: http.StatusNoContent, Body: http.NoBody}, nil
	})}
	if _, err := (&Client{http: client}).CheckWebRequest(t.Context(), "https://endpoint.invalid/check", ""); err != nil {
		t.Fatal(err)
	}
}

func TestConcurrentChecksKeepCredentialsAndFindingsIsolated(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.Header.Get("Authorization") {
		case "Bearer first-check":
			w.WriteHeader(http.StatusOK)
		case "Bearer second-check":
			w.WriteHeader(http.StatusNoContent)
		default:
			w.WriteHeader(http.StatusUnauthorized)
		}
	}))
	t.Cleanup(server.Close)
	type reply struct {
		want    int
		finding Finding
		err     error
	}
	finished := make(chan reply, 2)
	for _, tc := range []struct {
		credential string
		status     int
	}{{"first-check", http.StatusOK}, {"second-check", http.StatusNoContent}} {
		go func() {
			finding, err := (&Client{http: server.Client()}).CheckWebRequest(t.Context(), server.URL, tc.credential)
			finished <- reply{tc.status, finding, err}
		}()
	}
	for range 2 {
		got := <-finished
		if got.err != nil || got.finding.Kind != "reachable" || got.finding.HTTPStatus != got.want {
			t.Errorf("concurrent check: %+v", got)
		}
	}
}
