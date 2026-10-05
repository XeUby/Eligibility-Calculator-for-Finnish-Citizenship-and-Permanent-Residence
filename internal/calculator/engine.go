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

var (
	citizenshipTestApplicationDate = time.Date(2027, time.March, 1, 0, 0, 0, 0, time.UTC)
	permanentResidenceRulesDate    = time.Date(2026, time.January, 8, 0, 0, 0, 0, time.UTC)
)

type dateRange struct{ start, end time.Time }

// Calculate returns an estimate as of request.AsOf. It only assesses the
// residence-time component; Migri remains the authority for each application.
func Calculate(request models.CalculationRequest) models.CalculationResponse {
	asOf := dateOnly(request.AsOf)
	if asOf.IsZero() {
		asOf = dateOnly(time.Now())
	}
	response := models.CalculationResponse{WarningCodes: []string{}, Warnings: []string{}}
	response.CitizenshipRequiredYears = citizenshipRequirement(request.CitizenshipRoute)

	span, found := latestContinuousSpan(request.Permits, asOf, validPermitType)
	if !found {
		addWarning(&response, "no_permit_span", "No uninterrupted valid permit period reaches the selected date.")
		return response
	}
	aSpan, hasASpan := latestContinuousSpan(request.Permits, asOf, func(p models.Permit) bool { return p.Type == models.PermitA || p.Type == models.PermitP })
	if !hasASpan {
		addWarning(&response, "citizenship_requires_ap", "A valid A or P permit is required for the common citizenship route.")
	}
	if hasPermitGapBeforeSpan(request.Permits, span, asOf) {
		addWarning(&response, "permit_gap", "A gap in the permit history means periods before the current uninterrupted span are not counted.")
	}
	creditStart, firstA, bCredit, days, laterBDays := citizenshipCredit(request.Permits, span)
	absences := absenceAdjustment(request.Absences, creditStart, asOf)
	if absences.merged {
		addWarning(&response, "overlapping_trips", "Overlapping or duplicate trips were counted only once.")
	}
	for _, warning := range absences.warnings {
		addWarning(&response, "absence_limits", warning)
	}
	response.CitizenshipBPermitCreditDays = bCredit
	response.CitizenshipAPDays = days - bCredit
	response.CitizenshipAbsenceDays = absences.allDays
	response.CitizenshipAbsencePenaltyDays = absences.penalty
	response.CitizenshipDays = max(0, days-absences.penalty)
	citizenshipAssessmentDate := asOf
	if firstA.IsZero() {
		addWarning(&response, "citizenship_needs_ap", "Add an A or P permit period to estimate a citizenship application date.")
	} else if hasASpan {
		// Preserve calendar-year anniversaries. Initial B time contributes half;
		// later B days contribute nothing and cannot silently advance that date.
		baseDate := firstA.AddDate(response.CitizenshipRequiredYears, 0, -bCredit+laterBDays)
		minimumDate := asOf
		if bCredit > 0 {
			minimumDate = maxDate(minimumDate, aSpan.start.AddDate(1, 0, 0))
			addWarning(&response, "citizenship_b_credit_year", "When B-permit time is credited, at least one uninterrupted year under an A or P permit is required before Migri decides the application. This estimate conservatively requires that year by the selected date.")
		}
		if laterBDays > 0 {
			addWarning(&response, "citizenship_later_b", "B-permit periods after your first A or P permit are not credited in this estimate and delay the projected citizenship date.")
		}
		targetDate := projectedCitizenshipDate(request.Absences, creditStart, baseDate, minimumDate)
		citizenshipAssessmentDate = maxDate(asOf, targetDate)
		if hasFiveYearAbsence(request.Absences, dateRange{creditStart, targetDate}) {
			addWarning(&response, "citizenship_absence_review", "A recorded stay abroad lasts more than five continuous years and interrupts the citizenship residence period. Migri must assess when counting can restart; no reliable application date is shown.")
		} else {
			response.CitizenshipEligible = !asOf.Before(targetDate)
			response.CitizenshipEarliest = targetDate.Format("2006-01-02")
			if !response.CitizenshipEligible {
				addWarning(&response, "citizenship_projection", "The projected citizenship date assumes uninterrupted A/P residence and no further absences beyond the recorded trips.")
			}
		}
	}
	if !citizenshipAssessmentDate.Before(citizenshipTestApplicationDate) {
		addWarning(&response, "citizenship_civic_knowledge", "For citizenship applications submitted on or after 2027-03-01, Migri states that applicants aged 18–64 will need to meet the new civic-knowledge requirement, usually with a citizenship test. Check the official exemptions and alternatives.")
	}

	prRequired, prWarning := prRequirement(request.PermanentResidence)
	response.PermanentResidenceRequiredYears = prRequired
	if prWarning != "" {
		addWarning(&response, prWarningCode(request.PermanentResidence), prWarning)
	}
	if asOf.Before(permanentResidenceRulesDate) {
		addWarning(&response, "pr_rules_date", "The selected permanent-residence paths apply only to applications submitted on or after 2026-01-08. Earlier application rules are outside this estimate.")
		return response
	}
	if prWarningCode(request.PermanentResidence) == "pr_unknown_path" {
		return response
	}
	if !hasASpan {
		addWarning(&response, "no_pr_ap_span", "No uninterrupted A or P permit period reaches the selected date for permanent residence.")
		return response
	}
	response.PermanentResidenceDays = daysInclusive(aSpan.start, asOf)
	prTargetDate := aSpan.start.AddDate(prRequired, 0, 0)
	assessmentDate := maxDate(asOf, prTargetDate)
	// The Finnish-degree path has no residence-time minimum. For 4/6-year
	// paths, compare actual days in Finland in the required calendar window.
	if prRequired > 0 && !prPhysicalPresenceMet(request.Absences, assessmentDate, prRequired) {
		addWarning(&response, "pr_absence_review", "Recorded trips exceed half of the required permanent-residence period. Continuity and possible exceptions need Migri's assessment; no reliable application date is shown.")
	} else {
		response.PermanentResidenceEligible = !asOf.Before(prTargetDate) && request.ConditionsMet
		response.PermanentResidenceEarliest = assessmentDate.Format("2006-01-02")
		if asOf.Before(prTargetDate) {
			addWarning(&response, "pr_projection", "The projected permanent-residence date assumes uninterrupted A/P residence, no further absences beyond the recorded trips, and the confirmed path conditions.")
		}
	}
	if !request.ConditionsMet {
		addWarning(&response, "pr_conditions_unconfirmed", "You have not confirmed the additional conditions for the selected permanent-residence path.")
	}
	return response
}

func addWarning(response *models.CalculationResponse, code, message string) {
	response.WarningCodes = append(response.WarningCodes, code)
	response.Warnings = append(response.Warnings, message)
}

func prWarningCode(path models.PRPath) string {
	if path == models.PRDegreeFinland {
		return "pr_finnish_degree_requirements"
	}
	if path == models.PRSixYears {
		return "pr_six_requirements"
	}
	if path == models.PRHighIncome || path == models.PRForeignDegree || path == models.PRExcellentLanguage {
		return "pr_path_conditions"
	}
	return "pr_unknown_path"
}

func citizenshipRequirement(route models.CitizenshipRoute) int {
	if route == models.CitizenshipLanguage {
		return CitizenshipLanguageYears
	}
	return CitizenshipStandardYears
}

func prRequirement(path models.PRPath) (int, string) {
	switch path {
	case models.PRDegreeFinland:
		return 0, "The Finnish-degree path has its own degree and developing Finnish/Swedish language requirements; verify them with Migri."
	case models.PRHighIncome, models.PRForeignDegree, models.PRExcellentLanguage:
		return PRFourYears, "The selected 4-year permanent-residence path has additional statutory conditions; verify them with Migri."
	case models.PRSixYears:
		return PRSixYears, "The 6-year permanent-residence path requires B1 Finnish/Swedish and two years of work history (with the statutory age exception)."
	default:
		return PRSixYears, "Select a permanent-residence application path before relying on this estimate."
	}
}

func citizenshipCredit(permits []models.Permit, span dateRange) (time.Time, time.Time, int, int, int) {
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
		return span.start, time.Time{}, 0, 0, 0
	}
	creditHalfDays, bDays, laterBDays := 0, 0, 0
	for d := span.start; !d.After(span.end); d = d.AddDate(0, 0, 1) {
		types := permitTypesOn(permits, d)
		if d.Before(firstA) && types[models.PermitB] {
			creditHalfDays++
			bDays++
		}
		if types[models.PermitA] || types[models.PermitP] {
			creditHalfDays += 2
		} else if !d.Before(firstA) {
			laterBDays++
		}
	}
	return span.start, firstA, bDays / 2, creditHalfDays / 2, laterBDays
}

// projectedCitizenshipDate recomputes the last-year allowance at the projected
// application date. Freezing today's 90-day penalty would delay dates even
// after an old trip has left that window. Recorded future trips are included.
func projectedCitizenshipDate(absences []models.Absence, start, baseDate, minimumDate time.Time) time.Time {
	first := maxDate(baseDate, minimumDate)
	lastRecordedDay := first
	for _, absence := range absences {
		if !absence.StartDate.IsZero() && !absence.EndDate.IsZero() {
			lastRecordedDay = maxDate(lastRecordedDay, dateOnly(absence.EndDate))
		}
	}
	// The penalty can never exceed all recorded absence days. This bound
	// guarantees a qualifying date under continued A/P residence, unless a
	// long absence requires the separate manual continuity assessment.
	allRecordedDays := absenceAdjustment(absences, start, lastRecordedDay).allDays
	last := maxDate(first, baseDate.AddDate(0, 0, allRecordedDays))
	for first.Before(last) {
		middle := first.AddDate(0, 0, (daysInclusive(first, last)-1)/2)
		penalty := absenceAdjustment(absences, start, middle).penalty
		if middle.Before(baseDate.AddDate(0, 0, penalty)) {
			first = middle.AddDate(0, 0, 1)
		} else {
			last = middle
		}
	}
	return first
}

func hasFiveYearAbsence(absences []models.Absence, window dateRange) bool {
	for _, trip := range mergeTouchingRanges(absenceRangesInWindow(absences, window)) {
		if trip.end.AddDate(0, 0, 1).After(trip.start.AddDate(5, 0, 0)) {
			return true
		}
	}
	return false
}

func prPhysicalPresenceMet(absences []models.Absence, assessmentDate time.Time, requiredYears int) bool {
	window := dateRange{assessmentDate.AddDate(-requiredYears, 0, 1), assessmentDate}
	absentDays := 0
	for _, trip := range mergeOverlappingRanges(absenceRangesInWindow(absences, window)) {
		absentDays += daysInclusive(trip.start, trip.end)
	}
	return 2*absentDays <= daysInclusive(window.start, window.end)
}

type absenceSummary struct {
	allDays  int
	penalty  int
	merged   bool
	warnings []string
}

func absenceAdjustment(absences []models.Absence, start, asOf time.Time) absenceSummary {
	if start.IsZero() {
		return absenceSummary{}
	}
	ranges := absenceRangesInWindow(absences, dateRange{start, asOf})
	merged := mergeOverlappingRanges(ranges)
	allDays, recentDays := 0, 0
	recentStart := asOf.AddDate(-1, 0, 1)
	for _, trip := range merged {
		allDays += daysInclusive(trip.start, trip.end)
		recentDays += daysInIntersection(trip, dateRange{start: recentStart, end: asOf})
	}
	penalty := max(max(0, allDays-maxAbsenceDays), max(0, recentDays-maxRecentAbsenceDays))
	summary := absenceSummary{allDays: allDays, penalty: penalty, merged: len(merged) < len(ranges)}
	if penalty == 0 {
		return summary
	}
	summary.warnings = []string{fmt.Sprintf("Recorded absences exceed the 365-day total or 90-day last-year limit; this estimate excludes at least %d day(s).", penalty)}
	return summary
}

func absenceRangesInWindow(absences []models.Absence, window dateRange) []dateRange {
	ranges := make([]dateRange, 0, len(absences))
	for _, absence := range absences {
		trip := absenceRange(absence)
		if trip.start.IsZero() || trip.end.Before(trip.start) || !overlaps(trip, window) {
			continue
		}
		ranges = append(ranges, dateRange{maxDate(trip.start, window.start), minDate(trip.end, window.end)})
	}
	return ranges
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
	merged := mergeTouchingRanges(ranges)
	for _, r := range merged {
		if contains(r, asOf) {
			return r, true
		}
	}
	return dateRange{}, false
}

func hasPermitGapBeforeSpan(permits []models.Permit, span dateRange, asOf time.Time) bool {
	for _, permit := range permits {
		if !validPermitType(permit) {
			continue
		}
		r := permitRange(permit)
		if r.start.IsZero() || r.end.Before(r.start) || r.start.After(asOf) {
			continue
		}
		if r.end.Before(span.start.AddDate(0, 0, -1)) {
			return true
		}
	}
	return false
}

func mergeTouchingRanges(ranges []dateRange) []dateRange {
	return mergeRanges(ranges, func(nextStart, currentEnd time.Time) bool { return !nextStart.After(currentEnd.AddDate(0, 0, 1)) })
}

func mergeOverlappingRanges(ranges []dateRange) []dateRange {
	return mergeRanges(ranges, func(nextStart, currentEnd time.Time) bool { return !nextStart.After(currentEnd) })
}

func mergeRanges(ranges []dateRange, joins func(time.Time, time.Time) bool) []dateRange {
	if len(ranges) == 0 {
		return nil
	}
	sorted := append([]dateRange(nil), ranges...)
	sort.Slice(sorted, func(i, j int) bool { return sorted[i].start.Before(sorted[j].start) })
	merged := []dateRange{sorted[0]}
	for _, r := range sorted[1:] {
		last := &merged[len(merged)-1]
		if joins(r.start, last.end) {
			if r.end.After(last.end) {
				last.end = r.end
			}
		} else {
			merged = append(merged, r)
		}
	}
	return merged
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
	if a.StartDate.IsZero() || a.EndDate.IsZero() {
		return dateRange{}
	}
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
