# Service modules

Application services are grouped by business/domain ownership. Existing `AI`, `Billing`, and `Mcp` modules remain first-class service modules.
Shared infrastructure should stay at the `Services` root only when it truly has no single domain owner.

- **Billing** — BillingOverviewService
- **Collaboration** — ConversationAdmins, MentionNotifier, MessageRestrictions
- **Finance** — CashMovementService, FinanceAuditService, FinanceAuthorization, FinanceDocumentService, FinanceInventoryService, FinanceNumberService, InvoiceAutomationService
- **Governance** — ApprovalWorkflowService
- **Inventory** — InventoryStockService, WarehouseCodeGenerator, WarehouseService
- **Notifications** — NotificationCenter, NotificationRuleService
- **Parties** — PartyBalanceSummary
- **Production** — ProductionRecipeService, ProductionRunNumberGenerator, ProductionRunService, ProductionRunStockService
- **Products** — ProductSkuGenerator
- **Reports** — ScheduledReportService
- **Tasks** — TaskAccess
- **Workspace** — OrganizationSequenceService, WorkspaceFeaturePermissions, WorkspacePermissions, WorkspaceRoleCatalog

When moving a service, update its namespace and every consumer/import at the same time.
