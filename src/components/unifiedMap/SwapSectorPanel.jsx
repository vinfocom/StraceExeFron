import { useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { predictionApi } from "@/api/apiEndpoints";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function SwapSectorPanel({ projectId, sessionIds, region, countryCode, operatorOptions }) {
  const [scope, setScope] = useState({ operator: "", technology: "LTE", method: "pattern", maxViolationDb: "3" });
  const [running, setRunning] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const requestInFlight = useRef(false);
  const currentScope = {
    ...scope,
    region: scope.region ?? region ?? "",
    countryCode: scope.countryCode ?? countryCode ?? "",
  };
  const update = (field, value) => {
    setScope((previous) => ({ ...previous, [field]: value }));
    setFeedback(null);
  };
  const validProject = Number.isSafeInteger(Number(projectId)) && Number(projectId) > 0;
  const validSessions = Array.isArray(sessionIds) && sessionIds.length > 0 &&
    sessionIds.every((id) => Number.isSafeInteger(Number(id)) && Number(id) > 0);
  const threshold = Number(scope.maxViolationDb);
  const validScope = currentScope.region.trim() && /^[A-Za-z]{2}$/.test(currentScope.countryCode.trim()) &&
    scope.operator.trim() && scope.technology.trim() && scope.maxViolationDb.trim() !== "" &&
    Number.isFinite(threshold) && threshold >= 0;

  const run = async () => {
    if (requestInFlight.current || !validProject || !validSessions || !validScope) return;
    requestInFlight.current = true;
    setRunning(true);
    setFeedback(null);
    try {
      const result = await predictionApi.runSwapSector({
        project_id: Number(projectId),
        session_ids: [...new Set(sessionIds.map(Number))],
        region: currentScope.region.trim().toLowerCase(),
        country_code: currentScope.countryCode.trim().toUpperCase(),
        operator: scope.operator.trim(),
        technology: scope.technology.trim().toUpperCase(),
        method: scope.method,
        max_violation_db: threshold,
      });
      if (result?.success === false || ["failed", "error"].includes(String(result?.status).toLowerCase())) {
        throw new Error(typeof result.message === "string" ? result.message : "Swap sector request failed.");
      }
      setFeedback({ result, message: "Swap sector response received." });
    } catch (error) {
      const detail = error?.response?.data?.detail;
      setFeedback({ error: true, message: typeof detail === "string" ? detail : error?.message || "Swap sector request failed." });
    } finally {
      requestInFlight.current = false;
      setRunning(false);
    }
  };

  return (
      <div className="space-y-3">
        <p className="break-words text-xs text-slate-400">
          Project: {projectId || "None"} · Sessions: {sessionIds?.join(", ") || "None"}
        </p>
        <fieldset disabled={running} className="space-y-3 disabled:opacity-60">
          {[
            ["region", "Region", "taiwan"],
            ["countryCode", "Country Code", "TW"],
            ["operator", "Operator", "JIO"],
            ["technology", "Technology", "LTE"],
          ].map(([field, label, placeholder]) => (
            <label key={field} className="block space-y-1 text-xs text-slate-300">
              <span>{label}</span>
              <Input
                value={currentScope[field]}
                onChange={(event) => update(field, event.target.value)}
                placeholder={placeholder}
                list={field === "operator" ? "swap-sector-operators" : undefined}
                className="h-8 border-slate-600 bg-slate-800 text-xs text-white"
              />
            </label>
          ))}
          <datalist id="swap-sector-operators">
            {operatorOptions.filter((option) => option.value !== "all").map((option) => (
              <option key={option.value} value={option.label} />
            ))}
          </datalist>
          <label className="block space-y-1 text-xs text-slate-300">
            <span>Method</span>
            <select value={scope.method} onChange={(event) => update("method", event.target.value)} className="h-8 w-full rounded-md border border-slate-600 bg-slate-800 px-2 text-white">
              <option value="pattern">Pattern</option>
            </select>
          </label>
          <label className="block space-y-1 text-xs text-slate-300">
            <span>Max Violation (dB)</span>
            <Input type="number" min="0" step="0.1" value={scope.maxViolationDb} onChange={(event) => update("maxViolationDb", event.target.value)} className="h-8 border-slate-600 bg-slate-800 text-xs text-white" />
          </label>
        </fieldset>
        {(!validProject || !validSessions) && <p className="text-xs text-amber-400">Select a valid project and at least one session.</p>}
        <Button type="button" onClick={run} disabled={running || !validProject || !validSessions || !validScope} className="h-8 w-full bg-cyan-600 text-xs hover:bg-cyan-500">
          {running && <RefreshCw className="mr-2 h-3.5 w-3.5 animate-spin" />}
          {running ? "Running..." : "Run Swap Sector"}
        </Button>
        {feedback && (
          <div role={feedback.error ? "alert" : "status"} className={`text-xs ${feedback.error ? "text-red-400" : "text-emerald-400"}`}>
            {feedback.message}
            {feedback.result != null && <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words text-slate-300">{JSON.stringify(feedback.result, null, 2)}</pre>}
          </div>
        )}
      </div>
  );
}
