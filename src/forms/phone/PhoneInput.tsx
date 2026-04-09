import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { ChangeEvent } from "react";
import type { FormComponents, PhoneCountry, PhoneFieldValue } from "../types.js";
import { PHONE_COUNTRIES } from "./countries.js";
import {
  findCountryByDialCode,
  formatToE164,
  getFlagEmoji,
  sanitizePhoneNumber,
  stripTrunkPrefix,
} from "../utils/phone.js";

const normalizeText = (value: string): string => {
  try {
    return value
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLowerCase();
  } catch {
    return value.toLowerCase();
  }
};

export interface PhoneInputProps {
  value: PhoneFieldValue | null;
  onChange: (value: PhoneFieldValue | null) => void;
  countries?: PhoneCountry[] | undefined;
  defaultCountry?: string | undefined;
  placeholder?: string | undefined;
  searchPlaceholder?: string | undefined;
  noMatchesLabel?: string | undefined;
  disabled?: boolean | undefined;
  slotClasses: {
    control: string;
    countryButton: string;
    dropdown: string;
    searchInput: string;
    option: string;
    numberInput: string;
  };
  components?: FormComponents | undefined;
}

const OPTION_LIST_STYLE: CSSProperties = {
  maxHeight: "var(--ominity-phone-dropdown-max-height, 16rem)",
  overflowY: "auto",
};

const PhoneInput = (props: PhoneInputProps) => {
  const {
    value,
    onChange,
    countries,
    defaultCountry,
    placeholder = "Phone number",
    searchPlaceholder = "Search country",
    noMatchesLabel = "No matches",
    disabled = false,
    slotClasses,
  } = props;

  const [search, setSearch] = useState("");
  const [inputValue, setInputValue] = useState(value?.nationalNumber ?? "");
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const skipSyncRef = useRef(false);
  const dropdownId = useId();

  // ✅ Deterministic country source
  const availableCountries = useMemo(
    () => (countries?.length ? countries : PHONE_COUNTRIES),
    [countries],
  );

  const filteredCountries = useMemo(() => {
    const trimmedSearch = search.trim();
    if (!trimmedSearch) {
      return availableCountries;
    }

    const normalizedQuery = normalizeText(trimmedSearch);
    const numericQuery = trimmedSearch.replace(/\D/g, "");

    return availableCountries.filter((country) => {
      const matchesName = normalizeText(country.name).includes(normalizedQuery);
      const matchesCode = normalizeText(country.code).includes(normalizedQuery);
      const matchesDial =
        numericQuery.length > 0
          ? country.dialCode.includes(numericQuery)
          : false;

      return matchesName || matchesCode || matchesDial;
    });
  }, [availableCountries, search]);

  const defaultCountryEntry = useMemo(() => {
    if (!defaultCountry) {
      return null;
    }
    const normalized = defaultCountry.toUpperCase();
    return (
      availableCountries.find((country) => country.code === normalized) ?? null
    );
  }, [availableCountries, defaultCountry]);

  const fallbackCountry = useMemo(
    () => defaultCountryEntry ?? availableCountries[0] ?? null,
    [availableCountries, defaultCountryEntry],
  );

  const selectedCountry = useMemo(() => {
    if (value?.countryCode) {
      const normalized = value.countryCode.toUpperCase();
      return (
        availableCountries.find((country) => country.code === normalized) ??
        fallbackCountry
      );
    }
    return fallbackCountry;
  }, [availableCountries, fallbackCountry, value?.countryCode]);

  useEffect(() => {
    if (skipSyncRef.current) {
      skipSyncRef.current = false;
      return;
    }
    setInputValue(value?.nationalNumber ?? "");
  }, [value?.nationalNumber]);

  const handleCountrySelect = (country: PhoneCountry | null) => {
    if (!country) {
      onChange(null);
      return;
    }

    const nationalNumber = value?.nationalNumber ?? "";

    onChange({
      countryCode: country.code,
      dialCode: country.dialCode,
      nationalNumber,
      e164: formatToE164(country.dialCode, nationalNumber),
    });
  };

  const handleNumberChange = (event: ChangeEvent<HTMLInputElement>) => {
    const rawValue = event.target.value.replace(/[^\d+]/g, "");
    let nextDisplay = rawValue;
    let digits = sanitizePhoneNumber(rawValue);
    const trimmed = rawValue.trim();

    let nextCountry = selectedCountry ?? fallbackCountry;

    if (trimmed.startsWith("+")) {
      const match = findCountryByDialCode(availableCountries, digits);
      if (match) {
        nextCountry = match;
        digits = digits.slice(match.dialCode.length);
        nextDisplay = digits;
      }
    } else if (/^00/.test(trimmed)) {
      const withoutPrefix = digits.replace(/^00/, "");
      const match = findCountryByDialCode(availableCountries, withoutPrefix);
      if (match) {
        nextCountry = match;
        digits = withoutPrefix.slice(match.dialCode.length);
        nextDisplay = digits;
      } else {
        digits = withoutPrefix;
      }
    } else {
      nextDisplay = digits;
    }

    if (!nextCountry) {
      onChange(null);
      skipSyncRef.current = true;
      setInputValue(nextDisplay);
      return;
    }

    const normalizedNational = stripTrunkPrefix(digits, nextCountry.code);

    skipSyncRef.current = true;
    setInputValue(nextDisplay);

    onChange({
      countryCode: nextCountry.code,
      dialCode: nextCountry.dialCode,
      nationalNumber: normalizedNational,
      e164: formatToE164(nextCountry.dialCode, normalizedNational),
    });
  };

  const closeDropdown = () => setIsDropdownOpen(false);

  const toggleDropdown = () => {
    if (!disabled) {
      setIsDropdownOpen((prev) => !prev);
    }
  };

  useEffect(() => {
    if (!isDropdownOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        closeDropdown();
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeDropdown();
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isDropdownOpen]);

  useEffect(() => {
    if (isDropdownOpen) {
      requestAnimationFrame(() => searchInputRef.current?.focus());
    } else {
      setSearch("");
    }
  }, [isDropdownOpen]);

  useEffect(() => {
    if (disabled && isDropdownOpen) {
      closeDropdown();
    }
  }, [disabled, isDropdownOpen]);

  const dialCodeDisplay = selectedCountry
    ? `+${selectedCountry.dialCode}`
    : "+";

  const flagDisplay = selectedCountry
    ? selectedCountry.flag || getFlagEmoji(selectedCountry.code)
    : "🌐";

  return (
    <div className={slotClasses.control} ref={containerRef}>
      <button
        type="button"
        className={slotClasses.countryButton}
        onClick={toggleDropdown}
        aria-haspopup="listbox"
        aria-expanded={isDropdownOpen}
        aria-controls={dropdownId}
        disabled={disabled}
      >
        <span aria-hidden="true">{flagDisplay}</span>
        <span>{dialCodeDisplay}</span>
        <ChevronDownIcon />
      </button>

      <input
        type="tel"
        placeholder={placeholder}
        value={inputValue}
        onChange={handleNumberChange}
        disabled={disabled}
        inputMode="tel"
        autoComplete="tel"
        className={slotClasses.numberInput}
      />

      <div className={slotClasses.dropdown} hidden={!isDropdownOpen}>
        <input
          ref={searchInputRef}
          type="search"
          value={search}
          onChange={(event: ChangeEvent<HTMLInputElement>) => setSearch(event.target.value)}
          placeholder={searchPlaceholder}
          className={slotClasses.searchInput}
          disabled={disabled}
        />

        <div role="listbox" id={dropdownId} style={OPTION_LIST_STYLE}>
          {filteredCountries.length ? (
            filteredCountries.map((country) => {
              const isSelected = selectedCountry?.code === country.code;

              return (
                <button
                  key={country.code}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  className={slotClasses.option}
                  onClick={() => {
                    handleCountrySelect(country);
                    closeDropdown();
                  }}
                  disabled={disabled}
                >
                  <span>
                    {country.flag || getFlagEmoji(country.code)} {country.name}
                  </span>
                  <span>+{country.dialCode}</span>
                </button>
              );
            })
          ) : (
            <div className={slotClasses.option}>{noMatchesLabel}</div>
          )}
        </div>
      </div>
    </div>
  );
};

const ChevronDownIcon = () => (
  <svg viewBox="0 0 20 20" width="16" height="16">
    <path
      d="M5 7.5 10 12l5-4.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export default PhoneInput;
