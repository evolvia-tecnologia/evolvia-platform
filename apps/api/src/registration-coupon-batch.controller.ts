import { Body, Controller, Param, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, AuthenticatedRequest } from './auth.guard';
import { RegistrationCouponBatchService } from './registration-coupon-batch.service';

@UseGuards(AuthGuard)
@Controller('events/:eventId/registration-coupon-batches')
export class RegistrationCouponBatchController {
  constructor(private readonly batches: RegistrationCouponBatchService) {}

  @Post()
  create(@Req() request: AuthenticatedRequest, @Param('eventId') eventId: string, @Body() input: unknown) {
    return this.batches.create(request.user!.id, eventId, input);
  }
}
