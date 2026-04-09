// components/project/UploadSiteModal.jsx
import React, { useState, useRef } from "react";
import { toast } from "react-toastify";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Upload, Download, CheckCircle } from "lucide-react";
import Spinner from "../common/Spinner";
import { cellSiteApi } from "../../api/apiEndpoints"; // Python backend

export const UploadSiteModal = ({ open, onOpenChange, onUploadSuccess }) => {
  const [file, setFile] = useState(null);
  const [method, setMethod] = useState("noml");
  const [minSamples, setMinSamples] = useState(30);
  const [binSize, setBinSize] = useState(5);
  const [softSpacing, setSoftSpacing] = useState(false);
  const [useTA, setUseTA] = useState(false);
  const [makeMap, setMakeMap] = useState(true);
  const [modelPath, setModelPath] = useState("");
  const [trainPath, setTrainPath] = useState("");
  const [uploading, setUploading] = useState(false);
  const [results, setResults] = useState(null);
  const [outputDir, setOutputDir] = useState(null);
  
  const fileInputRef = useRef(null);

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      const ext = selectedFile.name.split('.').pop().toLowerCase();
      if (['csv', 'xlsx', 'xls'].includes(ext)) {
        setFile(selectedFile);
        setResults(null);
      } else {
        toast.error('Invalid file type. Only CSV, XLSX, XLS allowed');
        e.target.value = null;
      }
    }
  };

  const handleUpload = async () => {
    if (!file) {
      toast.warn("Please select a file to upload");
      return;
    }

    setUploading(true);
    setResults(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('method', method);
      formData.append('min_samples', minSamples.toString());
      formData.append('bin_size', binSize.toString());
      formData.append('soft_spacing', softSpacing.toString());
      formData.append('use_ta', useTA.toString());
      formData.append('make_map', makeMap.toString());

      if (method === 'ml') {
        if (modelPath) formData.append('model_path', modelPath);
        if (trainPath) formData.append('train_path', trainPath);
      }

      

      // Use Python backend cellSiteApi
      const response = await cellSiteApi.uploadSite(formData);


      if (response.success) {
        toast.success(response.message || 'File processed successfully!');
        setResults(response.results);
        setOutputDir(response.output_dir);
        
        if (onUploadSuccess) {
          onUploadSuccess(response);
        }
      } else {
        toast.error(response.error || 'Processing failed');
      }

    } catch (error) {
      console.error('❌ Upload error:', error);
      toast.error(`Upload failed: ${error.message}`);
    } finally {
      setUploading(false);
    }
  };

  const handleDownload = (filename) => {
    if (outputDir && filename) {
      cellSiteApi.downloadFile(outputDir, filename);
      toast.success(`Downloading ${filename}...`);
    }
  };

  const handleReset = () => {
    setFile(null);
    setResults(null);
    setOutputDir(null);
    setMethod("noml");
    setMinSamples(30);
    setBinSize(5);
    setSoftSpacing(false);
    setUseTA(false);
    setMakeMap(true);
    setModelPath("");
    setTrainPath("");
    if (fileInputRef.current) {
      fileInputRef.current.value = null;
    }
  };

  const handleClose = () => {
    handleReset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Upload Site Data (Python ML Service)</DialogTitle>
          <DialogDescription>
            Upload CSV/XLSX file for cell site localization using Python backend (Port 5000)
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* File Upload */}
          <div className="space-y-2">
            <Label htmlFor="file-upload">Select File</Label>
            <div className="flex items-center gap-2">
              <Input
                id="file-upload"
                ref={fileInputRef}
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={handleFileChange}
                disabled={uploading}
              />
              {file && <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />}
            </div>
            {file && (
              <p className="text-sm text-gray-600">
                Selected: {file.name} ({(file.size / 1024).toFixed(2)} KB)
              </p>
            )}
          </div>

          {/* Processing Method */}
          <div className="space-y-2">
            <Label>Processing Method</Label>
            <Select value={method} onValueChange={setMethod} disabled={uploading}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent  position="popper" sideOffset={4}>
                <SelectItem value="noml">NO-ML (Rule-based)</SelectItem>
                <SelectItem value="ml">ML (Machine Learning)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Parameters */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="min-samples">Min Samples</Label>
              <Input
                id="min-samples"
                type="number"
                min="1"
                value={minSamples}
                onChange={(e) => setMinSamples(parseInt(e.target.value))}
                disabled={uploading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bin-size">Bin Size (meters)</Label>
              <Input
                id="bin-size"
                type="number"
                min="1"
                value={binSize}
                onChange={(e) => setBinSize(parseInt(e.target.value))}
                disabled={uploading}
              />
            </div>
          </div>

          {/* Checkboxes */}
          <div className="space-y-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={softSpacing}
                onChange={(e) => setSoftSpacing(e.target.checked)}
                disabled={uploading}
                className="w-4 h-4"
              />
              <span className="text-sm">Soft Spacing (Merge nearby sites)</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={useTA}
                onChange={(e) => setUseTA(e.target.checked)}
                disabled={uploading}
                className="w-4 h-4"
              />
              <span className="text-sm">Use Timing Advance (TA)</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={makeMap}
                onChange={(e) => setMakeMap(e.target.checked)}
                disabled={uploading}
                className="w-4 h-4"
              />
              <span className="text-sm">Generate Map</span>
            </label>
          </div>

          {/* ML Options */}
          {method === 'ml' && (
            <div className="space-y-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
              <p className="text-sm font-medium text-blue-900">Machine Learning Options</p>
              <div className="space-y-2">
                <Label htmlFor="model-path">Model Path (optional)</Label>
                <Input
                  id="model-path"
                  placeholder="/path/to/model.pkl"
                  value={modelPath}
                  onChange={(e) => setModelPath(e.target.value)}
                  disabled={uploading}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="train-path">Training Data Path (optional)</Label>
                <Input
                  id="train-path"
                  placeholder="/path/to/training_data.csv"
                  value={trainPath}
                  onChange={(e) => setTrainPath(e.target.value)}
                  disabled={uploading}
                />
              </div>
            </div>
          )}

          {/* Results */}
          {results && (
            <div className="p-4 bg-green-50 border border-green-200 rounded-lg space-y-3">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-green-600" />
                <p className="font-medium text-green-900">Processing Complete!</p>
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium text-green-800">Available Downloads:</p>
                {Object.entries(results).map(([key, filename]) => (
                  <Button
                    key={key}
                    variant="outline"
                    size="sm"
                    className="w-full justify-start"
                    onClick={() => handleDownload(filename)}
                  >
                    <Download className="h-4 w-4 mr-2" />
                    {filename}
                  </Button>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={handleReset} disabled={uploading}>
            Reset
          </Button>
          <Button variant="outline" onClick={handleClose} disabled={uploading}>
            Close
          </Button>
          <Button onClick={handleUpload} disabled={!file || uploading}>
            {uploading ? (
              <>
                <Spinner className="mr-2 h-4 w-4" />
                Processing...
              </>
            ) : (
              <>
                <Upload className="mr-2 h-4 w-4" />
                Upload & Process
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};