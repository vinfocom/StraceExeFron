import React from "react";

export const LoadingSpinner = ({ message = "Loading analytics..." }) => (
  <div className="text-center py-8 text-slate-400">
    <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-2"></div>
    <p className="text-sm">{message}</p>
  </div>
);