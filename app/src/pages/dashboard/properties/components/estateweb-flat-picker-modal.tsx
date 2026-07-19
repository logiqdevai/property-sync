import { useDeferredValue, useEffect, useMemo, useState, type FC } from "react";
import { Button, Input, Modal, Skeleton, useOverlayState } from "@heroui/react";
import { cn } from "@/lib/utils";

export type EstateWebFlatPickerModalState = ReturnType<typeof useOverlayState>;

type EstateWebFlatPickerItem = {
  id: number | string;
  name: string;
  subtitle?: string | null;
};

type EstateWebFlatPickerModalProps = {
  state: EstateWebFlatPickerModalState;
  title: string;
  searchPlaceholder: string;
  emptyLabel: string;
  items: EstateWebFlatPickerItem[];
  isPending?: boolean;
  selectedId: number | string | null;
  onSelect: (item: EstateWebFlatPickerItem) => void;
  onClear: () => void;
};

const SEARCH_RESULT_LIMIT = 80;

export const EstateWebFlatPickerModal: FC<EstateWebFlatPickerModalProps> = ({
  state,
  title,
  searchPlaceholder,
  emptyLabel,
  items,
  isPending = false,
  selectedId,
  onSelect,
  onClear,
}) => {
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search.trim().toLowerCase());

  useEffect(() => {
    if (!state.isOpen) return;
    setSearch("");
  }, [state.isOpen]);

  const searchResults = useMemo(() => {
    if (!deferredSearch) return items;
    const matches: EstateWebFlatPickerItem[] = [];
    for (const item of items) {
      if (
        item.name.toLowerCase().includes(deferredSearch) ||
        String(item.id).toLowerCase().includes(deferredSearch) ||
        item.subtitle?.toLowerCase().includes(deferredSearch)
      ) {
        matches.push(item);
        if (matches.length >= SEARCH_RESULT_LIMIT) break;
      }
    }
    return matches;
  }, [deferredSearch, items]);

  const handleClose = () => {
    state.close();
  };

  const handleSelect = (item: EstateWebFlatPickerItem) => {
    onSelect(item);
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
              <Modal.Heading>{title}</Modal.Heading>
            </Modal.Header>
            <Modal.Body className="flex flex-col gap-3">
              <Input
                aria-label={`Search ${title.toLowerCase()}`}
                placeholder={searchPlaceholder}
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
                  {searchResults.length === 0 ? (
                    <p className="text-sm text-muted py-4 text-center">{emptyLabel}</p>
                  ) : (
                    searchResults.map((item) => (
                      <button
                        key={String(item.id)}
                        type="button"
                        className={cn(
                          "flex flex-col gap-0.5 rounded-lg border border-border px-3 py-2 text-left hover:bg-surface-secondary",
                          selectedId === item.id && "border-accent/50 bg-accent/10",
                        )}
                        onClick={() => handleSelect(item)}
                      >
                        <span className="text-sm font-medium text-foreground">{item.name}</span>
                        {item.subtitle ? (
                          <span className="text-xs text-muted truncate">{item.subtitle}</span>
                        ) : null}
                      </button>
                    ))
                  )}
                </div>
              )}
            </Modal.Body>
            <Modal.Footer>
              <Button
                variant="danger"
                isDisabled={selectedId == null || selectedId === ""}
                onPress={handleClear}
              >
                Clear
              </Button>
              <Button variant="secondary" onPress={handleClose}>
                Cancel
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
};
