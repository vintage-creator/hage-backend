import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class NotificationsService {
   constructor(private readonly prisma: PrismaService) {}

   // Get all notifications for a user by userId
   async findAll(userId: string) {
      return this.prisma.notification.findMany({
         where: { userId },
         orderBy: { createdAt: 'desc' },
      });
   }

   async markAsRead(id: string) {
      return this.prisma.notification.update({
         where: { id },
         data: { read: true },
      });
   }

   // Mark all notifications of a user as read
   async markAllAsRead(userId: string) {
      return this.prisma.notification.updateMany({
         where: { userId, read: false },
         data: { read: true },
      });
   }
}
