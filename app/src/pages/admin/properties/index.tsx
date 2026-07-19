import { Tabs } from "@heroui/react";
import { useSearchParams } from "react-router-dom";
import { PropertiesListPanel } from "./components/properties-list-panel";
import { SourcePropertiesListPanel } from "./components/source-properties-list-panel";
import { UserPropertiesListPanel } from "./components/user-properties-list-panel";

const TAB_KEYS = {
  normalized: "normalized",
  source: "source",
  user: "user",
} as const;

type TabKey = (typeof TAB_KEYS)[keyof typeof TAB_KEYS];

function resolveTabKey(tabParam: string | null): TabKey {
  if (tabParam === TAB_KEYS.source) return TAB_KEYS.source;
  if (tabParam === TAB_KEYS.user) return TAB_KEYS.user;
  return TAB_KEYS.normalized;
}

export default function PropertiesListPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedKey = resolveTabKey(searchParams.get("tab"));

  return (
    <Tabs
      className="w-full"
      variant="secondary"
      selectedKey={selectedKey}
      onSelectionChange={(key) => {
        const next = resolveTabKey(String(key));
        if (next === TAB_KEYS.normalized) {
          setSearchParams({});
          return;
        }
        setSearchParams({ tab: next });
      }}
    >
      <Tabs.ListContainer>
        <Tabs.List aria-label="Property views">
          <Tabs.Tab id={TAB_KEYS.normalized}>
            Normalized
            <Tabs.Indicator />
          </Tabs.Tab>
          <Tabs.Tab id={TAB_KEYS.source}>
            Source
            <Tabs.Indicator />
          </Tabs.Tab>
          <Tabs.Tab id={TAB_KEYS.user}>
            User
            <Tabs.Indicator />
          </Tabs.Tab>
        </Tabs.List>
      </Tabs.ListContainer>
      <Tabs.Panel id={TAB_KEYS.normalized} className="pt-6">
        <PropertiesListPanel />
      </Tabs.Panel>
      <Tabs.Panel id={TAB_KEYS.source} className="pt-6">
        <SourcePropertiesListPanel />
      </Tabs.Panel>
      <Tabs.Panel id={TAB_KEYS.user} className="pt-6">
        <UserPropertiesListPanel />
      </Tabs.Panel>
    </Tabs>
  );
}
