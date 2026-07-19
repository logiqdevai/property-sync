# HeroUI DatePicker styling fix

How date filter pickers were migrated to HeroUI v3 and why they looked unstyled until theme + popover overrides landed.

## Context

Native `<input type="date">` filters were replaced with a shared HeroUI composition wrapper:

- Component: `app/src/components/ui/date-picker-field.tsx`
- Used on admin/dashboard list pages (properties, sync-runs, crawl-runs, diagnostics)

Composition follows the official HeroUI v3 anatomy:

```tsx
<DatePicker>
  <DateField.Group fullWidth>
    <DateField.Input>
      {(segment) => <DateField.Segment segment={segment} />}
    </DateField.Input>
    <DateField.Suffix>
      <DatePicker.Trigger>
        <DatePicker.TriggerIndicator />
      </DatePicker.Trigger>
    </DateField.Suffix>
  </DateField.Group>
  <DatePicker.Popover>
    <Calendar>...</Calendar>
  </DatePicker.Popover>
</DatePicker>
```

Global styles were already imported correctly:

```css
/* app/src/index.css */
@import "tailwindcss";
@import "@heroui/styles";
```

No extra CSS package import was missing. The broken look came from **theme tokens** and a **popover width rule**.

## Problem 1 — field borders invisible

HeroUI’s default theme sets:

```css
--field-border-width: 0px;
--field-border: transparent;
```

DatePicker / Select / Input all use:

```css
border-width: var(--border-width-field); /* → --field-border-width */
border-color: var(--color-field-border); /* → --field-border */
```

This app already overrode `--field-border` (color) in `[data-theme="light"]` / `[data-theme="dark"]`, but never set `--field-border-width`. Width stayed `0px`, so fields looked flat / “unstyled” next to chips and other UI.

Date / calendar pieces also rely on tokens this theme did not define:

| Token | Used by |
| --- | --- |
| `--default` / `--default-foreground` | Calendar cell hover / pressed |
| `--segment` / `--segment-foreground` | Date segment chrome |
| `--field-foreground` | Field text |
| `--field-shadow` | Field elevation |
| `--overlay-shadow` | DatePicker popover shadow |

### Fix

In `app/src/index.css`, for both light and dark themes, add:

```css
--default: /* surface-adjacent neutral */;
--default-foreground: /* readable on --default */;

--segment: /* segment chip surface */;
--segment-foreground: /* segment text */;

--field-background: /* existing */;
--field-foreground: /* readable on field */;
--field-border: /* existing */;
--field-border-width: 1px; /* required — color alone is not enough */
--field-placeholder: /* existing */;
--field-shadow: /* light: soft drop shadow; dark: transparent inset */;

--overlay-shadow: /* popover elevation */;
```

After this, DateField groups match Select triggers (same field border + shadow system).

## Problem 2 — calendar popover crushed by trigger width

HeroUI’s default popover CSS is:

```css
.date-picker__popover {
  max-width: var(--trigger-width);
  /* ... */
}
```

`--trigger-width` is measured from `DatePicker.Trigger` — the **calendar icon button**, not the whole input. That makes `max-width` ~24–32px while `Calendar` wants ~`w-63` (~15.75rem). Result: cramped / “broken” calendar that looks unstyled.

Official docs show overriding popover width via `className` / `@layer components`, preferring **min-width** relative to the trigger instead of clamping with **max-width**.

### Fix

In `date-picker-field.tsx`:

```tsx
<DatePicker.Popover className="min-w-63 w-auto max-w-none">
```

- `max-w-none` — cancel the default `max-w-(--trigger-width)`
- `min-w-63` — match HeroUI calendar width (`w-63`)
- `w-auto` — let content size the popover

Also widen the root field slightly (`w-52`) so `mm / dd / yyyy` segments are readable.

## Checklist if DatePicker looks wrong again

1. Confirm `@import "@heroui/styles";` is in the main CSS entry after Tailwind.
2. Confirm composition includes `DateField.Group` + `DateField.Input` + `DatePicker.Trigger` + `DatePicker.Popover` + full `Calendar` tree (including `YearPickerGrid`).
3. Confirm theme defines **`--field-border-width`**, not only `--field-border`.
4. Confirm popover has `max-w-none` (or equivalent) so calendar is not clipped to the icon width.
5. Confirm `@internationalized/date` is a direct dependency when using `parseDate` / `CalendarDate`.

## Files touched

| File | Change |
| --- | --- |
| `app/src/components/ui/date-picker-field.tsx` | Shared HeroUI DatePicker wrapper; popover width override |
| `app/src/index.css` | Field / default / segment / shadow theme tokens |
| `app/package.json` | Direct `@internationalized/date` dependency |
| List pages under `app/src/pages/**` | Replaced native `type="date"` with `DatePickerField` |

## References

- [HeroUI DatePicker](https://www.heroui.com/docs/react/components/date-picker)
- [HeroUI DatePicker migration (styling)](https://www.heroui.com/docs/react/migration/date-picker)
- [HeroUI Theming](https://www.heroui.com/docs/react/getting-started/theming)
