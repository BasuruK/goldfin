/// <reference types="@sveltejs/kit" />

// Goldfin_Components stays JavaScript until #105; this shim keeps `allowJs: false` in app code.
declare module '$goldfin/lib/index.js' {
  import type { Component } from 'svelte';

  type GfComponent = Component;

  export const Slider: GfComponent;
  export const MosaicHeader: GfComponent;
  export const ConfirmDialog: GfComponent;
  export const Dialog: GfComponent;
  export const Button: GfComponent;
  export const Icon: GfComponent;
  export const Checkbox: GfComponent;
  export const CheckboxGroup: GfComponent;
  export const RadioGroup: GfComponent;
  export const Switch: GfComponent;
  export const SwitchCard: GfComponent;
  export const Input: GfComponent;
  export const Select: GfComponent;
  export const StatusSelect: GfComponent;
  export const DropdownMenu: GfComponent;
  export const Tabs: GfComponent;
  export const SegmentedControl: GfComponent;
  export const Pill: GfComponent;
  export const Chip: GfComponent;
  export const Spinner: GfComponent;
  export const LoadingTask: GfComponent;
  export const LoadingSearch: GfComponent;
  export const Table: GfComponent;
  export const BudgetBar: GfComponent;
  export const RunButton: GfComponent;
  export const CopyButton: GfComponent;
  export const SplitPane: GfComponent;
  export const FileDrop: GfComponent;
  export const JSONViewer: GfComponent;
  export const Timeline: GfComponent;
  export const TimelineItem: GfComponent;
  export const FieldGroup: GfComponent;
  export const DialogHeader: GfComponent;
  export const DialogBody: GfComponent;
  export const DialogFooter: GfComponent;
  export const SwitchControl: GfComponent;
  export const TableSortButton: GfComponent;
  export const TableEmpty: GfComponent;
  export const TimelineMarker: GfComponent;
  export const TabList: GfComponent;
  export const TabTrigger: GfComponent;
  export const TabContent: GfComponent;
  export const MenuItem: GfComponent;
  export const MenuSeparator: GfComponent;
  export const MenuLabel: GfComponent;
  export const SegmentedItem: GfComponent;
  export const Mosaic: GfComponent;
  export const Sea: GfComponent;
  export const JSONLine: GfComponent;
  export const LoadingButton: GfComponent;
  export const LoadingOverlay: GfComponent;
  export const LoadingStatus: GfComponent;
  export const ReadRow: GfComponent;
  export const Section: GfComponent;
  export const Skeleton: GfComponent;
  export const ThemeToggle: GfComponent;
}
