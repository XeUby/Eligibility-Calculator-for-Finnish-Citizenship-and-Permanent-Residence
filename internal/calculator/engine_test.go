package calculator

import (
	"strings"
	"testing"
	"time"

	"github.com/XeUby/Eligibility-Calculator-for-Finnish-Citizenship-and-Permanent-Residence/internal/models"
)

func day(value string) time.Time {
	parsed, err := time.Parse("2006-01-02", value)
	if err != nil {
		panic(err)
	}
	return parsed
}

func TestCalculateCitizenshipCreditsBOnlyBeforeFirstA(t *testing.T) {
	response := Calculate(models.CalculationRequest{AsOf: day("2026-01-01"), CitizenshipRoute: models.CitizenshipLanguage, Permits: []models.Permit{
		{Type: models.PermitB, StartDate: day("2020-01-01"), EndDate: day("2020-12-31")},
		{Type: models.PermitA, StartDate: day("2021-01-01"), EndDate: day("2026-12-31")},
	}})
	want := 183 + 1827 // 366 B days at half, then five inclusive A calendar years.
	if response.CitizenshipDays != want {
		t.Fatalf("credit = %d, want %d", response.CitizenshipDays, want)
	}
}

func TestCalculateResetsAtPermitGap(t *testing.T) {
	response := Calculate(models.CalculationRequest{AsOf: day("2026-01-01"), CitizenshipRoute: models.CitizenshipLanguage, Permits: []models.Permit{
		{Type: models.PermitA, StartDate: day("2018-01-01"), EndDate: day("2020-01-01")},
		{Type: models.PermitA, StartDate: day("2020-01-03"), EndDate: day("2026-12-31")},
	}})
	if response.CitizenshipDays != daysInclusive(day("2020-01-03"), day("2026-01-01")) {
		t.Fatal("permit gap must restart continuous estimate")
	}
}

func TestCalculateAppliesAbsencePenalty(t *testing.T) {
	response := Calculate(models.CalculationRequest{AsOf: day("2026-01-01"), CitizenshipRoute: models.CitizenshipLanguage,
		Permits:  []models.Permit{{Type: models.PermitA, StartDate: day("2015-01-01"), EndDate: day("2026-12-31")}},
		Absences: []models.Absence{{StartDate: day("2025-08-20"), EndDate: day("2025-12-31")}},
	})
	want := daysInclusive(day("2015-01-01"), day("2026-01-01")) - 42
	if response.CitizenshipDays != want {
		t.Fatalf("days = %d, want %d", response.CitizenshipDays, want)
	}
}

func TestCalculatePRUsesOnlyAOrPAndRequiresConditions(t *testing.T) {
	response := Calculate(models.CalculationRequest{AsOf: day("2030-01-02"), PermanentResidence: models.PRHighIncome, Permits: []models.Permit{
		{Type: models.PermitB, StartDate: day("2020-01-01"), EndDate: day("2024-01-01")},
		{Type: models.PermitA, StartDate: day("2024-01-02"), EndDate: day("2030-12-31")},
	}})
	if response.PermanentResidenceDays != daysInclusive(day("2024-01-02"), day("2030-01-02")) {
		t.Fatal("B time must not count for PR")
	}
	if response.PermanentResidenceEligible {
		t.Fatal("unconfirmed conditions must prevent a positive status")
	}
}

func TestAbsenceRangeExcludesDepartureAndReturnDays(t *testing.T) {
	r := absenceRange(models.Absence{StartDate: day("2026-01-01"), EndDate: day("2026-01-31")})
	if got := daysInclusive(r.start, r.end); got != 29 {
		t.Fatalf("absence days = %d, want 29", got)
	}
}

func TestCalculateUsesCalendarYearAnniversary(t *testing.T) {
	response := Calculate(models.CalculationRequest{AsOf: day("2025-01-01"), CitizenshipRoute: models.CitizenshipLanguage, Permits: []models.Permit{{Type: models.PermitA, StartDate: day("2020-01-01"), EndDate: day("2030-01-01")}}})
	if !response.CitizenshipEligible {
		t.Fatal("five calendar years of A residence should meet the language route")
	}
	if response.CitizenshipRequiredYears != 5 {
		t.Fatalf("required years = %d, want 5", response.CitizenshipRequiredYears)
	}
}

func TestCalculateWarnsAboutThe2027CitizenshipTest(t *testing.T) {
	response := Calculate(models.CalculationRequest{AsOf: day("2026-08-26"), CitizenshipRoute: models.CitizenshipLanguage, Permits: []models.Permit{{Type: models.PermitA, StartDate: day("2025-01-01"), EndDate: day("2030-01-01")}}})
	if !strings.Contains(strings.Join(response.Warnings, " "), "2027-03-01") {
		t.Fatal("expected citizenship-test warning")
	}
	if !strings.Contains(strings.Join(response.WarningCodes, " "), "citizenship_civic_knowledge") {
		t.Fatal("expected stable citizenship-test warning code")
	}
}
