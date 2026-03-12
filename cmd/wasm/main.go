package main

import (
	"syscall/js" // Специальный пакет для связи с браузером
	"time"

	"github.com/XeUby/Eligibility-Calculator-for-Finnish-Citizenship-and-Permanent-Residence/internal/calculator"
	"github.com/XeUby/Eligibility-Calculator-for-Finnish-Citizenship-and-Permanent-Residence/internal/models"
)

// Эта функция будет вызываться прямо из JavaScript на странице
func calculateWrapper(this js.Value, args []js.Value) interface{} {
	// 1. Извлекаем данные, которые пользователь ввел на сайте
	permitType := args[0].String()   // Например, "A"
	startDateStr := args[1].String() // "2020-01-01"
	endDateStr := args[2].String()   // "2025-01-01"

	// 2. Превращаем строки с датами в формат, понятный Go
	layout := "2006-01-02"
	start, _ := time.Parse(layout, startDateStr)
	end, _ := time.Parse(layout, endDateStr)

	// 3. Создаем структуру данных
	permits := []models.Permit{
		{Type: permitType, StartDate: start, EndDate: end},
	}

	// 4. Вызываем твой уже написанный калькулятор из папки internal/calculator
	days := calculator.CalculateResidence(permits)
	eligible, msg := calculator.CheckEligibility(days)

	// 5. Возвращаем результат обратно в JavaScript в виде объекта
	return map[string]interface{}{
		"total_days":  days,
		"is_eligible": eligible,
		"message":     msg,
	}
}

func main() {
	// Этот канал нужен, чтобы программа в браузере не закрылась сразу
	c := make(chan struct{}, 0)

	// "Регистрируем" нашу функцию в браузере под именем "calculateEligibility"
	js.Global().Set("calculateEligibility", js.FuncOf(calculateWrapper))

	<-c
}
