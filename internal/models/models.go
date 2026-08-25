// Package models contains the data shared by the calculator's delivery layers.
package models

import "time"

const (
	PermitA = "A"
	PermitB = "B"
	PermitP = "P"
)

// Permit is an inclusive period during which its holder had a valid Finnish
// residence permit. Dates are interpreted as calendar dates in Finland.
type Permit struct {
	Type      string    `json:"type"`
	StartDate time.Time `json:"start_date"`
	EndDate   time.Time `json:"end_date"`
}

// Absence is a trip abroad. Departure and return dates are residence days.
type Absence struct {
	StartDate time.Time `json:"start_date"`
	EndDate   time.Time `json:"end_date"`
}

type CitizenshipRoute string

const (
	CitizenshipStandard CitizenshipRoute = "standard"
	CitizenshipLanguage CitizenshipRoute = "language"
)

// PRPath represents the common permanent-residence paths available from 2026.
type PRPath string

const (
	PRSixYears          PRPath = "six_years"
	PRHighIncome        PRPath = "high_income"
	PRForeignDegree     PRPath = "foreign_degree"
	PRExcellentLanguage PRPath = "excellent_language"
)

// CalculationRequest is the public HTTP contract. Conditions are self-reported.
type CalculationRequest struct {
	Permits            []Permit         `json:"permits"`
	Absences           []Absence        `json:"absences"`
	AsOf               time.Time        `json:"as_of"`
	CitizenshipRoute   CitizenshipRoute `json:"citizenship_route"`
	PermanentResidence PRPath           `json:"permanent_residence_path"`
	ConditionsMet      bool             `json:"conditions_met"`
}

// CalculationResponse assesses only residence-time conditions, never the full
// legal eligibility for an immigration application.
type CalculationResponse struct {
	CitizenshipDays            int      `json:"citizenship_days"`
	CitizenshipRequired        int      `json:"citizenship_required_days"`
	CitizenshipEligible        bool     `json:"citizenship_residence_met"`
	CitizenshipEarliest        string   `json:"citizenship_earliest_date,omitempty"`
	PermanentResidenceDays     int      `json:"permanent_residence_days"`
	PermanentResidenceRequired int      `json:"permanent_residence_required_days"`
	PermanentResidenceEligible bool     `json:"permanent_residence_residence_met"`
	PermanentResidenceEarliest string   `json:"permanent_residence_earliest_date,omitempty"`
	Warnings                   []string `json:"warnings"`
}
