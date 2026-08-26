//go:build js && wasm

package main

import (
	"syscall/js"
	"time"

	"github.com/XeUby/Eligibility-Calculator-for-Finnish-Citizenship-and-Permanent-Residence/internal/calculator"
	"github.com/XeUby/Eligibility-Calculator-for-Finnish-Citizenship-and-Permanent-Residence/internal/models"
)

const dateLayout = "2006-01-02"

// calculateEligibility is the deliberately small boundary between JavaScript
// and the tested Go calculation engine. Its arguments are permit rows, absence
// rows, the calculation date, citizenship route, PR path and a confirmation.
func calculateEligibility(_ js.Value, args []js.Value) any {
	if len(args) < 6 {
		return map[string]any{"error": "six calculation arguments are required"}
	}
	request := models.CalculationRequest{
		Permits: parsePermits(args[0]), Absences: parseAbsences(args[1]),
		AsOf: parseDate(args[2].String()), CitizenshipRoute: models.CitizenshipRoute(args[3].String()),
		PermanentResidence: models.PRPath(args[4].String()), ConditionsMet: args[5].Bool(),
	}
	result := calculator.Calculate(request)
	return map[string]any{
		"citizenshipDays": result.CitizenshipDays, "citizenshipRequiredYears": result.CitizenshipRequiredYears,
		"citizenshipBPermitCreditDays": result.CitizenshipBPermitCreditDays, "citizenshipAPDays": result.CitizenshipAPDays,
		"citizenshipAbsenceDays": result.CitizenshipAbsenceDays, "citizenshipAbsencePenaltyDays": result.CitizenshipAbsencePenaltyDays,
		"citizenshipEligible": result.CitizenshipEligible, "citizenshipEarliest": result.CitizenshipEarliest,
		"prDays": result.PermanentResidenceDays, "prRequiredYears": result.PermanentResidenceRequiredYears,
		"prEligible": result.PermanentResidenceEligible, "prEarliest": result.PermanentResidenceEarliest,
		"warningCodes": toJSArray(result.WarningCodes), "warnings": toJSArray(result.Warnings),
	}
}

func parsePermits(rows js.Value) []models.Permit {
	permits := make([]models.Permit, 0, rows.Length())
	for i := 0; i < rows.Length(); i++ {
		row := rows.Index(i)
		permits = append(permits, models.Permit{Type: row.Get("type").String(), StartDate: parseDate(row.Get("start").String()), EndDate: parseDate(row.Get("end").String())})
	}
	return permits
}

func parseAbsences(rows js.Value) []models.Absence {
	absences := make([]models.Absence, 0, rows.Length())
	for i := 0; i < rows.Length(); i++ {
		row := rows.Index(i)
		absences = append(absences, models.Absence{StartDate: parseDate(row.Get("start").String()), EndDate: parseDate(row.Get("end").String())})
	}
	return absences
}

func parseDate(value string) time.Time { parsed, _ := time.Parse(dateLayout, value); return parsed }
func toJSArray(values []string) any {
	result := make([]any, len(values))
	for i, value := range values {
		result[i] = value
	}
	return result
}

func main() {
	js.Global().Set("calculateEligibility", js.FuncOf(calculateEligibility))
	select {}
}
