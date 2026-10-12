import React, { useState } from "react";
import { companyApi } from "../api/apiEndpoints";
import { useLocation, useNavigate } from "react-router-dom";
import { ChevronLeft, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";

const CompanyForm = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const editCompany = location.state?.company || null;
  const isEditMode = Boolean(editCompany?.id);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    company_name: editCompany?.company_name || "",
    contact_person: editCompany?.contact_person || "",
    mobile: editCompany?.mobile || "",
    email: editCompany?.email || "",
    password: "",
    address: editCompany?.address || "",
    pincode: editCompany?.pincode || "",
    gst_id: editCompany?.gst_id || "",
    license_validity_in_months:
      editCompany?.license_validity_in_months?.toString?.() || "",
    total_granted_licenses:
      editCompany?.total_granted_licenses?.toString?.() || "",
    license_status: editCompany?.admin_license_status == null
      ? "1"
      : String(editCompany.admin_license_status),
    otp_phone_number: editCompany?.otp_phone_number || "",
    ask_for_otp: editCompany ? editCompany?.ask_for_otp === 1 : false,
    blacklisted_phone_number: editCompany?.blacklisted_phone_number || "",
    remarks: editCompany?.remarks || "",
    isd_code: editCompany?.isd_code || "",
    country_code: editCompany?.country_code || "",
    status: editCompany ? editCompany?.status === 1 : true,
  });
  const [country, setCountry] = useState(editCompany?.country_code || "IN");

  const toggleCountry = () => {
    const newCountry = country === "IN" ? "TW" : "IN";

    setCountry(newCountry);

    setFormData((prev) => ({
      ...prev,
      country_code: newCountry,
    }));
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData({
      ...formData,
      [name]: type === "checkbox" ? checked : value,
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const validityMonths = Number(formData.license_validity_in_months);
    const grantedLicenses = Number(formData.total_granted_licenses);
    if (!Number.isInteger(validityMonths) || validityMonths < 1 ||
        !Number.isInteger(grantedLicenses) || grantedLicenses < 1 ||
        ![0, 1, 2].includes(Number(formData.license_status))) {
      alert("Enter a positive license validity and count, and select a license status.");
      return;
    }
    setLoading(true);

    const payload = {
      ...(isEditMode ? { id: editCompany.id } : {}),
      // Strings
      company_name: formData.company_name,
      contact_person: formData.contact_person,
      mobile: formData.mobile,
      email: formData.email,
      password: formData.password || "",
      address: formData.address || "",
      pincode: formData.pincode || "",
      gst_id: formData.gst_id || "",
      company_code: "",
      country_code: formData.country_code || "",
      isd_code: formData.isd_code || "",

      // Phone Numbers (Strings in DTO)
      otp_phone_number: formData.otp_phone_number || "",
      blacklisted_phone_number: formData.blacklisted_phone_number || "",
      remarks: formData.remarks || "",

      // Integers (Must be numbers)
      license_validity_in_months: validityMonths,
      total_granted_licenses: grantedLicenses,
      license_status: Number(formData.license_status),
      total_used_licenses: isEditMode
        ? editCompany?.total_used_licenses || 0
        : 0,

      // Booleans (DTO defines these as bool, not int)
      ask_for_otp: formData.ask_for_otp ? 1 : 0,
      status: formData.status ? 1 : 0,
    };

    try {
      const data = await companyApi.createCompany(payload);

      // Success Check
      if (data && data.Status === 1) {
        if (isEditMode) {
          alert("Success! Company Updated.");
          navigate("/companies");
        } else {
          alert(`Success! Company Created.\nCode: ${data.CompanyCode}`);
          setFormData({
            company_name: "",
            contact_person: "",
            mobile: "",
            email: "",
            password: "",
            address: "",
            pincode: "",
            gst_id: "",
            license_validity_in_months: "",
            total_granted_licenses: "",
            license_status: "1",
            otp_phone_number: "",
            ask_for_otp: 0,
            blacklisted_phone_number: "",
            remarks: "",
            status: 1,
            country_code: "",
            isd_code: "",
          });
        }
      } else {
        alert(
          data?.Message ||
            `Failed to ${isEditMode ? "update" : "create"} company (Unknown Status).`,
        );
      }
    } catch (error) {
      if (error.response && error.response.data) {
        // Case A: Validation Errors (Standard ASP.NET 400)
        if (error.response.data.errors) {
          const errors = error.response.data.errors;
          let errorMsg = "Validation Failed:\n";
          Object.keys(errors).forEach((field) => {
            errorMsg += `• ${field}: ${errors[field].join(", ")}\n`;
          });
          alert(errorMsg);
        }
        // Case B: Custom Error Message (e.g. "Email already exists")
        else if (error.response.data.Message) {
          alert(`Error: ${error.response.data.Message}`);
        }
        // Case C: Fallback
        else {
          alert("Bad Request: Please check the console for details.");
        }
      } else {
        alert("Network Error: " + error.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const labelClass = "mb-2 block text-[clamp(0.875rem,calc(0.82rem+0.2vw),1rem)] font-semibold leading-tight text-slate-700";
  const inputClass = "block min-h-11 w-full min-w-0 rounded-[0.625rem] border border-slate-300 bg-white px-3.5 py-2.5 text-[clamp(0.875rem,calc(0.82rem+0.2vw),1rem)] leading-snug text-slate-800 outline-none placeholder:text-slate-400 transition-[border-color,box-shadow] focus:border-blue-600 focus:ring-[3px] focus:ring-blue-600/15";
  const checkboxContainerClass = "flex min-h-13 min-w-0 cursor-pointer items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-[clamp(0.875rem,calc(0.82rem+0.2vw),1rem)] font-medium text-slate-700 hover:bg-slate-100";
  const sectionClass = "mt-2 border-b border-slate-200 pb-2.5 text-[clamp(1.125rem,calc(1rem+0.45vw),1.5rem)] font-semibold leading-snug text-slate-800";

  return (
    <main className="min-h-dvh min-w-0 bg-slate-100 p-[clamp(0.875rem,2.5vw,2rem)] text-[clamp(0.875rem,calc(0.8rem+0.25vw),1rem)] text-slate-800">
      <div className="mx-auto w-full max-w-[74rem] min-w-0 overflow-hidden rounded-[clamp(0.875rem,1.5vw,1.25rem)] border border-slate-200 bg-white shadow-[0_12px_32px_rgba(15,23,42,0.05)]">
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-4 border-b border-slate-200 p-[clamp(1rem,2.5vw,2rem)] max-[36rem]:items-stretch">
          <div className="flex min-w-0 items-start gap-[clamp(0.75rem,1.4vw,1rem)] max-[36rem]:w-full">
            <Button
              variant="outline"
              size="icon"
              onClick={() => navigate("/companies")}
              className="h-11 w-11 shrink-0 border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
              aria-label="Back to companies"
            >
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <div className="min-w-0">
              <h1 className="m-0 wrap-anywhere text-[clamp(1.45rem,calc(1.15rem+1.1vw),2.125rem)] leading-tight font-bold text-gray-900">
                {isEditMode ? "Edit Company" : "Company Registration"}
              </h1>
              <p className="mt-1.5 text-[clamp(0.875rem,calc(0.82rem+0.2vw),1rem)] leading-normal text-slate-500">
                {isEditMode ? "Update company details." : "Enter company details."}
              </p>
            </div>
          </div>
          {isEditMode && (
            <Button
              type="button"
              variant="outline"
              className="min-h-11 max-w-full whitespace-normal text-center text-[clamp(0.875rem,calc(0.82rem+0.2vw),1rem)] max-[36rem]:w-full"
              onClick={() =>
                navigate(`/company-licenses?companyId=${editCompany.id}`)
              }
            >
              Manage Licenses & Features
            </Button>
          )}
        </div>

        <form onSubmit={handleSubmit} className="p-[clamp(1rem,2.5vw,2rem)]">
          <div className="grid grid-cols-1 gap-x-[clamp(1rem,2.5vw,2rem)] gap-y-[clamp(1rem,1.7vw,1.5rem)] lg:grid-cols-2 [&>*]:min-w-0">
            <div className="col-span-full">
              <h2 className={`${sectionClass} mt-0`}>
                Basic Information
              </h2>
            </div>

            {/* Required Fields */}
            <div>
              <label className={labelClass} htmlFor="company_name">
                Company Name <span className="text-red-500">*</span>
              </label>
              <input
                id="company_name"
                name="company_name"
                placeholder="e.g. Acme Industries"
                value={formData.company_name}
                onChange={handleChange}
                required
                className={inputClass}
              />
            </div>

            <div>
              <label className={labelClass} htmlFor="contact_person">
                Contact Person <span className="text-red-500">*</span>
              </label>
              <input
                id="contact_person"
                name="contact_person"
                placeholder="Full Name"
                value={formData.contact_person}
                onChange={handleChange}
                required
                className={inputClass}
              />
            </div>

            <div>
              <label className={labelClass} htmlFor="mobile">
                Mobile Number <span className="text-red-500">*</span>
              </label>
              <input
                id="mobile"
                name="mobile"
                type="tel"
                placeholder="10-digit Mobile"
                value={formData.mobile}
                onChange={handleChange}
                required
                className={inputClass}
              />
            </div>

            <div>
              <label className={labelClass} htmlFor="email">
                Email Address <span className="text-red-500">*</span>
              </label>
              <input
                id="email"
                name="email"
                type="email"
                placeholder="admin@company.com"
                value={formData.email}
                onChange={handleChange}
                required
                className={inputClass}
              />
            </div>

            <div>
              <label className={labelClass} htmlFor="password">
                Password <span className="text-red-500">*</span>
              </label>

              <div className="relative">
                <input
                  id="password"
                  name="password"
                  type={open ? "text" : "password"}
                  placeholder="••••••••"
                  value={formData.password}
                  onChange={handleChange}
                  required={!isEditMode}
                  className={`${inputClass} pr-13`}
                />

                <button
                  type="button"
                  onClick={() => setOpen(!open)}
                  className="absolute top-1/2 right-1.5 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-lg text-slate-500 hover:text-slate-800"
                  aria-label={open ? "Hide password" : "Show password"}
                >
                  {open ? (
                    <Eye className="h-4 w-4" />
                  ) : (
                    <EyeOff className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            {/* Optional Fields */}
            <div>
              <label className={labelClass} htmlFor="gst_id">GST ID</label>
              <input
                id="gst_id"
                name="gst_id"
                placeholder="GSTIN Number"
                value={formData.gst_id}
                onChange={handleChange}
                className={inputClass}
              />
            </div>

            <div className="col-span-full">
              <label className={labelClass} htmlFor="address">Address</label>
              <textarea
                id="address"
                name="address"
                placeholder="Street Address, City, State"
                rows="2"
                value={formData.address}
                onChange={handleChange}
                className={inputClass}
              />
            </div>

            <div>
              <label className={labelClass} htmlFor="pincode">Pincode</label>
              <input
                id="pincode"
                name="pincode"
                inputMode="numeric"
                placeholder="e.g. 110001"
                value={formData.pincode}
                onChange={handleChange}
                className={inputClass}
              />
            </div>

            <div>
              <label className={labelClass} htmlFor="isd_code">Isd Code</label>
              <input
                id="isd_code"
                type="text"
                name="isd_code"
                placeholder="e.g. +91"
                value={formData.isd_code}
                onChange={handleChange}
                className={inputClass}
              />
            </div>

            <div>
              <span className={labelClass}>Country</span>
              <button
                type="button"
                onClick={toggleCountry}
                className="relative flex h-11 w-30 items-center justify-around rounded-full border border-slate-300 bg-slate-200 p-[0.2rem]"
                aria-label={`Country: ${country}. Switch country`}
              >
                <span className="text-[clamp(0.8rem,calc(0.77rem+0.12vw),0.9rem)] font-semibold text-slate-600">IN</span>
                <span className="text-[clamp(0.8rem,calc(0.77rem+0.12vw),0.9rem)] font-semibold text-slate-600">TW</span>
                <span className={`absolute top-[0.2rem] left-[0.2rem] grid h-[calc(100%-0.4rem)] w-[calc(50%-0.2rem)] place-items-center rounded-full bg-white text-[clamp(0.8rem,calc(0.77rem+0.12vw),0.9rem)] font-bold text-blue-700 shadow-sm transition-transform duration-200 ${country === "TW" ? "translate-x-full" : ""}`}>
                  {country}
                </span>
              </button>
            </div>

            {/* License Details */}
            <div className="col-span-full">
              <h2 className={sectionClass}>
                License Details
              </h2>
            </div>

            <div>
              <label className={labelClass} htmlFor="license_validity_in_months">Validity (Months) <span className="text-red-500">*</span></label>
              <input
                id="license_validity_in_months"
                type="number"
                min="1"
                step="1"
                name="license_validity_in_months"
                placeholder="e.g. 12"
                value={formData.license_validity_in_months}
                onChange={handleChange}
                required
                className={inputClass}
              />
            </div>

            <div>
              <label className={labelClass} htmlFor="total_granted_licenses">Total Granted Licenses <span className="text-red-500">*</span></label>
              <input
                id="total_granted_licenses"
                type="number"
                min="1"
                step="1"
                name="total_granted_licenses"
                placeholder="e.g. 50"
                value={formData.total_granted_licenses}
                onChange={handleChange}
                required
                className={inputClass}
              />
            </div>

            <div>
              <label className={labelClass} htmlFor="license_status">Default Admin License Status <span className="text-red-500">*</span></label>
              <select
                id="license_status"
                name="license_status"
                value={formData.license_status}
                onChange={handleChange}
                required
                className={inputClass}
              >
                <option value="1">Active</option>
                <option value="0">Inactive</option>
                <option value="2">Revoked</option>
              </select>
            </div>

            {/* Security & Settings */}
            <div className="col-span-full">
              <h2 className={sectionClass}>
                Security & Settings
              </h2>
            </div>

            <div>
              <label className={labelClass} htmlFor="otp_phone_number">OTP Phone Number</label>
              <input
                id="otp_phone_number"
                name="otp_phone_number"
                type="tel"
                placeholder="Phone for OTP"
                value={formData.otp_phone_number}
                onChange={handleChange}
                className={inputClass}
              />
            </div>

            <div>
              <label className={labelClass} htmlFor="blacklisted_phone_number">Blacklisted Phone</label>
              <input
                id="blacklisted_phone_number"
                name="blacklisted_phone_number"
                type="tel"
                placeholder="Blocked Number"
                value={formData.blacklisted_phone_number}
                onChange={handleChange}
                className={inputClass}
              />
            </div>

            <div className="col-span-full">
              <label className={labelClass} htmlFor="remarks">Remarks</label>
              <textarea
                id="remarks"
                name="remarks"
                placeholder="Any additional notes..."
                rows="2"
                value={formData.remarks}
                onChange={handleChange}
                className={inputClass}
              />
            </div>

            {/* Checkboxes */}
            <div className="col-span-full grid grid-cols-1 gap-3.5 sm:grid-cols-2">
              <label className={checkboxContainerClass}>
                <input
                  type="checkbox"
                  name="ask_for_otp"
                  checked={formData.ask_for_otp}
                  onChange={handleChange}
                  className="h-5 w-5 shrink-0 accent-blue-600"
                />
                <span>
                  Ask for OTP on Login
                </span>
              </label>

              <label className={checkboxContainerClass}>
                <input
                  type="checkbox"
                  name="status"
                  checked={formData.status}
                  onChange={handleChange}
                  className="h-5 w-5 shrink-0 accent-blue-600"
                />
                <span>
                  Active Account Status
                </span>
              </label>
            </div>
          </div>

          <div className="mt-[clamp(1.5rem,2.5vw,2.25rem)]">
            <button
              type="submit"
              disabled={loading}
              className={`min-h-12 w-full rounded-[0.625rem] px-4 py-3 text-[clamp(0.9375rem,calc(0.88rem+0.25vw),1.125rem)] font-bold text-white shadow-[0_4px_12px_rgba(37,99,235,0.13)] transition-[background-color,box-shadow]
                ${loading ? "bg-gray-400 cursor-not-allowed" : "bg-blue-600 hover:bg-blue-700 hover:shadow-lg"}`}
            >
              {loading
                ? isEditMode
                  ? "Updating..."
                  : "Registering..."
                : isEditMode
                  ? "Update Company"
                  : "Register Company"}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
};

export default CompanyForm;
