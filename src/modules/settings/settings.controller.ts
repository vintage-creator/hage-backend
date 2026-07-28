import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { SettingsService } from './settings.service';
import { CreateSlaDto } from './dto/create-sla.dto';
import {
   InviteTeamMemberDto,
   LanguageSettingDto,
   NotificationSettingsDto,
   PaymentMethodDto,
   ReportIssueDto,
   TeamInviteStatusQueryDto,
   UpdateTeamMemberRoleDto,
   UpdateEndUserProfileDto,
   UpdateEnterpriseProfileDto,
   UpdateTeamInviteDto,
} from './dto/settings.dto';

@ApiTags('settings')
@Controller('settings')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('access-token')
export class SettingsController {
   constructor(private readonly settings: SettingsService) {}

   private userId(req: Request) {
      return (req as any).user.sub;
   }

   @Post('enterprise/sla')
   @ApiOperation({ summary: 'Create enterprise SLA setting' })
   @ApiResponse({ status: 201, description: 'SLA setting created' })
   createSla(@Req() req: Request, @Body() dto: CreateSlaDto) {
      return this.settings.createEnterpriseSla(this.userId(req), dto);
   }

   @Get('enterprise/sla')
   @ApiOperation({ summary: 'List enterprise SLA settings' })
   listSlas(@Req() req: Request) {
      return this.settings.listEnterpriseSlas(this.userId(req));
   }

   @Post('issues')
   @ApiOperation({ summary: 'Report an issue' })
   reportIssue(@Req() req: Request, @Body() dto: ReportIssueDto) {
      return this.settings.reportIssue(this.userId(req), dto);
   }

   @Get('billing/payment-methods')
   @ApiOperation({ summary: 'List payment methods' })
   listPaymentMethods(@Req() req: Request) {
      return this.settings.listPaymentMethods(this.userId(req));
   }

   @Post('billing/payment-methods')
   @ApiOperation({
      summary: 'Add payment method',
      description: 'Card CVV and full card/account numbers are not stored. Only safe metadata such as last4 is persisted.',
   })
   addPaymentMethod(@Req() req: Request, @Body() dto: PaymentMethodDto) {
      return this.settings.addPaymentMethod(this.userId(req), dto);
   }

   @Patch('billing/payment-methods/:id')
   @ApiOperation({
      summary: 'Update payment method',
      description: 'Card CVV and full card/account numbers are not stored. Only safe metadata such as last4 is persisted.',
   })
   updatePaymentMethod(@Req() req: Request, @Param('id') id: string, @Body() dto: PaymentMethodDto) {
      return this.settings.updatePaymentMethod(this.userId(req), id, dto);
   }

   @Delete('billing/payment-methods/:id')
   @ApiOperation({ summary: 'Remove payment method' })
   removePaymentMethod(@Req() req: Request, @Param('id') id: string) {
      return this.settings.removePaymentMethod(this.userId(req), id);
   }

   @Patch('language')
   @ApiOperation({ summary: 'Update selected language' })
   updateLanguage(@Req() req: Request, @Body() dto: LanguageSettingDto) {
      return this.settings.updateLanguage(this.userId(req), dto);
   }

   @Get('notifications')
   @ApiOperation({ summary: 'Get notification settings' })
   getNotifications(@Req() req: Request) {
      return this.settings.getNotifications(this.userId(req));
   }

   @Patch('notifications')
   @ApiOperation({ summary: 'Update notification settings' })
   updateNotifications(@Req() req: Request, @Body() dto: NotificationSettingsDto) {
      return this.settings.updateNotifications(this.userId(req), dto);
   }

   @Post('team/invite')
   @ApiOperation({ summary: 'Invite team member by email' })
   inviteTeamMember(@Req() req: Request, @Body() dto: InviteTeamMemberDto) {
      return this.settings.inviteTeamMember(this.userId(req), dto);
   }

   @Get('team/invites')
   @ApiOperation({
      summary: 'List team invites',
      description: 'Enterprise users can fetch all invited team members, optionally filtered by PENDING, ACCEPTED, DECLINED, or CANCELLED.',
   })
   listTeamInvites(@Req() req: Request, @Query() query: TeamInviteStatusQueryDto) {
      return this.settings.listTeamInvites(this.userId(req), query.status);
   }

   @Patch('team/invites/:id')
   @ApiOperation({ summary: 'Update team invite status' })
   updateTeamInvite(@Req() req: Request, @Param('id') id: string, @Body() dto: UpdateTeamInviteDto) {
      return this.settings.updateTeamInvite(this.userId(req), id, dto);
   }

   @Get('team/members')
   @ApiOperation({ summary: 'List team members' })
   listTeamMembers(@Req() req: Request) {
      return this.settings.listTeamMembers(this.userId(req));
   }

   @Patch('team/members/:id/role')
   @ApiOperation({ summary: 'Update team member role' })
   updateTeamMemberRole(@Req() req: Request, @Param('id') id: string, @Body() dto: UpdateTeamMemberRoleDto) {
      return this.settings.updateTeamMemberRole(this.userId(req), id, dto);
   }

   @Delete('team/members/:id')
   @ApiOperation({ summary: 'Remove team member' })
   removeTeamMember(@Req() req: Request, @Param('id') id: string) {
      return this.settings.removeTeamMember(this.userId(req), id);
   }

   @Patch('enterprise/profile')
   @ApiOperation({ summary: 'Update enterprise profile' })
   updateEnterpriseProfile(@Req() req: Request, @Body() dto: UpdateEnterpriseProfileDto) {
      return this.settings.updateEnterpriseProfile(this.userId(req), dto);
   }

   @Patch('end-user/profile')
   @ApiOperation({ summary: 'Update individual/end-user profile' })
   updateEndUserProfile(@Req() req: Request, @Body() dto: UpdateEndUserProfileDto) {
      return this.settings.updateEndUserProfile(this.userId(req), dto);
   }

   @Post('logout')
   @ApiOperation({ summary: 'Logout from settings' })
   logout(@Req() req: Request) {
      return this.settings.logout(this.userId(req));
   }

   @Delete('account')
   @ApiOperation({ summary: 'Deactivate account' })
   deactivateAccount(@Req() req: Request) {
      return this.settings.deactivateAccount(this.userId(req));
   }
}
