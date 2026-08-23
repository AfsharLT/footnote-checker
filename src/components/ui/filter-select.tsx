import * as React from "react";
import { Check, ChevronDown } from "lucide-react";
import {
  Button as AriaButton,
  Label,
  ListBox,
  ListBoxItem,
  Popover,
  Select,
  SelectValue,
} from "react-aria-components";

export interface FilterOption {
  value: string;
  label: string;
}

interface FilterSelectProps {
  label: string;
  value: string;
  options: readonly FilterOption[];
  onChange(value: string): void;
}

export function FilterSelect({ label, value, options, onChange }: FilterSelectProps) {
  return (
    <Select
      className="fc-select"
      selectedKey={value}
      onSelectionChange={(key) => onChange(String(key))}
    >
      <Label className="fc-select__label">{label}</Label>
      <AriaButton className="fc-select__button">
        <SelectValue />
        <ChevronDown size={15} aria-hidden="true" />
      </AriaButton>
      <Popover className="fc-select__popover" placement="bottom start">
        <ListBox className="fc-select__listbox" items={options}>
          {(option) => (
            <ListBoxItem id={option.value} textValue={option.label} className="fc-select__option">
              {({ isSelected }) => (
                <>
                  <span>{option.label}</span>
                  {isSelected && <Check size={15} aria-hidden="true" />}
                </>
              )}
            </ListBoxItem>
          )}
        </ListBox>
      </Popover>
    </Select>
  );
}
