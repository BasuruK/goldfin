package provider

import (
	"context"
	"errors"
	"net"
	"net/http"
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
	return dialer.DialContext(ctx, network, net.JoinHostPort(ips[0].IP.String(), port))
}

func blockedIP(ip net.IP) bool {
	if ip == nil {
		return true
	}
	return ip.IsLoopback() || ip.IsPrivate() || ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast()
}
