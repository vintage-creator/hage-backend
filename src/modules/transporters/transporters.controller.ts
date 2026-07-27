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

   // ✅ ADD TRANSPORTER (send invite) — "Add Transporter" screen
   @Post()
   @ApiOperation({
      summary: 'Add / invite a transporter',
      description: 'Saves a transporter to the enterprise address book and sends an invite email. If a matching transporter account already exists, it is linked immediately.',
   })
   @ApiResponse({ status: 201, description: 'Transporter saved and invite sent' })
   addTransporter(@Req() req: Request, @Body() dto: AddTransporterDto) {
      return this.svc.addTransporter(this.userId(req), dto);
   }

   // ✅ SAVED TRANSPORTERS LIST — "Saved Transporter" screen
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
