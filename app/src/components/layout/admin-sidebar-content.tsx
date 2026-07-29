import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Building2, Bot, Sparkles, Activity, ListTodo, Home, Bell, Plug, Users, ArrowLeft, FileSearch, Settings, RefreshCw, DollarSign } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Routes } from '@/routes/routes';
import { useUnreadNotificationsCount } from '@/features/notifications/hooks/use-notifications';

interface AdminSidebarContentProps {
  collapsed: boolean;
  onNavigate?: () => void;
}

const navItems = [
  { label: 'Dashboard', icon: LayoutDashboard, href: Routes.admin.root, end: true },
  { label: 'Users', icon: Users, href: Routes.admin.users.list, end: false },
  { label: 'Integration Targets', icon: Plug, href: Routes.admin.integrationTargets.list, end: false },
  { label: 'Agencies', icon: Building2, href: Routes.admin.agencies.list, end: false },
  { label: 'Generation Runs', icon: Sparkles, href: Routes.admin.generationRuns.list, end: false },
  { label: 'Scrapers', icon: Bot, href: Routes.admin.scrapers.list, end: false },
  { label: 'Crawl Runs', icon: Activity, href: Routes.admin.crawlRuns.list, end: false },
  { label: 'Cost Logs', icon: DollarSign, href: Routes.admin.costLogs.list, end: false },
  { label: 'Job Queue', icon: ListTodo, href: Routes.admin.jobs.list, end: false },
  { label: 'Diagnostics', icon: FileSearch, href: Routes.admin.diagnostics.list, end: false },
  { label: 'Properties', icon: Home, href: Routes.admin.properties.list, end: false },
  { label: 'Sync Runs', icon: RefreshCw, href: Routes.admin.syncRuns.list, end: false },
  { label: 'Notifications', icon: Bell, href: Routes.admin.notifications, end: false, showUnreadBadge: true },
  { label: 'App Config', icon: Settings, href: Routes.admin.crawlerConfig, end: false },
];

function NavItem({
  label,
  icon: Icon,
  href,
  end,
  collapsed,
  onNavigate,
  badgeCount,
}: {
  label: string;
  icon: React.ElementType;
  href: string;
  end: boolean;
  collapsed: boolean;
  onNavigate?: () => void;
  badgeCount?: number;
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
            <span className="relative shrink-0">
              <Icon
                className="transition-transform duration-200 group-hover:scale-[1.07]"
                style={{ width: 16, height: 16, color: isActive ? 'var(--accent)' : undefined }}
              />
              {collapsed && badgeCount !== undefined && badgeCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-danger text-[10px] font-semibold text-white flex items-center justify-center">
                  {badgeCount > 99 ? '99+' : badgeCount}
                </span>
              )}
            </span>
            {!collapsed && (
              <>
                <span
                  className="text-[13px] font-medium truncate leading-none flex-1"
                  style={{ letterSpacing: '-0.005em' }}
                >
                  {label}
                </span>
                {badgeCount !== undefined && badgeCount > 0 && (
                  <span className="min-w-5 h-5 px-1.5 rounded-full bg-danger text-[10px] font-semibold text-white flex items-center justify-center">
                    {badgeCount > 99 ? '99+' : badgeCount}
                  </span>
                )}
              </>
            )}
          </>
        )}
      </NavLink>
    </li>
  );
}

export default function AdminSidebarContent({ collapsed, onNavigate }: AdminSidebarContentProps) {
  const { data: unreadCount = 0 } = useUnreadNotificationsCount();

  return (
    <ul className="space-y-0.5">
      <NavItem
        label="User Dashboard"
        icon={ArrowLeft}
        href={Routes.dashboard.root}
        end={true}
        collapsed={collapsed}
        onNavigate={onNavigate}
      />
      {navItems.map(({ label, icon, href, end, showUnreadBadge }) => (
        <NavItem
          key={href}
          label={label}
          icon={icon}
          href={href}
          end={end}
          collapsed={collapsed}
          onNavigate={onNavigate}
          badgeCount={showUnreadBadge ? unreadCount : undefined}
        />
      ))}
    </ul>
  );
}
