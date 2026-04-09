// components/common/Button.jsx
import React from "react";

export default function Button({
  children,
  onClick,
  type = "button",
  className = "",
  variant = "primary",
}) {
  const baseStyles =
    "px-4 py-2 text-white rounded-md transition focus:outline-none";
  const variants = {
    primary: "bg-blue-600 hover:bg-blue-700",
    secondary: "bg-gray-600 hover:bg-gray-700",
    danger: "bg-red-600 hover:bg-red-700",
    warning: "bg-yellow-500 hover:bg-yellow-600",
  };

  return (
    <button
      type={type}
      onClick={onClick}
      className={`${baseStyles} ${variants[variant]} ${className}`}
    >
      {children}
    </button>
  );
}
