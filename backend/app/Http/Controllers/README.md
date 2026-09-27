# Controller modules

Controllers are grouped by business/domain ownership. Keep `Controller.php` at the root as the shared base class.
When adding a controller, place it in the closest domain folder and use the matching PSR-4 namespace.

- **AI** — AiAssistantController, AiCreditSettingsController
- **Account** — ProfileCenterController, ProfileController
- **Analytics** — BusinessControlController, BusinessPulseController, DashboardIntelligenceController
- **Auth** — AuthController
- **Billing** — BillingCheckoutController, BillingGrowthController, BillingOverviewController, BillingPlanController, BillingWebhookController
- **Collaboration** — RecordCollaborationController
- **Documents** — DocumentFulfillmentController
- **Finance** — BankReconciliationController, CashMovementController, FinanceDocumentController, FinanceImportController, FinanceLookupController, InvoiceAutomationController, PaymentPlanController, TaxComplianceController
- **Governance** — ApprovalWorkflowController, AuditCenterController, BulkActionHistoryController, NotificationRuleController, RestoreCenterController, SystemCheckController
- **Inventory** — InventoryIntelligenceController, InventoryOverviewController, InventoryTransferWorkflowController, ProductInventoryController, WarehouseController, WarehouseInventoryController
- **Marketing** — MarketingContactController, MarketingPageController, MarketingSolutionController
- **Mcp** — McpApprovalController, McpManagementController, McpOAuthConnectionController, McpProtocolController, McpTokenController
- **Operations** — CommercialOperationsController, ServiceOperationController
- **Parties** — CustomerIntelligenceController, PartyAccountController, PartyBulkActionController, PartyBulkEditController, PartyController, PartyDataTransferController, PartyInsightsController, PartyPermanentDeletionController, PartyPricingController
- **Platform** — PlatformAdminController, PlatformFeatureAdminController
- **Procurement** — PurchaseRequisitionController
- **Production** — ProductionController, ProductionRecipeController, ProductionRunController
- **Products** — ProductBulkActionController, ProductBulkEditController, ProductController, ProductDataTransferController, ProductInsightsController, ProductPermanentDeletionController
- **Reports** — ReportBuilderController, ReportStudioController, ScheduledReportController
- **Staff** — DepartmentController, StaffController, StaffCorrectionController, StaffImportController, StaffInvitationController, StaffWorkforceController
- **Tasks** — TaskManagementController
- **Workspace** — ActiveOrganizationController, MembershipController, OrganizationController, OwnershipTransferController, WorkspaceConversationController, WorkspaceConversationSettingsController, WorkspaceCustomizationController, WorkspaceMessageMemberController, WorkspaceNotificationController, WorkspaceRoleController, WorkspaceSettingsController

Cross-domain controllers should only stay at the root when no single module owns them.
