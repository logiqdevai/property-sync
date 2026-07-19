import { useDeferredValue, useEffect, useMemo, useState, type FC } from "react";
import { ChevronLeft, ChevronRight, MapPin } from "lucide-react";
import { Button, Input, Modal, Skeleton, useOverlayState } from "@heroui/react";
import { useEstateWebLocationCatalog } from "@/features/estateweb/hooks/use-estateweb";
import type { EstateWebLocationCatalogItem } from "@/features/estateweb/interfaces/estateweb.interfaces";
import { cn } from "@/lib/utils";

export type EstateWebLocationPickerModalState = ReturnType<typeof useOverlayState>;

type EstateWebLocationPickerModalProps = {
  state: EstateWebLocationPickerModalState;
  selectedId: number | null;
  onSelect: (location: EstateWebLocationCatalogItem) => void;
  onClear: () => void;
};

const ROOT_PARENT_ID = 0;
const SEARCH_RESULT_LIMIT = 80;

function buildAncestorChain(
  locationsById: Map<number, EstateWebLocationCatalogItem>,
  locationId: number | null,
): EstateWebLocationCatalogItem[] {
  if (locationId == null) return [];
  const chain: EstateWebLocationCatalogItem[] = [];
  let current = locationsById.get(locationId);
  while (current) {
    chain.unshift(current);
    if (current.parent_id === ROOT_PARENT_ID) break;
    current = locationsById.get(current.parent_id);
  }
  return chain;
}

function compareByName(a: EstateWebLocationCatalogItem, b: EstateWebLocationCatalogItem) {
  return a.name.localeCompare(b.name, "el");
}

export const EstateWebLocationPickerModal: FC<EstateWebLocationPickerModalProps> = ({
  state,
  selectedId,
  onSelect,
  onClear,
}) => {
  const { data: locations = [], isPending } = useEstateWebLocationCatalog(state.isOpen);
  const [parentId, setParentId] = useState(ROOT_PARENT_ID);
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search.trim().toLowerCase());

  const locationsById = useMemo(() => {
    return new Map(locations.map((location) => [location.id, location]));
  }, [locations]);

  const childrenByParentId = useMemo(() => {
    const map = new Map<number, EstateWebLocationCatalogItem[]>();
    for (const location of locations) {
      const bucket = map.get(location.parent_id);
      if (bucket) bucket.push(location);
      else map.set(location.parent_id, [location]);
    }
    for (const bucket of map.values()) {
      bucket.sort(compareByName);
    }
    return map;
  }, [locations]);

  useEffect(() => {
    if (!state.isOpen) return;
    setSearch("");
    if (selectedId != null && locationsById.has(selectedId)) {
      const selected = locationsById.get(selectedId)!;
      setParentId(selected.has_children ? selected.id : selected.parent_id);
      return;
    }
    setParentId(ROOT_PARENT_ID);
  }, [state.isOpen, selectedId, locationsById]);

  const breadcrumb = useMemo(() => {
    if (parentId === ROOT_PARENT_ID) return [];
    return buildAncestorChain(locationsById, parentId);
  }, [locationsById, parentId]);

  const currentChildren = childrenByParentId.get(parentId) ?? [];
  const currentParent = parentId === ROOT_PARENT_ID ? null : locationsById.get(parentId) ?? null;

  const searchResults = useMemo(() => {
    if (!deferredSearch) return [];
    const matches: EstateWebLocationCatalogItem[] = [];
    for (const location of locations) {
      if (
        location.name.toLowerCase().includes(deferredSearch) ||
        location.path.toLowerCase().includes(deferredSearch) ||
        String(location.id).includes(deferredSearch)
      ) {
        matches.push(location);
        if (matches.length >= SEARCH_RESULT_LIMIT) break;
      }
    }
    return matches;
  }, [deferredSearch, locations]);

  const handleClose = () => {
    state.close();
  };

  const handleSelect = (location: EstateWebLocationCatalogItem) => {
    onSelect(location);
    state.close();
  };

  const handleClear = () => {
    onClear();
    state.close();
  };

  const handleDrillIn = (location: EstateWebLocationCatalogItem) => {
    setParentId(location.id);
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
              <Modal.Heading>EstateWeb location</Modal.Heading>
            </Modal.Header>
            <Modal.Body className="flex flex-col gap-3">
              <Input
                aria-label="Search locations"
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
                    <p className="text-sm text-muted py-4 text-center">No locations match.</p>
                  ) : (
                    searchResults.map((location) => (
                      <button
                        key={location.id}
                        type="button"
                        className={cn(
                          "flex flex-col gap-0.5 rounded-lg border border-border px-3 py-2 text-left hover:bg-surface-secondary",
                          selectedId === location.id && "border-accent/50 bg-accent/10",
                        )}
                        onClick={() => handleSelect(location)}
                      >
                        <span className="text-sm font-medium text-foreground">{location.name}</span>
                        <span className="text-xs text-muted truncate">{location.path}</span>
                        <span className="text-[11px] text-muted">ID {location.id}</span>
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
                        parentId === ROOT_PARENT_ID && "font-semibold text-foreground",
                      )}
                      onClick={() => setParentId(ROOT_PARENT_ID)}
                    >
                      All regions
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
                    {parentId !== ROOT_PARENT_ID ? (
                      <button
                        type="button"
                        className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted hover:bg-surface-secondary hover:text-foreground"
                        onClick={() =>
                          setParentId(currentParent?.parent_id ?? ROOT_PARENT_ID)
                        }
                      >
                        <ChevronLeft className="size-4" />
                        Back
                      </button>
                    ) : null}

                    {currentChildren.length === 0 ? (
                      <p className="text-sm text-muted py-4 text-center">No child locations.</p>
                    ) : (
                      currentChildren.map((location) => (
                        <div
                          key={location.id}
                          className={cn(
                            "flex items-center gap-1 rounded-lg border border-border",
                            selectedId === location.id && "border-accent/50 bg-accent/10",
                          )}
                        >
                          <button
                            type="button"
                            className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2 text-left hover:bg-surface-secondary rounded-l-lg"
                            onClick={() =>
                              location.has_children
                                ? handleDrillIn(location)
                                : handleSelect(location)
                            }
                          >
                            <MapPin className="size-3.5 shrink-0 text-muted" />
                            <span className="min-w-0">
                              <span className="block text-sm font-medium text-foreground truncate">
                                {location.name}
                              </span>
                              <span className="block text-[11px] text-muted">ID {location.id}</span>
                            </span>
                          </button>
                          {location.has_children ? (
                            <button
                              type="button"
                              aria-label={`Open ${location.name}`}
                              className="shrink-0 px-3 py-2 text-muted hover:text-foreground"
                              onClick={() => handleDrillIn(location)}
                            >
                              <ChevronRight className="size-4" />
                            </button>
                          ) : (
                            <Button
                              variant="secondary"
                              size="sm"
                              className="mr-2"
                              onPress={() => handleSelect(location)}
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
