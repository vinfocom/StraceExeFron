import React, { useEffect, useMemo, useState } from "react";
import { toast } from "react-toastify";
import {
  ShieldAlert,
  Smartphone,
  Trash2,
  Eye,
  CheckCircle2,
  Clock3,
  LockKeyhole,
  AlertTriangle,
} from "lucide-react";
import { dataDeletionApi } from "@/api/apiEndpoints";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";

const SESSION_STORAGE_KEY = "stracer:data-deletion-session";
const SESSION_TTL_MS = 10 * 60 * 1000;

const maskValue = (value) => {
  if (value == null || value === "") return "N/A";
  return String(value);
};

const formatRemainingTime = (ms) => {
  if (!Number.isFinite(ms) || ms <= 0) return "Expired";
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
};

const readStoredSession = () => {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const token = String(parsed?.token || "").trim();
    const expiresAt = Number(parsed?.expiresAt || 0);
    if (!token || !expiresAt || Date.now() >= expiresAt) {
      window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
      return null;
    }
    return { token, expiresAt };
  } catch {
    return null;
  }
};

const writeStoredSession = (token) => {
  if (typeof window === "undefined") return null;
  const payload = {
    token,
    expiresAt: Date.now() + SESSION_TTL_MS,
  };
  window.sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(payload));
  return payload;
};

const clearStoredSession = () => {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
};

const SummaryRow = ({ label, value }) => (
  <div className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200/80 bg-white/80 px-4 py-3">
    <span className="text-sm text-slate-600">{label}</span>
    <span className="text-sm font-semibold text-slate-900">{maskValue(value)}</span>
  </div>
);

const StepBadge = ({ number, title, subtitle, active }) => (
  <div
    className={`rounded-2xl border px-4 py-4 transition-all ${
      active
        ? "border-sky-300 bg-sky-50 shadow-sm"
        : "border-slate-200 bg-white/75"
    }`}
  >
    <div className="flex items-center gap-3">
      <div
        className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold ${
          active ? "bg-sky-600 text-white" : "bg-slate-200 text-slate-700"
        }`}
      >
        {number}
      </div>
      <div>
        <div className="font-semibold text-slate-900">{title}</div>
        <div className="text-xs text-slate-500">{subtitle}</div>
      </div>
    </div>
  </div>
);

const DataDeletionPage = () => {
  const restoredSession = readStoredSession();
  const [phoneNumber, setPhoneNumber] = useState("");
  const [otp, setOtp] = useState("");
  const [deletionToken, setDeletionToken] = useState(restoredSession?.token || "");
  const [sessionExpiresAt, setSessionExpiresAt] = useState(restoredSession?.expiresAt || 0);
  const [preview, setPreview] = useState(null);
  const [acknowledgedRisk, setAcknowledgedRisk] = useState(false);
  const [sendingOtp, setSendingOtp] = useState(false);
  const [verifyingOtp, setVerifyingOtp] = useState(false);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [requestingDeletion, setRequestingDeletion] = useState(false);
  const [sessionTick, setSessionTick] = useState(Date.now());

  const hasVerifiedSession = Boolean(deletionToken) && sessionExpiresAt > Date.now();
  const remainingSessionMs = hasVerifiedSession ? sessionExpiresAt - sessionTick : 0;

  useEffect(() => {
    if (!hasVerifiedSession) {
      if (deletionToken && sessionExpiresAt && sessionExpiresAt <= Date.now()) {
        clearStoredSession();
        setDeletionToken("");
        setSessionExpiresAt(0);
        setPreview(null);
        toast.info("Deletion session expired. Please verify OTP again.");
      }
      return undefined;
    }

    const timerId = window.setInterval(() => {
      setSessionTick(Date.now());
    }, 1000);

    return () => window.clearInterval(timerId);
  }, [hasVerifiedSession, deletionToken, sessionExpiresAt]);

  const dataSummaryRows = useMemo(() => {
    const summary = preview?.data_summary;
    if (!summary) return [];
    return [
      ["Sessions", summary.sessions],
      ["Network Logs", summary.network_logs],
      ["Network Log Neighbours", summary.network_log_neighbours],
      ["Projects", summary.projects],
      ["Map Regions", summary.map_regions],
      ["Prediction Data", summary.prediction_data],
      ["Site Predictions", summary.site_predictions],
      ["Optimized Site Predictions", summary.optimized_site_predictions],
      ["Upload History", summary.upload_history],
      ["Thresholds", summary.thresholds],
      ["Issued Licenses", summary.issued_licenses],
    ];
  }, [preview]);

  const canSendOtp = phoneNumber.trim() && !sendingOtp;
  const canVerifyOtp = phoneNumber.trim() && otp.trim() && !verifyingOtp;
  const canPreview = hasVerifiedSession && !loadingPreview;
  const canRequestDeletion =
    hasVerifiedSession && acknowledgedRisk && !requestingDeletion;

  const handleSendOtp = async () => {
    if (!canSendOtp) return;
    setSendingOtp(true);
    try {
      const response = await dataDeletionApi.sendOtp({
        phoneNumber,
      });
      toast.success(response?.message || "OTP sent successfully");
    } catch (error) {
      toast.error(error?.message || "Failed to send OTP");
    } finally {
      setSendingOtp(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (!canVerifyOtp) return;
    setVerifyingOtp(true);
    try {
      const response = await dataDeletionApi.verifyOtp({
        phoneNumber,
        otp,
      });
      const token = String(response?.deletion_token || "").trim();
      if (!token) {
        throw new Error("Deletion session token was not returned.");
      }
      const session = writeStoredSession(token);
      setDeletionToken(token);
      setSessionExpiresAt(session?.expiresAt || 0);
      setPreview(null);
      setAcknowledgedRisk(false);
      toast.success(response?.message || "OTP verified");
    } catch (error) {
      toast.error(error?.message || "Failed to verify OTP");
    } finally {
      setVerifyingOtp(false);
    }
  };

  const handlePreview = async () => {
    if (!canPreview) return;
    setLoadingPreview(true);
    try {
      const response = await dataDeletionApi.getPreview({ deletionToken });
      setPreview(response?.preview || null);
      toast.success(response?.message || "Preview loaded");
    } catch (error) {
      toast.error(error?.message || "Failed to fetch preview");
    } finally {
      setLoadingPreview(false);
    }
  };

  const handleRequestDeletion = async () => {
    if (!canRequestDeletion) return;

    const firstConfirmation = window.confirm(
      "Do you want to continue with permanent data deletion request?",
    );
    if (!firstConfirmation) return;

    const secondConfirmation = window.confirm(
      "Please confirm again. This action is permanent and cannot be undone.",
    );
    if (!secondConfirmation) return;

    setRequestingDeletion(true);
    try {
      const response = await dataDeletionApi.requestDeletion({
        deletionToken,
        confirmPermanentDeletion: true,
      });
      toast.success(response?.message || "Deletion requested successfully");
      clearStoredSession();
      setDeletionToken("");
      setSessionExpiresAt(0);
      setPreview(null);
      setOtp("");
      setAcknowledgedRisk(false);
    } catch (error) {
      toast.error(error?.message || "Failed to request deletion");
    } finally {
      setRequestingDeletion(false);
    }
  };

  const handleResetSession = () => {
    clearStoredSession();
    setDeletionToken("");
    setSessionExpiresAt(0);
    setPreview(null);
    setOtp("");
    setAcknowledgedRisk(false);
    toast.info("Deletion session cleared.");
  };

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,_#eef8ff_0%,_#f8fbff_38%,_#fff7f2_100%)] px-4 py-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 overflow-hidden rounded-[2rem] border border-white/70 bg-white/80 shadow-[0_35px_120px_rgba(15,23,42,0.10)] backdrop-blur">
          <div className="grid gap-8 px-8 py-8 lg:grid-cols-[1.15fr_0.85fr]">
            <div>
              <div className="mb-5 inline-flex items-center gap-2 rounded-full bg-rose-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-rose-700">
                <ShieldAlert className="h-4 w-4" />
                Data deletion
              </div>
              <h1 className="max-w-2xl text-4xl font-black tracking-tight text-slate-950">
                Data deletion Request Form
              </h1>
             
            </div>

            
          </div>
        </div>

        <div className="mb-6 grid gap-4 lg:grid-cols-3">
          <StepBadge
            number="1"
            title="Enter Mobile"
            subtitle="Request OTP on the registered number"
            active={!otp && !hasVerifiedSession}
          />
          <StepBadge
            number="2"
            title="Verify OTP"
            subtitle="Create a short-lived deletion session"
            active={Boolean(otp) && !hasVerifiedSession}
          />
          <StepBadge
            number="3"
            title="Preview And Delete"
            subtitle="Review summary and confirm again"
            active={hasVerifiedSession}
          />
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.08fr_0.92fr]">
          <div className="space-y-6">
            <Card className="overflow-hidden border-slate-200/80 bg-white/90 shadow-sm">
              <CardHeader className="border-b border-slate-100 bg-slate-50/70">
                <CardTitle className="flex items-center gap-2 text-slate-900">
                  <Smartphone className="h-5 w-5 text-sky-600" />
                  Step 1: Mobile Number
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-5 p-6">
                <div className="space-y-2">
                  <Label htmlFor="phone-number">Phone Number</Label>
                  <Input
                    id="phone-number"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    placeholder="Enter your registered mobile number"
                    className="h-12"
                  />
                </div>
                <Button onClick={handleSendOtp} disabled={!canSendOtp} className="h-11 px-5">
                  <Smartphone className="mr-2 h-4 w-4" />
                  {sendingOtp ? "Sending OTP..." : "Send OTP"}
                </Button>
              </CardContent>
            </Card>

            <Card className="overflow-hidden border-slate-200/80 bg-white/90 shadow-sm">
              <CardHeader className="border-b border-slate-100 bg-slate-50/70">
                <CardTitle className="flex items-center gap-2 text-slate-900">
                  <LockKeyhole className="h-5 w-5 text-emerald-600" />
                  Step 2: OTP Verification
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-5 p-6">
                <div className="space-y-2">
                  <Label htmlFor="otp">OTP</Label>
                  <Input
                    id="otp"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value)}
                    placeholder="Enter the OTP received on phone"
                    className="h-12"
                  />
                </div>
                <Button onClick={handleVerifyOtp} disabled={!canVerifyOtp} className="h-11 px-5">
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  {verifyingOtp ? "Verifying..." : "Verify OTP And Start Session"}
                </Button>

                {hasVerifiedSession && (
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm text-emerald-800">
                    OTP verified successfully. A temporary deletion session is now active for{" "}
                    <span className="font-bold">{formatRemainingTime(remainingSessionMs)}</span>.
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="overflow-hidden border-slate-200/80 bg-white/90 shadow-sm">
              <CardHeader className="border-b border-slate-100 bg-slate-50/70">
                <CardTitle className="flex items-center gap-2 text-slate-900">
                  <Trash2 className="h-5 w-5 text-rose-600" />
                  Step 3: Final Action
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-5 p-6">
                <div className="flex flex-col gap-3 sm:flex-row">
                  <Button onClick={handlePreview} disabled={!canPreview} variant="outline" className="h-11">
                    <Eye className="mr-2 h-4 w-4" />
                    {loadingPreview ? "Loading Preview..." : "Preview Data"}
                  </Button>
                  <Button
                    onClick={handleRequestDeletion}
                    disabled={!canRequestDeletion}
                    className="h-11 bg-rose-600 hover:bg-rose-700"
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    {requestingDeletion ? "Requesting..." : "Request Permanent Deletion"}
                  </Button>
                </div>

                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="mt-0.5 h-5 w-5 text-amber-600" />
                    <div className="space-y-3">
                      <p className="text-sm leading-6 text-amber-900">
                        This action permanently deletes the user data after backend processing. The
                        system will ask for confirmation again before sending the request.
                      </p>
                      <div className="flex items-start gap-3">
                        <Checkbox
                          id="ack-risk"
                          checked={acknowledgedRisk}
                          onCheckedChange={(checked) => setAcknowledgedRisk(Boolean(checked))}
                        />
                        <Label htmlFor="ack-risk" className="cursor-pointer text-sm leading-6 text-amber-900">
                          I understand this deletion request is permanent and cannot be undone.
                        </Label>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div>
            <Card className="sticky top-6 overflow-hidden border-slate-200/80 bg-white/92 shadow-sm">
              <CardHeader className="border-b border-slate-100 bg-slate-50/70">
                <CardTitle>Deletion Preview</CardTitle>
              </CardHeader>
              <CardContent className="space-y-5 p-6">
                {preview ? (
                  <>
                    <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50/85 p-5">
                      <h3 className="mb-4 text-xs font-bold uppercase tracking-[0.24em] text-slate-500">
                        User Snapshot
                      </h3>
                      <div className="space-y-3">
                        <SummaryRow label="User ID" value={preview?.user?.id} />
                        <SummaryRow label="Name" value={preview?.user?.name} />
                        <SummaryRow label="Mobile" value={preview?.user?.mobile} />
                        <SummaryRow label="Email" value={preview?.user?.email} />
                        <SummaryRow
                          label="Deletion Requested At"
                          value={preview?.user?.deletion_requested_at}
                        />
                      </div>
                    </div>

                    <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50/85 p-5">
                      <h3 className="mb-4 text-xs font-bold uppercase tracking-[0.24em] text-slate-500">
                        Data Summary
                      </h3>
                      <div className="space-y-3">
                        {dataSummaryRows.map(([label, value]) => (
                          <SummaryRow key={label} label={label} value={value} />
                        ))}
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="rounded-[1.5rem] border border-dashed border-slate-300 bg-slate-50 px-6 py-14 text-center text-sm leading-7 text-slate-500">
                    Verify OTP first, then open the preview. The temporary session keeps this step
                    available only for a short time.
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DataDeletionPage;
