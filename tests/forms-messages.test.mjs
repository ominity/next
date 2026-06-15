import assert from "node:assert/strict";
import { test } from "node:test";

import {
  formatFormMessage,
  resolveDefaultFormMessages,
  resolveFormMessages,
} from "../dist/forms/index.js";

test("resolveDefaultFormMessages uses the locale language", () => {
  const messages = resolveDefaultFormMessages("nl-BE");

  assert.equal(messages.validation.required, "{field} is verplicht.");
  assert.equal(messages.status.submitUnavailable, "Het formulier kan niet verzonden worden.");
});

test("resolveFormMessages merges locale defaults with overrides", () => {
  const messages = resolveFormMessages("fr-BE", {
    validation: {
      phone: "Numero invalide.",
    },
  });

  assert.equal(messages.validation.phone, "Numero invalide.");
  assert.equal(messages.validation.email, "Saisissez une adresse e-mail valide.");
});

test("formatFormMessage replaces supported template tokens", () => {
  const message = formatFormMessage("{field} must be at least {min} and at most {max}.", {
    field: "Name",
    min: 2,
    max: 12,
  });

  assert.equal(message, "Name must be at least 2 and at most 12.");
});
