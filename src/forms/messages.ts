import { normalizeLocaleCode, parseLocaleCode } from "../cms/index.js";
import type {
  FormMessageOverrides,
  FormMessageTemplateParams,
  FormMessages,
} from "./types.js";

const DEFAULT_FORM_MESSAGES_EN: FormMessages = {
  validation: {
    invalid: "{field} is invalid.",
    required: "{field} is required.",
    minLength: "{field} must be at least {min} characters.",
    maxLength: "{field} must be at most {max} characters.",
    email: "Enter a valid email address.",
    phone: "Enter a valid phone number.",
    recaptcha: "Complete the security check.",
  },
  status: {
    processError: "Unable to process form.",
    submissionBlocked: "Submission blocked.",
    securityUnavailable: "Security check is unavailable.",
    submitFailed: "Something went wrong. Please try again.",
    submitUnavailable: "Unable to submit form.",
  },
  accessibility: {
    honeypotLabel: "Leave this field empty",
  },
};

const DEFAULT_FORM_MESSAGES_NL: FormMessages = {
  validation: {
    invalid: "{field} is ongeldig.",
    required: "{field} is verplicht.",
    minLength: "{field} moet minstens {min} tekens bevatten.",
    maxLength: "{field} mag maximaal {max} tekens bevatten.",
    email: "Voer een geldig e-mailadres in.",
    phone: "Voer een geldig telefoonnummer in.",
    recaptcha: "Voltooi de beveiligingscontrole.",
  },
  status: {
    processError: "Het formulier kan nu niet verwerkt worden.",
    submissionBlocked: "De verzending is geblokkeerd.",
    securityUnavailable: "De beveiligingscontrole is niet beschikbaar.",
    submitFailed: "Er is iets misgegaan. Probeer het opnieuw.",
    submitUnavailable: "Het formulier kan niet verzonden worden.",
  },
  accessibility: {
    honeypotLabel: "Laat dit veld leeg",
  },
};

const DEFAULT_FORM_MESSAGES_FR: FormMessages = {
  validation: {
    invalid: "{field} n'est pas valide.",
    required: "{field} est requis.",
    minLength: "{field} doit contenir au moins {min} caracteres.",
    maxLength: "{field} doit contenir au maximum {max} caracteres.",
    email: "Saisissez une adresse e-mail valide.",
    phone: "Saisissez un numero de telephone valide.",
    recaptcha: "Completez la verification de securite.",
  },
  status: {
    processError: "Impossible de traiter le formulaire pour le moment.",
    submissionBlocked: "L'envoi a ete bloque.",
    securityUnavailable: "La verification de securite est indisponible.",
    submitFailed: "Une erreur s'est produite. Veuillez reessayer.",
    submitUnavailable: "Impossible d'envoyer le formulaire.",
  },
  accessibility: {
    honeypotLabel: "Laissez ce champ vide",
  },
};

const DEFAULT_FORM_MESSAGES_BY_LANGUAGE: Readonly<Record<string, FormMessages>> = {
  en: DEFAULT_FORM_MESSAGES_EN,
  nl: DEFAULT_FORM_MESSAGES_NL,
  fr: DEFAULT_FORM_MESSAGES_FR,
};

function replaceTemplateToken(
  template: string,
  key: keyof FormMessageTemplateParams,
  value: string | number | undefined,
): string {
  const normalized = typeof value === "number" ? `${value}` : value ?? "";
  return template.replaceAll(`{${key}}`, normalized);
}

export function formatFormMessage(
  template: string,
  params: FormMessageTemplateParams = {},
): string {
  return replaceTemplateToken(
    replaceTemplateToken(
      replaceTemplateToken(template, "field", params.field),
      "min",
      params.min,
    ),
    "max",
    params.max,
  );
}

export function resolveDefaultFormMessages(locale?: string): FormMessages {
  const normalizedLocale = normalizeLocaleCode(locale ?? "en");
  const language = parseLocaleCode(normalizedLocale).language;

  return DEFAULT_FORM_MESSAGES_BY_LANGUAGE[language] ?? DEFAULT_FORM_MESSAGES_EN;
}

export function resolveFormMessages(
  locale?: string,
  overrides?: FormMessageOverrides,
): FormMessages {
  const defaults = resolveDefaultFormMessages(locale);

  return {
    validation: {
      ...defaults.validation,
      ...overrides?.validation,
    },
    status: {
      ...defaults.status,
      ...overrides?.status,
    },
    accessibility: {
      ...defaults.accessibility,
      ...overrides?.accessibility,
    },
  };
}
