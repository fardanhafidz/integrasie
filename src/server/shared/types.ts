// Shared TypeScript types for the IntegraSiE Smart Dashboard

export enum UserRole {
  WAREHOUSE_OPERATOR = 'warehouse_operator',
  QC_STAFF = 'qc_staff',
  PPIC_TEAM = 'ppic_team',
  FACTORY_MANAGER = 'factory_manager',
}

export enum LotStatus {
  PENDING_QC = 'pending_qc',
  PASSED = 'passed',
  REJECTED = 'rejected',
  READY_TO_STORE = 'ready_to_store',
}

export enum SlotStatus {
  AVAILABLE = 'available',
  OCCUPIED = 'occupied',
  RESERVED = 'reserved',
  MAINTENANCE = 'maintenance',
}

export enum ZoneType {
  STANDARD = 'standard',
  COLD_CHAIN = 'cold_chain',
  HAZARDOUS = 'hazardous',
}

export enum QCDecision {
  PASSED = 'passed',
  REJECTED = 'rejected',
}

export enum ScheduleStatus {
  DRAFT = 'draft',
  CONFIRMED = 'confirmed',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
}

export enum WorkOrderStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
}

export interface JwtPayload {
  userId: string;
  email: string;
  role: UserRole;
  iat?: number;
  exp?: number;
}
