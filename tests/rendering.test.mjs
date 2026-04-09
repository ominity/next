import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import { createCmsRegistry, createCmsRenderer, defineCmsComponent } from "../dist/rendering/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function readFixture(name) {
  const fixturePath = path.join(__dirname, "fixtures", name);
  const raw = await readFile(fixturePath, "utf-8");
  return JSON.parse(raw);
}

function isElementLike(value) {
  return typeof value === "object" && value !== null && "type" in value && "props" in value;
}

test("renderer resolves nested component fields", async () => {
  const page = await readFixture("page.fixture.json");

  const Hero = ({ component, renderer }) => ({
    kind: "hero",
    button: renderer.render(component.fields.button),
  });
  const Button = ({ component }) => ({
    kind: "button",
    label: component.fields.label,
  });
  const Text = ({ component }) => ({
    kind: "text",
    content: component.fields.content,
  });

  const registry = createCmsRegistry([
    defineCmsComponent("hero", Hero),
    defineCmsComponent("button", Button),
    defineCmsComponent("text", Text),
  ]);

  const renderer = createCmsRenderer({
    registry,
    context: {
      page,
      locale: page.locale,
      path: page.path,
      preview: false,
      debug: false,
    },
  });

  const heroComponent = page.components[0];
  const heroElement = renderer.renderComponent(heroComponent);
  assert.equal(isElementLike(heroElement), true);

  const heroResult = heroElement.type(heroElement.props);
  assert.equal(heroResult.kind, "hero");
  assert.equal(isElementLike(heroResult.button), true);

  const nestedButton = heroResult.button.type(heroResult.button.props);
  assert.deepEqual(nestedButton, {
    kind: "button",
    label: "Talk to us",
  });
});

test("renderer resolves direct children", async () => {
  const page = await readFixture("page.fixture.json");

  const Hero = ({ component, renderer }) => ({
    children: renderer.renderChildren(component),
  });
  const Text = ({ component }) => ({
    kind: "text",
    content: component.fields.content,
  });

  const registry = createCmsRegistry([
    defineCmsComponent("hero", Hero),
    defineCmsComponent("text", Text),
  ]);

  const renderer = createCmsRenderer({
    registry,
    context: {
      page,
      locale: page.locale,
      path: page.path,
      preview: false,
      debug: false,
    },
  });

  const heroResult = renderer.renderComponent(page.components[0]).type(
    renderer.renderComponent(page.components[0]).props,
  );

  const childElement = Array.isArray(heroResult.children)
    ? heroResult.children[0]
    : heroResult.children;

  assert.equal(isElementLike(childElement), true);
  const child = childElement.type(childElement.props);

  assert.deepEqual(child, {
    kind: "text",
    content: "Nested child content",
  });
});

