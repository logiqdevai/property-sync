import { useState, useEffect } from 'react';
import { Outlet, NavLink } from 'react-router-dom';
import { Drawer, useOverlayState, Chip } from '@heroui/react';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { cn } from '@/lib/utils';
import { environments } from '@/config/environments';
import { AppLogo } from '@/components/layout/app-logo';
import { Routes } from '@/routes/routes';
import AdminSidebarContent from '@/components/layout/admin-sidebar-content';
import AdminDashboardNavbar from '@/components/layout/admin-dashboard-navbar';
import UserMenuPopover from '@/components/layout/user-menu-popover';

const STORAGE_KEY = 'admin_sidebar_collapsed';

export default function AdminLayout() {
  const drawerState = useOverlayState();
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, String(collapsed));
    } catch {}
  }, [collapsed]);

  return (
    <div className="flex h-full min-h-0 overflow-hidden bg-background">
      <aside
        className={cn(
          'hidden lg:flex flex-col shrink-0',
          'my-3 ml-3 rounded-2xl overflow-hidden',
          'bg-surface border border-border',
          'transition-all duration-300 ease-in-out',
          collapsed ? 'w-[64px]' : 'w-[220px]',
        )}
        style={{
          boxShadow: `
            0 0 0 1px color-mix(in oklch, var(--accent) 8%, transparent),
            0 20px 40px -12px color-mix(in oklch, black 22%, transparent),
            0 6px 16px -6px color-mix(in oklch, black 12%, transparent)
          `,
        }}
      >
        <div className="h-[54px] flex items-center shrink-0 px-3 border-b border-border">
          {collapsed ? (
            <div className="flex flex-col items-center justify-center w-full gap-1.5 py-0.5">
              <NavLink
                to={Routes.admin.root}
                aria-label={`${environments.APP_NAME} Admin`}
                title={`${environments.APP_NAME} Admin`}
                className="rounded-xl p-1 transition-colors duration-200 hover:bg-surface-secondary"
              >
                <AppLogo className="h-7 w-7" />
              </NavLink>
              <button
                onClick={() => setCollapsed(false)}
                title="Expand sidebar"
                className="p-1 rounded-lg text-muted hover:text-foreground hover:bg-surface-secondary transition-all duration-200"
              >
                <PanelLeftOpen className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <>
              <NavLink
                to={Routes.admin.root}
                className="flex items-center gap-2.5 flex-1 min-w-0 rounded-xl px-2 py-1.5 hover:bg-surface-secondary transition-colors duration-200"
              >
                <AppLogo className="h-7 w-7" />
                <span className="text-[13px] font-semibold text-foreground truncate tracking-tight">
                  {environments.APP_NAME}
                </span>
                <Chip color="accent" size="sm" variant="soft">
                  <Chip.Label>Admin</Chip.Label>
                </Chip>
              </NavLink>
              <button
                onClick={() => setCollapsed(true)}
                title="Collapse sidebar"
                className="shrink-0 p-1.5 rounded-lg text-muted hover:text-foreground hover:bg-surface-secondary transition-all duration-200"
              >
                <PanelLeftClose className="h-3.5 w-3.5" />
              </button>
            </>
          )}
        </div>

        <nav className="flex-1 py-2.5 px-2 overflow-y-auto">
          <AdminSidebarContent collapsed={collapsed} />
        </nav>

        <div className="shrink-0 p-2 border-t border-border">
          <UserMenuPopover collapsed={collapsed} placement="top" />
        </div>
      </aside>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden mr-3">
        <AdminDashboardNavbar onMenuClick={drawerState.open} />
        <main className="min-h-0 flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>

      <Drawer state={drawerState}>
        <Drawer.Backdrop
          isDismissable
          className="backdrop-blur-sm"
          style={{ background: 'color-mix(in oklch, black 30%, transparent)' }}
        />
        <Drawer.Content placement="left">
          <Drawer.Dialog
            className="bg-surface"
            style={{
              boxShadow: `
                0 0 0 1px color-mix(in oklch, var(--accent) 8%, transparent),
                4px 0 32px -4px color-mix(in oklch, black 20%, transparent)
              `,
            }}
          >
            <Drawer.Header className="border-b border-border h-[54px] px-3 shrink-0 flex items-center gap-2">
              <NavLink
                to={Routes.admin.root}
                onClick={drawerState.close}
                className="flex items-center gap-2.5 flex-1 min-w-0 rounded-xl px-2 py-1.5 hover:bg-surface-secondary transition-colors duration-200"
              >
                <AppLogo className="h-7 w-7" />
                <span className="text-[13px] font-semibold text-foreground truncate tracking-tight">
                  {environments.APP_NAME}
                </span>
                <Chip color="accent" size="sm" variant="soft">
                  <Chip.Label>Admin</Chip.Label>
                </Chip>
              </NavLink>
              <Drawer.CloseTrigger className="p-1.5 rounded-lg text-muted hover:text-foreground hover:bg-surface-secondary transition-colors shrink-0" />
            </Drawer.Header>

            <Drawer.Body className="px-2 pt-2.5 pb-2 flex flex-col gap-0">
              <AdminSidebarContent collapsed={false} onNavigate={drawerState.close} />
              <div className="mt-4 pt-2 border-t border-border">
                <UserMenuPopover collapsed={false} placement="top" />
              </div>
            </Drawer.Body>
          </Drawer.Dialog>
        </Drawer.Content>
      </Drawer>
    </div>
  );
}
