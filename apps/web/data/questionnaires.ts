import type {
  QuestionnaireField,
  QuestionnaireOption,
  QuestionnaireSchema,
  QuestionnaireStep,
  RepairCategoryId,
  SafetyRule,
} from "@/domain/types";

// Bump this whenever a questionnaire's fields, steps or safety rules change
// in a way that matters for how a submitted answer set should be
// interpreted — stored on every RepairSubmission so past submissions remain
// interpretable after the schema evolves.
export const QUESTIONNAIRE_VERSION = "v1";

const option = (
  value: string,
  label: string,
  hint?: string,
): QuestionnaireOption => ({ value, label, hint });

const select = (
  id: string,
  label: string,
  options: QuestionnaireOption[],
  required = true,
  safetyRule?: SafetyRule,
): QuestionnaireField => ({
  id,
  type: "single_select",
  label,
  options,
  required,
  safetyRule,
});

const text = (
  id: string,
  label: string,
  placeholder: string,
  required = true,
  long = false,
): QuestionnaireField => ({
  id,
  type: long ? "long_text" : "short_text",
  label,
  placeholder,
  required,
});

const step = (
  id: string,
  eyebrow: string,
  title: string,
  fields: QuestionnaireField[],
  description?: string,
): QuestionnaireStep => ({ id, eyebrow, title, description, fields });

const gasSafetyRule: SafetyRule = {
  triggerValues: ["yes"],
  title: "Treat a gas smell as an emergency",
  message:
    "Do not use electrical switches or naked flames. Leave the property, keep others away and contact the National Gas Emergency Service on 0800 111 999 from a safe place.",
  acknowledgement:
    "I understand this warning does not confirm the property is safe or replace emergency advice.",
  severity: "stop",
};

const electricalSafetyRule: SafetyRule = {
  triggerValues: ["burning", "sparks", "smoke"],
  title: "Stop using the affected circuit",
  message:
    "If it is safe to do so, switch off the affected circuit at the consumer unit. For active fire or smoke, leave the property and call emergency services.",
  acknowledgement:
    "I understand the normal quote journey must not delay emergency action.",
  severity: "stop",
};

const waterSafetyRule: SafetyRule = {
  triggerValues: ["uncontrolled"],
  title: "Uncontrolled water needs immediate action",
  message:
    "Ask someone at the property to use the stopcock if they can do so safely. Move people away from bulging ceilings and water near electrical fittings.",
  acknowledgement:
    "I understand this warning is not confirmation that the escape has been contained.",
  severity: "urgent",
};

const insecureSafetyRule: SafetyRule = {
  triggerValues: ["insecure"],
  title: "Secure the property first",
  message:
    "If an external door or ground-floor opening cannot be secured, arrange urgent attendance and do not leave an occupant at risk.",
  acknowledgement:
    "I understand the quote request does not secure the property.",
  severity: "urgent",
};

const collapseSafetyRule: SafetyRule = {
  triggerValues: ["yes"],
  title: "Keep clear of the affected area",
  message:
    "A sagging ceiling, falling material or obvious structural movement needs urgent professional assessment. Keep occupants out of the area.",
  acknowledgement:
    "I understand this warning does not confirm the structure is safe.",
  severity: "stop",
};

const photoStep = step(
  "evidence",
  "Evidence",
  "Add anything that helps a contractor understand the problem",
  [
    {
      id: "evidenceNotes",
      type: "long_text",
      label: "Photos, videos, reports or previous quotations",
      help: "Describe any photos, videos, reports or previous quotations you have. RepairScope may ask you to send relevant evidence separately after reviewing the brief.",
      required: false,
    },
  ],
  "Evidence is optional, but clear context can reduce avoidable site visits.",
);

const commonTail: QuestionnaireStep[] = [
  photoStep,
  step("postcode", "Property", "Where is the property?", [
    {
      id: "postcode",
      type: "postcode",
      label: "Property postcode",
      placeholder: "e.g. SE15 4RF",
      required: true,
    },
  ]),
  step("urgency", "Timing", "When does this need attention?", [
    select("urgency", "Urgency", [
      option("emergency", "Today", "Immediate risk or essential service loss"),
      option("urgent", "Within 48 hours", "Urgent, but the situation is stable"),
      option("soon", "This week", "Needs arranging soon"),
      option("routine", "Routine", "Flexible timing"),
    ]),
  ]),
  step("occupancy", "Occupancy", "Who occupies the property?", [
    select("occupancy", "Current occupancy", [
      option("tenant_occupied", "Tenant occupied"),
      option("owner_occupied", "Owner occupied"),
      option("vacant", "Vacant"),
      option("other", "Other"),
    ]),
  ]),
  step("access", "Access", "Who will coordinate contractor access?", [
    select("access", "Access responsibility", [
      option("me", "I will arrange access"),
      option("tenant", "The tenant will arrange access"),
      option("landlord", "The landlord will arrange access"),
      option("other", "Someone else"),
    ]),
  ]),
  step(
    "responsibility",
    "Responsibility",
    "Who is currently expected to be responsible for this repair?",
    [
      select("repairResponsibility", "Current understanding", [
        option("landlord-manager", "Landlord or property manager"),
        option("tenant", "Tenant"),
        option("unclear", "Responsibility is unclear"),
        option("disputed", "Responsibility is disputed"),
        option("other", "Other arrangement"),
      ]),
      text(
        "responsibilityBasis",
        "Basis or supporting notes (optional)",
        "e.g. Landlord reports the tenant damaged the internal door",
        false,
        true,
      ),
    ],
    "This records the current understanding only. RepairScope does not determine legal or contractual responsibility.",
  ),
  step(
    "contact",
    "Your details",
    "Who is managing this repair?",
    [
      select("role", "Your relationship to the property", [
        option("landlord", "Landlord"),
        option("agent", "Letting agent"),
        option("manager", "Property manager"),
        option("other-authorised", "Other authorised representative"),
      ]),
      {
        id: "accountRoleExplanation",
        type: "short_text",
        label: "How are you authorised to manage this repair?",
        help: "A RepairScope operator will review this before contractor sourcing.",
        placeholder: "Briefly explain your authority",
        required: true,
        showWhen: {
          fieldId: "role",
          equals: "other-authorised",
        },
      },
      {
        id: "contactName",
        type: "name",
        label: "Full name",
        placeholder: "e.g. Alex Morgan",
        required: true,
      },
      {
        id: "contactEmail",
        type: "email",
        label: "Email address",
        placeholder: "you@example.com",
        required: true,
      },
      {
        id: "contactPhone",
        type: "phone",
        label: "Phone number",
        help: "Include the area or mobile code.",
        placeholder: "e.g. 07123 456789",
        required: true,
      },
      select("preferredContact", "Preferred notification method", [
        option("email", "Email"),
        option("phone", "Phone"),
        option("either", "Either"),
      ]),
    ],
    "The authorised landlord or manager owns the repair record. These contact details are not shared with contractors from this step.",
  ),
  step(
    "context-consent",
    "Final details",
    "Anything else contractors should know?",
    [
      text(
        "additionalContext",
        "Additional context",
        "Previous visits, tenant constraints, or details that do not fit elsewhere",
        false,
        true,
      ),
      {
        id: "shareConsent",
        type: "checkbox",
        label:
          "I agree RepairScope can share this brief and the selected evidence with invited contractors for this repair.",
        required: true,
      },
    ],
    "You will review the exact contractor brief before anything is submitted.",
  ),
];

const withTail = (
  category: RepairCategoryId,
  label: string,
  shortLabel: string,
  description: string,
  categorySteps: QuestionnaireStep[],
): QuestionnaireSchema => ({
  category,
  label,
  shortLabel,
  description,
  steps: [...categorySteps, ...commonTail],
  version: 4,
});

export const questionnaireSchemas: QuestionnaireSchema[] = [
  withTail(
    "boiler-heating",
    "Boiler / heating",
    "Heating",
    "No heat, no hot water, pressure changes, leaks or unusual boiler behaviour.",
    [
      step(
        "boiler-gas-safety",
        "Safety check",
        "Can anyone at the property smell gas now?",
        [
          select(
            "gasSmell",
            "Gas smell",
            [option("yes", "Yes"), option("no", "No")],
            true,
            gasSafetyRule,
          ),
        ],
        "This answer is never suggested or filled in automatically.",
      ),
      step("boiler-symptom", "Problem", "What is the boiler doing?", [
        select("boilerSymptom", "Main symptom", [
          option("no-heating", "No heating"),
          option("no-hot-water", "No hot water"),
          option("neither", "No heating or hot water"),
          option("pressure", "Pressure keeps changing"),
          option("leak", "Water is leaking"),
          option("pilot", "Pilot light will not stay on"),
          option("noise", "Unusual noise"),
          option("other", "Something else"),
        ]),
      ]),
      step("boiler-identity", "Equipment", "What do you know about the boiler?", [
        text(
          "boilerMakeModel",
          "Make and model",
          "e.g. Worcester Greenstar 30i",
          false,
        ),
        {
          id: "boilerProfile",
          type: "grouped_select",
          label: "Age and service history",
          required: true,
          groups: [
            {
              id: "age",
              label: "Approximate age",
              options: [
                option("under-5", "Under 5 years"),
                option("5-10", "5–10 years"),
                option("over-10", "Over 10 years"),
                option("unknown", "Not known"),
              ],
            },
            {
              id: "service",
              label: "Last service",
              options: [
                option("under-12m", "Within 12 months"),
                option("over-12m", "More than 12 months ago"),
                option("never-unknown", "Never or not known"),
              ],
            },
          ],
        },
      ]),
      step("boiler-type", "System", "What kind of boiler is installed?", [
        select("boilerType", "Boiler type", [
          option("combi", "Combi"),
          option("system", "System"),
          option("conventional", "Conventional"),
          option("unknown", "Not known"),
        ]),
      ]),
    ],
  ),
  withTail(
    "plumbing-leak",
    "Plumbing / leak",
    "Plumbing",
    "Leaks, drips, blocked drains, taps, toilets and water supply problems.",
    [
      step("plumbing-location", "Location", "Where is the problem?", [
        select("plumbingLocation", "Affected area", [
          option("kitchen", "Kitchen"),
          option("bathroom", "Bathroom"),
          option("toilet", "WC"),
          option("heating", "Boiler or heating pipework"),
          option("outside", "Outside"),
          option("other", "Somewhere else"),
        ]),
      ]),
      step(
        "plumbing-flow",
        "Water escape",
        "What is the water doing now?",
        [
          select(
            "waterFlow",
            "Current flow",
            [
              option("uncontrolled", "Flowing and not contained"),
              option("active-contained", "Flowing but contained"),
              option("slow-drip", "Slow drip"),
              option("stain-only", "Staining only"),
              option("stopped", "It has stopped"),
            ],
            true,
            waterSafetyRule,
          ),
        ],
      ),
      step("plumbing-shutoff", "Containment", "Has the water supply been isolated?", [
        select("waterIsolated", "Water supply", [
          option("yes", "Yes"),
          option("no", "No"),
          option("unknown", "Not sure"),
        ]),
      ]),
      step("plumbing-damage", "Impact", "Has anything else been damaged?", [
        select("secondaryDamage", "Related damage", [
          option("yes", "Yes"),
          option("no", "No"),
          option("unknown", "Not sure"),
        ]),
        text(
          "damageDetails",
          "Damage details",
          "Ceiling, flooring, cabinets or a neighbouring property",
          false,
          true,
        ),
      ]),
    ],
  ),
  withTail(
    "electrical",
    "Electrical",
    "Electrical",
    "Power loss, faulty sockets, lighting, tripping, smells or sparks.",
    [
      step("electrical-issue", "Problem", "What is happening?", [
        select(
          "electricalIssue",
          "Electrical issue",
          [
            option("whole-power", "No power to the whole property"),
            option("partial-power", "No power in one area"),
            option("sockets", "Sockets are not working"),
            option("flickering", "Lights are flickering"),
            option("tripping", "Circuit breaker keeps tripping"),
            option("burning", "Burning smell"),
            option("sparks", "Sparks"),
            option("smoke", "Smoke"),
            option("appliance", "Possible appliance fault"),
            option("other", "Something else"),
          ],
          true,
          electricalSafetyRule,
        ),
      ]),
      step("electrical-scale", "Extent", "How much of the property is affected?", [
        select("electricalCount", "Affected fittings or area", [
          option("one", "One fitting"),
          option("two-three", "2–3 fittings"),
          option("four-plus", "4 or more"),
          option("room", "A whole room or area"),
          option("property", "The whole property"),
          option("unknown", "Not sure"),
        ]),
      ]),
      step("electrical-onset", "Timing", "When did this begin?", [
        select("electricalOnset", "First noticed", [
          option("today", "Today"),
          option("yesterday", "Yesterday"),
          option("week", "Earlier this week"),
          option("older", "More than a week ago"),
          option("unknown", "Not sure"),
        ]),
      ]),
      step(
        "electrical-access",
        "Access",
        "Can a contractor reach the consumer unit?",
        [
          select("consumerUnitAccess", "Consumer unit access", [
            option("yes", "Yes"),
            option("no", "No"),
            option("unknown", "Not sure"),
          ]),
        ],
      ),
    ],
  ),
  withTail(
    "painting-decorating",
    "Painting / decorating",
    "Decorating",
    "Room decoration, whole-property refreshes, exterior work and touch-ups.",
    [
      step("painting-scope", "Scope", "How much needs decorating?", [
        select("paintingScope", "Area", [
          option("one-room", "One room"),
          option("multiple", "Several rooms"),
          option("whole", "Whole property"),
          option("exterior", "Exterior"),
          option("touchups", "Touch-ups only"),
        ]),
      ]),
      step("painting-size", "Scale", "Roughly how large is the area?", [
        select("roomSize", "Room size", [
          option("small", "Small — under 10m²"),
          option("standard", "Standard — 10–18m²"),
          option("large", "Large — over 18m²"),
          option("mixed", "A mix of sizes"),
          option("unknown", "Not sure"),
        ]),
      ]),
      step("painting-prep", "Preparation", "Is repair work needed before painting?", [
        select("makeGood", "Filling or plaster repair", [
          option("yes", "Yes"),
          option("no", "No"),
          option("unknown", "Not sure"),
        ]),
      ]),
      step("painting-finish", "Finish", "What has been decided about the finish?", [
        select("colourDecision", "Colour", [
          option("same", "Match the existing colour"),
          option("decided", "A new colour is chosen"),
          option("advice", "Recommendations needed"),
          option("undecided", "Not decided"),
        ]),
        select("paintSupply", "Paint supply", [
          option("contractor", "Contractor to supply"),
          option("landlord", "I will supply"),
          option("unknown", "Not decided"),
        ]),
      ]),
    ],
  ),
  withTail(
    "roofing",
    "Roofing",
    "Roofing",
    "Leaks, tiles, flashing, gutters, chimneys and flat-roof problems.",
    [
      step("roofing-issue", "Problem", "What has been reported?", [
        select("roofingIssue", "Roof issue", [
          option("leak", "Leak"),
          option("tiles", "Missing or damaged tiles"),
          option("flashing", "Damaged flashing"),
          option("gutters", "Gutters"),
          option("chimney", "Chimney"),
          option("flat-roof", "Flat roof"),
          option("replacement", "Possible full replacement"),
          option("other", "Something else"),
        ]),
      ]),
      step("roofing-type", "Roof", "What kind of roof is it?", [
        select("roofType", "Roof type", [
          option("pitched", "Pitched"),
          option("flat", "Flat"),
          option("mixed", "Mixed"),
          option("unknown", "Not known"),
        ]),
      ]),
      step("roofing-access", "Access", "What will a contractor need to plan for?", [
        select("storeys", "Property height", [
          option("one", "One storey"),
          option("two", "Two storeys"),
          option("three-plus", "Three or more"),
        ]),
        select("internalRoofAccess", "Loft or upstairs access", [
          option("yes", "Likely needed"),
          option("no", "Not needed"),
          option("unknown", "Not sure"),
        ]),
      ]),
      step(
        "roofing-structure",
        "Safety check",
        "Is there a sagging ceiling, falling material or visible movement?",
        [
          select(
            "collapseRisk",
            "Visible risk",
            [option("yes", "Yes"), option("no", "No"), option("unknown", "Not sure")],
            true,
            collapseSafetyRule,
          ),
        ],
      ),
    ],
  ),
  withTail(
    "damp-mould",
    "Damp / mould",
    "Damp & mould",
    "Visible mould, staining, condensation or suspected penetrating or rising damp.",
    [
      step("damp-location", "Location", "Where is it visible?", [
        select("dampLocation", "Affected area", [
          option("one-wall", "One wall"),
          option("multiple-walls", "Several walls"),
          option("ceiling", "Ceiling"),
          option("windows", "Around windows"),
          option("furniture", "Behind furniture"),
          option("bathroom", "Bathroom"),
          option("whole", "Across the property"),
        ]),
      ]),
      step("damp-size", "Extent", "How large is the affected area?", [
        select("dampSize", "Approximate area", [
          option("under-1", "Under 1m²"),
          option("one-four", "1–4m²"),
          option("over-four", "Over 4m²"),
        ]),
      ]),
      step("damp-duration", "Timing", "How long has it been present?", [
        select("dampDuration", "Duration", [
          option("under-month", "Under one month"),
          option("one-six", "1–6 months"),
          option("over-six", "More than 6 months"),
          option("unknown", "Not known"),
        ]),
      ]),
      step("damp-type", "What is known", "Has anyone suggested a type of damp?", [
        select("suspectedDampType", "Suspected type", [
          option("mould", "Black mould"),
          option("penetrating", "Penetrating damp"),
          option("rising", "Rising damp"),
          option("condensation", "Condensation"),
          option("unknown", "No diagnosis"),
        ]),
        select("ventilation", "Ventilation in the affected room", [
          option("working", "Working extractor or vents"),
          option("limited", "Limited ventilation"),
          option("none", "No known ventilation"),
          option("unknown", "Not sure"),
        ]),
      ]),
    ],
  ),
  withTail(
    "windows-doors",
    "Windows / doors",
    "Windows & doors",
    "Broken glass, locks, draughts, damaged frames or openings that will not close.",
    [
      step("windows-unit", "Unit", "What is affected?", [
        select("unitType", "Unit type", [
          option("window", "Window"),
          option("external-door", "External door"),
          option("internal-door", "Internal door"),
          option("patio", "Patio or French door"),
          option("other", "Something else"),
        ]),
      ]),
      step("windows-material", "Material", "What is it made from?", [
        select("unitMaterial", "Material", [
          option("upvc", "uPVC"),
          option("wood", "Wood"),
          option("aluminium", "Aluminium"),
          option("composite", "Composite"),
          option("unknown", "Not known"),
        ]),
      ]),
      step("windows-problem", "Problem", "What is wrong with it?", [
        select(
          "unitProblem",
          "Problem",
          [
            option("operation", "Will not open or close"),
            option("glass", "Broken glass"),
            option("lock", "Lock problem"),
            option("draught", "Draught"),
            option("misted", "Misted double-glazed unit"),
            option("frame", "Damaged frame"),
            option("replacement", "Needs replacing"),
            option("insecure", "Property cannot be secured"),
          ],
          true,
          insecureSafetyRule,
        ),
      ]),
      step("windows-count", "Scale", "How many units are affected?", [
        {
          id: "unitCount",
          type: "number",
          label: "Number of units",
          required: true,
        },
      ]),
    ],
  ),
  withTail(
    "safety-compliance",
    "Safety / compliance certificates",
    "Certificates",
    "CP12, EICR, EPC, PAT, Legionella and fire-risk assessment work.",
    [
      step("compliance-type", "Assessment", "What do you need arranged?", [
        select("certificateType", "Certificate or assessment", [
          option("cp12", "Gas Safety Record — CP12"),
          option("eicr", "Electrical Installation Condition Report — EICR"),
          option("epc", "Energy Performance Certificate — EPC"),
          option("pat", "Portable appliance testing — PAT"),
          option("legionella", "Legionella risk assessment"),
          option("fire", "Fire risk assessment"),
        ]),
      ]),
      step("compliance-timing", "Timing", "What is the current certificate status?", [
        select("certificateTiming", "Status", [
          option("renewal", "Renewal"),
          option("first", "First assessment"),
          option("expired", "Already expired"),
          option("unknown", "Not sure"),
        ]),
      ]),
      step("compliance-property", "Property", "What is the assessment scope?", [
        select("propertyScope", "Property scope", [
          option("single", "Single dwelling"),
          option("hmo", "HMO"),
          option("block", "Block or several units"),
          option("commercial", "Commercial property"),
        ]),
      ]),
      step("compliance-existing", "Records", "Describe the current certificate if available", [
        {
          id: "existingCertificateNotes",
          type: "long_text",
          label: "Existing certificate",
          help: "Describe the certificate you have (type, date, issuing engineer). RepairScope may ask you to send it separately after reviewing the brief.",
          required: false,
        },
      ]),
    ],
  ),
  withTail(
    "general-maintenance",
    "General maintenance",
    "Maintenance",
    "Carpentry, tiling, plastering, handyperson tasks and repairs that do not fit elsewhere.",
    [
      step("general-description", "Task", "What needs doing?", [
        text(
          "generalDescription",
          "Describe the task",
          "e.g. refit a loose cupboard hinge and repair the surrounding timber",
          true,
          true,
        ),
      ]),
      step("general-size", "Scale", "How large does the job appear?", [
        select("jobSize", "Likely time", [
          option("under-hour", "Under one hour"),
          option("half-day", "Half day"),
          option("full-day", "Full day"),
          option("multi-day", "Several days"),
          option("unknown", "Not sure"),
        ]),
      ]),
      step("general-materials", "Materials", "Are materials already available?", [
        select("materialsStatus", "Materials", [
          option("available", "Already at the property"),
          option("source", "Contractor should source them"),
          option("some", "Some are available"),
          option("unknown", "Not sure"),
        ]),
      ]),
      step(
        "general-safety",
        "Safety check",
        "Is there any immediate danger or possible structural movement?",
        [
          select(
            "structuralDanger",
            "Immediate danger",
            [option("yes", "Yes"), option("no", "No"), option("unknown", "Not sure")],
            true,
            collapseSafetyRule,
          ),
        ],
      ),
    ],
  ),
  withTail(
    "existing-quote",
    "Upload an existing quote",
    "Existing quote",
    "Add a contractor or letting-agent quote for review and comparison.",
    [
      step("upload-intent", "Purpose", "What would you like to do with this quote?", [
        select("uploadIntent", "Purpose", [
          option("understand", "Understand the scope and price"),
          option("compare", "Add it to a proposal comparison"),
          option("both", "Both"),
        ]),
      ]),
      step("upload-trade", "Trade", "What kind of work is quoted?", [
        select(
          "uploadTrade",
          "Trade",
          [
            option("boiler-heating", "Boiler / heating"),
            option("plumbing-leak", "Plumbing / leak"),
            option("electrical", "Electrical"),
            option("painting-decorating", "Painting / decorating"),
            option("roofing", "Roofing"),
            option("damp-mould", "Damp / mould"),
            option("windows-doors", "Windows / doors"),
            option("safety-compliance", "Safety / compliance"),
            option("general-maintenance", "General maintenance"),
          ],
        ),
      ]),
      step("upload-concern", "Focus", "What needs the closest review?", [
        select("uploadConcern", "Main concern", [
          option("price", "Price"),
          option("scope", "What is included"),
          option("quality", "Proposed approach"),
          option("timing", "Timing or availability"),
          option("none", "No specific concern"),
          option("other", "Something else"),
        ]),
      ]),
      step(
        "upload-document",
        "Document",
        "Describe the quote you already have",
        [
          {
            id: "quoteDocumentNotes",
            type: "long_text",
            label: "Quote details",
            help: "Describe the quote: contractor name, price, scope and date. RepairScope may ask you to send the document separately after reviewing the brief.",
            required: true,
          },
          select("quoteSource", "Where did it come from?", [
            option("agent_quote", "Letting agent"),
            option("landlord_upload", "My contractor"),
            option("email_import", "Forwarded email"),
            option("operator_entry", "Entered on my behalf"),
          ]),
        ],
        "RepairScope keeps the original document attached to the normalised proposal.",
      ),
    ],
  ),
];

export const questionnaireByCategory = Object.fromEntries(
  questionnaireSchemas.map((schema) => [schema.category, schema]),
) as Record<RepairCategoryId, QuestionnaireSchema>;

export const categoryCards = questionnaireSchemas.map(
  ({ category, label, description }) => ({ category, label, description }),
);
