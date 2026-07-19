import type { FC } from "react";
import { Calendar, DateField, DatePicker } from "@heroui/react";
import { parseDate, type CalendarDate } from "@internationalized/date";
import { cn } from "@/lib/utils";

type DatePickerFieldProps = {
  value: string;
  onChange: (value: string) => void;
  "aria-label": string;
  className?: string;
};

function toCalendarDate(value: string): CalendarDate | null {
  if (!value) return null;
  try {
    return parseDate(value);
  } catch {
    return null;
  }
}

export const DatePickerField: FC<DatePickerFieldProps> = ({
  value,
  onChange,
  "aria-label": ariaLabel,
  className,
}) => {
  return (
    <DatePicker
      aria-label={ariaLabel}
      value={toCalendarDate(value)}
      onChange={(date) => onChange(date?.toString() ?? "")}
      className={cn("w-52", className)}
    >
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
      <DatePicker.Popover className="min-w-63 w-auto max-w-none">
        <Calendar aria-label={ariaLabel}>
          <Calendar.Header>
            <Calendar.YearPickerTrigger>
              <Calendar.YearPickerTriggerHeading />
              <Calendar.YearPickerTriggerIndicator />
            </Calendar.YearPickerTrigger>
            <Calendar.NavButton slot="previous" />
            <Calendar.NavButton slot="next" />
          </Calendar.Header>
          <Calendar.Grid>
            <Calendar.GridHeader>
              {(day) => <Calendar.HeaderCell>{day}</Calendar.HeaderCell>}
            </Calendar.GridHeader>
            <Calendar.GridBody>
              {(date) => <Calendar.Cell date={date} />}
            </Calendar.GridBody>
          </Calendar.Grid>
          <Calendar.YearPickerGrid>
            <Calendar.YearPickerGridBody>
              {({ year }) => <Calendar.YearPickerCell year={year} />}
            </Calendar.YearPickerGridBody>
          </Calendar.YearPickerGrid>
        </Calendar>
      </DatePicker.Popover>
    </DatePicker>
  );
};
