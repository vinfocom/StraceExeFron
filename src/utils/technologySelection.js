export const getTechnologyFamily = (value) => {
  const technology = String(value ?? "").trim().toUpperCase();
  if (technology.startsWith("4G")) return "4G";
  if (technology.startsWith("5G")) return "5G";
  return technology;
};
