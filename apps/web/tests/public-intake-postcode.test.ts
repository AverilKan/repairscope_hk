import assert from "node:assert/strict";
import test from "node:test";
import { questionnaireByCategory } from "../data/questionnaires";
import { canContinueQuestionnaireStep, requiredFieldsMissing } from "../domain/rules";

// Hong Kong has no postcode system — the public intake's address step
// (district/estate/block/floor/unit) replaces the UK reference product's
// postcode field entirely (see data/questionnaires.ts's addressStep and
// domain.test.ts's "no UK postcode field anywhere in the schema" test for
// the schema-shape guarantee). This file covers the address step's
// required-field/continuation behaviour specifically.

const schema = questionnaireByCategory.leak;
const addressIndex = schema.steps.findIndex((step) => step.id === "address");

test("district, estate/building, floor and unit are required; block is optional (not every HK building has a block/tower)", () => {
  assert.deepEqual(
    requiredFieldsMissing(schema, addressIndex, {}).sort(),
    ["building", "district", "floor", "unit"].sort(),
  );
  assert.deepEqual(
    requiredFieldsMissing(schema, addressIndex, {
      district: "eastern",
      building: "Kornhill",
      floor: "12",
      unit: "A",
    }),
    [],
  );
});

test("cannot continue past the address step without district/estate/floor/unit, but block alone is not blocking", () => {
  assert.equal(
    canContinueQuestionnaireStep(schema, addressIndex, { block: "Tower 3" }, false),
    false,
  );
  assert.equal(
    canContinueQuestionnaireStep(
      schema,
      addressIndex,
      { district: "eastern", building: "Kornhill", floor: "12", unit: "A" },
      false,
    ),
    true,
  );
});

test("district options cover all three Hong Kong regions (island / Kowloon / New Territories & Islands)", () => {
  const districtField = schema.steps[addressIndex].fields.find((field) => field.id === "district");
  const values = districtField?.options?.map((option) => option.value) ?? [];
  for (const expected of ["central-western", "yau-tsim-mong", "sha-tin", "islands"]) {
    assert.ok(values.includes(expected), `missing district option ${expected}`);
  }
  assert.equal(values.length, 18);
});
