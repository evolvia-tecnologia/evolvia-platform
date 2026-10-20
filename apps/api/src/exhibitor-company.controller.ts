import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { assertAccessRate, type AccessShieldRequest } from './access-shield';
import { AuthGuard, type AuthenticatedRequest } from './auth.guard';
import { ExhibitorCompanyService } from './exhibitor-company.service';

type CompanyRequest = AuthenticatedRequest & AccessShieldRequest;

@UseGuards(AuthGuard)
@Controller('public/events/:slug/exhibitor')
export class ExhibitorCompanyController {
  constructor(private readonly companies: ExhibitorCompanyService) {}

  @Get()
  home(@Req() request: CompanyRequest, @Param('slug') slug: string, @Query('companyId') companyId?: string) {
    return this.companies.home(request.user!.id, request.user!.email, slug, empty(companyId));
  }

  @Patch('companies/:companyId/profile')
  updateProfile(
    @Req() request: CompanyRequest,
    @Param('slug') slug: string,
    @Param('companyId') companyId: string,
    @Body() input: unknown,
  ) {
    assertAccessRate(request, 'exhibitor-company-profile', 20);
    return this.companies.updateProfile(request.user!.id, request.user!.email, slug, companyId, input);
  }

  @Post('companies/:companyId/representatives')
  addRepresentative(
    @Req() request: CompanyRequest,
    @Param('slug') slug: string,
    @Param('companyId') companyId: string,
    @Body() input: unknown,
  ) {
    assertAccessRate(request, 'exhibitor-company-representative', 20);
    return this.companies.addRepresentative(request.user!.id, request.user!.email, slug, companyId, input);
  }

  @Delete('companies/:companyId/representatives/:representativeId')
  removeRepresentative(
    @Req() request: CompanyRequest,
    @Param('slug') slug: string,
    @Param('companyId') companyId: string,
    @Param('representativeId') representativeId: string,
  ) {
    assertAccessRate(request, 'exhibitor-company-representative', 20);
    return this.companies.removeRepresentative(request.user!.id, request.user!.email, slug, companyId, representativeId);
  }

  @Post('companies/:companyId/forms/:formId/visit')
  visitForm(
    @Req() request: CompanyRequest,
    @Param('slug') slug: string,
    @Param('companyId') companyId: string,
    @Param('formId') formId: string,
  ) {
    assertAccessRate(request, 'exhibitor-company-form', 30);
    return this.companies.visitForm(request.user!.id, request.user!.email, slug, companyId, formId);
  }

  @Post('companies/:companyId/credentials')
  addCredential(
    @Req() request: CompanyRequest,
    @Param('slug') slug: string,
    @Param('companyId') companyId: string,
    @Body() input: unknown,
  ) {
    assertAccessRate(request, 'exhibitor-company-credential', 20);
    return this.companies.addCredential(request.user!.id, request.user!.email, slug, companyId, input);
  }

  @Post('companies/:companyId/orders')
  requestOrder(
    @Req() request: CompanyRequest,
    @Param('slug') slug: string,
    @Param('companyId') companyId: string,
    @Body() input: unknown,
  ) {
    assertAccessRate(request, 'exhibitor-company-order', 20);
    return this.companies.requestOrder(request.user!.id, request.user!.email, slug, companyId, input);
  }
}

function empty(value?: string): string | undefined {
  return value && value.length > 0 ? value : undefined;
}
