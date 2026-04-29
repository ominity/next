# Debugging and Troubleshooting

## Enable client debug logs

```ts
const client = createCmsClient({
  sdk: { /* ... */ },
  debug: {
    enabled: true,
  },
});
```

Debug logs include endpoint, query payload, and normalization milestones.

## Common issues

### Missing component output

Cause: CMS component key is not registered.

Fix:

- verify registry keys match CMS keys exactly
- set renderer `missingComponent: "throw"` during development

### Nested field not rendering

Cause: value is a plain object without nested CMS component markers.

Fix:

- inspect normalized page payload
- ensure nested component values are delivered as `page_content_component` or component-like payloads

### Wrong canonical redirect

Cause: route strategy or locale list mismatch.

Fix:

- verify `localeSegmentStrategy`
- verify locale codes (`nl-BE` vs `nl-be`)
- verify route translation map contains expected localized slug

### Metadata alternates incomplete

Cause: translation paths missing on page model.

Fix:

- ensure `CmsPage.translations` is filled by your CMS endpoint/normalizer
- set `includeAlternates: true`

### Forms do not submit

Cause: missing submit route or missing API credentials.

Fix:

- verify `/api/forms/submit` route is wired with `createOminityFormSubmitHandler`
- verify `OMINITY_API_KEY` / API base URL env vars
- if using reCAPTCHA, verify secret and client site key pairing

### Forms render but custom UI is ignored

Cause: component overrides not passed correctly.

Fix:

- map overrides with `createShadcnFormComponents`
- pass the result via `components` prop on `FormRenderer`
- ensure prop signatures are compatible with standard HTML input props

### Auth session cookie cannot be read

Cause: signed cookie secret mismatch or missing `sessionSecret`.

Fix:

- use the same `sessionSecret` for both write/read paths
- ensure secret length is at least 32 characters
- if using unsigned cookies for local testing, set `allowUnsigned: true` explicitly

### OAuth2 or MFA calls fail unexpectedly

Cause: wrong API credentials, channel, or auth context for protected endpoints.

Fix:

- verify SDK `security` configuration (API key / bearer security)
- verify endpoint context (`/oauth2/*` vs `/users/*`)
- enable auth debug logs on `createAuthClient({ debug: { enabled: true } })`

## Typed errors

Primary error classes:

- `CmsClientError`
- `CmsNormalizationError`
- `CmsRouteResolutionError`
- `CmsRegistryError`
- `CmsRenderError`
- `AuthClientError`

All include consistent `code` values for observability and alerting.
