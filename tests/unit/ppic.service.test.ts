import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the prisma client
vi.mock('@server/config/database', () => ({
  prisma: {
    lot: {
      findMany: vi.fn(),
    },
    productionSchedule: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
    },
    productionScheduleLot: {
      create: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
    auditTrail: {
      create: vi.fn(),
    },
    workOrder: {
      create: vi.fn(),
    },
  },
}));

import { prisma } from '@server/config/database';
import {
  getAvailableStock,
  getSchedules,
  createSchedule,
  createWorkOrder,
  PPICValidationError,
  PPICNotFoundError,
  PPICStockConflictError,
} from '@server/modules/ppic/ppic.service';

const mockedPrisma = vi.mocked(prisma, true);

describe('PPICService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getAvailableStock', () => {
    it('should return lots with status passed or ready_to_store', async () => {
      const mockLots = [
        {
          id: 'lot-1',
          lot_number: 'RC-20250115-0001',
          status: 'ready_to_store',
          material_group_code: 'RC',
          updated_at: new Date('2025-01-15'),
          supplier_intake: {
            material_group: 'Raw Chemical',
            material_group_code: 'RC',
            quantity: 500,
            unit: 'kg',
          },
          rack_slots: [
            {
              coordinate: 'A-01-02-03',
              zone: { name: 'Zone A', zone_type: 'standard' },
            },
          ],
          drums: [
            {
              id: 'drum-1',
              drum_number: 1,
              weight_kg: 200,
              rack_slot: { coordinate: 'A-01-02-03' },
            },
          ],
        },
        {
          id: 'lot-2',
          lot_number: 'SV-20250116-0001',
          status: 'passed',
          material_group_code: 'SV',
          updated_at: new Date('2025-01-16'),
          supplier_intake: {
            material_group: 'Solvent',
            material_group_code: 'SV',
            quantity: 200,
            unit: 'L',
          },
          rack_slots: [],
          drums: [],
        },
      ];

      mockedPrisma.lot.findMany.mockResolvedValue(mockLots as any);

      const result = await getAvailableStock();

      expect(result.data).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.data[0].lot_number).toBe('RC-20250115-0001');
      expect(result.data[0].status).toBe('ready_to_store');
      expect(result.data[1].lot_number).toBe('SV-20250116-0001');
      expect(result.data[1].status).toBe('passed');

      expect(mockedPrisma.lot.findMany).toHaveBeenCalledWith({
        where: {
          status: {
            in: ['passed', 'ready_to_store'],
          },
        },
        include: {
          supplier_intake: {
            select: {
              material_group: true,
              material_group_code: true,
              quantity: true,
              unit: true,
            },
          },
          rack_slots: {
            select: {
              coordinate: true,
              zone: {
                select: {
                  name: true,
                  zone_type: true,
                },
              },
            },
          },
          drums: {
            select: {
              id: true,
              drum_number: true,
              weight_kg: true,
              rack_slot: {
                select: {
                  coordinate: true,
                },
              },
            },
          },
        },
        orderBy: {
          updated_at: 'desc',
        },
      });
    });

    it('should return empty data when no lots have passed or ready_to_store status', async () => {
      mockedPrisma.lot.findMany.mockResolvedValue([]);

      const result = await getAvailableStock();

      expect(result.data).toEqual([]);
      expect(result.total).toBe(0);
    });

    it('should include supplier intake, rack slots, and drums in the response', async () => {
      const mockLots = [
        {
          id: 'lot-1',
          lot_number: 'RC-20250115-0001',
          status: 'ready_to_store',
          material_group_code: 'RC',
          updated_at: new Date(),
          supplier_intake: {
            material_group: 'Raw Chemical',
            material_group_code: 'RC',
            quantity: 500,
            unit: 'kg',
          },
          rack_slots: [
            {
              coordinate: 'B-02-01-05',
              zone: { name: 'Cold Zone B', zone_type: 'cold_chain' },
            },
          ],
          drums: [
            {
              id: 'drum-1',
              drum_number: 1,
              weight_kg: 250,
              rack_slot: { coordinate: 'B-02-01-05' },
            },
            {
              id: 'drum-2',
              drum_number: 2,
              weight_kg: 250,
              rack_slot: null,
            },
          ],
        },
      ];

      mockedPrisma.lot.findMany.mockResolvedValue(mockLots as any);

      const result = await getAvailableStock();

      expect(result.data[0].supplier_intake).toBeDefined();
      expect(result.data[0].supplier_intake!.material_group).toBe('Raw Chemical');
      expect(result.data[0].rack_slots).toHaveLength(1);
      expect(result.data[0].drums).toHaveLength(2);
    });
  });

  describe('getSchedules', () => {
    it('should return paginated production schedules', async () => {
      const mockSchedules = [
        {
          id: 'schedule-1',
          title: 'Production Batch A',
          scheduled_date: new Date('2025-02-01'),
          status: 'draft',
          created_by: 'user-1',
          created_at: new Date('2025-01-20'),
          creator: { id: 'user-1', full_name: 'John Doe', email: 'john@example.com' },
          lots: [],
          work_orders: [],
        },
      ];

      mockedPrisma.productionSchedule.findMany.mockResolvedValue(mockSchedules as any);
      mockedPrisma.productionSchedule.count.mockResolvedValue(1);

      const result = await getSchedules(1, 20);

      expect(result.data).toEqual(mockSchedules);
      expect(result.pagination).toEqual({
        page: 1,
        limit: 20,
        total: 1,
        totalPages: 1,
      });
    });

    it('should use default pagination values when not provided', async () => {
      mockedPrisma.productionSchedule.findMany.mockResolvedValue([]);
      mockedPrisma.productionSchedule.count.mockResolvedValue(0);

      const result = await getSchedules();

      expect(result.pagination).toEqual({
        page: 1,
        limit: 20,
        total: 0,
        totalPages: 0,
      });

      expect(mockedPrisma.productionSchedule.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 0,
          take: 20,
        })
      );
    });

    it('should calculate correct offset for page 2', async () => {
      mockedPrisma.productionSchedule.findMany.mockResolvedValue([]);
      mockedPrisma.productionSchedule.count.mockResolvedValue(25);

      const result = await getSchedules(2, 10);

      expect(result.pagination).toEqual({
        page: 2,
        limit: 10,
        total: 25,
        totalPages: 3,
      });

      expect(mockedPrisma.productionSchedule.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 10,
          take: 10,
        })
      );
    });

    it('should cap limit at 50', async () => {
      mockedPrisma.productionSchedule.findMany.mockResolvedValue([]);
      mockedPrisma.productionSchedule.count.mockResolvedValue(100);

      const result = await getSchedules(1, 100);

      expect(result.pagination.limit).toBe(50);
      expect(mockedPrisma.productionSchedule.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 50,
        })
      );
    });
  });

  describe('createSchedule', () => {
    const userId = 'user-ppic-1';

    it('should create a schedule when all lots are ready_to_store with sufficient quantity', async () => {
      const validInput = {
        title: 'Production Batch A',
        scheduled_date: '2025-02-01',
        lots: [
          { lot_id: 'lot-1', quantity_required: 100 },
          { lot_id: 'lot-2', quantity_required: 50 },
        ],
      };

      const mockLots = [
        {
          id: 'lot-1',
          lot_number: 'RC-20250115-0001',
          status: 'ready_to_store',
          supplier_intake: { quantity: 500 },
          production_schedule_lots: [],
        },
        {
          id: 'lot-2',
          lot_number: 'SV-20250116-0001',
          status: 'ready_to_store',
          supplier_intake: { quantity: 200 },
          production_schedule_lots: [],
        },
      ];

      const mockSchedule = {
        id: 'schedule-new',
        title: 'Production Batch A',
        scheduled_date: new Date('2025-02-01'),
        status: 'draft',
        created_by: userId,
        created_at: new Date(),
        lots: [],
        creator: { id: userId, full_name: 'PPIC User', email: 'ppic@example.com' },
      };

      mockedPrisma.lot.findMany.mockResolvedValue(mockLots as any);
      mockedPrisma.productionSchedule.create.mockResolvedValue(mockSchedule as any);

      const result = await createSchedule(validInput, userId);

      expect(result).toEqual(mockSchedule);
      expect(mockedPrisma.productionSchedule.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            title: 'Production Batch A',
            status: 'draft',
            created_by: userId,
          }),
        })
      );
    });

    it('should throw PPICValidationError when title is empty', async () => {
      const input = {
        title: '',
        scheduled_date: '2025-02-01',
        lots: [{ lot_id: 'lot-1', quantity_required: 100 }],
      };

      await expect(createSchedule(input, userId)).rejects.toThrow(PPICValidationError);
      await expect(createSchedule(input, userId)).rejects.toMatchObject({
        fieldErrors: expect.objectContaining({ title: 'Title is required' }),
      });
    });

    it('should throw PPICValidationError when scheduled_date is missing', async () => {
      const input = {
        title: 'Batch A',
        scheduled_date: '',
        lots: [{ lot_id: 'lot-1', quantity_required: 100 }],
      };

      await expect(createSchedule(input, userId)).rejects.toThrow(PPICValidationError);
    });

    it('should throw PPICValidationError when lots array is empty', async () => {
      const input = {
        title: 'Batch A',
        scheduled_date: '2025-02-01',
        lots: [] as any[],
      };

      await expect(createSchedule(input, userId)).rejects.toThrow(PPICValidationError);
      await expect(createSchedule(input, userId)).rejects.toMatchObject({
        fieldErrors: expect.objectContaining({
          lots: 'At least one lot with quantity is required',
        }),
      });
    });

    it('should throw PPICValidationError when lot entries have missing fields', async () => {
      const input = {
        title: 'Batch A',
        scheduled_date: '2025-02-01',
        lots: [{ lot_id: '', quantity_required: 0 }],
      };

      await expect(createSchedule(input, userId)).rejects.toThrow(PPICValidationError);
    });

    it('should throw PPICNotFoundError when referenced lots do not exist', async () => {
      const input = {
        title: 'Batch A',
        scheduled_date: '2025-02-01',
        lots: [{ lot_id: 'lot-missing', quantity_required: 100 }],
      };

      mockedPrisma.lot.findMany.mockResolvedValue([]);

      await expect(createSchedule(input, userId)).rejects.toThrow(PPICNotFoundError);
      await expect(createSchedule(input, userId)).rejects.toThrow('Lots not found');
    });

    it('should throw PPICValidationError when lots do not have ready_to_store status (Req 8.4, 8.6)', async () => {
      const input = {
        title: 'Batch A',
        scheduled_date: '2025-02-01',
        lots: [{ lot_id: 'lot-1', quantity_required: 100 }],
      };

      const mockLots = [
        {
          id: 'lot-1',
          lot_number: 'RC-20250115-0001',
          status: 'passed', // Not ready_to_store
          supplier_intake: { quantity: 500 },
          production_schedule_lots: [],
        },
      ];

      mockedPrisma.lot.findMany.mockResolvedValue(mockLots as any);

      await expect(createSchedule(input, userId)).rejects.toThrow(PPICValidationError);
      await expect(createSchedule(input, userId)).rejects.toMatchObject({
        fieldErrors: expect.objectContaining({
          lots: expect.stringContaining('ready_to_store'),
        }),
      });
    });

    it('should throw PPICStockConflictError when unreserved quantity is insufficient (Req 8.8)', async () => {
      const input = {
        title: 'Batch A',
        scheduled_date: '2025-02-01',
        lots: [{ lot_id: 'lot-1', quantity_required: 100 }],
      };

      const mockLots = [
        {
          id: 'lot-1',
          lot_number: 'RC-20250115-0001',
          status: 'ready_to_store',
          supplier_intake: { quantity: 500 },
          production_schedule_lots: [{ quantity_required: 450 }], // Already reserved 450 of 500
        },
      ];

      mockedPrisma.lot.findMany.mockResolvedValue(mockLots as any);

      await expect(createSchedule(input, userId)).rejects.toThrow(PPICStockConflictError);
      await expect(createSchedule(input, userId)).rejects.toMatchObject({
        conflicts: expect.arrayContaining([
          expect.objectContaining({
            lotId: 'lot-1',
            lotNumber: 'RC-20250115-0001',
            available: 50,
            requested: 100,
          }),
        ]),
      });
    });
  });

  describe('createWorkOrder', () => {
    const userId = 'user-ppic-1';

    it('should create a work order when schedule and assignee exist', async () => {
      const validInput = {
        schedule_id: 'schedule-1',
        assigned_to: 'user-operator-1',
        instructions: 'Mix raw chemicals per formula XYZ',
      };

      const mockSchedule = {
        id: 'schedule-1',
        title: 'Production Batch A',
        status: 'draft',
        lots: [],
      };

      const mockUser = {
        id: 'user-operator-1',
        full_name: 'Operator One',
      };

      const mockWorkOrder = {
        id: 'wo-new',
        schedule_id: validInput.schedule_id,
        assigned_to: validInput.assigned_to,
        instructions: validInput.instructions,
        status: 'pending',
        created_at: new Date(),
        schedule: mockSchedule,
        assignee: { id: mockUser.id, full_name: mockUser.full_name, email: 'op@example.com' },
      };

      mockedPrisma.productionSchedule.findUnique.mockResolvedValue(mockSchedule as any);
      mockedPrisma.user.findUnique.mockResolvedValue(mockUser as any);
      mockedPrisma.workOrder.create.mockResolvedValue(mockWorkOrder as any);

      const result = await createWorkOrder(validInput, userId);

      expect(result).toEqual(mockWorkOrder);
      expect(mockedPrisma.workOrder.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            schedule_id: validInput.schedule_id,
            assigned_to: validInput.assigned_to,
            instructions: validInput.instructions,
            status: 'pending',
          }),
        })
      );
    });

    it('should throw PPICValidationError when schedule_id is missing', async () => {
      const input = {
        schedule_id: '',
        assigned_to: 'user-1',
        instructions: 'Do something',
      };

      await expect(createWorkOrder(input, userId)).rejects.toThrow(PPICValidationError);
      await expect(createWorkOrder(input, userId)).rejects.toMatchObject({
        fieldErrors: expect.objectContaining({
          schedule_id: 'Schedule ID is required',
        }),
      });
    });

    it('should throw PPICValidationError when assigned_to is missing', async () => {
      const input = {
        schedule_id: 'schedule-1',
        assigned_to: '',
        instructions: 'Do something',
      };

      await expect(createWorkOrder(input, userId)).rejects.toThrow(PPICValidationError);
      await expect(createWorkOrder(input, userId)).rejects.toMatchObject({
        fieldErrors: expect.objectContaining({
          assigned_to: 'Assigned user ID is required',
        }),
      });
    });

    it('should throw PPICValidationError when instructions are empty', async () => {
      const input = {
        schedule_id: 'schedule-1',
        assigned_to: 'user-1',
        instructions: '',
      };

      await expect(createWorkOrder(input, userId)).rejects.toThrow(PPICValidationError);
      await expect(createWorkOrder(input, userId)).rejects.toMatchObject({
        fieldErrors: expect.objectContaining({
          instructions: 'Instructions are required',
        }),
      });
    });

    it('should throw PPICNotFoundError when schedule not found', async () => {
      const input = {
        schedule_id: 'schedule-missing',
        assigned_to: 'user-1',
        instructions: 'Do something',
      };

      mockedPrisma.productionSchedule.findUnique.mockResolvedValue(null);

      await expect(createWorkOrder(input, userId)).rejects.toThrow(PPICNotFoundError);
      await expect(createWorkOrder(input, userId)).rejects.toThrow(
        'Production schedule not found'
      );
    });

    it('should throw PPICNotFoundError when assigned user not found', async () => {
      const input = {
        schedule_id: 'schedule-1',
        assigned_to: 'user-missing',
        instructions: 'Do something',
      };

      const mockSchedule = { id: 'schedule-1', title: 'Batch A', status: 'draft', lots: [] };

      mockedPrisma.productionSchedule.findUnique.mockResolvedValue(mockSchedule as any);
      mockedPrisma.user.findUnique.mockResolvedValue(null);

      await expect(createWorkOrder(input, userId)).rejects.toThrow(PPICNotFoundError);
      await expect(createWorkOrder(input, userId)).rejects.toThrow('Assigned user not found');
    });

    it('should create work order with pending status', async () => {
      const input = {
        schedule_id: 'schedule-1',
        assigned_to: 'user-operator-1',
        instructions: 'Mix chemicals',
      };

      const mockSchedule = { id: 'schedule-1', title: 'Batch A', status: 'draft', lots: [] };
      const mockUser = { id: 'user-operator-1', full_name: 'Op One' };
      const mockWorkOrder = {
        id: 'wo-new',
        schedule_id: input.schedule_id,
        assigned_to: input.assigned_to,
        instructions: input.instructions,
        status: 'pending',
        created_at: new Date(),
        schedule: mockSchedule,
        assignee: { id: mockUser.id, full_name: mockUser.full_name, email: 'op@example.com' },
      };

      mockedPrisma.productionSchedule.findUnique.mockResolvedValue(mockSchedule as any);
      mockedPrisma.user.findUnique.mockResolvedValue(mockUser as any);
      mockedPrisma.workOrder.create.mockResolvedValue(mockWorkOrder as any);

      const result = await createWorkOrder(input, userId);

      expect(result.status).toBe('pending');
    });
  });
});
