export const EVENT_TYPES = Object.freeze({
  CUSTOMER_CREATED: 'CustomerCreated',
  CUSTOMER_UPDATED: 'CustomerUpdated',

  LEAD_CREATED: 'LeadCreated',
  LEAD_ASSIGNED: 'LeadAssigned',
  LEAD_CONVERTED: 'LeadConverted',
  LEAD_LOST: 'LeadLost',

  ORDER_CREATED: 'OrderCreated',
  ORDER_CONFIRMED: 'OrderConfirmed',
  ORDER_HELD: 'OrderHeld',
  ORDER_PICKED: 'OrderPicked',
  ORDER_PACKED: 'OrderPacked',
  ORDER_SHIPPED: 'OrderShipped',
  COURIER_ASSIGNED: 'CourierAssigned',
  ORDER_DELIVERED: 'OrderDelivered',
  ORDER_RETURNED: 'OrderReturned',
  ORDER_CANCELLED: 'OrderCancelled',

  INVENTORY_ADDED: 'InventoryAdded',
  INVENTORY_REMOVED: 'InventoryRemoved',
  LOW_STOCK_DETECTED: 'LowStockDetected',

  REVENUE_CREATED: 'RevenueCreated',
  EXPENSE_CREATED: 'ExpenseCreated',
  PROFIT_CALCULATED: 'ProfitCalculated',

  SALARY_PAID: 'SalaryPaid',
  BONUS_PAID: 'BonusPaid',

  CAMPAIGN_CREATED: 'CampaignCreated',
  CAMPAIGN_UPDATED: 'CampaignUpdated',
  LEAD_GENERATED: 'LeadGenerated',
  ROAS_UPDATED: 'ROASUpdated',

  OPERATOR_PERFORMANCE_UPDATED: 'OperatorPerformanceUpdated',
  COURIER_PERFORMANCE_UPDATED: 'CourierPerformanceUpdated',
  SELLER_PERFORMANCE_UPDATED: 'SellerPerformanceUpdated',

  BACKUP_CREATED: 'BackupCreated',
  BACKUP_RESTORED: 'BackupRestored',
});

export default EVENT_TYPES;
