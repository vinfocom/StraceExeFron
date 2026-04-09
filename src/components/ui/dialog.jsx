import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { XIcon } from "lucide-react";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";

// Basic styles as optional (can be removed if raw HTML is preferred)
const basicOverlayStyle = {
  position: "fixed",
  inset: 0,
  backgroundColor: "rgba(0, 0, 0, 0.5)",
  zIndex: 50,
};

const basicContentStyle = {
  position: "fixed",
  top: "50%",
  left: "50%",
  transform: "translate(-50%, -50%)",
  background: "white",
  padding: "1.5rem",
  borderRadius: "0.5rem",
  maxWidth: "90%",
  maxHeight: "90vh",
  overflowY: "auto",
  width: "50%",
  zIndex: 51,
};

function Dialog(props) {
  return <DialogPrimitive.Root {...props} />;
}

function DialogTrigger(props) {
  return <DialogPrimitive.Trigger {...props} />;
}

function DialogPortal(props) {
  return <DialogPrimitive.Portal {...props} />;
}

function DialogOverlay(props) {
  return <DialogPrimitive.Overlay style={basicOverlayStyle} {...props} />;
}

function DialogContent({ children,title,  showCloseButton = true, ...props }) {
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content 
        style={basicContentStyle} 
        aria-describedby={props['aria-describedby'] === undefined ? undefined : props['aria-describedby']}
        {...props}
      >
         <VisuallyHidden>
          <DialogTitle>{title}</DialogTitle>
        </VisuallyHidden>
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close
            style={{
              position: "absolute",
              top: "0.5rem",
              right: "0.5rem",
              background: "white",
              border: "none",
              cursor: "pointer",
              text: "black"
            }}
          >
            <XIcon size={16} />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPortal>
  );
}

function DialogClose(props) {
  return <DialogPrimitive.Close {...props} />;
}

function DialogHeader(props) {
  return <div style={{ marginBottom: "1rem" }} {...props} />;
}

function DialogFooter(props) {
  return <div style={{ marginTop: "1rem", textAlign: "right" }} {...props} />;
}

function DialogTitle(props) {
  return (
    <DialogPrimitive.Title
      style={{ fontSize: "1.25rem", fontWeight: "bold", marginBottom: "0.5rem" }}
      {...props}
    />
  );
}

function DialogDescription(props) {
  const { srOnly, ...restProps } = props;
  
  return (
    <DialogPrimitive.Description
      style={{ 
        fontSize: "0.875rem", 
        color: "#666",
        ...(srOnly && {
          position: "absolute",
          width: "1px",
          height: "1px",
          padding: 0,
          margin: "-1px",
          overflow: "hidden",
          clip: "rect(0, 0, 0, 0)",
          whiteSpace: "nowrap",
          borderWidth: 0,
        })
      }}
      {...restProps}
    />
  );
}

export {
  Dialog,
  DialogTrigger,
  DialogPortal,
  DialogOverlay,
  DialogContent,
  DialogClose,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
};