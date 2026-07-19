import { useDeferredValue, useEffect, useMemo, useState, type FC } from "react";
import { Button, Input, Modal, Skeleton, useOverlayState } from "@heroui/react";
import { useEstateWebFeaturesCatalog } from "@/features/estateweb/hooks/use-estateweb";
import { cn } from "@/lib/utils";

export type EstateWebFeaturesPickerModalState = ReturnType<typeof useOverlayState>;

type EstateWebFeaturesPickerModalProps = {
  state: EstateWebFeaturesPickerModalState;
  selectedNames: string[];
  onApply: (featureNames: string[]) => void;
  onClear: () => void;
};

const SEARCH_RESULT_LIMIT = 120;

function compareByName(a: { name: string }, b: { name: string }) {
  return a.name.localeCompare(b.name, "el");
}

export const EstateWebFeaturesPickerModal: FC<EstateWebFeaturesPickerModalProps> = ({
  state,
  selectedNames,
  onApply,
  onClear,
}) => {
  const { data: features = [], isPending } = useEstateWebFeaturesCatalog(state.isOpen);
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState<string[]>([]);
  const deferredSearch = useDeferredValue(search.trim().toLowerCase());

  useEffect(() => {
    if (!state.isOpen) return;
    setSearch("");
    setDraft(selectedNames);
  }, [state.isOpen, selectedNames]);

  const sortedFeatures = useMemo(() => [...features].sort(compareByName), [features]);

  const visibleFeatures = useMemo(() => {
    if (!deferredSearch) return sortedFeatures;
    const matches = sortedFeatures.filter((feature) =>
      feature.name.toLowerCase().includes(deferredSearch),
    );
    return matches.slice(0, SEARCH_RESULT_LIMIT);
  }, [deferredSearch, sortedFeatures]);

  const selectedSet = useMemo(() => new Set(draft), [draft]);

  const toggleFeature = (name: string) => {
    setDraft((current) =>
      current.includes(name)
        ? current.filter((entry) => entry !== name)
        : [...current, name],
    );
  };

  const handleClose = () => {
    state.close();
  };

  const handleApply = () => {
    onApply(draft);
    state.close();
  };

  const handleClear = () => {
    onClear();
    state.close();
  };

  return (
    <Modal state={state}>
      <Modal.Backdrop isDismissable>
        <Modal.Container>
          <Modal.Dialog className="max-w-xl w-full">
            <Modal.Header>
              <Modal.Heading>Features</Modal.Heading>
            </Modal.Header>
            <Modal.Body className="flex flex-col gap-3">
              <Input
                aria-label="Search features"
                placeholder="Search features…"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />

              {isPending ? (
                <div className="flex flex-col gap-2">
                  {Array.from({ length: 8 }).map((_, index) => (
                    <Skeleton key={index} className="h-10 w-full rounded-lg" />
                  ))}
                </div>
              ) : (
                <div className="flex flex-col gap-1 max-h-80 overflow-y-auto">
                  {visibleFeatures.length === 0 ? (
                    <p className="text-sm text-muted py-4 text-center">No features match.</p>
                  ) : (
                    visibleFeatures.map((feature) => {
                      const checked = selectedSet.has(feature.name);
                      return (
                        <label
                          key={feature.id}
                          className={cn(
                            "flex items-center gap-3 rounded-lg border border-border px-3 py-2 cursor-pointer hover:bg-surface-secondary",
                            checked && "border-accent/50 bg-accent/10",
                          )}
                        >
                          <input
                            type="checkbox"
                            className="size-4"
                            checked={checked}
                            onChange={() => toggleFeature(feature.name)}
                          />
                          <span className="text-sm text-foreground">{feature.name}</span>
                        </label>
                      );
                    })
                  )}
                </div>
              )}
            </Modal.Body>
            <Modal.Footer>
              <Button
                variant="danger"
                isDisabled={draft.length === 0 && selectedNames.length === 0}
                onPress={handleClear}
              >
                Clear
              </Button>
              <Button variant="secondary" onPress={handleClose}>
                Cancel
              </Button>
              <Button variant="primary" onPress={handleApply}>
                Apply
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
};
