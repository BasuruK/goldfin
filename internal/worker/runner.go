package worker

import (
	"context"
	"encoding/json"
	"log/slog"
	"time"

	"github.com/BasuruK/goldfin/internal/jobs"
	"github.com/BasuruK/goldfin/internal/provider"
)

// Run polls discovery_jobs and executes provider calls until ctx is cancelled.
func Run(ctx context.Context, store *jobs.Store, logger *slog.Logger) {
	client := provider.DefaultHTTPClient()
	for {
		if ctx.Err() != nil {
			return
		}
		job, ciphertext, err := store.ClaimNext(ctx)
		if err != nil {
			logger.Error("claim job", "err", err)
			sleep(ctx, time.Second)
			continue
		}
		if job.ID == "" {
			sleep(ctx, 200*time.Millisecond)
			continue
		}
		apiKey, err := store.DecryptCredential(ciphertext)
		if err != nil {
			logger.Error("decrypt credential", "job", job.ID)
			_ = store.Finish(ctx, job.ID, nil, "Could not read credential for this job.")
			continue
		}
		switch job.Kind {
		case jobs.KindCatalog:
			result, err := provider.DiscoverCatalog(ctx, client, job.ProviderType, job.BaseURL, apiKey)
			if err != nil {
				logger.Error("catalog discovery", "job", job.ID, "err", err)
				_ = store.Finish(ctx, job.ID, mustJSON(map[string]string{"state": "failed", "message": "Model discovery failed."}), "")
				continue
			}
			_ = store.Finish(ctx, job.ID, mustJSON(result), result.Message)
		case jobs.KindVerify:
			result, err := provider.VerifyModel(ctx, client, job.ProviderType, job.BaseURL, apiKey, job.ModelID)
			if err != nil {
				logger.Error("verify model", "job", job.ID, "err", err)
				_ = store.Finish(ctx, job.ID, mustJSON(map[string]string{"state": "failed", "message": "Verification failed."}), "")
				continue
			}
			_ = store.Finish(ctx, job.ID, mustJSON(result), result.Message)
		default:
			_ = store.Finish(ctx, job.ID, mustJSON(map[string]string{"state": "failed", "message": "Unknown job kind."}), "")
		}
	}
}

func sleep(ctx context.Context, d time.Duration) {
	t := time.NewTimer(d)
	defer t.Stop()
	select {
	case <-ctx.Done():
	case <-t.C:
	}
}

func mustJSON(v interface{}) json.RawMessage {
	b, err := json.Marshal(v)
	if err != nil {
		return json.RawMessage(`{"state":"failed","message":"Internal error."}`)
	}
	return b
}
