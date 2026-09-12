import type { OminityDebugChannelInfo } from "../types.js";
import {
  EmptyState,
  Field,
  JsonPanel,
  Panel,
  pillStyle,
  sectionTitleStyle,
  type Palette,
} from "../ui.js";

function ChannelList(props: {
  readonly title: string;
  readonly values: OminityDebugChannelInfo["languages"] | OminityDebugChannelInfo["countries"] | OminityDebugChannelInfo["currencies"] | OminityDebugChannelInfo["locales"];
  readonly palette: Palette;
}) {
  const values = props.values ?? [];

  return (
    <Panel palette={props.palette}>
      <h3 style={sectionTitleStyle(props.palette)}>{props.title}</h3>
      {values.length === 0 ? (
        <EmptyState palette={props.palette}>No {props.title.toLowerCase()} supplied.</EmptyState>
      ) : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "9px" }}>
          {values.map((item, index) => {
            const label = typeof item === "string"
              ? item
              : "label" in item && typeof item.label === "string"
                ? item.label
                : "name" in item && typeof item.name === "string"
                  ? item.name
                  : item.code;
            const suffix = typeof item === "string"
              ? ""
              : [
                  item.default === true ? "default" : "",
                  item.active === false ? "inactive" : "",
                ].filter(Boolean).join(", ");
            return (
              <span key={`${label}-${index}`} style={pillStyle(props.palette, typeof item !== "string" && item.default === true ? "success" : "default")}>
                {label}{suffix ? ` (${suffix})` : ""}
              </span>
            );
          })}
        </div>
      )}
    </Panel>
  );
}

export function ChannelTab(props: {
  readonly palette: Palette;
  readonly channel: OminityDebugChannelInfo | undefined;
}) {
  if (!props.channel) {
    return (
      <EmptyState palette={props.palette}>
        Pass `channel` details into `OminityDebugBar` to inspect the detected or configured Ominity channel.
      </EmptyState>
    );
  }

  return (
    <div style={{ display: "grid", gap: "10px" }}>
      <Panel palette={props.palette}>
        <h3 style={sectionTitleStyle(props.palette)}>Current Channel</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: "10px", marginTop: "10px" }}>
          <Field palette={props.palette} label="Name" value={props.channel.name} />
          <Field palette={props.palette} label="Identifier" value={props.channel.identifier} mono />
          <Field palette={props.palette} label="ID" value={props.channel.id} mono />
          <Field palette={props.palette} label="Source" value={props.channel.source ?? "unknown"} />
          <Field palette={props.palette} label="Active" value={props.channel.active} />
          <Field palette={props.palette} label="Default locale" value={props.channel.defaultLocale} mono />
          <Field palette={props.palette} label="Default language" value={props.channel.defaultLanguageCode} mono />
          <Field palette={props.palette} label="Default country" value={props.channel.defaultCountryCode} mono />
          <Field palette={props.palette} label="Default currency" value={props.channel.defaultCurrencyCode} mono />
        </div>
      </Panel>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "10px" }}>
        <ChannelList title="Locales" values={props.channel.locales} palette={props.palette} />
        <ChannelList title="Languages" values={props.channel.languages} palette={props.palette} />
        <ChannelList title="Countries" values={props.channel.countries} palette={props.palette} />
        <ChannelList title="Currencies" values={props.channel.currencies} palette={props.palette} />
      </div>

      <JsonPanel title="Country currency map" value={props.channel.countryCurrencyMap} palette={props.palette} />
      <JsonPanel title="Channel details" value={props.channel.details} palette={props.palette} />
    </div>
  );
}
