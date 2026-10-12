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
			message := "Could not read credential for this job."
			finishJob(ctx, store, logger, job.ID, mustJSON(map[string]string{"state": "failed", "message": message}), message)
			continue
		}
		switch job.Kind {
		case jobs.KindCatalog:
			result, err := provider.DiscoverCatalog(ctx, client, job.ProviderType, job.BaseURL, apiKey)
			if err != nil {
				logger.Error("catalog discovery", "job", job.ID, "err", err)
				finishJob(ctx, store, logger, job.ID, mustJSON(map[string]string{"state": "failed", "message": "Model discovery failed."}), "")
				continue
			}
			finishJob(ctx, store, logger, job.ID, mustJSON(result), result.Message)
		case jobs.KindVerify:
			result, err := provider.VerifyModel(ctx, client, job.ProviderType, job.BaseURL, apiKey, job.ModelID)
			if err != nil {
				logger.Error("verify model", "job", job.ID, "err", err)
				finishJob(ctx, store, logger, job.ID, mustJSON(map[string]string{"state": "failed", "message": "Verification failed."}), "")
				continue
			}
			finishJob(ctx, store, logger, job.ID, mustJSON(result), result.Message)
		default:
			finishJob(ctx, store, logger, job.ID, mustJSON(map[string]string{"state": "failed", "message": "Unknown job kind."}), "")
		}
	}
}

func finishJob(ctx context.Context, store *jobs.Store, logger *slog.Logger, id string, result json.RawMessage, message string) {
	finishCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 5*time.Second)
	defer cancel()
	if err := store.Finish(finishCtx, id, result, message); err != nil {
		logger.Error("finish job", "job", id, "err", err)
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
