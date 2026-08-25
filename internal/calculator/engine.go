// Package calculator implements a conservative, explainable estimate of the
// residence-time parts of Finnish citizenship and permanent residence rules.
package calculator

import (
	"fmt"
	"sort"
	"time"

	"github.com/XeUby/Eligibility-Calculator-for-Finnish-Citizenship-and-Permanent-Residence/internal/models"
)

const (
	CitizenshipStandardYears = 8
	CitizenshipLanguageYears = 5
	PRSixYears               = 6
	PRFourYears              = 4
	maxAbsenceDays           = 365
	maxRecentAbsenceDays     = 90
)

var citizenshipTestApplicationDate = time.Date(2027, time.March, 1, 0, 0, 0, 0, time.UTC)

type dateRange struct{ start, end time.Time }

// Calculate returns an estimate as of request.AsOf. It only assesses the
// residence-time component; Migri remains the authority for each application.
func Calculate(request models.CalculationRequest) models.CalculationResponse {
	asOf := dateOnly(request.AsOf)
	if asOf.IsZero() {
		asOf = dateOnly(time.Now())
	}
	response := models.CalculationResponse{Warnings: []string{}}
	response.CitizenshipRequiredYears = citizenshipRequirement(request.CitizenshipRoute)

	span, found := latestContinuousSpan(request.Permits, asOf, validPermitType)
	if !found {
		response.Warnings = append(response.Warnings, "No uninterrupted valid permit period reaches the selected date.")
		return response
	}
	if !hasCurrentContinuousPermit(request.Permits, asOf) {
		response.Warnings = append(response.Warnings, "A valid A or P permit is required for the common citizenship route.")
	}
	creditStart, firstA, bCredit, days := citizenshipCredit(request.Permits, span)
	penalty, absenceWarnings := absenceAdjustment(request.Absences, creditStart, asOf)
	response.Warnings = append(response.Warnings, absenceWarnings...)
	response.CitizenshipDays = max(0, days-penalty)
	if firstA.IsZero() {
		response.Warnings = append(response.Warnings, "Add an A or P permit period to estimate a citizenship application date.")
	} else {
		targetDate := firstA.AddDate(response.CitizenshipRequiredYears, 0, -bCredit+penalty)
		response.CitizenshipEligible = !asOf.Before(targetDate) && hasCurrentContinuousPermit(request.Permits, asOf)
		if response.CitizenshipEligible {
			response.CitizenshipEarliest = asOf.Format("2006-01-02")
		} else {
			response.CitizenshipEarliest = targetDate.Format("2006-01-02")
			response.Warnings = append(response.Warnings, "The projected citizenship date assumes uninterrupted legal residence and no further absences.")
		}
		if !targetDate.Before(citizenshipTestApplicationDate) {
			response.Warnings = append(response.Warnings, "For citizenship applications submitted on or after 2027-03-01, Migri states that applicants aged 18–64 will need to meet the new civic-knowledge requirement, usually with a citizenship test. Check the official exemptions and alternatives.")
		}
	}

	prRequired, prWarning := prRequirement(request.PermanentResidence)
	response.PermanentResidenceRequiredYears = prRequired
	if prWarning != "" {
		response.Warnings = append(response.Warnings, prWarning)
	}
	aSpan, hasASpan := latestContinuousSpan(request.Permits, asOf, func(p models.Permit) bool { return p.Type == models.PermitA || p.Type == models.PermitP })
	if !hasASpan {
		response.Warnings = append(response.Warnings, "No uninterrupted A or P permit period reaches the selected date for permanent residence.")
		return response
	}
	response.PermanentResidenceDays = daysInclusive(aSpan.start, asOf)
	prTargetDate := aSpan.start.AddDate(prRequired, 0, 0)
	response.PermanentResidenceEligible = !asOf.Before(prTargetDate) && request.ConditionsMet
	if !asOf.Before(prTargetDate) {
		response.PermanentResidenceEarliest = asOf.Format("2006-01-02")
	} else {
		response.PermanentResidenceEarliest = prTargetDate.Format("2006-01-02")
		response.Warnings = append(response.Warnings, "The projected permanent-residence date assumes the selected A/P permit remains uninterrupted.")
	}
	if !request.ConditionsMet {
		response.Warnings = append(response.Warnings, "You have not confirmed the additional conditions for the selected permanent-residence path.")
	}
	return response
}

func citizenshipRequirement(route models.CitizenshipRoute) int {
	if route == models.CitizenshipLanguage {
		return CitizenshipLanguageYears
	}
	return CitizenshipStandardYears
}

func prRequirement(path models.PRPath) (int, string) {
	switch path {
	case models.PRHighIncome, models.PRForeignDegree, models.PRExcellentLanguage:
		return PRFourYears, "The selected 4-year permanent-residence path has additional statutory conditions; verify them with Migri."
	case models.PRSixYears:
		return PRSixYears, "The 6-year permanent-residence path requires B1 Finnish/Swedish and two years of work history (with the statutory age exception)."
	default:
		return PRSixYears, "Select a permanent-residence application path before relying on this estimate."
	}
}

func citizenshipCredit(permits []models.Permit, span dateRange) (time.Time, time.Time, int, int) {
	firstA := time.Time{}
	for _, permit := range permits {
		if (permit.Type == models.PermitA || permit.Type == models.PermitP) && overlaps(permitRange(permit), span) {
			candidate := maxDate(dateOnly(permit.StartDate), span.start)
			if firstA.IsZero() || candidate.Before(firstA) {
				firstA = candidate
			}
		}
	}
	if firstA.IsZero() {
		return span.start, time.Time{}, 0, 0
	}
	creditHalfDays, bDays := 0, 0
	for d := span.start; !d.After(span.end); d = d.AddDate(0, 0, 1) {
		types := permitTypesOn(permits, d)
		if d.Before(firstA) && types[models.PermitB] {
			creditHalfDays++
			bDays++
		}
		if types[models.PermitA] || types[models.PermitP] {
			creditHalfDays += 2
		}
	}
	return span.start, firstA, bDays / 2, creditHalfDays / 2
}

func absenceAdjustment(absences []models.Absence, start, asOf time.Time) (int, []string) {
	if start.IsZero() {
		return 0, nil
	}
	allDays, recentDays := 0, 0
	recentStart := asOf.AddDate(-1, 0, 1)
	for _, absence := range absences {
		trip := absenceRange(absence)
		if trip.start.IsZero() || trip.end.Before(trip.start) {
			continue
		}
		allDays += daysInIntersection(trip, dateRange{start: start, end: asOf})
		recentDays += daysInIntersection(trip, dateRange{start: recentStart, end: asOf})
	}
	penalty := max(max(0, allDays-maxAbsenceDays), max(0, recentDays-maxRecentAbsenceDays))
	if penalty == 0 {
		return 0, nil
	}
	return penalty, []string{fmt.Sprintf("Recorded absences exceed the 365-day total or 90-day last-year limit; this estimate excludes at least %d day(s).", penalty)}
}

func latestContinuousSpan(permits []models.Permit, asOf time.Time, accept func(models.Permit) bool) (dateRange, bool) {
	ranges := make([]dateRange, 0, len(permits))
	for _, permit := range permits {
		if !accept(permit) {
			continue
		}
		r := permitRange(permit)
		if r.start.IsZero() || r.end.Before(r.start) || r.start.After(asOf) {
			continue
		}
		if r.end.After(asOf) {
			r.end = asOf
		}
		ranges = append(ranges, r)
	}
	if len(ranges) == 0 {
		return dateRange{}, false
	}
	sort.Slice(ranges, func(i, j int) bool { return ranges[i].start.Before(ranges[j].start) })
	merged := []dateRange{ranges[0]}
	for _, r := range ranges[1:] {
		last := &merged[len(merged)-1]
		if !r.start.After(last.end.AddDate(0, 0, 1)) {
			if r.end.After(last.end) {
				last.end = r.end
			}
		} else {
			merged = append(merged, r)
		}
	}
	for _, r := range merged {
		if contains(r, asOf) {
			return r, true
		}
	}
	return dateRange{}, false
}

func hasCurrentContinuousPermit(permits []models.Permit, asOf time.Time) bool {
	for _, permit := range permits {
		if (permit.Type == models.PermitA || permit.Type == models.PermitP) && contains(permitRange(permit), asOf) {
			return true
		}
	}
	return false
}
func permitTypesOn(permits []models.Permit, day time.Time) map[string]bool {
	types := map[string]bool{}
	for _, p := range permits {
		if contains(permitRange(p), day) {
			types[p.Type] = true
		}
	}
	return types
}
func validPermitType(p models.Permit) bool {
	return p.Type == models.PermitA || p.Type == models.PermitB || p.Type == models.PermitP
}
func permitRange(p models.Permit) dateRange {
	return dateRange{dateOnly(p.StartDate), dateOnly(p.EndDate)}
}
func absenceRange(a models.Absence) dateRange {
	return dateRange{dateOnly(a.StartDate).AddDate(0, 0, 1), dateOnly(a.EndDate).AddDate(0, 0, -1)}
}
func dateOnly(v time.Time) time.Time {
	if v.IsZero() {
		return time.Time{}
	}
	return time.Date(v.Year(), v.Month(), v.Day(), 0, 0, 0, 0, time.UTC)
}
func contains(r dateRange, d time.Time) bool { return !d.Before(r.start) && !d.After(r.end) }
func overlaps(a, b dateRange) bool           { return !a.end.Before(b.start) && !b.end.Before(a.start) }
func daysInclusive(start, end time.Time) int {
	if end.Before(start) {
		return 0
	}
	return int(end.Sub(start).Hours()/24) + 1
}
func daysInIntersection(a, b dateRange) int {
	return daysInclusive(maxDate(a.start, b.start), minDate(a.end, b.end))
}
func maxDate(a, b time.Time) time.Time {
	if a.After(b) {
		return a
	}
	return b
}
func minDate(a, b time.Time) time.Time {
	if a.Before(b) {
		return a
	}
	return b
}
func max(a, b int) int {
	if a > b {
		return a
	}
	return b
}
