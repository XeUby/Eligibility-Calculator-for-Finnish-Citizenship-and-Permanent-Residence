package main

import (
	"encoding/json"
	"log"
	"net/http"
	"os"

	"github.com/XeUby/Eligibility-Calculator-for-Finnish-Citizenship-and-Permanent-Residence/internal/calculator"
	"github.com/XeUby/Eligibility-Calculator-for-Finnish-Citizenship-and-Permanent-Residence/internal/models"
)

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	log.Printf("API listening on :%s", port)
	if err := http.ListenAndServe(":"+port, newHandler()); err != nil {
		log.Fatal(err)
	}
}

func newHandler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusNoContent) })
	mux.HandleFunc("POST /api/calculate", calculateHandler)
	// This makes local development a single-command experience. Production is a
	// static GitHub Pages site and does not expose this optional API server.
	mux.Handle("GET /", http.FileServer(http.Dir("docs")))
	return mux
}

func calculateHandler(w http.ResponseWriter, r *http.Request) {
	defer r.Body.Close()
	var request models.CalculationRequest
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&request); err != nil {
		http.Error(w, "invalid JSON request", http.StatusBadRequest)
		return
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	if err := json.NewEncoder(w).Encode(calculator.Calculate(request)); err != nil {
		log.Printf("encode calculation response: %v", err)
	}
}
