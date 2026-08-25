package main

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestHealthz(t *testing.T) {
	response := httptest.NewRecorder()
	newHandler().ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/healthz", nil))
	if response.Code != http.StatusNoContent {
		t.Fatalf("status = %d, want %d", response.Code, http.StatusNoContent)
	}
}

func TestCalculateEndpoint(t *testing.T) {
	body := `{"as_of":"2026-01-01T00:00:00Z","citizenship_route":"language","permanent_residence_path":"high_income","conditions_met":true,"permits":[{"type":"A","start_date":"2020-01-01T00:00:00Z","end_date":"2026-12-31T00:00:00Z"}]}`
	response := httptest.NewRecorder()
	newHandler().ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/api/calculate", strings.NewReader(body)))
	if response.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", response.Code, response.Body.String())
	}
	if got := response.Header().Get("Content-Type"); !strings.Contains(got, "application/json") {
		t.Fatalf("content type = %q", got)
	}
	if !bytes.Contains(response.Body.Bytes(), []byte(`"citizenship_days"`)) {
		t.Fatalf("unexpected response: %s", response.Body.String())
	}
}

func TestCalculateRejectsUnknownFields(t *testing.T) {
	response := httptest.NewRecorder()
	newHandler().ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/api/calculate", strings.NewReader(`{"unexpected":true}`)))
	if response.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want %d", response.Code, http.StatusBadRequest)
	}
}
