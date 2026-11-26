// The app's name and its menu, in one place.
export const APP_NAME = 'Caemora Inventory Management System';

/** who: all = everyone; money = admin and viewer (not data entry); admin = admins only */
export const NAV: { href: string; label: string; who: 'all' | 'money' | 'admin' }[] = [
  { href: '/', label: 'Dashboard', who: 'all' },
  { href: '/purchases', label: 'Purchases', who: 'all' },
  { href: '/shipments', label: 'Shipments', who: 'all' },
  { href: '/invoices', label: 'Invoices', who: 'all' },
  { href: '/products', label: 'Products', who: 'all' },
  { href: '/flags', label: 'Flags', who: 'all' },
  { href: '/reconciliation', label: 'Reconciliation', who: 'money' },
  { href: '/landed-cost', label: 'Landed cost', who: 'money' },
  { href: '/margins', label: 'Product margins', who: 'all' },
  { href: '/admin', label: 'Admin', who: 'admin' },
];
