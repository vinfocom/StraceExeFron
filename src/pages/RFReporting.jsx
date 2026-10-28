import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import { Activity, ArrowUpFromLine, Check, Clock3, Download, FileArchive, Mail, Plus, RefreshCw, RotateCcw, ShieldCheck, Trash2, Users, X } from "lucide-react";
import { toast } from "react-toastify";
import { api } from "../api/apiService";
import { useAuth } from "../context/AuthContext";

const MAX_ZIP_BYTES = 1024 * 1024 * 1024;
const LAST_UPLOAD_KEY = "rfReporting.lastUpload";
const TABS = ["Upload report", "Email recipients"];

const getErrorMessage = (error) => {
  const data = error?.response?.data;
  return data?.message || data?.detail || data?.title || error?.message || "Something went wrong. Please try again.";
};

const getCsrfHeaders = () => {
  if (typeof document === "undefined") return {};
  const cookie = document.cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith("st.csrf="));
  if (!cookie) return {};
  return { "X-CSRF-TOKEN": decodeURIComponent(cookie.slice("st.csrf=".length)) };
};

const formatBytes = (value) => {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let size = bytes;
  let index = -1;
  do { size /= 1024; index += 1; } while (size >= 1024 && index < units.length - 1);
  return `${size.toFixed(size >= 10 ? 0 : 1)} ${units[index]}`;
};

const formatDate = (value) => {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
};

const statusStyles = {
  awaiting_upload: "bg-amber-50 text-amber-700 ring-amber-200",
  ready: "bg-sky-50 text-sky-700 ring-sky-200",
  processing: "bg-violet-50 text-violet-700 ring-violet-200",
  completed: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  failed: "bg-rose-50 text-rose-700 ring-rose-200",
  pending: "bg-amber-50 text-amber-700 ring-amber-200",
  sent: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  dead_letter: "bg-rose-50 text-rose-700 ring-rose-200",
  cancelled: "bg-slate-100 text-slate-600 ring-slate-200",
  enabled: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  disabled: "bg-slate-100 text-slate-600 ring-slate-200",
};

function StatusPill({ value }) {
  const label = String(value || "unknown").replaceAll("_", " ");
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold capitalize ring-1 ring-inset ${statusStyles[value] || "bg-slate-100 text-slate-600 ring-slate-200"}`}>{label}</span>;
}

function InfoCard({ icon: Icon, label, value, detail }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div><p className="text-xs font-medium uppercase tracking-[0.12em] text-slate-500">{label}</p><p className="mt-2 text-lg font-semibold text-slate-900">{value}</p>{detail && <p className="mt-1 text-xs text-slate-500">{detail}</p>}</div>
        <span className="rounded-xl bg-sky-50 p-2.5 text-sky-700"><Icon size={18} /></span>
      </div>
    </div>
  );
}

export default function RFReportingPage() {
  const { user } = useAuth();
  const isAdmin = [2, 3].includes(Number(user?.m_user_type_id));
  const [activeTab, setActiveTab] = useState(TABS[0]);
  const [selectedFile, setSelectedFile] = useState(null);
  const [sessionId, setSessionId] = useState("");
  const [subSessionId, setSubSessionId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [uploadEvent, setUploadEvent] = useState(null);
  const [uploadId, setUploadId] = useState("");
  const [savedRegistration, setSavedRegistration] = useState(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [refreshingStatus, setRefreshingStatus] = useState(false);
  const fileInputRef = useRef(null);

  const [recipients, setRecipients] = useState([]);
  const [deliveries, setDeliveries] = useState([]);
  const [recipientLoading, setRecipientLoading] = useState(false);
  const [recipientSaving, setRecipientSaving] = useState(false);
  const [recipientEmail, setRecipientEmail] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [deliveryFilter, setDeliveryFilter] = useState("");

  const reportStatus = String(uploadEvent?.reportStatus || "awaiting_upload").toLowerCase();
  const uploadStatus = String(uploadEvent?.uploadStatus || "awaiting_upload").toLowerCase();
  const isReportActive = ["ready", "processing"].includes(reportStatus);
  const progressLabel = busy ? (progress >= 100 ? "Finishing upload" : "Uploading ZIP") : "Upload progress";

  const refreshUploadStatus = useCallback(async (id = uploadId) => {
    if (!id) return null;
    setRefreshingStatus(true);
    try {
      const { data } = await api.get(`/api/rf-logs/uploads/${encodeURIComponent(id)}`);
      setUploadEvent(data);
      return data;
    } catch (error) {
      toast.error(getErrorMessage(error));
      return null;
    } finally {
      setRefreshingStatus(false);
    }
  }, [uploadId]);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(LAST_UPLOAD_KEY) || "null");
      if (!saved?.uploadId) return;
      setUploadId(saved.uploadId);
      setSavedRegistration(saved.registration || null);
      if (saved.registration) {
        setSessionId(String(saved.registration.sessionId ?? ""));
        setSubSessionId(String(saved.registration.subSessionId ?? ""));
        setProjectId(String(saved.registration.projectId ?? ""));
      }
    } catch { /* Ignore an invalid local recovery record. */ }
  }, []);

  useEffect(() => {
    if (!uploadId || uploadEvent || busy) return;
    refreshUploadStatus(uploadId);
  }, [uploadId, uploadEvent, busy, refreshUploadStatus]);

  useEffect(() => {
    if (!uploadId || !isReportActive) return undefined;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") refreshUploadStatus(uploadId);
    }, 7000);
    return () => window.clearInterval(timer);
  }, [uploadId, isReportActive, refreshUploadStatus]);

  const loadRecipientsAndDeliveries = useCallback(async () => {
    if (!isAdmin) return;
    setRecipientLoading(true);
    try {
      const [recipientResponse, deliveryResponse] = await Promise.all([
        api.get("/api/rf-logs/recipients"),
        api.get("/api/rf-logs/email-deliveries", { params: deliveryFilter ? { uploadId: deliveryFilter } : {} }),
      ]);
      setRecipients(Array.isArray(recipientResponse.data?.recipients) ? recipientResponse.data.recipients : []);
      setDeliveries(Array.isArray(deliveryResponse.data?.deliveries) ? deliveryResponse.data.deliveries : []);
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setRecipientLoading(false);
    }
  }, [deliveryFilter, isAdmin]);

  useEffect(() => {
    if (activeTab === "Email recipients" && isAdmin) loadRecipientsAndDeliveries();
  }, [activeTab, isAdmin, loadRecipientsAndDeliveries]);

  const chooseFile = (file) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".zip")) {
      toast.error("Choose a .zip file.");
      return;
    }
    if (file.size < 4 || file.size > MAX_ZIP_BYTES) {
      toast.error("ZIP files must be between 4 bytes and 1 GiB.");
      return;
    }
    setSelectedFile(file);
    setUploadEvent(null);
    setProgress(0);
  };

  const persistUpload = (id, registration) => {
    setUploadId(id);
    setSavedRegistration(registration);
    localStorage.setItem(LAST_UPLOAD_KEY, JSON.stringify({ uploadId: id, registration }));
  };

  const registerAndUpload = async () => {
    if (!selectedFile) { toast.error("Choose a ZIP file first."); return; }
    if (!sessionId || !Number.isInteger(Number(sessionId)) || Number(sessionId) <= 0) { toast.error("Enter a valid session ID."); return; }
    setBusy(true);
    setProgress(0);
    const registration = savedRegistration?.fileName === selectedFile.name
      && savedRegistration?.fileSizeBytes === selectedFile.size
      && Number(savedRegistration?.sessionId) === Number(sessionId)
      && String(savedRegistration?.subSessionId || "") === subSessionId.trim()
      && String(savedRegistration?.projectId || "") === projectId.trim()
      ? savedRegistration
      : {
          uploadId: window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`,
          fileName: selectedFile.name,
          fileSizeBytes: selectedFile.size,
          sessionId: Number(sessionId),
          ...(subSessionId.trim() ? { subSessionId: subSessionId.trim() } : {}),
          ...(projectId.trim() ? { projectId: Number(projectId) } : {}),
        };
    if (projectId.trim() && (!Number.isInteger(Number(projectId)) || Number(projectId) <= 0)) {
      setBusy(false); toast.error("Project ID must be a positive number."); return;
    }
    persistUpload(registration.uploadId, registration);

    try {
      const { data: result } = await api.post("/api/rf-logs/uploads", registration, { headers: getCsrfHeaders() });
      setUploadEvent(result);
      if (String(result?.status || result?.uploadStatus).toLowerCase() !== "awaiting_upload" || !result?.uploadUrl) {
        toast.info("This upload is already registered. Checking its report status.");
        await refreshUploadStatus(registration.uploadId);
        return;
      }

      await axios.put(result.uploadUrl, selectedFile, {
        headers: { ...(result.requiredHeaders || {}), "Content-Type": "application/zip" },
        withCredentials: false,
        onUploadProgress: (event) => {
          if (event.total) setProgress(Math.min(100, Math.round((event.loaded / event.total) * 100)));
        },
      });

      const { data: completed } = await api.post(`/api/rf-logs/uploads/${encodeURIComponent(registration.uploadId)}/complete`, null, { headers: getCsrfHeaders() });
      setUploadEvent(completed);
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      toast.success("ZIP accepted. Report generation has started.");
      await refreshUploadStatus(registration.uploadId);
    } catch (error) {
      toast.error(getErrorMessage(error));
      await refreshUploadStatus(registration.uploadId);
    } finally {
      setBusy(false);
    }
  };

  const downloadPdf = async () => {
    if (!uploadId) return;
    try {
      const { data } = await api.get(`/api/rf-logs/uploads/${encodeURIComponent(uploadId)}/report`);
      if (!data?.downloadUrl) throw new Error("The report download link was not returned.");
      const link = document.createElement("a");
      link.href = data.downloadUrl;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.download = `${uploadEvent?.fileName?.replace(/\.zip$/i, "") || "rf-report"}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (error) { toast.error(getErrorMessage(error)); }
  };

  const retryReport = async () => {
    if (!uploadId) return;
    try {
      const { data } = await api.post(`/api/rf-logs/uploads/${encodeURIComponent(uploadId)}/report-retry`, null, { headers: getCsrfHeaders() });
      setUploadEvent(data);
      toast.success("Report generation queued again.");
    } catch (error) { toast.error(getErrorMessage(error)); }
  };

  const addRecipient = async (event) => {
    event.preventDefault();
    if (!recipientEmail.trim()) return;
    setRecipientSaving(true);
    try {
      await api.post("/api/rf-logs/recipients", { email: recipientEmail.trim(), name: recipientName.trim() }, { headers: getCsrfHeaders() });
      setRecipientEmail(""); setRecipientName("");
      toast.success("Recipient saved. They will receive new reports for this region and company.");
      await loadRecipientsAndDeliveries();
    } catch (error) { toast.error(getErrorMessage(error)); }
    finally { setRecipientSaving(false); }
  };

  const disableRecipient = async (recipient) => {
    try {
      await api.delete(`/api/rf-logs/recipients/${encodeURIComponent(recipient.id)}`, { headers: getCsrfHeaders() });
      toast.success("Recipient disabled.");
      await loadRecipientsAndDeliveries();
    } catch (error) { toast.error(getErrorMessage(error)); }
  };

  const retryDelivery = async (delivery) => {
    try {
      await api.post(`/api/rf-logs/email-deliveries/${encodeURIComponent(delivery.id)}/retry`, null, { headers: getCsrfHeaders() });
      toast.success("Email delivery queued for retry.");
      await loadRecipientsAndDeliveries();
    } catch (error) { toast.error(getErrorMessage(error)); }
  };

  const activeRecipients = useMemo(() => recipients.filter((recipient) => recipient.enabled).length, [recipients]);

  return (
    <div className="min-h-full bg-[#f3f7fb] px-4 py-6 sm:px-7 lg:px-10">
      <div className="mx-auto max-w-6xl">
        <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-sky-100 bg-white px-3 py-1 text-xs font-semibold text-sky-800 shadow-sm"><Activity size={14} /> RF AUTOMATIC REPORTING</div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-950">RF reports</h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-600">Upload a drive-test ZIP, follow report generation, and manage where finished PDFs are emailed.</p>
          </div>
          <div className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600"><ShieldCheck size={15} className="text-emerald-600" /> Uses your signed-in account and region</div>
        </div>

        <div className="mb-6 flex gap-2 border-b border-slate-200">
          <button type="button" onClick={() => setActiveTab(TABS[0])} className={`border-b-2 px-3 pb-3 text-sm font-semibold ${activeTab === TABS[0] ? "border-sky-600 text-sky-800" : "border-transparent text-slate-500 hover:text-slate-800"}`}><span className="inline-flex items-center gap-2"><FileArchive size={16} /> Upload report</span></button>
          {isAdmin && <button type="button" onClick={() => setActiveTab(TABS[1])} className={`border-b-2 px-3 pb-3 text-sm font-semibold ${activeTab === TABS[1] ? "border-sky-600 text-sky-800" : "border-transparent text-slate-500 hover:text-slate-800"}`}><span className="inline-flex items-center gap-2"><Mail size={16} /> Email recipients</span></button>}
        </div>

        {activeTab === TABS[0] ? (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(300px,0.75fr)]">
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
              <div className="mb-5"><h2 className="text-lg font-semibold text-slate-900">Create an RF report</h2><p className="mt-1 text-sm text-slate-500">Select the ZIP and the session it belongs to. The report will use your current login region.</p></div>

              <label htmlFor="rf-zip" className="group flex min-h-40 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 px-5 text-center transition hover:border-sky-400 hover:bg-sky-50/60">
                <span className="mb-3 rounded-xl bg-white p-3 text-sky-700 shadow-sm"><ArrowUpFromLine size={20} /></span>
                <span className="text-sm font-semibold text-slate-800">{selectedFile ? selectedFile.name : "Choose a network log ZIP"}</span>
                <span className="mt-1 text-xs text-slate-500">{selectedFile ? `${formatBytes(selectedFile.size)} · Ready to upload` : "ZIP format · Maximum size 1 GiB"}</span>
                <input ref={fileInputRef} id="rf-zip" type="file" accept=".zip,application/zip" className="sr-only" onChange={(event) => chooseFile(event.target.files?.[0])} />
              </label>

              <div className="mt-5 grid gap-4 sm:grid-cols-3">
                <label className="text-sm font-medium text-slate-700">Session ID <span className="text-rose-500">*</span><input value={sessionId} onChange={(event) => setSessionId(event.target.value)} inputMode="numeric" placeholder="e.g. 4266" className="mt-1.5 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100" /></label>
                <label className="text-sm font-medium text-slate-700">Sub-session ID <span className="font-normal text-slate-400">Optional</span><input value={subSessionId} onChange={(event) => setSubSessionId(event.target.value)} maxLength={100} placeholder="Optional" className="mt-1.5 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100" /></label>
                <label className="text-sm font-medium text-slate-700">Project ID <span className="font-normal text-slate-400">Optional</span><input value={projectId} onChange={(event) => setProjectId(event.target.value)} inputMode="numeric" placeholder="Optional" className="mt-1.5 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100" /></label>
              </div>

              <div className="mt-6 flex flex-wrap items-center gap-3">
                <button type="button" disabled={busy || !selectedFile} onClick={registerAndUpload} className="inline-flex items-center justify-center gap-2 rounded-lg bg-sky-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-800 disabled:cursor-not-allowed disabled:opacity-50"><ArrowUpFromLine size={16} />{busy ? "Working…" : "Upload and generate report"}</button>
                {selectedFile && !busy && <button type="button" onClick={() => { setSelectedFile(null); if (fileInputRef.current) fileInputRef.current.value = ""; }} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100"><X size={15} /> Remove file</button>}
              </div>
              {busy && <div className="mt-5"><div className="mb-1.5 flex justify-between text-xs text-slate-500"><span>{progressLabel}</span><span>{progress}%</span></div><div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-sky-600 transition-all" style={{ width: `${progress}%` }} /></div></div>}

              <div className="mt-6 rounded-xl bg-sky-50 px-4 py-3 text-xs leading-5 text-sky-900"><strong>What happens next?</strong> The ZIP is sent directly to private storage. The backend checks it, creates the PDF and emails enabled recipients. Keep this page open to see status updates; your upload ID is saved in this browser so you can check it again later.</div>
            </section>

            <aside className="space-y-4">
              <InfoCard icon={FileArchive} label="Upload status" value={<StatusPill value={uploadStatus} />} detail={uploadEvent?.fileName || "No upload selected yet"} />
              <InfoCard icon={Activity} label="Report status" value={<StatusPill value={reportStatus} />} detail={uploadEvent?.error || (reportStatus === "completed" ? "Your PDF is ready to download." : "Status refreshes automatically while processing.")} />
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between"><h3 className="font-semibold text-slate-900">Latest upload</h3><button type="button" onClick={() => refreshUploadStatus()} disabled={!uploadId || refreshingStatus} title="Refresh status" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-40"><RefreshCw size={16} className={refreshingStatus ? "animate-spin" : ""} /></button></div>
                {uploadId ? <div className="mt-4 space-y-3 text-sm"><div><p className="text-xs text-slate-500">Upload ID</p><p className="mt-0.5 break-all font-mono text-xs text-slate-700">{uploadId}</p></div><div className="flex justify-between gap-3"><span className="text-slate-500">File size</span><span className="font-medium text-slate-800">{formatBytes(uploadEvent?.fileSizeBytes || savedRegistration?.fileSizeBytes)}</span></div><div className="flex justify-between gap-3"><span className="text-slate-500">Updated</span><span className="text-right font-medium text-slate-800">{formatDate(uploadEvent?.uploadedAtUtc || uploadEvent?.updatedAtUtc)}</span></div></div> : <p className="mt-3 text-sm text-slate-500">Your most recent RF upload will appear here.</p>}
                <div className="mt-5 flex flex-wrap gap-2">
                  {reportStatus === "completed" && <button type="button" onClick={downloadPdf} className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-800"><Download size={15} /> Download PDF</button>}
                  {reportStatus === "failed" && <button type="button" onClick={retryReport} className="inline-flex items-center gap-2 rounded-lg bg-rose-700 px-3 py-2 text-sm font-semibold text-white hover:bg-rose-800"><RotateCcw size={15} /> Retry report</button>}
                </div>
              </div>
            </aside>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2"><InfoCard icon={Users} label="Enabled recipients" value={activeRecipients} detail={`${recipients.length} total subscriptions`} /><InfoCard icon={Mail} label="Recent deliveries" value={deliveries.length} detail="Latest 100 for your company and region" /></div>
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
              <div className="mb-5"><h2 className="text-lg font-semibold text-slate-900">Report email recipients</h2><p className="mt-1 text-sm text-slate-500">Recipients get new reports generated for this company and region. Adding one does not send older reports.</p></div>
              <form onSubmit={addRecipient} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                <label className="text-sm font-medium text-slate-700">Email address<input required type="email" value={recipientEmail} onChange={(event) => setRecipientEmail(event.target.value)} placeholder="rf-team@example.com" className="mt-1.5 block w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100" /></label>
                <label className="text-sm font-medium text-slate-700">Name <span className="font-normal text-slate-400">Optional</span><input value={recipientName} onChange={(event) => setRecipientName(event.target.value)} maxLength={100} placeholder="RF reporting team" className="mt-1.5 block w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100" /></label>
                <button disabled={recipientSaving} type="submit" className="inline-flex h-[42px] items-center justify-center gap-2 rounded-lg bg-sky-700 px-4 text-sm font-semibold text-white hover:bg-sky-800 disabled:opacity-50"><Plus size={16} /> Add recipient</button>
              </form>
                <div className="mt-6 overflow-x-auto rounded-xl border border-slate-200"><table className="w-full min-w-[550px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3 font-semibold">Recipient</th><th className="px-4 py-3 font-semibold">State</th><th className="px-4 py-3 font-semibold">Added</th><th className="px-4 py-3 text-right font-semibold">Action</th></tr></thead><tbody className="divide-y divide-slate-100">{recipientLoading && <tr><td colSpan="4" className="px-4 py-8 text-center text-slate-500">Loading recipient list…</td></tr>}{!recipientLoading && recipients.length === 0 && <tr><td colSpan="4" className="px-4 py-8 text-center text-slate-500">No report recipients registered yet.</td></tr>}{!recipientLoading && recipients.map((recipient) => <tr key={recipient.id}><td className="px-4 py-3"><p className="font-medium text-slate-900">{recipient.name || recipient.email}</p>{recipient.name && <p className="text-xs text-slate-500">{recipient.email}</p>}</td><td className="px-4 py-3"><StatusPill value={recipient.enabled ? "enabled" : "disabled"} /></td><td className="px-4 py-3 text-slate-600">{formatDate(recipient.createdAtUtc)}</td><td className="px-4 py-3 text-right">{recipient.enabled ? <button type="button" onClick={() => disableRecipient(recipient)} className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50"><Trash2 size={14} /> Disable</button> : <button type="button" onClick={async () => { setRecipientEmail(recipient.email); setRecipientName(recipient.name || ""); toast.info("Review the form and add this address to reactivate it."); window.scrollTo({ top: 0, behavior: "smooth" }); }} className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold text-sky-700 hover:bg-sky-50"><Check size={14} /> Reactivate</button>}</td></tr>)}</tbody></table></div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
              <div className="mb-5 flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-lg font-semibold text-slate-900">Email delivery activity</h2><p className="mt-1 text-sm text-slate-500">Sent means the SMTP server accepted the message; it does not confirm inbox delivery.</p></div><div className="flex gap-2"><input value={deliveryFilter} onChange={(event) => setDeliveryFilter(event.target.value)} placeholder="Filter by upload ID" className="w-52 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky-500" /><button type="button" onClick={loadRecipientsAndDeliveries} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"><RefreshCw size={15} /></button></div></div>
              <div className="overflow-x-auto rounded-xl border border-slate-200"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3 font-semibold">Recipient</th><th className="px-4 py-3 font-semibold">Upload ID</th><th className="px-4 py-3 font-semibold">Status</th><th className="px-4 py-3 font-semibold">Attempts</th><th className="px-4 py-3 font-semibold">Sent / issue</th><th className="px-4 py-3 text-right font-semibold">Action</th></tr></thead><tbody className="divide-y divide-slate-100">{recipientLoading && <tr><td colSpan="6" className="px-4 py-8 text-center text-slate-500">Loading deliveries…</td></tr>}{!recipientLoading && deliveries.length === 0 && <tr><td colSpan="6" className="px-4 py-8 text-center text-slate-500">No email deliveries yet.</td></tr>}{!recipientLoading && deliveries.map((delivery) => <tr key={delivery.id}><td className="px-4 py-3"><p className="font-medium text-slate-900">{delivery.name || delivery.email}</p>{delivery.name && <p className="text-xs text-slate-500">{delivery.email}</p>}</td><td className="max-w-40 truncate px-4 py-3 font-mono text-xs text-slate-600" title={delivery.uploadId}>{delivery.uploadId}</td><td className="px-4 py-3"><StatusPill value={delivery.status} /></td><td className="px-4 py-3 text-slate-600">{delivery.attempts ?? 0}</td><td className="max-w-56 px-4 py-3 text-xs text-slate-600">{delivery.error || formatDate(delivery.sentAtUtc)}</td><td className="px-4 py-3 text-right">{delivery.status === "dead_letter" && <button type="button" onClick={() => retryDelivery(delivery)} className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold text-sky-700 hover:bg-sky-50"><RotateCcw size={14} /> Retry</button>}</td></tr>)}</tbody></table></div>
            </section>
            <p className="flex items-start gap-2 text-xs leading-5 text-slate-500"><Clock3 size={15} className="mt-0.5 shrink-0" /> Automatic email retries continue in the backend. A successful report remains available for download even if email delivery fails.</p>
          </div>
        )}
      </div>
    </div>
  );
}
