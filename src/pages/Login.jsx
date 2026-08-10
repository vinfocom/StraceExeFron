import React, { useState, useEffect, useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import Spinner from "../components/common/Spinner";
import appLogo from "/favicon.svg";
import comlog from "/logo.svg";
import { Eye, EyeOff } from "lucide-react";
import {
  clearStoredRedirectTarget,
  getStoredRedirectTarget,
} from "../utils/authSession";

const APP_VERSION = "2.2.0";
const TRANSITION_INTENT_KEY = "authTransitionIntent";
const GENERIC_LOGIN_ERROR = "Something went wrong. Please try again.";

const formatActiveLoginDetails = (activeLogin) => {
  if (!activeLogin || typeof activeLogin !== "object") {
    return "This account is reported active on another device.";
  }

  const email = String(activeLogin.email || "").trim();
  const device = String(activeLogin.device || "").trim();
  const ipAddress = String(activeLogin.ip_address || activeLogin.ipAddress || "").trim();
  const userAgent = String(activeLogin.user_agent || activeLogin.userAgent || "").trim();
  const loginTimeRaw = String(activeLogin.login_time_utc || activeLogin.loginTimeUtc || "").trim();

  let loginTime = loginTimeRaw;
  if (loginTimeRaw) {
    const parsed = new Date(loginTimeRaw);
    if (!Number.isNaN(parsed.getTime())) {
      loginTime = parsed.toLocaleString();
    }
  }

  const details = [
    email ? `User: ${email}` : "",
    device ? `Device: ${device}` : "",
    ipAddress ? `IP: ${ipAddress}` : "",
    loginTime ? `Login time: ${loginTime}` : "",
    !device && userAgent ? `Agent: ${userAgent}` : "",
  ].filter(Boolean);

  if (!details.length) {
    return "This account is reported active on another device.";
  }

  return `This account is already active on another device.\n\n${details.join("\n")}`;
};

const LoginPage = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const { login, isLoggedIn } = useAuth();
  const navigate = useNavigate();

  const navigateAfterLogin = useCallback(() => {
    const redirectAfterLogin = getStoredRedirectTarget();
    if (redirectAfterLogin) {
      clearStoredRedirectTarget();
      navigate(redirectAfterLogin, { replace: true });
      return;
    }
    navigate("/dashboard", { replace: true });
  }, [navigate]);

  useEffect(() => {
    sessionStorage.removeItem(TRANSITION_INTENT_KEY);
  }, []);

  useEffect(() => {
    if (isLoggedIn) {
      navigateAfterLogin();
    }
  }, [isLoggedIn, navigateAfterLogin]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    sessionStorage.setItem(TRANSITION_INTENT_KEY, "dashboard");

    if (!email || !password) {
      toast.error("Please enter both email and password.");
      sessionStorage.removeItem(TRANSITION_INTENT_KEY);
      setLoading(false);
      return;
    }

    try {
      const response = await login({
        Email: email,
        Password: password,
        IP: "",
        ForceLogin: false,
      });

      if (response.success) {
        toast.success("Login successful!");
        navigateAfterLogin();
      } else {
        const alreadyLoggedIn =
          typeof response?.message === "string" &&
          response.message.toLowerCase().includes("already logged in");

        if (alreadyLoggedIn) {
          const confirmMessage = `${formatActiveLoginDetails(response?.active_login)}\n\nDo you want to continue and force login here?`;
          const shouldForceLogin = window.confirm(
            confirmMessage
          );

          if (shouldForceLogin) {
            const forceResponse = await login({
              Email: email,
              Password: password,
              IP: "",
              ForceLogin: true,
            });

            if (forceResponse.success) {
              toast.success("Login successful!");
              navigateAfterLogin();
              return;
            }

            toast.error(GENERIC_LOGIN_ERROR);
            sessionStorage.removeItem(TRANSITION_INTENT_KEY);
            return;
          }
        }

        sessionStorage.removeItem(TRANSITION_INTENT_KEY);
        toast.error(GENERIC_LOGIN_ERROR);
      }
    } catch (error) {
      let backendMessage = "";

      if (error.response) {
        const data = error.response.data;
        backendMessage =
          data?.message || data?.Message || data?.error || error.message || "";
      } else if (error.request) {
        backendMessage = "";
      } else {
        backendMessage =
          error.message || (typeof error === "string" ? error : "");
      }

      const alreadyLoggedIn =
        typeof backendMessage === "string" &&
        backendMessage.toLowerCase().includes("already logged in");

      if (alreadyLoggedIn) {
        const confirmMessage = `${formatActiveLoginDetails(error?.active_login)}\n\nDo you want to continue and force login here?`;
        const shouldForceLogin = window.confirm(
          confirmMessage
        );

        if (shouldForceLogin) {
          try {
            const forceResponse = await login({
              Email: email,
              Password: password,
              IP: "",
              ForceLogin: true,
            });

            if (forceResponse?.success) {
              toast.success("Login successful!");
              navigateAfterLogin();
              return;
            }

            toast.error(GENERIC_LOGIN_ERROR);
            sessionStorage.removeItem(TRANSITION_INTENT_KEY);
            return;
          } catch (forceError) {
            sessionStorage.removeItem(TRANSITION_INTENT_KEY);
            toast.error(GENERIC_LOGIN_ERROR);
            return;
          }
        }
      }

      sessionStorage.removeItem(TRANSITION_INTENT_KEY);
      toast.error(GENERIC_LOGIN_ERROR);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#edf5fb] px-4 py-4 sm:px-6 sm:py-5 lg:px-8">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.16),transparent_32%),radial-gradient(circle_at_bottom_right,rgba(24,77,140,0.14),transparent_36%)]" />

      <div className="absolute left-4 top-4 z-20 sm:left-8 sm:top-6">
        <img src={comlog} alt="Vinfocom" className="h-[142px] w-auto sm:h-[180px]" />
      </div>

      <div className="relative z-10 grid min-h-[calc(100vh-2rem)] w-full max-w-6xl overflow-hidden rounded-[30px] bg-white shadow-[0_32px_90px_rgba(15,23,42,0.14)] lg:max-h-[920px] lg:grid-cols-[1.02fr_0.98fr]">
        <section className="relative isolate hidden overflow-hidden bg-[#0b2240] px-10 py-12 text-white lg:flex lg:flex-col lg:justify-end">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_14%,rgba(34,197,246,0.18),transparent_22%),linear-gradient(160deg,#0b2240_0%,#0f2f57_52%,#0a1d35_100%)]" />
          <div className="absolute -left-28 -top-16 h-[320px] w-[320px] rounded-full border-[52px] border-[#1d5ca8] opacity-90" />
          <div className="absolute -bottom-20 left-28 h-28 w-28 rounded-full bg-[#1f8de4]" />
          <div className="absolute bottom-14 left-52 h-44 w-16 rotate-[-33deg] rounded-full bg-[#1490e3]" />
          <div className="absolute bottom-8 left-72 h-52 w-16 rotate-[-33deg] rounded-full bg-[#2d6fb7]" />
          <div className="absolute bottom-[-36px] left-64 h-36 w-16 rotate-[-33deg] rounded-full bg-[#123257] opacity-70" />
          <div className="absolute bottom-[-24px] left-[21.5rem] h-40 w-16 rotate-[-33deg] rounded-full bg-[#123257] opacity-70" />
          <img
            src={appLogo}
            alt=""
            aria-hidden="true"
            className="pointer-events-none absolute right-[-7rem] top-1/2 h-[28rem] w-[28rem] -translate-y-1/2 rotate-[-18deg] opacity-[0.08] saturate-0 brightness-200"
          />

          <div className="relative z-10 max-w-sm">
            <p className="mb-6 text-xs font-semibold uppercase tracking-[0.38em] text-sky-200/80">
              S-Tracer 
            </p>
            <h1 className="text-4xl font-bold leading-tight text-white xl:text-[3.15rem]">
              Welcome to
              <br />
              S-Tracer
            </h1>
            <p className="mt-5 max-w-xs text-sm leading-7 text-slate-300">
              Organize network insights,Analyse your Network, manage workflows, and access your dashboard from one clean workspace.
            </p>
            <div className="mt-8">
              <a
                href="https://vinfocom.co.in/tools/stracer"
                target="_blank"
                rel="noreferrer"
                className="inline-flex rounded-full bg-[#1490e3] px-5 py-2 text-sm font-semibold text-white shadow-[0_16px_36px_rgba(20,144,227,0.28)] transition hover:bg-[#117dca] focus:outline-none focus:ring-2 focus:ring-sky-300 focus:ring-offset-2 focus:ring-offset-[#0b2240]"
              >
                Learn More
              </a>
            </div>
          </div>
        </section>

        <section className="relative flex items-center justify-center px-6 py-10 sm:px-10 lg:px-14">
          <div className="relative w-full max-w-[380px]">
            {loading && (
              <div className="absolute inset-0 z-10 flex items-center justify-center rounded-[28px] bg-white/82 backdrop-blur-md">
                <div className="flex flex-col items-center gap-5 text-center">
                  <div className="flex items-end gap-2" aria-hidden="true">
                    <span className="h-6 w-2 animate-[bounce_0.9s_ease-in-out_infinite] rounded-full bg-sky-400 [animation-delay:-0.3s]" />
                    <span className="h-10 w-2 animate-[bounce_0.9s_ease-in-out_infinite] rounded-full bg-sky-500 [animation-delay:-0.15s]" />
                    <span className="h-14 w-2 animate-[bounce_0.9s_ease-in-out_infinite] rounded-full bg-sky-600" />
                    <span className="h-10 w-2 animate-[bounce_0.9s_ease-in-out_infinite] rounded-full bg-sky-500 [animation-delay:-0.15s]" />
                    <span className="h-6 w-2 animate-[bounce_0.9s_ease-in-out_infinite] rounded-full bg-sky-400 [animation-delay:-0.3s]" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-semibold uppercase tracking-[0.24em] text-sky-600">
                      Authenticating
                    </p>
                    <p className="text-sm text-slate-500">
                      Preparing your dashboard...
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div className="mb-6 flex justify-center">
              <div className="flex h-18 w-18 items-center justify-center rounded-2xl bg-[#eef6ff] ring-1 ring-[#d6e7fb]">
                <img
                  src={appLogo}
                  alt="S-Tracer"
                  className="h-18 w-18 rounded-lg object-contain"
                />
              </div>
            </div>

            <div className="text-center">
              <h2 className="text-[2rem] font-bold tracking-[-0.02em] text-slate-900">
                Sign In
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                Continue with your existing account credentials.
              </p>
            </div>

            <div className="my-8 flex items-center gap-4">
              <div className="h-px flex-1 bg-slate-200" />
              <span className="text-xs font-medium uppercase tracking-[0.25em] text-slate-400">
                secure login
              </span>
              <div className="h-px flex-1 bg-slate-200" />
            </div>

            <form className="space-y-5" onSubmit={handleSubmit}>
              <div>
                <label
                  htmlFor="email-address"
                  className="mb-2 block text-sm font-semibold text-slate-700"
                >
                  Username
                </label>
                <input
                  id="email-address"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  className="block h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-900 shadow-[0_6px_18px_rgba(15,23,42,0.04)] outline-none transition placeholder:text-slate-400 focus:border-sky-500 focus:ring-4 focus:ring-sky-100"
                  placeholder="Enter your email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>

              <div className="relative">
                <label
                  htmlFor="password"
                  className="mb-2 block text-sm font-semibold text-slate-700"
                >
                  Password
                </label>

                <input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  className="block h-12 w-full rounded-xl border border-slate-200 bg-white px-4 pr-12 text-sm text-slate-900 shadow-[0_6px_18px_rgba(15,23,42,0.04)] outline-none transition placeholder:text-slate-400 focus:border-sky-500 focus:ring-4 focus:ring-sky-100"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />

                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute bottom-3 right-4 flex items-center text-slate-400 transition hover:text-slate-600"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <Eye size={18} /> : <EyeOff size={18} />}
                </button>
              </div>

              <div className="flex items-center justify-between gap-4 pt-1 text-sm">
                <label className="flex items-center gap-2 text-slate-500">
                  <input
                    type="checkbox"
                    checked
                    readOnly
                    className="h-4 w-4 rounded border-slate-300 text-sky-500 focus:ring-sky-400"
                  />
                  Remember this device
                </label>
                <span className="font-medium text-sky-600">
                  Secure access
                </span>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#1d9bf0] px-4 text-sm font-semibold text-white shadow-[0_20px_38px_rgba(29,155,240,0.32)] transition hover:bg-[#1188d9] focus:outline-none focus:ring-2 focus:ring-sky-400 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-sky-300"
                  disabled={loading}
                >
                  {loading ? (
                    <>
                      <span
                        className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white"
                        aria-hidden="true"
                      />
                      <span className="tracking-[0.02em]">Signing In...</span>
                    </>
                  ) : (
                    "Sign In"
                  )}
                </button>
              </div>
            </form>

            <p className="mt-8 text-center text-sm text-slate-400">
              S-Tracer v{APP_VERSION}
            </p>
          </div>
        </section>
      </div>
    </div>
  );
};

export default LoginPage;
