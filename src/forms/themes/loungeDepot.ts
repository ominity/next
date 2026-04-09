import type { FormTheme } from "../types.js";

export const loungeDepotFormTheme: FormTheme = {
  form: "ominity-forms flex flex-col gap-6",

  "field.wrapper": "relative flex flex-col min-w-0",

  "field.label":
    "block font-satoshi mb-2 text-base leading-[100%] font-medium text-black sm:mb-3 sm:text-lg xl:text-xl",

  "field.labelHidden": "sr-only",

  "field.input":
    "w-full bg-doctor font-quicksand text-spicyPink placeholder:text-spicyPink rounded-[28px] border-none px-4 py-3 text-sm leading-[167%] font-normal outline-none sm:px-[26px] sm:py-[14.5px] sm:text-base xl:text-lg",

  "field.textarea":
    "w-full bg-doctor font-quicksand text-spicyPink placeholder:text-spicyPink rounded-[28px] border-none px-4 py-3 text-sm leading-[167%] font-normal outline-none min-h-[140px] sm:px-[26px] sm:py-[14.5px] sm:text-base xl:text-lg",

  "field.select":
    "w-full bg-doctor font-quicksand text-spicyPink rounded-[44px] border-none px-4 py-3 text-sm leading-[167%] font-normal outline-none sm:px-[26px] sm:py-[14.5px] sm:text-base xl:text-lg",

  "field.checkbox":
    "h-5 w-5 rounded border-black accent-spicyPink focus:ring-spicyPink mr-2",

  "field.multicheckbox":
    "h-5 w-5 rounded border-black accent-spicyPink focus:ring-spicyPink mb-2",

  "field.button":
    "inline-flex items-center w-fit justify-center bg-primary font-satoshi cursor-pointer rounded-[50px] px-8 py-3.5 text-sm leading-[100%] font-bold text-white transition-all duration-300 hover:bg-black hover:text-white sm:py-[17.5px] sm:text-base md:px-13.5 lg:text-lg",

  "field.helper":
    "mt-1 font-quicksand text-sm text-black/60",

  "field.error":
    "absolute top-full right-1 mt-1 font-satoshi text-sm text-red-500",

  "field.optionWrapper": "flex items-center gap-3",
  "field.optionLabel": "font-quicksand text-sm text-black",
  "field.optionInput":
    "h-4 w-4 rounded border-black text-black focus:ring-black",

  "field.phoneWrapper":
    "relative flex w-full min-w-0 items-center rounded-[44px] bg-doctor px-4 py-3 sm:px-[26px] sm:py-[14.5px]",

  "field.phoneCountryButton":
    "flex items-center gap-2 pr-3 font-quicksand text-sm text-black focus:outline-none",

  "field.phoneDropdown":
    "absolute left-0 top-full z-30 mt-2 w-[320px] max-w-[calc(100vw-2rem)] rounded-2xl bg-white p-3 shadow-xl",

  "field.phoneSearch":
    "w-full rounded-xl border border-gray-200 !px-3 !py-2 mb-2 font-quicksand !text-sm outline-none",

  "field.phoneOption":
    "w-full flex items-center justify-between gap-3 rounded-xl px-3 py-2 font-quicksand text-sm text-black hover:bg-black/5 data-[selected=true]:bg-primary data-[selected=true]:text-white",

  "field.phoneNumberInput":
    "flex-1 min-w-0 bg-transparent px-3 py-0 font-quicksand text-sm sm:text-base xl:text-lg leading-[167%] font-normal outline-none placeholder:text-spicyPink",
};
