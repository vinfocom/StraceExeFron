import React from "react";

export const EmptyState = ({ icon: Icon, message }) => (
  <div className="bg-slate-800 rounded-lg p-8 text-center border border-slate-700">
    {Icon && <Icon className="h-12 w-12 text-slate-600 mx-auto mb-3" />}
    <p className="text-slate-400 text-sm">{message}</p>
  </div>
);