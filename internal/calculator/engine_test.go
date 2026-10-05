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
	if !strings.Contains(strings.Join(response.WarningCodes, " "), "permit_gap") {
		t.Fatal("permit gap must be explained to the visitor")
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

func TestCalculateMergesOverlappingTripsBeforeApplyingAbsenceLimits(t *testing.T) {
	response := Calculate(models.CalculationRequest{AsOf: day("2026-01-01"), CitizenshipRoute: models.CitizenshipLanguage,
		Permits: []models.Permit{{Type: models.PermitA, StartDate: day("2015-01-01"), EndDate: day("2026-12-31")}},
		Absences: []models.Absence{
			{StartDate: day("2025-08-20"), EndDate: day("2025-12-31")},
			{StartDate: day("2025-08-20"), EndDate: day("2025-12-31")},
		},
	})
	if response.CitizenshipAbsenceDays != 132 || response.CitizenshipAbsencePenaltyDays != 42 {
		t.Fatalf("absence breakdown = %d total, %d penalty; want 132 and 42", response.CitizenshipAbsenceDays, response.CitizenshipAbsencePenaltyDays)
	}
	if !strings.Contains(strings.Join(response.WarningCodes, " "), "overlapping_trips") {
		t.Fatal("expected overlap warning")
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

func TestCalculateFinnishDegreePRPathHasNoResidenceTimeMinimum(t *testing.T) {
	response := Calculate(models.CalculationRequest{AsOf: day("2026-01-08"), PermanentResidence: models.PRDegreeFinland, ConditionsMet: true, Permits: []models.Permit{
		{Type: models.PermitA, StartDate: day("2026-01-01"), EndDate: day("2030-01-01")},
	}})
	if response.PermanentResidenceRequiredYears != 0 || !response.PermanentResidenceEligible {
		t.Fatalf("Finnish-degree path = %d years, eligible=%t; want 0 years and eligible", response.PermanentResidenceRequiredYears, response.PermanentResidenceEligible)
	}
	if !strings.Contains(strings.Join(response.WarningCodes, " "), "pr_finnish_degree_requirements") {
		t.Fatal("expected Finnish-degree conditions warning")
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

func hasWarning(response models.CalculationResponse, code string) bool {
	for _, warning := range response.WarningCodes {
		if warning == code {
			return true
		}
	}
	return false
}

func TestCalculateLaterBPeriodsDelayCitizenship(t *testing.T) {
	request := models.CalculationRequest{
		AsOf: day("2026-01-01"), CitizenshipRoute: models.CitizenshipLanguage,
		Permits: []models.Permit{
			{Type: models.PermitA, StartDate: day("2020-01-01"), EndDate: day("2020-12-31")},
			{Type: models.PermitB, StartDate: day("2021-01-01"), EndDate: day("2024-12-31")},
			{Type: models.PermitA, StartDate: day("2025-01-01"), EndDate: day("2035-12-31")},
		},
	}
	response := Calculate(request)
	if response.CitizenshipEligible || response.CitizenshipEarliest != "2029-01-01" {
		t.Fatalf("A/B/A result: eligible=%t, date=%s; want false, 2029-01-01", response.CitizenshipEligible, response.CitizenshipEarliest)
	}
	if response.CitizenshipBPermitCreditDays != 0 || response.CitizenshipAPDays != 732 || !hasWarning(response, "citizenship_later_b") {
		t.Fatalf("A/B/A credit must exclude later B and explain it: %+v", response)
	}
	request.AsOf = day("2029-01-01")
	if !Calculate(request).CitizenshipEligible {
		t.Fatal("five credited calendar years should meet the route on the delayed anniversary")
	}
}

func TestCalculateBCreditRequiresConservativeOneContinuousAPYear(t *testing.T) {
	request := models.CalculationRequest{
		CitizenshipRoute: models.CitizenshipLanguage,
		Permits: []models.Permit{
			{Type: models.PermitB, StartDate: day("2015-01-01"), EndDate: day("2024-12-31")},
			{Type: models.PermitA, StartDate: day("2025-01-01"), EndDate: day("2035-12-31")},
		},
	}
	for _, test := range []struct {
		date string
		met  bool
	}{
		{"2025-01-01", false},
		{"2025-12-31", false},
		{"2026-01-01", true},
	} {
		t.Run(test.date, func(t *testing.T) {
			request.AsOf = day(test.date)
			response := Calculate(request)
			if response.CitizenshipEligible != test.met || response.CitizenshipEarliest != "2026-01-01" {
				t.Fatalf("one-year result: eligible=%t, date=%s", response.CitizenshipEligible, response.CitizenshipEarliest)
			}
			if !hasWarning(response, "citizenship_b_credit_year") || !strings.Contains(strings.Join(response.Warnings, " "), "before Migri decides") {
				t.Fatal("must distinguish decision-time B-credit condition from submission eligibility")
			}
		})
	}
}

func TestCalculateNoCitizenshipProjectionWithoutCurrentAP(t *testing.T) {
	response := Calculate(models.CalculationRequest{
		AsOf: day("2026-01-01"), CitizenshipRoute: models.CitizenshipLanguage,
		Permits: []models.Permit{
			{Type: models.PermitA, StartDate: day("2015-01-01"), EndDate: day("2024-12-31")},
			{Type: models.PermitB, StartDate: day("2025-01-01"), EndDate: day("2035-12-31")},
		},
	})
	if response.CitizenshipEligible || response.CitizenshipEarliest != "" || !hasWarning(response, "citizenship_requires_ap") {
		t.Fatalf("a current B permit cannot give a positive status or reliable A date: %+v", response)
	}
}

func TestCalculateReevaluatesRecentAbsencesAtProjectedDate(t *testing.T) {
	response := Calculate(models.CalculationRequest{
		AsOf: day("2025-10-01"), CitizenshipRoute: models.CitizenshipLanguage,
		Permits:  []models.Permit{{Type: models.PermitA, StartDate: day("2021-01-01"), EndDate: day("2035-12-31")}},
		Absences: []models.Absence{{StartDate: day("2024-11-01"), EndDate: day("2025-02-28")}},
	})
	if response.CitizenshipAbsenceDays != 118 || response.CitizenshipAbsencePenaltyDays != 28 {
		t.Fatalf("selected-date breakdown must retain today's penalty: %+v", response)
	}
	if response.CitizenshipEarliest != "2026-01-01" {
		t.Fatalf("trip leaves recent window before anniversary, date=%s; want 2026-01-01", response.CitizenshipEarliest)
	}
}

func TestCalculateProjectionIncludesRecordedFutureTrips(t *testing.T) {
	response := Calculate(models.CalculationRequest{
		AsOf: day("2025-01-01"), CitizenshipRoute: models.CitizenshipLanguage,
		Permits:  []models.Permit{{Type: models.PermitA, StartDate: day("2021-01-01"), EndDate: day("2035-12-31")}},
		Absences: []models.Absence{{StartDate: day("2025-06-01"), EndDate: day("2025-12-31")}},
	})
	if response.CitizenshipEarliest != "2026-05-03" {
		t.Fatalf("212 recorded future trip days require 122 days beyond 90, date=%s; want 2026-05-03", response.CitizenshipEarliest)
	}
}

func TestAbsenceAdjustmentLimitBoundaries(t *testing.T) {
	for _, test := range []struct {
		name, asOf, depart, returned string
		total, penalty               int
	}{
		{"90 recent days", "2026-01-01", "2025-09-30", "2025-12-30", 90, 0},
		{"91 recent days", "2026-01-01", "2025-09-29", "2025-12-30", 91, 1},
		{"365 total days", "2026-01-01", "2022-01-01", "2023-01-02", 365, 0},
		{"366 total days", "2026-01-01", "2022-01-01", "2023-01-03", 366, 1},
	} {
		t.Run(test.name, func(t *testing.T) {
			got := absenceAdjustment([]models.Absence{{StartDate: day(test.depart), EndDate: day(test.returned)}}, day("2020-01-01"), day(test.asOf))
			if got.allDays != test.total || got.penalty != test.penalty {
				t.Fatalf("absence total=%d penalty=%d, want %d/%d", got.allDays, got.penalty, test.total, test.penalty)
			}
		})
	}
}

func TestCalculateOverFiveYearAbsenceNeedsManualCitizenshipAssessment(t *testing.T) {
	for _, returned := range []string{"2025-01-03", "2026-01-02"} {
		t.Run(returned, func(t *testing.T) {
			response := Calculate(models.CalculationRequest{
				AsOf: day("2035-01-01"), CitizenshipRoute: models.CitizenshipLanguage,
				Permits: []models.Permit{{Type: models.PermitA, StartDate: day("2010-01-01"), EndDate: day("2040-12-31")}},
				Absences: []models.Absence{
					{StartDate: day("2020-01-01"), EndDate: day(returned)},
					{StartDate: day("2022-01-01"), EndDate: day("2023-01-01")},
				},
			})
			if response.CitizenshipEligible || response.CitizenshipEarliest != "" || !hasWarning(response, "citizenship_absence_review") {
				t.Fatalf("long absence cannot use history before interruption for a positive result: %+v", response)
			}
		})
	}
}

func TestCalculateExactlyFiveYearAbsenceDoesNotTriggerStatutoryInterruption(t *testing.T) {
	response := Calculate(models.CalculationRequest{
		AsOf: day("2035-01-01"), CitizenshipRoute: models.CitizenshipLanguage,
		Permits:  []models.Permit{{Type: models.PermitA, StartDate: day("2010-01-01"), EndDate: day("2040-12-31")}},
		Absences: []models.Absence{{StartDate: day("2020-01-01"), EndDate: day("2025-01-02")}},
	})
	if !response.CitizenshipEligible || hasWarning(response, "citizenship_absence_review") {
		t.Fatal("Nationality Act section 16 says more than five years, so exactly five is not that interruption")
	}
}

func TestCalculateCivicKnowledgeWarningUsesApplicationDate(t *testing.T) {
	for _, test := range []struct {
		date   string
		warned bool
	}{
		{"2027-02-28", false},
		{"2027-03-01", true},
		{"2028-01-01", true},
	} {
		t.Run(test.date, func(t *testing.T) {
			response := Calculate(models.CalculationRequest{
				AsOf: day(test.date), CitizenshipRoute: models.CitizenshipLanguage,
				Permits: []models.Permit{{Type: models.PermitA, StartDate: day("2010-01-01"), EndDate: day("2040-12-31")}},
			})
			if !response.CitizenshipEligible || hasWarning(response, "citizenship_civic_knowledge") != test.warned {
				t.Fatalf("warning must follow selected application date after residence already met: %+v", response)
			}
		})
	}
}

func TestCalculateCalendarBoundaryAcrossLeapYear(t *testing.T) {
	for _, test := range []struct {
		date string
		met  bool
	}{
		{"2025-02-27", false},
		{"2025-02-28", true},
	} {
		t.Run(test.date, func(t *testing.T) {
			response := Calculate(models.CalculationRequest{
				AsOf: day(test.date), CitizenshipRoute: models.CitizenshipLanguage,
				Permits: []models.Permit{{Type: models.PermitA, StartDate: day("2020-02-28"), EndDate: day("2040-12-31")}},
			})
			if response.CitizenshipEligible != test.met || response.CitizenshipEarliest != "2025-02-28" {
				t.Fatalf("must use fifth calendar anniversary rather than 5*365: %+v", response)
			}
		})
	}
}

func TestCalculatePRRoutesOnlyApplyFrom8January2026(t *testing.T) {
	for _, path := range []models.PRPath{models.PRSixYears, models.PRHighIncome, models.PRForeignDegree, models.PRExcellentLanguage, models.PRDegreeFinland} {
		t.Run(string(path), func(t *testing.T) {
			request := models.CalculationRequest{
				AsOf: day("2026-01-07"), PermanentResidence: path, ConditionsMet: true,
				Permits: []models.Permit{{Type: models.PermitA, StartDate: day("2010-01-01"), EndDate: day("2040-12-31")}},
			}
			response := Calculate(request)
			if response.PermanentResidenceEligible || response.PermanentResidenceEarliest != "" || !hasWarning(response, "pr_rules_date") {
				t.Fatalf("new PR route cannot apply before effective date: %+v", response)
			}
			request.AsOf = day("2026-01-08")
			if !Calculate(request).PermanentResidenceEligible {
				t.Fatal("route should apply on effective date with sufficient residence and confirmed conditions")
			}
		})
	}
}

func TestCalculatePRPhysicalPresenceHalfBoundary(t *testing.T) {
	// 2020-01-08..2026-01-08 spans 2,192 days. Departure and return
	// count in Finland, so these trips record 1,096 or 1,097 days abroad.
	for _, test := range []struct {
		returned string
		met      bool
	}{
		{"2023-01-09", true},
		{"2023-01-10", false},
	} {
		t.Run(test.returned, func(t *testing.T) {
			response := Calculate(models.CalculationRequest{
				AsOf: day("2026-01-08"), PermanentResidence: models.PRSixYears, ConditionsMet: true,
				Permits: []models.Permit{{Type: models.PermitA, StartDate: day("2020-01-08"), EndDate: day("2040-12-31")}},
				Absences: []models.Absence{
					{StartDate: day("2020-01-08"), EndDate: day(test.returned)},
					{StartDate: day("2021-01-01"), EndDate: day("2022-01-01")},
				},
			})
			if response.PermanentResidenceEligible != test.met || hasWarning(response, "pr_absence_review") == test.met {
				t.Fatalf("PR half boundary must deduplicate overlapping trips: %+v", response)
			}
			if !test.met && response.PermanentResidenceEarliest != "" {
				t.Fatal("cannot invent a PR restart date after excessive absences")
			}
		})
	}
}

func TestCalculatePRUsesRequiredRecentPeriod(t *testing.T) {
	response := Calculate(models.CalculationRequest{
		AsOf: day("2030-01-08"), PermanentResidence: models.PRHighIncome, ConditionsMet: true,
		Permits:  []models.Permit{{Type: models.PermitA, StartDate: day("2010-01-01"), EndDate: day("2040-12-31")}},
		Absences: []models.Absence{{StartDate: day("2010-01-01"), EndDate: day("2020-01-01")}},
	})
	if !response.PermanentResidenceEligible || hasWarning(response, "pr_absence_review") {
		t.Fatal("a trip outside the required recent four-year period must not cause PR rejection")
	}
}

func TestCalculatePRProjectionChecksRecordedTripsAndPermitHistory(t *testing.T) {
	request := models.CalculationRequest{
		AsOf: day("2026-01-08"), PermanentResidence: models.PRHighIncome, ConditionsMet: true,
		Permits: []models.Permit{{Type: models.PermitA, StartDate: day("2025-01-08"), EndDate: day("2040-12-31")}},
	}
	response := Calculate(request)
	if response.PermanentResidenceEligible || response.PermanentResidenceEarliest != "2029-01-08" {
		t.Fatalf("insufficient current time should project the fourth anniversary: %+v", response)
	}
	request.Absences = []models.Absence{{StartDate: day("2025-01-08"), EndDate: day("2028-01-08")}}
	response = Calculate(request)
	if response.PermanentResidenceEligible || response.PermanentResidenceEarliest != "" || !hasWarning(response, "pr_absence_review") {
		t.Fatalf("known future absences must prevent unsupported PR projection: %+v", response)
	}
	request.Permits[0].EndDate = day("2026-01-07")
	response = Calculate(request)
	if response.PermanentResidenceEligible || response.PermanentResidenceEarliest != "" || !hasWarning(response, "no_permit_span") {
		t.Fatal("history ending before assessment date cannot support an estimate")
	}
}

func TestCalculateFinnishDegreePRDoesNotApplyHalfResidenceMinimum(t *testing.T) {
	response := Calculate(models.CalculationRequest{
		AsOf: day("2026-01-08"), PermanentResidence: models.PRDegreeFinland, ConditionsMet: true,
		Permits:  []models.Permit{{Type: models.PermitA, StartDate: day("2020-01-08"), EndDate: day("2040-12-31")}},
		Absences: []models.Absence{{StartDate: day("2020-01-08"), EndDate: day("2025-01-08")}},
	})
	if !response.PermanentResidenceEligible || hasWarning(response, "pr_absence_review") {
		t.Fatal("Finnish degree route has no residence-time minimum; its separate conditions remain self-reported")
	}
}

func TestCalculateUnknownPRPathCannotGivePositiveEstimate(t *testing.T) {
	response := Calculate(models.CalculationRequest{
		AsOf: day("2030-01-08"), PermanentResidence: models.PRPath("unknown"), ConditionsMet: true,
		Permits: []models.Permit{{Type: models.PermitA, StartDate: day("2010-01-01"), EndDate: day("2040-12-31")}},
	})
	if response.PermanentResidenceEligible || response.PermanentResidenceEarliest != "" || !hasWarning(response, "pr_unknown_path") {
		t.Fatal("unrecognised path cannot produce a positive status")
	}
}
