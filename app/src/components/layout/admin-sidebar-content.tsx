import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Building2, Bot } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Routes } from '@/routes/routes';

interface AdminSidebarContentProps {
  collapsed: boolean;
  onNavigate?: () => void;
}

const navItems = [
  { label: 'Dashboard', icon: LayoutDashboard, href: Routes.admin.root, end: true },
  { label: 'Agencies', icon: Building2, href: Routes.admin.agencies.list, end: false },
  { label: 'Scrapers', icon: Bot, href: Routes.admin.scrapers.list, end: false },
  // Generation Runs (Feature 04)
  // Crawl Runs (Feature 05)
  // Job Queue (Feature 05)
  // Properties (Feature 06)
  // CMS Targets (Feature 09)
  // Notifications (Feature 08)
  // Users (Feature 10)
];

function NavItem({
  label,
  icon: Icon,
  href,
  end,
  collapsed,
  onNavigate,
}: {
  label: string;
  icon: React.ElementType;
  href: string;
  end: boolean;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  return (
    <li>
      <NavLink
        to={href}
        end={end}
        title={collapsed ? label : undefined}
        onClick={onNavigate}
        className={({ isActive }) =>
          cn(
            'group flex items-center w-full rounded-xl transition-all duration-200 outline-none',
            'focus-visible:ring-1 focus-visible:ring-accent/50',
            collapsed ? 'justify-center py-2.5 px-0' : 'gap-2.5 px-2.5 py-[8px]',
            isActive
              ? 'text-foreground'
              : 'text-muted hover:text-foreground hover:bg-surface-secondary',
          )
        }
        style={({ isActive }) =>
          isActive
            ? {
                background: 'color-mix(in oklch, var(--accent) 12%, transparent)',
                boxShadow: 'inset 0 0 0 1px color-mix(in oklch, var(--accent) 22%, transparent)',
              }
            : {}
        }
      >
        {({ isActive }) => (
          <>
            <Icon
              className="shrink-0 transition-transform duration-200 group-hover:scale-[1.07]"
              style={{ width: 16, height: 16, color: isActive ? 'var(--accent)' : undefined }}
            />
            {!collapsed && (
              <span
                className="text-[13px] font-medium truncate leading-none"
                style={{ letterSpacing: '-0.005em' }}
              >
                {label}
              </span>
            )}
          </>
        )}
      </NavLink>
    </li>
  );
}

export default function AdminSidebarContent({ collapsed, onNavigate }: AdminSidebarContentProps) {
  return (
    <ul className="space-y-0.5">
      {navItems.map(({ label, icon, href, end }) => (
        <NavItem
          key={href}
          label={label}
          icon={icon}
          href={href}
          end={end}
          collapsed={collapsed}
          onNavigate={onNavigate}
        />
      ))}
    </ul>
  );
}
