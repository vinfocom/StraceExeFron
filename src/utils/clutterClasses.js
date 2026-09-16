export const CLUTTER_CLASS_DEFINITIONS = Object.freeze([
  { name: "Dense Urban", color: [179, 38, 30] },
  { name: "Urban", color: [224, 138, 43] },
  { name: "Suburban", color: [216, 182, 86] },
  { name: "Water", color: [42, 111, 189] },
  { name: "Vegetation", color: [63, 143, 92] },
  { name: "Rural/Open", color: [201, 194, 179] },
]);

const CLASS_BY_KEY = new Map(
  CLUTTER_CLASS_DEFINITIONS.map((definition) => [
    definition.name.toLowerCase().replace(/[^a-z0-9]/g, ""),
    definition,
  ]),
);

export const normalizeClutterClass = (clutterClass, landCoverClass = null) => {
  const raw = String(clutterClass || landCoverClass || "").trim();
  const value = raw.toLowerCase();
  const key = value.replace(/[^a-z0-9]/g, "");
  if (!key) return "Unclassified";
  if (CLASS_BY_KEY.has(key)) return CLASS_BY_KEY.get(key).name;
  if (key.includes("denseurban") || value.includes("high density")) return "Dense Urban";
  if (key.includes("suburban") || key.includes("periurban")) return "Suburban";
  if (/water|river|lake|sea/.test(value)) return "Water";
  if (/vegetation|forest|wood|crop|grass|shrub|green|park|garden/.test(value)) return "Vegetation";
  if (/rural|countryside|open|bare|agricultur/.test(value)) return "Rural/Open";
  if (/urban|city|residential|building|built|roof|structure|road|street|highway|motorway|freeway|rail|transport/.test(value)) return "Urban";
  return "Unclassified";
};

export const getClutterClassColor = (value) => {
  const normalized = normalizeClutterClass(value);
  return CLASS_BY_KEY.get(normalized.toLowerCase().replace(/[^a-z0-9]/g, ""))?.color || [100, 116, 139];
};

export const getClutterClassOrder = (value) => {
  const normalized = normalizeClutterClass(value);
  const index = CLUTTER_CLASS_DEFINITIONS.findIndex(({ name }) => name === normalized);
  return index < 0 ? CLUTTER_CLASS_DEFINITIONS.length : index;
};
