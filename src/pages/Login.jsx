import React, { useState, useEffect, useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import Spinner from "../components/common/Spinner";
import appLogo from "/favicon.svg";
import comlog from "/logo.svg";
import axios from "axios";
import { Eye, EyeOff } from "lucide-react";

const LoginPage = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [ipAddress, setIpAddress] = useState("");
  const [loading, setLoading] = useState(false);
  const { login, isLoggedIn } = useAuth();
  const navigate = useNavigate();
  const isElectronRuntime =
    typeof navigator !== "undefined" && /electron/i.test(navigator.userAgent || "");

  const navigateAfterLogin = useCallback(() => {
    const redirectAfterLogin = sessionStorage.getItem("redirectAfterLogin");
    if (redirectAfterLogin) {
      sessionStorage.removeItem("redirectAfterLogin");
      navigate(redirectAfterLogin, { replace: true });
      return;
    }
    navigate("/dashboard", { replace: true });
  }, [navigate]);

  useEffect(() => {
    const fetchIp = async () => {
      try {
        const response = await axios.get("https://api.ipify.org?format=json");
        if (response.data && response.data.ip) {
          setIpAddress(response.data.ip);
        }
      } catch (error) {}
    };

    fetchIp();
  }, []);

  useEffect(() => {
    if (isLoggedIn) {
      navigateAfterLogin();
    }
  }, [isLoggedIn, navigateAfterLogin]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    if (!email || !password) {
      toast.error("Please enter both email and password.");
      setLoading(false);
      return;
    }

    try {
      const response = await login({
        Email: email,
        Password: password,
        IP: ipAddress,
        ForceLogin: isElectronRuntime,
      });

      if (response.success) {
        toast.success("Login successful!");
        navigateAfterLogin();
      } else {
        const alreadyLoggedIn =
          typeof response?.message === "string" &&
          response.message.toLowerCase().includes("already logged in");

        if (alreadyLoggedIn) {
          const shouldForceLogin = isElectronRuntime
            ? true
            : window.confirm(
                "This account is reported active on another device. Do you want to continue and force login here?"
              );

          if (isElectronRuntime) {
            toast.info("Recovering previous session and retrying login...");
          }

          if (shouldForceLogin) {
            const forceResponse = await login({
              Email: email,
              Password: password,
              IP: ipAddress,
              ForceLogin: true,
            });

            if (forceResponse.success) {
              toast.success("Login successful!");
              navigateAfterLogin();
              return;
            }

            toast.error(forceResponse?.message || "Force login failed. Please try again.");
            return;
          }
        }

        toast.error(response.message || "Login failed. Please check your credentials.");
      }
    } catch (error) {
      let displayMessage = "An unexpected error occurred.";

      if (error.response) {
        const data = error.response.data;
        displayMessage =
          data?.message || data?.Message || data?.error || error.message;
      } else if (error.request) {
        displayMessage = "Server did not respond. Please check your network.";
      } else {
        displayMessage =
          error.message || (typeof error === "string" ? error : displayMessage);
      }

      const alreadyLoggedIn =
        typeof displayMessage === "string" &&
        displayMessage.toLowerCase().includes("already logged in");

      if (alreadyLoggedIn) {
        const shouldForceLogin = isElectronRuntime
          ? true
          : window.confirm(
              "This account is reported active on another device. Do you want to continue and force login here?"
            );

        if (isElectronRuntime) {
          toast.info("Recovering previous session and retrying login...");
        }

        if (shouldForceLogin) {
          try {
            const forceResponse = await login({
              Email: email,
              Password: password,
              IP: ipAddress,
              ForceLogin: true,
            });

            if (forceResponse?.success) {
              toast.success("Login successful!");
              navigateAfterLogin();
              return;
            }

            toast.error(forceResponse?.message || "Force login failed. Please try again.");
            return;
          } catch (forceError) {
            const forceMessage =
              forceError?.response?.data?.message ||
              forceError?.response?.data?.Message ||
              forceError?.message ||
              "Force login failed. Please try again.";
            toast.error(forceMessage);
            return;
          }
        }
      }

      toast.error(displayMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-slate-100 via-white to-blue-100 px-4"
    >
      <div className="absolute left-4 top-4 sm:left-8 sm:top-6">
        <img src={comlog} alt="Vinfocom" className="h-24 w-auto sm:h-22" />
        
      </div>
      <div className="relative w-full max-w-md space-y-6 rounded-2xl border border-slate-200 bg-white/85 p-8 shadow-xl backdrop-blur-md">
        {loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-white/70">
            <Spinner />
          </div>
        )}

        <div className="text-center">
          <div className="flex justify-center mb-4">
            <div className="flex justify-center mb-4">
              <img
                src={appLogo}
                alt="S-Tracer"
                className="h-20 w-20 rounded-xl border-2 border-slate-300 object-contain shadow-lg"
              />
            </div>
          </div>
          <h2 className="text-2xl font-bold text-gray-900">
            Welcome S-Tracer
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            Sign in to continue to your account
          </p>
        </div>

        <form className="space-y-5" onSubmit={handleSubmit}>
          <div>
            <label
              htmlFor="email-address"
              className="mb-1 block text-sm font-medium text-gray-700"
            >
              Username
            </label>
            <input
              id="email-address"
              name="email"
              type="email"
              autoComplete="email"
              required
              className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 placeholder-gray-400 transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 sm:text-sm"
              placeholder="Enter your email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="relative">
            <label
              htmlFor="password"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Password
            </label>

            <input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              required
              className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 pr-10 text-gray-900 placeholder-gray-400 transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 sm:text-sm"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />

            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute inset-y-10 right-0 flex items-center pr-3 text-gray-500 hover:text-gray-700"
            >
              {showPassword ? <Eye size={18} /> : <EyeOff size={18} />}
            </button>
          </div>

          <div>
            <button
              type="submit"
              className="w-full rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-md transition-all duration-200 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:bg-indigo-400"
              disabled={loading}
            >
              Sign In
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default LoginPage;
