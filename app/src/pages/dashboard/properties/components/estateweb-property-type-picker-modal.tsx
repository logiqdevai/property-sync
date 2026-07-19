import { useDeferredValue, useEffect, useMemo, useState, type FC } from "react";
import { ChevronLeft, ChevronRight, Layers3 } from "lucide-react";
import { Button, Input, Modal, Skeleton, useOverlayState } from "@heroui/react";
import { useEstateWebPropertyTypeCatalog } from "@/features/estateweb/hooks/use-estateweb";
import type { EstateWebPropertyTypeCatalogItem } from "@/features/estateweb/interfaces/estateweb.interfaces";
import { cn } from "@/lib/utils";

export type EstateWebPropertyTypePickerModalState = ReturnType<typeof useOverlayState>;

type EstateWebPropertyTypePickerModalProps = {
  state: EstateWebPropertyTypePickerModalState;
  selectedId: number | null;
  onSelect: (propertyType: EstateWebPropertyTypeCatalogItem) => void;
  onClear: () => void;
};

const ROOT_PARENT_KEY = "__root__";
const SEARCH_RESULT_LIMIT = 80;

function parentKey(parentId: number | null) {
  return parentId == null ? ROOT_PARENT_KEY : String(parentId);
}

function buildAncestorChain(
  typesById: Map<number, EstateWebPropertyTypeCatalogItem>,
  typeId: number | null,
): EstateWebPropertyTypeCatalogItem[] {
  if (typeId == null) return [];
  const chain: EstateWebPropertyTypeCatalogItem[] = [];
  let current = typesById.get(typeId);
  while (current) {
    chain.unshift(current);
    if (current.parent_id == null) break;
    current = typesById.get(current.parent_id);
  }
  return chain;
}

function compareByName(
  a: EstateWebPropertyTypeCatalogItem,
  b: EstateWebPropertyTypeCatalogItem,
) {
  return a.name.localeCompare(b.name, "el");
}

export const EstateWebPropertyTypePickerModal: FC<
  EstateWebPropertyTypePickerModalProps
> = ({ state, selectedId, onSelect, onClear }) => {
  const { data: propertyTypes = [], isPending } = useEstateWebPropertyTypeCatalog(
    state.isOpen,
  );
  const [parentId, setParentId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search.trim().toLowerCase());

  const typesById = useMemo(() => {
    return new Map(propertyTypes.map((type) => [type.id, type]));
  }, [propertyTypes]);

  const childrenByParentId = useMemo(() => {
    const map = new Map<string, EstateWebPropertyTypeCatalogItem[]>();
    for (const type of propertyTypes) {
      const key = parentKey(type.parent_id);
      const bucket = map.get(key);
      if (bucket) bucket.push(type);
      else map.set(key, [type]);
    }
    for (const bucket of map.values()) {
      bucket.sort(compareByName);
    }
    return map;
  }, [propertyTypes]);

  useEffect(() => {
    if (!state.isOpen) return;
    setSearch("");
    if (selectedId != null && typesById.has(selectedId)) {
      const selected = typesById.get(selectedId)!;
      setParentId(selected.has_children ? selected.id : selected.parent_id);
      return;
    }
    setParentId(null);
  }, [state.isOpen, selectedId, typesById]);

  const breadcrumb = useMemo(() => {
    if (parentId == null) return [];
    return buildAncestorChain(typesById, parentId);
  }, [typesById, parentId]);

  const currentChildren = childrenByParentId.get(parentKey(parentId)) ?? [];
  const currentParent = parentId == null ? null : typesById.get(parentId) ?? null;

  const searchResults = useMemo(() => {
    if (!deferredSearch) return [];
    const matches: EstateWebPropertyTypeCatalogItem[] = [];
    for (const type of propertyTypes) {
      if (
        type.name.toLowerCase().includes(deferredSearch) ||
        type.path.toLowerCase().includes(deferredSearch) ||
        String(type.id).includes(deferredSearch)
      ) {
        matches.push(type);
        if (matches.length >= SEARCH_RESULT_LIMIT) break;
      }
    }
    return matches;
  }, [deferredSearch, propertyTypes]);

  const handleClose = () => {
    state.close();
  };

  const handleSelect = (propertyType: EstateWebPropertyTypeCatalogItem) => {
    onSelect(propertyType);
    state.close();
  };

  const handleClear = () => {
    onClear();
    state.close();
  };

  const handleDrillIn = (propertyType: EstateWebPropertyTypeCatalogItem) => {
    setParentId(propertyType.id);
    setSearch("");
  };

  const handleBreadcrumbClick = (id: number) => {
    setParentId(id);
  };

  const isSearchMode = deferredSearch.length > 0;

  return (
    <Modal state={state}>
      <Modal.Backdrop isDismissable>
        <Modal.Container>
          <Modal.Dialog className="max-w-xl w-full">
            <Modal.Header>
              <Modal.Heading>EstateWeb property type</Modal.Heading>
            </Modal.Header>
            <Modal.Body className="flex flex-col gap-3">
              <Input
                aria-label="Search property types"
                placeholder="Search by name, path, or id…"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />

              {isPending ? (
                <div className="flex flex-col gap-2">
                  {Array.from({ length: 8 }).map((_, index) => (
                    <Skeleton key={index} className="h-10 w-full rounded-lg" />
                  ))}
                </div>
              ) : isSearchMode ? (
                <div className="flex flex-col gap-1 max-h-80 overflow-y-auto">
                  {searchResults.length === 0 ? (
                    <p className="text-sm text-muted py-4 text-center">
                      No property types match.
                    </p>
                  ) : (
                    searchResults.map((propertyType) => (
                      <button
                        key={propertyType.id}
                        type="button"
                        className={cn(
                          "flex flex-col gap-0.5 rounded-lg border border-border px-3 py-2 text-left hover:bg-surface-secondary",
                          selectedId === propertyType.id && "border-accent/50 bg-accent/10",
                          !propertyType.is_leaf && "opacity-80",
                        )}
                        onClick={() => handleSelect(propertyType)}
                      >
                        <span className="text-sm font-medium text-foreground">
                          {propertyType.name}
                        </span>
                        <span className="text-xs text-muted truncate">{propertyType.path}</span>
                      </button>
                    ))
                  )}
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap items-center gap-1 text-xs text-muted">
                    <button
                      type="button"
                      className={cn(
                        "rounded px-1.5 py-0.5 hover:bg-surface-secondary hover:text-foreground",
                        parentId == null && "font-semibold text-foreground",
                      )}
                      onClick={() => setParentId(null)}
                    >
                      All categories
                    </button>
                    {breadcrumb.map((crumb) => (
                      <span key={crumb.id} className="inline-flex items-center gap-1">
                        <ChevronRight className="size-3" />
                        <button
                          type="button"
                          className={cn(
                            "rounded px-1.5 py-0.5 hover:bg-surface-secondary hover:text-foreground",
                            crumb.id === parentId && "font-semibold text-foreground",
                          )}
                          onClick={() => handleBreadcrumbClick(crumb.id)}
                        >
                          {crumb.name}
                        </button>
                      </span>
                    ))}
                  </div>

                  {currentParent ? (
                    <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-surface px-3 py-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">
                          {currentParent.name}
                        </p>
                        <p className="text-xs text-muted truncate">{currentParent.path}</p>
                      </div>
                      <Button
                        variant="primary"
                        size="sm"
                        onPress={() => handleSelect(currentParent)}
                      >
                        Use this
                      </Button>
                    </div>
                  ) : null}

                  <div className="flex flex-col gap-1 max-h-72 overflow-y-auto">
                    {parentId != null ? (
                      <button
                        type="button"
                        className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted hover:bg-surface-secondary hover:text-foreground"
                        onClick={() =>
                          setParentId(currentParent?.parent_id ?? null)
                        }
                      >
                        <ChevronLeft className="size-4" />
                        Back
                      </button>
                    ) : null}

                    {currentChildren.length === 0 ? (
                      <p className="text-sm text-muted py-4 text-center">
                        No child property types.
                      </p>
                    ) : (
                      currentChildren.map((propertyType) => (
                        <div
                          key={propertyType.id}
                          className={cn(
                            "flex items-center gap-1 rounded-lg border border-border",
                            selectedId === propertyType.id && "border-accent/50 bg-accent/10",
                          )}
                        >
                          <button
                            type="button"
                            className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2 text-left hover:bg-surface-secondary rounded-l-lg"
                            onClick={() =>
                              propertyType.has_children
                                ? handleDrillIn(propertyType)
                                : handleSelect(propertyType)
                            }
                          >
                            <Layers3 className="size-3.5 shrink-0 text-muted" />
                            <span className="min-w-0">
                              <span className="block text-sm font-medium text-foreground truncate">
                                {propertyType.name}
                              </span>
                            </span>
                          </button>
                          {propertyType.has_children ? (
                            <button
                              type="button"
                              aria-label={`Open ${propertyType.name}`}
                              className="shrink-0 px-3 py-2 text-muted hover:text-foreground"
                              onClick={() => handleDrillIn(propertyType)}
                            >
                              <ChevronRight className="size-4" />
                            </button>
                          ) : (
                            <Button
                              variant="secondary"
                              size="sm"
                              className="mr-2"
                              onPress={() => handleSelect(propertyType)}
                            >
                              Select
                            </Button>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </>
              )}
            </Modal.Body>
            <Modal.Footer>
              <Button
                variant="danger"
                isDisabled={selectedId == null}
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
