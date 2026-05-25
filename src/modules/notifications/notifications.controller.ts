import { Controller, Get, Patch, UseGuards, Req, Param } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';

@ApiTags('notifications')
@Controller('notifications')
export class NotificationsController {
   constructor(private readonly notificationsService: NotificationsService) {}

   // Get all notifications for the logged-in user
   @UseGuards(JwtAuthGuard)
   @ApiBearerAuth('access-token')
   @Get()
   async findAll(@Req() req: Request) {
      const user = req.user as any; // or a custom type if you have one
      return this.notificationsService.findAll(user.id);
   }

   // Mark a single notification as read
   @UseGuards(JwtAuthGuard)
   @ApiBearerAuth('access-token')
   @Patch(':id/read')
   async markAsRead(@Param('id') id: string, @Req() req: Request) {
      const user = req.user as any;
      return this.notificationsService.markAsRead(id);
   }

   // Mark all notifications for the current user as read
   @UseGuards(JwtAuthGuard)
   @ApiBearerAuth('access-token')
   @Patch('read-all')
   async markAllAsRead(@Req() req: Request) {
      const user = req.user as any;
      return this.notificationsService.markAllAsRead(user.id);
   }
}
