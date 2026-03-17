package main

import (
	"syscall/js"
	"time"

	"github.com/XeUby/Eligibility-Calculator-for-Finnish-Citizenship-and-Permanent-Residence/internal/calculator"
	"github.com/XeUby/Eligibility-Calculator-for-Finnish-Citizenship-and-Permanent-Residence/internal/models"
)

func calculateWrapper(this js.Value, args []js.Value) interface{} {
	// Получаем массив пермитов из JS
	jsPermits := args[0]
	abroadDays := args[1].Int()

	var permits []models.Permit
	layout := "2006-01-02"

	for i := 0; i < jsPermits.Length(); i++ {
		p := jsPermits.Index(i)
		start, _ := time.Parse(layout, p.Get("start").String())
		end, _ := time.Parse(layout, p.Get("end").String())
		permits = append(permits, models.Permit{
			Type:      p.Get("type").String(),
			StartDate: start,
			EndDate:   end,
		})
	}

	totalDays := calculator.CalculateResidence(permits)
	// Вычитаем дни за границей
	effectiveDays := totalDays - float64(abroadDays)

	eligible, msg := calculator.CheckEligibility(effectiveDays)

	return map[string]interface{}{
		"total_days":  effectiveDays,
		"is_eligible": eligible,
		"message":     msg,
		"days_from_b": totalDays - effectiveDays, // для справки
	}
}

func main() {
	c := make(chan struct{}, 0)
	js.Global().Set("calculateEligibility", js.FuncOf(calculateWrapper))
	<-c
}
