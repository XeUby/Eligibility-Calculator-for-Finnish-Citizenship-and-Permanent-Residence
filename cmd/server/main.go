package main

import (
	"encoding/json"
	"log"
	"net/http"

	"github.com/XeUby/Eligibility-Calculator-for-Finnish-Citizenship-and-Permanent-Residence/internal/calculator"
	"github.com/XeUby/Eligibility-Calculator-for-Finnish-Citizenship-and-Permanent-Residence/internal/models"
)

func main() {
	http.HandleFunc("/api/calculate", calculateHandler)

	log.Println("Server is running on port 8080...")
	err := http.ListenAndServe(":8080", nil)
	if err != nil {
		log.Fatal(err)
	}
}

func calculateHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req models.CalculationRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request payload", http.StatusBadRequest)
		return
	}

	totalDays := calculator.CalculateResidence(req.Permits)
	isEligible, message := calculator.CheckEligibility(totalDays)

	response := models.CalculationResponse{
		TotalDays:    totalDays,
		IsEligible:   isEligible,
		RequiredDays: calculator.RequiredDaysForCitizenship,
		Message:      message,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}
