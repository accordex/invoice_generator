'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BarChart3,
  CreditCard,
  FileText,
  Home,
  Package,
  Settings,
  Shield,
  Users,
} from 'lucide-react';
import { invoiceManifest } from '@/lib/privilege/manifest';
import { useMenuMode } from '@/lib/privilege/usePrivilege';
import { cn } from '@/lib/utils';

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  home: Home,
  'file-text': FileText,
  users: Users,
  package: Package,
  'credit-card': CreditCard,
  'bar-chart': BarChart3,
  settings: Settings,
  shield: Shield,
};

function NavItem({ code, name, route, icon }: { code: string; name: string; route: string; icon?: string }) {
  const mode = useMenuMode(code);
  const pathname = usePathname();
  const Icon = icon ? ICONS[icon] ?? Home : Home;

  if (mode === 'HIDDEN') return null;

  const active = pathname === route || pathname.startsWith(`${route}/`);

  return (
    <Link
      href={route}
      className={cn(
        'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
        active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
      )}
    >
      <Icon className="h-4 w-4" />
      {name}
    </Link>
  );
}

/**
 * Application sidebar with privilege-gated navigation from the product manifest.
 */
export function AppSidebar() {
  const topLevel = invoiceManifest.menuItems.filter((m) => !m.parentCode);
  const children = invoiceManifest.menuItems.filter((m) => m.parentCode);

  return (
    <aside className="flex w-64 flex-col border-r bg-card">
      <div className="flex h-14 items-center border-b px-4">
        <Link href="/dashboard" className="text-lg font-bold text-primary">
          InvoiceGen
        </Link>
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {topLevel.map((item) => {
          const subs = children.filter((c) => c.parentCode === item.code);
          if (subs.length > 0 && item.code === 'NAV_SETTINGS') {
            return (
              <div key={item.code} className="space-y-1">
                <NavItem code={item.code} name={item.name} route={item.route ?? '#'} icon={item.icon} />
                <div className="ml-4 space-y-1 border-l pl-2">
                  {subs.map((sub) => (
                    <NavItem key={sub.code} code={sub.code} name={sub.name} route={sub.route ?? '#'} icon={sub.icon} />
                  ))}
                </div>
              </div>
            );
          }
          return (
            <NavItem key={item.code} code={item.code} name={item.name} route={item.route ?? '#'} icon={item.icon} />
          );
        })}
      </nav>
    </aside>
  );
}
