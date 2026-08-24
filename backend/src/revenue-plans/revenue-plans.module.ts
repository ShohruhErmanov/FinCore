import { Module } from '@nestjs/common';
import { RevenuePlansController } from './revenue-plans.controller';
import { RevenuePlansService } from './revenue-plans.service';

@Module({ controllers: [RevenuePlansController], providers: [RevenuePlansService] })
export class RevenuePlansModule {}
