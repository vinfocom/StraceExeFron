import React, { useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
} from "@/components/ui/command";
import { ChevronsUpDown } from "lucide-react";

const SessionSelector = ({
  sessions = [],                // list of sessions to show
  selectedSessions,
  setSelectedSessions,
}) => {
  const [open, setOpen] = useState(false);

  const handleSelect = (sessionId) => {
    setSelectedSessions((prev) =>
      prev.includes(sessionId)
        ? prev.filter((id) => id !== sessionId)
        : [...prev, sessionId]
    );
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between"
        >
          {selectedSessions.length > 0
            ? `${selectedSessions.length} session(s) selected`
            : "Select sessions..."}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>

      <PopoverContent className="w-[900px] p-2 bg-gray-800 text-white border border-gray-700 rounded-md shadow-lg">
        {sessions.length === 0 ? (
          <div className="text-center text-gray-300 py-4">
            No sessions. Select dates & click “Fetch Sessions.”
          </div>
        ) : (
          <Command>
            <CommandInput
              className="bg-gray-700 text-white placeholder-gray-400"
              placeholder="Search sessions..."
            />
            <CommandEmpty>No sessions found.</CommandEmpty>
            <CommandGroup>
              {sessions.map((session) => (
                <CommandItem
                  key={session.id}
                  onSelect={() => handleSelect(session.id)}
                >
                  <Checkbox
                    checked={selectedSessions.includes(session.id)}
                    className="mr-2"
                  />
                  {session.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </Command>
        )}
      </PopoverContent>
    </Popover>
  );
};

export default SessionSelector;