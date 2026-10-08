import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, AuthenticatedRequest } from './auth.guard';
import { ExhibitorService } from './exhibitor.service';

@UseGuards(AuthGuard)
@Controller('events/:eventId/exhibitor')
export class ExhibitorController {
  constructor(private readonly exhibitors: ExhibitorService) {}

  @Get()
  home(@Req() request: AuthenticatedRequest, @Param('eventId') eventId: string) {
    return this.exhibitors.home(request.user!.id, eventId);
  }

  @Post('companies')
  saveCompany(@Req() request: AuthenticatedRequest, @Param('eventId') eventId: string, @Body() input: unknown) {
    return this.exhibitors.saveCompany(request.user!.id, eventId, input);
  }

  @Post('credentials')
  saveCredential(@Req() request: AuthenticatedRequest, @Param('eventId') eventId: string, @Body() input: unknown) {
    return this.exhibitors.saveCredential(request.user!.id, eventId, input);
  }

  @Post('credentials/:credentialId/attendance')
  markCredential(
    @Req() request: AuthenticatedRequest,
    @Param('eventId') eventId: string,
    @Param('credentialId') credentialId: string,
    @Body() input: unknown,
  ) {
    return this.exhibitors.markCredential(request.user!.id, eventId, credentialId, input);
  }

  @Post('forms')
  saveForm(@Req() request: AuthenticatedRequest, @Param('eventId') eventId: string, @Body() input: unknown) {
    return this.exhibitors.saveForm(request.user!.id, eventId, input);
  }

  @Post('products')
  saveProduct(@Req() request: AuthenticatedRequest, @Param('eventId') eventId: string, @Body() input: unknown) {
    return this.exhibitors.saveProduct(request.user!.id, eventId, input);
  }

  @Post('downloads')
  saveDownload(@Req() request: AuthenticatedRequest, @Param('eventId') eventId: string, @Body() input: unknown) {
    return this.exhibitors.saveDownload(request.user!.id, eventId, input);
  }

  @Post('orders/:orderId/status')
  setOrderStatus(
    @Req() request: AuthenticatedRequest,
    @Param('eventId') eventId: string,
    @Param('orderId') orderId: string,
    @Body() input: unknown,
  ) {
    return this.exhibitors.setOrderStatus(request.user!.id, eventId, orderId, input);
  }

  @Post('orders')
  saveOrder(@Req() request: AuthenticatedRequest, @Param('eventId') eventId: string, @Body() input: unknown) {
    return this.exhibitors.saveOrder(request.user!.id, eventId, input);
  }
}

