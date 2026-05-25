import { UsersService } from '../../src/modules/users/users.service';

describe('UsersService', () => {
   let svc: UsersService;
   const mockPrisma = {
      user: {
         findMany: jest.fn().mockResolvedValue([]),
         create: jest.fn().mockImplementation((dto) => Promise.resolve({ id: '1', ...dto })),
         findUnique: jest.fn().mockResolvedValue(null),
      },
   } as any;

   beforeEach(() => {
      svc = new UsersService(mockPrisma);
   });

   it('findAll returns array', async () => {
      await expect(svc.findAll()).resolves.toEqual([]);
      expect(mockPrisma.user.findMany).toHaveBeenCalled();
   });

   it('create calls prisma.create', async () => {
      const dto = { email: 'a@b.com', name: 'A' };
      const created = await svc.create(dto as any);
      expect(created.email).toBe(dto.email);
      expect(mockPrisma.user.create).toHaveBeenCalledWith({ data: dto });
   });
});
