package main

import "net/http"

const healthPath = "/healthz"

func registerAPIRoutes(mux *http.ServeMux) {
	mux.HandleFunc(healthPath, func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	})
}
