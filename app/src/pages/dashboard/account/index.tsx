import { useState } from "react";
import { Skeleton, Tabs } from "@heroui/react";
import { formatDateTime } from "@/lib/date";
import {
  useChangeCurrentUserPassword,
  useCurrentUser,
  useUpdateCurrentUser,
} from "@/features/users/hooks/use-account";
import { ProfileForm } from "./components/profile-form";
import { ChangePasswordForm } from "./components/change-password-form";

function AccountSkeleton() {
  return (
    <div className="grid gap-6 max-w-2xl">
      <Skeleton className="h-8 w-48 rounded-lg" />
      <Skeleton className="h-4 w-72 rounded-lg" />
      <Skeleton className="h-10 w-full max-w-md rounded-lg" />
      <Skeleton className="h-64 w-full rounded-xl" />
    </div>
  );
}

const ACCOUNT_TABS = {
  profile: "profile",
  password: "password",
} as const;

type AccountTab = (typeof ACCOUNT_TABS)[keyof typeof ACCOUNT_TABS];

export default function AccountPage() {
  const { data: user, isPending } = useCurrentUser();
  const updateProfile = useUpdateCurrentUser();
  const changePassword = useChangeCurrentUserPassword();
  const [passwordFormKey, setPasswordFormKey] = useState(0);
  const [selectedTab, setSelectedTab] = useState<AccountTab>(ACCOUNT_TABS.profile);

  if (isPending || !user) {
    return <AccountSkeleton />;
  }

  return (
    <div className="max-w-2xl flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Account</h1>
        <p className="text-sm text-muted mt-1">View your profile and manage your password.</p>
      </div>

      <Tabs
        className="relative w-full"
        variant="secondary"
        selectedKey={selectedTab}
        onSelectionChange={(key) => setSelectedTab(String(key) as AccountTab)}
      >
        <Tabs.ListContainer className="relative z-10">
          <Tabs.List aria-label="Account settings">
            <Tabs.Tab id={ACCOUNT_TABS.profile}>
              Profile
              <Tabs.Indicator />
            </Tabs.Tab>
            <Tabs.Tab id={ACCOUNT_TABS.password}>
              Password
              <Tabs.Indicator />
            </Tabs.Tab>
          </Tabs.List>
        </Tabs.ListContainer>

        <Tabs.Panel id={ACCOUNT_TABS.profile} className="pt-6 data-[exiting]:pointer-events-none">
          <section className="rounded-xl border border-border bg-surface p-6 flex flex-col gap-6">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Profile</h2>
              <p className="text-sm text-muted mt-1">Update your contact details.</p>
            </div>

            <dl className="grid gap-3 sm:grid-cols-2 text-sm">
              <div>
                <dt className="text-muted">Member since</dt>
                <dd className="font-medium text-foreground mt-0.5">{formatDateTime(user.created_at)}</dd>
              </div>
            </dl>
            <ProfileForm
              key={`${user.email}-${user.phone ?? ""}-${user.updated_at}`}
              defaultValues={{
                email: user.email,
                phone: user.phone ?? "",
              }}
              isPending={updateProfile.isPending}
              onSubmit={(payload) => updateProfile.mutate(payload)}
            />
          </section>
        </Tabs.Panel>

        <Tabs.Panel id={ACCOUNT_TABS.password} className="pt-6 data-[exiting]:pointer-events-none">
          <section className="rounded-xl border border-border bg-surface p-6 flex flex-col gap-6">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Password</h2>
              <p className="text-sm text-muted mt-1">Change your password. No confirmation email will be sent.</p>
            </div>

            <ChangePasswordForm
              key={passwordFormKey}
              isPending={changePassword.isPending}
              onSubmit={(payload) =>
                changePassword.mutate(payload, {
                  onSuccess: () => setPasswordFormKey((key) => key + 1),
                })
              }
            />
          </section>
        </Tabs.Panel>
      </Tabs>
    </div>
  );
}
