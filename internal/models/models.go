package models

import "time"

// Константы для типов разрешений (A, B, P)
const (
	PermitA = "A" // Непрерывное (Continuous) - 100% времени
	PermitB = "B" // Временное (Temporary) - 50% времени
)

// Permit описывает одно разрешение на проживание
type Permit struct {
	Type      string    `json:"type"`
	StartDate time.Time `json:"start_date"`
	EndDate   time.Time `json:"end_date"`
}

// Request - то, что мы получаем от пользователя (фронтенда/Postman)
type CalculationRequest struct {
	Permits []Permit `json:"permits"`
}

// Response - то, что мы возвращаем
type CalculationResponse struct {
	TotalDays    float64 `json:"total_days"`
	IsEligible   bool    `json:"is_eligible"`
	RequiredDays float64 `json:"required_days"`
	Message      string  `json:"message"`
}
