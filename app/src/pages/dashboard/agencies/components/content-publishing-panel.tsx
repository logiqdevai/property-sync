import { useEffect, useRef, useState } from "react";
import {
  Button,
  Checkbox,
  Input,
  Label,
  ListBox,
  Modal,
  Select,
  Skeleton,
  Switch,
  TextArea,
  useOverlayState,
} from "@heroui/react";
import { ActionButtonWithPending } from "@/components/ui/action-button-with-pending";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import {
  ContentLanguageFormOptions,
  DescriptionStrategyFormOptions,
  TitleStrategyFormOptions,
  getContentLanguageLabel,
} from "@/config/constants/dropdowns/agencies/content-language-form.options";
import {
  useContentPublishingConfig,
  useDeleteContentPublishingConfig,
  useUpsertContentPublishingConfig,
} from "@/features/content-publishing/hooks/use-content-publishing";
import {
  ContentLanguages,
  DescriptionProductionStrategies,
  TitleProductionStrategies,
  type ContentLanguage,
  type DescriptionProductionStrategy,
  type TitleProductionStrategy,
  type UpsertAiTitleFamilyPayload,
  type UpsertContentOutputPayload,
  type UpsertContentPublishingConfigPayload,
} from "@/features/content-publishing/interfaces/content-publishing.interfaces";

interface ContentPublishingPanelProps {
  agencyId: string;
  sourceLanguage?: ContentLanguage | string | null;
}

interface DraftFamily {
  key: string;
  name: string;
  instructions: string;
  use_batch: boolean | null;
  is_enabled: boolean;
}

interface DraftOutput {
  language: ContentLanguage;
  enabled: boolean;
  title_strategy: TitleProductionStrategy;
  description_strategy: DescriptionProductionStrategy;
  ai_title_family_key: string;
}

const nextFamilyKey = () => crypto.randomUUID();

const emptyFamilies = (): DraftFamily[] => [
  {
    key: nextFamilyKey(),
    name: "Primary markets",
    instructions: "",
    use_batch: null,
    is_enabled: true,
  },
];

const emptyOutputs = (
  sourceLanguage: ContentLanguage,
  defaultFamilyKey: string,
): DraftOutput[] =>
  ContentLanguageFormOptions.map((lang) => ({
    language: lang.id,
    enabled: lang.id === sourceLanguage,
    title_strategy: TitleProductionStrategies.ORIGINAL,
    description_strategy: DescriptionProductionStrategies.ORIGINAL,
    ai_title_family_key: defaultFamilyKey,
  }));

const createDefaultDraft = (sourceLanguage: ContentLanguage) => {
  const families = emptyFamilies();
  return {
    families,
    outputs: emptyOutputs(sourceLanguage, families[0].key),
  };
};

export function ContentPublishingPanel({
  agencyId,
  sourceLanguage,
}: ContentPublishingPanelProps) {
  const resolvedSource =
    (sourceLanguage as ContentLanguage) || ContentLanguages.EL;
  const modal = useOverlayState();
  const deleteConfirm = useOverlayState();
  const { data, isPending } = useContentPublishingConfig(agencyId, true);
  const upsert = useUpsertContentPublishingConfig(agencyId);
  const remove = useDeleteContentPublishingConfig(agencyId);

  const [aiTitlesEnabled, setAiTitlesEnabled] = useState(false);
  const [useAiBatch, setUseAiBatch] = useState(false);
  const [isEnabled, setIsEnabled] = useState(true);
  const draftSeed = useRef<ReturnType<typeof createDefaultDraft> | null>(null);
  if (!draftSeed.current) {
    draftSeed.current = createDefaultDraft(resolvedSource);
  }
  const [families, setFamilies] = useState<DraftFamily[]>(
    draftSeed.current.families,
  );
  const [outputs, setOutputs] = useState<DraftOutput[]>(
    draftSeed.current.outputs,
  );

  useEffect(() => {
    if (!data) {
      const defaults = createDefaultDraft(resolvedSource);
      setAiTitlesEnabled(false);
      setUseAiBatch(false);
      setIsEnabled(true);
      setFamilies(defaults.families);
      setOutputs(defaults.outputs);
      return;
    }

    setAiTitlesEnabled(data.ai_titles_enabled);
    setUseAiBatch(data.use_ai_batch);
    setIsEnabled(data.is_enabled);

    const nextFamilies: DraftFamily[] = data.ai_title_families.length
      ? data.ai_title_families.map((family) => ({
          key: family.id,
          name: family.name,
          instructions: family.instructions ?? "",
          use_batch: family.use_batch,
          is_enabled: family.is_enabled,
        }))
      : emptyFamilies();
    setFamilies(nextFamilies);

    const familyKeyByName = new Map(
      nextFamilies.map((family) => [family.name, family.key]),
    );
    const fallbackFamilyKey = nextFamilies[0]?.key ?? nextFamilyKey();

    const enabledByLang = new Map(
      data.outputs.map((output) => [output.language, output]),
    );
    setOutputs(
      ContentLanguageFormOptions.map((lang) => {
        const existing = enabledByLang.get(lang.id);
        const familyName =
          existing?.ai_title_family_name ?? data.ai_title_families[0]?.name;
        return {
          language: lang.id,
          enabled: Boolean(existing),
          title_strategy:
            existing?.title_strategy ?? TitleProductionStrategies.ORIGINAL,
          description_strategy:
            existing?.description_strategy ??
            DescriptionProductionStrategies.ORIGINAL,
          ai_title_family_key: familyName
            ? (familyKeyByName.get(familyName) ?? fallbackFamilyKey)
            : fallbackFamilyKey,
        };
      }),
    );
  }, [data, resolvedSource]);

  const familyNameByKey = new Map(
    families.map((family) => [family.key, family.name]),
  );

  const buildPayload = (): UpsertContentPublishingConfigPayload => {
    const enabledOutputs: UpsertContentOutputPayload[] = outputs
      .filter((output) => output.enabled)
      .map((output) => ({
        language: output.language,
        title_strategy: output.title_strategy,
        description_strategy: output.description_strategy,
        ai_title_family:
          output.title_strategy === TitleProductionStrategies.AI
            ? (familyNameByKey.get(output.ai_title_family_key) ?? null)
            : null,
      }));

    const familyPayload: UpsertAiTitleFamilyPayload[] = families.map(
      (family) => ({
        name: family.name.trim(),
        instructions: family.instructions.trim() || null,
        use_batch: family.use_batch,
        is_enabled: family.is_enabled,
      }),
    );

    return {
      ai_titles_enabled: aiTitlesEnabled,
      use_ai_batch: useAiBatch,
      is_enabled: isEnabled,
      ai_title_families: aiTitlesEnabled ? familyPayload : [],
      outputs: enabledOutputs,
    };
  };

  const handleSave = () => {
    const payload = buildPayload();
    if (!payload.outputs.length) return;
    upsert.mutate(payload, {
      onSuccess: () => modal.close(),
    });
  };

  const summaryLanguages = data?.outputs
    .map((output) => getContentLanguageLabel(output.language))
    .join(", ");

  return (
    <>
      <div className="flex items-start justify-between gap-3 border-t border-border pt-4">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-sm font-medium text-foreground">
            Content publishing
          </span>
          {isPending ? (
            <Skeleton className="h-4 w-48 rounded-md" />
          ) : (
            <span className="text-xs text-muted">
              Source: {getContentLanguageLabel(resolvedSource)}
              {data
                ? ` · ${summaryLanguages}${data.ai_titles_enabled ? " · AI titles" : ""}`
                : " · Not configured"}
            </span>
          )}
        </div>
        <Button size="sm" variant="secondary" onPress={modal.open}>
          Configure
        </Button>
      </div>

      <Modal state={modal}>
        <Modal.Backdrop
          isDismissable={!upsert.isPending && !remove.isPending}
        >
          <Modal.Container>
            <Modal.Dialog className="max-h-[90vh] w-full max-w-3xl">
              <Modal.Header>
                <Modal.Heading>Content publishing</Modal.Heading>
              </Modal.Header>
              <Modal.Body className="flex max-h-[min(70vh,40rem)] flex-col gap-4 overflow-y-auto">
        <p className="text-xs text-muted">
          Source language: {getContentLanguageLabel(resolvedSource)}.
          Choose EstateWeb languages and how titles/descriptions are
          produced. OpenAI Batch delays CMS publish until the batch
          completes; otherwise titles generate in multi-property sync
          before enqueue.
        </p>

                {isPending ? (
                  <div className="flex flex-col gap-2">
                    <Skeleton className="h-10 w-full rounded-lg" />
                    <Skeleton className="h-24 w-full rounded-lg" />
                    <Skeleton className="h-24 w-full rounded-lg" />
                  </div>
                ) : (
                  <>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="text-sm text-foreground">Enabled</span>
                        <span className="text-xs text-muted">
                          When off, CMS falls back to single-language original
                          text.
                        </span>
                      </div>
                      <Switch
                        isSelected={isEnabled}
                        onChange={setIsEnabled}
                        aria-label="Content publishing enabled"
                        className="shrink-0"
                      >
                        <Switch.Control>
                          <Switch.Thumb />
                        </Switch.Control>
                      </Switch>
                    </div>

                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="text-sm text-foreground">
                          AI titles
                        </span>
                        <span className="text-xs text-muted">
                          Allow title slots to use named AI families (translate
                          + rewrite).
                        </span>
                      </div>
                      <Switch
                        isSelected={aiTitlesEnabled}
                        onChange={setAiTitlesEnabled}
                        aria-label="AI titles"
                        className="shrink-0"
                      >
                        <Switch.Control>
                          <Switch.Thumb />
                        </Switch.Control>
                      </Switch>
                    </div>

                    {aiTitlesEnabled ? (
                      <div className="flex flex-col gap-3 rounded-lg border border-border p-3">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-medium text-foreground">
                            AI title families
                          </span>
                          <Button
                            size="sm"
                            variant="secondary"
                            onPress={() =>
                              setFamilies((prev) => [
                                ...prev,
                                {
                                  key: nextFamilyKey(),
                                  name: `Family ${prev.length + 1}`,
                                  instructions: "",
                                  use_batch: null,
                                  is_enabled: true,
                                },
                              ])
                            }
                          >
                            Add family
                          </Button>
                        </div>
                        <div className="flex items-start justify-between gap-3">
                          <span className="text-xs text-muted">
                            Default batch for new families
                          </span>
                          <Switch
                            isSelected={useAiBatch}
                            onChange={setUseAiBatch}
                            aria-label="Use AI batch"
                            className="shrink-0"
                          >
                            <Switch.Control>
                              <Switch.Thumb />
                            </Switch.Control>
                          </Switch>
                        </div>
                        {families.map((family, index) => (
                          <div
                            key={family.key}
                            className="flex flex-col gap-2 rounded-md border border-border bg-background p-2"
                          >
                            <div className="flex items-center gap-2">
                              <Input
                                id={`ai-family-name-${family.key}`}
                                aria-label={`Family ${index + 1} name`}
                                value={family.name}
                                onChange={(event) => {
                                  const nextName = event.target.value;
                                  setFamilies((prev) =>
                                    prev.map((item) =>
                                      item.key === family.key
                                        ? { ...item, name: nextName }
                                        : item,
                                    ),
                                  );
                                }}
                                fullWidth
                              />
                              <Button
                                size="sm"
                                variant="danger"
                                isDisabled={families.length <= 1}
                                onPress={() => {
                                  const remaining = families.filter(
                                    (item) => item.key !== family.key,
                                  );
                                  const fallbackKey =
                                    remaining[0]?.key ?? nextFamilyKey();
                                  setFamilies(remaining);
                                  setOutputs((prev) =>
                                    prev.map((item) =>
                                      item.ai_title_family_key === family.key
                                        ? {
                                            ...item,
                                            ai_title_family_key: fallbackKey,
                                          }
                                        : item,
                                    ),
                                  );
                                }}
                              >
                                Delete
                              </Button>
                            </div>
                            <TextArea
                              id={`ai-family-instructions-${family.key}`}
                              aria-label={`Family ${index + 1} instructions`}
                              value={family.instructions}
                              onChange={(event) =>
                                setFamilies((prev) =>
                                  prev.map((item) =>
                                    item.key === family.key
                                      ? {
                                          ...item,
                                          instructions: event.target.value,
                                        }
                                      : item,
                                  ),
                                )
                              }
                              placeholder="Optional extra instructions"
                            />
                          </div>
                        ))}
                      </div>
                    ) : null}

                    <div className="flex flex-col gap-2">
                      <span className="text-sm font-medium text-foreground">
                        Output languages
                      </span>
                      {outputs.map((output) => (
                        <div
                          key={output.language}
                          className="grid gap-2 rounded-lg border border-border p-3 sm:grid-cols-[auto_1fr_1fr_1fr]"
                        >
                          <Checkbox
                            isSelected={output.enabled}
                            onChange={(isSelected) =>
                              setOutputs((prev) =>
                                prev.map((item) =>
                                  item.language === output.language
                                    ? { ...item, enabled: isSelected }
                                    : item,
                                ),
                              )
                            }
                          >
                            <Checkbox.Content>
                              <Checkbox.Control>
                                <Checkbox.Indicator />
                              </Checkbox.Control>
                              {getContentLanguageLabel(output.language)}
                            </Checkbox.Content>
                          </Checkbox>

                          <Select
                            aria-label={`${output.language} title strategy`}
                            selectedKey={output.title_strategy}
                            isDisabled={!output.enabled}
                            onSelectionChange={(key) => {
                              if (!key) return;
                              setOutputs((prev) =>
                                prev.map((item) =>
                                  item.language === output.language
                                    ? {
                                        ...item,
                                        title_strategy: String(
                                          key,
                                        ) as TitleProductionStrategy,
                                      }
                                    : item,
                                ),
                              );
                            }}
                          >
                            <Label>Title</Label>
                            <Select.Trigger>
                              <Select.Value />
                            </Select.Trigger>
                            <Select.Popover>
                              <ListBox
                                items={TitleStrategyFormOptions.filter(
                                  (option) =>
                                    aiTitlesEnabled ||
                                    option.id !==
                                      TitleProductionStrategies.AI,
                                )}
                              >
                                {(option) => (
                                  <ListBox.Item
                                    id={option.id}
                                    textValue={option.label}
                                  >
                                    {option.label}
                                  </ListBox.Item>
                                )}
                              </ListBox>
                            </Select.Popover>
                          </Select>

                          <Select
                            aria-label={`${output.language} description strategy`}
                            selectedKey={output.description_strategy}
                            isDisabled={!output.enabled}
                            onSelectionChange={(key) => {
                              if (!key) return;
                              setOutputs((prev) =>
                                prev.map((item) =>
                                  item.language === output.language
                                    ? {
                                        ...item,
                                        description_strategy: String(
                                          key,
                                        ) as DescriptionProductionStrategy,
                                      }
                                    : item,
                                ),
                              );
                            }}
                          >
                            <Label>Description</Label>
                            <Select.Trigger>
                              <Select.Value />
                            </Select.Trigger>
                            <Select.Popover>
                              <ListBox
                                items={[...DescriptionStrategyFormOptions]}
                              >
                                {(option) => (
                                  <ListBox.Item
                                    id={option.id}
                                    textValue={option.label}
                                  >
                                    {option.label}
                                  </ListBox.Item>
                                )}
                              </ListBox>
                            </Select.Popover>
                          </Select>

                          {output.title_strategy ===
                          TitleProductionStrategies.AI ? (
                            <Select
                              aria-label={`${output.language} AI family`}
                              selectedKey={output.ai_title_family_key}
                              isDisabled={!output.enabled}
                              onSelectionChange={(key) => {
                                if (!key) return;
                                setOutputs((prev) =>
                                  prev.map((item) =>
                                    item.language === output.language
                                      ? {
                                          ...item,
                                          ai_title_family_key: String(key),
                                        }
                                      : item,
                                  ),
                                );
                              }}
                            >
                              <Label>AI family</Label>
                              <Select.Trigger>
                                <Select.Value />
                              </Select.Trigger>
                              <Select.Popover>
                                <ListBox
                                  items={families.map((family) => ({
                                    id: family.key,
                                    label: family.name,
                                  }))}
                                >
                                  {(option) => (
                                    <ListBox.Item
                                      id={option.id}
                                      textValue={option.label}
                                    >
                                      {option.label}
                                    </ListBox.Item>
                                  )}
                                </ListBox>
                              </Select.Popover>
                            </Select>
                          ) : (
                            <div className="hidden sm:block" />
                          )}
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </Modal.Body>
              <Modal.Footer className="flex flex-wrap justify-end gap-2">
                {data ? (
                  <Button
                    variant="danger"
                    onPress={deleteConfirm.open}
                    isDisabled={remove.isPending || upsert.isPending}
                  >
                    Remove
                  </Button>
                ) : null}
                <Button
                  variant="secondary"
                  onPress={modal.close}
                  isDisabled={upsert.isPending || remove.isPending}
                >
                  Cancel
                </Button>
                <ActionButtonWithPending
                  isPending={upsert.isPending}
                  onPress={handleSave}
                >
                  Save
                </ActionButtonWithPending>
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>

      <ConfirmationDialog
        state={deleteConfirm}
        title="Remove content publishing?"
        description="CMS sync will fall back to original title/description broadcast."
        confirmLabel="Remove"
        onConfirm={async () => {
          await remove.mutateAsync();
          modal.close();
        }}
        isPending={remove.isPending}
      />
    </>
  );
}
