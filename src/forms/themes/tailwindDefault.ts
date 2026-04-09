import type { FormTheme } from "../types.js";

export const tailwindDefaultTheme: FormTheme = {
  form: "ominity-forms flex flex-col gap-6",
  "field.wrapper": "flex flex-col gap-2",
  "field.label": "text-sm font-medium text-gray-900",
  "field.labelHidden": "sr-only",
  "field.input":
    "w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900/30",
  "field.textarea":
    "min-h-[120px] w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900/30",
  "field.select":
    "w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900/30",
  "field.checkbox":
    "h-4 w-4 rounded border-gray-300 text-gray-900 focus:ring-gray-900",
  "field.multicheckbox":
    "h-4 w-4 border-gray-300 text-gray-900 focus:ring-gray-900",
  "field.button":
    "inline-flex items-center justify-center rounded-md bg-gray-900 px-6 py-3 text-sm font-medium text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60",
  "field.helper": "text-xs text-gray-500",
  "field.error": "text-xs font-medium text-red-600",
  "field.optionWrapper": "flex items-center gap-2 text-sm text-gray-900",
  "field.optionLabel": "text-sm text-gray-900",
  "field.optionInput":
    "h-4 w-4 border-gray-300 text-gray-900 focus:ring-gray-900",
  "field.phoneWrapper":
    "relative flex w-full min-w-0 items-stretch rounded-md border border-gray-300 bg-white px-3 py-2 text-gray-900 shadow-sm focus-within:border-gray-900 focus-within:ring-2 focus-within:ring-gray-900/30",
  "field.phoneCountryButton":
    "flex items-center gap-2 border-r border-gray-200 pr-2 bg-transparent text-sm font-semibold text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-900/30 disabled:cursor-not-allowed disabled:opacity-60",
  "field.phoneDropdown":
    "absolute left-0 top-full z-30 mt-2 flex w-[320px] max-w-[calc(100vw-2rem)] flex-col gap-2 rounded-xl border border-gray-200 bg-white p-3 shadow-xl",
  "field.phoneSearch":
    "w-full rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:border-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900/30",
  "field.phoneOption":
    "flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-sm text-gray-900 hover:bg-gray-100 focus:bg-gray-100 focus:outline-none data-[selected=true]:bg-gray-900 data-[selected=true]:text-white",
  "field.phoneNumberInput":
    "flex-1 min-w-0 border-0 bg-transparent px-3 text-sm text-gray-900 placeholder:text-gray-500 focus:outline-none focus:ring-0 disabled:cursor-not-allowed disabled:opacity-60",
};
