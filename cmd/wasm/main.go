package main

import (
	"fmt"
	"math"
	"syscall/js"
	"time"
)

func calculateWrapper(this js.Value, args []js.Value) interface{} {
	jsPermits := args[0]
	abroadTotal := args[1].Int()
	abroad12m := args[2].Int()

	var citizenshipDays float64 = 0
	var bCredited float64 = 0
	var aCredited float64 = 0

	layout := "2006-01-02"
	var lastDate time.Time
	var firstADate time.Time

	for i := 0; i < jsPermits.Length(); i++ {
		p := jsPermits.Index(i)
		startStr := p.Get("start").String()
		endStr := p.Get("end").String()
		pType := p.Get("type").String()

		if startStr == "" || endStr == "" {
			continue
		}

		start, _ := time.Parse(layout, startStr)
		end, _ := time.Parse(layout, endStr)

		if end.After(lastDate) {
			lastDate = end
		}

		// Включаем оба дня в расчет (+1)
		days := math.Round(end.Sub(start).Hours()/24) + 1

		if pType == "B" {
			credited := days / 2.0
			bCredited += credited
			citizenshipDays += credited
		} else if pType == "A" {
			if firstADate.IsZero() || start.Before(firstADate) {
				firstADate = start
			}
			aCredited += days
			citizenshipDays += days
		}
	}

	// Логика Absence
	totalLeft := 365 - abroadTotal
	last12mLeft := 90 - abroad12m
	postponesBy := 0

	statusReason := fmt.Sprintf("OK: within limits (<=365 total, <=90 last 12m). Total left: %d | Last 12m left: %d", totalLeft, last12mLeft)

	if totalLeft < 0 || last12mLeft < 0 {
		statusReason = "Warning: Limits exceeded. Continuous residence may be broken."
		if totalLeft < 0 {
			postponesBy += int(math.Abs(float64(totalLeft)))
		}
		if last12mLeft < 0 {
			postponesBy += int(math.Abs(float64(last12mLeft)))
		}
	}

	// Citizenship (5 years / 1825 days)
	citReq := 1825.0
	isCitEligible := citizenshipDays >= citReq && postponesBy == 0
	citApplyDate := "Please enter dates"

	if isCitEligible {
		citApplyDate = "Eligible to apply now! 🎉"
	} else if !lastDate.IsZero() {
		daysNeeded := int(citReq-citizenshipDays) + postponesBy
		citApplyDate = lastDate.AddDate(0, 0, daysNeeded).Format("02/01/2006")
	}

	// PR (4 years / 1460 days - ONLY A type)
	prApplyDate := "N/A (Needs A-permit)"
	if !firstADate.IsZero() {
		prApplyDate = firstADate.AddDate(4, 0, 0).Format("02/01/2006")
	}

	return js.ValueOf(map[string]interface{}{
		"cit_days":       citizenshipDays,
		"b_credited":     bCredited,
		"a_credited":     aCredited,
		"cit_eligible":   isCitEligible,
		"cit_apply_date": citApplyDate,
		"status_reason":  statusReason,
		"postpones_by":   postponesBy,
		"pr_apply_date":  prApplyDate,
	})
}

func main() {
	c := make(chan struct{}, 0)
	js.Global().Set("calculateEligibility", js.FuncOf(calculateWrapper))
	<-c
}
