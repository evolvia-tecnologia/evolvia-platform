import { Body, Controller, Param, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, AuthenticatedRequest } from './auth.guard.ts';
import { CredentialPrintConfirmationService, PedidoDeConfirmacao } from './credential-print-confirmation.service.ts';

/**
 * Fora de `events/:eventId/desk` de propósito.
 *
 * O `OperatorCapabilityGuard` protege o balcão e nega rota não mapeada; pendurar
 * aqui uma rota do balcão sem mapeá-la enfraqueceria esse invariante. Esta rota
 * tem autorização própria e mais forte: decidida DENTRO da transação que grava,
 * para que a concorrência não escape entre a conferência e a escrita.
 */
@UseGuards(AuthGuard)
@Controller('events/:eventId/credential-prints')
export class CredentialPrintConfirmationController {
  constructor(private readonly confirmacoes: CredentialPrintConfirmationService) {}

  @Post('confirm')
  confirm(
    @Req() request: AuthenticatedRequest,
    @Param('eventId') eventId: string,
    @Body() input: PedidoDeConfirmacao,
  ) {
    return this.confirmacoes.confirmar(request.user!.id, eventId, input);
  }
}
