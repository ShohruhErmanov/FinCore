import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { describe, expect, it } from 'vitest';
import { AdminController } from '@/admin/admin.controller';
import { DailyRevenuesController } from '@/daily-revenues/daily-revenues.controller';
import { DailyRevenueResponseDto } from '@/daily-revenues/dto/daily-revenue.dto';
import { NotificationsController } from '@/notifications/notifications.controller';
import { ReminderPreviewResponseDto } from '@/notifications/dto/notification.dto';
import { ReportsController } from '@/reports/reports.controller';

// @nestjs/swagger intentionally does not export its metadata constants through
// the package entry point. These are its documented decorator metadata keys;
// keeping them local avoids reaching through the package's private exports.
const SWAGGER = {
  operation: 'swagger/apiOperation',
  parameters: 'swagger/apiParameters',
  response: 'swagger/apiResponse',
  security: 'swagger/apiSecurity',
} as const;

type ControllerClass = abstract new (...args: never[]) => object;

function routeHandlers(controller: ControllerClass): Array<(...args: never[]) => unknown> {
  return Object.getOwnPropertyNames(controller.prototype)
    .filter((name) => name !== 'constructor')
    .map((name) => Reflect.getOwnPropertyDescriptor(controller.prototype, name)?.value)
    .filter(
      (value): value is (...args: never[]) => unknown =>
        typeof value === 'function' && Reflect.hasMetadata(METHOD_METADATA, value),
    );
}

describe('PHASE 19 Swagger metadata', () => {
  it.each([
    ['daily revenues', DailyRevenuesController],
    ['notifications', NotificationsController],
    ['admin users', AdminController],
    ['reports', ReportsController],
  ] as const)('%s has one Swagger operation for every controller route', (_label, controller) => {
    const routes = routeHandlers(controller);
    const documented = routes.filter((handler) =>
      Reflect.hasMetadata(SWAGGER.operation, handler),
    );

    expect(routes.length).toBeGreaterThan(0);
    expect(documented).toHaveLength(routes.length);
  });

  it('documents reminder-preview as a cookie-authenticated concrete response', () => {
    const handler = NotificationsController.prototype.reminderPreview;
    const security = Reflect.getMetadata(SWAGGER.security, NotificationsController) as
      | Array<Record<string, string[]>>
      | undefined;
    const responses = Reflect.getMetadata(SWAGGER.response, handler) as
      | Record<string, { type?: unknown; description?: string }>
      | undefined;
    const parameters = Reflect.getMetadata(SWAGGER.parameters, handler) as
      | Array<{ name?: string; in?: string; required?: boolean }>
      | undefined;

    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe('reminder-preview');
    expect(security).toContainEqual({ cookie: [] });
    expect(parameters).toContainEqual(expect.objectContaining({ name: 'date', in: 'query', required: false }));
    expect(responses?.['200']?.type).toBe(ReminderPreviewResponseDto);
    expect(Object.keys(responses ?? {}).sort()).toEqual(['200', '400', '401', '403']);
  });

  it('documents DailyRevenue POST idempotency and success/error responses', () => {
    const handler = DailyRevenuesController.prototype.create;
    const security = Reflect.getMetadata(SWAGGER.security, DailyRevenuesController) as
      | Array<Record<string, string[]>>
      | undefined;
    const responses = Reflect.getMetadata(SWAGGER.response, handler) as
      | Record<string, { type?: unknown; description?: string }>
      | undefined;
    const parameters = Reflect.getMetadata(SWAGGER.parameters, handler) as
      | Array<{ name?: string; in?: string; required?: boolean }>
      | undefined;

    expect(security).toContainEqual({ cookie: [] });
    expect(parameters).toContainEqual(
      expect.objectContaining({ name: 'Idempotency-Key', in: 'header', required: true }),
    );
    expect(responses?.['200']?.type).toBe(DailyRevenueResponseDto);
    expect(responses?.['201']?.type).toBe(DailyRevenueResponseDto);
    expect(Object.keys(responses ?? {}).sort()).toEqual([
      '200',
      '201',
      '400',
      '401',
      '403',
      '409',
      '422',
    ]);
  });
});
