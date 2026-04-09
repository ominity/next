import type { FormTheme } from "../types.js";

const PREFIX = "ominity-forms";
const slot = (suffix: string) => `${PREFIX}__${suffix}`;

export const unstyledTheme: FormTheme = {
  form: PREFIX,
  "field.wrapper": slot("field"),
  "field.label": slot("label"),
  "field.labelHidden": slot("label--hidden"),
  "field.input": slot("input"),
  "field.textarea": slot("textarea"),
  "field.select": slot("select"),
  "field.checkbox": slot("checkbox"),
  "field.multicheckbox": slot("multicheckbox"),
  "field.button": slot("button"),
  "field.helper": slot("helper"),
  "field.error": slot("error"),
  "field.optionWrapper": slot("option"),
  "field.optionLabel": slot("option-label"),
  "field.optionInput": slot("option-input"),
  "field.phoneWrapper": slot("phone"),
  "field.phoneCountryButton": slot("phone-button"),
  "field.phoneDropdown": slot("phone-dropdown"),
  "field.phoneSearch": slot("phone-search"),
  "field.phoneOption": slot("phone-option"),
  "field.phoneNumberInput": slot("phone-input"),
};
