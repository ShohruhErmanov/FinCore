import type { QueryClient } from '@tanstack/react-query';
import { queryKeys } from './query-keys';

export async function invalidateExpenseAggregates(queryClient: QueryClient): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.dashboardRoot }),
    queryClient.invalidateQueries({ queryKey: queryKeys.reportRoot }),
    queryClient.invalidateQueries({ queryKey: queryKeys.expensesRoot }),
    queryClient.invalidateQueries({ queryKey: queryKeys.budgetRoot }),
  ]);
}

export async function invalidateRevenueAggregates(queryClient: QueryClient): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.dashboardRoot }),
    queryClient.invalidateQueries({ queryKey: queryKeys.revenuesRoot }),
    queryClient.invalidateQueries({ queryKey: queryKeys.revenuePlanRoot }),
  ]);
}

export async function invalidatePlanningAggregates(queryClient: QueryClient): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.dashboardRoot }),
    queryClient.invalidateQueries({ queryKey: queryKeys.reportRoot }),
    queryClient.invalidateQueries({ queryKey: queryKeys.budgetRoot }),
    queryClient.invalidateQueries({ queryKey: queryKeys.revenuePlanRoot }),
  ]);
}
