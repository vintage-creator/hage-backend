import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
   constructor(private reflector: Reflector) {}

   canActivate(context: ExecutionContext): boolean {
      const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [context.getHandler(), context.getClass()]);

      if (!requiredRoles || requiredRoles.length === 0) {
         return true; // No roles required — allow access
      }

      const { user } = context.switchToHttp().getRequest();

      if (!user) {
         throw new ForbiddenException('User not authenticated');
      }

      // Check if user.kind (UserKind) matches any required role
      const hasUserKind = user.kind && requiredRoles.includes(user.kind);

      // Check if user.role (RoleType) matches any required role
      const hasRoleType = user.role && requiredRoles.includes(user.role);

      // User passes if they have EITHER matching kind OR matching role
      const hasAccess = hasUserKind || hasRoleType;

      if (!hasAccess) {
         throw new ForbiddenException(`Access denied. Required roles: ${requiredRoles.join(', ')}. ` + `Your kind: ${user.kind || 'none'}, Your role: ${user.role || 'none'}`);
      }

      return true;
   }
}
