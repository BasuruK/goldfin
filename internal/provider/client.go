package provider

import (
	"context"
	"errors"
	"net"
	"net/http"
	"net/netip"
	"strings"
	"time"
)

const dialTimeout = 10 * time.Second

// Client owns the worker's hardened HTTP transport; callers cannot replace its policy.
type Client struct {
	http *http.Client
}

// NewClient creates a reusable worker client. Its owner closes idle connections.
func NewClient() *Client {
	transport := http.DefaultTransport.(*http.Transport).Clone()
	// Environment proxies must not bypass validation of the actual destination.
	transport.Proxy = nil
	dialer := &net.Dialer{Timeout: dialTimeout}
	transport.DialContext = func(ctx context.Context, network, address string) (net.Conn, error) {
		return dialPublic(ctx, dialer, network, address)
	}
	return &Client{http: &http.Client{
		Transport: transport,
		Timeout:   RequestTimeout,
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			if len(via) >= 10 {
				return errors.New("too many redirects")
			}
			origin := via[0].URL
			if req.URL.Scheme != origin.Scheme || !strings.EqualFold(req.URL.Host, origin.Host) {
				return errors.New("redirect to a different origin blocked")
			}
			return nil
		},
	}}
}

// CloseIdleConnections releases the client's idle connections during worker shutdown.
func (c *Client) CloseIdleConnections() { c.http.CloseIdleConnections() }

func dialPublic(ctx context.Context, dialer *net.Dialer, network, address string) (net.Conn, error) {
	// Transport detaches dials from requests; bound DNS and all address attempts together.
	ctx, cancel := context.WithTimeout(ctx, dialTimeout)
	defer cancel()
	host, port, err := net.SplitHostPort(address)
	if err != nil {
		return nil, err
	}
	addresses, err := net.DefaultResolver.LookupNetIP(ctx, "ip", host)
	if err != nil {
		return nil, err
	}
	if len(addresses) == 0 {
		return nil, errors.New("no addresses for host")
	}
	for _, addr := range addresses {
		if blockedAddr(addr) {
			return nil, errors.New("blocked destination")
		}
	}
	var lastErr error
	for _, addr := range addresses {
		// Dial the validated literal so DNS cannot change between validation and use.
		conn, err := dialer.DialContext(ctx, network, net.JoinHostPort(addr.String(), port))
		if err == nil {
			return conn, nil
		}
		lastErr = err
	}
	return nil, lastErr
}

// Reserved and transition ranges supplement netip's private/non-unicast checks.
var blockedPrefixes = [...]netip.Prefix{
	netip.MustParsePrefix("0.0.0.0/8"),
	netip.MustParsePrefix("100.64.0.0/10"),
	netip.MustParsePrefix("192.0.0.0/24"),
	netip.MustParsePrefix("192.0.2.0/24"),
	netip.MustParsePrefix("192.88.99.0/24"),
	netip.MustParsePrefix("198.18.0.0/15"),
	netip.MustParsePrefix("198.51.100.0/24"),
	netip.MustParsePrefix("203.0.113.0/24"),
	netip.MustParsePrefix("240.0.0.0/4"),
	netip.MustParsePrefix("::/96"),
	netip.MustParsePrefix("64:ff9b::/96"),
	netip.MustParsePrefix("64:ff9b:1::/48"),
	netip.MustParsePrefix("100::/64"),
	netip.MustParsePrefix("100:0:0:1::/64"),
	netip.MustParsePrefix("2001::/23"),
	netip.MustParsePrefix("2001:db8::/32"),
	netip.MustParsePrefix("2002::/16"),
	netip.MustParsePrefix("3fff::/20"),
	netip.MustParsePrefix("5f00::/16"),
	netip.MustParsePrefix("fec0::/10"),
}

func blockedAddr(addr netip.Addr) bool {
	addr = addr.Unmap()
	if !addr.IsGlobalUnicast() || addr.IsPrivate() {
		return true
	}
	for _, prefix := range blockedPrefixes {
		if prefix.Contains(addr) {
			return true
		}
	}
	return false
}
