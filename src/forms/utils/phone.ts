import type { PhoneCountry } from "../types.js";

export const sanitizePhoneNumber = (value: string): string =>
  value.replace(/[^0-9]/g, "");

export const formatToE164 = (
  dialCode: string,
  nationalNumber: string,
): string | null => {
  const dial = sanitizePhoneNumber(dialCode);
  const local = sanitizePhoneNumber(nationalNumber);

  if (!dial || !local) {
    return null;
  }

  return `+${dial}${local}`;
};

export const getFlagEmoji = (countryCode?: string): string => {
  if (!countryCode) {
    return "";
  }

  return countryCode
    .toUpperCase()
    .split("")
    .map((char) => char.codePointAt(0) ?? 0)
    .map((code) => 127397 + code)
    .map((codePoint) => String.fromCodePoint(codePoint))
    .join("");
};

const TRUNK_PREFIX_COUNTRIES = new Set<string>([
  "AL",
  "DZ",
  "AR",
  "AT",
  "AU",
  "BE",
  "BG",
  "BO",
  "BR",
  "BY",
  "CH",
  "CL",
  "CN",
  "CO",
  "CZ",
  "DE",
  "DK",
  "DO",
  "DZ",
  "EC",
  "EE",
  "EG",
  "ES",
  "FI",
  "FR",
  "GB",
  "GR",
  "HR",
  "HU",
  "ID",
  "IE",
  "IL",
  "IN",
  "IT",
  "JP",
  "KR",
  "LT",
  "LU",
  "LV",
  "MA",
  "MX",
  "MY",
  "NL",
  "NO",
  "NZ",
  "PE",
  "PH",
  "PK",
  "PL",
  "PT",
  "RO",
  "RS",
  "RU",
  "SE",
  "SI",
  "SK",
  "TH",
  "TR",
  "UA",
  "UY",
  "VE",
  "VN",
  "ZA",
]);

export const stripTrunkPrefix = (
  nationalNumber: string,
  countryCode?: string,
): string => {
  if (!nationalNumber) {
    return "";
  }

  if (countryCode && TRUNK_PREFIX_COUNTRIES.has(countryCode.toUpperCase())) {
    if (nationalNumber.startsWith("0")) {
      return nationalNumber.slice(1);
    }
  }

  return nationalNumber;
};

export const findCountryByDialCode = (
  countries: PhoneCountry[],
  digits: string,
): PhoneCountry | null => {
  if (!digits) {
    return null;
  }

  let match: PhoneCountry | null = null;
  countries.forEach((country) => {
    if (digits.startsWith(country.dialCode)) {
      if (!match || country.dialCode.length > match.dialCode.length) {
        match = country;
      }
    }
  });
  return match;
};
