import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TransportersService } from './transporters.service';
import { AddTransporterDto } from './dto/add-transporter.dto';
import { UpdateTransporterDto } from './dto/update-transporter.dto';

@ApiTags('transporters')
@Controller('transporters')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('access-token')
export class TransportersController {
   constructor(private readonly svc: TransportersService) {}

   private userId(req: Request) {
      const user = req.user as any;
      return user?.sub ?? user?.id;
   }

   // ✅ ADD NEW TRANSPORTER — "Add New" tab. The transporter is NOT on the
   // platform yet, so we save the entry and email them an invite to sign up.
   // (If it turns out the email actually already belongs to an eligible
   // transporter account, we link it immediately instead of sending a signup
   // invite, so nobody gets a confusing "come join" email for an account they
   // already have.)
   @Post('new')
   @ApiOperation({
      summary: 'Add a new (unregistered) transporter',
      description:
         "Saves a transporter to the enterprise address book and emails them an invite to create a Hage transporter account. If the email already belongs to a registered, eligible transporter, it is linked immediately and a lightweight notification is sent instead of a signup invite.",
   })
   @ApiResponse({ status: 201, description: 'Transporter saved and invite email sent' })
   addNewTransporter(@Req() req: Request, @Body() dto: AddTransporterDto) {
      return this.svc.addNewTransporter(this.userId(req), dto);
   }

   // ✅ ADD EXISTING TRANSPORTER — "Add Existing" tab. The transporter IS
   // already a registered user on the platform, identified by the same
   // name/phone/email fields. We look them up and link immediately — no
   // signup invite is sent, only a short "you've been added" email.
   @Post('existing')
   @ApiOperation({
      summary: 'Add an existing (already registered) transporter',
      description:
         'Looks up a registered, eligible transporter account by the email provided and links it to the enterprise address book right away. Fails with a 400 if no matching registered transporter account is found — use "Add New" to invite that person instead.',
   })
   @ApiResponse({ status: 201, description: 'Existing transporter linked and notified' })
   @ApiResponse({ status: 400, description: 'No matching registered transporter account found for this email' })
   addExistingTransporter(@Req() req: Request, @Body() dto: AddTransporterDto) {
      return this.svc.addExistingTransporter(this.userId(req), dto);
   }

   // ✅ SAVED TRANSPORTERS LIST — "Saved Transporter" screen
   // NOTE: this must stay below the literal 'new'/'existing' routes above,
   // otherwise Nest would try to match them against the ':id' route below.
   @Get()
   @ApiOperation({ summary: 'List saved transporters', description: 'Returns every transporter this account has added, most recent first.' })
   listSavedTransporters(@Req() req: Request) {
      return this.svc.listSavedTransporters(this.userId(req));
   }

   @Get(':id')
   @ApiParam({ name: 'id', description: 'Saved transporter ID' })
   @ApiOperation({ summary: 'Get a saved transporter' })
   getSavedTransporter(@Param('id') id: string, @Req() req: Request) {
      return this.svc.getSavedTransporter(this.userId(req), id);
   }

   // ✅ EDIT — the sliders/edit icon on the Saved Transporter card
   @Patch(':id')
   @ApiParam({ name: 'id', description: 'Saved transporter ID' })
   @ApiOperation({ summary: 'Edit a saved transporter' })
   updateTransporter(@Param('id') id: string, @Body() dto: UpdateTransporterDto, @Req() req: Request) {
      return this.svc.updateTransporter(this.userId(req), id, dto);
   }

   @Delete(':id')
   @ApiParam({ name: 'id', description: 'Saved transporter ID' })
   @ApiOperation({ summary: 'Remove a saved transporter' })
   removeTransporter(@Param('id') id: string, @Req() req: Request) {
      return this.svc.removeTransporter(this.userId(req), id);
   }
}
