package calculator

import (
	"testing"
	"time"

	"github.com/XeUby/Eligibility-Calculator-for-Finnish-Citizenship-and-Permanent-Residence/internal/models"
)

func TestCalculateResidence(t *testing.T) {
	// Подготавливаем тестовые данные (Табличные тесты - это стандарт в Go)
	layout := "2006-01-02"
	start1, _ := time.Parse(layout, "2020-01-01")
	end1, _ := time.Parse(layout, "2021-01-01") // 366 дней (високосный год)

	start2, _ := time.Parse(layout, "2021-01-01")
	end2, _ := time.Parse(layout, "2022-01-01") // 365 дней

	permits := []models.Permit{
		{Type: models.PermitA, StartDate: start1, EndDate: end1}, // 366 дней
		{Type: models.PermitB, StartDate: start2, EndDate: end2}, // 365 / 2 = 182.5 дней
	}

	expectedDays := 366.0 + 182.5
	actualDays := CalculateResidence(permits)

	if actualDays != expectedDays {
		t.Errorf("Expected %f days, but got %f", expectedDays, actualDays)
	}
}
