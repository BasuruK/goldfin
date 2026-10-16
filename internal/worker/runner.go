// Package worker executes staged Connector checks without exposing Credentials.
package worker

import (
	"context"
	"errors"
	"time"

	"github.com/BasuruK/goldfin/internal/jobs"
	"github.com/BasuruK/goldfin/internal/provider"
	"github.com/BasuruK/goldfin/internal/secretbox"
)

// Checker is the outbound-provider seam. Production supplies provider.NewClient().
type Checker interface {
	CheckWebRequest(context.Context, string, string) (provider.Finding, error)
}

const (
	jobTimeout    = time.Minute
	finishTimeout = 5 * time.Second
)

// Run processes Saves sequentially until cancellation. The caller owns its dependencies.
func Run(ctx context.Context, store *jobs.Store, box *secretbox.Box, check Checker) error {
	for ctx.Err() == nil {
		worked, err := runOne(ctx, store, box, check)
		if err != nil {
			return err
		}
		if !worked {
			select {
			case <-ctx.Done():
			case <-time.After(time.Second):
			}
		}
	}
	return nil
}

func runOne(parent context.Context, store *jobs.Store, box *secretbox.Box, check Checker) (worked bool, resultErr error) {
	ctx, cancel := context.WithTimeout(parent, jobTimeout)
	defer cancel()
	claim, err := store.ClaimNext(ctx)
	if errors.Is(err, jobs.ErrNoWork) {
		return false, nil
	}
	if err != nil {
		if parent.Err() != nil {
			return false, nil
		}
		return false, errors.New("worker could not claim Save attempt")
	}
	settled := false
	defer func() {
		if settled {
			return
		}
		releaseCtx, releaseCancel := context.WithTimeout(context.WithoutCancel(parent), finishTimeout)
		defer releaseCancel()
		if err := store.Release(releaseCtx, claim.ID, claim.Token); err != nil && !errors.Is(err, jobs.ErrClaimLost) {
			resultErr = errors.Join(resultErr, errors.New("worker could not release Save attempt"))
		}
	}()
	if parent.Err() != nil {
		return true, nil
	}
	var plain []byte
	if claim.Ciphertext != nil {
		plain, err = box.Decrypt(claim.Ciphertext)
		if err != nil {
			return true, errors.New("worker could not decrypt Credential")
		}
	}
	finding, err := check.CheckWebRequest(ctx, claim.BaseURL, string(plain))
	clear(plain)
	if parent.Err() != nil {
		return true, nil
	}
	finishCtx, finishCancel := context.WithTimeout(parent, finishTimeout)
	defer finishCancel()
	if err != nil || ctx.Err() != nil || finding.Kind != "reachable" {
		code := "unreachable"
		if errors.Is(err, context.DeadlineExceeded) || errors.Is(ctx.Err(), context.DeadlineExceeded) {
			code = "timeout"
		}
		err = store.Fail(finishCtx, claim.ID, claim.Token, code)
	} else {
		err = store.Complete(finishCtx, claim.ID, claim.Token, finding.HTTPStatus, finding.Latency)
	}
	if err != nil && !errors.Is(err, jobs.ErrClaimLost) {
		if parent.Err() != nil {
			return true, nil
		}
		return true, errors.New("worker could not finish Save attempt")
	}
	settled = true
	return true, nil
}
