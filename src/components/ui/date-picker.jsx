"use client"

import * as React from "react"
import { format } from "date-fns"
import { Calendar as CalendarIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

export function DatePicker({ date, setDate, className }) {
  const [open, setOpen] = React.useState(false)

  const handleSelect = (selectedDate) => {
    setDate(selectedDate)
    setOpen(false) // Close the popover after selection
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant={"outline"}
          className={cn(
            "w-full justify-start text-left font-normal",
            !date && "text-muted-foreground",
            className
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {date ? format(date, "PPP") : <span>Pick a date</span>}
        </Button>
      </PopoverTrigger>
      
      <PopoverContent className="w-auto p-0 text-white bg-slate-900 rounded-md shadow-lg">
        <Calendar 
          mode="single"
          selected={date}
          onSelect={handleSelect}
          initialFocus
          className="rounded-md border-0"
        />
      </PopoverContent>
    </Popover>
  )
}