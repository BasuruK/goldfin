package provider

import (
	"context"
	"errors"
	"net"
	"net/http"
	"net/netip"
	"time"
)

// DefaultHTTPClient is used by the worker for outbound provider calls.
// Proxy stays nil so an environment proxy cannot bypass the address check.
func DefaultHTTPClient() *http.Client {
	dialer := &net.Dialer{Timeout: 10 * time.Second}
	return &http.Client{
		Timeout: 30 * time.Second,
		Transport: schemeGuard{&http.Transport{
			Proxy: nil,
			DialContext: func(ctx context.Context, network, addr string) (net.Conn, error) {
				return dialPublic(ctx, dialer, network, addr)
			},
		}},
	}
}

type schemeGuard struct {
	base http.RoundTripper
}

func (g schemeGuard) RoundTrip(req *http.Request) (*http.Response, error) {
	if req.URL == nil || req.URL.Scheme != "https" {
		return nil, errors.New("https required")
	}
	return g.base.RoundTrip(req)
}

func dialPublic(ctx context.Context, dialer *net.Dialer, network, addr string) (net.Conn, error) {
	host, port, err := net.SplitHostPort(addr)
	if err != nil {
		return nil, err
	}
	ips, err := net.DefaultResolver.LookupIPAddr(ctx, host)
	if err != nil {
		return nil, err
	}
	if len(ips) == 0 {
		return nil, errors.New("no addresses for host")
	}
	for _, ip := range ips {
		if blockedIP(ip.IP) {
			return nil, errors.New("blocked destination")
		}
	}
	var lastErr error
	for _, ip := range ips {
		conn, err := dialer.DialContext(ctx, network, net.JoinHostPort(ip.IP.String(), port))
		if err == nil {
			return conn, nil
		}
		lastErr = err
	}
	return nil, lastErr
}

var extraBlockedPrefixes = mustPrefixes(
	"100.64.0.0/10",
	"192.0.0.0/24",
	"198.18.0.0/15",
	"240.0.0.0/4",
	"64:ff9b::/96",
	"2001:db8::/32",
)

func mustPrefixes(cidrs ...string) []netip.Prefix {
	out := make([]netip.Prefix, 0, len(cidrs))
	for _, cidr := range cidrs {
		p, err := netip.ParsePrefix(cidr)
		if err != nil {
			panic(err)
		}
		out = append(out, p)
	}
	return out
}

func blockedIP(ip net.IP) bool {
	if ip == nil {
		return true
	}
	if ip.IsUnspecified() || ip.IsLoopback() || ip.IsPrivate() || ip.IsLinkLocalUnicast() ||
		ip.IsLinkLocalMulticast() || ip.IsMulticast() {
		return true
	}
	addr, ok := netip.AddrFromSlice(ip)
	if !ok {
		return true
	}
	addr = addr.Unmap()
	for _, p := range extraBlockedPrefixes {
		if p.Contains(addr) {
			return true
		}
	}
	return false
}
