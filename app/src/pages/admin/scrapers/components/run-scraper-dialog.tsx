import { useState } from "react";
import { Modal, Switch, Button, Input, Label, useOverlayState } from "@heroui/react";
import { ActionButtonWithPending } from "@/components/ui/action-button-with-pending";
import type { RunScraperOptions } from "@/features/scrapers/services/scrapers.services";

export type RunScraperDialogState = ReturnType<typeof useOverlayState>;

export type RunScraperDialogProps = {
  state: RunScraperDialogState;
  scraperName: string;
  isPending?: boolean;
  onConfirm: (options: RunScraperOptions) => unknown;
};

const DEFAULT_REUSE_DETAIL_HOURS = 24;

export function RunScraperDialog({ state, scraperName, isPending = false, onConfirm }: RunScraperDialogProps) {
  const [skipSpikeCheck, setSkipSpikeCheck] = useState(false);
  const [startFromEnabled, setStartFromEnabled] = useState(false);
  const [startPage, setStartPage] = useState("");
  const [startUrl, setStartUrl] = useState("");
  const [reuseDetail, setReuseDetail] = useState(false);
  const [reuseDetailHours, setReuseDetailHours] = useState(String(DEFAULT_REUSE_DETAIL_HOURS));

  const reset = () => {
    setSkipSpikeCheck(false);
    setStartFromEnabled(false);
    setStartPage("");
    setStartUrl("");
    setReuseDetail(false);
    setReuseDetailHours(String(DEFAULT_REUSE_DETAIL_HOURS));
  };

  const pageNumber = startPage.trim() === "" ? undefined : Number(startPage);
  const trimmedUrl = startUrl.trim();
  const hoursNumber = Number(reuseDetailHours);

  const startError = (() => {
    if (!startFromEnabled) return null;
    if (pageNumber === undefined && trimmedUrl === "") return "Enter a page number or a URL.";
    if (pageNumber !== undefined && trimmedUrl !== "") return "Use either a page number or a URL, not both.";
    if (pageNumber !== undefined && (!Number.isInteger(pageNumber) || pageNumber < 1)) {
      return "Page number must be a whole number, 1 or more.";
    }
    if (trimmedUrl !== "" && !/^https?:\/\//i.test(trimmedUrl)) return "URL must start with http:// or https://";
    return null;
  })();
  const reuseError =
    reuseDetail && (!Number.isInteger(hoursNumber) || hoursNumber < 1 || hoursNumber > 720)
      ? "Hours must be a whole number from 1 to 720."
      : null;
  const hasError = Boolean(startError || reuseError);

  const handleConfirm = async () => {
    if (hasError) return;
    const options: RunScraperOptions = { skip_spike_check: skipSpikeCheck };
    if (startFromEnabled) {
      if (pageNumber !== undefined) options.start_page = pageNumber;
      else options.start_url = trimmedUrl;
    }
    if (reuseDetail) options.reuse_detail_hours = hoursNumber;

    try {
      await Promise.resolve(onConfirm(options));
      state.close();
      reset();
    } catch {
      return;
    }
  };

  return (
    <Modal
      state={state}
      onOpenChange={(isOpen) => {
        if (!isOpen) reset();
      }}
    >
      <Modal.Backdrop isDismissable={!isPending}>
        <Modal.Container>
          <Modal.Dialog>
            <Modal.Header>
              <Modal.Heading>Run {scraperName} now?</Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              <div className="flex flex-col gap-3">
                <p className="text-sm text-muted">
                  This triggers an immediate crawl for this scraper, outside its normal schedule.
                </p>

                <div className="flex flex-col gap-1.5 rounded-lg border border-border p-3">
                  <Switch isSelected={startFromEnabled} isDisabled={isPending} onChange={setStartFromEnabled}>
                    <Switch.Control>
                      <Switch.Thumb />
                    </Switch.Control>
                    <Switch.Content>Start from a specific page or URL</Switch.Content>
                  </Switch>
                  <span className="text-xs text-muted">
                    Skips the listing pages before it. Listings on the skipped pages are left untouched and are never
                    marked removed by this run.
                  </span>
                  {startFromEnabled ? (
                    <div className="mt-1.5 grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className="flex flex-col gap-1">
                        <Label htmlFor="run-start-page">Page number</Label>
                        <Input
                          id="run-start-page"
                          type="number"
                          min={1}
                          value={startPage}
                          onChange={(event) => setStartPage(event.target.value)}
                          placeholder="e.g. 27"
                          disabled={isPending}
                        />
                        <span className="text-xs text-muted">Only for scrapers that paginate with a page parameter.</span>
                      </div>
                      <div className="flex flex-col gap-1">
                        <Label htmlFor="run-start-url">…or listing URL</Label>
                        <Input
                          id="run-start-url"
                          value={startUrl}
                          onChange={(event) => setStartUrl(event.target.value)}
                          placeholder="https://…/search?page=27"
                          disabled={isPending}
                        />
                        <span className="text-xs text-muted">Must be on the scraper&apos;s own site.</span>
                      </div>
                    </div>
                  ) : null}
                  {startError ? <span className="text-xs text-danger">{startError}</span> : null}
                </div>

                <div className="flex flex-col gap-1.5 rounded-lg border border-border p-3">
                  <Switch isSelected={reuseDetail} isDisabled={isPending} onChange={setReuseDetail}>
                    <Switch.Control>
                      <Switch.Thumb />
                    </Switch.Control>
                    <Switch.Content>Reuse detail data from a recent crawl</Switch.Content>
                  </Switch>
                  <span className="text-xs text-muted">
                    Listings whose detail page was already read within this window are not opened again, so the run
                    only fetches what is still missing (use this to finish a crawl that ran out of time).
                  </span>
                  {reuseDetail ? (
                    <div className="mt-1.5 flex max-w-40 flex-col gap-1">
                      <Label htmlFor="run-reuse-hours">Reuse data from the last (hours)</Label>
                      <Input
                        id="run-reuse-hours"
                        type="number"
                        min={1}
                        max={720}
                        value={reuseDetailHours}
                        onChange={(event) => setReuseDetailHours(event.target.value)}
                        disabled={isPending}
                      />
                    </div>
                  ) : null}
                  {reuseError ? <span className="text-xs text-danger">{reuseError}</span> : null}
                </div>

                <div className="flex flex-col gap-1.5 rounded-lg border border-border p-3">
                  <Switch isSelected={skipSpikeCheck} isDisabled={isPending} onChange={setSkipSpikeCheck}>
                    <Switch.Control>
                      <Switch.Thumb />
                    </Switch.Control>
                    <Switch.Content>Skip spike-removal protection for this run</Switch.Content>
                  </Switch>
                  <span className="text-xs text-muted">
                    Lets every listing missing from this crawl be marked removed even if that's an
                    unusually large drop, and suppresses the removal-spike notification. Only enable
                    this when the drop is confirmed legitimate (e.g. the agency did a real listings
                    cleanup) — otherwise leave it off so the usual safety check applies.
                  </span>
                </div>
              </div>
            </Modal.Body>
            <Modal.Footer>
              <Button variant="secondary" isDisabled={isPending} onPress={state.close}>
                Cancel
              </Button>
              <ActionButtonWithPending isPending={isPending} isDisabled={isPending || hasError} onPress={handleConfirm}>
                Run now
              </ActionButtonWithPending>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
