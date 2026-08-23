import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'fincore:isPublic';

/** Opts a route out of the globally applied SessionGuard. */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC_KEY, true);
