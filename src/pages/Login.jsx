import React, { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import Spinner from "../components/common/Spinner";
import vinfocom from "/favicon.png";
import axios from "axios";
import { Eye, EyeOff } from "lucide-react";

const LoginPage = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [ipAddress, setIpAddress] = useState("");
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

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
      });

      if (response.success) {
        toast.success("Login successful!");
        navigate("/dashboard");
      } else {
        toast.error(
          response.message || "Login failed. Please check your credentials.",
        );
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

      toast.error(displayMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br  from-grey-900 via-white to-blue-900  px-4">
      <div className="relative w-full max-w-md p-8 bg-white/80  backdrop-blur-md rounded-2xl shadow-lg space-y-6">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/70  rounded-2xl z-10">
            <Spinner />
          </div>
        )}

        <div className="text-center">
          <div className="flex justify-center mb-4">
            <div className="flex justify-center mb-4">
              <img
                src={vinfocom}
                alt="vinfocom"
                className="w-20 h-20 object-contain border-2 border-slate-400 shadow-2xl rounded-xl p-2"
              />
            </div>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 ">
            Welcome S-Tracer
          </h2>
          <p className="mt-1 text-sm text-gray-500 ">
            Sign in to continue to your account
          </p>
        </div>

        <form className="space-y-5" onSubmit={handleSubmit}>
          <div>
            <label
              htmlFor="email-address"
              className="block text-sm font-medium text-gray-700  mb-1"
            >
              Username
            </label>
            <input
              id="email-address"
              name="email"
              type="email"
              autoComplete="email"
              required
              className="block w-full px-3 py-2 rounded-lg border border-gray-300  bg-white  text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm transition"
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
              className="block w-full px-3 py-2 pr-10 rounded-lg border border-gray-300 bg-white text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm transition"
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
              className="w-full px-4 py-2 text-sm font-medium text-white rounded-lg bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:bg-indigo-400 shadow-md transition-all duration-200"
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
