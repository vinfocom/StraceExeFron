import { useId } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";

export default function SiteUploadValidationDialog({ message, onClose }) {
  const descriptionId = useId();
  return (
    <Dialog open={Boolean(message)} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent
        title="Site data needs correction"
        aria-describedby={descriptionId}
        className="sm:max-w-md text-gray-900"
      >
        <h2 className="mb-3 text-lg font-semibold">Site data needs correction</h2>
        <p id={descriptionId} className="mb-5 whitespace-pre-line text-sm leading-6">{message}</p>
        <Button type="button" onClick={onClose}>OK</Button>
      </DialogContent>
    </Dialog>
  );
}
