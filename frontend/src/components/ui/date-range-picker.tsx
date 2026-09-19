import { useState, useMemo } from "react"
import { Popover, PopoverTrigger, PopoverContent } from "./popover"
import { Button } from "./button"
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, X } from "lucide-react"

export interface DateRange {
  start?: string
  end?: string
}

interface DateRangePickerProps {
  value: DateRange
  onChange: (range: DateRange) => void
  className?: string
}

export function DateRangePicker({ value, onChange }: DateRangePickerProps) {
  const [open, setOpen] = useState(false)

  // Current browsing month
  const [viewDate, setViewDate] = useState(() => {
    if (value.start) {
      const d = new Date(value.start)
      if (!isNaN(d.getTime())) return d
    }
    return new Date()
  })

  // Selected range buffer in popover
  const [selectedStart, setSelectedStart] = useState<Date | null>(() => {
    if (value.start) {
      const d = new Date(value.start)
      if (!isNaN(d.getTime())) return d
    }
    return null
  })

  const [selectedEnd, setSelectedEnd] = useState<Date | null>(() => {
    if (value.end) {
      const d = new Date(value.end)
      if (!isNaN(d.getTime())) return d
    }
    return null
  })

  const [hoveredDate, setHoveredDate] = useState<Date | null>(null)

  // Days in view month
  const year = viewDate.getFullYear()
  const month = viewDate.getMonth()

  const calendarDays = useMemo(() => {
    const firstDay = new Date(year, month, 1)
    const startingDayOfWeek = firstDay.getDay() // 0 = Sun, 1 = Mon
    const daysInMonth = new Date(year, month + 1, 0).getDate()

    const days: Array<{ date: Date; currentMonth: boolean }> = []

    // Previous month padding
    const prevMonthDays = new Date(year, month, 0).getDate()
    for (let i = startingDayOfWeek - 1; i >= 0; i--) {
      days.push({
        date: new Date(year, month - 1, prevMonthDays - i),
        currentMonth: false,
      })
    }

    // Current month days
    for (let i = 1; i <= daysInMonth; i++) {
      days.push({
        date: new Date(year, month, i),
        currentMonth: true,
      })
    }

    // Next month padding to fill 35 or 42 grid cells
    const remaining = 35 - days.length > 0 ? 35 - days.length : 42 - days.length
    for (let i = 1; i <= remaining; i++) {
      days.push({
        date: new Date(year, month + 1, i),
        currentMonth: false,
      })
    }

    return days
  }, [year, month])

  const isSameDay = (a: Date | null, b: Date | null) => {
    if (!a || !b) return false
    return (
      a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate()
    )
  }

  const isDateBetween = (d: Date, start: Date | null, end: Date | null) => {
    if (!start || !end) return false
    const time = d.getTime()
    return time > start.getTime() && time < end.getTime()
  }

  const handleSelectDay = (day: Date) => {
    if (!selectedStart || (selectedStart && selectedEnd)) {
      // Start new range
      setSelectedStart(day)
      setSelectedEnd(null)
    } else {
      // Pick end
      if (day.getTime() < selectedStart.getTime()) {
        setSelectedEnd(selectedStart)
        setSelectedStart(day)
      } else {
        setSelectedEnd(day)
      }
    }
  }

  const handleApply = () => {
    if (selectedStart) {
      const startIso = new Date(
        selectedStart.getFullYear(),
        selectedStart.getMonth(),
        selectedStart.getDate(),
        0,
        0,
        0
      ).toISOString()

      let endIso = ""
      if (selectedEnd) {
        endIso = new Date(
          selectedEnd.getFullYear(),
          selectedEnd.getMonth(),
          selectedEnd.getDate(),
          23,
          59,
          59
        ).toISOString()
      } else {
        endIso = new Date(
          selectedStart.getFullYear(),
          selectedStart.getMonth(),
          selectedStart.getDate(),
          23,
          59,
          59
        ).toISOString()
      }

      onChange({ start: startIso, end: endIso })
    }
    setOpen(false)
  }

  const handleClear = () => {
    setSelectedStart(null)
    setSelectedEnd(null)
    onChange({ start: "", end: "" })
    setOpen(false)
  }

  // Label shown on the trigger button
  const triggerLabel = useMemo(() => {
    if (value.start && value.end) {
      const s = new Date(value.start)
      const e = new Date(value.end)
      if (!isNaN(s.getTime()) && !isNaN(e.getTime())) {
        return `${s.toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" })} - ${e.toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" })}`
      }
    }
    if (value.start) {
      const s = new Date(value.start)
      if (!isNaN(s.getTime())) {
        return s.toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" })
      }
    }
    return "选择自定义区间"
  }, [value.start, value.end])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={(props) => (
          <Button
            variant="outline"
            size="sm"
            {...props}
            className="h-8 gap-2 text-xs font-mono border-border/60 bg-background hover:bg-muted/40"
          >
            <CalendarIcon className="size-3.5 text-primary" />
            <span>{triggerLabel}</span>
            {value.start && (
              <span
                onClick={(e) => {
                  e.stopPropagation()
                  handleClear()
                }}
                className="hover:text-destructive p-0.5"
              >
                <X className="size-3" />
              </span>
            )}
          </Button>
        )}
      />

      <PopoverContent align="start" className="w-[300px] p-3 text-xs">
        {/* Month Navigation */}
        <div className="flex items-center justify-between pb-2 border-b border-border/40">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setViewDate(new Date(year, month - 1, 1))}
            className="h-7 w-7 p-0"
          >
            <ChevronLeft className="size-3.5" />
          </Button>
          <span className="font-semibold text-foreground font-mono">
            {year}年 {month + 1}月
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setViewDate(new Date(year, month + 1, 1))}
            className="h-7 w-7 p-0"
          >
            <ChevronRight className="size-3.5" />
          </Button>
        </div>

        {/* Day of Week Header */}
        <div className="grid grid-cols-7 text-center text-[10px] text-muted-foreground py-2 font-medium">
          <span>日</span>
          <span>一</span>
          <span>二</span>
          <span>三</span>
          <span>四</span>
          <span>五</span>
          <span>六</span>
        </div>

        {/* Calendar Grid */}
        <div className="grid grid-cols-7 gap-1 text-center font-mono">
          {calendarDays.map((item, idx) => {
            const isStart = isSameDay(item.date, selectedStart)
            const isEnd = isSameDay(item.date, selectedEnd)
            const isBetween = isDateBetween(
              item.date,
              selectedStart,
              selectedEnd || hoveredDate
            )
            const isToday = isSameDay(item.date, new Date())

            return (
              <button
                type="button"
                key={idx}
                onClick={() => handleSelectDay(item.date)}
                onMouseEnter={() => {
                  if (selectedStart && !selectedEnd) {
                    setHoveredDate(item.date)
                  }
                }}
                className={`h-7 w-full rounded-md text-xs transition-colors flex items-center justify-center relative ${
                  isStart || isEnd
                    ? "bg-primary text-primary-foreground font-bold shadow-xs"
                    : isBetween
                    ? "bg-primary/15 text-foreground rounded-none"
                    : item.currentMonth
                    ? "hover:bg-muted text-foreground"
                    : "text-muted-foreground/40 hover:bg-muted/30"
                } ${isToday && !isStart && !isEnd ? "border border-primary/50" : ""}`}
              >
                {item.date.getDate()}
              </button>
            )
          })}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-between pt-3 mt-2 border-t border-border/40">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClear}
            className="h-7 text-xs px-2 text-muted-foreground"
          >
            清空
          </Button>
          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setOpen(false)}
              className="h-7 text-xs px-2"
            >
              取消
            </Button>
            <Button
              size="sm"
              onClick={handleApply}
              disabled={!selectedStart}
              className="h-7 text-xs px-3"
            >
              应用区间
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
