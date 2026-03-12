package calculator

import (
	"github.com/XeUby/Eligibility-Calculator-for-Finnish-Citizenship-and-Permanent-Residence/internal/models"
)

// Для гражданства Финляндии нужно 5 лет (примерно 1825 дней)
const RequiredDaysForCitizenship = 1825.0

// CalculateResidence высчитывает количество дней в зависимости от типа пермита
func CalculateResidence(permits []models.Permit) float64 {
	var totalDays float64 = 0

	for _, p := range permits {
		// Считаем разницу в днях
		days := p.EndDate.Sub(p.StartDate).Hours() / 24

		// Применяем финские правила Migri
		switch p.Type {
		case models.PermitA:
			totalDays += days // A permit дает 100% времени
		case models.PermitB:
			totalDays += days / 2.0 // B permit дает только 50% времени
		}
	}

	return totalDays
}

// CheckEligibility проверяет, хватает ли дней для гражданства
func CheckEligibility(totalDays float64) (bool, string) {
	if totalDays >= RequiredDaysForCitizenship {
		return true, "Congratulations! You meet the standard time requirement for Finnish citizenship."
	}
	return false, "Not eligible yet. More residence time is required."
}
