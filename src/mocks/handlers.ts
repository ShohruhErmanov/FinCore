import { authHandlers } from './routes/auth';
import { referenceHandlers } from './routes/reference';
import { dashboardHandlers } from './routes/dashboard';
import { expenseHandlers } from './routes/expenses';
import { budgetHandlers } from './routes/budgets';
import { revenueHandlers } from './routes/revenue';
import { reportHandlers } from './routes/reports';
import { notificationHandlers } from './routes/notifications';
import { importHandlers } from './routes/imports';
import { masterDataHandlers } from './routes/master-data';
import { adminHandlers } from './routes/admin';
import { investorHandlers } from './routes/investors';

export const handlers = [
  ...authHandlers,
  ...referenceHandlers,
  ...dashboardHandlers,
  ...expenseHandlers,
  ...budgetHandlers,
  ...revenueHandlers,
  ...reportHandlers,
  ...notificationHandlers,
  ...importHandlers,
  ...masterDataHandlers,
  ...adminHandlers,
  ...investorHandlers,
];
