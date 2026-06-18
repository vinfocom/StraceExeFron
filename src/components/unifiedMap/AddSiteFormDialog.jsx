import React, { useEffect, useMemo, useState } from "react";
import {
  Activity,
  ChevronDown,
  ChevronRight,
  Loader2,
  MapPin,
  Plus,
  RadioTower,
  Save,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "react-toastify";
import { mapViewApi } from "@/api/apiEndpoints";
import { Button } from "@/components/ui/button";

const TECHNOLOGY_OPTIONS = ["2G", "3G", "4G", "5G"];

const createCell = (overrides = {}) => ({
  technology: "4G",
  band: "",
  earfcn: "",
  pci: "",
  power: 40,
  ...overrides,
});

const createSector = (sectorNo = 1) => ({
  sectorNo,
  azimuth: 0,
  mechanicalTilt: 2,
  electricalTilt: 4,
  cells: [createCell()],
});

const createInitialForm = (projectId, pickedLatLng) => ({
  projectId: projectId ? Number(projectId) : 0,
  siteId: "",
  nodeId: "",
  siteName: "",
  operator: "",
  antenna: "Omni",
  latitude: pickedLatLng?.lat?.toFixed(6) || "",
  longitude: pickedLatLng?.lng?.toFixed(6) || "",
  sectors: [createSector(1)],
});

const inputClass =
  "h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50 disabled:text-slate-500";

const labelClass = "mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500";

const Field = ({ label, required = false, children }) => (
  <div>
    <label className={labelClass}>
      {label}
      {required && <span className="ml-1 text-red-500">*</span>}
    </label>
    {children}
  </div>
);

const numberOrNull = (value) => {
  const nextValue = Number(value);
  return Number.isFinite(nextValue) ? nextValue : null;
};

const normalizeNumber = (value, fallback = 0) => {
  const nextValue = numberOrNull(value);
  return nextValue === null ? fallback : nextValue;
};

const toFiniteNumber = (value, fallback = null) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const normalizeSiteKey = (site) => {
  const raw = String(
    site?.site ??
      site?.site_id ??
      site?.siteId ??
      site?.site_key_inferred ??
      site?.siteKeyInferred ??
      site?.nodeb_id ??
      site?.node_b_id ??
      site?.nodebId ??
      "",
  ).trim();
  if (!raw) return "";
  const numeric = Number(raw);
  return Number.isFinite(numeric) ? String(numeric) : raw;
};

const getSiteName = (site) =>
  String(
    site?.site_name ||
      site?.siteName ||
      site?.site ||
      site?.site_id ||
      site?.siteId ||
      "Unknown",
  ).trim();

const getSiteOperator = (site) =>
  String(
    site?.provider ??
      site?.Provider ??
      site?.cluster ??
      site?.Cluster ??
      site?.operator ??
      site?.Operator ??
      site?.network ??
      site?.Network ??
      "",
  ).trim();

const getSiteTechnology = (site) => {
  const technology = String(site?.Technology ?? site?.technology ?? site?.tech ?? "").trim().toUpperCase();
  if (TECHNOLOGY_OPTIONS.includes(technology)) return technology;
  if (technology.includes("5G") || technology.includes("NR")) return "5G";
  if (technology.includes("4G") || technology.includes("LTE")) return "4G";
  if (technology.includes("3G") || technology.includes("WCDMA") || technology.includes("UMTS")) return "3G";
  if (technology.includes("2G") || technology.includes("GSM")) return "2G";
  return "4G";
};

const getSiteAnftenna = (site, sectorCount = 1) => {
  const raw = String(
    site?.antenna ??
      site?.Antenna ??
      site?.antenna_type ??
      site?.antennaType ??
      site?.antenna_pattern ??
      site?.antennaPattern ??
      "",
  )
    .trim()
    .toLowerCase();

  if (raw.includes("omni")) return "Omni";
  if (
    raw.includes("catherine") ||
    raw.includes("kathrein") ||
    raw.includes("directional") ||
    raw.includes("sector") ||
    raw.includes("panel")
  ) {
    return "Catherine";
  }

  return sectorCount > 1 ? "Catherine" : "Omni";
};

const getSiteSectorNumber = (site, index = 0) => {
  const numeric = toFiniteNumber(site?.sector ?? site?.sector_id ?? site?.sectorId, null);
  return numeric !== null && numeric > 0 ? numeric : index + 1;
};

const getSiteLatitude = (site) =>
  toFiniteNumber(site?.lat_pred ?? site?.lat ?? site?.latitude, null);

const getSiteLongitude = (site) =>
  toFiniteNumber(site?.lon_pred ?? site?.lng ?? site?.lon ?? site?.longitude, null);

const getDistanceMeters = (first, second) => {
  const lat1 = toFiniteNumber(first?.lat, null);
  const lng1 = toFiniteNumber(first?.lng, null);
  const lat2 = toFiniteNumber(second?.lat, null);
  const lng2 = toFiniteNumber(second?.lng, null);
  if (lat1 === null || lng1 === null || lat2 === null || lng2 === null) return Number.POSITIVE_INFINITY;

  const toRadians = (value) => (value * Math.PI) / 180;
  const earthRadius = 6371000;
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadius * c;
};

const formatDistanceLabel = (distanceMeters) => {
  if (!Number.isFinite(distanceMeters)) return "Unknown distance";
  if (distanceMeters < 1000) return `${Math.round(distanceMeters)} m away`;
  return `${(distanceMeters / 1000).toFixed(2)} km away`;
};

const cloneSiteTemplateToForm = (template, currentForm, pickedLatLng) => {
  if (!template) return currentForm;

  return {
    ...currentForm,
    nodeId: template.nodeId,
    siteName: template.siteName,
    operator: template.operator,
    antenna: template.antenna,
    latitude:
      pickedLatLng?.lat != null ? Number(pickedLatLng.lat).toFixed(6) : currentForm.latitude,
    longitude:
      pickedLatLng?.lng != null ? Number(pickedLatLng.lng).toFixed(6) : currentForm.longitude,
    sectors: template.sectors.map((sector) => ({
      ...sector,
      cells: sector.cells.map((cell) => ({ ...cell })),
    })),
  };
};

const validateForm = (form) => {
  const projectIdValue = Number(form.projectId);
  const siteId = String(form.siteId || "").trim();
  const latitude = Number.parseFloat(form.latitude);
  const longitude = Number.parseFloat(form.longitude);

  if (!Number.isFinite(projectIdValue) || projectIdValue <= 0) return "Project ID is required.";
  if (!siteId) return "Site ID is required.";
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) return "Enter a valid latitude.";
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) return "Enter a valid longitude.";
  if (!Array.isArray(form.sectors) || form.sectors.length === 0) return "Add at least one sector.";

  const usedSectors = new Set();
  for (let sectorIndex = 0; sectorIndex < form.sectors.length; sectorIndex += 1) {
    const sector = form.sectors[sectorIndex];
    const sectorNo = Number(sector.sectorNo);
    if (!Number.isFinite(sectorNo) || sectorNo <= 0) return `Sector ${sectorIndex + 1} needs a valid sector number.`;
    if (usedSectors.has(sectorNo)) return `Sector number ${sectorNo} is duplicated.`;
    usedSectors.add(sectorNo);

    const azimuth = Number(sector.azimuth);
    if (!Number.isFinite(azimuth) || azimuth < 0 || azimuth > 359) {
      return `Sector ${sectorNo} azimuth must be between 0 and 359.`;
    }

    if (!Array.isArray(sector.cells) || sector.cells.length === 0) {
      return `Sector ${sectorNo} needs at least one cell.`;
    }

    for (let cellIndex = 0; cellIndex < sector.cells.length; cellIndex += 1) {
      const cell = sector.cells[cellIndex];
      if (!TECHNOLOGY_OPTIONS.includes(cell.technology)) return `Cell ${cellIndex + 1} in sector ${sectorNo} needs a technology.`;
      if (!String(cell.band || "").trim()) return `Cell ${cellIndex + 1} in sector ${sectorNo} needs a band.`;
      if (numberOrNull(cell.earfcn) === null) return `Cell ${cellIndex + 1} in sector ${sectorNo} needs a valid EARFCN.`;
      if (numberOrNull(cell.pci) === null) return `Cell ${cellIndex + 1} in sector ${sectorNo} needs a valid PCI.`;
      if (numberOrNull(cell.power) === null) return `Cell ${cellIndex + 1} in sector ${sectorNo} needs valid transmit power.`;
    }
  }

  return null;
};

const buildCellPayload = (form, sector, cell) => ({
  projectId: Number(form.projectId),
  site: String(form.siteId || "").trim(),
  nodeId: String(form.nodeId || "").trim(),
  node_id: String(form.nodeId || "").trim(),
  nodeb_id: String(form.nodeId || "").trim(),
  siteName: String(form.siteName || "").trim(),
  operatorName: String(form.operator || "").trim(),
  provider: String(form.operator || "").trim(),
  cluster: String(form.operator || "").trim(),
  bands: [String(cell.band || "").trim()],
  sectors: [normalizeNumber(sector.sectorNo, 1)],
  azimuths: [normalizeNumber(sector.azimuth, 0)],
  heights: [30],
  mechanicalTilts: [normalizeNumber(sector.mechanicalTilt, 0)],
  electricalTilts: [normalizeNumber(sector.electricalTilt, 0)],
  technology: cell.technology || "4G",
  technologies: [
    {
      technology: cell.technology || "4G",
      idValues: [normalizeNumber(cell.pci, 0)],
      earfcn: String(cell.earfcn || "").trim(),
      power: normalizeNumber(cell.power, 0),
    },
  ],
  latitude: Number.parseFloat(form.latitude),
  longitude: Number.parseFloat(form.longitude),
});

const buildTemplateFromSiteRows = (rows = []) => {
  if (!Array.isArray(rows) || rows.length === 0) return null;

  const firstRow = rows[0];
  const sectorMap = new Map();
  const orderedSectorKeys = [];

  rows.forEach((row, index) => {
    const sectorNo = getSiteSectorNumber(row, index);
    const sectorKey = String(sectorNo);
    if (!sectorMap.has(sectorKey)) {
      sectorMap.set(sectorKey, {
        sectorNo,
        azimuth: toFiniteNumber(row?.azimuth_deg_5 ?? row?.azimuth_deg_5_soft ?? row?.azimuth, 0),
        mechanicalTilt: toFiniteNumber(row?.m_tilt ?? row?.mTilt, 2),
        electricalTilt: toFiniteNumber(row?.e_tilt ?? row?.eTilt, 4),
        cells: [],
        cellKeys: new Set(),
      });
      orderedSectorKeys.push(sectorKey);
    }

    const sector = sectorMap.get(sectorKey);
    const cell = createCell({
      technology: getSiteTechnology(row),
      band: String(row?.Band ?? row?.band ?? row?.frequency_band ?? "").trim(),
      earfcn: String(row?.earfcn ?? row?.earfcn_or_narfcn ?? row?.earfcnOrNarfcn ?? "").trim(),
      pci: String(row?.pci ?? row?.Pci ?? row?.PCI ?? row?.cell_id ?? "").trim(),
      power: toFiniteNumber(row?.power ?? row?.tx_power ?? row?.txPower ?? row?.transmit_power, 40),
    });

    const cellKey = [
      cell.technology,
      cell.band,
      cell.earfcn,
      cell.pci,
      cell.power,
    ].join("|");

    if (!sector.cellKeys.has(cellKey)) {
      sector.cellKeys.add(cellKey);
      sector.cells.push(cell);
    }
  });

  const sectors = orderedSectorKeys
    .map((sectorKey) => {
      const sector = sectorMap.get(sectorKey);
      return {
        sectorNo: sector.sectorNo,
        azimuth: sector.azimuth,
        mechanicalTilt: sector.mechanicalTilt,
        electricalTilt: sector.electricalTilt,
        cells: sector.cells.length > 0 ? sector.cells : [createCell()],
      };
    })
    .sort((a, b) => Number(a.sectorNo) - Number(b.sectorNo));

  return {
    siteKey: normalizeSiteKey(firstRow),
    siteName: getSiteName(firstRow) === "Unknown" ? "" : getSiteName(firstRow),
    nodeId: String(
      firstRow?.nodeb_id ??
        firstRow?.node_b_id ??
        firstRow?.node_b ??
        firstRow?.nodebId ??
        "",
    ).trim(),
    operator: getSiteOperator(firstRow),
    antenna: getSiteAntenna(firstRow, sectors.length),
    latitude: getSiteLatitude(firstRow),
    longitude: getSiteLongitude(firstRow),
    sectors: sectors.length > 0 ? sectors : [createSector(1)],
  };
};

const CellCard = ({
  cell,
  cellIndex,
  sectorNo,
  canRemove,
  onChange,
  onRemove,
  availableBands,
  availablePcis,
}) => {
  const bandListId = `bands-${sectorNo}-${cellIndex}`;
  const pciListId = `pcis-${sectorNo}-${cellIndex}`;

  return (
    <div className="rounded-md border border-slate-200 bg-white p-3 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-blue-50 text-blue-700">
            <Activity className="h-4 w-4" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-800">Cell {cellIndex + 1}</p>
            <p className="text-xs text-slate-500">Sector {sectorNo}</p>
          </div>
        </div>
        {canRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="flex h-8 w-8 items-center justify-center rounded-md text-slate-400 transition hover:bg-red-50 hover:text-red-600"
            title="Remove Cell"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Field label="Technology" required>
          <select
            value={cell.technology}
            onChange={(event) => onChange("technology", event.target.value)}
            className={inputClass}
          >
            {TECHNOLOGY_OPTIONS.map((technology) => (
              <option key={technology} value={technology}>
                {technology}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Band" required>
          <input
            value={cell.band}
            onChange={(event) => onChange("band", event.target.value)}
            placeholder="B3"
            list={bandListId}
            className={inputClass}
          />
          <datalist id={bandListId}>
            {availableBands.map((band) => (
              <option key={band} value={band} />
            ))}
          </datalist>
        </Field>
        <Field label="EARFCN" required>
          <input
            type="number"
            value={cell.earfcn}
            onChange={(event) => onChange("earfcn", event.target.value)}
            placeholder="1300"
            className={inputClass}
          />
        </Field>
        <Field label="PCI" required>
          <input
            type="number"
            value={cell.pci}
            onChange={(event) => onChange("pci", event.target.value)}
            placeholder="100"
            list={pciListId}
            className={inputClass}
          />
          <datalist id={pciListId}>
            {availablePcis.map((pci) => (
              <option key={pci} value={pci} />
            ))}
          </datalist>
        </Field>
        <Field label="Power" required>
          <input
            type="number"
            value={cell.power}
            onChange={(event) => onChange("power", event.target.value)}
            placeholder="40"
            className={inputClass}
          />
        </Field>
      </div>
    </div>
  );
};

const SectorCard = ({
  sector,
  sectorIndex,
  canRemove,
  expanded,
  onToggle,
  onChange,
  onRemove,
  onAddCell,
  onCellChange,
  onRemoveCell,
  availableBands,
  availablePcis,
}) => {
  const sectorNo = sector.sectorNo || sectorIndex + 1;

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-slate-50 shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3">
        <button
          type="button"
          onClick={onToggle}
          className="flex min-w-0 items-center gap-2 text-left"
        >
          {expanded ? (
            <ChevronDown className="h-4 w-4 shrink-0 text-slate-500" />
          ) : (
            <ChevronRight className="h-4 w-4 shrink-0 text-slate-500" />
          )}
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Sector {sectorNo}</h3>
            <p className="text-xs text-slate-500">
              {sector.cells.length} {sector.cells.length === 1 ? "cell" : "cells"} · {sector.azimuth || 0} deg azimuth
            </p>
          </div>
        </button>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={onAddCell}
            className="h-8 gap-1 text-xs"
          >
            <Plus className="h-3.5 w-3.5" />
            Cell
          </Button>
          {canRemove && (
            <button
              type="button"
              onClick={onRemove}
              className="flex h-8 w-8 items-center justify-center rounded-md text-slate-400 transition hover:bg-red-50 hover:text-red-600"
              title="Remove Sector"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {expanded && (
        <div className="space-y-4 p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Field label="Sector Number" required>
              <input
                type="number"
                value={sector.sectorNo}
                onChange={(event) => onChange("sectorNo", event.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label="Azimuth" required>
              <input
                type="number"
                min="0"
                max="359"
                value={sector.azimuth}
                onChange={(event) => onChange("azimuth", event.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label="Mechanical Tilt">
              <input
                type="number"
                value={sector.mechanicalTilt}
                onChange={(event) => onChange("mechanicalTilt", event.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label="Electrical Tilt">
              <input
                type="number"
                value={sector.electricalTilt}
                onChange={(event) => onChange("electricalTilt", event.target.value)}
                className={inputClass}
              />
            </Field>
          </div>

          <div className="space-y-3">
            {sector.cells.map((cell, cellIndex) => (
              <CellCard
                key={`sector-${sectorIndex}-cell-${cellIndex}`}
                cell={cell}
                cellIndex={cellIndex}
                sectorNo={sectorNo}
                canRemove={sector.cells.length > 1}
                onChange={(field, value) => onCellChange(cellIndex, field, value)}
                onRemove={() => onRemoveCell(cellIndex)}
                availableBands={availableBands}
                availablePcis={availablePcis}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

const SiteForm = ({
  form,
  onSubmit,
  onSiteChange,
  onAddSector,
  onSectorChange,
  onRemoveSector,
  onAddCell,
  onCellChange,
  onRemoveCell,
  expandedSectors,
  onToggleSector,
  availableBands,
  availablePcis,
}) => {
  const totalCells = useMemo(
    () => form.sectors.reduce((sum, sector) => sum + sector.cells.length, 0),
    [form.sectors],
  );

  return (
    <form id="add-site-form" onSubmit={onSubmit} className="space-y-5">
      <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-blue-50 text-blue-700">
              <RadioTower className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Site Information</h3>
              <p className="text-xs text-slate-500">
                {form.sectors.length} sectors · {totalCells} cells
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 xl:grid-cols-3">
          <Field label="Site ID" required>
            <input
              value={form.siteId}
              onChange={(event) => onSiteChange("siteId", event.target.value)}
              placeholder="e.g. S123"
              className={inputClass}
            />
          </Field>
          <Field label="NodeB ID">
            <input
              value={form.nodeId}
              onChange={(event) => onSiteChange("nodeId", event.target.value)}
              placeholder="e.g. NB123"
              className={inputClass}
            />
          </Field>
          <Field label="Site Name">
            <input
              value={form.siteName}
              onChange={(event) => onSiteChange("siteName", event.target.value)}
              placeholder="Optional"
              className={inputClass}
            />
          </Field>
          <Field label="Operator">
            <input
              value={form.operator}
              onChange={(event) => onSiteChange("operator", event.target.value)}
              placeholder="e.g. Jio, Airtel"
              className={inputClass}
            />
          </Field>
          <Field label="Antenna">
            <div className="flex h-10 items-center rounded-md border border-slate-200 bg-slate-50 px-3 text-sm font-medium text-slate-700">
              {form.antenna || "Omni"}
            </div>
          </Field>
          <Field label="Latitude" required>
            <input
              type="number"
              step="any"
              value={form.latitude}
              onChange={(event) => onSiteChange("latitude", event.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Longitude" required>
            <input
              type="number"
              step="any"
              value={form.longitude}
              onChange={(event) => onSiteChange("longitude", event.target.value)}
              className={inputClass}
            />
          </Field>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Sectors</h3>
            <p className="text-xs text-slate-500">Configure azimuth, tilt and cells per sector.</p>
          </div>
          <Button type="button" size="sm" variant="outline" onClick={onAddSector} className="h-9 gap-2">
            <Plus className="h-4 w-4" />
            Add Sector
          </Button>
        </div>

        {form.sectors.map((sector, sectorIndex) => (
          <SectorCard
            key={`sector-${sectorIndex}`}
            sector={sector}
            sectorIndex={sectorIndex}
            canRemove={form.sectors.length > 1}
            expanded={expandedSectors.has(sectorIndex)}
            onToggle={() => onToggleSector(sectorIndex)}
            onChange={(field, value) => onSectorChange(sectorIndex, field, value)}
            onRemove={() => onRemoveSector(sectorIndex)}
            onAddCell={() => onAddCell(sectorIndex)}
            onCellChange={(cellIndex, field, value) => onCellChange(sectorIndex, cellIndex, field, value)}
            onRemoveCell={(cellIndex) => onRemoveCell(sectorIndex, cellIndex)}
            availableBands={availableBands}
            availablePcis={availablePcis}
          />
        ))}
      </section>
    </form>
  );
};

const AddSiteFormDialog = ({
  open,
  onOpenChange,
  projectId,
  pickedLatLng,
  onSuccess,
  availableBands = [],
  availablePcis = [],
  siteData = [],
}) => {
  const [form, setForm] = useState(() => createInitialForm(projectId, pickedLatLng));
  const [expandedSectors, setExpandedSectors] = useState(() => new Set([0]));
  const [submitting, setSubmitting] = useState(false);
  const [copyNearbyDecision, setCopyNearbyDecision] = useState(null);
  const [siteSearch, setSiteSearch] = useState("");

  useEffect(() => {
    if (pickedLatLng) {
      setForm((prev) => ({
        ...prev,
        latitude: pickedLatLng.lat.toFixed(6),
        longitude: pickedLatLng.lng.toFixed(6),
      }));
    }
  }, [pickedLatLng]);

  useEffect(() => {
    if (open) {
      setForm(createInitialForm(projectId, pickedLatLng));
      setExpandedSectors(new Set([0]));
      setCopyNearbyDecision(null);
      setSiteSearch("");
    }
  }, [open, pickedLatLng, projectId]);

  const allSiteTemplates = useMemo(() => {
    if (!Array.isArray(siteData) || siteData.length === 0 || !pickedLatLng) return null;

    const rowsBySite = new Map();
    siteData.forEach((row) => {
      const siteKey = normalizeSiteKey(row);
      if (!siteKey) return;
      if (!rowsBySite.has(siteKey)) rowsBySite.set(siteKey, []);
      rowsBySite.get(siteKey).push(row);
    });

    const templates = [];
    rowsBySite.forEach((rows) => {
      const template = buildTemplateFromSiteRows(rows);
      if (!template) return;
      const distanceMeters = getDistanceMeters(
        { lat: pickedLatLng.lat, lng: pickedLatLng.lng },
        { lat: template.latitude, lng: template.longitude },
      );
      if (!Number.isFinite(distanceMeters)) return;
      templates.push({ ...template, distanceMeters });
    });

    return templates.sort((a, b) => {
      if (a.distanceMeters !== b.distanceMeters) return a.distanceMeters - b.distanceMeters;
      return String(a.siteKey || a.siteName || "").localeCompare(String(b.siteKey || b.siteName || ""));
    });
  }, [siteData, pickedLatLng]);

  const nearestSiteTemplate = allSiteTemplates?.[0] || null;

  const filteredSiteTemplates = useMemo(() => {
    if (!Array.isArray(allSiteTemplates) || allSiteTemplates.length === 0) return [];
    const query = String(siteSearch || "").trim().toLowerCase();
    if (!query) return allSiteTemplates;
    return allSiteTemplates.filter((template) => {
      const haystack = [
        template.siteKey,
        template.siteName,
        template.nodeId,
        template.operator,
        template.antenna,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [allSiteTemplates, siteSearch]);

  if (!open) return null;

  const handleSiteChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleCopySiteSelection = (template) => {
    if (!template) {
      toast.error("No nearby site data available to copy.");
      return;
    }
    setCopyNearbyDecision("copied");
    setForm((prev) => cloneSiteTemplateToForm(template, prev, pickedLatLng));
    setExpandedSectors(new Set(template.sectors.map((_, index) => index)));
  };

  const handleAddSector = () => {
    setForm((prev) => {
      const nextSectorNo =
        prev.sectors.length > 0
          ? Math.max(...prev.sectors.map((sector) => normalizeNumber(sector.sectorNo, 0))) + 1
          : 1;
      const nextSectors = [...prev.sectors, createSector(nextSectorNo)];
      setExpandedSectors(new Set([nextSectors.length - 1]));
      return { ...prev, sectors: nextSectors };
    });
  };

  const handleRemoveSector = (sectorIndex) => {
    setForm((prev) => ({
      ...prev,
      sectors: prev.sectors.filter((_, index) => index !== sectorIndex),
    }));
    setExpandedSectors((prev) => {
      const next = new Set();
      prev.forEach((index) => {
        if (index < sectorIndex) next.add(index);
        if (index > sectorIndex) next.add(index - 1);
      });
      if (next.size === 0) next.add(0);
      return next;
    });
  };

  const handleSectorChange = (sectorIndex, field, value) => {
    setForm((prev) => ({
      ...prev,
      sectors: prev.sectors.map((sector, index) =>
        index === sectorIndex ? { ...sector, [field]: value } : sector,
      ),
    }));
  };

  const handleToggleSector = (sectorIndex) => {
    setExpandedSectors((prev) => {
      const next = new Set(prev);
      if (next.has(sectorIndex)) next.delete(sectorIndex);
      else next.add(sectorIndex);
      return next;
    });
  };

  const handleAddCell = (sectorIndex) => {
    setForm((prev) => ({
      ...prev,
      sectors: prev.sectors.map((sector, index) =>
        index === sectorIndex ? { ...sector, cells: [...sector.cells, createCell()] } : sector,
      ),
    }));
    setExpandedSectors((prev) => new Set(prev).add(sectorIndex));
  };

  const handleCellChange = (sectorIndex, cellIndex, field, value) => {
    setForm((prev) => ({
      ...prev,
      sectors: prev.sectors.map((sector, currentSectorIndex) =>
        currentSectorIndex === sectorIndex
          ? {
              ...sector,
              cells: sector.cells.map((cell, currentCellIndex) =>
                currentCellIndex === cellIndex ? { ...cell, [field]: value } : cell,
              ),
            }
          : sector,
      ),
    }));
  };

  const handleRemoveCell = (sectorIndex, cellIndex) => {
    setForm((prev) => ({
      ...prev,
      sectors: prev.sectors.map((sector, currentSectorIndex) =>
        currentSectorIndex === sectorIndex
          ? { ...sector, cells: sector.cells.filter((_, index) => index !== cellIndex) }
          : sector,
      ),
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    const validationError = validateForm(form);
    if (validationError) {
      toast.error(validationError);
      return;
    }

    const payloads = form.sectors.flatMap((sector) =>
      sector.cells.map((cell) => buildCellPayload(form, sector, cell)),
    );

    setSubmitting(true);
    try {
      for (const payload of payloads) {
        await mapViewApi.addSitePrediction(payload);
      }
      toast.success("Site added successfully!");
      onOpenChange(false);
      onSuccess?.();
    } catch (error) {
      console.error("Add site error:", error);
      const apiError = error?.response?.data ?? error?.data;
      const errorBag =
        (apiError?.errors && typeof apiError.errors === "object" && apiError.errors) ||
        (apiError?.Errors && typeof apiError.Errors === "object" && apiError.Errors) ||
        null;
      const validationErrors = errorBag ? Object.values(errorBag).flat().filter(Boolean) : [];
      const firstValidationError = validationErrors.length > 0 ? String(validationErrors[0]) : null;
      const message =
        firstValidationError ||
        (typeof apiError === "string"
          ? apiError
          : apiError?.Message || apiError?.message || apiError?.Title || apiError?.title) ||
        error?.message ||
        "Failed to add site";
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <button
        type="button"
        aria-label="Close add site dialog"
        onClick={() => onOpenChange(false)}
        className="fixed inset-0 z-[9998] bg-black/40"
      />

      <div className="fixed left-1/2 top-1/2 z-[9999] flex max-h-[92vh] w-[min(1040px,calc(100vw-24px))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl bg-slate-100 shadow-2xl">
        <div className="flex items-center justify-between gap-4 border-b border-slate-200 bg-white px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white">
              <MapPin className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Add Site</h2>
              <p className="text-sm text-slate-500">Network planning configuration</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="flex h-9 w-9 items-center justify-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
            title="Cancel"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="overflow-y-auto p-4 sm:p-5">
          <SiteForm
            form={form}
            onSubmit={handleSubmit}
            onSiteChange={handleSiteChange}
            onAddSector={handleAddSector}
            onSectorChange={handleSectorChange}
            onRemoveSector={handleRemoveSector}
            onAddCell={handleAddCell}
            onCellChange={handleCellChange}
            onRemoveCell={handleRemoveCell}
            expandedSectors={expandedSectors}
            onToggleSector={handleToggleSector}
            availableBands={availableBands}
            availablePcis={availablePcis}
          />

          {copyNearbyDecision === null && (
            <section className="mt-5 rounded-lg border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-200 px-4 py-3">
                <h3 className="text-sm font-semibold text-slate-900">Copy From Nearby Site</h3>
                <p className="text-xs text-slate-500">
                  Pick any existing site to copy from. The list is sorted by nearest distance first.
                </p>
              </div>

              <div className="space-y-3 p-4">
                <input
                  type="text"
                  value={siteSearch}
                  onChange={(event) => setSiteSearch(event.target.value)}
                  placeholder="Search by site, name, node, operator..."
                  className={inputClass}
                />

                <div className="max-h-72 overflow-y-auto rounded-md border border-slate-200 bg-slate-50">
                  {filteredSiteTemplates.length > 0 ? (
                    <div className="divide-y divide-slate-200">
                      {filteredSiteTemplates.map((template, index) => (
                        <button
                          key={`${template.siteKey || template.siteName || "site"}-${index}`}
                          type="button"
                          onClick={() => handleCopySiteSelection(template)}
                          className="flex w-full items-start justify-between gap-3 px-3 py-3 text-left transition hover:bg-blue-50"
                        >
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-semibold text-slate-900">
                                {template.siteKey || template.siteName || "Unknown site"}
                              </span>
                              {index === 0 && (
                                <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-blue-700">
                                  Nearest
                                </span>
                              )}
                            </div>
                            <div className="mt-1 text-xs text-slate-500">
                              {template.siteName || "Unnamed site"} · {template.operator || "Unknown operator"}
                            </div>
                            <div className="mt-1 text-xs text-slate-500">
                              Node {template.nodeId || "N/A"} · {template.antenna || "Omni"} · {template.sectors.length} sectors
                            </div>
                          </div>
                          <div className="shrink-0 text-xs font-medium text-slate-600">
                            {formatDistanceLabel(template.distanceMeters)}
                          </div>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="px-3 py-4 text-sm text-slate-500">
                      {nearestSiteTemplate
                        ? "No sites match your search."
                        : "No nearby site found from current site data."}
                    </div>
                  )}
                </div>

                <div className="flex justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setCopyNearbyDecision("no")}
                    className="h-9 min-w-[88px]"
                  >
                    No
                  </Button>
                </div>
              </div>
            </section>
          )}
        </div>

        <div className="flex flex-col-reverse gap-3 border-t border-slate-200 bg-white px-5 py-4 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="h-10 text-slate-700"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            form="add-site-form"
            disabled={submitting}
            className="h-10 min-w-[128px] gap-2 bg-blue-600 text-white hover:bg-blue-700"
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="h-4 w-4" />
                Save
              </>
            )}
          </Button>
        </div>
      </div>
    </>
  );
};

export default AddSiteFormDialog;
