# UI/UX Specification

The application should feel like a polished commercial SaaS product, not a generic admin dashboard.

## Design goals

- Fast
- Modern
- Premium
- Minimal
- Professional
- Easy to learn
- Information-dense without clutter
- Accessible
- Responsive

Take inspiration from the clarity and interaction quality of modern products such as Linear, Stripe, Vercel and Notion without copying them.

## Application shell

Desktop:

Sidebar + top bar + main content.

Tablet:

Collapsible sidebar.

Mobile:

Compact navigation suitable for touch.

## Main navigation

- Dashboard
- Assets
  - All Assets
  - Assignments
  - Maintenance
  - Warranties
- Inventory
  - Products
  - Stock
  - Warehouses
  - Transfers
  - Stock Movements
- Purchasing
  - Suppliers
  - Purchase Orders
  - Goods Received
- People
  - Employees
  - Teams
- Reports
- Notifications
- Audit Logs
- Settings

## Top bar

- Global search
- Notifications
- Help
- Organisation switcher
- User menu

Keyboard shortcuts:

- `/` = global search
- `Ctrl/Cmd + K` = command palette

## Dashboard

Useful KPIs:

- total assets
- inventory value
- low stock
- pending orders

Useful sections:

- inventory overview
- asset overview
- recent activity
- low-stock products
- upcoming maintenance
- warranty expiry

Avoid meaningless charts.

## Tables

Reusable data table with:

- search
- filters
- sorting
- pagination
- column visibility
- bulk actions
- export

Large datasets should not render unnecessarily.

## Detail pages

Asset/product detail pages should use:

- clear header
- status
- key metadata
- tabs/sections
- activity timeline
- documents
- history
- contextual actions

## Forms

Use:

- clear labels
- inline validation
- sensible defaults
- grouped fields
- multi-step flows for complex operations

Use drawers for quick actions and full pages for complex workflows.

## Empty states

Every empty state explains:

1. What is empty.
2. Why it matters.
3. What the user can do next.

## Loading states

Prefer skeletons for page/data loading.

Prevent layout shifts.

## Error states

Explain the problem and give the user a recovery action where possible.

## Visual language

Use restrained colours.

Status colours should communicate state, not decoration.

Support light and dark themes.

Avoid:

- excessive gradients
- excessive rounded cards
- giant typography
- random colours
- decorative animation
- generic Bootstrap-style dashboards

## Motion

Use subtle, purposeful motion for:

- drawers
- modals
- navigation
- toasts
- status changes
- page transitions

Respect reduced-motion preferences.

## Accessibility

Support:

- keyboard navigation
- visible focus
- semantic HTML
- labels
- screen readers
- sufficient contrast
- reduced motion

Never communicate important information through colour alone.

## Mobile

Mobile users must be able to:

- search assets
- scan QR codes
- view asset details
- assign assets
- check stock
- adjust stock
- receive goods
- view notifications
