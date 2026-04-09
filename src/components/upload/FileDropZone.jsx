import React from 'react';
import { useDropzone } from 'react-dropzone';
import { UploadCloud } from 'lucide-react';

export const FileDropzone = ({
  onDrop,
  accept,
  multiple = false,
  label,
  children,
}) => {
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept,
    multiple,
  });

  return (
    <div
      {...getRootProps()}
      className={`p-8 border-2 border-dashed rounded-lg cursor-pointer text-center transition-colors
        ${isDragActive ? "border-indigo-600 bg-indigo-50 dark:bg-indigo-900" : "border-gray-300 dark:border-gray-600"}`}
    >
      <input {...getInputProps()} />
      <UploadCloud className="mx-auto h-10 w-10 text-gray-400" />
      <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
        {label || (isDragActive ? "Drop the file here..." : "Drag 'n' drop a file here, or click to select")}
      </p>
      {children}
    </div>
  );
};