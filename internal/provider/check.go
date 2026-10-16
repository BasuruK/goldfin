// Package provider owns the worker's outbound Connector checks.
package provider

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"time"
)

// Finding describes what a Connector check proved without exposing a response body.
type Finding struct {
	Kind       string
	HTTPStatus int
	Latency    time.Duration
}

// RequestTimeout bounds a check including redirects.
const RequestTimeout = 30 * time.Second

// CheckWebRequest checks reachability only; it does not verify Credential validity.
func (c *Client) CheckWebRequest(ctx context.Context, baseURL, credential string) (Finding, error) {
	ctx, cancel := context.WithTimeout(ctx, RequestTimeout)
	defer cancel()
	endpoint, err := url.Parse(baseURL)
	if err != nil || endpoint.Host == "" || endpoint.User != nil || (endpoint.Scheme != "http" && endpoint.Scheme != "https") {
		return Finding{}, errors.New("invalid endpoint URL")
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodHead, endpoint.String(), nil)
	if err != nil {
		return Finding{}, errors.New("could not build endpoint check")
	}
	if credential != "" {
		if endpoint.Scheme != "https" {
			return Finding{}, errors.New("credentials require an https endpoint")
		}
		req.Header.Set("Authorization", "Bearer "+credential)
	}
	started := time.Now()
	res, err := c.http.Do(req)
	finding := Finding{Latency: time.Since(started)}
	if err != nil {
		switch {
		case errors.Is(err, context.Canceled):
			return finding, context.Canceled
		case errors.Is(err, context.DeadlineExceeded):
			return finding, context.DeadlineExceeded
		default:
			return finding, errors.New("endpoint could not be reached")
		}
	}
	defer func() { _ = res.Body.Close() }()
	finding.HTTPStatus = res.StatusCode
	if res.StatusCode < http.StatusOK || res.StatusCode >= http.StatusMultipleChoices {
		return finding, fmt.Errorf("endpoint returned HTTP %d", res.StatusCode)
	}
	finding.Kind = "reachable"
	return finding, nil
}
