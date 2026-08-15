package store

import (
	"context"
	"fmt"
)

func (s *Store) GetDataPlan(ctx context.Context) (DataPlan, error) {
	var plan DataPlan
	err := s.db.QueryRow(ctx, `
		select
			allowance_bytes,
			billing_day,
			alert_thresholds,
			updated_at
		from data_plan_settings
		where id = 1`,
	).Scan(&plan.AllowanceBytes,
		&plan.BillingDay, &plan.AlertThresholds, &plan.UpdatedAt)
	if err != nil {
		return DataPlan{}, fmt.Errorf("get data plan: %w", err)
	}
	return plan, nil
}
func (s *Store) SaveDataPlan(ctx context.Context, plan DataPlan) (DataPlan, error) {
	err := s.db.QueryRow(ctx, `
		update data_plan_settings
		set allowance_bytes = $1,
			billing_day = $2,
			alert_thresholds = $3,
			updated_at = now()
		where id = 1
		returning updated_at`, plan.AllowanceBytes, plan.BillingDay, plan.AlertThresholds).Scan(&plan.UpdatedAt)
	if err != nil {
		return DataPlan{}, fmt.Errorf("save data plan: %w", err)
	}
	return plan, nil
}
