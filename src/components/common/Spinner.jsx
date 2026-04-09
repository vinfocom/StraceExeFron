import React from 'react';

/**
 * A simple loading spinner component.
 * It's centered on the page for use as a full-page loader.
 */
const Spinner = () => {
  return (
    <div className="flex justify-center items-center h-screen">
      <div
        className="w-12 h-12 border-4 border-blue-500 border-solid rounded-full animate-spin"
        style={{ borderTopColor: 'transparent' }}
      ></div>
    </div>
  );
};

export default Spinner;